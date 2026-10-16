import { useCallback, useEffect, useRef } from 'react'
import { directLine, type Speaker } from '../api/client'
import type { CharacterControls } from '../components/StageView'

/** A face returns to neutral this long after the director last gave it a feeling. */
const EMOTION_MS = 6000
/** A gesture waits for the one before it to finish; a wave is not repeated (hello from both sides is one wave). */
const GESTURE_GAP_MS = 1500
const WAVE_AGAIN_MS = 6000

/** Sentences of a reply, so each can get its own gesture (Latin and CJK end marks). */
export function sentences(text: string) {
  return (text.match(/[^.!?…。！？]+[.!?…。！？]*["”’)]?\s*/g) ?? []).map(part => part.trim()).filter(Boolean)
}

/**
 * Body language, separate from what is said: each line of the conversation goes to the director,
 * which answers with a gesture (often none) and an expression for that moment.
 */
export function useDirector(controls: CharacterControls | null, characterId: string) {
  const current = useRef(controls)
  const previous = useRef('')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const lastGesture = useRef(-Infinity)
  const lastWave = useRef(-Infinity)
  useEffect(() => { current.current = controls }, [controls])
  useEffect(() => () => { clearTimeout(resetTimer.current); timers.current.forEach(clearTimeout) }, [])

  const direct = useCallback(async (speaker: Speaker, line: string) => {
    const before = previous.current
    previous.current = line
    let result
    try { result = await directLine(characterId, speaker, line, before) } catch { return }
    const target = current.current
    if (!target) return
    const now = performance.now()
    const tooSoon = now - lastGesture.current < GESTURE_GAP_MS || (result.gesture === 'wave' && now - lastWave.current < WAVE_AGAIN_MS)
    if (result.gesture !== 'none' && !tooSoon) {
      target.playAnimation(result.gesture)
      lastGesture.current = now
      if (result.gesture === 'wave') lastWave.current = now
    }
    target.setEmotion(result.emotion)
    clearTimeout(resetTimer.current)
    if (result.emotion !== 'neutral') resetTimer.current = setTimeout(() => current.current?.setEmotion('neutral'), EMOTION_MS)
  }, [characterId])

  /** A whole reply: one line at a time, spread over `seconds` (its speech, or a reading pace). */
  const directReply = useCallback((text: string, seconds?: number) => {
    const parts = sentences(text)
    const total = parts.reduce((sum, part) => sum + part.length, 0) || 1
    const duration = seconds && seconds > 0 ? seconds * 1000 : total * 55
    let elapsed = 0
    for (const part of parts) {
      const timer = setTimeout(() => { timers.current.delete(timer); void direct('character', part) }, (elapsed / total) * duration)
      timers.current.add(timer)
      elapsed += part.length
    }
  }, [direct])

  return { direct, directReply }
}
