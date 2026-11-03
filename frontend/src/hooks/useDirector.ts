import { useCallback, useEffect, useRef } from 'react'
import { directLines, type Direction, type Line, type Speaker } from '../api/client'
import type { CharacterControls } from '../components/StageView'

/** A face returns to neutral this long after the director last gave it a feeling. */
const EMOTION_MS = 3000
/** A gesture waits for the one before it to finish; a wave is not repeated (hello from both sides is one wave). */
const GESTURE_GAP_MS = 1500
const WAVE_AGAIN_MS = 6000
const CONTEXT_LINES = 8
/** The server's limit. */
const MAX_LINES = 16

/** Splits on Latin and CJK end marks. */
export function sentences(text: string) {
  return (text.match(/[^.!?…。！？]+[.!?…。！？]*["”’)]?\s*/g) ?? []).map(part => part.trim()).filter(Boolean)
}

/** Body language, chosen apart from the words but knowing the conversation. */
export function useDirector(controls: CharacterControls | null, characterId: string) {
  const current = useRef(controls)
  const transcript = useRef<Line[]>([])
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const lastGesture = useRef(-Infinity)
  const lastWave = useRef(-Infinity)
  /** Counts the user's lines, so a reply's late plan can tell it was cut off. */
  const userLines = useRef(0)
  useEffect(() => { current.current = controls }, [controls])
  // The stage outlives a room; the next character must not inherit this one's face.
  useEffect(() => () => { clearTimeout(resetTimer.current); timers.current.forEach(clearTimeout); current.current?.setEmotion('neutral') }, [])

  const perform = useCallback((direction: Direction) => {
    const target = current.current
    if (!target) return
    const now = performance.now()
    const tooSoon = now - lastGesture.current < GESTURE_GAP_MS || (direction.gesture === 'wave' && now - lastWave.current < WAVE_AGAIN_MS)
    if (direction.gesture !== 'none' && !tooSoon) {
      target.playAnimation(direction.gesture)
      lastGesture.current = now
      if (direction.gesture === 'wave') lastWave.current = now
    }
    target.setEmotion(direction.emotion)
    clearTimeout(resetTimer.current)
    if (direction.emotion !== 'neutral') resetTimer.current = setTimeout(() => current.current?.setEmotion('neutral'), EMOTION_MS)
  }, [])

  const plan = useCallback((speaker: Speaker, text: string, lines = [text]) => {
    const context = transcript.current.slice(-CONTEXT_LINES)
    transcript.current = [...context, { speaker, text }]
    // The user talking again ends the reply; what it had left to act out is dropped.
    if (speaker === 'user') { userLines.current += 1; timers.current.forEach(clearTimeout); timers.current.clear() }
    return directLines(characterId, speaker, lines, context).catch((): Direction[] => [])
  }, [characterId])

  const direct = useCallback(async (speaker: Speaker, line: string) => {
    const [direction] = await plan(speaker, line)
    if (direction) perform(direction)
  }, [plan, perform])

  /** `seconds`: how long the reply takes to say; without it, a reading pace. */
  const directReply = useCallback(async (text: string, seconds?: number) => {
    const parts = sentences(text).slice(0, MAX_LINES)
    if (!parts.length) return
    const asked = performance.now()
    const heard = userLines.current
    const directions = await plan('character', text, parts)
    if (userLines.current !== heard) return
    let said = 0
    const starts = parts.map((part) => { const start = said; said += part.length; return start })
    const duration = seconds && seconds > 0 ? seconds * 1000 : said * 55
    // The speech started when the plan was asked for.
    const late = performance.now() - asked
    directions.forEach((direction, index) => {
      const timer = setTimeout(() => { timers.current.delete(timer); perform(direction) }, (starts[index] / said) * duration - late)
      timers.current.add(timer)
    })
  }, [plan, perform])

  return { direct, directReply }
}
