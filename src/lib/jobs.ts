/**
 * Scheduled jobs (spec §10) — run by the built-in scheduler (instrumentation.ts),
 * every 60 s. Equivalent to the node-cron schedule in the spec:
 *  - every minute: reset expired status notes
 *  - end of day:   auto-close forgotten check-outs
 *  - after shift:  mark absent employees (skips holidays, Sundays, approved leave)
 *  - yearly:       leave balance reset for the new year (no carry-forward by default)
 * SERVER ONLY.
 */
import { db } from './db'
import { todayISO, addDaysISO, istMinutesOfDay } from './dates'
import { recalcAttendance, shiftOf, shiftEndInstant, approvedCovering, holidaySet, isSunday } from './attendance-service'
import { notify } from './notify'

let started = false
let running = false

export function startScheduler() {
  if (started) return
  started = true
   
  console.log('[jobs] scheduler started (interval: 60s)')
  setTimeout(() => void runAll(), 3000)
  setInterval(() => void runAll(), 60_000)
}

async function runAll() {
  if (running) return
  running = true
  try {
    await resetExpiredNotes()
    await autoCloseCheckouts()
    await markAbsent()
    await ensureYearBalances()
  } catch (e) {
     
    console.error('[jobs] cycle failed:', e)
  } finally {
    running = false
  }
}

/** Reset status notes whose expected return time has passed (spec §6.5). */
export async function resetExpiredNotes() {
  const expired = await db.statusNote.findMany({
    where: { expectedReturnAt: { not: null, lt: new Date() } },
  })
  for (const note of expired) {
    const date = todayISO()
    const att = await db.attendance.findUnique({ where: { userId_date: { userId: note.userId, date } } })
    const nextStatus = att && att.checkInAt && !att.checkOutAt ? 'WORKING_IN_OFFICE' : 'NOT_CHECKED_IN'
    await db.statusNote.update({
      where: { id: note.id },
      data: { status: nextStatus, note: '', expectedReturnAt: null },
    })
  }
}

/** Auto-close forgotten check-outs (spec §6.3/§10): mark autoClosed, needs regularization. */
export async function autoCloseCheckouts() {
  const today = todayISO()
  const stale = await db.attendance.findMany({
    where: { checkInAt: { not: null }, checkOutAt: null, date: { lt: today } },
    include: { user: { include: { shift: true } } },
  })
  for (const att of stale) {
    const shift = shiftOf(att.user)
    const checkOutAt = shiftEndInstant(att.date, shift.endTime)
    await db.attendance.update({
      where: { id: att.id },
      data: { checkOutAt: checkOutAt < att.checkInAt! ? new Date(att.checkInAt!.getTime() + 60_000) : checkOutAt, autoClosed: true, checkOutMode: att.checkInMode },
    })
    await recalcAttendance(att.id)
    await notify(att.userId, 'AUTO_CLOSED', `You were auto checked-out on ${att.date} (forgot to check out). Please apply for Regularization if this is incorrect.`)
     
    console.log(`[jobs] auto-closed attendance ${att.id} for user ${att.userId} on ${att.date}`)
  }
}

/** Mark absentees after shift end, excluding holidays, Sundays and approved leave (spec §6.3/§10). */
export async function markAbsent() {
  const nowMin = istMinutesOfDay(new Date())
  if (nowMin < 19 * 60 + 30) return // after 19:30 IST
  const date = todayISO()
  if (isSunday(date)) return
  const holidays = await holidaySet(null)
  if (holidays.has(date)) return

  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } })
  const ids = users.map((u) => u.id)
  const leaves = await approvedCovering(ids, date)
  const existing = await db.attendance.findMany({ where: { date, userId: { in: ids } }, select: { userId: true } })
  const have = new Set(existing.map((e) => e.userId))

  for (const u of users) {
    if (have.has(u.id)) continue
    if (leaves.has(u.id)) continue
    await db.attendance.create({ data: { userId: u.id, date, status: 'ABSENT' } })
  }
}

/** Yearly leave reset: create fresh balances when a new year starts (spec §6.4/§10). */
export async function ensureYearBalances() {
  const year = Number(todayISO().slice(0, 4))
  const count = await db.leaveBalance.count({ where: { year } })
  if (count > 0) return
  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } })
  const defaults = [
    { type: 'CASUAL_LEAVE', quota: 12 },
    { type: 'SICK_LEAVE', quota: 10 },
    { type: 'EARNED_LEAVE', quota: 15 },
    { type: 'WFH', quota: 24 },
  ]
  for (const u of users) {
    await db.leaveBalance.createMany({
      data: defaults.map((d) => ({ userId: u.id, year, type: d.type, quota: d.quota, used: 0 })),
    })
  }
   
  console.log(`[jobs] yearly leave balances created for ${year} (${users.length} users)`)
}
