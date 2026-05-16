import { useCallback, useEffect, useRef } from 'react'
import {
  PROTOCOL_VERSION,
  type FrontendCommand,
  type FrontendEvent,
} from '../lib/commands'
import { dispatchCommand } from '../lib/command-bus'
import { useStore } from '../lib/store'

const PING_INTERVAL_MS = 30_000

/**
 * Connects to the backend WebSocket at
 * `${VITE_BACKEND_WS_URL}/ws/session/{sessionId}`, sends `session_start`
 * on open, forwards every incoming command to `dispatchCommand`, pings
 * every 30s to keep Railway happy, and sends `session_end` on cleanup.
 *
 * Returns a stable `send(event)` for the app shell to push
 * `position_update` / `user_tap` / `user_text_input` upstream.
 */
export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const setWsConnected = useStore((s) => s.setWsConnected)
  const setSessionReady = useStore((s) => s.setSessionReady)

  useEffect(() => {
    if (!sessionId) return

    const baseUrl = import.meta.env.VITE_BACKEND_WS_URL
    if (!baseUrl) {
      console.warn('VITE_BACKEND_WS_URL not set — WebSocket disabled')
      return
    }

    const url = `${baseUrl}/ws/session/${sessionId}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    const safeSend = (event: FrontendEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event))
      }
    }

    ws.onopen = () => {
      setWsConnected(true)
      safeSend({
        type: 'session_start',
        protocol_version: PROTOCOL_VERSION,
        language: 'fr',
      })
    }

    ws.onmessage = (e) => {
      try {
        const cmd = JSON.parse(e.data) as FrontendCommand
        dispatchCommand(cmd)
      } catch (err) {
        console.warn('Failed to parse WS message:', err, e.data)
      }
    }

    ws.onerror = (e) => {
      console.warn('WebSocket error', e)
    }

    ws.onclose = (e) => {
      setWsConnected(false)
      setSessionReady(false)
      if (!e.wasClean) {
        console.warn('WebSocket closed unexpectedly:', e.code, e.reason)
      }
    }

    const pingInterval = window.setInterval(() => {
      safeSend({ type: 'ping' })
    }, PING_INTERVAL_MS)

    return () => {
      window.clearInterval(pingInterval)
      safeSend({ type: 'session_end' })
      ws.close()
      wsRef.current = null
    }
  }, [sessionId, setWsConnected, setSessionReady])

  const send = useCallback((event: FrontendEvent) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event))
    }
  }, [])

  return { send }
}
