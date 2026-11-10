'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiClientError } from '@/lib/api-client'
import { fmtDate } from '@/lib/dates'
import { REQUEST_TYPE_LABEL } from '@/lib/labels'
import { EmptyState, Spinner } from './ui-bits'
import type { LeaveRequest } from '@/types/api'

/** Manager/HR approvals queue (spec §9): approve/reject with comment; regularization fixes punches. */
export function ApprovalsView() {
  const qc = useQueryClient()
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null)
  const [comment, setComment] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['pending-requests', 'all'],
    queryFn: () => api.pendingRequests({ page: 1, pageSize: 50 }),
    refetchInterval: 60_000,
  })

  const decide = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      api.decideRequest(id, decision, comment),
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === 'APPROVED' ? 'Request approved' : 'Request rejected')
      qc.invalidateQueries({ queryKey: ['pending-requests'] })
      qc.invalidateQueries({ queryKey: ['team-status'] })
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      setDeciding(null)
      setComment('')
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Decision failed'),
  })

  const rows = data?.items ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-emerald-700" aria-hidden /> Pending approvals
            {rows.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{rows.length}</span>
            ) : null}
          </CardTitle>
          <CardDescription>
            {`Leave approval deducts the balance inside a transaction; rejecting restores nothing (never deducted). Regularization approval rewrites the attendance record.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState title="All caught up!" hint="No pending requests from your team." />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {r.user?.name} <span className="font-normal text-muted-foreground">({r.user?.employeeId} · {r.user?.department})</span>
                    </p>
                    <p className="mt-0.5 text-sm">
                      <span className="font-medium text-emerald-800">{REQUEST_TYPE_LABEL[r.type] ?? r.type}</span>
                      {' · '}
                      {r.type === 'REGULARIZATION'
                        ? `${fmtDate(r.regDate)} ${r.regInTime}→${r.regOutTime}`
                        : r.fromDate === r.toDate
                          ? fmtDate(r.fromDate)
                          : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`}
                      {r.halfDay ? ' (½ day)' : ''}
                      {r.type !== 'REGULARIZATION' ? ` · ${r.daysCount} day(s)` : ''}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={r.reason}>
                      Reason: {r.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-700 hover:bg-emerald-800"
                      disabled={decide.isPending}
                      onClick={() => {
                        setComment('')
                        setDeciding({ request: r, decision: 'APPROVED' })
                      }}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      disabled={decide.isPending}
                      onClick={() => {
                        setComment('')
                        setDeciding({ request: r, decision: 'REJECTED' })
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How decisions work</CardTitle>
          <CardDescription>Balance rules per policy (spec §6.4)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Approve</p>
            Deducts the employee&apos;s balance in a transaction. Insufficient balance blocks approval.
          </div>
          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Reject</p>
            No balance change. The employee is notified with your comment.
          </div>
          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Regularization</p>
            Approval rewrites the attendance record for that date and writes an audit-log entry.
          </div>
        </CardContent>
      </Card>

      <Dialog open={deciding !== null} onOpenChange={(v) => !v && setDeciding(null)}>
        <DialogContent className="sm:max-w-md" aria-describedby="decision-desc">
          <DialogHeader>
            <DialogTitle>
              {deciding?.decision === 'APPROVED' ? 'Approve' : 'Reject'}{' '}
              {deciding ? REQUEST_TYPE_LABEL[deciding.request.type] ?? deciding.request.type : ''} request
            </DialogTitle>
            <DialogDescription id="decision-desc">
              {deciding?.request.user?.name}
              {deciding?.request.type === 'REGULARIZATION'
                ? ` — ${fmtDate(deciding.request.regDate)} ${deciding.request.regInTime} → ${deciding.request.regOutTime}. Approval updates their attendance record (audit-logged).`
                : deciding
                  ? ` — ${deciding.request.fromDate === deciding.request.toDate ? fmtDate(deciding.request.fromDate) : `${fmtDate(deciding.request.fromDate)} – ${fmtDate(deciding.request.toDate)}`}. Approval deducts ${deciding.request.daysCount} day(s) from their balance.`
                  : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="manager-comment">Comment (optional)</Label>
            <Textarea id="manager-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Visible to the employee" />
          </div>
          <DialogFooter>
            <Button
              variant={deciding?.decision === 'APPROVED' ? 'default' : 'outline'}
              className={deciding?.decision === 'APPROVED' ? 'bg-emerald-700 hover:bg-emerald-800' : 'border-rose-200 text-rose-700'}
              disabled={decide.isPending}
              onClick={() => deciding && decide.mutate({ id: deciding.request.id, decision: deciding.decision, comment: comment.trim() || undefined })}
            >
              {decide.isPending ? 'Saving…' : deciding?.decision === 'APPROVED' ? 'Approve request' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
