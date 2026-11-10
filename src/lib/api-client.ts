/**
 * Typed API client — all requests are relative (same-origin).
 *
 * Two parallel auth channels so the app works everywhere:
 *  1. httpOnly cookies (primary) — set by the server on login/refresh.
 *  2. Authorization: Bearer header (fallback) — the sandbox preview can embed the
 *     app in a cross-site iframe where browsers block SameSite cookies entirely
 *     (third-party cookie blocking). In that mode login returns 200 but cookies
 *     are never stored, so every later request would 401. To survive that, the
 *     login/refresh responses also carry the tokens in the body; we persist them
 *     in localStorage and echo them via the Authorization header on every call.
 *
 * Tokens are read from localStorage on EVERY request (never cached in a module
 * variable), so multi-tab rotation stays consistent: whichever tab rotates last
 * writes the newest pair and all other tabs pick it up on their next call.
 *
 * On a 401 (expired access token) it silently calls /auth/refresh once and
 * retries the original request. A proactive refresh renews the access token
 * every ~10 min while the user is active, so it rarely expires mid-session.
 */
import type {
  Me, TodayResponse, LeaveBalance, LeaveRequest, Paged, HistoryRow, CalendarResponse,
  TeamRow, AppNotification, AdminUser, Office, Shift, Holiday, AuditLogRow,
  MonthlyRow, LateRow, LeaveBalanceRow, AttState,
} from '@/types/api'

export class ApiClientError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

/* --------------------------------- token store -------------------------------- */

const TOKEN_KEY = 'knooviq.auth'

interface StoredTokens {
  accessToken: string | null
  refreshToken: string | null
}

function readTokens(): StoredTokens {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null }
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY)
    if (!raw) return { accessToken: null, refreshToken: null }
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
    }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

function writeTokens(tokens: StoredTokens) {
  if (typeof window === 'undefined') return
  try {
    if (tokens.accessToken || tokens.refreshToken) {
      window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* storage unavailable (private mode) — cookie channel still works */
  }
}

function clearTokens() {
  writeTokens({ accessToken: null, refreshToken: null })
}

function persistFromAuthBody(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const { accessToken, refreshToken } = data as { accessToken?: unknown; refreshToken?: unknown }
  if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
    writeTokens({ accessToken, refreshToken })
  }
}

/* ---------------------------------- refresh ----------------------------------- */

let refreshing: Promise<boolean> | null = null
let lastAuthedAt = 0
let lastRefreshedAt = 0

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    lastRefreshedAt = Date.now()
    const { refreshToken } = readTokens()
    refreshing = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: refreshToken ? { authorization: `Bearer ${refreshToken}` } : undefined,
    })
      .then(async (r) => {
        if (r.ok) {
          const json = (await r.json().catch(() => null)) as { data?: unknown } | null
          if (json?.data) persistFromAuthBody(json.data)
          return true
        }
        // Definitive failures (reuse detected / invalid session) — drop the stale
        // fallback tokens so they can't shadow a fresh cookie session later.
        if (r.status === 401) clearTokens()
        return false
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 100)
      })
  }
  return refreshing
}

/* Proactive refresh: renew the access token every ~10 min while the user is
 * active, so it rarely expires mid-session (prevents 401 bursts entirely).
 * Stopped by a browser timer only when the tab is alive; harmless when signed
 * out (refresh returns 401 and nothing changes). */
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    const authedRecently = Date.now() - lastAuthedAt < 30 * 60_000
    const due = Date.now() - lastRefreshedAt > 10 * 60_000
    if (authedRecently && due) void tryRefresh()
  }, 60_000)
}

/* ---------------------------------- requests ---------------------------------- */

/** fetch() RequestInit with a JSON-serializable `body` and our retry flag. */
type RequestInitEx = Omit<RequestInit, 'body'> & { body?: unknown; retry?: boolean }

async function request<T>(path: string, init?: RequestInitEx): Promise<T> {
  const { body, retry = true, ...rest } = init ?? {}
  const { accessToken } = readTokens()
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(rest.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })

  if (res.ok) lastAuthedAt = Date.now()

  if (res.status === 401 && retry && !path.startsWith('/api/v1/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, { ...init, retry: false })
  }

  let json: { success?: boolean; data?: T; error?: { message?: string; details?: unknown } } | null = null
  try {
    json = await res.json()
  } catch {
    throw new ApiClientError(`Request failed (${res.status})`, res.status)
  }

  // Persist rotated/issued tokens from auth responses (cookie-blocked contexts).
  if (json?.data) {
    const p = json.data as { accessToken?: unknown; refreshToken?: unknown }
    if (typeof p.accessToken === 'string' && typeof p.refreshToken === 'string') {
      persistFromAuthBody(json.data)
    }
  }

  if (!res.ok || !json?.success) {
    throw new ApiClientError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.details)
  }

  const data = json.data as T & { accessToken?: string; refreshToken?: string; user?: unknown }
  // Strip transport-only token fields so callers see the clean Me shape.
  if (data && typeof data === 'object' && 'user' in data && 'accessToken' in data) {
    const { accessToken: _a, refreshToken: _r, ...clean } = data
    void _a
    void _r
    return clean as T
  }
  return json.data as T
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export interface NewRequestInput {
  type: string
  fromDate?: string
  toDate?: string
  halfDay?: boolean
  reason: string
  regDate?: string
  regInTime?: string
  regOutTime?: string
}

export const api = {
  /* ---------------------------------- auth ---------------------------------- */
  login: (identifier: string, password: string) => request<Me>('/api/v1/auth/login', { body: { identifier, password } }),
  logout: () =>
    request<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST' }).finally(() => {
      clearTokens()
    }),
  me: () => request<Me>('/api/v1/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean; reloginRequired: boolean }>('/api/v1/auth/change-password', { body: { currentPassword, newPassword } }),

  /* -------------------------------- attendance ------------------------------- */
  attendanceToday: () => request<TodayResponse>('/api/v1/attendance/today'),
  // GPS is optional: when HR registered the office network IP, a punch from the
  // office network is accepted without coordinates (server verifies the IP).
  checkIn: (gps?: { lat: number; lng: number; accuracy: number }) =>
    request<TodayResponse>('/api/v1/attendance/check-in', { body: gps ?? {} }),
  checkOut: (gps?: { lat: number; lng: number; accuracy: number }) =>
    request<TodayResponse>('/api/v1/attendance/check-out', { body: gps ?? {} }),
  breakStart: () => request<TodayResponse>('/api/v1/attendance/break/start', { method: 'POST' }),
  breakEnd: () => request<TodayResponse>('/api/v1/attendance/break/end', { method: 'POST' }),
  history: (params: { from?: string; to?: string; userId?: string; page?: number }) =>
    request<Paged<HistoryRow>>(`/api/v1/attendance/history${qs(params)}`),
  calendar: (month: string) => request<CalendarResponse>(`/api/v1/attendance/calendar${qs({ month })}`),

  /* --------------------------------- requests -------------------------------- */
  myRequests: (params?: { page?: number; pageSize?: number; status?: string }) => request<Paged<LeaveRequest>>(`/api/v1/requests${qs(params ?? {})}`),
  createRequest: (input: NewRequestInput) => request<LeaveRequest>('/api/v1/requests', { body: input }),
  cancelRequest: (id: string) => request<LeaveRequest>(`/api/v1/requests/${id}/cancel`, { method: 'PATCH' }),
  pendingRequests: (params?: { page?: number; pageSize?: number }) => request<Paged<LeaveRequest>>(`/api/v1/requests/pending${qs(params ?? {})}`),
  decideRequest: (id: string, decision: 'APPROVED' | 'REJECTED', comment?: string) =>
    request<LeaveRequest>(`/api/v1/requests/${id}/decision`, { method: 'PATCH', body: { decision, comment } }),

  /* ---------------------------------- leave ---------------------------------- */
  leaveBalances: (year?: number) => request<{ year: number; balances: LeaveBalance[] }>(`/api/v1/leave/balances${qs({ year })}`),
  updateLeavePolicy: (year: number, quotas: { type: string; quota: number }[]) =>
    request<{ year: number; updated: number; users: number }>('/api/v1/leave/policy', { method: 'PUT', body: { year, quotas } }),

  /* ---------------------------------- team ----------------------------------- */
  teamStatus: () => request<{ rows: TeamRow[]; privacyNote: string }>('/api/v1/team/status'),
  updateMyStatus: (input: { status: string; note?: string; expectedReturnAt?: string | null }) =>
    request<TeamRow>('/api/v1/team/status/me', { method: 'PUT', body: input }),

  /* ---------------------------------- admin ---------------------------------- */
  users: {
    list: (params?: { search?: string; page?: number }) => request<Paged<AdminUser>>(`/api/v1/users${qs(params ?? {})}`),
    create: (input: { employeeId: string; name: string; email: string; password: string; role: string; department: string; managerId?: string | null; officeId?: string | null; shiftId?: string | null }) =>
      request<{ id: string; employeeId: string }>('/api/v1/users', { body: input }),
    update: (id: string, input: Record<string, unknown>) => request<{ id: string }>(`/api/v1/users/${id}`, { method: 'PATCH', body: input }),
  },
  offices: {
    list: () => request<{ items: Office[] }>('/api/v1/offices'),
    create: (input: Omit<Office, 'id' | '_count'>) => request<Office>('/api/v1/offices', { body: input }),
    update: (id: string, input: Partial<Omit<Office, 'id' | '_count'>>) => request<Office>(`/api/v1/offices/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/v1/offices/${id}`, { method: 'DELETE' }),
  },
  shifts: {
    list: () => request<{ items: Shift[] }>('/api/v1/shifts'),
    create: (input: Omit<Shift, 'id' | '_count'>) => request<Shift>('/api/v1/shifts', { body: input }),
    update: (id: string, input: Partial<Omit<Shift, 'id' | '_count'>>) => request<Shift>(`/api/v1/shifts/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/v1/shifts/${id}`, { method: 'DELETE' }),
  },
  holidays: {
    list: (year?: number) => request<{ items: Holiday[] }>(`/api/v1/holidays${qs({ year })}`),
    create: (input: { date: string; name: string; officeId?: string | null }) => request<Holiday>('/api/v1/holidays', { body: input }),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/v1/holidays/${id}`, { method: 'DELETE' }),
  },
  auditLogs: (params?: { page?: number; action?: string }) => request<Paged<AuditLogRow>>(`/api/v1/audit-logs${qs(params ?? {})}`),

  /* --------------------------------- reports --------------------------------- */
  reports: {
    monthly: (params: { month: string; userId?: string }) => request<{ month: string; rows: MonthlyRow[] }>(`/api/v1/reports/monthly${qs(params)}`),
    late: (params: { month: string }) => request<{ month: string; rows: LateRow[] }>(`/api/v1/reports/late${qs(params)}`),
    leaveBalance: (params: { year: number }) => request<{ year: number; rows: LeaveBalanceRow[] }>(`/api/v1/reports/leave-balance${qs(params)}`),
  },

  /* ---------------------------------- meta ----------------------------------- */
  meta: {
    myIp: () => request<{ ip: string; known: boolean }>('/api/v1/meta/my-ip'),
  },

  /* ------------------------------- notifications ------------------------------ */
  notifications: {
    list: () => request<{ items: AppNotification[]; unread: number }>('/api/v1/notifications'),
    markRead: (id: string) => request<AppNotification>(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
  },
}

/**
 * Authenticated report export — fetches the file as a blob (with the Bearer
 * fallback when cookies are unavailable, e.g. inside a cookie-blocked preview
 * iframe) and triggers a browser download. Plain <a href> links would 401 in
 * that context, so all exports go through here.
 */
export async function downloadExport(
  name: 'monthly' | 'late' | 'leave-balance',
  params: Record<string, string | number>,
  format: 'csv' | 'xlsx' = 'xlsx',
): Promise<void> {
  const p = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const { accessToken } = readTokens()
  const res = await fetch(`/api/v1/reports/${name}?${p.toString()}`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let message = `Export failed (${res.status})`
    try {
      const json = (await res.json()) as { error?: { message?: string } }
      if (json?.error?.message) message = json.error.message
    } catch {
      /* not JSON */
    }
    throw new ApiClientError(message, res.status)
  }
  const blob = await res.blob()
  const ext = format === 'csv' ? 'csv' : 'xlsx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${params.month ?? params.year ?? 'report'}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

export type { AttState }
