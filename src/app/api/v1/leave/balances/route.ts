import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth } from '@/lib/auth'

/** GET /api/v1/leave/balances?year= — remaining / quota per leave type (spec §6.4). */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year')) || Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()))
  const balances = await db.leaveBalance.findMany({ where: { userId: authed.id, year }, orderBy: { type: 'asc' } })
  return ok({ year, balances })
})
