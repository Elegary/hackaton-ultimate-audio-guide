import type { FrontendCommand } from './commands'
import { useStore } from './store'

export function dispatchCommand(cmd: FrontendCommand) {
  const store = useStore.getState()

  switch (cmd.type) {
    // Session lifecycle
    case 'session_ready':
      store.setSessionReady(true)
      // cmd.livekit will be wired when we add the audio hook
      break
    case 'session_error':
      store.setSessionReady(false)
      console.error('Session error:', cmd.code, cmd.message)
      break
    case 'pong':
      break

    // Cards & POI
    case 'display_card':
    case 'update_card':
      store.setCard(cmd.poi)
      break
    case 'clear_card':
      store.setCard(null)
      break
    case 'highlight_poi':
      store.setHighlightedPoi(cmd.poi_id)
      break

    // Map (handled by event bus when wired)
    case 'zoom_map':
      break

    // Views & queues
    case 'switch_view':
      store.setView(cmd.view)
      break
    case 'set_queue':
      store.setQueue(cmd.activities)
      break
    case 'clear_queue':
      store.setQueue([])
      break

    // Voice
    case 'voice_state':
      store.setVoiceState(cmd.state)
      break
    case 'transcript_chunk':
      store.appendTranscript({ speaker: cmd.speaker, text: cmd.text })
      break

    case 'error':
      console.error('Backend error:', cmd.message)
      break

    default: {
      // Exhaustive at compile time. At runtime, unknown command types from
      // the wire land here (forward-compat) — log and continue per spec.
      const _exhaustive: never = cmd
      console.warn('Unknown WS command, ignored:', _exhaustive)
    }
  }
}
