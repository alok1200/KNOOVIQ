'use client'

import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import { fmtTime } from '@/lib/dates'
import { TEAM_STATUS_LABEL } from '@/lib/labels'
import { EmptyState, Spinner, StatusBadge } from './ui-bits'

/** Team live dashboard (spec §9): who is in / on break / on leave / late today. */
export function TeamView() {
  const { data, isLoading } = useQuery({
    queryKey: ['team-status'],
    queryFn: () => api.teamStatus(),
    refetchInterval: 30_000,
  })

  const rows = data?.rows ?? []
  const inOffice = rows.filter((r) => r.state === 'WORKING' || (r.statusFromNote && ['WORKING_IN_OFFICE', 'IN_MEETING', 'CLIENT_VISIT'].includes(r.status)))
  const onBreak = rows.filter((r) => r.state === 'ON_BREAK')
  const away = rows.filter((r) => ['ON_LEAVE', 'WFH', 'OUT_OF_OFFICE', 'OUTSIDE'].includes(r.status) || r.state === 'CHECKED_OUT')
  const notIn = rows.filter((r) => r.state === 'NOT_CHECKED_IN' && r.status === 'NOT_CHECKED_IN')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Working now', value: inOffice.length, tone: 'text-emerald-700' },
          { label: 'On break', value: onBreak.length, tone: 'text-amber-700' },
          { label: 'Away / leave', value: away.length, tone: 'text-fuchsia-700' },
          { label: 'Not checked in', value: notIn.length, tone: 'text-slate-600' },
        ].map((s) => (
          <Card key={s.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{s.label}</CardDescription>
              <CardTitle className={`text-3xl font-black tabular-nums ${s.tone}`}>{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-700" aria-hidden /> People
          </CardTitle>
          <CardDescription>{data?.privacyNote ?? 'Location is checked only during Check In / Check Out.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState title="No people visible" hint="Ask HR to assign you a team." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <div key={r.id} className={`rounded-lg border p-3 ${r.isSelf ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-emerald-100 text-xs font-bold text-emerald-800">
                        {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {r.name} {r.isSelf ? <span className="text-[10px] font-normal text-emerald-700">(you)</span> : null}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.employeeId} · {r.department}
                      </p>
                    </div>
                    <StatusBadge value={r.status} kind="team" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {r.checkInAt ? <span>In since {fmtTime(new Date(r.checkInAt))}</span> : null}
                    {r.state === 'ON_BREAK' ? <span className="text-amber-700">On break</span> : null}
                    {r.expectedReturnAt ? <span>Back by {fmtTime(new Date(r.expectedReturnAt))}</span> : null}
                  </div>
                  {r.note ? (
                    <p className="mt-1.5 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                      “{r.note}”
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Statuses refresh live. {TEAM_STATUS_LABEL.WORKING_IN_OFFICE} means checked in and not on break.
      </p>
    </div>
  )
}
