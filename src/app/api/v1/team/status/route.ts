import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth } from '@/lib/auth'
import { deriveState, getAttendance } from '@/lib/attendance-service'
import { todayISO } from '@/lib/dates'

/**
 * GET /api/v1/team/status — teammates' live status (spec §6.5).
 * Employees: peers with the same manager + that manager.
 * Managers: their direct reports (+ self). HR: everyone.
 * Privacy (spec §6.6): never raw coordinates — only status, note, expected return.
 */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)

  let users: { id: string; name: string; employeeId: string; department: string; role: string }[] = []
  if (authed.role === 'HR_ADMIN') {
    users = await db.user.findMany({ where: { isActive: true }, select: { id: true, name: true, employeeId: true, department: true, role: true }, orderBy: { name: 'asc' } })
  } else if (authed.role === 'MANAGER') {
    users = await db.user.findMany({
      where: { isActive: true, OR: [{ id: authed.id }, { managerId: authed.id }] },
      select: { id: true, name: true, employeeId: true, department: true, role: true },
      orderBy: { name: 'asc' },
    })
  } else {
    users = await db.user.findMany({
      where: { isActive: true, OR: [{ id: authed.id }, { managerId: authed.managerId ?? 'none' }, ...(authed.managerId ? [{ id: authed.managerId }] : [])] },
      select: { id: true, name: true, employeeId: true, department: true, role: true },
      orderBy: { name: 'asc' },
    })
  }

  const date = todayISO()
  const ids = users.map((u) => u.id)
  const [notes, attendances] = await Promise.all([
    db.statusNote.findMany({ where: { userId: { in: ids } } }),
    db.attendance.findMany({ where: { userId: { in: ids }, date }, include: { breaks: true } }),
  ])
  const noteMap = new Map(notes.map((n) => [n.userId, n]))
  const attMap = new Map(attendances.map((a) => [a.userId, a]))

  const rows = users.map((u) => {
    const att = attMap.get(u.id)
    const note = noteMap.get(u.id)
    const state = deriveState(att as never)
    const attStatus = note?.status && note.updatedAt.toDateString() === new Date().toDateString() ? note.status : null
    return {
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      department: u.department,
      role: u.role,
      isSelf: u.id === authed.id,
      status: attStatus ?? (state === 'WORKING' ? 'WORKING_IN_OFFICE' : state === 'ON_BREAK' ? 'ON_BREAK' : state === 'CHECKED_OUT' ? 'OUT_OF_OFFICE' : 'NOT_CHECKED_IN'),
      statusFromNote: Boolean(attStatus),
      note: note?.note ?? '',
      expectedReturnAt: note?.expectedReturnAt ?? null,
      updatedAt: note?.updatedAt ?? null,
      state,
      checkInAt: att?.checkInAt ?? null,
    }
  })

  return ok({ rows, privacyNote: 'Location is checked only during Check In / Check Out. Teammates never see your coordinates.' })
})
