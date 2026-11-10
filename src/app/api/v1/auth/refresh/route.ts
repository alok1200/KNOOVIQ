import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import {
  REFRESH_COOKIE, bearerToken, readCookie, rotateSession, setAuthCookies,
  sha256, signAccessToken, signRefreshToken, verifyRefreshToken,
} from '@/lib/auth'
import { assertSameOrigin } from '@/lib/auth'

/**
 * POST /api/v1/auth/refresh — refresh token rotation (spec §5).
 * Reuse of an already-rotated token revokes ALL sessions of the user.
 */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  // Cookie is the primary channel; Authorization: Bearer is the fallback for
  // contexts where third-party-cookie blocking prevents cookie storage.
  const token = readCookie(req, REFRESH_COOKIE) ?? bearerToken(req)
  if (!token) throw new ApiError(401, 'No refresh token')

  const payload = await verifyRefreshToken(token)
  if (!payload?.sub || !payload.jti) throw new ApiError(401, 'Invalid refresh token')

  const session = await db.session.findUnique({ where: { id: String(payload.jti) } })
  if (!session || session.userId !== payload.sub) throw new ApiError(401, 'Invalid session')

  // Rotation grace (multi-tab race tolerance): if two tabs refresh with the same
  // token at nearly the same moment, the loser finds its session already revoked
  // by the winner. That is a benign race, not theft — as long as the presented
  // token hash matches the just-revoked session's hash and the revocation is
  // fresh (< 15 s), rotate again instead of nuking every session.
  const GRACE_MS = 15_000
  const recentlyRevokedByRace =
    session.revokedAt &&
    Date.now() - session.revokedAt.getTime() < GRACE_MS &&
    session.refreshTokenHash === sha256(token)

  if (session.revokedAt && !recentlyRevokedByRace) {
    // Token reuse detected → revoke everything for this user (spec §5)
    await revokeAll(session.userId)
    throw new ApiError(401, 'Session reuse detected. Please sign in again.')
  }
  if (session.expiresAt < new Date()) throw new ApiError(401, 'Session expired')
  if (!session.revokedAt && session.refreshTokenHash !== sha256(token)) {
    await revokeAll(session.userId)
    throw new ApiError(401, 'Session reuse detected. Please sign in again.')
  }

  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user || !user.isActive) throw new ApiError(401, 'Account is inactive')

  const newSessionId = await rotateSession(session.id, user.id, req)
  const refresh = await signRefreshToken(user.id, newSessionId)
  await db.session.update({ where: { id: newSessionId }, data: { refreshTokenHash: sha256(refresh) } })
  const access = await signAccessToken({
    id: user.id, employeeId: user.employeeId, name: user.name, email: user.email,
    role: user.role as 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN', department: user.department,
    managerId: user.managerId, officeId: user.officeId, shiftId: user.shiftId,
    mustChangePassword: user.mustChangePassword,
  })

  const res = ok({
    user: {
      id: user.id, employeeId: user.employeeId, name: user.name, email: user.email,
      role: user.role, department: user.department, managerId: user.managerId,
      officeId: user.officeId, mustChangePassword: user.mustChangePassword,
    },
    // Token fallback (see login route) — client persists these when cookies are blocked.
    accessToken: access,
    refreshToken: refresh,
  })
  setAuthCookies(res, access, refresh)
  return res
})

async function revokeAll(userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}
