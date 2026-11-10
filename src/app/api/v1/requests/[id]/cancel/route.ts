import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'
import { adjustBalance, yearOfDate } from '@/lib/leave-service'
import { notify, audit } from '@/lib/notify'

/** PATCH /api/v1/requests/:id/cancel — owner cancels own request (spec §6.4). */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const { id } = await ctx.params

  const request = await db.leaveRequest.findUnique({ where: { id } })
  if (!request) throw new ApiError(404, 'Request not found')
  if (request.userId !== authed.id) throw new ApiError(403, 'You can only cancel your own requests')
  if (request.status !== 'PENDING' && request.status !== 'APPROVED') {
    throw new ApiError(409, `A ${request.status.toLowerCase()} request cannot be cancelled`)
  }

  const balanced = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH'].includes(request.type)

  const updated = await db.$transaction(async (tx) => {
    // If it was already approved, restore the balance (spec §6.4)
    if (request.status === 'APPROVED' && balanced) {
      await adjustBalance(tx, request.userId, yearOfDate(request.fromDate), request.type, -request.daysCount)
    }
    return tx.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    })
  })

  await audit(authed.id, 'REQUEST_CANCELLED', 'Request', id, request, updated)
  if (request.approverId) {
    await notify(request.approverId, 'REQUEST_SUBMITTED', `${authed.name} cancelled their ${request.type.replaceAll('_', ' ').toLowerCase()} request.`)
  }
  return ok(updated)
})
