import { useEffect, useRef } from 'react'
import type { FrontendEvent } from '../lib/commands'

const POSITION_INTERVAL_MS = 2000
const HEADING_THRESHOLD_DEG = 15

interface PositionInput {
  lat: number
  lng: number
  accuracy: number
}

/**
 * Pushes `position_update` events to the backend on a throttled cadence:
 * once every ~2s, or immediately when the heading drifts more than 15°.
 * Matches the backend's expectations from CLAUDE.md.
 */
export function usePositionUpload(
  send: (e: FrontendEvent) => void,
  position: PositionInput | null,
  heading: number | null,
) {
  const lastSentAt = useRef(0)
  const lastHeading = useRef<number | null>(null)

  useEffect(() => {
    if (!position) return

    const now = Date.now()
    const headingChanged =
      heading !== null &&
      lastHeading.current !== null &&
      Math.abs(heading - lastHeading.current) > HEADING_THRESHOLD_DEG

    if (now - lastSentAt.current > POSITION_INTERVAL_MS || headingChanged) {
      send({
        type: 'position_update',
        lat: position.lat,
        lng: position.lng,
        heading,
        accuracy: position.accuracy,
      })
      lastSentAt.current = now
      lastHeading.current = heading
    }
  }, [position, heading, send])
}
