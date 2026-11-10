import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  graceMinutes: z.number().int().min(0).max(240).optional(),
  fullDayMinutes: z.number().int().min(60).max(960).optional(),
  halfDayMinutes: z.number().int().min(30).max(480).optional(),
})

/** PATCH /api/v1/shifts/:id */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const input = updateSchema.parse(body)
  const before = await db.shift.findUnique({ where: { id } })
  if (!before) throw new ApiError(404, 'Shift not found')
  const after = await db.shift.update({ where: { id }, data: input })
  await audit(authed.id, 'SHIFT_UPDATED', 'Shift', id, before, after)
  return ok(after)
})

/** DELETE /api/v1/shifts/:id — blocked while users are assigned. */
export const DELETE = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  const count = await db.user.count({ where: { shiftId: id } })
  if (count > 0) throw new ApiError(409, `Cannot delete: ${count} user(s) are assigned to this shift`)
  await db.shift.delete({ where: { id } })
  await audit(authed.id, 'SHIFT_DELETED', 'Shift', id)
  return ok({ deleted: true })
})
