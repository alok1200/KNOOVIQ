/**
 * Single source of truth for enum → friendly label + badge tone (spec §9 problem 4 & 6).
 * Shared by server responses and client rendering. No blue/indigo tones.
 */

export const ATT_STATE_LABEL: Record<string, string> = {
  NOT_CHECKED_IN: 'Not Checked In',
  WORKING: 'Working',
  ON_BREAK: 'On Break',
  CHECKED_OUT: 'Checked Out',
}

export const DAY_STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  HALF_DAY: 'Half Day',
  ABSENT: 'Absent',
  LATE: 'Late',
  ON_LEAVE: 'On Leave',
  WFH: 'Work From Home',
  OUTSIDE: 'Official Work (Outside)',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly Off',
  NOT_CHECKED_IN: '—',
}

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  CASUAL_LEAVE: 'Casual Leave',
  SICK_LEAVE: 'Sick Leave',
  EARNED_LEAVE: 'Earned Leave',
  WFH: 'Work From Home',
  OFFICIAL_WORK_OUTSIDE: 'Official Work (Outside)',
  REGULARIZATION: 'Regularization',
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

export const TEAM_STATUS_LABEL: Record<string, string> = {
  WORKING_IN_OFFICE: 'Working in Office',
  ON_BREAK: 'On Break',
  IN_MEETING: 'In Meeting',
  CLIENT_VISIT: 'Client Visit',
  WFH: 'WFH',
  OUT_OF_OFFICE: 'Out of Office',
  ON_LEAVE: 'On Leave',
  NOT_CHECKED_IN: 'Not Checked In',
}

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  CASUAL_LEAVE: 'Casual Leave (CL)',
  SICK_LEAVE: 'Sick Leave (SL)',
  EARNED_LEAVE: 'Earned Leave (EL)',
  WFH: 'Remote Work (WFH)',
}

export const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee',
  MANAGER: 'Manager',
  HR_ADMIN: 'HR Admin',
}

export const PUNCH_MODE_LABEL: Record<string, string> = {
  OFFICE: 'Office',
  IP: 'Office Network',
  WFH: 'WFH',
  OUTSIDE: 'Outside',
}

/** Consistent badge tone per status — one vocabulary across dashboard, tables and team strip. */
export function statusTone(status: string | null | undefined): string {
  switch (status) {
    case 'PRESENT':
    case 'APPROVED':
    case 'WORKING':
    case 'WORKING_IN_OFFICE':
    case 'WFH':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'LATE':
    case 'HALF_DAY':
    case 'PENDING':
    case 'ON_BREAK':
    case 'IN_MEETING':
    case 'CLIENT_VISIT':
    case 'OUTSIDE':
    case 'OUT_OF_OFFICE':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'ABSENT':
    case 'REJECTED':
    case 'CHECKED_OUT':
      return 'bg-rose-100 text-rose-800 border-rose-200'
    case 'CANCELLED':
    case 'ON_LEAVE':
      return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}
