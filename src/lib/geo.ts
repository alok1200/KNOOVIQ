/**
 * Geofence utilities (spec §6.2) — pure functions, safe on client and server.
 * Server computes Haversine distance; a punch is accepted when
 * distance - accuracy <= radiusMeters AND accuracy <= maxAccuracyMeters.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export interface GeofenceResult {
  distance: number
  accuracy: number
  inside: boolean
  allowed: boolean
  reason?: string
}

export function evaluateGeofence(opts: {
  lat: number
  lng: number
  accuracy: number
  officeLat: number
  officeLng: number
  radiusMeters: number
  maxAccuracyMeters: number
}): GeofenceResult {
  const { lat, lng, accuracy, officeLat, officeLng, radiusMeters, maxAccuracyMeters } = opts
  const distance = haversineMeters(lat, lng, officeLat, officeLng)
  const inside = distance <= radiusMeters

  if (accuracy > maxAccuracyMeters) {
    return {
      distance,
      accuracy,
      inside,
      allowed: false,
      reason: `GPS accuracy too low: ±${Math.round(accuracy)} m (maximum allowed is ±${maxAccuracyMeters} m). Move to an open area and retry.`,
    }
  }
  if (distance - accuracy > radiusMeters) {
    return {
      distance,
      accuracy,
      inside,
      allowed: false,
      reason: `You are ${Math.round(distance)} m from the office (allowed radius ${radiusMeters} m, GPS uncertainty ±${Math.round(accuracy)} m).`,
    }
  }
  return { distance, accuracy, inside, allowed: true }
}

/* ------------------------- office-network (IP) presence ------------------------- */

/** Normalize an IP for comparison: strip IPv6-mapped prefix and whitespace. */
export function normalizeIp(raw: string): string {
  return raw.trim().replace(/^::ffff:/i, '')
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255 || !/^\d{1,3}$/.test(part)) return null
    out = out * 256 + n
  }
  return out
}

/** True when `ip` falls inside an IPv4 CIDR block like "182.71.0.0/16". */
function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const ipLong = ipv4ToLong(ip)
  const baseLong = ipv4ToLong(base)
  if (ipLong === null || baseLong === null) return false
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (ipLong & mask) === (baseLong & mask)
}

/**
 * Office-network presence check: does the client's public IP match any entry in
 * the office's comma-separated allow-list (exact IPs, IPv4 CIDR ranges, or
 * wildcard forms like 182.71.*.*)? Empty list → IP presence disabled.
 */
export function ipMatchesOfficeList(clientIp: string | null | undefined, allowedList: string | null | undefined): boolean {
  const ip = clientIp ? normalizeIp(clientIp) : ''
  if (!ip || ip === 'unknown' || !allowedList) return false
  const entries = allowedList
    .split(',')
    .map((e) => normalizeIp(e))
    .filter(Boolean)
  if (entries.length === 0) return false

  for (const entry of entries) {
    if (entry === ip) return true
    if (entry.includes('/')) {
      if (ipInCidr(ip, entry)) return true
      continue
    }
    if (entry.includes('*')) {
      // wildcard: 182.71.*.* → regex-escape then replace * with [^.]+ segments
      const re = new RegExp(`^${entry.split('.').map((p) => (p === '*' ? '\\d+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('\\.')}$`)
      if (re.test(ip)) return true
    }
  }
  return false
}
