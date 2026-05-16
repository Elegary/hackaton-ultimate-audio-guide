import { useEffect, useRef } from 'react'
import type { POI } from './commands'
import { dispatchCommand } from './command-bus'
import { useStore } from './store'
import {
  bearingDeg,
  destinationPoint,
  distanceMeters,
  relativeDirection,
  type LatLng,
} from './geo-math'

/**
 * Mock POI templates positioned RELATIVE to the user.
 * Each entry says "this POI is X meters at bearing Y from wherever the user is."
 * When the real backend lands, this module is deleted and replaced by the
 * WebSocket handler that calls dispatchCommand() with backend-issued POIs.
 */
interface MockTemplate {
  slug: string
  name: string
  category: POI['category']
  offsetMeters: number
  offsetBearing: number          // 0 = north, 90 = east
  rating?: number
  user_ratings_total?: number
  price_level?: number
  is_open_now?: boolean
  blurb: string
}

const MOCK_TEMPLATES: MockTemplate[] = [
  {
    slug: 'tour-clocher',
    name: 'Tour du Vieux Clocher',
    category: 'monument',
    offsetMeters: 90,
    offsetBearing: 35,
    rating: 4.6,
    user_ratings_total: 1284,
    is_open_now: true,
    blurb:
      'Bâtie au XIVᵉ, restaurée trois fois. Le seul beffroi de la rive nord encore visitable.',
  },
  {
    slug: 'cafe-marie',
    name: 'Café de Marie',
    category: 'cafe',
    offsetMeters: 140,
    offsetBearing: 120,
    rating: 4.4,
    user_ratings_total: 432,
    price_level: 2,
    is_open_now: true,
    blurb: 'Café d’angle, terrasse au soleil le matin. Le patron fait son propre pain.',
  },
  {
    slug: 'galerie-petit-pont',
    name: 'Galerie du Petit Pont',
    category: 'gallery',
    offsetMeters: 220,
    offsetBearing: 200,
    rating: 4.2,
    user_ratings_total: 187,
    is_open_now: false,
    blurb: 'Photographie contemporaine. Accrochage trimestriel, entrée libre.',
  },
  {
    slug: 'jardin-musiciens',
    name: 'Jardin des Musiciens',
    category: 'park',
    offsetMeters: 310,
    offsetBearing: 290,
    rating: 4.7,
    user_ratings_total: 921,
    is_open_now: true,
    blurb: 'Petit parc clos, bancs en fonte, concert improvisé presque tous les dimanches.',
  },
  {
    slug: 'librairie-corne',
    name: 'Librairie La Corne',
    category: 'shop',
    offsetMeters: 175,
    offsetBearing: 75,
    rating: 4.8,
    user_ratings_total: 264,
    is_open_now: true,
    blurb: 'Éditions rares, beaux livres d’art, et un chat qui dort sur la caisse.',
  },
  {
    slug: 'bistrot-marquise',
    name: 'Bistrot de la Marquise',
    category: 'restaurant',
    offsetMeters: 260,
    offsetBearing: 160,
    rating: 4.5,
    user_ratings_total: 612,
    price_level: 3,
    is_open_now: true,
    blurb: 'Cuisine de bistrot revisitée, carte courte, tables au coude-à-coude.',
  },
]

export const QUEUE_SIZE = 4
const EMIT_INTERVAL_MS = 2500

interface MockBlurbStore {
  [slug: string]: string
}

const blurbsBySlug: MockBlurbStore = Object.fromEntries(
  MOCK_TEMPLATES.map((t) => [t.slug, t.blurb]),
)

/**
 * Returns the rich description for a POI id. Exposed so cards can render the
 * mock blurb until the backend supplies real descriptions.
 */
export function mockBlurbFor(poiId: string): string | undefined {
  const slug = poiId.startsWith('mock:') ? poiId.slice('mock:'.length) : poiId
  return blurbsBySlug[slug]
}

function buildPOIs(user: LatLng, userHeading: number | null): POI[] {
  return MOCK_TEMPLATES.map((t) => {
    const pos = destinationPoint(user, t.offsetBearing, t.offsetMeters)
    const bearing = bearingDeg(user, pos)
    const distance_m = distanceMeters(user, pos)
    return {
      id: `mock:${t.slug}`,
      name: t.name,
      lat: pos.lat,
      lng: pos.lng,
      bearing,
      distance_m,
      direction: relativeDirection(bearing, userHeading),
      category: t.category,
      rating: t.rating,
      user_ratings_total: t.user_ratings_total,
      price_level: t.price_level,
      is_open_now: t.is_open_now,
      photo_url: `https://picsum.photos/seed/${encodeURIComponent(t.slug)}/640/400`,
    }
  })
}

/**
 * Drives the store as if a backend were sending commands.
 * Replace this hook with `useWebSocket` when the backend ships — the
 * dispatchCommand call site stays identical.
 */
export function useMockBackend(
  position: LatLng | null,
  heading: number | null,
) {
  const lastEmitRef = useRef(0)
  const headingRef = useRef(heading)
  headingRef.current = heading

  useEffect(() => {
    if (!position) return

    const now = Date.now()
    if (now - lastEmitRef.current < EMIT_INTERVAL_MS) return
    lastEmitRef.current = now

    const pois = buildPOIs(position, headingRef.current).sort(
      (a, b) => a.distance_m - b.distance_m,
    )
    if (pois.length === 0) return

    const [nearest, ...rest] = pois
    dispatchCommand({ type: 'display_card', poi: nearest })
    dispatchCommand({ type: 'set_queue', activities: rest.slice(0, QUEUE_SIZE) })
    dispatchCommand({ type: 'switch_view', view: nearest.category === 'monument' ? 'monument' : 'activity' })
  }, [position, heading])
}

// ============================================================
// Voice narration mock — replace with backend audio + transcript stream
// ============================================================

export const AGENT_PERSONA = 'Emma'

const NARRATIONS: Record<string, string> = {
  'mock:tour-clocher':
    "Devant vous, la Tour du Vieux Clocher. Bâtie au XIVᵉ siècle, restaurée trois fois — par les dominicains, puis Napoléon III, et enfin en 1947 après l’incendie. C’est le seul beffroi de la rive nord encore visitable. Si vous montez, comptez deux cents marches et une vue à couper le souffle sur les toits.",
  'mock:cafe-marie':
    "À votre droite, le Café de Marie. La terrasse prend le soleil le matin et Étienne, le patron, fait son propre pain au levain depuis quinze ans. Demandez-lui de vous montrer sa machine à café — elle vient de Milan, 1962, et elle ronronne toujours.",
  'mock:galerie-petit-pont':
    "La Galerie du Petit Pont — photographie contemporaine, accrochage trimestriel, entrée libre. En ce moment ils montrent un travail sur les phares bretons. Largement le détour, même si la lumière y est crue.",
  'mock:jardin-musiciens':
    "Le Jardin des Musiciens, presque secret. Bancs en fonte, vieux platanes, et le dimanche, des concerts improvisés. Si vous y passez vers six heures du soir, il y a souvent quelqu’un qui joue du saxophone près de la fontaine.",
  'mock:librairie-corne':
    "La Librairie La Corne, juste là. Éditions rares, beaux livres d’art, et un chat tigré qui dort sur la caisse depuis huit ans. Le libraire connaît son fonds par cœur — demandez-lui n’importe quoi, il trouvera.",
  'mock:bistrot-marquise':
    "Le Bistrot de la Marquise. Cuisine de bistrot revisitée, carte courte, tables au coude-à-coude. C’est Anaïs qui orchestre tout ça depuis 2019 — sa lotte au safran fait beaucoup parler.",
}

const THINKING_MS = 700
const WORD_DELAY_MS = 90
const LISTEN_HOLD_MS = 1800
const IDLE_HOLD_MS = 3500

/**
 * Watches the current card and plays a scripted Emma narration:
 *   thinking → speaking (word-by-word transcript) → listening → idle
 *
 * When the card changes mid-narration, the previous script is cancelled
 * and a fresh one starts. Replace with backend audio + transcript stream.
 */
export function useMockVoice() {
  const cardId = useStore((s) => s.currentCard?.id ?? null)
  const cardName = useStore((s) => s.currentCard?.name ?? null)

  useEffect(() => {
    if (!cardId) return

    const text =
      NARRATIONS[cardId] ??
      `${cardName ?? 'Un lieu intéressant'} se trouve juste à côté. On continue ?`
    const words = text.split(/(\s+)/) // keep whitespace so chunks reassemble cleanly

    let cancelled = false
    const timers: number[] = []
    const schedule = (delay: number, fn: () => void) => {
      timers.push(window.setTimeout(() => {
        if (!cancelled) fn()
      }, delay))
    }

    dispatchCommand({ type: 'voice_state', state: 'thinking' })

    schedule(THINKING_MS, () => {
      dispatchCommand({ type: 'voice_state', state: 'speaking' })
      words.forEach((w, i) => {
        schedule(i * WORD_DELAY_MS, () => {
          dispatchCommand({ type: 'transcript_chunk', text: w, speaker: 'agent' })
        })
      })

      const totalSpeechMs = words.length * WORD_DELAY_MS
      schedule(totalSpeechMs + LISTEN_HOLD_MS, () => {
        dispatchCommand({ type: 'voice_state', state: 'listening' })
      })
      schedule(totalSpeechMs + LISTEN_HOLD_MS + IDLE_HOLD_MS, () => {
        dispatchCommand({ type: 'voice_state', state: 'idle' })
      })
    })

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [cardId, cardName])
}
