'use client'

/**
 * KNOOVIQ HR Admin console — Users, Offices, Shifts, Holidays, Leave Policy, Audit Log.
 * Palette: emerald/teal/slate/amber/rose only. Dates are always rendered via fmtDate.
 */

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  KeyRound,
  MapPin,
  Pencil,
  Plus,
  ScrollText,
  Search,
  SlidersHorizontal,
  Globe,
  Trash2,
  Users,
} from 'lucide-react'

import { api } from '@/lib/api-client'
import { fmtDate, fmtTime, isoOf, todayISO } from '@/lib/dates'
import { LEAVE_TYPE_LABEL, ROLE_LABEL } from '@/lib/labels'
import { EmptyState, Spinner, StatusBadge } from '@/components/knooviq/ui-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AdminUser, AuditLogRow, Holiday, Office, Paged, Shift } from '@/types/api'

/* ------------------------------------------------------------------ consts */

const PAGE_SIZE = 10
const NONE = '__none__' // Radix Select items can't use "" — sentinel for optional selects

const ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] as const
const CURRENT_YEAR = Number(todayISO().slice(0, 4))

type CreateUserInput = Parameters<typeof api.users.create>[0]

/**
 * React-recommended "adjust state when a prop/dependency changes" pattern —
 * runs `adjust` during render when `dep` changes (avoids effect cascades).
 */
function useAdjustState(dep: unknown, adjust: () => void) {
  const [prev, setPrev] = useState(dep)
  if (prev !== dep) {
    setPrev(dep)
    adjust()
  }
}
type OfficePayload = { name: string; lat: number; lng: number; radiusMeters: number; timezone: string; allowedIps: string }
type ShiftPayload = {
  name: string
  startTime: string
  endTime: string
  graceMinutes: number
  fullDayMinutes: number
  halfDayMinutes: number
}
type LeaveQuota = { type: string; quota: number }

/* ----------------------------------------------------------------- helpers */

/** Small debounce for search inputs (300 ms). */
function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/**
 * Every admin mutation: invalidates the whole ['admin'] tree on success + success
 * toast; surfaces ApiClientError.message via toast.error on failure.
 */
function useAdminMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  successMessage: string | ((output: TOutput, input: TInput) => string),
) {
  const qc = useQueryClient()
  return useMutation<TOutput, Error, TInput>({
    mutationFn,
    onSuccess: (output, input) => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      toast.success(typeof successMessage === 'function' ? successMessage(output, input) : successMessage)
    },
    onError: (err) => toast.error(err.message),
  })
}

/** Page through api.users.list until every user is loaded (manager picker). */
async function fetchAllUsers(): Promise<AdminUser[]> {
  const first: Paged<AdminUser> = await api.users.list({ page: 1 })
  const items: AdminUser[] = [...first.items]
  const pageSize = first.pageSize || first.items.length || 1
  const totalPages = Math.min(10, Math.max(1, Math.ceil(first.total / pageSize)))
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => api.users.list({ page: i + 2 }).catch(() => null)),
    )
    for (const p of rest) if (p) items.push(...p.items)
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

/** "09:00:00" → "09:00" — times are not dates, so a plain slice is enough. */
function fmtClock(t: string): string {
  return t.slice(0, 5)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

/** Pretty-print an audit JSON blob; falls back to the raw string. */
function prettyJson(raw: string | null): string | null {
  if (!raw) return null
  try {
    return JSON.stringify(JSON.parse(raw) as unknown, null, 2)
  } catch {
    return raw
  }
}

function errText(err: Error | null): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

/* ----------------------------------------------------------- tiny UI bits */

/** Labeled form field with optional hint line. */
function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Vertical + horizontal scrolling wrapper for data tables. */
function ScrollTable({ children, minWidth = 'min-w-[720px]' }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border">
      <div className="overflow-x-auto">
        <div className={minWidth}>{children}</div>
      </div>
    </div>
  )
}

function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {total} record{total === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function TabHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

/* ============================================================== AdminView */

export function AdminView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, offices, shifts, holidays and leave policy — every change is recorded in the audit log.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="users">
            <Users className="size-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="offices">
            <Building2 className="size-4" /> Offices
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Clock className="size-4" /> Shifts
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <CalendarDays className="size-4" /> Holidays
          </TabsTrigger>
          <TabsTrigger value="leave">
            <SlidersHorizontal className="size-4" /> Leave Policy
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText className="size-4" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="offices" className="mt-4">
          <OfficesTab />
        </TabsContent>
        <TabsContent value="shifts" className="mt-4">
          <ShiftsTab />
        </TabsContent>
        <TabsContent value="holidays" className="mt-4">
          <HolidaysTab />
        </TabsContent>
        <TabsContent value="leave" className="mt-4">
          <LeavePolicyTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* =================================================================== Users */

interface UserCreateForm {
  employeeId: string
  name: string
  email: string
  password: string
  role: string
  department: string
  managerId: string
  officeId: string
  shiftId: string
}

const EMPTY_USER_FORM: UserCreateForm = {
  employeeId: '',
  name: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
  department: '',
  managerId: NONE,
  officeId: NONE,
  shiftId: NONE,
}

function UsersTab() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)

  useAdjustState(debouncedSearch, () => setPage(1))

  const q = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, page],
    queryFn: () => api.users.list({ search: debouncedSearch.trim() || undefined, page }),
  })

  const toggleActive = useAdminMutation(
    (input: { id: string; isActive: boolean }) => api.users.update(input.id, { isActive: input.isActive }),
    (_out, input) => (input.isActive ? 'User activated' : 'User deactivated'),
  )

  const rows = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (q.data?.pageSize || PAGE_SIZE)))

  return (
    <div className="space-y-4">
      <TabHeader
        title="Users"
        description="Employee accounts, roles, assignments and access."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or employee ID…"
          className="pl-8"
          aria-label="Search users"
        />
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="Couldn’t load users" hint={errText(q.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No users found"
          hint="Try a different search, or add your first user."
        />
      ) : (
        <>
          <ScrollTable minWidth="min-w-[1040px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.employeeId}</TableCell>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      {u.mustChangePassword ? (
                        <span className="mt-0.5 inline-flex w-fit items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          must change password at first login
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <StatusBadge value={u.role} kind="role" />
                    </TableCell>
                    <TableCell>{u.department}</TableCell>
                    <TableCell>{u.office?.name ?? '—'}</TableCell>
                    <TableCell>{u.shift?.name ?? '—'}</TableCell>
                    <TableCell>{u.manager?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        disabled={toggleActive.isPending && toggleActive.variables?.id === u.id}
                        onCheckedChange={(v) => toggleActive.mutate({ id: u.id, isActive: v })}
                        aria-label={u.isActive ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => setEditUser(u)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Reset password for ${u.name}`}
                          onClick={() => setResetUser(u)}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollTable>
          <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />
      <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
    </div>
  )
}

/* ---------------------------------------------------------- add user dialog */

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState<UserCreateForm>(EMPTY_USER_FORM)

  const peopleQ = useQuery({ queryKey: ['admin', 'userOptions'], queryFn: fetchAllUsers, enabled: open })
  const officesQ = useQuery({ queryKey: ['admin', 'offices'], queryFn: () => api.offices.list(), enabled: open })
  const shiftsQ = useQuery({ queryKey: ['admin', 'shifts'], queryFn: () => api.shifts.list(), enabled: open })

  const create = useAdminMutation(
    (input: CreateUserInput) => api.users.create(input),
    (out) => `User ${out.employeeId} created`,
  )

  useAdjustState(open, () => {
    if (open) setForm(EMPTY_USER_FORM)
  })

  const set = (patch: Partial<UserCreateForm>) => setForm((f) => ({ ...f, ...patch }))
  const people = (peopleQ.data ?? []).filter((p) => p.isActive)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) return
    create.mutate(
      {
        employeeId: form.employeeId.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        department: form.department.trim(),
        managerId: form.managerId === NONE ? null : form.managerId,
        officeId: form.officeId === NONE ? null : form.officeId,
        shiftId: form.shiftId === NONE ? null : form.shiftId,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create an employee account. They sign in with their employee ID or email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID" htmlFor="nu-employee-id">
              <Input
                id="nu-employee-id"
                value={form.employeeId}
                onChange={(e) => set({ employeeId: e.target.value })}
                placeholder="KN014"
                required
              />
            </Field>
            <Field label="Full name" htmlFor="nu-name">
              <Input id="nu-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
            </Field>
            <Field label="Email" htmlFor="nu-email">
              <Input
                id="nu-email"
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="name@knooviq.com"
                required
              />
            </Field>
            <Field
              label="Password"
              htmlFor="nu-password"
              hint="Min 8 characters. New users must change password at first login."
            >
              <Input
                id="nu-password"
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Role" htmlFor="nu-role">
              <Select value={form.role} onValueChange={(v) => set({ role: v })}>
                <SelectTrigger id="nu-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department" htmlFor="nu-department">
              <Input
                id="nu-department"
                value={form.department}
                onChange={(e) => set({ department: e.target.value })}
                placeholder="Engineering"
                required
              />
            </Field>
            <Field label="Manager" htmlFor="nu-manager">
              <Select value={form.managerId} onValueChange={(v) => set({ managerId: v })}>
                <SelectTrigger id="nu-manager" className="w-full">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Office" htmlFor="nu-office">
              <Select value={form.officeId} onValueChange={(v) => set({ officeId: v })}>
                <SelectTrigger id="nu-office" className="w-full">
                  <SelectValue placeholder="Select office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(officesQ.data?.items ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Shift" htmlFor="nu-shift">
              <Select value={form.shiftId} onValueChange={(v) => set({ shiftId: v })}>
                <SelectTrigger id="nu-shift" className="w-full">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(shiftsQ.data?.items ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------- edit user dialog */

interface UserEditForm {
  name: string
  role: string
  department: string
  managerId: string
  officeId: string
  shiftId: string
  isActive: boolean
}

function EditUserDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [form, setForm] = useState<UserEditForm>({
    name: '',
    role: 'EMPLOYEE',
    department: '',
    managerId: NONE,
    officeId: NONE,
    shiftId: NONE,
    isActive: true,
  })

  const open = user !== null
  const peopleQ = useQuery({ queryKey: ['admin', 'userOptions'], queryFn: fetchAllUsers, enabled: open })
  const officesQ = useQuery({ queryKey: ['admin', 'offices'], queryFn: () => api.offices.list(), enabled: open })
  const shiftsQ = useQuery({ queryKey: ['admin', 'shifts'], queryFn: () => api.shifts.list(), enabled: open })

  const update = useAdminMutation(
    (input: { id: string; data: Record<string, unknown> }) => api.users.update(input.id, input.data),
    () => 'User updated',
  )

  useAdjustState(user, () => {
    if (user) {
      setForm({
        name: user.name,
        role: user.role,
        department: user.department,
        managerId: user.managerId ?? NONE,
        officeId: user.officeId ?? NONE,
        shiftId: user.shiftId ?? NONE,
        isActive: user.isActive,
      })
    }
  })

  const set = (patch: Partial<UserEditForm>) => setForm((f) => ({ ...f, ...patch }))
  const people = (peopleQ.data ?? []).filter((p) => p.isActive && p.id !== user?.id)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    update.mutate(
      {
        id: user.id,
        data: {
          name: form.name.trim(),
          role: form.role,
          department: form.department.trim(),
          managerId: form.managerId === NONE ? null : form.managerId,
          officeId: form.officeId === NONE ? null : form.officeId,
          shiftId: form.shiftId === NONE ? null : form.shiftId,
          isActive: form.isActive,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {user ? `${user.name} · ${user.employeeId} · ${user.email}` : 'Update name, role and assignments.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="eu-name">
              <Input id="eu-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
            </Field>
            <Field label="Role" htmlFor="eu-role">
              <Select value={form.role} onValueChange={(v) => set({ role: v })}>
                <SelectTrigger id="eu-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department" htmlFor="eu-department">
              <Input
                id="eu-department"
                value={form.department}
                onChange={(e) => set({ department: e.target.value })}
                required
              />
            </Field>
            <Field label="Manager" htmlFor="eu-manager">
              <Select value={form.managerId} onValueChange={(v) => set({ managerId: v })}>
                <SelectTrigger id="eu-manager" className="w-full">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Office" htmlFor="eu-office">
              <Select value={form.officeId} onValueChange={(v) => set({ officeId: v })}>
                <SelectTrigger id="eu-office" className="w-full">
                  <SelectValue placeholder="Select office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(officesQ.data?.items ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Shift" htmlFor="eu-shift">
              <Select value={form.shiftId} onValueChange={(v) => set({ shiftId: v })}>
                <SelectTrigger id="eu-shift" className="w-full">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(shiftsQ.data?.items ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-[11px] text-muted-foreground">Inactive users cannot sign in.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set({ isActive: v })} aria-label="User active" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------- reset password dialog */

function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const open = user !== null

  const reset = useAdminMutation(
    (input: { id: string; newPassword: string }) => api.users.update(input.id, { newPassword: input.newPassword }),
    () => 'Password reset — the user must change it at next login',
  )

  useAdjustState(user, () => {
    if (user) setNewPassword('')
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user || newPassword.length < 8) return
    reset.mutate({ id: user.id, newPassword }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user ? `Set a temporary password for ${user.name} (${user.email}).` : 'Set a temporary password.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="New password"
            htmlFor="rp-password"
            hint="Min 8 characters. The user must change password at first login."
          >
            <Input
              id="rp-password"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={reset.isPending || newPassword.length < 8}>
              {reset.isPending ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================= Offices */

interface OfficeForm {
  name: string
  lat: string
  lng: string
  radiusMeters: string
  timezone: string
  allowedIps: string
}

function OfficesTab() {
  const q = useQuery({ queryKey: ['admin', 'offices'], queryFn: () => api.offices.list() })
  const [addOpen, setAddOpen] = useState(false)
  const [editOffice, setEditOffice] = useState<Office | null>(null)
  const [deleteOffice, setDeleteOffice] = useState<Office | null>(null)

  const del = useAdminMutation((id: string) => api.offices.remove(id), () => 'Office deleted')

  const rows = q.data?.items ?? []

  return (
    <div className="space-y-4">
      <TabHeader
        title="Offices"
        description="Physical locations with GPS geofences — optionally register the office network IP so employees can punch without GPS."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add office
          </Button>
        }
      />

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState icon={<MapPin className="h-8 w-8" />} title="Couldn’t load offices" hint={errText(q.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title="No offices yet"
          hint="Add your first office so employees can check in within its geofence."
        />
      ) : (
        <ScrollTable minWidth="min-w-[780px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Office IPs</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {o.lat.toFixed(5)}, {o.lng.toFixed(5)}
                  </TableCell>
                  <TableCell>{o.radiusMeters} m</TableCell>
                  <TableCell className="text-muted-foreground">{o.timezone}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground" title={o.allowedIps || 'No office-network IPs — GPS-only punching'}>
                    {o.allowedIps || '—'}
                  </TableCell>
                  <TableCell>{o._count?.users ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit office ${o.name}`}
                        onClick={() => setEditOffice(o)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-rose-600 hover:text-rose-700"
                        aria-label={`Delete office ${o.name}`}
                        disabled={del.isPending && del.variables === o.id}
                        onClick={() => setDeleteOffice(o)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollTable>
      )}

      <OfficeDialog
        open={addOpen || editOffice !== null}
        office={editOffice}
        onClose={() => {
          setAddOpen(false)
          setEditOffice(null)
        }}
      />

      <AlertDialog open={deleteOffice !== null} onOpenChange={(o) => !o && setDeleteOffice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete office?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteOffice?.name}”. If users are still assigned to this office, the
              deletion is refused and an error is shown — reassign those users first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteOffice) del.mutate(deleteOffice.id, { onSuccess: () => setDeleteOffice(null) })
              }}
            >
              {del.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Shared add/edit office dialog — open with `office = null` to create. */
function OfficeDialog({ open, office, onClose }: { open: boolean; office: Office | null; onClose: () => void }) {
  const isNew = office === null
  const [form, setForm] = useState<OfficeForm>({ name: '', lat: '', lng: '', radiusMeters: '25', timezone: 'Asia/Kolkata', allowedIps: '' })
  const [capturing, setCapturing] = useState(false)
  const [detectingIp, setDetectingIp] = useState(false)

  useAdjustState(`${open}|${office?.id ?? 'new'}`, () => {
    if (!open) return
    if (office) {
      setForm({
        name: office.name,
        lat: String(office.lat),
        lng: String(office.lng),
        radiusMeters: String(office.radiusMeters),
        timezone: office.timezone,
        allowedIps: office.allowedIps ?? '',
      })
    } else {
      setForm({ name: '', lat: '', lng: '', radiusMeters: '25', timezone: 'Asia/Kolkata', allowedIps: '' })
    }
  })

  const save = useAdminMutation(
    (input: { id: string; data: OfficePayload }) =>
      isNew ? api.offices.create(input.data) : api.offices.update(input.id, input.data),
    (_out, input) => (isNew ? `Office “${input.data.name}” created` : 'Office updated'),
  )

  const set = (patch: Partial<OfficeForm>) => setForm((f) => ({ ...f, ...patch }))

  /** Stand inside the real office and capture its exact coordinates (spec §6.2):
   * the geofence only works when the saved office position matches reality. */
  const captureCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      toast.error('Geolocation is not supported by this browser — enter coordinates manually.')
      return
    }
    setCapturing(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturing(false)
        const acc = Math.round(pos.coords.accuracy)
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          // The fence must at least cover the GPS uncertainty of the capture itself.
          radiusMeters: String(Math.min(1000, Math.max(Number(f.radiusMeters) || 25, acc + 15))),
        }))
        toast.success(
          `Office location captured (±${acc} m accuracy). Radius adjusted to cover the GPS uncertainty — tune it to your building size.`,
        )
      },
      (err) => {
        setCapturing(false)
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location access for this site, then retry.'
            : 'Could not get a GPS fix here. Move near a window / open area and retry, or enter coordinates manually.',
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    const radiusMeters = Number(form.radiusMeters)
    if (![lat, lng, radiusMeters].every(Number.isFinite)) return
    const data: OfficePayload = {
      name: form.name.trim(),
      lat,
      lng,
      radiusMeters,
      timezone: form.timezone.trim() || 'Asia/Kolkata',
      allowedIps: form.allowedIps.trim(),
    }
    save.mutate({ id: office?.id ?? '', data }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add office' : 'Edit office'}</DialogTitle>
          <DialogDescription>Offices define where employees can punch in and out.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="of-name">
            <Input id="of-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <div className="rounded-md border border-dashed bg-muted/40 p-3">
            <p className="text-xs font-semibold">Standing inside the office right now?</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Capture the exact coordinates here — employees inside the building will then pass the geofence check.
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={captureCurrentLocation} disabled={capturing}>
              <MapPin className="mr-1 h-3 w-3" aria-hidden />
              {capturing ? 'Locating…' : 'Use my current location'}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" htmlFor="of-lat">
              <Input
                id="of-lat"
                type="number"
                step="any"
                min={-90}
                max={90}
                value={form.lat}
                onChange={(e) => set({ lat: e.target.value })}
                placeholder="12.97160"
                required
              />
            </Field>
            <Field label="Longitude" htmlFor="of-lng">
              <Input
                id="of-lng"
                type="number"
                step="any"
                min={-180}
                max={180}
                value={form.lng}
                onChange={(e) => set({ lng: e.target.value })}
                placeholder="77.59460"
                required
              />
            </Field>
            <Field
              label="Radius (meters)"
              htmlFor="of-radius"
              hint="Geofence for check-in/out. 25 m suits open desks; indoor GPS usually needs 50–150 m."
            >
              <Input
                id="of-radius"
                type="number"
                min={1}
                value={form.radiusMeters}
                onChange={(e) => set({ radiusMeters: e.target.value })}
                required
              />
            </Field>
            <Field label="Timezone" htmlFor="of-tz">
              <Input
                id="of-tz"
                value={form.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
                placeholder="Asia/Kolkata"
              />
            </Field>
          </div>
          <Field
            label="Office network IPs (optional)"
            htmlFor="of-ips"
            hint="Comma-separated public IPs, CIDR ranges (182.71.0.0/16) or wildcards (182.71.*.*). Employees connected from these IPs can check in/out without GPS — the network proves office presence."
          >
            <div className="flex gap-2">
              <Input
                id="of-ips"
                value={form.allowedIps}
                onChange={(e) => set({ allowedIps: e.target.value })}
                placeholder="103.25.128.7, 182.71.0.0/16"
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={detectingIp}
                onClick={async () => {
                  setDetectingIp(true)
                  try {
                    const { ip, known } = await api.meta.myIp()
                    if (!known) {
                      toast.error('Could not detect your IP — enter it manually.')
                      return
                    }
                    setForm((f) => {
                      const parts = f.allowedIps.split(',').map((s) => s.trim()).filter(Boolean)
                      if (parts.includes(ip)) return f
                      return { ...f, allowedIps: [...parts, ip].join(', ') }
                    })
                    toast.success(`Added your current IP ${ip} — employees on this network can punch without GPS.`)
                  } catch {
                    toast.error('Could not detect your IP — enter it manually.')
                  } finally {
                    setDetectingIp(false)
                  }
                }}
              >
                <Globe className="mr-1 h-3 w-3" aria-hidden />
                {detectingIp ? 'Detecting…' : 'Detect my current IP'}
              </Button>
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isNew ? 'Create office' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== Shifts */

interface ShiftForm {
  name: string
  startTime: string
  endTime: string
  graceMinutes: string
  fullDayMinutes: string
  halfDayMinutes: string
}

function ShiftsTab() {
  const q = useQuery({ queryKey: ['admin', 'shifts'], queryFn: () => api.shifts.list() })
  const [addOpen, setAddOpen] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [deleteShift, setDeleteShift] = useState<Shift | null>(null)

  const del = useAdminMutation((id: string) => api.shifts.remove(id), () => 'Shift deleted')

  const rows = q.data?.items ?? []

  return (
    <div className="space-y-4">
      <TabHeader
        title="Shifts"
        description="Working windows, grace period and half-day thresholds."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add shift
          </Button>
        }
      />

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState icon={<Clock className="h-8 w-8" />} title="Couldn’t load shifts" hint={errText(q.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="No shifts yet"
          hint="Add a shift so employees have working hours and late-grace rules."
        />
      ) : (
        <ScrollTable minWidth="min-w-[720px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start – End</TableHead>
                <TableHead>Grace</TableHead>
                <TableHead>Full-day</TableHead>
                <TableHead>Half-day</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmtClock(s.startTime)} – {fmtClock(s.endTime)}
                  </TableCell>
                  <TableCell>{s.graceMinutes} m</TableCell>
                  <TableCell>{s.fullDayMinutes} m</TableCell>
                  <TableCell>{s.halfDayMinutes} m</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit shift ${s.name}`}
                        onClick={() => setEditShift(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-rose-600 hover:text-rose-700"
                        aria-label={`Delete shift ${s.name}`}
                        disabled={del.isPending && del.variables === s.id}
                        onClick={() => setDeleteShift(s)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollTable>
      )}

      <ShiftDialog
        open={addOpen || editShift !== null}
        shift={editShift}
        onClose={() => {
          setAddOpen(false)
          setEditShift(null)
        }}
      />

      <AlertDialog open={deleteShift !== null} onOpenChange={(o) => !o && setDeleteShift(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteShift?.name}”. If users are still assigned to this shift, the deletion
              is refused and an error is shown — reassign those users first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteShift) del.mutate(deleteShift.id, { onSuccess: () => setDeleteShift(null) })
              }}
            >
              {del.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Shared add/edit shift dialog — open with `shift = null` to create. */
function ShiftDialog({ open, shift, onClose }: { open: boolean; shift: Shift | null; onClose: () => void }) {
  const isNew = shift === null
  const [form, setForm] = useState<ShiftForm>({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: '10',
    fullDayMinutes: '480',
    halfDayMinutes: '240',
  })

  useAdjustState(`${open}|${shift?.id ?? 'new'}`, () => {
    if (!open) return
    if (shift) {
      setForm({
        name: shift.name,
        startTime: fmtClock(shift.startTime),
        endTime: fmtClock(shift.endTime),
        graceMinutes: String(shift.graceMinutes),
        fullDayMinutes: String(shift.fullDayMinutes),
        halfDayMinutes: String(shift.halfDayMinutes),
      })
    } else {
      setForm({
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        graceMinutes: '10',
        fullDayMinutes: '480',
        halfDayMinutes: '240',
      })
    }
  })

  const save = useAdminMutation(
    (input: { id: string; data: ShiftPayload }) =>
      isNew ? api.shifts.create(input.data) : api.shifts.update(input.id, input.data),
    (_out, input) => (isNew ? `Shift “${input.data.name}” created` : 'Shift updated'),
  )

  const set = (patch: Partial<ShiftForm>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const graceMinutes = Number(form.graceMinutes)
    const fullDayMinutes = Number(form.fullDayMinutes)
    const halfDayMinutes = Number(form.halfDayMinutes)
    if (![graceMinutes, fullDayMinutes, halfDayMinutes].every((n) => Number.isFinite(n) && n >= 0)) return
    const data: ShiftPayload = {
      name: form.name.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      graceMinutes,
      fullDayMinutes,
      halfDayMinutes,
    }
    save.mutate({ id: shift?.id ?? '', data }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add shift' : 'Edit shift'}</DialogTitle>
          <DialogDescription>Shifts define the expected working window for a day.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="sf-name">
            <Input
              id="sf-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="General (9–6)"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" htmlFor="sf-start">
              <Input
                id="sf-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
                required
              />
            </Field>
            <Field label="End time" htmlFor="sf-end">
              <Input
                id="sf-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                required
              />
            </Field>
            <Field label="Grace minutes" htmlFor="sf-grace" hint="Late is allowed up to this many minutes.">
              <Input
                id="sf-grace"
                type="number"
                min={0}
                value={form.graceMinutes}
                onChange={(e) => set({ graceMinutes: e.target.value })}
                required
              />
            </Field>
            <Field label="Full-day minutes" htmlFor="sf-full" hint="Work minutes needed to count as a full day.">
              <Input
                id="sf-full"
                type="number"
                min={0}
                value={form.fullDayMinutes}
                onChange={(e) => set({ fullDayMinutes: e.target.value })}
                required
              />
            </Field>
            <Field label="Half-day minutes" htmlFor="sf-half" hint="Work minutes needed to count as a half day.">
              <Input
                id="sf-half"
                type="number"
                min={0}
                value={form.halfDayMinutes}
                onChange={(e) => set({ halfDayMinutes: e.target.value })}
                required
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isNew ? 'Create shift' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================ Holidays */

interface HolidayForm {
  date: string
  name: string
  officeId: string
}

function HolidaysTab() {
  const years = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteHoliday, setDeleteHoliday] = useState<Holiday | null>(null)

  const q = useQuery({
    queryKey: ['admin', 'holidays', year],
    queryFn: () => api.holidays.list(year),
  })

  const del = useAdminMutation((id: string) => api.holidays.remove(id), () => 'Holiday deleted')

  const rows = [...(q.data?.items ?? [])].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="space-y-4">
      <TabHeader
        title="Holidays"
        description="Office-wide or per-office holiday calendar."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add holiday
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Label htmlFor="holiday-year" className="text-sm text-muted-foreground">
          Year
        </Label>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger id="holiday-year" className="w-32" aria-label="Holiday year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="Couldn’t load holidays"
          hint={errText(q.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title={`No holidays in ${year}`}
          hint="Add holidays so they show up as days off on everyone’s calendar."
        />
      ) : (
        <ScrollTable minWidth="min-w-[560px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Office scope</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap font-medium">{fmtDate(h.date)}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>
                    {h.officeId && h.office?.name ? (
                      <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">
                        {h.office.name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
                        All offices
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-rose-600 hover:text-rose-700"
                        aria-label={`Delete holiday ${h.name}`}
                        disabled={del.isPending && del.variables === h.id}
                        onClick={() => setDeleteHoliday(h)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollTable>
      )}

      <AddHolidayDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={deleteHoliday !== null} onOpenChange={(o) => !o && setDeleteHoliday(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{deleteHoliday?.name}” on {deleteHoliday ? fmtDate(deleteHoliday.date) : ''} from the
              {deleteHoliday?.office?.name ? ` ${deleteHoliday.office.name}` : ' all-offices'} calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteHoliday) del.mutate(deleteHoliday.id, { onSuccess: () => setDeleteHoliday(null) })
              }}
            >
              {del.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AddHolidayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState<HolidayForm>({ date: todayISO(), name: '', officeId: NONE })

  const officesQ = useQuery({ queryKey: ['admin', 'offices'], queryFn: () => api.offices.list(), enabled: open })

  const create = useAdminMutation(
    (input: { date: string; name: string; officeId: string | null }) => api.holidays.create(input),
    (out) => `Holiday “${out.name}” added`,
  )

  useAdjustState(open, () => {
    if (open) setForm({ date: todayISO(), name: '', officeId: NONE })
  })

  const set = (patch: Partial<HolidayForm>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        date: form.date,
        name: form.name.trim(),
        officeId: form.officeId === NONE ? null : form.officeId,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add holiday</DialogTitle>
          <DialogDescription>Holidays are non-working days — no attendance is expected.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Date" htmlFor="hf-date">
            <Input id="hf-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          <Field label="Name" htmlFor="hf-name">
            <Input
              id="hf-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Republic Day"
              required
            />
          </Field>
          <Field label="Office scope" htmlFor="hf-office" hint="Leave empty to apply to all offices.">
            <Select value={form.officeId} onValueChange={(v) => set({ officeId: v })}>
              <SelectTrigger id="hf-office" className="w-full">
                <SelectValue placeholder="All offices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All offices</SelectItem>
                {(officesQ.data?.items ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add holiday'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ============================================================ Leave Policy */

function LeavePolicyTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [cl, setCl] = useState('12')
  const [sl, setSl] = useState('10')
  const [el, setEl] = useState('15')
  const [wfh, setWfh] = useState('24')

  const apply = useAdminMutation(
    (input: { year: number; quotas: LeaveQuota[] }) => api.updateLeavePolicy(input.year, input.quotas),
    (out) =>
      `Leave policy applied — ${out.updated} quota${out.updated === 1 ? '' : 's'} updated for ${out.users} user${
        out.users === 1 ? '' : 's'
      }`,
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const y = Number(year)
    const quotas: LeaveQuota[] = [
      { type: 'CASUAL_LEAVE', quota: Number(cl) },
      { type: 'SICK_LEAVE', quota: Number(sl) },
      { type: 'EARNED_LEAVE', quota: Number(el) },
      { type: 'WFH', quota: Number(wfh) },
    ]
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return
    if (quotas.some((q) => !Number.isFinite(q.quota) || q.quota < 0)) return
    apply.mutate({ year: y, quotas })
  }

  const numProps = (value: string, onChange: (v: string) => void, id: string) => ({
    id,
    type: 'number' as const,
    min: 0,
    step: 1,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    required: true,
  })

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Yearly quotas</CardTitle>
          <CardDescription>Set the quota for each leave type, then apply it to all active users.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Policy year" htmlFor="lp-year">
              <Input
                id="lp-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-32"
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={LEAVE_TYPE_LABEL.CASUAL_LEAVE} htmlFor="lp-cl">
                <Input {...numProps(cl, setCl, 'lp-cl')} />
              </Field>
              <Field label={LEAVE_TYPE_LABEL.SICK_LEAVE} htmlFor="lp-sl">
                <Input {...numProps(sl, setSl, 'lp-sl')} />
              </Field>
              <Field label={LEAVE_TYPE_LABEL.EARNED_LEAVE} htmlFor="lp-el">
                <Input {...numProps(el, setEl, 'lp-el')} />
              </Field>
              <Field label={LEAVE_TYPE_LABEL.WFH} htmlFor="lp-wfh">
                <Input {...numProps(wfh, setWfh, 'lp-wfh')} />
              </Field>
            </div>
            <Button type="submit" disabled={apply.isPending}>
              {apply.isPending ? 'Applying…' : 'Apply to all active users'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/60 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="size-4 text-amber-700" /> How quotas work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-900">
          <p>Quotas are per calendar year. Approval deducts, rejection/cancellation restores.</p>
          <p className="text-xs text-amber-800">
            Applying overwrites the yearly quota for every active user in the selected year; already-used balances are
            left as they are.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* =============================================================== Audit Log */

function AuditDiffCell({ row }: { row: AuditLogRow }) {
  const before = prettyJson(row.before)
  const after = prettyJson(row.after)
  if (!before && !after) return <span className="text-muted-foreground">—</span>

  const preview = `${truncate(row.before ?? '(none)', 28)} → ${truncate(row.after ?? '(none)', 28)}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View before/after diff for ${row.action} on ${row.entity}`}
          className="h-auto max-w-[260px] justify-start px-2 py-1 font-mono text-[11px] normal-case"
        >
          <span className="truncate">{preview}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[85vw]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {row.entity} · {row.entityId}
        </p>
        <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Before</p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-700">
          {before ?? '(none)'}
        </pre>
        <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">After</p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-emerald-50 p-2 font-mono text-[11px] leading-relaxed text-emerald-900">
          {after ?? '(none)'}
        </pre>
      </PopoverContent>
    </Popover>
  )
}

function AuditTab() {
  const [actionInput, setActionInput] = useState('')
  const action = useDebounced(actionInput.trim())
  const [page, setPage] = useState(1)

  useAdjustState(action, () => setPage(1))

  const q = useQuery({
    queryKey: ['admin', 'audit', action, page],
    queryFn: () => api.auditLogs({ action: action || undefined, page }),
  })

  const rows = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (q.data?.pageSize || PAGE_SIZE)))

  return (
    <div className="space-y-4">
      <TabHeader title="Audit Log" description="Every admin action, newest first." />

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          placeholder="Filter by action (e.g. USER_…)"
          className="pl-8"
          aria-label="Filter audit log by action"
        />
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="Couldn’t load audit log" hint={errText(q.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No audit entries"
          hint="Admin actions will appear here as they happen."
        />
      ) : (
        <>
          <ScrollTable minWidth="min-w-[880px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Before → After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{fmtDate(isoOf(new Date(row.createdAt)))}</div>
                      <div className="text-xs text-muted-foreground">{fmtTime(new Date(row.createdAt))}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.actor?.name ?? '—'}</div>
                      {row.actor?.employeeId ? (
                        <div className="font-mono text-xs text-muted-foreground">{row.actor.employeeId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 font-mono text-[11px] font-medium text-slate-700"
                      >
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.entity}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs" title={row.entityId}>
                        {truncate(row.entityId, 12)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <AuditDiffCell row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollTable>
          <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
