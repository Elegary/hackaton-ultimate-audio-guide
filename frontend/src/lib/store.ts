import { create } from 'zustand'
import type { POI, View, VoiceStateValue } from './commands'

export interface TranscriptChunk {
  speaker: 'agent' | 'user'
  text: string
}

interface AppState {
  // UI state driven by backend commands
  currentCard: POI | null
  highlightedPoiId: string | null
  view: View
  activityQueue: POI[]

  // Voice
  voiceState: VoiceStateValue
  transcript: TranscriptChunk[]

  // Actions (called only via command-bus, never from components)
  setCard: (poi: POI | null) => void
  setHighlightedPoi: (id: string | null) => void
  setView: (view: View) => void
  setQueue: (queue: POI[]) => void
  setVoiceState: (state: VoiceStateValue) => void
  appendTranscript: (chunk: TranscriptChunk) => void
}

export const useStore = create<AppState>((set) => ({
  currentCard: null,
  highlightedPoiId: null,
  view: 'idle',
  activityQueue: [],
  voiceState: 'idle',
  transcript: [],

  setCard: (poi) => set({ currentCard: poi }),
  setHighlightedPoi: (id) => set({ highlightedPoiId: id }),
  setView: (view) => set({ view }),
  setQueue: (queue) => set({ activityQueue: queue }),
  setVoiceState: (voiceState) => set({ voiceState }),
  appendTranscript: (chunk) =>
    set((s) => ({ transcript: [...s.transcript, chunk] })),
}))
