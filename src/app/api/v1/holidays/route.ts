import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'
import { isValidISODate, todayISO } from '@/lib/dates'

/** GET /api/v1/holidays?year= */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const url = new URL(req.url)
  const year = url.searchParams.get('year') ?? todayISO().slice(0, 4)
  const holidays = await db.holiday.findMany({
    where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
    orderBy: { date: 'asc' },
    include: { office: { select: { name: true } } },
  })
  return ok({ items: holidays })
})

const holidaySchema = z.object({
  date: z.string().refine((v) => isValidISODate(v), 'Use YYYY-MM-DD'),
  name: z.string().min(2),
  officeId: z.string().nullable().optional(),
})

/** POST /api/v1/holidays */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const body = await req.json().catch(() => ({}))
  const input = holidaySchema.parse(body)
  const dup = await db.holiday.findFirst({ where: { date: input.date, officeId: input.officeId ?? null } })
  if (dup) throw new ApiError(409, `Holiday already exists on ${input.date}`)
  const holiday = await db.holiday.create({ data: { date: input.date, name: input.name, officeId: input.officeId ?? null } })
  await audit(authed.id, 'HOLIDAY_CREATED', 'Holiday', holiday.id, null, holiday)
  return ok(holiday, { status: 201 })
})
