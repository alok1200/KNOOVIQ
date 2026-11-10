import { db } from '@/lib/db'
import { handleRoute } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'
import { assertAction, deriveState, getAttendance } from '@/lib/attendance-service'
import { todayPayload } from '../../today/payload'
import { todayISO } from '@/lib/dates'

/** POST /api/v1/attendance/break/start (spec §6.1; breaks allowed outside geofence). */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)

  const att = await getAttendance(authed.id, todayISO())
  assertAction(deriveState(att), 'start-break')

  await db.breakRecord.create({ data: { attendanceId: att!.id, start: new Date() } })
  return todayPayload(authed.id)
})
