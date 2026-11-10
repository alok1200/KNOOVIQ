/**
 * Attendance business logic — the server is the source of truth (spec §6.1–6.3).
 * SERVER ONLY.
 */
import { db } from './db'
import { ApiError } from './api'
import { evaluateGeofence, ipMatchesOfficeList } from './geo'
import { env } from './env'
import { todayISO, istMinutesOfDay, istDateFromISOTime, isSunday, hhmmToMinutes } from './dates'
import type { Prisma } from '@prisma/client'

export type AttState = 'NOT_CHECKED_IN' | 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT'

/** Attendance with breaks included. */
export type Att = {
  id: string
  userId: string
  date: string
  checkInAt: Date | null
  checkInDistance: number | null
  checkInMode: string | null
  checkInAccuracy: number | null
  checkOutAt: Date | null
  checkOutDistance: number | null
  checkOutMode: string | null
  workMinutes: number
  breakMinutes: number
  status: string
  flagged: boolean
  flagReason: string | null
  autoClosed: boolean
  breaks: { id: string; start: Date; end: Date | null; minutes: number }[]
}

/** State machine (spec §6.1). */
export function deriveState(att: Att | null | undefined): AttState {
  if (!att || !att.checkInAt) return 'NOT_CHECKED_IN'
  if (att.checkOutAt) return 'CHECKED_OUT'
  if (att.breaks.some((b) => b.end === null)) return 'ON_BREAK'
  return 'WORKING'
}

export const ALLOWED_ACTIONS: Record<AttState, string[]> = {
  NOT_CHECKED_IN: ['check-in'],
  WORKING: ['start-break', 'check-out'],
  ON_BREAK: ['end-break'],
  CHECKED_OUT: [],
}

export function assertAction(state: AttState, action: string) {
  if (!ALLOWED_ACTIONS[state].includes(action)) {
    throw new ApiError(409, `Invalid action "${action}" in state "${state}". Allowed: ${ALLOWED_ACTIONS[state].join(', ') || 'none'}.`)
  }
}

export async function getAttendance(userId: string, date: string): Promise<Att | null> {
  const att = await db.attendance.findUnique({
    where: { userId_date: { userId, date } },
    include: { breaks: { orderBy: { start: 'asc' } } },
  })
  return (att as Att) ?? null
}

export function shiftOf(user: { shift?: { startTime: string; endTime: string; graceMinutes: number; fullDayMinutes: number; halfDayMinutes: number } | null }) {
  return (
    user.shift ?? {
      startTime: '09:00',
      endTime: '18:00',
      graceMinutes: 15,
      fullDayMinutes: 480,
      halfDayMinutes: 240,
    }
  )
}

export function isLate(checkInAt: Date, shift: { startTime: string; graceMinutes: number }): boolean {
  return istMinutesOfDay(checkInAt) > hhmmToMinutes(shift.startTime) + shift.graceMinutes
}

/** Final day status after check-out (spec §6.3). */
export function computeDayStatus(opts: {
  mode: string | null
  late: boolean
  workMinutes: number
  fullDay: number
  halfDay: number
}): string {
  const { mode, late, workMinutes, fullDay, halfDay } = opts
  if (mode === 'WFH') return 'WFH'
  if (mode === 'OUTSIDE') return 'OUTSIDE'
  if (workMinutes >= fullDay) return late ? 'LATE' : 'PRESENT'
  return 'HALF_DAY'
}

/**
 * Geofence + fraud evaluation for a punch (spec §6.2).
 * Approved WFH / Official Work (Outside) requests skip the geofence.
 *
 * Punch priority:
 *  1. Approved WFH / OUTSIDE → bypass everything.
 *  2. GPS provided and inside the fence → mode OFFICE (spec GPS flow).
 *  3. Client IP matches the office network allow-list → mode IP (network
 *     presence proves office presence when GPS is unavailable or unreliable).
 *  4. Otherwise rejected with the geofence reason (or a GPS-required hint).
 */
export async function evaluatePunch(
  user: {
    id: string
    officeId?: string | null
    office?: { lat: number; lng: number; radiusMeters: number; allowedIps?: string | null } | null
  },
  gps: { lat?: number | null; lng?: number | null; accuracy?: number | null },
  clientIp?: string | null,
) {
  // Approved WFH / OUTSIDE for today?
  const date = todayISO()
  const approved = await db.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: 'APPROVED',
      type: { in: ['WFH', 'OFFICIAL_WORK_OUTSIDE'] },
      fromDate: { lte: date },
      toDate: { gte: date },
    },
  })
  if (approved) {
    return {
      mode: approved.type === 'WFH' ? 'WFH' : 'OUTSIDE',
      distance: null as number | null,
      lat: null as number | null,
      lng: null as number | null,
      accuracy: null as number | null,
      flagged: false,
      flagReason: null as string | null,
      bypassNote: approved.type === 'WFH' ? 'Approved WFH — geofence not required' : 'Approved Official Work (Outside) — geofence not required',
    }
  }

  const office = user.office ?? (user.officeId ? await db.office.findUnique({ where: { id: user.officeId } }) : null)
  if (!office) throw new ApiError(500, 'No office assigned to your account')

  const hasGps =
    typeof gps.lat === 'number' && Number.isFinite(gps.lat) &&
    typeof gps.lng === 'number' && Number.isFinite(gps.lng) &&
    typeof gps.accuracy === 'number' && Number.isFinite(gps.accuracy)

  if (hasGps) {
    const result = evaluateGeofence({
      lat: gps.lat!,
      lng: gps.lng!,
      accuracy: gps.accuracy!,
      officeLat: office.lat,
      officeLng: office.lng,
      radiusMeters: office.radiusMeters || env.DEFAULT_OFFICE_RADIUS_M,
      maxAccuracyMeters: env.MAX_GPS_ACCURACY_M,
    })

    if (result.allowed) {
      const flags = await suspiciousFlags(user.id, gps.lat!, gps.lng!, gps.accuracy!)
      return {
        mode: 'OFFICE',
        distance: Math.round(result.distance * 10) / 10,
        lat: gps.lat!,
        lng: gps.lng!,
        accuracy: gps.accuracy!,
        flagged: flags.length > 0,
        flagReason: flags.join('; ') || null,
        bypassNote: null as string | null,
      }
    }

    // GPS says outside — office-network presence can still prove the punch.
    if (ipMatchesOfficeList(clientIp, office.allowedIps)) {
      return {
        mode: 'IP',
        distance: Math.round(result.distance * 10) / 10,
        lat: null,
        lng: null,
        accuracy: null,
        flagged: false,
        flagReason: null,
        bypassNote: 'Office network verified (IP) — geofence not required',
      }
    }

    throw new ApiError(422, result.reason ?? 'Outside the office geofence', {
      distance: Math.round(result.distance),
      accuracy: Math.round(result.accuracy),
      radius: office.radiusMeters,
      ipAllowed: false,
    })
  }

  // No GPS fix — punch purely on office-network presence.
  if (ipMatchesOfficeList(clientIp, office.allowedIps)) {
    return {
      mode: 'IP',
      distance: null as number | null,
      lat: null,
      lng: null,
      accuracy: null,
      flagged: false,
      flagReason: null,
      bypassNote: 'Office network verified (IP) — geofence not required',
    }
  }

  throw new ApiError(422, 'GPS location required — allow location access for this site (or connect to the office Wi-Fi network configured by HR).', {
    ipAllowed: false,
  })
}

/** Flag suspicious punches (spec §6.2): accuracy exactly 0, identical coords 6+ decimals, impossible travel. */
async function suspiciousFlags(userId: string, lat: number, lng: number, accuracy: number): Promise<string[]> {
  const flags: string[] = []
  if (accuracy === 0) flags.push('GPS accuracy reported as exactly 0 m')

  const prev = await db.attendance.findFirst({
    where: { userId, checkInAt: { not: null }, date: { lt: todayISO() } },
    orderBy: { date: 'desc' },
  })
  const prevLat = prev?.checkInLat
  const prevLng = prev?.checkInLng
  if (prevLat != null && prevLng != null) {
    const sameSpot = lat.toFixed(6) === prevLat.toFixed(6) && lng.toFixed(6) === prevLng.toFixed(6)
    if (sameSpot) flags.push('Identical coordinates to 6 decimals as a previous day (possible spoofing)')

    if (prev?.checkInAt) {
      const days = Math.max(1, (Date.now() - prev.checkInAt.getTime()) / 86400000)
      const travelM = evaluateGeofence({ lat, lng, accuracy: 0, officeLat: prevLat, officeLng: prevLng, radiusMeters: 0, maxAccuracyMeters: 1e9 }).distance
      const speedKmh = (travelM / 1000) / (days * 24)
      if (speedKmh > 900) flags.push('Impossible travel speed since previous punch')
    }
  }
  return flags
}

/** Recompute break minutes, work minutes and day status after any change. Pass `client` to run inside a transaction. */
export async function recalcAttendance(
  attendanceId: string,
  shift?: { fullDayMinutes: number; halfDayMinutes: number; startTime: string; graceMinutes: number },
  client: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient,
) {
  const att = await client.attendance.findUnique({ where: { id: attendanceId }, include: { breaks: true, user: { include: { shift: true } } } })
  if (!att) return
  const sh = shift ?? shiftOf(att.user)

  const breakMinutes = att.breaks.reduce((sum, b) => sum + b.minutes, 0)
  let workMinutes = 0
  let status = att.status

  if (att.checkInAt && att.checkOutAt) {
    const gross = Math.floor((new Date(att.checkOutAt).getTime() - new Date(att.checkInAt).getTime()) / 60000)
    workMinutes = Math.max(0, gross - breakMinutes)
    const late = isLate(new Date(att.checkInAt), sh)
    status = computeDayStatus({ mode: att.checkOutMode ?? att.checkInMode, late, workMinutes, fullDay: sh.fullDayMinutes, halfDay: sh.halfDayMinutes })
  }

  await client.attendance.update({ where: { id: attendanceId }, data: { breakMinutes, workMinutes, status } })
}

/** Approved leave / WFH / OUTSIDE covering a date → { userId: type } */
export async function approvedCovering(userIds: string[], date: string): Promise<Map<string, string>> {
  const rows = await db.leaveRequest.findMany({
    where: {
      userId: { in: userIds },
      status: 'APPROVED',
      fromDate: { lte: date },
      toDate: { gte: date },
      type: { not: 'REGULARIZATION' },
    },
    orderBy: { createdAt: 'asc' },
  })
  const map = new Map<string, string>()
  const rank: Record<string, number> = { ON_LEAVE: 0, WFH: 1, OUTSIDE: 2 }
  for (const r of rows) {
    const t = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE'].includes(r.type) ? 'ON_LEAVE' : r.type === 'WFH' ? 'WFH' : 'OUTSIDE'
    if (!map.has(r.userId) || rank[t] < rank[map.get(r.userId) ?? 'OUTSIDE']) map.set(r.userId, t)
  }
  return map
}

/** Holidays for an office (or global) as a Set of YYYY-MM-DD. */
export async function holidaySet(officeId: string | null | undefined): Promise<Set<string>> {
  const rows = await db.holiday.findMany({
    where: { OR: [{ officeId: null }, ...(officeId ? [{ officeId }] : [])] },
  })
  return new Set(rows.map((h) => h.date))
}

/** Day classification for calendar/views: attendance status, else leave, holiday, weekly off.
 * Past working days with no record count as ABSENT; today/future days stay NOT_CHECKED_IN
 * (rendered as "—") because the day simply hasn't happened yet. */
export function classifyDay(opts: {
  date: string
  att: { status: string; date: string } | null | undefined
  leaveType?: string | null
  isHoliday: boolean
  today?: string
}): string {
  const { att, leaveType, isHoliday, date } = opts
  if (att && att.status !== 'NOT_CHECKED_IN') return att.status
  if (leaveType) return leaveType === 'WFH' ? 'WFH' : leaveType === 'OUTSIDE' ? 'OUTSIDE' : 'ON_LEAVE'
  if (isHoliday) return 'HOLIDAY'
  if (isSunday(date)) return 'WEEKLY_OFF'
  const today = opts.today ?? todayISO()
  if (date < today) return 'ABSENT'
  return 'NOT_CHECKED_IN'
}

/** Build a UTC instant for shift end on a given date (used by auto-close job). */
export function shiftEndInstant(date: string, endTime: string): Date {
  return istDateFromISOTime(date, endTime)
}

export { isSunday }
