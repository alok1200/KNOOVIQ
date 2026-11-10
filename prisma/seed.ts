/**
 * KNOOVIQ seed script — creates demo data (spec §12.2):
 * 1 HR admin, 1 manager, 3 employees, 1 office, default shift, holidays,
 * current-year leave balances and blank status notes.
 *
 * Run: bun run db:seed   (idempotent — skips if users already exist)
 * Also invoked automatically on server start via instrumentation.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { resolveDatabaseUrl } from '../src/lib/db-url'

const prisma = new PrismaClient({
  datasourceUrl: resolveDatabaseUrl(),
  log: ['error'],
})

export const DEMO_LOGINS = [
  { role: 'HR Admin', employeeId: 'KN001', email: 'priya@knooviq.com', password: 'Admin@123' },
  { role: 'Manager', employeeId: 'KN002', email: 'rahul@knooviq.com', password: 'Manager@123' },
  { role: 'Employee', employeeId: 'KN003', email: 'anita@knooviq.com', password: 'Employee@123' },
  { role: 'Employee', employeeId: 'KN004', email: 'karan@knooviq.com', password: 'Employee@123' },
  { role: 'Employee', employeeId: 'KN005', email: 'sneha@knooviq.com', password: 'Employee@123' },
]

function istYear(): number {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()) | 0
}

export async function ensureSeeded(): Promise<{ seeded: boolean }> {
  const existing = await prisma.user.count()
  if (existing > 0) return { seeded: false }

  const year = istYear()

  const office = await prisma.office.create({
    data: {
      name: 'KNOOVIQ HQ — Bengaluru',
      lat: 12.971599,
      lng: 77.594566,
      radiusMeters: 25,
      timezone: 'Asia/Kolkata',
      // Demo default: any IPv4 network counts as "office network" so every
      // employee can punch without GPS. For production, replace with the
      // office's real public IP(s), e.g. "103.25.128.7, 182.71.0.0/16"
      // (Admin → Offices → Edit → Office network IPs → "Detect my current IP").
      allowedIps: '::1, *.*.*.*',
    },
  })

  const shift = await prisma.shift.create({
    data: {
      name: 'General Shift (9:00 – 18:00)',
      startTime: '09:00',
      endTime: '18:00',
      graceMinutes: 15,
      fullDayMinutes: 480,
      halfDayMinutes: 240,
    },
  })

  const hash = (p: string) => bcrypt.hashSync(p, 12)

  const admin = await prisma.user.create({
    data: {
      employeeId: 'KN001',
      name: 'Priya Sharma',
      email: 'priya@knooviq.com',
      passwordHash: hash('Admin@123'),
      role: 'HR_ADMIN',
      department: 'Human Resources',
      officeId: office.id,
      shiftId: shift.id,
    },
  })

  const manager = await prisma.user.create({
    data: {
      employeeId: 'KN002',
      name: 'Rahul Verma',
      email: 'rahul@knooviq.com',
      passwordHash: hash('Manager@123'),
      role: 'MANAGER',
      department: 'Engineering',
      officeId: office.id,
      shiftId: shift.id,
    },
  })

  const employees = await Promise.all([
    prisma.user.create({
      data: {
        employeeId: 'KN003',
        name: 'Anita Desai',
        email: 'anita@knooviq.com',
        passwordHash: hash('Employee@123'),
        role: 'EMPLOYEE',
        department: 'Engineering',
        managerId: manager.id,
        officeId: office.id,
        shiftId: shift.id,
      },
    }),
    prisma.user.create({
      data: {
        employeeId: 'KN004',
        name: 'Karan Mehta',
        email: 'karan@knooviq.com',
        passwordHash: hash('Employee@123'),
        role: 'EMPLOYEE',
        department: 'Engineering',
        managerId: manager.id,
        officeId: office.id,
        shiftId: shift.id,
      },
    }),
    prisma.user.create({
      data: {
        employeeId: 'KN005',
        name: 'Sneha Iyer',
        email: 'sneha@knooviq.com',
        passwordHash: hash('Employee@123'),
        role: 'EMPLOYEE',
        department: 'Design',
        managerId: manager.id,
        officeId: office.id,
        shiftId: shift.id,
      },
    }),
  ])

  const holidays = [
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: `${year}-03-14`, name: 'Holi' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
    { date: `${year}-10-21`, name: 'Diwali' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ]
  await Promise.all(holidays.map((h) => prisma.holiday.create({ data: { ...h, officeId: office.id } })))

  const quotas = [
    { type: 'CASUAL_LEAVE', quota: 12 },
    { type: 'SICK_LEAVE', quota: 10 },
    { type: 'EARNED_LEAVE', quota: 15 },
    { type: 'WFH', quota: 24 },
  ]
  const all = [admin, manager, ...employees]
  await Promise.all(
    all.flatMap((u) =>
      quotas.map((q) => prisma.leaveBalance.create({ data: { userId: u.id, year, type: q.type, quota: q.quota, used: 0 } })),
    ),
  )

  await Promise.all(
    all.map((u) => prisma.statusNote.create({ data: { userId: u.id, status: 'NOT_CHECKED_IN', note: '' } })),
  )

  return { seeded: true }
}

async function main() {
  const { seeded } = await ensureSeeded()
  console.log(seeded ? '✅ Seed complete — demo users, office, shift, holidays, balances created.' : 'ℹ️  Database already seeded, skipping.')
}

if (process.argv[1] && process.argv[1].includes('seed')) {
  main()
    .catch((e) => {
      console.error('Seed failed:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
