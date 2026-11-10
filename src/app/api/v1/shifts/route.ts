import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'

/** GET /api/v1/shifts */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const shifts = await db.shift.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } })
  return ok({ items: shifts })
})

const shiftSchema = z.object({
  name: z.string().min(2),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm'),
  graceMinutes: z.number().int().min(0).max(240).default(15),
  fullDayMinutes: z.number().int().min(60).max(960).default(480),
  halfDayMinutes: z.number().int().min(30).max(480).default(240),
})

/** POST /api/v1/shifts */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const body = await req.json().catch(() => ({}))
  const input = shiftSchema.parse(body)
  const shift = await db.shift.create({ data: input })
  await audit(authed.id, 'SHIFT_CREATED', 'Shift', shift.id, null, shift)
  return ok(shift, { status: 201 })
})
