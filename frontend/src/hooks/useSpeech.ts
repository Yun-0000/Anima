import { useCallback, useEffect, useRef } from 'react'
import type { ConversationResponse } from '../api/client'
import type { CharacterControls } from '../components/StageView'

export function useSpeech(controls: Pick<CharacterControls, 'startLipSync' | 'forceReturnToIdle'> | null) {
  const playing = useRef<HTMLAudioElement | null>(null)
  const latest = useRef(controls)
  useEffect(() => { latest.current = controls }, [controls])
  useEffect(() => () => { if (playing.current) { playing.current.pause(); playing.current = null; latest.current?.forceReturnToIdle() } }, [])

  return useCallback((response: ConversationResponse) => {
    if (!controls || !response.audio_url) return
    playing.current?.pause()
    const audio = playing.current = new Audio(response.audio_url)
    // Lets lip sync read the audio when the API is on another origin.
    audio.crossOrigin = 'anonymous'
    const finish = () => { if (playing.current === audio) { playing.current = null; controls.forceReturnToIdle() } }
    audio.onplay = () => controls.startLipSync(audio)
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
  }, [controls])
}
