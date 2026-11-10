import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'

/** PATCH /api/v1/notifications/:id/read */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const { id } = await ctx.params
  const n = await db.notification.findUnique({ where: { id } })
  if (!n || n.userId !== authed.id) throw new ApiError(404, 'Notification not found')
  const updated = await db.notification.update({ where: { id }, data: { readAt: new Date() } })
  return ok(updated)
})
