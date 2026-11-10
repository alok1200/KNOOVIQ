'use client'

/**
 * Reports view — manager/HR reports (spec §9): Monthly Attendance, Late Arrivals,
 * Leave Balance. Every report exports as CSV / XLSX through the shared export
 * endpoint, downloaded as an authenticated blob so exports also work in
 * contexts where cookies are unavailable (preview iframe).
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlarmClock,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  TriangleAlert,
  Users,
} from 'lucide-react'

import { api, downloadExport } from '@/lib/api-client'
import { currentMonth, fmtDateShort, fmtMonth, fmtTime, nextMonth, prevMonth } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Spinner, StatusBadge } from '@/components/knooviq/ui-bits'

/** "09:12" is shown as-is; full ISO timestamps are formatted in office timezone. */
function fmtClock(v: string | null | undefined): string {
  if (!v) return '—'
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : fmtTime(d)
}

function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Previous month"
        onClick={() => onChange(prevMonth(month))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-32 text-center text-sm font-semibold" aria-live="polite">
        {fmtMonth(month)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Next month"
        onClick={() => onChange(nextMonth(month))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

function ExportButtons({ name, params }: { name: 'monthly' | 'late' | 'leave-balance'; params: Record<string, string | number> }) {
  const download = (format: 'csv' | 'xlsx') => {
    downloadExport(name, params, format)
      .then(() => toast.success(`${format.toUpperCase()} export downloaded`))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Export failed'))
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => download('csv')} aria-label={`Download ${name} report as CSV`}>
        <FileText className="h-4 w-4" aria-hidden />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => download('xlsx')} aria-label={`Download ${name} report as XLSX`}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        XLSX
      </Button>
    </div>
  )
}

function EmployeeCell({ name, employeeId }: { name: string; employeeId: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">{employeeId}</span>
    </div>
  )
}

function LateMinutes({ minutes }: { minutes: number }) {
  return (
    <span className={cn('tabular-nums', minutes > 0 && 'font-medium text-rose-600')}>
      {minutes > 0 ? minutes : '—'}
    </span>
  )
}

/* ------------------------------ Monthly report ----------------------------- */

function MonthlyReport() {
  const [month, setMonth] = useState<string>(currentMonth)
  const [userId, setUserId] = useState<string>('ALL')

  const query = useQuery({
    queryKey: ['reports', 'monthly', month, userId],
    queryFn: () => api.reports.monthly({ month, userId: userId === 'ALL' ? undefined : userId }),
  })
  // Employee picker options come from the unfiltered month rows (no separate employee endpoint).
  // When no filter is active this is the very same query — TanStack Query dedupes by key.
  const allQuery = useQuery({
    queryKey: ['reports', 'monthly', month, 'ALL'],
    queryFn: () => api.reports.monthly({ month }),
    enabled: userId !== 'ALL',
  })

  const rows = query.data?.rows ?? []

  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : 'Failed to load the monthly attendance report')
    }
  }, [query.isError, query.error])

  const employees = useMemo(() => {
    const source = userId === 'ALL' ? rows : (allQuery.data?.rows ?? rows)
    const byKey = new Map<string, { id: string; name: string }>()
    for (const r of source) {
      if (!r.employeeId) continue
      const key = `${r.employeeId}::${r.name}`
      if (!byKey.has(key)) byKey.set(key, { id: r.employeeId, name: r.name })
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [userId, rows, allQuery.data])

  const exportParams: Record<string, string | number> = { month }
  if (userId !== 'ALL') exportParams.userId = userId

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-emerald-700" aria-hidden />
          Monthly attendance
        </CardTitle>
        <CardDescription>Day-level attendance for all employees — {fmtMonth(month)}</CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2">
            <MonthNav month={month} onChange={setMonth} />
            <ExportButtons name="monthly" params={exportParams} />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-56" size="sm" aria-label="Filter by employee">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title="Couldn't load the monthly report"
            hint="Try a different month or employee filter."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No attendance records"
            hint={`Nothing recorded for ${fmtMonth(month)}${userId === 'ALL' ? '' : ' for the selected employee'}.`}
          />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Work</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead className="text-right">Late (min)</TableHead>
                  <TableHead>Flagged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.employeeId}-${r.date}-${i}`}>
                    <TableCell>{fmtDateShort(r.date)}</TableCell>
                    <TableCell>
                      <EmployeeCell name={r.name} employeeId={r.employeeId} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} kind="day" />
                    </TableCell>
                    <TableCell>{fmtClock(r.checkIn)}</TableCell>
                    <TableCell>{fmtClock(r.checkOut)}</TableCell>
                    <TableCell>{r.work || '—'}</TableCell>
                    <TableCell>{r.break || '—'}</TableCell>
                    <TableCell className="text-right">
                      <LateMinutes minutes={r.lateMinutes} />
                    </TableCell>
                    <TableCell>
                      {r.flagged ? (
                        <Badge variant="outline" className="border-rose-200 bg-rose-100 text-rose-800">
                          Flagged
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ----------------------------- Late arrivals ------------------------------ */

function LateReport() {
  const [month, setMonth] = useState<string>(currentMonth)

  const query = useQuery({
    queryKey: ['reports', 'late', month],
    queryFn: () => api.reports.late({ month }),
  })
  const rows = query.data?.rows ?? []

  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : 'Failed to load the late arrivals report')
    }
  }, [query.isError, query.error])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlarmClock className="h-4 w-4 text-amber-700" aria-hidden />
          Late arrivals
        </CardTitle>
        <CardDescription>Check-ins after the shift grace period — {fmtMonth(month)}</CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2">
            <MonthNav month={month} onChange={setMonth} />
            <ExportButtons name="late" params={{ month }} />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title="Couldn't load late arrivals"
            hint="Please try again in a moment."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<AlarmClock className="h-5 w-5" />}
            title="No late arrivals"
            hint={`Everyone was on time in ${fmtMonth(month)}.`}
          />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead className="text-right">Late (min)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.employeeId}-${r.date}-${i}`}>
                    <TableCell>{fmtDateShort(r.date)}</TableCell>
                    <TableCell>
                      <EmployeeCell name={r.name} employeeId={r.employeeId} />
                    </TableCell>
                    <TableCell>{fmtClock(r.checkIn)}</TableCell>
                    <TableCell className="text-right">
                      <LateMinutes minutes={r.lateMinutes} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} kind="day" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------ Leave balance ------------------------------ */

function LeaveCell({ label, remaining, quota, used }: { label: string; remaining: number; quota: number; used: number }) {
  const pct = quota > 0 ? Math.min(100, Math.max(0, (used / quota) * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn('text-sm font-medium tabular-nums', remaining <= 2 ? 'text-rose-600' : 'text-foreground')}
        aria-label={`${remaining} of ${quota} ${label} remaining`}
      >
        {remaining} / {quota}
      </span>
      <Progress value={pct} className="h-1.5 w-20" aria-hidden />
    </div>
  )
}

function LeaveBalanceReport() {
  const currentYear = Number(currentMonth().slice(0, 4))
  const [yearText, setYearText] = useState<string>(() => String(currentYear))
  const year = Number(yearText)
  const yearValid = /^\d{4}$/.test(yearText) && year >= 2000 && year <= 2100

  const query = useQuery({
    queryKey: ['reports', 'leave-balance', year],
    queryFn: () => api.reports.leaveBalance({ year }),
    enabled: yearValid,
  })
  const rows = query.data?.rows ?? []

  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : 'Failed to load the leave balance report')
    }
  }, [query.isError, query.error])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="h-4 w-4 text-teal-700" aria-hidden />
          Leave balance
        </CardTitle>
        <CardDescription>Remaining / quota with usage — CL, SL, EL and WFH{yearValid ? ` for ${year}` : ''}</CardDescription>
        <CardAction>
          {yearValid ? (
            <div className="flex flex-wrap items-center gap-2">
              <ExportButtons name="leave-balance" params={{ year }} />
            </div>
          ) : null}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="leave-balance-year" className="text-sm font-medium">
            Year
          </Label>
          <Input
            id="leave-balance-year"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
            className="w-24"
          />
          {!yearValid ? (
            <span className="text-xs text-amber-700" role="note">
              Enter a year between 2000 and 2100
            </span>
          ) : null}
        </div>

        {!yearValid ? (
          <EmptyState
            title="Enter a valid year"
            hint="Type a 4-digit year between 2000 and 2100 to load leave balances."
          />
        ) : query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title="Couldn't load leave balances"
            hint="Please try again in a moment."
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No leave balances" hint={`No balance records found for ${year}.`} />
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>
                    <abbr title="Casual Leave">CL</abbr>
                  </TableHead>
                  <TableHead>
                    <abbr title="Sick Leave">SL</abbr>
                  </TableHead>
                  <TableHead>
                    <abbr title="Earned Leave">EL</abbr>
                  </TableHead>
                  <TableHead>
                    <abbr title="Work From Home">WFH</abbr>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.employeeId}>
                    <TableCell>
                      <EmployeeCell name={r.name} employeeId={r.employeeId} />
                    </TableCell>
                    <TableCell>
                      <LeaveCell label="CL" remaining={r.clRemaining} quota={r.clQuota} used={r.clUsed} />
                    </TableCell>
                    <TableCell>
                      <LeaveCell label="SL" remaining={r.slRemaining} quota={r.slQuota} used={r.slUsed} />
                    </TableCell>
                    <TableCell>
                      <LeaveCell label="EL" remaining={r.elRemaining} quota={r.elQuota} used={r.elUsed} />
                    </TableCell>
                    <TableCell>
                      <LeaveCell label="WFH" remaining={r.wfhRemaining} quota={r.wfhQuota} used={r.wfhUsed} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportsView() {
  return (
    <Tabs defaultValue="monthly" className="gap-4">
      <TabsList aria-label="Reports">
        <TabsTrigger value="monthly">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Monthly Attendance
        </TabsTrigger>
        <TabsTrigger value="late">
          <AlarmClock className="h-4 w-4" aria-hidden />
          Late Arrivals
        </TabsTrigger>
        <TabsTrigger value="leave">
          <CalendarOff className="h-4 w-4" aria-hidden />
          Leave Balance
        </TabsTrigger>
      </TabsList>

      <TabsContent value="monthly">
        <MonthlyReport />
      </TabsContent>
      <TabsContent value="late">
        <LateReport />
      </TabsContent>
      <TabsContent value="leave">
        <LeaveBalanceReport />
      </TabsContent>
    </Tabs>
  )
}
