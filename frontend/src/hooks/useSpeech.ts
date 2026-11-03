import { useCallback, useEffect, useRef } from 'react'
import type { ConversationResponse } from '../api/client'
import type { CharacterControls } from '../components/StageView'

/** Feeds the speech in as it arrives; a plain src makes the browser buffer first, about 0.35 s longer. */
function streamTo(audio: HTMLAudioElement, url: string) {
  if (!window.MediaSource?.isTypeSupported('audio/mpeg')) { audio.src = url; return }
  const source = new MediaSource()
  audio.src = URL.createObjectURL(source)
  source.addEventListener('sourceopen', async () => {
    URL.revokeObjectURL(audio.src)
    const buffer = source.addSourceBuffer('audio/mpeg')
    const appended = () => buffer.updating ? new Promise(resolve => buffer.addEventListener('updateend', resolve, { once: true })) : Promise.resolve()
    try {
      const response = await fetch(url)
      if (!response.ok || !response.body) throw new Error(`Speech error ${response.status}`)
      const reader = response.body.getReader()
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        await appended()
        buffer.appendBuffer(chunk.value)
      }
      await appended()
      source.endOfStream()
    } catch {
      // A reply cut off by the next one has already closed its source.
      if (source.readyState === 'open') source.endOfStream('network')
    }
  }, { once: true })
}

export function useSpeech(controls: Pick<CharacterControls, 'startLipSync' | 'forceReturnToIdle'> | null) {
  const playing = useRef<HTMLAudioElement | null>(null)
  const latest = useRef(controls)
  useEffect(() => { latest.current = controls }, [controls])

  /** Cuts off a reply that is still playing: on leaving, or when the conversation goes on by voice. */
  const stop = useCallback(() => {
    if (!playing.current) return
    playing.current.pause(); playing.current = null
    latest.current?.forceReturnToIdle()
  }, [])
  useEffect(() => stop, [stop])

  const speak = useCallback((response: ConversationResponse) => {
    if (!controls || !response.audio_url) return
    playing.current?.pause()
    const audio = playing.current = new Audio()
    // Lets lip sync read the audio when the API is on another origin.
    audio.crossOrigin = 'anonymous'
    const finish = () => { if (playing.current === audio) { playing.current = null; controls.forceReturnToIdle() } }
    audio.onplay = () => controls.startLipSync(audio)
    audio.onended = finish
    audio.onerror = finish
    streamTo(audio, response.audio_url)
    audio.play().catch(finish)
  }, [controls])

  return { speak, stop }
}
