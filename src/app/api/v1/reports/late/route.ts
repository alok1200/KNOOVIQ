import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth, requireRole } from '@/lib/auth'
import { currentMonth, monthRange, fmtTime, hhmmToMinutes, istMinutesOfDay } from '@/lib/dates'
import { exportResponse } from '@/lib/report-export'

/**
 * GET /api/v1/reports/late?month=YYYY-MM&format=json|csv|xlsx
 * Late arrivals: check-in after shift start + grace (spec §6.3).
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN', 'MANAGER')
  const url = new URL(req.url)
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') ?? '') ? url.searchParams.get('month')! : currentMonth()
  const format = url.searchParams.get('format') ?? 'json'
  const { from, to } = monthRange(month)

  const users =
    authed.role === 'HR_ADMIN'
      ? await db.user.findMany({ where: { isActive: true }, include: { shift: true } })
      : await db.user.findMany({ where: { isActive: true, OR: [{ id: authed.id }, { managerId: authed.id }] }, include: { shift: true } })
  const ids = users.map((u) => u.id)
  const userMap = new Map(users.map((u) => [u.id, u]))

  const atts = await db.attendance.findMany({
    where: { userId: { in: ids }, date: { gte: from, lte: to }, checkInAt: { not: null } },
    orderBy: { date: 'asc' },
  })

  const rows = atts
    .map((att) => {
      const u = userMap.get(att.userId)!
      const shiftStartMin = hhmmToMinutes(u.shift?.startTime ?? '09:00') + (u.shift?.graceMinutes ?? 15)
      const lateMinutes = Math.max(0, istMinutesOfDay(new Date(att.checkInAt!)) - shiftStartMin)
      if (lateMinutes <= 0) return null
      return {
        employeeId: u.employeeId,
        name: u.name,
        date: att.date,
        checkIn: fmtTime(new Date(att.checkInAt!)),
        lateMinutes,
        status: att.status,
        flagged: att.flagged,
      }
    })
    .filter(Boolean) as { employeeId: string; name: string; date: string; checkIn: string; lateMinutes: number; status: string; flagged: boolean }[]

  if (format === 'csv' || format === 'xlsx') {
    return exportResponse({
      filename: `knooviq-late-${month}`,
      format,
      title: `Late ${month}`,
      headers: ['Employee ID', 'Name', 'Date', 'Check In', 'Late (min)', 'Status', 'Flagged'],
      rows: rows.map((r) => [r.employeeId, r.name, r.date, r.checkIn, r.lateMinutes, r.status, r.flagged ? 'YES' : '']),
    })
  }
  return ok({ month, rows })
})
