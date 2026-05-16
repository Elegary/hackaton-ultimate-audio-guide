import { useEffect, useRef, useState } from 'react'

export type GeoStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'unsupported'

export interface GeoFix {
  lat: number
  lng: number
  accuracy: number
  /** Heading from GPS movement, not compass. Often null when standing still. */
  speedHeading: number | null
  speed: number | null
  timestamp: number
}

interface GeoState {
  fix: GeoFix | null
  error: string | null
  status: GeoStatus
}

const HIGH_ACCURACY_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    fix: null,
    error: null,
    status: 'idle',
  })
  const watchIdRef = useRef<number | null>(null)

  const start = () => {
    if (!('geolocation' in navigator)) {
      setState({
        fix: null,
        error: 'Géolocalisation indisponible sur ce navigateur',
        status: 'unsupported',
      })
      return
    }
    if (watchIdRef.current !== null) return

    setState((s) => ({ ...s, status: 'pending', error: null }))

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speedHeading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          },
          error: null,
          status: 'granted',
        })
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED
        setState((s) => ({
          fix: s.fix,
          error: err.message,
          status: denied ? 'denied' : s.status === 'pending' ? 'denied' : s.status,
        }))
      },
      HIGH_ACCURACY_OPTS,
    )
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  return { ...state, start }
}
