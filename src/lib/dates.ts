/**
 * Date helpers — all "days" are office-local (IST) YYYY-MM-DD strings (spec §6.4),
 * instants are real Date objects. Never trust client dates/times.
 */
export const OFFICE_TZ = 'Asia/Kolkata'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Format a Date into office-local YYYY-MM-DD. */
export function isoOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function todayISO(): string {
  return isoOf(new Date())
}

export function currentMonth(): string {
  return todayISO().slice(0, 7)
}

export function istMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OFFICE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return (hh % 24) * 60 + mm
}

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

export function addDaysISO(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso)
  const t = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** 0 = Sunday … 6 = Saturday */
export function dowISO(iso: string): number {
  const { y, m, d } = parseISO(iso)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

export function isSunday(iso: string): boolean {
  return dowISO(iso) === 0
}

export function rangeISO(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  let guard = 0
  while (cur <= to && guard < 800) {
    out.push(cur)
    cur = addDaysISO(cur, 1)
    guard++
  }
  return out
}

export function monthRange(month: string): { from: string; to: string; days: string[] } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate()
  const days: string[] = []
  for (let d = 1; d <= last; d++) {
    days.push(`${month}-${String(d).padStart(2, '0')}`)
  }
  return { from: days[0], to: days[days.length - 1], days }
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const { y, m, d } = parseISO(s)
  const t = new Date(Date.UTC(y, m - 1, d, 12))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "2026-11-02" → "2 Nov 2026" (spec §9 problem 3: never show raw ISO) */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const { d, m, y } = parseISO(iso.slice(0, 10))
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "2026-11-02" → "2 Nov" */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const { d, m } = parseISO(iso.slice(0, 10))
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

/** "2026-11" → "November 2026" */
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** Date → "9:41 AM" in office timezone. */
export function fmtTime(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function fmtMinutes(mins: number | null | undefined): string {
  const m = Math.max(0, Math.round(mins ?? 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  return `${h}h ${r}m`
}

/** Build the UTC instant for an office-local wall time ("HH:mm" on ISO date). */
export function istDateFromISOTime(iso: string, hhmm: string): Date {
  const { y, m, d } = parseISO(iso)
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 330 * 60 * 1000)
}

/** Minutes since midnight for "HH:mm". */
export function hhmmToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number)
  return hh * 60 + mm
}

/** next month "2026-11" → "2026-12" */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Calendar grid (Mon-first) with leading/trailing days for a month view. */
export function monthGrid(month: string): { iso: string; inMonth: boolean }[] {
  const { days } = monthRange(month)
  const first = days[0]
  const lead = (dowISO(first) + 6) % 7 // Monday-first offset
  const cells: { iso: string; inMonth: boolean }[] = []
  for (let i = lead - 1; i >= 0; i--) cells.push({ iso: addDaysISO(first, -i), inMonth: false })
  for (const d of days) cells.push({ iso: d, inMonth: true })
  while (cells.length % 7 !== 0) cells.push({ iso: addDaysISO(cells[cells.length - 1].iso, 1), inMonth: false })
  return cells
}
