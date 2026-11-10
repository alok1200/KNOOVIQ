import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import {
  assertSameOrigin, clientIp, createSession, rateLimit, rateLimitReset,
  setAuthCookies, sha256, signAccessToken, signRefreshToken, verifyPassword,
} from '@/lib/auth'
import { env } from '@/lib/env'
import { audit } from '@/lib/notify'

export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const body = await req.json().catch(() => ({}))
  const { identifier, password } = z
    .object({ identifier: z.string().min(1, 'Employee ID or email is required'), password: z.string().min(1, 'Password is required') })
    .parse(body)

  // Rate limit: 5 attempts / 15 min per IP and per account (spec §5)
  rateLimit(`login:ip:${clientIp(req)}`, env.LOGIN_RATE_LIMIT, 15 * 60 * 1000)
  rateLimit(`login:acct:${identifier.toLowerCase()}`, env.LOGIN_RATE_LIMIT, 15 * 60 * 1000)

  const user = await db.user.findFirst({
    where: { OR: [{ employeeId: identifier.trim() }, { email: identifier.trim().toLowerCase() }] },
    include: { office: true },
  })
  if (!user) throw new ApiError(401, 'Invalid employee ID/email or password')
  if (!user.isActive) throw new ApiError(403, 'Account is inactive. Contact HR.')
  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000)
    throw new ApiError(423, `Account locked after repeated failed logins. Try again in ${mins} min.`)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    const count = user.failedLoginCount + 1
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: count,
        lockUntil: count >= env.LOGIN_RATE_LIMIT ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000) : null,
      },
    })
    throw new ApiError(401, 'Invalid employee ID/email or password')
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockUntil: null } })
  // Successful login clears the limiter window — only failed attempts count (brute-force protection).
  rateLimitReset(`login:ip:${clientIp(req)}`)
  rateLimitReset(`login:acct:${identifier.toLowerCase()}`)

  const sessionId = await createSession(user.id, req)
  const refresh = await signRefreshToken(user.id, sessionId)
  await db.session.update({ where: { id: sessionId }, data: { refreshTokenHash: sha256(refresh) } })
  const access = await signAccessToken({
    id: user.id, employeeId: user.employeeId, name: user.name, email: user.email,
    role: user.role as 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN', department: user.department,
    managerId: user.managerId, officeId: user.officeId, shiftId: user.shiftId,
    mustChangePassword: user.mustChangePassword,
  })

  await audit(user.id, 'LOGIN', 'User', user.id)

  const res = ok({
    user: {
      id: user.id, employeeId: user.employeeId, name: user.name, email: user.email,
      role: user.role, department: user.department, managerId: user.managerId,
      officeId: user.officeId, officeName: user.office?.name ?? null,
      mustChangePassword: user.mustChangePassword,
    },
    // Token fallback for contexts where cookies are blocked (preview iframe with
    // third-party-cookie blocking). The client stores these and echoes them via
    // the Authorization header; httpOnly cookies remain the primary channel.
    accessToken: access,
    refreshToken: refresh,
  })
  setAuthCookies(res, access, refresh)
  return res
})
