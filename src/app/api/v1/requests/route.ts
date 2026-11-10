import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok, getPagination, paginated } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'
import { workingDaysCount, assertNoOverlap, BALANCED_TYPES, getBalances, yearOfDate } from '@/lib/leave-service'
import { fmtDate, isValidISODate, todayISO, addDaysISO } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { REQUEST_TYPE_LABEL } from '@/lib/labels'

/** GET /api/v1/requests/mine — my requests, newest first. */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = getPagination(url)
  const status = url.searchParams.get('status')
  const where = { userId: authed.id, ...(status ? { status } : {}) }
  const [items, total] = await Promise.all([
    db.leaveRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { approver: { select: { name: true } } } }),
    db.leaveRequest.count({ where }),
  ])
  return ok(paginated(items, total, page, pageSize))
})

const createSchema = z
  .object({
    type: z.enum(['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH', 'OFFICIAL_WORK_OUTSIDE', 'REGULARIZATION']),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    halfDay: z.boolean().default(false),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    regDate: z.string().optional(),
    regInTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time (HH:mm)').optional(),
    regOutTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time (HH:mm)').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'REGULARIZATION') {
      if (!v.regDate || !v.regInTime || !v.regOutTime) {
        ctx.addIssue({ code: 'custom', message: 'Regularization needs a date and both in/out times' })
      } else if (v.regInTime >= v.regOutTime) {
        ctx.addIssue({ code: 'custom', message: 'Regularization check-in time must be before check-out time' })
      }
      return
    }
    if (!v.fromDate || !v.toDate) {
      ctx.addIssue({ code: 'custom', message: 'From and to dates are required' })
      return
    }
  })

/** POST /api/v1/requests — apply for leave / WFH / outside work / regularization (spec §6.4). */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const body = await req.json().catch(() => ({}))
  const input = createSchema.parse(body)

  const user = await db.user.findUnique({ where: { id: authed.id } })
  if (!user) throw new Error('User not found')

  if (input.type === 'REGULARIZATION') {
    const regDate = input.regDate!
    if (!isValidISODate(regDate)) throw new ApiError(422, 'Invalid regularization date')
    if (regDate > todayISO()) throw new ApiError(422, 'Regularization cannot be for a future date')
    if (regDate < addDaysISO(todayISO(), -30)) throw new ApiError(422, 'Regularization is only allowed within the last 30 days')

    const dup = await db.leaveRequest.findFirst({
      where: { userId: user.id, type: 'REGULARIZATION', regDate, status: { in: ['PENDING', 'APPROVED'] } },
    })
    if (dup) throw new ApiError(409, `A regularization for ${fmtDate(regDate)} is already ${dup.status.toLowerCase()}`)

    const created = await db.leaveRequest.create({
      data: {
        userId: user.id,
        type: 'REGULARIZATION',
        fromDate: regDate,
        toDate: regDate,
        reason: input.reason,
        regDate,
        regInTime: input.regInTime!,
        regOutTime: input.regOutTime!,
        daysCount: 0,
      },
    })
    await notifyApprovers(user, created.id, created.type)
    return ok(created, { status: 201 })
  }

  // dated requests
  const fromDate = input.fromDate!
  const toDate = input.toDate!
  if (!isValidISODate(fromDate) || !isValidISODate(toDate)) throw new ApiError(422, 'Invalid dates')
  if (toDate < fromDate) throw new ApiError(422, 'End date cannot be before start date')
  if (fromDate < todayISO()) throw new ApiError(422, 'Leave cannot be applied for a past date. Use Regularization for missed punches instead')
  if (input.halfDay && fromDate !== toDate) throw new ApiError(422, 'Half-day can only be requested for a single day')

  const days = input.halfDay ? 0.5 : await workingDaysCount(fromDate, toDate, user.officeId)
  if (days === 0) {
    throw new ApiError(422, 'The selected range contains no working days (Sundays and holidays are excluded)')
  }

  await assertNoOverlap(user.id, fromDate, toDate)

  if ((BALANCED_TYPES as readonly string[]).includes(input.type)) {
    const year = yearOfDate(fromDate)
    const balances = await getBalances(user.id, year)
    const bal = balances.find((b) => b.type === input.type)
    if (!bal) throw new ApiError(409, `No ${input.type} balance configured for ${year}`)
    if (bal.quota - bal.used < days) {
      throw new ApiError(409, `Insufficient balance: ${(bal.quota - bal.used).toFixed(1)} of ${bal.quota} day(s) remaining, you need ${days.toFixed(1)}`)
    }
  }

  const created = await db.leaveRequest.create({
    data: {
      userId: user.id,
      type: input.type,
      fromDate,
      toDate,
      halfDay: input.halfDay,
      reason: input.reason,
      daysCount: days,
    },
  })
  await notifyApprovers(user, created.id, created.type)
  return ok(created, { status: 201 })
})

async function notifyApprovers(user: { id: string; name: string; managerId: string | null }, requestId: string, type: string) {
  if (user.managerId) {
    await notify(user.managerId, 'REQUEST_SUBMITTED', `${user.name} submitted a ${REQUEST_TYPE_LABEL[type] ?? type} request for your approval.`)
  } else {
    const admins = await db.user.findMany({ where: { role: 'HR_ADMIN', isActive: true }, select: { id: true } })
    for (const a of admins) {
      await notify(a.id, 'REQUEST_SUBMITTED', `${user.name} submitted a ${REQUEST_TYPE_LABEL[type] ?? type} request for your approval.`)
    }
  }
  void requestId
}
