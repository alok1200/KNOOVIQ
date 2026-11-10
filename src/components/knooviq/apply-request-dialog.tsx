'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiClientError } from '@/lib/api-client'
import { LEAVE_TYPE_LABEL, REQUEST_TYPE_LABEL } from '@/lib/labels'
import { todayISO } from '@/lib/dates'
import { fmtDate } from '@/lib/dates'

const DATED_TYPES = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH', 'OFFICIAL_WORK_OUTSIDE']

/** React-recommended render-phase adjust (avoids effect cascades). */
function useAdjustState(dep: unknown, adjust: () => void) {
  const [prev, setPrev] = useState(dep)
  if (prev !== dep) {
    setPrev(dep)
    adjust()
  }
}

/** "Apply Leave / WFH / Outside / Regularization" dialog (spec §6.4, §9). */
export function ApplyRequestDialog({
  open,
  onOpenChange,
  defaultType,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultType?: string
}) {
  const qc = useQueryClient()
  const [type, setType] = useState(defaultType && defaultType !== 'REGULARIZATION' ? defaultType : 'CASUAL_LEAVE')
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [regDate, setRegDate] = useState(todayISO())
  const [regIn, setRegIn] = useState('09:00')
  const [regOut, setRegOut] = useState('18:00')

  const { data: balData } = useQuery({
    queryKey: ['balances'],
    queryFn: () => api.leaveBalances(),
    enabled: open,
  })

  const balanceFor = useMemo(() => {
    const map = new Map<string, { quota: number; used: number }>()
    for (const b of balData?.balances ?? []) map.set(b.type, { quota: b.quota, used: b.used })
    return map
  }, [balData])

  useAdjustState(`${open}|${defaultType ?? ''}`, () => {
    if (open) {
      setType(defaultType ?? 'CASUAL_LEAVE')
      setReason('')
      setHalfDay(false)
    }
  })

  const isReg = type === 'REGULARIZATION'
  const remaining = balanceFor.get(type)

  const create = useMutation({
    mutationFn: () =>
      isReg
        ? api.createRequest({ type, regDate, regInTime: regIn, regOutTime: regOut, reason: reason.trim() })
        : api.createRequest({ type, fromDate, toDate, halfDay, reason: reason.trim() }),
    onSuccess: () => {
      toast.success(isReg ? 'Regularization request submitted' : 'Request submitted for approval')
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['pending-requests'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['attendance-today'] })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Could not submit request'),
  })

  const sameDay = fromDate === toDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" aria-describedby="apply-desc">
        <DialogHeader>
          <DialogTitle>Apply for {isReg ? 'Regularization' : REQUEST_TYPE_LABEL[type] ?? 'leave'}</DialogTitle>
          <DialogDescription id="apply-desc">
            {isReg
              ? 'Correct a missed or failed punch. Your manager/HR will review it.'
              : 'Working days only — Sundays and holidays are skipped automatically.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Request type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Request type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATED_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {REQUEST_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
                <SelectItem value="REGULARIZATION">Regularization (fix a punch)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isReg ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-date">Date</Label>
                  <Input id="reg-date" type="date" value={regDate} max={todayISO()} onChange={(e) => setRegDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-in">Check in</Label>
                  <Input id="reg-in" type="time" value={regIn} onChange={(e) => setRegIn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-out">Check out</Label>
                  <Input id="reg-out" type="time" value={regOut} onChange={(e) => setRegOut(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="from-date">From</Label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value)
                      if (toDate < e.target.value) setToDate(e.target.value)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="to-date">To</Label>
                  <Input id="to-date" type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="half-day" checked={halfDay} disabled={!sameDay} onCheckedChange={(v) => setHalfDay(v === true)} />
                <Label htmlFor="half-day" className="text-sm font-normal">
                  Half day {sameDay ? '' : <span className="text-muted-foreground">(single-day requests only)</span>}
                </Label>
              </div>
              {remaining ? (
                <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {LEAVE_TYPE_LABEL[type] ?? type}: <strong className="text-foreground">{(remaining.quota - remaining.used).toFixed(1)}</strong>&nbsp;of {remaining.quota} day(s) remaining this year.
                </p>
              ) : null}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason <span className="text-muted-foreground">(min 10 characters)</span></Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain briefly…"
              rows={3}
              minLength={10}
              required
            />
          </div>

          {!isReg && fromDate && toDate ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {fmtDate(fromDate)}
              {sameDay ? '' : ` – ${fmtDate(toDate)}`}
              {halfDay ? ' · half day' : ''}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || reason.trim().length < 10}
          >
            {create.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
