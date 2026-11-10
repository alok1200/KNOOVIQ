/** Shared API types (mirror of server payloads). */

export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN'

export interface Me {
  user: {
    id: string
    employeeId: string
    name: string
    email: string
    role: Role
    department: string
    managerId: string | null
    managerName?: string | null
    officeId: string | null
    officeName?: string | null
    shiftId?: string | null
    shiftName?: string | null
    mustChangePassword: boolean
  }
}

export interface BreakRec {
  id: string
  start: string
  end: string | null
  minutes: number
}

export interface AttendanceToday {
  id: string
  userId: string
  date: string
  checkInAt: string | null
  checkInDistance: number | null
  checkInMode: string | null
  checkInAccuracy: number | null
  checkOutAt: string | null
  checkOutDistance: number | null
  checkOutMode: string | null
  checkOutAccuracy: number | null
  workMinutes: number
  breakMinutes: number
  status: string
  flagged: boolean
  flagReason: string | null
  autoClosed: boolean
  breaks: BreakRec[]
  openBreakSince: string | null
  currentBreakMinutes: number
}

export type AttState = 'NOT_CHECKED_IN' | 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT'

export interface TodayResponse {
  date: string
  state: AttState
  allowedActions: string[]
  attendance: AttendanceToday | null
  office: { id: string; name: string; lat: number; lng: number; radiusMeters: number; timezone: string; allowedIps: string } | null
  shift: { startTime: string; endTime: string; graceMinutes: number; fullDayMinutes: number; halfDayMinutes: number }
  statusNote: { status: string; note: string; expectedReturnAt: string | null; updatedAt: string } | null
  approvedModeToday: 'WFH' | 'OUTSIDE' | null
  maxAccuracyMeters: number
  isLateToday: boolean
}

export interface LeaveBalance {
  id: string
  year: number
  type: string
  quota: number
  used: number
}

export interface LeaveRequest {
  id: string
  userId: string
  type: string
  fromDate: string
  toDate: string
  halfDay: boolean
  reason: string
  status: string
  approverId: string | null
  managerComment: string | null
  daysCount: number
  regDate: string | null
  regInTime: string | null
  regOutTime: string | null
  createdAt: string
  decidedAt: string | null
  user?: { id: string; name: string; employeeId: string; department: string }
  approver?: { name: string } | null
}

export interface HistoryRow {
  id: string
  date: string
  checkInAt: string | null
  checkInMode: string | null
  checkOutAt: string | null
  checkOutMode: string | null
  workMinutes: number
  breakMinutes: number
  status: string
  flagged: boolean
  flagReason: string | null
  autoClosed: boolean
  breaks: BreakRec[]
}

export interface CalendarDay {
  date: string
  dow: number
  status: string
  workMinutes: number
  checkInAt: string | null
  checkOutAt: string | null
  flagged: boolean
  autoClosed: boolean
}

export interface CalendarResponse {
  month: string
  days: CalendarDay[]
  holidays: { date: string; name: string }[]
}

export interface TeamRow {
  id: string
  name: string
  employeeId: string
  department: string
  role: string
  isSelf: boolean
  status: string
  statusFromNote: boolean
  note: string
  expectedReturnAt: string | null
  updatedAt: string | null
  state: string
  checkInAt: string | null
}

export interface AppNotification {
  id: string
  type: string
  message: string
  readAt: string | null
  createdAt: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminUser {
  id: string
  employeeId: string
  name: string
  email: string
  role: string
  department: string
  managerId: string | null
  manager?: { name: string } | null
  officeId: string | null
  office?: { name: string } | null
  shiftId: string | null
  shift?: { name: string } | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
}

export interface Office {
  id: string
  name: string
  lat: number
  lng: number
  radiusMeters: number
  timezone: string
  allowedIps: string
  _count?: { users: number }
}

export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  graceMinutes: number
  fullDayMinutes: number
  halfDayMinutes: number
  _count?: { users: number }
}

export interface Holiday {
  id: string
  date: string
  name: string
  officeId: string | null
  office?: { name: string } | null
}

export interface AuditLogRow {
  id: string
  action: string
  entity: string
  entityId: string
  before: string | null
  after: string | null
  createdAt: string
  actor?: { name: string; employeeId: string } | null
}

export interface MonthlyRow {
  employeeId: string
  name: string
  date: string
  status: string
  checkIn: string
  checkOut: string
  workMinutes: number
  breakMinutes: number
  lateMinutes: number
  flagged: boolean
  autoClosed: boolean
  work: string
  break: string
}

export interface LateRow {
  employeeId: string
  name: string
  date: string
  checkIn: string
  lateMinutes: number
  status: string
  flagged: boolean
}

export interface LeaveBalanceRow {
  employeeId: string
  name: string
  clRemaining: number
  clQuota: number
  clUsed: number
  slRemaining: number
  slQuota: number
  slUsed: number
  elRemaining: number
  elQuota: number
  elUsed: number
  wfhRemaining: number
  wfhQuota: number
  wfhUsed: number
}
