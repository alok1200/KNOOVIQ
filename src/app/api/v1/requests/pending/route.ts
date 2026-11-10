import { db } from '@/lib/db'
import { handleRoute, ok, getPagination, paginated } from '@/lib/api'
import { requireAuth, requireRole } from '@/lib/auth'

/** GET /api/v1/requests/pending — approvals queue for managers (direct reports) and HR (all). */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'MANAGER', 'HR_ADMIN')
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = getPagination(url)

  const where =
    authed.role === 'HR_ADMIN'
      ? { status: 'PENDING' as const }
      : { status: 'PENDING' as const, user: { managerId: authed.id } }

  const [items, total] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true, employeeId: true, department: true } },
      },
    }),
    db.leaveRequest.count({ where }),
  ])
  return ok(paginated(items, total, page, pageSize))
})
