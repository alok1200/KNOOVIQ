'use client'

/**
 * Geolocation hook (spec §6.2/§9): one-shot GPS with refresh, accuracy reporting
 * and a friendly step-by-step error help. Location is NEVER watched in the
 * background — only explicit punches / refresh calls.
 */
import { useCallback, useState } from 'react'

export type GpsState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  lat: number | null
  lng: number | null
  accuracy: number | null
  error: string | null
  help: string[]
  timestamp: number | null
}

const initial: GpsState = { status: 'idle', lat: null, lng: null, accuracy: null, error: null, help: [], timestamp: null }

export function useGeolocation() {
  const [state, setState] = useState<GpsState>(initial)

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({
        ...initial,
        status: 'error',
        error: 'This browser does not support geolocation.',
        help: ['Use a modern browser (Chrome, Safari, Edge, Firefox).'],
      })
      return
    }
    setState((s) => ({ ...s, status: 'loading', error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'ready',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          error: null,
          help: [],
          timestamp: Date.now(),
        })
      },
      (err) => {
        const help =
          err.code === err.PERMISSION_DENIED
            ? [
                'Click the lock / ⓘ icon in your browser address bar.',
                'Set "Location" permission to Allow for this site.',
                'Reload the page and press "Refresh GPS" again.',
                'Note: geolocation requires HTTPS (or localhost).',
              ]
            : err.code === err.POSITION_UNAVAILABLE
              ? ['Move to an open area (better signal).', 'Enable device location services (Settings → Location).', 'Press "Refresh GPS" again.']
              : ['GPS took too long to respond.', 'Move near a window / open space.', 'Press "Refresh GPS" again.']
        setState({
          ...initial,
          status: 'error',
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Check-in is disabled until GPS access is granted.'
              : err.code === err.POSITION_UNAVAILABLE
                ? 'Location unavailable — device GPS could not get a fix.'
                : 'GPS request timed out.',
          help,
        })
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  }, [])

  /** Demo mode (sandbox/preview): use the office coordinates so the flow is testable without device GPS. */
  const simulate = useCallback((lat: number, lng: number, accuracy = 8) => {
    setState({ status: 'ready', lat, lng, accuracy, error: null, help: [], timestamp: Date.now() })
  }, [])

  return { ...state, locate, simulate }
}
