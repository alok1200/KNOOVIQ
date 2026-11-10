import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth, requireRole } from '@/lib/auth'
import { exportResponse } from '@/lib/report-export'

/**
 * GET /api/v1/reports/leave-balance?year=YYYY&format=json|csv|xlsx
 * Per-user leave quota / used / remaining for every type.
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN', 'MANAGER')
  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year')) || Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()))
  const format = url.searchParams.get('format') ?? 'json'

  const users =
    authed.role === 'HR_ADMIN'
      ? await db.user.findMany({ where: { isActive: true }, orderBy: { employeeId: 'asc' } })
      : await db.user.findMany({ where: { isActive: true, OR: [{ id: authed.id }, { managerId: authed.id }] }, orderBy: { employeeId: 'asc' } })
  const ids = users.map((u) => u.id)

  const balances = await db.leaveBalance.findMany({ where: { userId: { in: ids }, year } })
  const byUser = new Map<string, Map<string, { quota: number; used: number }>>()
  for (const b of balances) {
    if (!byUser.has(b.userId)) byUser.set(b.userId, new Map())
    byUser.get(b.userId)!.set(b.type, { quota: b.quota, used: b.used })
  }

  const rows = users.map((u) => {
    const m = byUser.get(u.id)
    const get = (t: string) => m?.get(t) ?? { quota: 0, used: 0 }
    const cl = get('CASUAL_LEAVE')
    const sl = get('SICK_LEAVE')
    const el = get('EARNED_LEAVE')
    const wfh = get('WFH')
    return {
      employeeId: u.employeeId,
      name: u.name,
      clRemaining: Math.max(0, cl.quota - cl.used), clQuota: cl.quota, clUsed: cl.used,
      slRemaining: Math.max(0, sl.quota - sl.used), slQuota: sl.quota, slUsed: sl.used,
      elRemaining: Math.max(0, el.quota - el.used), elQuota: el.quota, elUsed: el.used,
      wfhRemaining: Math.max(0, wfh.quota - wfh.used), wfhQuota: wfh.quota, wfhUsed: wfh.used,
    }
  })

  if (format === 'csv' || format === 'xlsx') {
    return exportResponse({
      filename: `knooviq-leave-balance-${year}`,
      format,
      title: `Leave Balance ${year}`,
      headers: ['Employee ID', 'Name', 'CL Remaining', 'CL Used', 'SL Remaining', 'SL Used', 'EL Remaining', 'EL Used', 'WFH Remaining', 'WFH Used'],
      rows: rows.map((r) => [r.employeeId, r.name, r.clRemaining, r.clUsed, r.slRemaining, r.slUsed, r.elRemaining, r.elUsed, r.wfhRemaining, r.wfhUsed]),
    })
  }
  return ok({ year, rows })
})
