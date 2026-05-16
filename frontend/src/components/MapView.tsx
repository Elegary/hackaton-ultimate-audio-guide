import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { useStore } from '../lib/store'
import type { POI } from '../lib/commands'
import { destinationPoint } from '../lib/geo-math'

// 3D maps3d types aren't all in @types/google.maps yet — keep these opaque.
type Anything3D = unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor = any

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522, altitude: 400 } // Paris
const DEFAULT_RANGE = 1500
const DEFAULT_TILT = 60
const USER_MARKER_ALTITUDE = 2
const POI_MARKER_ALTITUDE = 5

const ARROW_LENGTH_M = 22
const ARROW_HALF_WIDTH_M = 7

let optionsConfigured = false

interface MapViewProps {
  position: { lat: number; lng: number; accuracy?: number } | null
  heading: number | null
}

interface CtorBundle {
  Marker3DElement: AnyCtor
  Polygon3DElement: AnyCtor
}

/** Build the 3 ground-clamped vertices of a forward-pointing arrow. */
function arrowOuterCoordinates(
  origin: { lat: number; lng: number },
  heading: number,
) {
  const tip = destinationPoint(origin, heading, ARROW_LENGTH_M)
  const left = destinationPoint(origin, (heading - 90 + 360) % 360, ARROW_HALF_WIDTH_M)
  const right = destinationPoint(origin, (heading + 90) % 360, ARROW_HALF_WIDTH_M)
  // Polygon outer ring — close by repeating the tip.
  return [
    { lat: tip.lat, lng: tip.lng, altitude: 0 },
    { lat: right.lat, lng: right.lng, altitude: 0 },
    { lat: left.lat, lng: left.lng, altitude: 0 },
    { lat: tip.lat, lng: tip.lng, altitude: 0 },
  ]
}

export default function MapView({ position, heading }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Anything3D>(null)
  const userMarkerRef = useRef<Anything3D>(null)
  const arrowRef = useRef<Anything3D>(null)
  const poiMarkersRef = useRef<Map<string, Anything3D>>(new Map())
  const ctorsRef = useRef<CtorBundle | null>(null)
  const firstFixDoneRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const currentCard = useStore((s) => s.currentCard)
  const activityQueue = useStore((s) => s.activityQueue)
  const highlightedId = useStore((s) => s.highlightedPoiId)

  // Bootstrap the 3D map once.
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setError('VITE_GOOGLE_MAPS_API_KEY not set — create frontend/.env.local')
      return
    }

    const container = containerRef.current
    if (!container) return

    if (!optionsConfigured) {
      setOptions({ key: apiKey, v: 'beta' })
      optionsConfigured = true
    }

    let cancelled = false

    importLibrary('maps3d')
      .then((lib: AnyCtor) => {
        if (cancelled) return
        const { Map3DElement, Marker3DElement, Polygon3DElement, MapMode } = lib
        const map3d = new Map3DElement({
          center: DEFAULT_CENTER,
          range: DEFAULT_RANGE,
          tilt: DEFAULT_TILT,
          heading: 0,
          mode: MapMode.HYBRID,
        })
        // HMR-safe — drop any stale element before re-attaching.
        container.replaceChildren(map3d)
        mapRef.current = map3d
        ctorsRef.current = { Marker3DElement, Polygon3DElement }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Google Maps failed to load'
        setError(msg)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Recenter + drop/update the user marker + heading arrow on each fix.
  useEffect(() => {
    const map = mapRef.current as { center: unknown } | null
    const ctors = ctorsRef.current
    if (!map || !position || !ctors) return

    map.center = { lat: position.lat, lng: position.lng, altitude: 400 }

    if (!firstFixDoneRef.current) {
      ;(map as AnyCtor).range = DEFAULT_RANGE
      firstFixDoneRef.current = true
    }

    // User dot — 3D marker labelled "You".
    const markerPos = {
      lat: position.lat,
      lng: position.lng,
      altitude: USER_MARKER_ALTITUDE,
    }
    if (!userMarkerRef.current) {
      const m = new ctors.Marker3DElement({
        position: markerPos,
        label: 'You',
        altitudeMode: 'RELATIVE_TO_GROUND',
      })
      ;(map as AnyCtor).append(m)
      userMarkerRef.current = m
    } else {
      ;(userMarkerRef.current as AnyCtor).position = markerPos
    }
  }, [position])

  // Heading arrow — driven by `heading` (real compass on phone, mock slider
  // on desktop, both fed through `effectiveHeading` in App.tsx). Camera is
  // intentionally NOT rotated, otherwise the arrow would appear stationary
  // on screen and the rotation would be invisible.
  useEffect(() => {
    const map = mapRef.current
    const ctors = ctorsRef.current
    if (!map || !ctors || !position) return

    if (heading === null) {
      // Hide the arrow when no heading is known.
      const existing = arrowRef.current as AnyCtor
      existing?.remove?.()
      arrowRef.current = null
      return
    }

    const coords = arrowOuterCoordinates(
      { lat: position.lat, lng: position.lng },
      heading,
    )
    if (!arrowRef.current) {
      const arrow = new ctors.Polygon3DElement({
        outerCoordinates: coords,
        fillColor: 'rgba(196, 69, 54, 0.85)',
        strokeColor: '#1a1a1a',
        strokeWidth: 2,
        altitudeMode: 'CLAMP_TO_GROUND',
        extruded: false,
      })
      ;(map as AnyCtor).append(arrow)
      arrowRef.current = arrow
    } else {
      ;(arrowRef.current as AnyCtor).outerCoordinates = coords
    }
  }, [position, heading])

  // Sync POI markers with the store (current card + queue).
  useEffect(() => {
    const map = mapRef.current
    const ctors = ctorsRef.current
    if (!map || !ctors) return

    const allPois: POI[] = [
      ...(currentCard ? [currentCard] : []),
      ...activityQueue,
    ]
    const seen = new Set<string>()

    for (const poi of allPois) {
      seen.add(poi.id)
      const pos = {
        lat: poi.lat,
        lng: poi.lng,
        altitude: POI_MARKER_ALTITUDE,
      }
      const existing = poiMarkersRef.current.get(poi.id) as AnyCtor
      if (existing) {
        existing.position = pos
        existing.label = poi.name
      } else {
        const m = new ctors.Marker3DElement({
          position: pos,
          label: poi.name,
          altitudeMode: 'RELATIVE_TO_GROUND',
        })
        ;(map as AnyCtor).append(m)
        poiMarkersRef.current.set(poi.id, m)
      }
    }

    // Remove markers for POIs no longer in the set.
    for (const [id, marker] of poiMarkersRef.current) {
      if (!seen.has(id)) {
        ;(marker as AnyCtor).remove?.()
        poiMarkersRef.current.delete(id)
      }
    }
  }, [currentCard, activityQueue, highlightedId])

  return (
    <div className="map-stage">
      <div ref={containerRef} className="map-container" />
      {error && (
        <div className="map-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
