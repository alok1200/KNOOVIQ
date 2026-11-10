'use client'

import { MapPin, RefreshCw, ShieldCheck, Wifi, WifiOff, Navigation } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { GpsState } from '@/hooks/use-geolocation'

/**
 * Live GPS geofence card (spec §9): zone status, distance, allowed radius,
 * GPS signal, radar visual, privacy badge. One-shot location only — never
 * tracked in the background (spec §6.6).
 */
export function GpsCard({
  office,
  gps,
  ipVerified,
  myIp,
  onRefresh,
  onSimulate,
}: {
  office: { name: string; lat: number; lng: number; radiusMeters: number; allowedIps?: string } | null
  gps: GpsState & { locate: () => void; simulate: (lat: number, lng: number, accuracy?: number) => void }
  ipVerified: boolean
  myIp: string | null
  onRefresh: () => void
  onSimulate: () => void
}) {
  const radius = office?.radiusMeters ?? 25
  const hasFix = gps.status === 'ready' && gps.lat !== null && gps.lng !== null && office
  const distance = hasFix && office ? haversine(gps.lat!, gps.lng!, office.lat, office.lng) : null
  const accuracy = gps.accuracy ?? 0

  const zone = !hasFix ? 'UNKNOWN' : distance! - accuracy <= radius ? 'INSIDE' : distance! <= radius * 6 ? 'NEAR' : 'OUTSIDE'
  const zoneLabel = { UNKNOWN: 'No GPS fix', INSIDE: 'Inside zone', NEAR: 'Near zone', OUTSIDE: 'Outside zone' }[zone]
  const zoneClass = {
    UNKNOWN: 'bg-slate-100 text-slate-700 border-slate-200',
    INSIDE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    NEAR: 'bg-amber-100 text-amber-800 border-amber-200',
    OUTSIDE: 'bg-rose-100 text-rose-800 border-rose-200',
  }[zone]
  const signal = !hasFix ? 0 : accuracy <= 10 ? 3 : accuracy <= 30 ? 2 : 1

  // radar position: clamp the user dot to the visual
  const scale = 160 // px for 4x radius
  const px = hasFix && distance !== null ? Math.min(1, distance / (radius * 4)) * (scale / 2 - 12) : 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-emerald-700" aria-hidden />
          GPS Geofence
        </CardTitle>
        <CardDescription>{office ? office.name : 'No office assigned'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={zoneClass}>{zoneLabel}</Badge>
          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
            Radius {radius} m
          </Badge>
          {ipVerified ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Office network (IP) ✓
            </Badge>
          ) : null}
          <Badge variant="outline" className="bg-emerald-50 text-emerald-900 border-emerald-200">
            <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> Privacy: checked only at punch
          </Badge>
        </div>

        {/* Radar visual */}
        <div className="relative mx-auto my-2" style={{ width: scale, height: scale }} aria-hidden>
          <div className="absolute inset-0 rounded-full border border-slate-200 bg-emerald-50/30" />
          <div className="absolute inset-[12.5%] rounded-full border border-slate-200 bg-emerald-100/40" />
          <div className="absolute inset-[25%] rounded-full border border-emerald-300 bg-emerald-200/50" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-700 shadow" />
          {hasFix ? (
            <div
              className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow transition-all duration-500"
              style={{ marginLeft: px - 7 }}
              title="Your position (schematic)"
            />
          ) : null}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-4 text-[9px] font-medium text-teal-900">Office</span>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border bg-muted/40 p-2">
            <dt className="text-[10px] font-medium uppercase text-muted-foreground">Distance</dt>
            <dd className="text-sm font-bold">{distance === null ? '—' : fmtDistance(distance)}</dd>
          </div>
          <div className="rounded-md border bg-muted/40 p-2">
            <dt className="text-[10px] font-medium uppercase text-muted-foreground">Accuracy</dt>
            <dd className={cn('text-sm font-bold', hasFix && accuracy > 100 && 'text-rose-600')}>
              {gps.accuracy === null ? '—' : `±${Math.round(gps.accuracy)} m`}
            </dd>
          </div>
          <div className="rounded-md border bg-muted/40 p-2">
            <dt className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
              {signal === 0 ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />} GPS
            </dt>
            <dd className="flex items-end justify-center gap-0.5 pt-0.5" aria-label={`Signal ${signal} of 3`}>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn('w-1.5 rounded-sm', i <= signal ? 'bg-emerald-600' : 'bg-slate-200')}
                  style={{ height: 4 + i * 4 }}
                />
              ))}
            </dd>
          </div>
        </dl>

        {hasFix && distance !== null && distance - accuracy > radius && ipVerified ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">GPS doesn’t match the office, but you’re on the office network ✓</p>
            <p className="mt-1 font-medium">
              Your connection comes from a network IP registered for {office?.name ?? 'your office'} — Check In / Check Out will be accepted and marked “Office Network”.
            </p>
            {myIp ? <p className="mt-1 text-[11px] opacity-80">Connected from IP {myIp}</p> : null}
          </div>
        ) : null}

        {hasFix && distance !== null && distance - accuracy > radius && !ipVerified ? (
          <div
            className={cn(
              'rounded-md border p-3 text-xs',
              zone === 'OUTSIDE' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900',
            )}
          >
            <p className="font-semibold">
              You are {fmtDistance(distance)} from {office?.name ?? 'the office'} (fence {radius} m).
              {zone === 'NEAR' ? ' GPS uncertainty (±' + Math.round(accuracy) + ' m) puts your punch outside the fence.' : ''}
            </p>
            <p className="mt-1.5 font-medium">Why this happens:</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              <li>Desktops/laptops estimate location from Wi-Fi or IP — often hundreds of metres off, even indoors.</li>
              <li>The office coordinates saved in the system may not match your actual building.</li>
            </ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={onSimulate}>
              <Navigation className="mr-1 h-3 w-3" aria-hidden /> Use office location (demo)
            </Button>
            <p className="mt-1.5 text-[11px] font-medium">
              Physically at the office? HR can fix this permanently: Admin → Offices → Edit office → “Use my current location”.
            </p>
          </div>
        ) : null}

        {hasFix && (gps.accuracy ?? 0) > 100 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            GPS accuracy is ±{Math.round(gps.accuracy ?? 0)} m — punches need ±100 m or better. Move near a window or open space, then press Refresh GPS.
          </div>
        ) : null}

        {gps.status === 'error' ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">{gps.error}</p>
            <p className="mt-1 font-medium">Try these steps:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {gps.help.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
            <Button size="sm" variant="outline" className="mt-2" onClick={onSimulate}>
              <Navigation className="mr-1 h-3 w-3" aria-hidden /> Use office location (demo)
            </Button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onRefresh} disabled={gps.status === 'loading'}>
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', gps.status === 'loading' && 'animate-spin')} aria-hidden />
            {gps.status === 'loading' ? 'Locating…' : 'Refresh GPS'}
          </Button>
        </div>
        <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
          Location is read only when you check in/out or press Refresh. Never in the background.
        </p>
      </CardContent>
    </Card>
  )
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Human-friendly distance: metres below 1 km, kilometres above. */
function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} km`
}
