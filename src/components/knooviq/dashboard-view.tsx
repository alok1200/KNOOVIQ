'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, ClipboardList, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiClientError } from '@/lib/api-client'
import { ipMatchesOfficeList } from '@/lib/geo'
import { useMe } from '@/hooks/use-auth'
import { useGeolocation } from '@/hooks/use-geolocation'
import { setPunchGps } from './attendance-card'
import { GpsCard } from './gps-card'
import { AttendanceCard } from './attendance-card'
import { TodaySummary } from './today-summary'
import { LeaveCards } from './leave-cards'
import { TeamStrip } from './team-strip'
import { HistoryTable, RequestsTable } from './tables'
import { ApplyRequestDialog } from './apply-request-dialog'
import { toast } from 'sonner'

/** Employee dashboard (spec §9): GPS card, actions, summary, allowances, team strip, tables. */
export function DashboardView({ onNavigate }: { onNavigate: (view: 'calendar' | 'requests' | 'approvals') => void }) {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const gps = useGeolocation()
  const [applyOpen, setApplyOpen] = useState(false)

  const { data: today, isLoading, error } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.attendanceToday(),
    refetchInterval: 60_000,
  })

  const { data: history } = useQuery({
    queryKey: ['history', 'recent'],
    queryFn: () => api.history({ page: 1 }),
  })

  const { data: myRequests } = useQuery({
    queryKey: ['requests', 'mine', 1],
    queryFn: () => api.myRequests({ page: 1 }),
  })

  const { data: pending } = useQuery({
    queryKey: ['pending-requests', 1],
    queryFn: () => api.pendingRequests({ page: 1 }),
    enabled: me?.user.role === 'MANAGER' || me?.user.role === 'HR_ADMIN',
    refetchInterval: 60_000,
  })

  // initial GPS attempt + keep punch GPS in sync
  useEffect(() => {
    gps.locate()
     
  }, [])

  useEffect(() => {
    setPunchGps({ lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy })
  }, [gps.lat, gps.lng, gps.accuracy])

  // office for simulate + radar
  const office = today?.office ?? null

  // Office-network (IP) presence: the server sees this client's public IP —
  // when HR registered it as an office IP, punches work without GPS.
  const { data: myIpData } = useQuery({
    queryKey: ['my-ip'],
    queryFn: () => api.meta.myIp(),
    staleTime: 10 * 60_000,
  })
  const myIp = myIpData?.ip ?? null
  const ipVerified = ipMatchesOfficeList(myIp, office?.allowedIps)

  const cancelRequest = async (id: string) => {
    try {
      await api.cancelRequest(id)
      toast.success('Request cancelled')
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not cancel request')
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }
  if (error || !today) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Could not load your attendance. Try refreshing the page.
        </CardContent>
      </Card>
    )
  }

  const pendingCount = pending?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <GpsCard
            office={office}
            gps={gps}
            ipVerified={ipVerified}
            myIp={myIp}
            onRefresh={gps.locate}
            onSimulate={() => office && gps.simulate(office.lat, office.lng, 8)}
          />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <AttendanceCard
            today={today}
            gpsReady={gps.status === 'ready'}
            ipVerified={ipVerified}
            onRequestGps={gps.locate}
          />
          <TodaySummary today={today} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Allowances</h2>
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            Apply Leave / WFH
          </Button>
        </div>
        <LeaveCards />
      </div>

      <TeamStrip today={today} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-emerald-700" aria-hidden /> My Requests
            </CardTitle>
            <CardDescription>Latest leave / WFH / regularization requests</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestsTable rows={(myRequests?.items ?? []).slice(0, 5)} onCancel={cancelRequest} />
            {(myRequests?.total ?? 0) > 5 ? (
              <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => onNavigate('requests')}>
                View all {myRequests?.total} requests →
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4 text-emerald-700" aria-hidden /> Recent Attendance
            </CardTitle>
            <CardDescription>Last punches and day statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <HistoryTable rows={(history?.items ?? []).slice(0, 7)} compact />
            <div className="mt-2 flex gap-3">
              <Button variant="link" size="sm" className="px-0" onClick={() => onNavigate('calendar')}>
                Open calendar →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingCount > 0 && (me?.user.role === 'MANAGER' || me?.user.role === 'HR_ADMIN') ? (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-amber-700" aria-hidden /> Approvals waiting for you
            </CardTitle>
            <CardDescription>
              {pendingCount} request{pendingCount === 1 ? '' : 's'} from your team need a decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => onNavigate('approvals')}>
              Review approvals →
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ApplyRequestDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  )
}
