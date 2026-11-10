import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, clientIp, requireAuth } from '@/lib/auth'
import { assertAction, deriveState, evaluatePunch, getAttendance, recalcAttendance } from '@/lib/attendance-service'
import { todayPayload, punchSchema } from '../today/payload'
import { todayISO } from '@/lib/dates'
import { notify } from '@/lib/notify'

/** POST /api/v1/attendance/check-out — not allowed while on break (409, spec §6.1). */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const body = await req.json().catch(() => ({}))
  const { lat, lng, accuracy } = punchSchema.parse(body ?? {})

  const user = await db.user.findUnique({ where: { id: authed.id }, include: { office: true } })
  if (!user) throw new Error('User not found')

  const att = await getAttendance(user.id, todayISO())
  assertAction(deriveState(att), 'check-out')

  const evaluation = await evaluatePunch(user, { lat, lng, accuracy }, clientIp(req))

  await db.attendance.update({
    where: { id: att!.id },
    data: {
      checkOutAt: new Date(),
      checkOutLat: evaluation.lat,
      checkOutLng: evaluation.lng,
      checkOutAccuracy: evaluation.accuracy,
      checkOutDistance: evaluation.distance,
      checkOutMode: evaluation.mode,
      flagged: att!.flagged || evaluation.flagged,
      flagReason: evaluation.flagReason ?? att!.flagReason,
    },
  })
  await recalcAttendance(att!.id)

  if (evaluation.flagged && !att!.flagged) {
    const admins = await db.user.findMany({ where: { role: 'HR_ADMIN', isActive: true }, select: { id: true } })
    for (const a of admins) {
      await notify(a.id, 'FLAGGED_PUNCH', `Suspicious check-out by ${user.name} (${user.employeeId}): ${evaluation.flagReason}`)
    }
  }

  return todayPayload(user.id)
})
