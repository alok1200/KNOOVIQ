import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, handleRoute, ok, getPagination, paginated } from '@/lib/api'
import { assertSameOrigin, requireAuth, requireRole, hashPassword } from '@/lib/auth'
import { audit } from '@/lib/notify'
import { getBalances } from '@/lib/leave-service'

/** GET /api/v1/users?search=&page= — HR user directory. */
export const GET = handleRoute(async (req) => {
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const url = new URL(req.url)
  const { page, pageSize, skip, take } = getPagination(url)
  const search = url.searchParams.get('search')?.trim()
  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { email: { contains: search.toLowerCase() } },
          { employeeId: { contains: search.toUpperCase() } },
        ],
      }
    : {}
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { employeeId: 'asc' },
      skip,
      take,
      select: {
        id: true, employeeId: true, name: true, email: true, role: true, department: true,
        managerId: true, manager: { select: { name: true } }, officeId: true, office: { select: { name: true } },
        shiftId: true, shift: { select: { name: true } }, isActive: true, mustChangePassword: true, createdAt: true,
      },
    }),
    db.user.count({ where }),
  ])
  return ok(paginated(items, total, page, pageSize))
})

const createSchema = z.object({
  employeeId: z.string().min(2).max(20),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'HR_ADMIN']).default('EMPLOYEE'),
  department: z.string().default('General'),
  managerId: z.string().nullable().optional(),
  officeId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
})

/** POST /api/v1/users — create user (mustChangePassword on first login, spec §5). */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const authed = await requireAuth(req)
  requireRole(authed, 'HR_ADMIN')
  const body = await req.json().catch(() => ({}))
  const input = createSchema.parse(body)

  const dup = await db.user.findFirst({ where: { OR: [{ employeeId: input.employeeId }, { email: input.email.toLowerCase() }] } })
  if (dup) throw new ApiError(409, `Employee ID or email already exists (${dup.employeeId})`)

  const user = await db.user.create({
    data: {
      employeeId: input.employeeId.toUpperCase(),
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      department: input.department,
      managerId: input.managerId || null,
      officeId: input.officeId || null,
      shiftId: input.shiftId || null,
      mustChangePassword: true,
    },
  })

  // default balances for the current year
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()))
  await getBalances(user.id, year)
  await db.statusNote.create({ data: { userId: user.id, status: 'NOT_CHECKED_IN' } }).catch(() => {})

  await audit(authed.id, 'USER_CREATED', 'User', user.id, null, { employeeId: user.employeeId, role: user.role })
  return ok({ id: user.id, employeeId: user.employeeId }, { status: 201 })
})
