import { useCallback, useEffect, useRef } from 'react'
import {
  type FrontendCommand,
  type FrontendEvent,
  type Language,
} from '../lib/commands'
import { dispatchCommand } from '../lib/command-bus'
import { useStore } from '../lib/store'

const PING_INTERVAL_MS = 30_000

export interface InitialPosition {
  lat: number
  lng: number
}

export interface UseWebSocketArgs {
  sessionId: string | null
  initialPosition: InitialPosition | null
  initialHeading: number | null
  language?: Language
}

/**
 * Opens a single WebSocket against the backend at
 * `${VITE_BACKEND_WS_URL}/ws/session/{sessionId}` once `sessionId` AND
 * `initialPosition` are available, instantiates Gradbot's
 * `SyncedAudioPlayer` for the audio loop, sends the Gradbot-reserved
 * `start` message, and routes all inbound traffic through the player.
 *
 * - Player's `onText` → `store.appendTranscript`.
 * - Player's `onEvent` → derives `voiceState` from Gradbot internal
 *   events, and forwards every other typed message to `dispatchCommand`.
 * - Returns a stable `send(event)` for the app shell to push our own
 *   `position_update` / `user_tap` / `user_text_input` upstream — those
 *   go through the backend's `ws_handler.on_event` dispatch.
 *
 * Initial position / heading are captured at open time; subsequent
 * updates must be sent via `send({type:'position_update', ...})`.
 */
export function useWebSocket({
  sessionId,
  initialPosition,
  initialHeading,
  language = 'en',
}: UseWebSocketArgs) {
  const wsRef = useRef<WebSocket | null>(null)
  const playerRef = useRef<SyncedAudioPlayer | null>(null)
  const setWsConnected = useStore((s) => s.setWsConnected)
  const setSessionReady = useStore((s) => s.setSessionReady)
  const setVoiceState = useStore((s) => s.setVoiceState)
  const appendTranscript = useStore((s) => s.appendTranscript)

  // Keep latest position/heading in refs so re-renders don't tear down the WS.
  const positionRef = useRef<InitialPosition | null>(initialPosition)
  const headingRef = useRef<number | null>(initialHeading)
  useEffect(() => {
    positionRef.current = initialPosition
  }, [initialPosition])
  useEffect(() => {
    headingRef.current = initialHeading
  }, [initialHeading])

  // Connect once we have BOTH a sessionId and an initial GPS fix. We use
  // the derived boolean so the WS isn't re-opened on subsequent GPS ticks.
  const hasPosition = initialPosition !== null

  useEffect(() => {
    if (!sessionId || !hasPosition) return

    const baseUrl = import.meta.env.VITE_BACKEND_WS_URL
    if (!baseUrl) {
      console.warn('VITE_BACKEND_WS_URL not set — WebSocket disabled')
      return
    }

    if (typeof SyncedAudioPlayer === 'undefined') {
      console.error(
        'SyncedAudioPlayer is undefined — index.html must load /static/js/*'
      )
      return
    }

    let cancelled = false
    let pingTimer: number | null = null

    const handleGradbotEvent = (msg: Record<string, unknown>) => {
      // Gradbot's internal lifecycle events: derive voice state heuristically.
      if (msg.type === 'event' && typeof msg.event === 'string') {
        const ev = msg.event
        if (ev === 'llm_started' || ev === 'push_to_llm') {
          setVoiceState('thinking')
        } else if (ev === 'first_word' || ev === 'first_tts_audio') {
          setVoiceState('speaking')
        } else if (ev === 'end_tts_audio' || ev === 'end_of_turn') {
          setVoiceState('listening')
        }
        return
      }
      // Anything else: assume it's one of our FrontendCommand variants.
      try {
        dispatchCommand(msg as unknown as FrontendCommand)
      } catch (err) {
        console.warn('Failed to dispatch event from backend:', err, msg)
      }
    }

    const run = async () => {
      const player = new SyncedAudioPlayer({
        basePath: '/static/js',
        sampleRate: 24000,
        pcmOutput: false,
        echoCancellation: true,
        onEncodedAudio: (data) => {
          const ws = wsRef.current
          if (ws?.readyState === WebSocket.OPEN) ws.send(data)
        },
        onText: ({ text, isUser }) => {
          appendTranscript({ speaker: isUser ? 'user' : 'agent', text })
        },
        onEvent: (_eventType, msg) => handleGradbotEvent(msg),
      })

      try {
        await player.start()
      } catch (err) {
        console.error('Failed to start SyncedAudioPlayer:', err)
        return
      }
      if (cancelled) {
        player.stop()
        return
      }
      playerRef.current = player

      const url = `${baseUrl}/ws/session/${sessionId}`
      const ws = new WebSocket(url)
      // SyncedAudioPlayer.handleMessage checks `data instanceof Blob` for audio
      // frames. Keep the browser default (`blob`) — switching to `arraybuffer`
      // makes every binary frame fall through to onEvent and the audio never
      // reaches the Opus decoder.
      ws.binaryType = 'blob'
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) {
          ws.close()
          return
        }
        setWsConnected(true)

        const pos = positionRef.current
        if (!pos) {
          console.warn('WS open but position lost between gate and open')
          return
        }
        // Gradbot-reserved `start` payload — NOT our V1 `session_start`.
        // Backend `on_start` reads lat/lng/heading/language directly off this.
        ws.send(
          JSON.stringify({
            type: 'start',
            lat: pos.lat,
            lng: pos.lng,
            heading: headingRef.current,
            language,
          })
        )
        setSessionReady(true)

        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (e) => {
        // Audio frames + Gradbot JSON + our custom JSON: all routed through
        // the player. Custom JSON (FrontendCommand variants) falls through
        // to `onEvent` -> `handleGradbotEvent` -> `dispatchCommand`.
        player.handleMessage(e.data)
      }

      ws.onerror = (e) => console.warn('WebSocket error', e)

      ws.onclose = (e) => {
        setWsConnected(false)
        setSessionReady(false)
        if (!e.wasClean) {
          console.warn('WebSocket closed unexpectedly:', e.code, e.reason)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      if (pingTimer !== null) window.clearInterval(pingTimer)
      const ws = wsRef.current
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          // Gradbot-reserved close signal — backend `handle_input` returns
          // false on this and tears down the session cleanly.
          ws.send(JSON.stringify({ type: 'stop' }))
        }
        ws.close()
        wsRef.current = null
      }
      const player = playerRef.current
      if (player) {
        player.stop()
        playerRef.current = null
      }
    }
  }, [
    sessionId,
    hasPosition,
    language,
    appendTranscript,
    setSessionReady,
    setVoiceState,
    setWsConnected,
  ])

  const send = useCallback((event: FrontendEvent) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event))
    }
  }, [])

  /** Enable / disable the microphone track without tearing down the
   * audio pipeline. `muted = true` keeps the encoder running on silence,
   * so Gradbot just sees the user as quiet — no false interruptions. */
  const setMicMuted = useCallback((muted: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = playerRef.current as any
    const stream: MediaStream | undefined = player?.audioProcessor?.mediaStream
    if (!stream) return
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted
    }
  }, [])

  return { send, setMicMuted }
}
