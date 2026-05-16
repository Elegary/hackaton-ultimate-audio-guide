import { useMemo, useState, type KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { AGENT_PERSONA } from '../lib/mock-backend'
import type { VoiceStateValue } from '../lib/commands'
import type { TranscriptChunk } from '../lib/store'

const STATE_LABEL: Record<VoiceStateValue, string> = {
  speaking: 'parle',
  listening: 'écoute',
  thinking: 'réfléchit',
  idle: 'prête',
}

/** Take the trailing run of same-speaker chunks (the "current line"). */
function lastBlock(transcript: TranscriptChunk[]): TranscriptChunk | null {
  if (transcript.length === 0) return null
  const speaker = transcript[transcript.length - 1].speaker
  let i = transcript.length - 1
  while (i > 0 && transcript[i - 1].speaker === speaker) i--
  return { speaker, text: transcript.slice(i).map((c) => c.text).join('') }
}

/**
 * Last N sentences from a French text. Treats `.`, `!`, `?`, `…` as terminators
 * and keeps any trailing partial sentence (the one being typed live).
 */
function lastNSentences(text: string, n: number): string {
  if (!text) return ''
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/g)
  if (!sentences) return text.trim()
  return sentences.slice(-n).join('').trimStart()
}

export default function VoiceCard() {
  const state = useStore((s) => s.voiceState)
  const transcript = useStore((s) => s.transcript)
  const [expanded, setExpanded] = useState(false)
  const block = useMemo(() => lastBlock(transcript), [transcript])

  const speaker = block?.speaker ?? 'agent'
  const personaName = speaker === 'agent' ? AGENT_PERSONA : 'Vous'
  const fullText = block?.text.trim() ?? ''
  const visibleText = expanded ? fullText : lastNSentences(fullText, 2)

  const toggle = () => setExpanded((e) => !e)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div className="voice-dock" role="region" aria-label="Guide audio">
      <section
        className={`voice voice--${state}${expanded ? ' is-expanded' : ''}`}
        aria-live="polite"
        aria-atomic="false"
      >
        <header className="voice__header">
          <VoiceIndicator state={state} />
          <span className="voice__persona">{personaName}</span>
          <span className="voice__state">{STATE_LABEL[state]}</span>
        </header>

        {visibleText && (
          <div
            className="voice__transcript-wrap"
            role="button"
            tabIndex={0}
            onClick={toggle}
            onKeyDown={onKey}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? 'Réduire la transcription'
                : 'Voir la transcription complète'
            }
          >
            <p
              className={`voice__transcript voice__transcript--${speaker}`}
              lang="fr"
            >
              {visibleText}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function VoiceIndicator({ state }: { state: VoiceStateValue }) {
  if (state === 'speaking') {
    return (
      <span className="voice-ind voice-ind--speak" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
    )
  }
  if (state === 'listening') {
    return <span className="voice-ind voice-ind--listen" aria-hidden="true" />
  }
  if (state === 'thinking') {
    return (
      <span className="voice-ind voice-ind--think" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    )
  }
  return <span className="voice-ind voice-ind--idle" aria-hidden="true" />
}
