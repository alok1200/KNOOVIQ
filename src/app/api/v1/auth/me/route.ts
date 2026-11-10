import { db } from '@/lib/db'
import { handleRoute, ok } from '@/lib/api'
import { requireAuth } from '@/lib/auth'

/** GET /api/v1/auth/me */
export const GET = handleRoute(async (req) => {
  const user = await requireAuth(req)
  const full = await db.user.findUnique({
    where: { id: user.id },
    include: { office: { select: { id: true, name: true } }, shift: { select: { id: true, name: true } }, manager: { select: { id: true, name: true } } },
  })
  if (!full) throw new Error('User not found')
  return ok({
    user: {
      id: full.id, employeeId: full.employeeId, name: full.name, email: full.email,
      role: full.role, department: full.department, managerId: full.managerId,
      managerName: full.manager?.name ?? null,
      officeId: full.officeId, officeName: full.office?.name ?? null,
      shiftId: full.shiftId, shiftName: full.shift?.name ?? null,
      mustChangePassword: full.mustChangePassword,
    },
  })
})
