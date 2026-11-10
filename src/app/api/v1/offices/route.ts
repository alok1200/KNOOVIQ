import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'
import { normalizeIp } from '@/lib/geo'

/** GET /api/v1/offices */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const offices = await db.office.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } })
  return ok({ items: offices })
})

/** Comma-separated IPs / IPv4 CIDRs / wildcards (e.g. "103.25.128.7, 182.71.0.0/16"). */
const allowedIpsSchema = z
  .string()
  .max(2000)
  .transform((v) =>
    v
      .split(',')
      .map((e) => normalizeIp(e))
      .filter(Boolean)
      .slice(0, 50)
      .join(', '),
  )
  .refine(
    (v) =>
      v
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .every((e) => /^(\d{1,3}(\.\d{1,3}){3}|\d{1,3}(\.\d{1,3}){3}\/\d{1,2}|(\d{1,3}|\*)(\.\d{1,3}|\.\*){3}|[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){1,7})$/.test(e)),
    'allowedIps must be comma-separated IPv4 addresses, CIDR ranges (10.0.0.0/16) or wildcards (10.0.*.*)',
  )

const officeSchema = z.object({
  name: z.string().min(2),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(5000).default(25),
  timezone: z.string().default('Asia/Kolkata'),
  allowedIps: allowedIpsSchema.default(''),
})

/** POST /api/v1/offices */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const body = await req.json().catch(() => ({}))
  const input = officeSchema.parse(body)
  const office = await db.office.create({ data: input })
  await audit(authed.id, 'OFFICE_CREATED', 'Office', office.id, null, office)
  return ok(office, { status: 201 })
})
