import { useEffect, useState } from 'react'
import './App.css'
import MapView from './components/MapView'
import TourCard from './components/TourCard'
import ActivityQueue from './components/ActivityQueue'
import VoiceCard from './components/VoiceCard'
import { useGeolocation, type GeoStatus } from './hooks/useGeolocation'
import { useCompass, type CompassStatus } from './hooks/useCompass'
import { useWebSocket } from './hooks/useWebSocket'
import { usePositionUpload } from './hooks/usePositionUpload'
import { useStore } from './lib/store'

export default function App() {
  const geo = useGeolocation()
  const compass = useCompass()

  // sessionId is generated once per page load, mirrored into the store so any
  // component (e.g. debug overlays) can read it.
  const [sessionId] = useState(() => crypto.randomUUID())
  const setSessionId = useStore((s) => s.setSessionId)
  useEffect(() => {
    setSessionId(sessionId)
    return () => setSessionId(null)
  }, [sessionId, setSessionId])

  const wsConnected = useStore((s) => s.wsConnected)
  const sessionReady = useStore((s) => s.sessionReady)

  const position = geo.fix
    ? { lat: geo.fix.lat, lng: geo.fix.lng, accuracy: geo.fix.accuracy }
    : null

  // Desktop demo recording: the operator drives a manual heading via the
  // side panel. `mockHeading: null` means "fall back to the real device
  // compass" — so on mobile (where the slider is hidden by CSS) the real
  // compass flows through unchanged.
  const [mockHeading, setMockHeading] = useState<number | null>(null)
  const effectiveHeading = mockHeading ?? compass.heading

  // The hook gates the WS on `position` being non-null so the agent gets a
  // real GPS fix in its first prompt. Subsequent ticks go through `send`.
  const { send, setMicMuted } = useWebSocket({
    sessionId,
    initialPosition: position
      ? { lat: position.lat, lng: position.lng }
      : null,
    initialHeading: effectiveHeading,
    language: 'en',
  })

  // Mic mute is just `track.enabled = false` on the MediaStream — keeps the
  // pipeline alive, Gradbot just sees the user as quiet.
  const [micMuted, setMicMutedState] = useState(false)
  useEffect(() => {
    setMicMuted(micMuted)
  }, [micMuted, setMicMuted, wsConnected])

  // Throttled position_update upstream so the backend keeps an up-to-date
  // user position for tools that re-search around it.
  usePositionUpload(send, position, effectiveHeading)

  const handleActivate = async () => {
    geo.start()
    // requestPermission must run inside this click handler for iOS to allow it.
    await compass.requestPermission()
  }

  const activated = geo.status !== 'idle' || compass.status !== 'idle'

  return (
    <main className="home">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">◉</span>
        <h1>Orient</h1>
        <p className="tagline">Your real-time walking audio guide</p>
        <WsStatusPill wsConnected={wsConnected} sessionReady={sessionReady} />
      </header>

      <section className="map-section" aria-label="Map">
        <MapView position={position} heading={effectiveHeading} />
      </section>

      {activated ? (
        <>
          <TourCard />
          <VoiceCard />
          {wsConnected && (
            <button
              type="button"
              className={`mic-toggle${micMuted ? ' is-muted' : ''}`}
              onClick={() => setMicMutedState((m) => !m)}
              aria-pressed={micMuted}
            >
              <span className="mic-toggle__dot" aria-hidden="true" />
              {micMuted ? 'Mic muted — tap to talk' : 'Mute mic'}
            </button>
          )}
          <ActivityQueue />
          <StatusPanel
            geoStatus={geo.status}
            geoError={geo.error}
            accuracy={geo.fix?.accuracy ?? null}
            compassStatus={compass.status}
            heading={effectiveHeading}
          />
        </>
      ) : (
        <button type="button" className="cta" onClick={handleActivate}>
          Enable location and compass
        </button>
      )}

      <footer className="footnote">v0 · Vercel preview · iOS demo</footer>

      <DemoCompass value={mockHeading} onChange={setMockHeading} />
    </main>
  )
}

interface DemoCompassProps {
  value: number | null
  onChange: (v: number | null) => void
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function cardinal(deg: number): string {
  return CARDINALS[Math.round((deg % 360) / 45) % 8]
}

function DemoCompass({ value, onChange }: DemoCompassProps) {
  const sliderValue = value ?? 0
  const active = value !== null
  return (
    <aside className="demo-compass" aria-label="Demo compass">
      <div className="demo-compass__title">Demo compass</div>
      <input
        type="range"
        min={0}
        max={359}
        step={1}
        value={sliderValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label="Heading degrees"
      />
      <div className="demo-compass__readout">
        {active
          ? `${sliderValue.toFixed(0)}° (${cardinal(sliderValue)})`
          : '— (using device)'}
      </div>
      <button
        type="button"
        className="demo-compass__reset"
        onClick={() => onChange(null)}
        disabled={!active}
      >
        Use device compass
      </button>
    </aside>
  )
}

interface WsStatusPillProps {
  wsConnected: boolean
  sessionReady: boolean
}

function WsStatusPill({ wsConnected, sessionReady }: WsStatusPillProps) {
  const tone = !wsConnected ? 'off' : sessionReady ? 'ready' : 'connecting'
  const label = !wsConnected ? 'offline' : sessionReady ? 'live' : 'connecting…'
  return (
    <span
      className={`ws-pill ws-pill--${tone}`}
      role="status"
      aria-label={`Backend: ${label}`}
    >
      <span className="ws-pill__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

interface StatusPanelProps {
  geoStatus: GeoStatus
  geoError: string | null
  accuracy: number | null
  compassStatus: CompassStatus
  heading: number | null
}

function StatusPanel({
  geoStatus,
  geoError,
  accuracy,
  compassStatus,
  heading,
}: StatusPanelProps) {
  return (
    <section className="status" aria-live="polite">
      <div className="status-row">
        <span className={`status-dot status-${geoStatus}`} aria-hidden="true" />
        <span className="status-label">Position</span>
        <span className="status-value">{geoLabel(geoStatus, accuracy, geoError)}</span>
      </div>
      <div className="status-row">
        <span className={`status-dot status-${compassStatus}`} aria-hidden="true" />
        <span className="status-label">Compass</span>
        <span className="status-value">{compassLabel(compassStatus, heading)}</span>
      </div>
    </section>
  )
}

function geoLabel(status: GeoStatus, accuracy: number | null, error: string | null): string {
  switch (status) {
    case 'pending':
      return 'locating…'
    case 'granted':
      return accuracy ? `±${Math.round(accuracy)} m` : 'OK'
    case 'denied':
      return error ?? 'denied'
    case 'unsupported':
      return 'unavailable'
    case 'idle':
      return '—'
  }
}

function compassLabel(status: CompassStatus, heading: number | null): string {
  switch (status) {
    case 'pending':
      return 'permission…'
    case 'granted':
      return heading !== null ? `${Math.round(heading)}°` : 'waiting…'
    case 'denied':
      return 'denied'
    case 'unsupported':
      return 'unavailable'
    case 'no-sensor':
      return 'no sensor'
    case 'idle':
      return '—'
  }
}
