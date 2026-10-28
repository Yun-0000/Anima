import { VoiceConversation } from '@elevenlabs/client'
import type { Activity } from '../stage/catalog'
import { apiBaseUrl, type Speaker } from '../api/client'

/** A forgotten session must not keep billing the user's key. */
export const IDLE_MS = 60_000
const SESSION_TIMEOUT_MS = 30_000
/** `answer` is what the character is saying (the subtitle). */
export type VoiceSnapshot = { connected: boolean; connecting: boolean; status: string; answer: string }
export const initialSnapshot: VoiceSnapshot = { connected: false, connecting: false, status: '', answer: '' }

/** Replies may carry delivery tags for the voice, such as "[happy]"; they are not words to show. */
export const spoken = (text: string) => text.replace(/\[[^\]]*\]\s*/g, '').trim()

/** Voice mode: the ElevenLabs agent over WebRTC, with the character's prompt and the same voice as in chat. */
export class LiveClient {
  snapshot: VoiceSnapshot = initialSnapshot
  onChange: (snapshot: VoiceSnapshot) => void = () => {}
  onActivity: (activity: Activity) => void = () => {}
  /** A finished line, the character's or the user's. */
  onLine: (speaker: Speaker, line: string) => void = () => {}
  onAudio: (level: number) => void = () => {}
  private conversation?: VoiceConversation
  private abort?: AbortController
  private timers = new Set<ReturnType<typeof setInterval>>()
  private lastActive = 0
  private speaking = false
  /** The user is speaking (from the agent's voice detection). */
  private hearing = false
  private closing?: Promise<void>
  private update(patch: Partial<VoiceSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.onChange(this.snapshot) }

  async connect(characterId: string) {
    if (this.abort || this.conversation || this.closing) return
    const abort = this.abort = new AbortController()
    this.update({ connecting: true, status: 'Connecting…', answer: '' })
    try {
      const response = await fetch(`${apiBaseUrl}/api/live/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character_id: characterId }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(SESSION_TIMEOUT_MS)]) })
      const session = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof session.detail === 'string' ? session.detail : 'Could not start a voice session')
      const conversation = await VoiceConversation.startSession({
        conversationToken: session.conversation_token,
        connectionType: 'webrtc',
        overrides: session.overrides,
        onConnect: () => { this.lastActive = Date.now(); this.update({ connected: true, status: 'Listening' }) },
        onDisconnect: details => { void this.close(details.reason === 'error' ? details.message : details.reason === 'agent' ? 'Voice ended' : '') },
        onError: message => this.update({ status: message }),
        onModeChange: ({ mode }) => { this.speaking = mode === 'speaking'; this.lastActive = Date.now(); this.report() },
        onVadScore: ({ vadScore }) => {
          const hearing = vadScore > 0.6
          if (hearing === this.hearing) return
          this.hearing = hearing; if (hearing) this.lastActive = Date.now()
          this.report()
        },
        onMessage: ({ role, message }) => {
          const line = spoken(message)
          if (!line) return
          this.lastActive = Date.now()
          // A new exchange starts on screen when the user has spoken; the reply then replaces it.
          this.update({ answer: role === 'agent' ? line : '' })
          this.onLine(role === 'agent' ? 'character' : 'user', line)
        },
      })
      if (abort.signal.aborted) { await conversation.endSession(); return }
      this.conversation = conversation
      this.every(50, () => this.onAudio(this.speaking ? Math.min(1, conversation.getOutputVolume() * 1.6) : 0))
      this.every(1000, () => { if (Date.now() - this.lastActive > IDLE_MS) void this.close('Voice ended after a minute of quiet') })
    } catch (error) {
      const canceled = error instanceof DOMException && error.name === 'AbortError'
      await this.close(canceled ? '' : error instanceof Error ? error.message : String(error))
    } finally { if (this.abort === abort) this.abort = undefined; this.update({ connecting: false }) }
  }
  private every(ms: number, run: () => void) { this.timers.add(setInterval(run, ms)) }
  private report() { this.onActivity(this.hearing ? 'listening' : this.speaking ? 'speaking' : 'idle') }
  close(status = 'Voice ended'): Promise<void> {
    if (!this.closing) this.closing = this.shutdown(status).finally(() => { this.closing = undefined })
    return this.closing
  }
  private async shutdown(status: string) {
    this.abort?.abort(); this.abort = undefined
    for (const timer of this.timers) clearInterval(timer)
    this.timers.clear()
    const conversation = this.conversation
    this.conversation = undefined
    await conversation?.endSession().catch(() => {})
    this.speaking = false; this.hearing = false
    this.onAudio(0); this.onActivity('idle')
    this.update({ connected: false, connecting: false, status })
  }
}
