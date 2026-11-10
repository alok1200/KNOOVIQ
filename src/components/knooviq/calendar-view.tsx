'use client'

/**
 * Calendar view — monthly colour-coded attendance calendar (spec §9).
 * Monday-first grid with shared status tones, holiday/weekend muting,
 * flagged + auto-closed markers and a per-day detail card on click.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDays, ChevronLeft, ChevronRight, Moon, TriangleAlert } from 'lucide-react'

import { api, ApiClientError } from '@/lib/api-client'
import {
  currentMonth,
  dowISO,
  fmtDate,
  fmtMinutes,
  fmtMonth,
  fmtTime,
  monthGrid,
  nextMonth,
  prevMonth,
  todayISO,
} from '@/lib/dates'
import { DAY_STATUS_LABEL, statusTone } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, KV, StatusBadge } from '@/components/knooviq/ui-bits'
import type { CalendarDay } from '@/types/api'

const WEEKDAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

/** Legend entries — spec §9 labels, tones come from the shared statusTone vocabulary. */
const LEGEND: { value: string; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'HALF_DAY', label: 'Half Day' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'WFH', label: 'WFH' },
  { value: 'OUTSIDE', label: 'Official Work (Outside)' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'WEEKLY_OFF', label: 'Weekly Off' },
  { value: 'NOT_CHECKED_IN', label: 'Not Checked In' },
]

function toDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function CalendarView() {
  const [month, setMonth] = useState<string>(currentMonth)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['calendar', month], queryFn: () => api.calendar(month) })

  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : 'Failed to load the attendance calendar')
    }
  }, [query.isError, query.error])

  const cells = useMemo(() => monthGrid(month), [month])

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>()
    for (const d of query.data?.days ?? []) m.set(d.date, d)
    return m
  }, [query.data])

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of query.data?.holidays ?? []) m.set(h.date, h.name)
    return m
  }, [query.data])

  const today = todayISO()
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined
  const selectedHoliday = selectedDate ? holidayMap.get(selectedDate) : undefined
  const days = query.data?.days ?? []

  const goMonth = (m: string) => {
    setMonth(m)
    setSelectedDate(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-emerald-700" aria-hidden />
          Attendance calendar
        </CardTitle>
        <CardDescription>Monthly colour-coded attendance — click a day for details</CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => goMonth(prevMonth(month))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
              {fmtMonth(month)}
            </span>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => goMonth(nextMonth(month))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={month === currentMonth()} onClick={() => goMonth(currentMonth())}>
              Today
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {query.isPending ? (
          <div className="grid grid-cols-7 gap-1.5" aria-hidden>
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg sm:h-20" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title="Couldn't load the calendar"
            hint={
              query.error instanceof ApiClientError && query.error.status === 401
                ? 'Your session may have expired. Reload the page — you will be asked to sign in again if needed.'
                : 'Please try again in a moment.'
            }
          />
        ) : days.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="No attendance data"
            hint={`No attendance days recorded for ${fmtMonth(month)}.`}
          />
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[588px] grid-cols-7 gap-1.5">
                {WEEKDAY_HEADERS.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      'pb-1 text-center text-[11px] font-semibold uppercase tracking-wide',
                      i >= 5 ? 'text-muted-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </div>
                ))}

                {cells.map((cell, idx) => {
                  const iso = cell.iso
                  const day = dayMap.get(iso)
                  const holiday = holidayMap.get(iso)
                  const dow = dowISO(iso)
                  const isWeekend = dow === 0 || dow === 6
                  const isSelected = iso === selectedDate
                  const isToday = iso === today
                  const statusLabel = day ? (DAY_STATUS_LABEL[day.status] ?? day.status) : undefined

                  const cellDescription = [
                    fmtDate(iso),
                    holiday ? `Holiday: ${holiday}` : null,
                    statusLabel,
                    day?.autoClosed ? 'Auto-closed' : null,
                    day?.flagged ? 'Flagged' : null,
                  ].filter((p): p is string => Boolean(p))

                  return (
                    <button
                      // Out-of-month lead/trail cells can repeat an ISO date that also
                      // exists inside the month (e.g. a month starting on Sunday), so
                      // the key must include the grid index to stay unique.
                      key={`${iso}-${idx}`}
                      type="button"
                      disabled={!cell.inMonth}
                      onClick={() => setSelectedDate(iso)}
                      aria-pressed={isSelected}
                      aria-label={cellDescription.join(' · ')}
                      title={cellDescription.join(' · ')}
                      className={cn(
                        'relative flex h-16 flex-col rounded-lg border p-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-20',
                        !cell.inMonth && 'cursor-default border-transparent bg-transparent text-muted-foreground/40',
                        cell.inMonth && !day && !holiday && isWeekend && 'border-transparent bg-muted/40 text-muted-foreground',
                        cell.inMonth && !day && !holiday && !isWeekend && 'bg-card hover:bg-accent/60',
                        cell.inMonth && holiday && !day && 'border-border bg-muted/60 text-muted-foreground',
                        cell.inMonth && day && statusTone(day.status),
                        isSelected && 'ring-2 ring-emerald-600 ring-offset-2 ring-offset-background',
                        !isSelected && isToday && 'border-emerald-600/70'
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-1">
                        <span className="font-semibold">{Number(iso.slice(8, 10))}</span>
                        <span className="flex items-center gap-0.5" aria-hidden>
                          {day?.flagged ? <TriangleAlert className="h-3 w-3 text-rose-600" /> : null}
                          {day?.autoClosed ? <Moon className="h-3 w-3 text-slate-500" /> : null}
                        </span>
                      </span>
                      {day ? (
                        <span className={cn('mt-auto h-2 w-2 rounded-full border', statusTone(day.status))} aria-hidden />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Status colour legend">
              {LEGEND.map((l) => (
                <span
                  key={l.value}
                  role="listitem"
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  <span className={cn('h-2 w-2 rounded-full border', statusTone(l.value))} aria-hidden />
                  {l.label}
                </span>
              ))}
            </div>
          </>
        )}

        {selectedDay ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {fmtDate(selectedDay.date)}
                <StatusBadge value={selectedDay.status} kind="day" />
                {selectedDay.flagged ? (
                  <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                    Flagged
                  </span>
                ) : null}
                {selectedDay.autoClosed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Moon className="h-3 w-3" aria-hidden />
                    Auto-closed
                  </span>
                ) : null}
              </CardTitle>
              {selectedHoliday ? <CardDescription>{selectedHoliday}</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6 px-4">
              <KV label="Check In" value={fmtTime(toDateOrNull(selectedDay.checkInAt))} />
              <KV label="Check Out" value={fmtTime(toDateOrNull(selectedDay.checkOutAt))} />
              <KV label="Total Work" value={fmtMinutes(selectedDay.workMinutes)} />
              {selectedHoliday ? <KV label="Holiday" value={selectedHoliday} /> : null}
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  )
}
