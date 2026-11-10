import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { adjustBalance, yearOfDate } from '@/lib/leave-service'
import { recalcAttendance, shiftOf } from '@/lib/attendance-service'
import { istDateFromISOTime } from '@/lib/dates'
import { notify, audit } from '@/lib/notify'
import { REQUEST_TYPE_LABEL } from '@/lib/labels'

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(500).optional(),
})

/**
 * PATCH /api/v1/requests/:id/decision — manager (own reports) or HR (any).
 * Approval deducts leave balance inside a transaction (spec §6.4);
 * regularization approval rewrites the attendance record + audit log (spec §6.4).
 */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'MANAGER', 'HR_ADMIN')
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const { decision, comment } = decisionSchema.parse(body)

  const request = await db.leaveRequest.findUnique({ where: { id }, include: { user: { include: { shift: true } } } })
  if (!request) throw new ApiError(404, 'Request not found')
  if (request.status !== 'PENDING') throw new ApiError(409, `This request is already ${request.status.toLowerCase()}`)
  if (authed.role === 'MANAGER' && request.user.managerId !== authed.id) {
    throw new ApiError(403, 'You can only decide requests from your direct reports')
  }

  const balanced = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH'].includes(request.type)

  await db.$transaction(async (tx) => {
    if (decision === 'APPROVED' && balanced) {
      await adjustBalance(tx, request.userId, yearOfDate(request.fromDate), request.type, request.daysCount)
    }

    await tx.leaveRequest.update({
      where: { id },
      data: {
        status: decision,
        approverId: authed.id,
        managerComment: comment ?? null,
        decidedAt: new Date(),
      },
    })

    if (decision === 'APPROVED' && request.type === 'REGULARIZATION') {
      const regDate = request.regDate!
      const existing = await tx.attendance.findUnique({ where: { userId_date: { userId: request.userId, date: regDate } } })
      const checkInAt = istDateFromISOTime(regDate, request.regInTime!)
      const checkOutAt = istDateFromISOTime(regDate, request.regOutTime!)
      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            checkInAt,
            checkOutAt,
            checkInMode: existing.checkInMode ?? 'OFFICE',
            checkOutMode: existing.checkOutMode ?? 'OFFICE',
            autoClosed: false,
            flagged: false,
            flagReason: null,
          },
        })
        await recalcAttendance(existing.id, shiftOf(request.user), tx)
      } else {
        const att = await tx.attendance.create({
          data: {
            userId: request.userId,
            date: regDate,
            checkInAt,
            checkOutAt,
            checkInMode: 'OFFICE',
            checkOutMode: 'OFFICE',
          },
        })
        await recalcAttendance(att.id, shiftOf(request.user), tx)
      }
      await tx.auditLog.create({
        data: {
          actorId: authed.id,
          action: 'REGULARIZATION_APPLIED',
          entity: 'Attendance',
          entityId: `${request.userId}:${regDate}`,
          before: existing ? JSON.stringify({ checkInAt: existing.checkInAt, checkOutAt: existing.checkOutAt, status: existing.status, autoClosed: existing.autoClosed }) : null,
          after: JSON.stringify({ checkInAt, checkOutAt, regInTime: request.regInTime, regOutTime: request.regOutTime }),
        },
      })
    }
  })

  await notify(
    request.userId,
    'REQUEST_DECIDED',
    decision === 'APPROVED'
      ? `Your ${REQUEST_TYPE_LABEL[request.type] ?? request.type} request (${request.fromDate}${request.toDate !== request.fromDate ? ` – ${request.toDate}` : ''}) was approved.${comment ? ` Note: ${comment}` : ''}`
      : `Your ${REQUEST_TYPE_LABEL[request.type] ?? request.type} request (${request.fromDate}${request.toDate !== request.fromDate ? ` – ${request.toDate}` : ''}) was rejected.${comment ? ` Note: ${comment}` : ''}`,
  )
  await audit(authed.id, `REQUEST_${decision}`, 'Request', id, { status: request.status }, { status: decision, comment })

  const updated = await db.leaveRequest.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, employeeId: true } } } })
  return ok(updated)
})
