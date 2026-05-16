import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { useStore } from '../lib/store'
import type { POI } from '../lib/commands'

const editorialMapStyle: google.maps.MapTypeStyle[] = [
  // Strip Google's noise first
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Paper / land / water
  { elementType: 'geometry', stylers: [{ color: '#e8a598' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#f4ede2' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e8a598' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#edb0a3' }] },

  // Roads as cream cuts
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f4ede2' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d97b6a' }, { weight: 0.5 }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },

  // Type: only major labels, in ink
  { elementType: 'labels.text.fill', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4ede2' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
]

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 } // Paris (placeholder until first fix)
const DEFAULT_ZOOM = 14
const FIRST_FIX_ZOOM = 17

let optionsConfigured = false

interface MapViewProps {
  position: { lat: number; lng: number; accuracy?: number } | null
  heading: number | null
}

export default function MapView({ position, heading }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const dotMarkerRef = useRef<google.maps.Marker | null>(null)
  const arrowMarkerRef = useRef<google.maps.Marker | null>(null)
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null)
  const poiMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const firstFixDoneRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const currentCard = useStore((s) => s.currentCard)
  const activityQueue = useStore((s) => s.activityQueue)
  const highlightedId = useStore((s) => s.highlightedPoiId)

  // Bootstrap the map once.
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setError('VITE_GOOGLE_MAPS_API_KEY non défini — créez frontend/.env.local')
      return
    }

    const container = containerRef.current
    if (!container) return

    if (!optionsConfigured) {
      setOptions({ key: apiKey, v: 'weekly' })
      optionsConfigured = true
    }

    let cancelled = false

    importLibrary('maps')
      .then(({ Map }) => {
        if (cancelled) return
        const map = new Map(container, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          styles: editorialMapStyle,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          backgroundColor: '#f4ede2',
          maxZoom: 18,
          clickableIcons: false,
        })
        mapRef.current = map
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Échec du chargement de Google Maps'
        setError(msg)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // User position → recenter on first fix, update dot + accuracy circle on every fix.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const latLng = { lat: position.lat, lng: position.lng }

    if (!firstFixDoneRef.current) {
      map.panTo(latLng)
      map.setZoom(FIRST_FIX_ZOOM)
      firstFixDoneRef.current = true
    }

    if (!dotMarkerRef.current) {
      dotMarkerRef.current = new google.maps.Marker({
        position: latLng,
        map,
        zIndex: 30,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#c44536',
          fillOpacity: 1,
          strokeColor: '#f4ede2',
          strokeWeight: 3,
          scale: 7,
        },
      })
    } else {
      dotMarkerRef.current.setPosition(latLng)
    }

    if (typeof position.accuracy === 'number') {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new google.maps.Circle({
          map,
          center: latLng,
          radius: position.accuracy,
          fillColor: '#c44536',
          fillOpacity: 0.08,
          strokeColor: '#c44536',
          strokeOpacity: 0.25,
          strokeWeight: 1,
          clickable: false,
          zIndex: 10,
        })
      } else {
        accuracyCircleRef.current.setCenter(latLng)
        accuracyCircleRef.current.setRadius(position.accuracy)
      }
    }
  }, [position])

  // User heading → rotate arrow marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position || heading === null) return

    const latLng = { lat: position.lat, lng: position.lng }
    const icon: google.maps.Symbol = {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      fillColor: '#1a1a1a',
      fillOpacity: 1,
      strokeColor: '#1a1a1a',
      strokeWeight: 1,
      scale: 4,
      rotation: heading,
      anchor: new google.maps.Point(0, 4),
    }

    if (!arrowMarkerRef.current) {
      arrowMarkerRef.current = new google.maps.Marker({
        position: latLng,
        map,
        icon,
        zIndex: 40,
        clickable: false,
      })
    } else {
      arrowMarkerRef.current.setPosition(latLng)
      arrowMarkerRef.current.setIcon(icon)
    }
  }, [position, heading])

  // POIs from store (current card + queue) → ink markers on the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const allPois: POI[] = [
      ...(currentCard ? [currentCard] : []),
      ...activityQueue,
    ]
    const seen = new Set<string>()

    for (const poi of allPois) {
      seen.add(poi.id)
      const isFocus = poi.id === currentCard?.id
      const isHighlight = poi.id === highlightedId

      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: isFocus ? '#1a1a1a' : '#f4ede2',
        fillOpacity: 1,
        strokeColor: '#1a1a1a',
        strokeWeight: isHighlight ? 3 : 2,
        scale: isFocus ? 7 : 5,
      }

      const existing = poiMarkersRef.current.get(poi.id)
      if (existing) {
        existing.setPosition({ lat: poi.lat, lng: poi.lng })
        existing.setIcon(icon)
        existing.setZIndex(isFocus ? 25 : 20)
      } else {
        const marker = new google.maps.Marker({
          position: { lat: poi.lat, lng: poi.lng },
          map,
          icon,
          title: poi.name,
          zIndex: isFocus ? 25 : 20,
        })
        poiMarkersRef.current.set(poi.id, marker)
      }
    }

    // Garbage-collect markers for POIs no longer in the set
    for (const [id, marker] of poiMarkersRef.current) {
      if (!seen.has(id)) {
        marker.setMap(null)
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
