# CLAUDE.md — Frontend

> Guide Claude Code pour le **frontend Vite + React** d'Orient. À lire en premier dans chaque session.

## Project: Orient — Frontend Vite + React

Frontend Vite + React PWA mobile-first. **Thin client** : capture position+boussole+audio, envoie au backend Python via WebSocket, exécute les commandes UI reçues en retour (display_card, zoom_map, switch_view, etc.). Aucune logique métier ici.

**Hackathon** : 9h de build, soumission 19h.

## Critical context

- **Délai serré.** Solution qui marche en 1h > solution propre en 4h.
- **Démo > robustesse.**
- **Tu es Dev B** (frontend). Tu ne touches PAS le repo backend.
- **Le frontend est un EXÉCUTEUR de commandes.** Si tu codes de la logique métier (genre "si rating > 4.5 alors..."), tu fais une erreur. C'est le backend qui décide.
- **Pas de tests unitaires.** Test = "ça marche sur iPhone via Vercel preview".

## Pourquoi Vite et pas Next.js

- Pas de SSR nécessaire (app mobile-only, tout derrière permissions runtime)
- Pas de routes API à exposer (le backend FastAPI fait tout)
- HMR plus rapide → meilleur pour 9h de build
- Config plus simple, moins de magie à débugger

## Tech stack

- **Build** : Vite + React 18 + TypeScript strict
- **Routing** : React Router v6 (`react-router-dom`)
- **Styling** : Tailwind CSS
- **PWA** : `vite-plugin-pwa`
- **Map** : Google Maps JS SDK (`@googlemaps/js-api-loader`)
- **State** : Zustand
- **WebSocket** : natif `WebSocket` API
- **Audio** : LiveKit client SDK (`livekit-client`) — Gradium tourne en mode LiveKit cascaded
- **Hosting** : Vercel (Vite preset auto-détecté)

## Architecture

```
/frontend
├── index.html                       ← entry point Vite
├── vite.config.ts                   ← config Vite + PWA plugin
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── manifest.json
│   └── icon-*.png
├── src/
│   ├── main.tsx                     ← React root + Router
│   ├── App.tsx                      ← Layout + routes
│   ├── pages/
│   │   ├── Home.tsx                 ← Map Home (écran 1)
│   │   └── Tour.tsx                 ← Tour view (écrans 2/3/4)
│   ├── components/
│   │   ├── MapView.tsx              ← Google Maps + flèche orientation
│   │   ├── TourCard.tsx             ← card visuelle dynamique (photo POI)
│   │   ├── VoiceVisualizer.tsx      ← waveform + transcript live
│   │   ├── BargeInIndicator.tsx     ← UI quand l'user parle (micro pulse violet)
│   │   ├── ActivityQueue.tsx        ← carrousel des activités à venir
│   │   ├── PermissionGate.tsx       ← demande géoloc + boussole (iOS tap)
│   │   ├── TextFallbackInput.tsx    ← input texte si micro KO
│   │   └── DemoModeToggle.tsx       ← mock position en intérieur
│   ├── hooks/
│   │   ├── useCompass.ts            ← iOS webkitCompassHeading vs Android alpha
│   │   ├── useGeolocation.ts        ← watchPosition + throttle
│   │   ├── useWebSocket.ts          ← connexion + send/receive
│   │   └── useLiveKit.ts            ← connexion audio LiveKit (room + token)
│   ├── lib/
│   │   ├── commands.ts              ← types TS du contrat WS v1
│   │   ├── store.ts                 ← Zustand store global
│   │   ├── command-bus.ts           ← dispatcher : commande → action store
│   │   └── events.ts                ← mini event emitter (map, livekit)
│   ├── styles/
│   │   └── index.css                ← Tailwind directives
│   └── vite-env.d.ts
├── .env.local.example
└── package.json
```

## Setup initial

```bash
# Si à refaire from scratch :
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa
npx tailwindcss init -p
npm install zustand react-router-dom @googlemaps/js-api-loader livekit-client
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Orient',
        short_name: 'Orient',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    host: true,        // accessible depuis iPhone sur le réseau local
    port: 5173,
  },
});
```

## Contrat WebSocket v1 — FIGÉ à 11h00

**Mirror exact des types Pydantic backend (`models.py`). Toute modif = appel vocal 30s avant commit.**

### `src/lib/commands.ts` — copier tel quel

```typescript
// ============================================================
// PROTOCOL VERSION — bump si breaking change
// ============================================================
export const PROTOCOL_VERSION = 1;

// ============================================================
// TYPES PARTAGÉS
// ============================================================
export type Direction = 'left' | 'right' | 'front' | 'behind';

export type Category =
  | 'monument'
  | 'cafe'
  | 'restaurant'
  | 'gallery'
  | 'shop'
  | 'park'
  | 'other';

export type View = 'monument' | 'activity' | 'idle';

export type VoiceStateValue = 'speaking' | 'listening' | 'thinking' | 'idle';

export type Language = 'fr' | 'en';

export interface POI {
  id: string;                           // "google:ChIJ..."
  name: string;
  lat: number;
  lng: number;
  bearing: number;                      // 0-360 depuis l'user
  distance_m: number;
  direction: Direction;
  category: Category;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  is_open_now?: boolean;
  photo_url?: string;
}

export interface LiveKitConnection {
  url: string;        // wss://...livekit.cloud
  token: string;      // JWT participant
  room: string;
}

// ============================================================
// BACKEND → FRONTEND (commandes UI)
// ============================================================
export type FrontendCommand =
  // --- Session lifecycle ---
  | { type: 'session_ready'; protocol_version: number; livekit?: LiveKitConnection }
  | { type: 'session_error'; code: string; message: string }
  | { type: 'pong' }

  // --- Cards & POI ---
  | { type: 'display_card'; poi: POI }
  | { type: 'update_card'; poi: POI }
  | { type: 'clear_card' }
  | { type: 'highlight_poi'; poi_id: string }

  // --- Map ---
  | { type: 'zoom_map'; center_lat: number; center_lng: number; zoom: number }

  // --- Views & queues ---
  | { type: 'switch_view'; view: View }
  | { type: 'set_queue'; activities: POI[] }
  | { type: 'clear_queue' }

  // --- Voice / transcript ---
  | { type: 'voice_state'; state: VoiceStateValue }
  | { type: 'transcript_chunk'; text: string; speaker: 'agent' | 'user' }

  // --- Errors ---
  | { type: 'error'; message: string };

// ============================================================
// FRONTEND → BACKEND (events utilisateur)
// ============================================================
export type FrontendEvent =
  // --- Session lifecycle ---
  | { type: 'session_start'; protocol_version: number; language?: Language }
  | { type: 'session_end' }
  | { type: 'ping' }

  // --- Position & orientation ---
  | {
      type: 'position_update';
      lat: number;
      lng: number;
      heading: number | null;          // null = boussole indispo / pas autorisée
      accuracy: number;                // mètres
    }

  // --- User interactions ---
  | {
      type: 'user_tap';
      action: 'activities' | 'monuments' | 'next' | 'pause' | 'resume';
      poi_id?: string;
    }
  | { type: 'user_text_input'; text: string };
```

### Règles d'envoi (front → back)

- **`session_start`** : envoyé une seule fois après que la WS soit ouverte ET que les permissions soient accordées. Inclure `protocol_version: PROTOCOL_VERSION`.
- **`position_update`** : throttlé. Envoyer toutes les ~2s **OU** dès que `heading` change de >15°.
- **`heading: null`** quand la boussole n'est pas autorisée (iOS avant tap) ou indispo.
- **`ping`** : envoyé toutes les 30s pour keepalive Railway. Le backend répond `pong`.
- **`user_text_input`** : déclenché par `TextFallbackInput` quand le user tape une question (fallback démo si micro KO).
- **`user_tap` avec `poi_id`** : quand le user tap une POI sur la map ou dans la queue.

### Règles de réception (back → front)

- **`session_ready`** : attendre ce message avant d'activer le mic et de se connecter à LiveKit. Si `livekit` est présent, brancher le SDK LiveKit.
- **`session_error`** : afficher `message`, ne pas activer le mic.
- **`voice_state`** : pilote exclusivement l'UI `VoiceVisualizer` + `BargeInIndicator`. Jamais deviner l'état localement.
- **`display_card` / `update_card`** : remplacent `currentCard` dans le store.
- **`zoom_map`** : géré par event emitter dédié (`events.ts`), pas par le store.
- **Commande inconnue** : log `console.warn`, ne pas crash (forward-compat).

## Zustand store

```typescript
// src/lib/store.ts
import { create } from 'zustand';
import type { POI, View, VoiceStateValue } from './commands';

interface AppState {
  // Connexion
  wsConnected: boolean;
  audioConnected: boolean;
  sessionReady: boolean;

  // Géoloc
  position: { lat: number; lng: number; accuracy: number } | null;
  heading: number | null;
  permissionGranted: boolean;

  // UI state (driven by backend commands)
  currentCard: POI | null;
  highlightedPoiId: string | null;
  view: View;
  activityQueue: POI[];

  // Voice state
  voiceState: VoiceStateValue;
  transcript: { speaker: 'agent' | 'user'; text: string }[];

  // Actions
  setWsConnected: (v: boolean) => void;
  setAudioConnected: (v: boolean) => void;
  setSessionReady: (v: boolean) => void;
  setPosition: (p: AppState['position']) => void;
  setHeading: (h: number | null) => void;
  setPermissionGranted: (v: boolean) => void;
  setCard: (poi: POI | null) => void;
  setHighlightedPoi: (id: string | null) => void;
  setView: (view: View) => void;
  setQueue: (queue: POI[]) => void;
  setVoiceState: (s: VoiceStateValue) => void;
  appendTranscript: (chunk: { speaker: 'agent' | 'user'; text: string }) => void;
}

export const useStore = create<AppState>((set) => ({
  wsConnected: false,
  audioConnected: false,
  sessionReady: false,
  position: null,
  heading: null,
  permissionGranted: false,
  currentCard: null,
  highlightedPoiId: null,
  view: 'idle',
  activityQueue: [],
  voiceState: 'idle',
  transcript: [],

  setWsConnected: (v) => set({ wsConnected: v }),
  setAudioConnected: (v) => set({ audioConnected: v }),
  setSessionReady: (v) => set({ sessionReady: v }),
  setPosition: (p) => set({ position: p }),
  setHeading: (h) => set({ heading: h }),
  setPermissionGranted: (v) => set({ permissionGranted: v }),
  setCard: (poi) => set({ currentCard: poi }),
  setHighlightedPoi: (id) => set({ highlightedPoiId: id }),
  setView: (view) => set({ view }),
  setQueue: (queue) => set({ activityQueue: queue }),
  setVoiceState: (s) => set({ voiceState: s }),
  appendTranscript: (chunk) =>
    set((state) => ({ transcript: [...state.transcript, chunk] })),
}));
```

**Règle d'or** : aucun composant ne modifie le store directement, sauf via les actions appelées par `command-bus.ts`. Tout l'état UI vient du backend.

## Mini event emitter (pour map + livekit)

```typescript
// src/lib/events.ts
type Listener = (...args: any[]) => void;

class EventBus {
  private listeners: Record<string, Listener[]> = {};

  on(event: string, fn: Listener) {
    (this.listeners[event] ||= []).push(fn);
  }
  off(event: string, fn: Listener) {
    this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== fn);
  }
  emit(event: string, ...args: any[]) {
    (this.listeners[event] || []).forEach((fn) => fn(...args));
  }
}

export const bus = new EventBus();
```

## Command bus

```typescript
// src/lib/command-bus.ts
import type { FrontendCommand } from './commands';
import { useStore } from './store';
import { bus } from './events';

export function dispatchCommand(cmd: FrontendCommand) {
  const store = useStore.getState();

  switch (cmd.type) {
    // Session lifecycle
    case 'session_ready':
      store.setSessionReady(true);
      if (cmd.livekit) bus.emit('livekit_connect', cmd.livekit);
      break;
    case 'session_error':
      console.error('Session error:', cmd.code, cmd.message);
      store.setSessionReady(false);
      break;
    case 'pong':
      break;

    // Cards & POI
    case 'display_card':
    case 'update_card':
      store.setCard(cmd.poi);
      break;
    case 'clear_card':
      store.setCard(null);
      break;
    case 'highlight_poi':
      store.setHighlightedPoi(cmd.poi_id);
      break;

    // Map
    case 'zoom_map':
      bus.emit('zoom', {
        lat: cmd.center_lat,
        lng: cmd.center_lng,
        zoom: cmd.zoom,
      });
      break;

    // Views & queues
    case 'switch_view':
      store.setView(cmd.view);
      break;
    case 'set_queue':
      store.setQueue(cmd.activities);
      break;
    case 'clear_queue':
      store.setQueue([]);
      break;

    // Voice / transcript
    case 'voice_state':
      store.setVoiceState(cmd.state);
      break;
    case 'transcript_chunk':
      store.appendTranscript({ speaker: cmd.speaker, text: cmd.text });
      break;

    // Errors
    case 'error':
      console.error('Backend error:', cmd.message);
      break;

    default: {
      const _exhaustive: never = cmd;
      console.warn('Unknown command:', _exhaustive);
    }
  }
}
```

## Hook WebSocket

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { PROTOCOL_VERSION, type FrontendCommand, type FrontendEvent } from '@/lib/commands';
import { dispatchCommand } from '@/lib/command-bus';
import { useStore } from '@/lib/store';

export function useWebSocket(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const setWsConnected = useStore((s) => s.setWsConnected);

  useEffect(() => {
    const ws = new WebSocket(
      `${import.meta.env.VITE_BACKEND_WS_URL}/ws/session/${sessionId}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      send({ type: 'session_start', protocol_version: PROTOCOL_VERSION, language: 'fr' });
    };

    ws.onmessage = (e) => {
      const cmd = JSON.parse(e.data) as FrontendCommand;
      dispatchCommand(cmd);
    };

    ws.onclose = () => setWsConnected(false);

    const pingInterval = setInterval(() => {
      send({ type: 'ping' });
    }, 30_000);

    return () => {
      clearInterval(pingInterval);
      send({ type: 'session_end' });
      ws.close();
    };
  }, [sessionId]);

  const send = (event: FrontendEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  };

  return { send };
}
```

## Throttle position_update

```typescript
// src/hooks/useGeolocation.ts (extrait)
const POSITION_INTERVAL_MS = 2000;
const HEADING_THRESHOLD_DEG = 15;

let lastSentAt = 0;
let lastHeading: number | null = null;

function maybeSendPosition(
  pos: GeolocationPosition,
  heading: number | null,
  send: (e: FrontendEvent) => void,
) {
  const now = Date.now();
  const headingChanged =
    heading !== null &&
    lastHeading !== null &&
    Math.abs(heading - lastHeading) > HEADING_THRESHOLD_DEG;

  if (now - lastSentAt > POSITION_INTERVAL_MS || headingChanged) {
    send({
      type: 'position_update',
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      heading,
      accuracy: pos.coords.accuracy,
    });
    lastSentAt = now;
    lastHeading = heading;
  }
}
```

## Le piège iOS — DeviceOrientation

```typescript
// src/hooks/useCompass.ts
import { useState } from 'react';

type PermState = 'pending' | 'granted' | 'denied';

export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<PermState>('pending');

  // CRITICAL: requestPermission DOIT être appelé dans un click handler
  const requestPermission = async () => {
    const evt = DeviceOrientationEvent as any;
    if (typeof evt.requestPermission === 'function') {
      // iOS 13+
      const state = await evt.requestPermission();
      if (state !== 'granted') {
        setPermissionState('denied');
        return;
      }
    }
    setPermissionState('granted');
    window.addEventListener('deviceorientation', handleOrientation);
  };

  const handleOrientation = (e: DeviceOrientationEvent) => {
    const evt = e as any;
    if (evt.webkitCompassHeading !== undefined) {
      setHeading(evt.webkitCompassHeading);          // iOS (0-360 nord)
    } else if (e.alpha !== null) {
      setHeading(360 - e.alpha);                      // Android (inverser)
    }
  };

  return { heading, permissionState, requestPermission };
}
```

**Important** :
- `requestPermission` doit être appelé depuis un handler de `click` ou `touchend`, jamais au `useEffect` initial.
- Tant que `permissionState !== 'granted'`, envoyer `heading: null` dans `position_update`.

## LiveKit audio (audio handshake)

Le backend renvoie `session_ready` avec `livekit: { url, token, room }`. Le front se connecte à la room en parallèle de la WS de commandes.

```typescript
// src/hooks/useLiveKit.ts
import { useEffect, useRef } from 'react';
import { Room } from 'livekit-client';
import { bus } from '@/lib/events';
import { useStore } from '@/lib/store';
import type { LiveKitConnection } from '@/lib/commands';

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const setAudioConnected = useStore((s) => s.setAudioConnected);

  useEffect(() => {
    const handler = async (conn: LiveKitConnection) => {
      const room = new Room({ adaptiveStream: true });
      await room.connect(conn.url, conn.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
      setAudioConnected(true);
    };
    bus.on('livekit_connect', handler);
    return () => {
      bus.off('livekit_connect', handler);
      roomRef.current?.disconnect();
    };
  }, []);
}
```

**Note** : ne tente PAS d'activer le micro avant `session_ready`. Le backend a besoin que Gradium soit prêt côté LiveKit d'abord.

## Variables d'environnement

Vite utilise `VITE_*` (pas `NEXT_PUBLIC_*`).

```bash
# .env.local.example
VITE_BACKEND_WS_URL=wss://orient-backend.railway.app
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

Accès dans le code via `import.meta.env.VITE_BACKEND_WS_URL` (pas `process.env`).

(Pas de clé LiveKit côté front : url + token fournis par le backend dans `session_ready`.)

## Routing

```typescript
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Tour from './pages/Tour';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tour" element={<Tour />} />
    </Routes>
  </BrowserRouter>,
);
```

## Déploiement Vercel

Vercel détecte Vite automatiquement (build = `vite build`, output = `dist/`). Rien à configurer.

**`vercel.json` à la racine du frontend** (pour les permissions iOS) :

```json
{
  "regions": ["cdg1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Permissions-Policy",
          "value": "geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), microphone=(self)"
        }
      ]
    }
  ]
}
```

## Conventions code

- TypeScript strict, `any` autorisé si ça bloque > 5min
- Pas de fichier > 200 lignes
- Pas de lib lourde (pas de Redux, pas de MUI)
- Tailwind utility-first, pas de CSS-in-JS
- Commits préfixés `[B]`

## Ordre de travail recommandé

| Heure | Tâche |
|---|---|
| 10h00-10h30 | Setup Vite + React + Tailwind + PWA + Vercel preview live |
| 10h30-11h00 | **SYNC Dev A** : figer `src/lib/commands.ts` (contrat v1) |
| 11h00-12h00 | `PermissionGate` + `useCompass` hook |
| 12h00-13h00 | `MapView` Google Maps + flèche orientation |
| 13h00-13h30 | `useWebSocket` + `command-bus` + heartbeat ping/pong |
| 13h30-14h00 | **LUNCH** |
| 14h00-15h00 | Page `/tour` + `TourCard` + `ActivityQueue` |
| 15h00-15h30 | `VoiceVisualizer` + transcript live |
| 15h30-16h00 | **SYNC Dev A** : E2E `session_ready` + `display_card` |
| 16h00-17h00 | `useLiveKit` + `BargeInIndicator` + `TextFallbackInput` |
| 17h00-18h00 | **FEATURE FREEZE** : fix bugs, test sur iPhone IRL |
| 18h00-19h00 | Démo IRL + Loom |

## Anti-patterns

- ❌ Logique métier dans les composants ("si rating > 4.5...")
- ❌ Modifier le store sans passer par command-bus
- ❌ Deviner `voice_state` localement (c'est le backend qui dicte)
- ❌ Envoyer `position_update` en streaming continu (throttle 2s + 15°)
- ❌ Activer le micro avant `session_ready`
- ❌ Appeler `requestPermission` boussole dans un `useEffect` (iOS bloque)
- ❌ Ajouter Redux ou un autre state manager
- ❌ Faire un design "perfect" — ship le mockup tel quel
- ❌ Polling REST au lieu du WS
- ❌ localStorage pour stocker l'état (volatile par session)
- ❌ Crash sur commande inconnue (log + ignore pour forward-compat)
- ❌ Utiliser `process.env` (c'est `import.meta.env.VITE_*` avec Vite)

## Démo killer (à viser pour 19h)

Scénario qui doit absolument marcher :
1. Lancement app sur iPhone Safari, permissions accordées (géoloc + boussole + micro)
2. WS ouvre, `session_start` envoyé, `session_ready` reçu, LiveKit connecté
3. Position détectée, premier `display_card` reçu, Emma parle
4. User se tourne de 90° → `position_update` avec nouveau heading → `update_card` → narration switch
5. User dit "et le café à droite il est bien ?" → `voice_state: listening` → barge-in → Emma répond → `voice_state: speaking`

Si tout marche sauf le 5 (audio), fallback `user_text_input` via `TextFallbackInput`.

## En cas de doute

1. **Améliore la démo 2min ?** Non → on le fait pas.
2. **Shippable en 30min ?** Non → on simplifie.
3. **Vient du backend ou du front ?** Demander avant d'inventer.
4. **Le contrat permet ça ?** Si non → appel vocal Dev A avant de bouger.

## Liens utiles

- Vite docs : https://vitejs.dev/guide/
- Vite PWA plugin : https://vite-pwa-org.netlify.app/
- React Router v6 : https://reactrouter.com/en/main
- DeviceOrientation iOS : https://developer.apple.com/documentation/webkitjs/deviceorientationevent
- Google Maps JS : https://developers.google.com/maps/documentation/javascript
- LiveKit client SDK : https://docs.livekit.io/client-sdk-js/
- Zustand : https://docs.pmnd.rs/zustand
