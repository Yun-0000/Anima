import { useCallback, useEffect, useRef } from 'react'
import type { ConversationResponse } from '../api/client'
import type { CharacterControls } from '../components/StageView'

/** Plays a chat reply's speech with lip sync. A new reply cuts off the one still playing, and leaving the room stops it. */
export function useSpeech(controls: Pick<CharacterControls, 'startLipSync' | 'forceReturnToIdle'> | null) {
  const playing = useRef<HTMLAudioElement | null>(null)
  const latest = useRef(controls)
  useEffect(() => { latest.current = controls }, [controls])
  // Leaving mid-speech also stops the lip sync and the talking hands.
  useEffect(() => () => { if (playing.current) { playing.current.pause(); playing.current = null; latest.current?.forceReturnToIdle() } }, [])

  return useCallback((response: ConversationResponse) => {
    if (!controls || !response.audio_url) return
    playing.current?.pause()
    const audio = playing.current = new Audio(response.audio_url)
    // The speech streams from the API; CORS lets lip sync read it when the API is on another origin.
    audio.crossOrigin = 'anonymous'
    const finish = () => { if (playing.current === audio) { playing.current = null; controls.forceReturnToIdle() } }
    audio.onplay = () => controls.startLipSync(audio)
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
  }, [controls])
}
