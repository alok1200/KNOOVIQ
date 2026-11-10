import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth } from '@/lib/auth'

const TEAM_STATUSES = ['WORKING_IN_OFFICE', 'ON_BREAK', 'IN_MEETING', 'CLIENT_VISIT', 'WFH', 'OUT_OF_OFFICE', 'ON_LEAVE', 'NOT_CHECKED_IN'] as const

const noteSchema = z.object({
  status: z.enum(TEAM_STATUSES),
  note: z.string().max(120, 'Note must be 120 characters or fewer').default(''),
  expectedReturnAt: z.string().datetime({ offset: true }).nullable().optional(),
})

/** PUT /api/v1/team/status/me — set my status + short note (max 120 chars) + expected return (spec §6.5). */
export const PUT = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  const body = await req.json().catch(() => ({}))
  const { status, note, expectedReturnAt } = noteSchema.parse(body)

  const data = {
    status,
    note,
    expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
  }
  const saved = await db.statusNote.upsert({
    where: { userId: authed.id },
    create: { userId: authed.id, ...data },
    update: data,
  })
  return ok(saved)
})
