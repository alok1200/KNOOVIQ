import { db } from '@/lib/db'
import { ApiError, handleRoute, ok, getPagination, paginated } from '@/lib/api'
import { requireAuth } from '@/lib/auth'
import { addDaysISO, todayISO } from '@/lib/dates'

/**
 * GET /api/v1/attendance/history?from=&to=&userId=&page=
 * Own history by default. Managers may query direct reports, HR any user.
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = getPagination(url)

  const to = url.searchParams.get('to') ?? todayISO()
  const from = url.searchParams.get('from') ?? addDaysISO(to, -29)
  let userId = url.searchParams.get('userId') ?? authed.id

  if (userId !== authed.id) {
    if (authed.role === 'HR_ADMIN') {
      // allowed
    } else if (authed.role === 'MANAGER') {
      const report = await db.user.findUnique({ where: { id: userId } })
      if (!report || report.managerId !== authed.id) throw new ApiError(403, 'You can only view your direct reports')
    } else {
      throw new ApiError(403, 'Not allowed')
    }
  }

  const where = { userId, date: { gte: from, lte: to } }
  const [items, total] = await Promise.all([
    db.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take,
      include: { breaks: { orderBy: { start: 'asc' } } },
    }),
    db.attendance.count({ where }),
  ])

  return ok(paginated(items, total, page, pageSize))
})
