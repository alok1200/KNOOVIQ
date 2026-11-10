import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth, requireRole } from '@/lib/auth'
import { currentMonth, monthRange, fmtTime, fmtMinutes, hhmmToMinutes, istMinutesOfDay } from '@/lib/dates'
import { classifyDay, holidaySet } from '@/lib/attendance-service'
import { exportResponse } from '@/lib/report-export'

/**
 * GET /api/v1/reports/monthly?month=YYYY-MM&userId=all|<id>&format=json|csv|xlsx
 * HR: everyone. Manager: self + direct reports.
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN', 'MANAGER')
  const url = new URL(req.url)
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') ?? '') ? url.searchParams.get('month')! : currentMonth()
  const format = url.searchParams.get('format') ?? 'json'
  const userIdFilter = url.searchParams.get('userId') ?? 'all'
  const { from, to, days } = monthRange(month)

  // scope users
  let users
  if (authed.role === 'HR_ADMIN') {
    users = await db.user.findMany({ where: { isActive: true }, orderBy: { employeeId: 'asc' }, include: { shift: true } })
  } else {
    users = await db.user.findMany({
      where: { isActive: true, OR: [{ id: authed.id }, { managerId: authed.id }] },
      orderBy: { employeeId: 'asc' },
      include: { shift: true },
    })
  }
  if (userIdFilter !== 'all') users = users.filter((u) => u.id === userIdFilter)
  const ids = users.map((u) => u.id)

  const [attendances, leaves, holidays] = await Promise.all([
    db.attendance.findMany({ where: { userId: { in: ids }, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }),
    db.leaveRequest.findMany({
      where: { userId: { in: ids }, status: 'APPROVED', type: { not: 'REGULARIZATION' }, fromDate: { lte: to }, toDate: { gte: from } },
    }),
    holidaySet(users[0]?.officeId),
  ])
  const attMap = new Map(attendances.map((a) => [`${a.userId}:${a.date}`, a]))

  type MonthlyReportRow = {
    employeeId: string
    name: string
    date: string
    status: string
    checkIn: string
    checkOut: string
    workMinutes: number
    breakMinutes: number
    lateMinutes: number
    flagged: boolean
    autoClosed: boolean
  }
  const rows: MonthlyReportRow[] = []
  for (const u of users) {
    const shiftStartMin = hhmmToMinutes(u.shift?.startTime ?? '09:00') + (u.shift?.graceMinutes ?? 15)
    for (const date of days) {
      const att = attMap.get(`${u.id}:${date}`) ?? null
      const leave = leaves.find((l) => l.userId === u.id && l.fromDate <= date && l.toDate >= date)
      const status = classifyDay({ date, att, leaveType: leave ? (['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE'].includes(leave.type) ? 'ON_LEAVE' : leave.type === 'WFH' ? 'WFH' : 'OUTSIDE') : null, isHoliday: holidays.has(date) })
      const lateMin = att?.checkInAt ? Math.max(0, istMinutesOfDay(new Date(att.checkInAt)) - shiftStartMin) : 0
      rows.push({
        employeeId: u.employeeId,
        name: u.name,
        date,
        status,
        checkIn: att?.checkInAt ? fmtTime(new Date(att.checkInAt)) : '—',
        checkOut: att?.checkOutAt ? fmtTime(new Date(att.checkOutAt)) : '—',
        workMinutes: att?.workMinutes ?? 0,
        breakMinutes: att?.breakMinutes ?? 0,
        lateMinutes: status === 'LATE' ? lateMin : 0,
        flagged: att?.flagged ?? false,
        autoClosed: att?.autoClosed ?? false,
      })
    }
  }

  if (format === 'csv' || format === 'xlsx') {
    return exportResponse({
      filename: `knooviq-monthly-${month}`,
      format,
      title: `Monthly ${month}`,
      headers: ['Employee ID', 'Name', 'Date', 'Status', 'Check In', 'Check Out', 'Work (min)', 'Break (min)', 'Late (min)', 'Flagged', 'Auto Closed'],
      rows: rows.map((r) => [r.employeeId, r.name, r.date, r.status, r.checkIn, r.checkOut, r.workMinutes, r.breakMinutes, r.lateMinutes, r.flagged ? 'YES' : '', r.autoClosed ? 'YES' : '']),
    })
  }
  return ok({ month, rows: rows.map((r) => ({ ...r, work: fmtMinutes(r.workMinutes), break: fmtMinutes(r.breakMinutes) })) })
})
