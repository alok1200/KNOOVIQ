import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'

const policySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  quotas: z
    .array(
      z.object({
        type: z.enum(['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH']),
        quota: z.number().min(0).max(365),
      }),
    )
    .min(1),
})

/** GET /api/v1/leave/policy?year= — any authenticated user can read the quotas. */
export const GET = handleRoute(async (req) => {
  await requireAuth(req)
  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
  const rows = await db.leaveBalance.findMany({
    where: { type: { in: ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH'] }, ...(url.searchParams.get('year') ? { year } : {}) },
    select: { type: true, quota: true },
    distinct: ['type'],
  })
  // Fall back to defaults if nothing configured yet for the requested year
  const defaults: Record<string, number> = { CASUAL_LEAVE: 12, SICK_LEAVE: 10, EARNED_LEAVE: 15, WFH: 24 }
  const quotas = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH'].map((type) => ({
    type,
    quota: rows.find((r) => r.type === type)?.quota ?? defaults[type],
  }))
  return ok({ year: url.searchParams.get('year') ? year : new Date().getFullYear(), quotas })
})

/** PUT /api/v1/leave/policy — HR updates yearly quotas for all active users (spec §8). */
export const PUT = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const body = await req.json().catch(() => ({}))
  const { year, quotas } = policySchema.parse(body)

  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } })
  let updated = 0
  for (const u of users) {
    for (const q of quotas) {
      await db.leaveBalance.upsert({
        where: { userId_year_type: { userId: u.id, year, type: q.type } },
        create: { userId: u.id, year, type: q.type, quota: q.quota, used: 0 },
        update: { quota: q.quota },
      })
      updated++
    }
  }
  await audit(authed.id, 'LEAVE_POLICY_UPDATED', 'LeavePolicy', String(year), null, quotas)
  return ok({ year, updated, users: users.length })
})
