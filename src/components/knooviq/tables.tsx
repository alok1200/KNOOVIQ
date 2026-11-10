'use client'

import { CircleAlert, MoonStar } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtDate, fmtTime, fmtMinutes, fmtDateShort } from '@/lib/dates'
import { PUNCH_MODE_LABEL, REQUEST_TYPE_LABEL } from '@/lib/labels'
import { StatusBadge, EmptyState } from './ui-bits'
import type { HistoryRow, LeaveRequest } from '@/types/api'

export function HistoryTable({ rows, compact }: { rows: HistoryRow[]; compact?: boolean }) {
  if (rows.length === 0) return <EmptyState title="No attendance records" hint="Your punches will appear here after you check in." />
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>In</TableHead>
            <TableHead>Out</TableHead>
            <TableHead>Work</TableHead>
            {!compact ? <TableHead>Break</TableHead> : null}
            <TableHead>Mode</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap font-medium">
                {compact ? fmtDateShort(r.date) : fmtDate(r.date)}
                {r.flagged ? (
                  <span title={r.flagReason ?? 'Flagged for review'}>
                    <CircleAlert className="ml-1 inline h-3 w-3 text-rose-600" aria-label="flagged" />
                  </span>
                ) : null}
                {r.autoClosed ? (
                  <span title="Auto closed (forgot check-out)">
                    <MoonStar className="ml-1 inline h-3 w-3 text-slate-500" aria-label="auto closed" />
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <StatusBadge value={r.status} kind="day" />
              </TableCell>
              <TableCell className="whitespace-nowrap">{fmtTime(r.checkInAt ? new Date(r.checkInAt) : null)}</TableCell>
              <TableCell className="whitespace-nowrap">{fmtTime(r.checkOutAt ? new Date(r.checkOutAt) : null)}</TableCell>
              <TableCell>{fmtMinutes(r.workMinutes)}</TableCell>
              {!compact ? <TableCell>{fmtMinutes(r.breakMinutes)}</TableCell> : null}
              <TableCell className="text-xs text-muted-foreground">
                {r.checkInMode ? PUNCH_MODE_LABEL[r.checkInMode] ?? r.checkInMode : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function RequestsTable({
  rows,
  onCancel,
  showUser,
}: {
  rows: LeaveRequest[]
  onCancel?: (id: string) => void
  showUser?: boolean
}) {
  if (rows.length === 0) return <EmptyState title="No requests" hint="Applied leave, WFH and regularization requests appear here." />
  const cancellable = (r: LeaveRequest) => r.status === 'PENDING' || r.status === 'APPROVED'
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showUser ? <TableHead>Employee</TableHead> : null}
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
            {onCancel ? <TableHead className="text-right">Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {showUser ? (
                <TableCell>
                  <p className="font-medium">{r.user?.name ?? '—'}</p>
                  <p className="text-[11px] text-muted-foreground">{r.user?.employeeId}</p>
                </TableCell>
              ) : null}
              <TableCell className="whitespace-nowrap">
                <StatusBadge value={r.type} kind="request" />
                {r.regInTime ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {r.regInTime} → {r.regOutTime}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.type === 'REGULARIZATION' ? fmtDate(r.regDate) : r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`}
                {r.halfDay ? <span className="ml-1 text-[11px] text-muted-foreground">(½ day)</span> : null}
              </TableCell>
              <TableCell className="tabular-nums">{r.type === 'REGULARIZATION' ? '—' : r.daysCount}</TableCell>
              <TableCell>
                <StatusBadge value={r.status} kind="reqstatus" />
                {r.managerComment ? <p className="mt-1 max-w-40 truncate text-[11px] text-muted-foreground" title={r.managerComment}>“{r.managerComment}”</p> : null}
              </TableCell>
              <TableCell className="max-w-56">
                <p className="truncate text-xs text-muted-foreground" title={r.reason}>
                  {r.reason}
                </p>
              </TableCell>
              {onCancel ? (
                <TableCell className="text-right">
                  {cancellable(r) ? (
                    <button
                      type="button"
                      onClick={() => onCancel(r.id)}
                      className="text-xs font-medium text-rose-600 underline-offset-2 hover:underline"
                    >
                      Cancel
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function requestTypeLabel(t: string) {
  return REQUEST_TYPE_LABEL[t] ?? t
}
