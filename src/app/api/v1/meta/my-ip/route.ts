import { handleRoute, ok } from '@/lib/api'
import { clientIp, requireAuth } from '@/lib/auth'

/**
 * GET /api/v1/meta/my-ip — the public IP the server sees for this client.
 * HR uses it in Admin → Offices to register the office network IP ("Detect
 * my current IP"); the dashboard uses it to show the "on office network"
 * badge and enable IP-based punches.
 */
export const GET = handleRoute(async (req) => {
  await requireAuth(req)
  const ip = clientIp(req)
  return ok({ ip, known: ip !== 'unknown' })
})
