import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, clientIp, requireAuth } from '@/lib/auth'
import { assertAction, deriveState, evaluatePunch, getAttendance, isLate, shiftOf } from '@/lib/attendance-service'
import { todayPayload, punchSchema } from '../today/payload'
import { todayISO } from '@/lib/dates'
import { notify } from '@/lib/notify'

/**
 * POST /api/v1/attendance/check-in (spec §6.1/§6.2)
 * Server computes Haversine distance; rejected outside geofence with details.
 * Approved WFH / Official Work (Outside) bypasses the geofence.
 * Office-network (IP) presence substitutes for GPS when configured by HR.
 */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const body = await req.json().catch(() => ({}))
  const { lat, lng, accuracy } = punchSchema.parse(body ?? {})

  const user = await db.user.findUnique({ where: { id: authed.id }, include: { office: true, shift: true } })
  if (!user) throw new Error('User not found')

  const att = await getAttendance(user.id, todayISO())
  assertAction(deriveState(att), 'check-in')

  const evaluation = await evaluatePunch(user, { lat, lng, accuracy }, clientIp(req))
  const shift = shiftOf(user)

  const created = await db.attendance.create({
    data: {
      userId: user.id,
      date: todayISO(),
      checkInAt: new Date(), // server timestamp only (spec §6.2)
      checkInLat: evaluation.lat,
      checkInLng: evaluation.lng,
      checkInAccuracy: evaluation.accuracy,
      checkInDistance: evaluation.distance,
      checkInMode: evaluation.mode,
      status: 'PRESENT',
      flagged: evaluation.flagged,
      flagReason: evaluation.flagReason,
      breaks: { create: [] },
    },
  })

  // initial day status (finalized at check-out)
  const lateNow = isLate(created.checkInAt!, shift)
  if (evaluation.mode === 'WFH') await db.attendance.update({ where: { id: created.id }, data: { status: 'WFH' } })
  else if (evaluation.mode === 'OUTSIDE') await db.attendance.update({ where: { id: created.id }, data: { status: 'OUTSIDE' } })
  else if (lateNow) await db.attendance.update({ where: { id: created.id }, data: { status: 'LATE' } })

  if (evaluation.flagged) {
    const admins = await db.user.findMany({ where: { role: 'HR_ADMIN', isActive: true }, select: { id: true } })
    for (const a of admins) {
      await notify(a.id, 'FLAGGED_PUNCH', `Suspicious check-in by ${user.name} (${user.employeeId}): ${evaluation.flagReason}`)
    }
  }

  return todayPayload(user.id)
})
