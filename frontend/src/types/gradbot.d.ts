// Ambient declarations for the Gradbot audio bundle loaded via <script>
// tags in index.html. The bundle exposes SyncedAudioPlayer as a global.

interface SyncedAudioPlayerConfig {
  basePath: string
  sampleRate?: number
  pcmOutput?: boolean
  echoCancellation?: boolean
  onEncodedAudio?: (data: ArrayBuffer) => void
  onText?: (msg: { text: string; turnIdx: number; isUser: boolean }) => void
  onEvent?: (eventType: string, msg: Record<string, unknown>) => void
}

declare class SyncedAudioPlayer {
  constructor(config: SyncedAudioPlayerConfig)
  start(): Promise<void>
  stop(): void
  handleMessage(data: ArrayBuffer | Blob | string): void
}
