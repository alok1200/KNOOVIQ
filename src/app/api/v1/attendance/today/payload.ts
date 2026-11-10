import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, ok } from '@/lib/api'
import { deriveState, getAttendance, isLate, shiftOf, ALLOWED_ACTIONS } from '@/lib/attendance-service'
import { todayISO } from '@/lib/dates'
import { env } from '@/lib/env'

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000),
})

/** Punch body: GPS is optional — office-network (IP) presence can substitute. */
const punchSchema = gpsSchema.partial()

/** Shared today-payload builder used by GET /attendance/today and after punches. */
export async function todayPayload(userId: string) {
  const date = todayISO()
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { office: true, shift: true, statusNote: true },
  })
  if (!user) throw new ApiError(404, 'User not found')
  const att = await getAttendance(userId, date)
  const state = deriveState(att)
  const openBreak = att?.breaks.find((b) => b.end === null) ?? null
  const office = user.office

  // live geofence evaluation context for the UI
  const wfhApproved = await db.leaveRequest.findFirst({
    where: { userId, status: 'APPROVED', type: { in: ['WFH', 'OFFICIAL_WORK_OUTSIDE'] }, fromDate: { lte: date }, toDate: { gte: date } },
  })

  return ok({
    date,
    state,
    allowedActions: ALLOWED_ACTIONS[state],
    attendance: att
      ? {
          ...att,
          openBreakSince: openBreak?.start ?? null,
          currentBreakMinutes: openBreak ? Math.floor((Date.now() - new Date(openBreak.start).getTime()) / 60000) : 0,
        }
      : null,
    office: office ? { id: office.id, name: office.name, lat: office.lat, lng: office.lng, radiusMeters: office.radiusMeters, timezone: office.timezone, allowedIps: office.allowedIps } : null,
    shift: shiftOf(user),
    statusNote: user.statusNote ? { status: user.statusNote.status, note: user.statusNote.note, expectedReturnAt: user.statusNote.expectedReturnAt, updatedAt: user.statusNote.updatedAt } : null,
    approvedModeToday: wfhApproved ? (wfhApproved.type === 'WFH' ? 'WFH' : 'OUTSIDE') : null,
    maxAccuracyMeters: env.MAX_GPS_ACCURACY_M,
    isLateToday: att?.checkInAt ? isLate(new Date(att.checkInAt), shiftOf(user)) : false,
  })
}

export { gpsSchema, punchSchema }
