import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, clearAuthCookies, hashPassword, requireAuth, verifyPassword } from '@/lib/auth'
import { audit } from '@/lib/notify'

/**
 * POST /api/v1/auth/change-password (spec §5: min 8 chars, clears the
 * must-change-password flag, revokes all sessions → re-login required).
 */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const user = await requireAuth(req)
  const body = await req.json().catch(() => ({}))
  const { currentPassword, newPassword } = z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    })
    .parse(body)

  const full = await db.user.findUnique({ where: { id: user.id } })
  if (!full) throw new ApiError(404, 'User not found')

  const valid = await verifyPassword(currentPassword, full.passwordHash)
  if (!valid) throw new ApiError(401, 'Current password is incorrect')
  if (currentPassword === newPassword) throw new ApiError(422, 'New password must be different from the current one')

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  })
  await audit(user.id, 'CHANGE_PASSWORD', 'User', user.id)

  // Revoke all sessions → forces a fresh sign-in with the new password.
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  const res = ok({ changed: true, reloginRequired: true })
  clearAuthCookies(res)
  return res
})
