import { handleRoute } from '@/lib/api'
import { requireAuth } from '@/lib/auth'
import { todayPayload } from './payload'

/** GET /api/v1/attendance/today — state machine source of truth for the UI (spec §6.1). */
export const GET = handleRoute(async (req) => {
  const user = await requireAuth(req)
  return todayPayload(user.id)
})
