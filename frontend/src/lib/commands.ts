// ============================================================
// PROTOCOL VERSION — bump if breaking change
// Mirror of backend Pydantic models. Any edit here requires a sync call.
// ============================================================
export const PROTOCOL_VERSION = 1

// ============================================================
// SHARED TYPES
// ============================================================
export type Direction = 'left' | 'right' | 'front' | 'behind'

export type Category =
  | 'monument'
  | 'cafe'
  | 'restaurant'
  | 'gallery'
  | 'shop'
  | 'park'
  | 'other'

export type View = 'monument' | 'activity' | 'idle'

export type VoiceStateValue = 'speaking' | 'listening' | 'thinking' | 'idle'

export type Language = 'fr' | 'en'

export interface POI {
  id: string                           // "google:ChIJ..." or "mock:..."
  name: string
  lat: number
  lng: number
  bearing: number                      // 0-360 from the user
  distance_m: number
  direction: Direction
  category: Category
  rating?: number
  user_ratings_total?: number
  price_level?: number
  is_open_now?: boolean
  photo_url?: string
}

export interface LiveKitConnection {
  url: string
  token: string
  room: string
}

// ============================================================
// BACKEND → FRONTEND
// ============================================================
export type FrontendCommand =
  // Session lifecycle
  | { type: 'session_ready'; protocol_version: number; livekit?: LiveKitConnection }
  | { type: 'session_error'; code: string; message: string }
  | { type: 'pong' }

  // Cards & POI
  | { type: 'display_card'; poi: POI }
  | { type: 'update_card'; poi: POI }
  | { type: 'clear_card' }
  | { type: 'highlight_poi'; poi_id: string }

  // Map
  | { type: 'zoom_map'; center_lat: number; center_lng: number; zoom: number }

  // Views & queues
  | { type: 'switch_view'; view: View }
  | { type: 'set_queue'; activities: POI[] }
  | { type: 'clear_queue' }

  // Voice / transcript
  | { type: 'voice_state'; state: VoiceStateValue }
  | { type: 'transcript_chunk'; text: string; speaker: 'agent' | 'user' }

  // Errors
  | { type: 'error'; message: string }

// ============================================================
// FRONTEND → BACKEND
// ============================================================
export type FrontendEvent =
  // Session lifecycle
  | { type: 'session_start'; protocol_version: number; language?: Language }
  | { type: 'session_end' }
  | { type: 'ping' }

  // Position & orientation
  | {
      type: 'position_update'
      lat: number
      lng: number
      heading: number | null
      accuracy: number
    }

  // User interactions
  | {
      type: 'user_tap'
      action: 'activities' | 'monuments' | 'next' | 'pause' | 'resume'
      poi_id?: string
    }
  | { type: 'user_text_input'; text: string }
