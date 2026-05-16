import { useMemo } from 'react'
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

export default function VoiceCard() {
  const state = useStore((s) => s.voiceState)
  const transcript = useStore((s) => s.transcript)
  const block = useMemo(() => lastBlock(transcript), [transcript])

  const speaker = block?.speaker ?? 'agent'
  const personaName = speaker === 'agent' ? AGENT_PERSONA : 'Vous'

  return (
    <section
      className={`voice voice--${state}`}
      aria-live="polite"
      aria-atomic="false"
    >
      <header className="voice__header">
        <VoiceIndicator state={state} />
        <span className="voice__persona">{personaName}</span>
        <span className="voice__state">{STATE_LABEL[state]}</span>
      </header>

      {block && block.text.trim() && (
        <p
          className={`voice__transcript voice__transcript--${speaker}`}
          lang="fr"
        >
          {block.text}
        </p>
      )}
    </section>
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
