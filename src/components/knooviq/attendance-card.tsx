'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Coffee, LogIn, LogOut, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiClientError } from '@/lib/api-client'
import { fmtMinutes } from '@/lib/dates'
import { StatusBadge } from './ui-bits'
import { cn } from '@/lib/utils'
import type { TodayResponse } from '@/types/api'

/**
 * Today's attendance actions (spec §9). Button enable/disable is derived ONLY
 * from `allowedActions` returned by the API (spec §6.1 problem 1) — the UI can
 * never show an enabled action the server would reject.
 */
export function AttendanceCard({
  today,
  gpsReady,
  ipVerified,
  onRequestGps,
}: {
  today: TodayResponse
  gpsReady: boolean
  ipVerified: boolean
  onRequestGps: () => void
}) {
  const qc = useQueryClient()
  const allowed = (a: string) => today.allowedActions.includes(a)
  const punchable = gpsReady || ipVerified // GPS fix OR registered office network

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance-today'] })
    qc.invalidateQueries({ queryKey: ['history'] })
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['team-status'] })
  }

  const punch = useMutation({
    mutationFn: (v: { action: 'check-in' | 'check-out'; withGps: boolean }) =>
      v.action === 'check-in'
        ? api.checkIn(v.withGps ? getPunchGps() : undefined)
        : api.checkOut(v.withGps ? getPunchGps() : undefined),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'check-in' ? 'Checked in — have a great day!' : 'Checked out. See you tomorrow!')
      invalidate()
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Punch failed'),
  })
  const brk = useMutation({
    mutationFn: (action: 'start-break' | 'end-break') => (action === 'start-break' ? api.breakStart() : api.breakEnd()),
    onSuccess: (_d, action) => {
      toast.success(action === 'start-break' ? 'Break started — enjoy!' : 'Break ended — back to work')
      invalidate()
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Break action failed'),
  })

  // GPS injection: the cards below pass real GPS via a shared ref — simpler:
  // the parent passes gps via context. To keep this component self-contained,
  // we use a module-level holder set by the dashboard.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Today&apos;s Attendance
          <StatusBadge value={today.state} kind="state" />
          {today.approvedModeToday ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
              Approved {today.approvedModeToday === 'WFH' ? 'WFH' : 'Official Work (Outside)'} — geofence not required
            </span>
          ) : null}
          {today.attendance?.flagged ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800" title={today.attendance.flagReason ?? ''}>
              Flagged for review
            </span>
          ) : null}
          {ipVerified ? (
            <span
              className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
              title="This device is on a network IP registered for your office — punches are accepted without GPS."
            >
              Office network verified (IP)
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>Buttons follow the server state machine — invalid actions are disabled</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {today.state === 'ON_BREAK' && today.attendance?.openBreakSince ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Timer className="h-4 w-4" aria-hidden />
            On break for <strong>{fmtMinutes(today.attendance.currentBreakMinutes)}</strong>
          </div>
        ) : null}

        {today.attendance?.autoClosed ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            You were auto checked-out yesterday (forgot to check out). Apply for Regularization to correct it.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PunchButton
            label="Check In"
            icon={<LogIn className="h-4 w-4" />}
            disabled={!allowed('check-in') || !punchable || punch.isPending}
            tooltip={!punchable && allowed('check-in') ? 'Get a GPS fix (Refresh GPS) or connect to the office Wi-Fi' : undefined}
            loading={punch.isPending && punch.variables?.action === 'check-in'}
            onClick={() => punch.mutate({ action: 'check-in', withGps: gpsReady })}
          />
          <PunchButton
            label="Check Out"
            icon={<LogOut className="h-4 w-4" />}
            disabled={!allowed('check-out') || !punchable || punch.isPending}
            tooltip={!punchable && allowed('check-out') ? 'Get a GPS fix (Refresh GPS) or connect to the office Wi-Fi' : undefined}
            loading={punch.isPending && punch.variables?.action === 'check-out'}
            onClick={() => punch.mutate({ action: 'check-out', withGps: gpsReady })}
          />
          <PunchButton
            label="Start Break"
            icon={<Coffee className="h-4 w-4" />}
            disabled={!allowed('start-break') || brk.isPending}
            loading={brk.isPending && brk.variables === 'start-break'}
            onClick={() => brk.mutate('start-break')}
          />
          <PunchButton
            label="End Break"
            icon={<Coffee className="h-4 w-4" />}
            disabled={!allowed('end-break') || brk.isPending}
            loading={brk.isPending && brk.variables === 'end-break'}
            onClick={() => brk.mutate('end-break')}
          />
        </div>

        {!gpsReady && !ipVerified ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <button type="button" className="font-medium text-emerald-700 underline underline-offset-2" onClick={onRequestGps}>
              Refresh GPS
            </button>{' '}
            to enable Check In / Check Out. Geolocation needs browser permission (and HTTPS outside localhost).
          </p>
        ) : null}
        {!gpsReady && ipVerified ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            No GPS fix, but this device is on the office network — Check In / Check Out will be verified by IP.
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Breaks may be taken outside the geofence — exiting the {today.office?.radiusMeters ?? 25} m zone is permitted while on break.
        </p>
      </CardContent>
    </Card>
  )
}

function PunchButton({
  label,
  icon,
  disabled,
  loading,
  tooltip,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  onClick: () => void
}) {
  return (
    <Button
      variant={label === 'Check In' ? 'default' : 'outline'}
      disabled={disabled}
      onClick={onClick}
      title={tooltip ?? label}
      className={cn('h-auto flex-col gap-1 py-3', label === 'Check In' && 'bg-emerald-700 hover:bg-emerald-800')}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      <span className="text-xs font-semibold">{label}</span>
    </Button>
  )
}

/** Shared GPS holder so punch mutations always send the latest fix. */
const gpsHolder: { lat: number; lng: number; accuracy: number } = { lat: 0, lng: 0, accuracy: 0 }
export function setPunchGps(gps: { lat: number | null; lng: number | null; accuracy: number | null }) {
  gpsHolder.lat = gps.lat ?? 0
  gpsHolder.lng = gps.lng ?? 0
  gpsHolder.accuracy = gps.accuracy ?? 0
}
function getPunchGps() {
  return { ...gpsHolder }
}
void gpsHolder
