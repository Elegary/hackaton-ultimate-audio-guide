import { create } from 'zustand'
import type { POI, View } from './commands'

interface AppState {
  // UI state driven by backend commands
  currentCard: POI | null
  highlightedPoiId: string | null
  view: View
  activityQueue: POI[]

  // Actions (called only via command-bus, never from components)
  setCard: (poi: POI | null) => void
  setHighlightedPoi: (id: string | null) => void
  setView: (view: View) => void
  setQueue: (queue: POI[]) => void
}

export const useStore = create<AppState>((set) => ({
  currentCard: null,
  highlightedPoiId: null,
  view: 'idle',
  activityQueue: [],

  setCard: (poi) => set({ currentCard: poi }),
  setHighlightedPoi: (id) => set({ highlightedPoiId: id }),
  setView: (view) => set({ view }),
  setQueue: (queue) => set({ activityQueue: queue }),
}))
