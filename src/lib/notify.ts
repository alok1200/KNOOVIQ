/**
 * Notifications + audit trail helpers (spec §7: Notification, AuditLog).
 * SERVER ONLY.
 */
import { db } from './db'

export async function notify(userId: string, type: string, message: string) {
  await db.notification.create({ data: { userId, type, message } }).catch(() => {})
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) {
  await db.auditLog
    .create({
      data: {
        actorId,
        action,
        entity,
        entityId,
         
        before: before === undefined ? null : JSON.stringify(anySafe(before)),
         
        after: after === undefined ? null : JSON.stringify(anySafe(after)),
      },
    })
    .catch(() => {})
}

 
function anySafe(v: any) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (val instanceof Date) out[k] = val.toISOString()
      else out[k] = val
    }
    return out
  }
  return v
}
