'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiClientError } from '@/lib/api-client'
import { fmtMonth, fmtMinutes } from '@/lib/dates'
import { StatusBadge, EmptyState } from './ui-bits'
import { RequestsTable } from './tables'
import { ApplyRequestDialog } from './apply-request-dialog'
import { LEAVE_TYPE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

/** Requests page (spec §9): apply, list, cancel + balances sidebar. */
export function RequestsView() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [applyOpen, setApplyOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['requests', 'mine', page],
    queryFn: () => api.myRequests({ page }),
  })
  const { data: balData } = useQuery({ queryKey: ['balances'], queryFn: () => api.leaveBalances() })

  const cancel = async (id: string) => {
    try {
      await api.cancelRequest(id)
      toast.success('Request cancelled')
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not cancel request')
    }
  }

  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 20
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Requests</CardTitle>
            <CardDescription>Leave, WFH, official work outside and regularization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Button size="sm" onClick={() => setApplyOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> New request
              </Button>
            </div>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
            ) : (
              <RequestsTable rows={data?.items ?? []} onCancel={cancel} />
            )}
            {pages > 1 ? (
              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {pages} · {total} total
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Balances this year</CardTitle>
          <CardDescription>Approval deducts; rejection or cancellation restores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(balData?.balances ?? []).length === 0 ? (
            <EmptyState title="No balances yet" />
          ) : (
            balData?.balances.map((b) => {
              const remaining = Math.max(0, b.quota - b.used)
              const pct = b.quota > 0 ? (b.used / b.quota) * 100 : 0
              const low = remaining <= 2
              return (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{LEAVE_TYPE_LABEL[b.type] ?? b.type}</span>
                    <span className={cn('tabular-nums font-semibold', low ? 'text-rose-600' : 'text-foreground')}>
                      {remaining.toFixed(1).replace(/\.0$/, '')} / {b.quota}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              )
            })
          )}
          <p className="rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Working days only — Sundays and holidays are skipped. Overlapping requests are rejected.
          </p>
        </CardContent>
      </Card>

      <ApplyRequestDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  )
}

export function MonthBadge({ month }: { month: string }) {
  return <StatusBadge value={fmtMonth(month)} kind="day" />
}

export function WorkMinutes({ minutes }: { minutes: number }) {
  return <span>{fmtMinutes(minutes)}</span>
}
