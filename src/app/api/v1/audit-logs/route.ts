import { db } from '@/lib/db'
import { handleRoute, ok, getPagination, paginated } from '@/lib/api'
import { requireAuth, requireRole } from '@/lib/auth'

/** GET /api/v1/audit-logs — HR only, newest first, filter by action/entity. */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = getPagination(url, 30)
  const action = url.searchParams.get('action')
  const where = action ? { action: { contains: action } } : {}
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { actor: { select: { name: true, employeeId: true } } },
    }),
    db.auditLog.count({ where }),
  ])
  return ok(paginated(items, total, page, pageSize))
})
