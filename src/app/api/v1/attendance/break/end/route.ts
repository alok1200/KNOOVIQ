import { db } from '@/lib/db'
import { handleRoute } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'
import { assertAction, deriveState, getAttendance, recalcAttendance } from '@/lib/attendance-service'
import { todayPayload } from '../../today/payload'
import { todayISO } from '@/lib/dates'

/** POST /api/v1/attendance/break/end */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)

  const att = await getAttendance(authed.id, todayISO())
  assertAction(deriveState(att), 'end-break')

  const open = att!.breaks.find((b) => b.end === null)!
  const end = new Date()
  await db.breakRecord.update({
    where: { id: open.id },
    data: { end, minutes: Math.max(0, Math.floor((end.getTime() - new Date(open.start).getTime()) / 60000)) },
  })
  await recalcAttendance(att!.id)
  return todayPayload(authed.id)
})
