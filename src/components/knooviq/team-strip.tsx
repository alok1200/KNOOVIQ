'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareText, Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import { fmtTime } from '@/lib/dates'
import { StatusBadge, EmptyState } from './ui-bits'
import { NoteDialog } from './note-dialog'
import type { TodayResponse } from '@/types/api'

/** Team Notes & Workplace Status strip (spec §6.5 / §9). */
export function TeamStrip({ today }: { today: TodayResponse }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['team-status'],
    queryFn: () => api.teamStatus(),
    refetchInterval: 45_000,
  })

  const rows = (data?.rows ?? []).filter((r) => !r.isSelf)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-700" aria-hidden /> Team Status
          </CardTitle>
          <CardDescription>
            {data?.privacyNote ?? 'Location is checked only during Check In / Check Out.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
              <MessageSquareText className="mr-1 h-3.5 w-3.5" aria-hidden /> Update My Note
            </Button>
          </div>

          {isLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 w-56 shrink-0 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No teammates to show" hint="Your team will appear here as colleagues join." />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="w-56 shrink-0 rounded-lg border bg-card p-3 transition-colors hover:border-emerald-300"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-emerald-100 text-xs font-bold text-emerald-800">
                        {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.employeeId} · {r.department}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <StatusBadge value={r.status} kind="team" />
                  </div>
                  {r.note ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{r.note}</p> : null}
                  {r.expectedReturnAt ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">Back by {fmtTime(new Date(r.expectedReturnAt))}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        current={{
          status: today.statusNote?.status ?? (today.state === 'WORKING' ? 'WORKING_IN_OFFICE' : 'NOT_CHECKED_IN'),
          note: today.statusNote?.note ?? '',
          expectedReturnAt: today.statusNote?.expectedReturnAt ?? null,
        }}
      />
    </>
  )
}
