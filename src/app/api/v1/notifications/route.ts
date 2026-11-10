import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth } from '@/lib/auth'

/** GET /api/v1/notifications — latest 30 + unread count. */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: authed.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.notification.count({ where: { userId: authed.id, readAt: null } }),
  ])
  return ok({ items, unread })
})
