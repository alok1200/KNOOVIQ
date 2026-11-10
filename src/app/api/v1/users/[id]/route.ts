import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/notify'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'HR_ADMIN']).optional(),
  department: z.string().optional(),
  managerId: z.string().nullable().optional(),
  officeId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).optional(),
})

/** PATCH /api/v1/users/:id — HR updates a user; password reset keeps mustChangePassword (spec §5). */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const input = updateSchema.parse(body)

  const before = await db.user.findUnique({ where: { id } })
  if (!before) throw new ApiError(404, 'User not found')

  const data: Record<string, unknown> = {}
  for (const k of ['name', 'role', 'department', 'managerId', 'officeId', 'shiftId', 'isActive'] as const) {
    if (input[k] !== undefined) data[k] = input[k]
  }
  if (input.newPassword) {
    data.passwordHash = await hashPassword(input.newPassword)
    data.mustChangePassword = true
    data.failedLoginCount = 0
    data.lockUntil = null
  }

  const after = await db.user.update({ where: { id }, data })
  await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
  await audit(authed.id, 'USER_UPDATED', 'User', id, before, after)
  return ok({ id: after.id, employeeId: after.employeeId, isActive: after.isActive })
})
