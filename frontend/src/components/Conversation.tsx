import { type FormEvent, useEffect, useRef, useState } from 'react'
import { sendTextMessageToAPI, type ChatTurn } from '../api/client'
import { useSpeech } from '../hooks/useSpeech'
import { useDirector } from '../hooks/useDirector'
import { LiveClient, initialSnapshot, type VoiceSnapshot } from '../voice/live'
import type { CharacterOption } from '../characters/catalog'
import type { CharacterControls } from './StageView'

export type Mode = 'chat' | 'voice'

interface ConversationProps {
  characterControls: CharacterControls | null
  character: CharacterOption
  mode: Mode
  problem?: string | null
}

export const MicIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
)
export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z" /></svg>
)
const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
)

export function Conversation({ characterControls, character, mode, problem = null }: ConversationProps) {
  const [message, setMessage] = useState('')
  const [exchange, setExchange] = useState<{ user: string; reply: string }>({ user: '', reply: character.greeting })
  const [notice, setNotice] = useState<string | null>(null)
  const [seenStatus, setSeenStatus] = useState('')
  const [voice, setVoice] = useState<VoiceSnapshot>(initialSnapshot)
  // The server keeps up to 20 turns.
  const history = useRef<ChatTurn[]>([{ role: 'assistant', content: character.greeting }])
  const client = useRef<LiveClient | null>(null)
  const controls = useRef(characterControls)
  const speak = useSpeech(characterControls)
  const { direct, directReply } = useDirector(characterControls, character.id)
  const directRef = useRef({ direct, directReply })
  const talking = voice.connected || voice.connecting
  const waiting = !!exchange.user && !exchange.reply
  // Drops a reply that arrives after leaving the room.
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => { controls.current = characterControls }, [characterControls])
  useEffect(() => { directRef.current = { direct, directReply } }, [direct, directReply])

  useEffect(() => {
    const live = new LiveClient()
    live.onChange = setVoice
    live.onAudio = (level) => controls.current?.setAudioLevel(level)
    live.onActivity = (activity) => controls.current?.setActivity(activity)
    live.onLine = (speaker, line) => { if (speaker === 'user') void directRef.current.direct('user', line); else directRef.current.directReply(line) }
    client.current = live
    return () => { void live.close(''); client.current = null }
  }, [])

  useEffect(() => { if (mode === 'chat') void client.current?.close('') }, [mode])

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!characterControls || waiting || !text) return
    setNotice(null)
    setMessage('')
    setExchange({ user: text, reply: '' })
    void direct('user', text)
    try {
      const response = await sendTextMessageToAPI(text, character.id, history.current)
      if (!mounted.current) return
      history.current = [...history.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: response.text }].slice(-20)
      setExchange({ user: text, reply: response.text })
      directReply(response.text, response.audio_url ? response.duration : undefined)
      speak(response)
    } catch {
      setExchange({ user: '', reply: character.greeting })
      setMessage(text)
      setNotice('That message did not go through. Please try again.')
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void send(message)
  }

  const toggleVoice = () => {
    setNotice(null); setSeenStatus('')
    if (talking) void client.current?.close('')
    else void client.current?.connect(character.id)
  }

  // Why voice stopped shows until the next action.
  const voiceNotice = mode === 'voice' && !talking && voice.status !== seenStatus ? voice.status || null : null
  const shownNotice = problem ?? notice ?? voiceNotice
  const noticeLine = shownNotice && <p className="notice" role="status">{shownNotice}</p>

  const said = mode === 'chat' ? exchange.user : ''
  const words = mode === 'voice' ? (talking ? voice.answer : character.greeting) : exchange.reply
  return (
    <div className="conversation">
      {(words || mode === 'chat') && (
        <div className="subtitle" aria-live="polite">
          {said && <p className="subtitle__said">“{said}”</p>}
          <p>{words ? <span>{words}</span> : <span className="typing" aria-label={`${character.label} is replying`}><i /><i /><i /></span>}</p>
        </div>
      )}
      {noticeLine}
      {mode === 'voice' ? (
        <button
          type="button"
          className="voice-button"
          aria-pressed={talking}
          aria-label={talking ? 'End voice chat' : 'Talk with your voice'}
          title={voice.connecting ? 'Connecting…' : talking ? 'Listening · tap to stop' : `Tap to talk to ${character.label}`}
          disabled={!characterControls || !!problem}
          onClick={toggleVoice}
        >
          <MicIcon />
        </button>
      ) : (
        <form className="composer" onSubmit={submit} aria-label="Message composer">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="Message"
            maxLength={2000}
            placeholder={`Say something to ${character.label}…`}
            disabled={!characterControls}
          />
          <button type="submit" className="icon-button icon-button--send" aria-label="Send" disabled={!characterControls || waiting || !message.trim()}>
            <SendIcon />
          </button>
        </form>
      )}
    </div>
  )
}
