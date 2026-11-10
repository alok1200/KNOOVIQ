import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { requireAuth } from '@/lib/auth'
import { classifyDay } from '@/lib/attendance-service'
import { currentMonth, monthRange, isValidISODate, dowISO, isSunday } from '@/lib/dates'

/**
 * GET /api/v1/attendance/calendar?month=YYYY-MM
 * Monthly colour-coded calendar data (spec §9): attendance status per day,
 * else approved leave, else holiday, else weekly off (Sunday).
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const url = new URL(req.url)
  const monthParam = url.searchParams.get('month') ?? currentMonth()
  if (!/^\d{4}-\d{2}$/.test(monthParam) || !isValidISODate(`${monthParam}-01`)) {
    throw new ApiError(422, 'month must be in YYYY-MM format')
  }
  const { from, to, days } = monthRange(monthParam)

  const user = await db.user.findUnique({ where: { id: authed.id } })
  const holidays = await db.holiday.findMany({
    where: { OR: [{ officeId: null }, ...(user?.officeId ? [{ officeId: user.officeId }] : [])], date: { gte: from, lte: to } },
  })
  const holidaySet = new Set(holidays.map((h) => h.date))

  const [attendances, leaves] = await Promise.all([
    db.attendance.findMany({ where: { userId: authed.id, date: { gte: from, lte: to } } }),
    db.leaveRequest.findMany({
      where: {
        userId: authed.id,
        status: 'APPROVED',
        type: { not: 'REGULARIZATION' },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    }),
  ])

  const attByDate = new Map(attendances.map((a) => [a.date, a]))
  const daysOut = days.map((date) => {
    const att = attByDate.get(date) ?? null
    const leave = leaves.find((l) => l.fromDate <= date && l.toDate >= date)
    return {
      date,
      dow: dowISO(date),
      status: classifyDay({
        date,
        att,
        leaveType: leave ? (['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE'].includes(leave.type) ? 'ON_LEAVE' : leave.type === 'WFH' ? 'WFH' : 'OUTSIDE') : null,
        isHoliday: holidaySet.has(date),
      }),
      workMinutes: att?.workMinutes ?? 0,
      checkInAt: att?.checkInAt ?? null,
      checkOutAt: att?.checkOutAt ?? null,
      flagged: att?.flagged ?? false,
      autoClosed: att?.autoClosed ?? false,
    }
  })

  return ok({ month: monthParam, days: daysOut, holidays: holidays.map((h) => ({ date: h.date, name: h.name })) })
})
