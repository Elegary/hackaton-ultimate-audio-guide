import { create } from 'zustand'
import type { POI, View, VoiceStateValue } from './commands'

export interface TranscriptChunk {
  speaker: 'agent' | 'user'
  text: string
}

interface AppState {
  // Session
  sessionId: string | null
  wsConnected: boolean
  sessionReady: boolean

  // UI state driven by backend commands
  currentCard: POI | null
  highlightedPoiId: string | null
  view: View
  activityQueue: POI[]

  // Voice
  voiceState: VoiceStateValue
  transcript: TranscriptChunk[]

  // Actions (called only via command-bus / app shell, never from presentational components)
  setSessionId: (id: string | null) => void
  setWsConnected: (v: boolean) => void
  setSessionReady: (v: boolean) => void
  setCard: (poi: POI | null) => void
  setHighlightedPoi: (id: string | null) => void
  setView: (view: View) => void
  setQueue: (queue: POI[]) => void
  setVoiceState: (state: VoiceStateValue) => void
  appendTranscript: (chunk: TranscriptChunk) => void
}

export const useStore = create<AppState>((set) => ({
  sessionId: null,
  wsConnected: false,
  sessionReady: false,
  currentCard: null,
  highlightedPoiId: null,
  view: 'idle',
  activityQueue: [],
  voiceState: 'idle',
  transcript: [],

  setSessionId: (sessionId) => set({ sessionId }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSessionReady: (sessionReady) => set({ sessionReady }),
  setCard: (poi) => set({ currentCard: poi }),
  setHighlightedPoi: (id) => set({ highlightedPoiId: id }),
  setView: (view) => set({ view }),
  setQueue: (queue) => set({ activityQueue: queue }),
  setVoiceState: (voiceState) => set({ voiceState }),
  appendTranscript: (chunk) =>
    set((s) => ({ transcript: [...s.transcript, chunk] })),
}))
