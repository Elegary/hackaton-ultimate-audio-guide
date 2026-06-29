import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { useStore } from '../lib/store'
import type { POI } from '../lib/commands'

// 3D maps3d types aren't all in @types/google.maps yet — keep these opaque.
type Anything3D = unknown

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522, altitude: 400 } // Paris
const DEFAULT_RANGE = 2500
const DEFAULT_TILT = 65
const USER_MARKER_ALTITUDE = 2
const POI_MARKER_ALTITUDE = 5

let optionsConfigured = false

interface MapViewProps {
  position: { lat: number; lng: number; accuracy?: number } | null
  heading: number | null
}

export default function MapView({ position, heading }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Anything3D>(null)
  const userMarkerRef = useRef<Anything3D>(null)
  const poiMarkersRef = useRef<Map<string, Anything3D>>(new Map())
  const markerCtorRef = useRef<Anything3D>(null)
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

    // The 'beta' channel is required for Map3DElement at the moment.
    if (!optionsConfigured) {
      setOptions({ key: apiKey, v: 'beta' })
      optionsConfigured = true
    }

    let cancelled = false

    importLibrary('maps3d')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((lib: any) => {
        if (cancelled) return
        const { Map3DElement, Marker3DElement, MapMode } = lib
        const map3d = new Map3DElement({
          center: DEFAULT_CENTER,
          range: DEFAULT_RANGE,
          tilt: DEFAULT_TILT,
          heading: 0,
          mode: MapMode.HYBRID,
        })
        // replaceChildren makes the mount HMR-safe — wipes any stale element
        // left behind by a previous render before re-attaching.
        container.replaceChildren(map3d)
        mapRef.current = map3d
        markerCtorRef.current = Marker3DElement
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Google Maps failed to load'
        setError(msg)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Recenter on every fix; first fix tightens the camera range.
  useEffect(() => {
    const map = mapRef.current as { center: unknown; range: number } | null
    if (!map || !position) return

    map.center = { lat: position.lat, lng: position.lng, altitude: 400 }

    if (!firstFixDoneRef.current) {
      map.range = DEFAULT_RANGE
      firstFixDoneRef.current = true
    }

    // Drop / move the user marker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MarkerCtor = markerCtorRef.current as any
    if (!MarkerCtor) return
    const markerPos = {
      lat: position.lat,
      lng: position.lng,
      altitude: USER_MARKER_ALTITUDE,
    }
    if (!userMarkerRef.current) {
      const m = new MarkerCtor({
        position: markerPos,
        label: 'You',
        altitudeMode: 'RELATIVE_TO_GROUND',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).append(m)
      userMarkerRef.current = m
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(userMarkerRef.current as any).position = markerPos
    }
  }, [position])

  // Heading drives the camera rotation.
  useEffect(() => {
    const map = mapRef.current as { heading: number } | null
    if (!map || heading === null) return
    map.heading = heading
  }, [heading])

  // Sync POI markers with the store (current card + queue).
  useEffect(() => {
    const map = mapRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MarkerCtor = markerCtorRef.current as any
    if (!map || !MarkerCtor) return

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
      const existing = poiMarkersRef.current.get(poi.id)
      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = existing as any
        e.position = pos
        e.label = poi.name
      } else {
        const m = new MarkerCtor({
          position: pos,
          label: poi.name,
          altitudeMode: 'RELATIVE_TO_GROUND',
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).append(m)
        poiMarkersRef.current.set(poi.id, m)
      }
    }

    // Remove markers for POIs no longer in the set.
    for (const [id, marker] of poiMarkersRef.current) {
      if (!seen.has(id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(marker as any).remove?.()
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
