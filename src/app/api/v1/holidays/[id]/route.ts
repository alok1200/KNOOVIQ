import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'

/** DELETE /api/v1/holidays/:id */
export const DELETE = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  await db.holiday.delete({ where: { id } }).catch(() => {})
  await audit(authed.id, 'HOLIDAY_DELETED', 'Holiday', id)
  return ok({ deleted: true })
})
