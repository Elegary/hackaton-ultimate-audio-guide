import { useCallback, useEffect, useRef, useState } from 'react'

export type CompassStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'no-sensor'

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

type WebKitDeviceOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
}

const NO_SENSOR_TIMEOUT_MS = 3000

export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null)
  const [status, setStatus] = useState<CompassStatus>('idle')
  const gotEventRef = useRef(false)
  const handlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null)
  const noSensorTimerRef = useRef<number | null>(null)

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    gotEventRef.current = true
    const evt = e as WebKitDeviceOrientationEvent

    if (typeof evt.webkitCompassHeading === 'number') {
      // iOS: already a compass heading from magnetic north (0–360, increasing clockwise)
      setHeading(evt.webkitCompassHeading)
      return
    }
    if (typeof e.alpha === 'number') {
      // Android / standard: alpha is rotation around z, 0 when device top faces magnetic north.
      // Compass heading = (360 - alpha) mod 360.
      setHeading((360 - e.alpha + 360) % 360)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      setStatus('unsupported')
      return
    }

    setStatus('pending')
    gotEventRef.current = false

    const ctor = DeviceOrientationEvent as IOSDeviceOrientationEvent
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission()
        if (result !== 'granted') {
          setStatus('denied')
          return
        }
      } catch {
        // requestPermission throws if not called from a user gesture
        setStatus('denied')
        return
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true)
    handlerRef.current = handleOrientation
    setStatus('granted')

    noSensorTimerRef.current = window.setTimeout(() => {
      if (!gotEventRef.current) {
        setStatus('no-sensor')
      }
    }, NO_SENSOR_TIMEOUT_MS)
  }, [handleOrientation])

  useEffect(() => {
    return () => {
      if (handlerRef.current) {
        window.removeEventListener('deviceorientation', handlerRef.current, true)
        handlerRef.current = null
      }
      if (noSensorTimerRef.current !== null) {
        window.clearTimeout(noSensorTimerRef.current)
      }
    }
  }, [])

  return { heading, status, requestPermission }
}
