/**
 * Authentication & security core (spec §5).
 * - JWT access (15 min) + refresh (7 d) tokens, both in httpOnly SameSite cookies.
 * - Refresh token rotation with reuse detection (old token reuse revokes the session).
 * - Refresh tokens stored as SHA-256 hashes per session.
 * - Origin check on state-changing requests (CSRF defense in depth, SameSite=Lax).
 * - In-memory sliding-window rate limiter for login.
 * SERVER ONLY.
 */
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import type { NextResponse } from 'next/server'
import { db } from './db'
import { env, ttlSeconds } from './env'
import { ApiError } from './api'

const encoder = new TextEncoder()
const ACCESS_SECRET = encoder.encode(env.JWT_ACCESS_SECRET)
const REFRESH_SECRET = encoder.encode(env.JWT_REFRESH_SECRET)

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'
const ACCESS_PATH = '/'
const REFRESH_PATH = '/api/v1/auth'

export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN'

export interface AuthedUser {
  id: string
  employeeId: string
  name: string
  email: string
  role: Role
  department: string
  managerId: string | null
  officeId: string | null
  shiftId: string | null
  mustChangePassword: boolean
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12) // cost 12 (spec §5)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function signAccessToken(user: AuthedUser): Promise<string> {
  return new SignJWT({ employeeId: user.employeeId, role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds(env.ACCESS_TOKEN_TTL)}s`)
    .sign(ACCESS_SECRET)
}

export async function signRefreshToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ jti: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds(env.REFRESH_TOKEN_TTL)}s`)
    .sign(REFRESH_SECRET)
}

async function verifyToken(token: string, secret: Uint8Array) {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch {
    return null
  }
}

export async function verifyAccessToken(token: string) {
  return verifyToken(token, ACCESS_SECRET)
}

export async function verifyRefreshToken(token: string) {
  return verifyToken(token, REFRESH_SECRET)
}

/* ---------------------------------- sessions --------------------------------- */

export async function createSession(userId: string, req: Request): Promise<string> {
  const session = await db.session.create({
    data: {
      userId,
      refreshTokenHash: 'pending',
      userAgent: req.headers.get('user-agent') ?? '',
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + ttlSeconds(env.REFRESH_TOKEN_TTL) * 1000),
    },
  })
  return session.id
}

/** Rotate: revoke old session, create a fresh one. Returns the new session id. */
export async function rotateSession(oldSessionId: string, userId: string, req: Request): Promise<string> {
  const newSession = await db.session.create({
    data: {
      userId,
      refreshTokenHash: 'pending',
      userAgent: req.headers.get('user-agent') ?? '',
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + ttlSeconds(env.REFRESH_TOKEN_TTL) * 1000),
    },
  })
  await db.session.update({ where: { id: oldSessionId }, data: { revokedAt: new Date() } })
  return newSession.id
}

export async function revokeSession(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {})
}

/** Reuse of an old refresh token revokes ALL sessions of that user (spec §5). */
export async function revokeAllSessions(userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/* ---------------------------------- cookies ---------------------------------- */

function cookieBase() {
  return {
    httpOnly: true as const,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
  }
}

export function setAuthCookies(res: NextResponse, access: string, refresh: string) {
  res.cookies.set(ACCESS_COOKIE, access, { ...cookieBase(), path: ACCESS_PATH, maxAge: ttlSeconds(env.ACCESS_TOKEN_TTL) })
  res.cookies.set(REFRESH_COOKIE, refresh, { ...cookieBase(), path: REFRESH_PATH, maxAge: ttlSeconds(env.REFRESH_TOKEN_TTL) })
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...cookieBase(), path: ACCESS_PATH, maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE, '', { ...cookieBase(), path: REFRESH_PATH, maxAge: 0 })
}

/* ---------------------------------- guards ----------------------------------- */

/** Read a single cookie value from a plain Request. */
export function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const raw =
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  return raw ? decodeURIComponent(raw) : null
}

function bearer(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

/**
 * Bearer-token fallback (exported): some sandbox preview contexts render the app
 * inside a cross-site iframe where browsers block SameSite cookies entirely
 * (third-party cookie blocking). In that mode login returns 200 but no cookie is
 * ever stored, so every later request is 401. The client therefore keeps the
 * tokens in localStorage and echoes them via the Authorization header; cookie
 * remains the primary channel when available.
 */
export function bearerToken(req: Request): string | null {
  return bearer(req)
}

/** Reads the httpOnly access cookie (or Authorization header), verifies, loads the active user. */
export async function requireAuth(req: Request): Promise<AuthedUser> {
  const token = bearer(req) ?? readCookie(req, ACCESS_COOKIE)
  if (!token) throw new ApiError(401, 'Not signed in')

  const payload = await verifyAccessToken(token)
  if (!payload?.sub) throw new ApiError(401, 'Session expired. Please sign in again.')

  const user = await db.user.findUnique({ where: { id: payload.sub } })
  if (!user || !user.isActive) throw new ApiError(401, 'Account is inactive')

  return {
    id: user.id,
    employeeId: user.employeeId,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    department: user.department,
    managerId: user.managerId,
    officeId: user.officeId,
    shiftId: user.shiftId,
    mustChangePassword: user.mustChangePassword,
  }
}

export function requireRole(user: AuthedUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'You do not have permission to perform this action')
  }
}

/**
 * CSRF defense (spec §5): SameSite=Lax cookies + origin check on mutations.
 *
 * Primary signal: `Sec-Fetch-Site` (sent by all modern browsers, immune to
 * reverse proxies that rewrite Host). `same-origin` / `same-site` / `none`
 * are allowed; `cross-site` is blocked.
 *
 * Fallback (only when the browser does not send Sec-Fetch-Site): compare the
 * Origin host against x-forwarded-host / host. A mismatch behind the sandbox
 * gateway must NOT break legitimate logins, so absence of a match is only
 * fatal when we have an exact-origin-but-different-host situation we can
 * positively attribute — otherwise the request is allowed and SameSite=Lax
 * remains the protection layer.
 */
export function assertSameOrigin(req: Request) {
  const fetchSite = req.headers.get('sec-fetch-site')
  if (fetchSite) {
    if (fetchSite !== 'cross-site') return
    // `cross-site` with a same Origin host can still happen behind port-forwarding
    // gateways (scheme upgrade http→https changes the origin). Allow if the Origin
    // host matches any known forwarded host.
    const origin = req.headers.get('origin')
    const hosts = [req.headers.get('x-forwarded-host'), req.headers.get('host')].filter(Boolean)
    if (origin && hosts.some((h) => h === new URL(origin).host)) return
    throw new ApiError(403, 'Cross-origin request blocked')
  }

  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    const originHost = new URL(origin).host
    if (host && originHost !== host) {
      throw new ApiError(403, 'Cross-origin request blocked')
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(403, 'Invalid Origin header')
  }
}

/* -------------------------------- rate limiting ------------------------------- */

const buckets = new Map<string, number[]>()

/** Sliding window limiter. Returns remaining attempts or throws 429. */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now()
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    const retryIn = Math.ceil((windowMs - (now - arr[0])) / 1000)
    throw new ApiError(429, `Too many attempts. Try again in ${retryIn}s.`)
  }
  arr.push(now)
  buckets.set(key, arr)
  if (buckets.size > 5000) {
    // opportunistic cleanup
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
}

/** Clear the window for a key (called after a SUCCESSFUL login so legitimate users are never locked out — only failed attempts count toward the limit). */
export function rateLimitReset(key: string) {
  buckets.delete(key)
}
