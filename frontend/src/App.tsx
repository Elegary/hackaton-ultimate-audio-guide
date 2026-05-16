import './App.css'
import MapView from './components/MapView'
import TourCard from './components/TourCard'
import ActivityQueue from './components/ActivityQueue'
import { useGeolocation, type GeoStatus } from './hooks/useGeolocation'
import { useCompass, type CompassStatus } from './hooks/useCompass'
import { useMockBackend } from './lib/mock-backend'

export default function App() {
  const geo = useGeolocation()
  const compass = useCompass()

  const handleActivate = async () => {
    geo.start()
    // requestPermission must run inside this click handler for iOS to allow it.
    await compass.requestPermission()
  }

  const position = geo.fix
    ? { lat: geo.fix.lat, lng: geo.fix.lng, accuracy: geo.fix.accuracy }
    : null

  // Mock backend mirrors the eventual WebSocket: dispatchCommand on position+heading.
  useMockBackend(position, compass.heading)

  const activated = geo.status !== 'idle' || compass.status !== 'idle'

  return (
    <main className="home">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">◉</span>
        <h1>Orient</h1>
        <p className="tagline">Votre guide audio piéton, en temps réel</p>
      </header>

      <section className="map-section" aria-label="Carte">
        <MapView position={position} heading={compass.heading} />
      </section>

      {activated ? (
        <>
          <TourCard />
          <ActivityQueue />
          <StatusPanel
            geoStatus={geo.status}
            geoError={geo.error}
            accuracy={geo.fix?.accuracy ?? null}
            compassStatus={compass.status}
            heading={compass.heading}
          />
        </>
      ) : (
        <button type="button" className="cta" onClick={handleActivate}>
          Activer position et boussole
        </button>
      )}

      <footer className="footnote">v0 · déploiement Vercel · démo iOS</footer>
    </main>
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
        <span className="status-label">Boussole</span>
        <span className="status-value">{compassLabel(compassStatus, heading)}</span>
      </div>
    </section>
  )
}

function geoLabel(status: GeoStatus, accuracy: number | null, error: string | null): string {
  switch (status) {
    case 'pending':
      return 'localisation…'
    case 'granted':
      return accuracy ? `±${Math.round(accuracy)} m` : 'OK'
    case 'denied':
      return error ?? 'refusée'
    case 'unsupported':
      return 'indisponible'
    case 'idle':
      return '—'
  }
}

function compassLabel(status: CompassStatus, heading: number | null): string {
  switch (status) {
    case 'pending':
      return 'autorisation…'
    case 'granted':
      return heading !== null ? `${Math.round(heading)}°` : 'en attente…'
    case 'denied':
      return 'refusée'
    case 'unsupported':
      return 'indisponible'
    case 'no-sensor':
      return 'capteur absent'
    case 'idle':
      return '—'
  }
}
