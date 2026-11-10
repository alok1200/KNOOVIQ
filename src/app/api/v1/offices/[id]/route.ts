import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole } from '@/lib/auth'
import { audit } from '@/lib/notify'
import { normalizeIp } from '@/lib/geo'

/** Comma-separated IPs / IPv4 CIDRs / wildcards (shared shape with POST /offices). */
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

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(10).max(5000).optional(),
  timezone: z.string().optional(),
  allowedIps: allowedIpsSchema.optional(),
})

/** PATCH /api/v1/offices/:id */
export const PATCH = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const input = updateSchema.parse(body)
  const before = await db.office.findUnique({ where: { id } })
  if (!before) throw new ApiError(404, 'Office not found')
  const after = await db.office.update({ where: { id }, data: input })
  await audit(authed.id, 'OFFICE_UPDATED', 'Office', id, before, after)
  return ok(after)
})

/** DELETE /api/v1/offices/:id — blocked while users are assigned. */
export const DELETE = handleRoute(async (req, ctx) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const { id } = await ctx.params
  const count = await db.user.count({ where: { officeId: id } })
  if (count > 0) throw new ApiError(409, `Cannot delete: ${count} user(s) are assigned to this office`)
  await db.office.delete({ where: { id } })
  await audit(authed.id, 'OFFICE_DELETED', 'Office', id)
  return ok({ deleted: true })
})
