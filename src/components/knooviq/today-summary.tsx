'use client'

import { useEffect, useState } from 'react'
import { PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtTime, fmtMinutes } from '@/lib/dates'
import { KV, StatusBadge } from './ui-bits'
import { NoteDialog } from './note-dialog'
import { TEAM_STATUS_LABEL } from '@/lib/labels'
import type { TodayResponse } from '@/types/api'

/** Today's summary: check-in/out, live working hours, break duration, status + note (spec §9). */
export function TodaySummary({ today }: { today: TodayResponse }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [, setTick] = useState(0)

  // live ticking for working/break timers
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const att = today.attendance
  const now = Date.now()
  const gross = att?.checkInAt && !att?.checkOutAt ? Math.floor((now - new Date(att.checkInAt).getTime()) / 60000) : null
  const liveBreak = att?.currentBreakMinutes ?? 0
  const workLive = gross !== null ? Math.max(0, gross - (att?.breakMinutes ?? 0) - (att && att.openBreakSince ? liveBreak : liveBreak)) : att?.workMinutes ?? 0
  const breakTotal = att ? att.breakMinutes + (att.openBreakSince ? liveBreak : 0) : 0

  const note = today.statusNote
  const statusLabel = note?.status ? TEAM_STATUS_LABEL[note.status] ?? note.status : ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today&apos;s Summary</CardTitle>
        <CardDescription>{fmtTime(att?.checkInAt ? new Date(att.checkInAt) : null)} first punch · server time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KV label="Check In" value={fmtTime(att?.checkInAt ? new Date(att.checkInAt) : null)} />
          <KV label="Check Out" value={fmtTime(att?.checkOutAt ? new Date(att.checkOutAt) : null)} />
          <KV
            label="Working"
            value={workLive > 0 || att?.checkInAt ? fmtMinutes(workLive) : '—'}
          />
          <KV label="Break" value={breakTotal > 0 ? fmtMinutes(breakTotal) : '—'} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={today.state} kind="state" />
            {today.isLateToday ? <StatusBadge value="LATE" kind="day" /> : null}
            <span className="text-sm text-muted-foreground">
              {note?.note ? (
                <>
                  <span className="font-medium text-foreground">{statusLabel}</span>
                  {note.note ? ` — ${note.note}` : ''}
                  {note.expectedReturnAt ? ` (back by ${fmtTime(new Date(note.expectedReturnAt))})` : ''}
                </>
              ) : (
                'No status note set'
              )}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
            <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden /> Change
          </Button>
        </div>

        <NoteDialog
          open={noteOpen}
          onOpenChange={setNoteOpen}
          current={{
            status: note?.status ?? (today.state === 'WORKING' ? 'WORKING_IN_OFFICE' : 'NOT_CHECKED_IN'),
            note: note?.note ?? '',
            expectedReturnAt: note?.expectedReturnAt ?? null,
          }}
        />
      </CardContent>
    </Card>
  )
}
