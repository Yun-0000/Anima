import { useEffect, useRef, useState } from 'react'
import { Stage } from '../stage/stage'
import type { Activity } from '../stage/catalog'
import type { DirectedGesture } from '../api/client'
import type { CharacterOption } from '../characters/catalog'
import type { EmotionName } from '../types/expression'

export interface CharacterControls {
  setEmotion: (emotion: EmotionName) => void
  /** A gesture the director chose. */
  playAnimation: (gesture: DirectedGesture) => void
  setActivity: (activity: Activity) => void
  /** Drives the mouth from the character's own voice (0–1). */
  setAudioLevel: (level: number) => void
  /** Moves the mouth with an audio element's loudness and keeps the character facing the user meanwhile. */
  startLipSync: (audio: HTMLAudioElement) => void
  stopLipSync: () => void
  forceReturnToIdle: () => void
}

interface StageViewProps {
  character: CharacterOption
  onReady?: (controls: CharacterControls) => void
  className?: string
  /** See Stage.framing. */
  zoom?: number
  lift?: number
  /** Idle with this one version instead of rotating between them. */
  idle?: string
  /** Just the character and its shadow over the page, without the room. */
  bare?: boolean
  /** Wave hello when the character appears; without it (the gallery) the character also stays awake, never dozing. */
  greet?: boolean
  /** Longer rests between idles (home and gallery: 3-6 s); the studio rests only 1-2.5 s, so it looks livelier. */
  rests?: boolean
}

/** A happy wave on arrival, and a small reaction when the character is clicked. */
function react(stage: Stage, action: 'wave' | 'nod' = 'wave') {
  stage.setEmotion('happy'); stage.play(action)
  setTimeout(() => stage.setEmotion('neutral'), 2600)
}

function controlsFor(stage: Stage): CharacterControls {
  let stopMeter = () => {}
  const stopLipSync = () => { stopMeter(); stopMeter = () => {}; stage.audioLevel = 0 }
  return {
    setEmotion: (emotion) => stage.setEmotion(emotion),
    playAnimation: (gesture) => stage.play(gesture),
    setActivity: (activity) => stage.setActivity(activity),
    setAudioLevel: (level) => { stage.audioLevel = level },
    startLipSync: (audio) => {
      stopLipSync()
      stage.setActivity('speaking')
      const context = new AudioContext()
      const analyser = context.createAnalyser(); analyser.fftSize = 256
      const source = context.createMediaElementSource(audio)
      source.connect(analyser); analyser.connect(context.destination)
      const samples = new Float32Array(analyser.fftSize)
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
        stage.audioLevel = Math.min(1, rms * 8)
      }, 50)
      stopMeter = () => { clearInterval(timer); void context.close() }
    },
    stopLipSync,
    forceReturnToIdle: () => { stopLipSync(); stage.setEmotion('neutral'); stage.setActivity('idle') },
  }
}

/** A character in its room. The stage lives as long as this component; switching characters reloads only the model. */
export function StageView({ character, onReady, className = '', zoom = 1, lift = 0, idle = '', bare = false, greet = true, rests = false }: StageViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const ready = useRef(onReady)
  // Which character is on stage (or failed): a new character shows the loading overlay until its model is ready.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const loaded = loadedId === character.id
  const failed = failedId === character.id

  useEffect(() => { ready.current = onReady }, [onReady])

  useEffect(() => {
    const created = new Stage(host.current!, { room: !bare })
    if (bare) created.renderer.setClearColor(0x000000, 0)
    stage.current = created
    // Development only: lets visual QA scripts drive motions directly.
    if (import.meta.env.DEV) (window as unknown as { __stage?: Stage }).__stage = created
    return () => { created.dispose(); stage.current = null }
    // A stage is made once; `bare` is fixed for the life of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { stage.current?.setFraming({ zoom, lift }) }, [zoom, lift])

  useEffect(() => {
    const current = stage.current!
    let active = true
    current.load(character.modelUrl, greet ? character.preferences : { ...character.preferences, doze: 0 })
      .then((shown) => {
        if (!active || !shown) return
        setLoadedId(character.id)
        if (current.motion) { current.motion.idleFile = idle; current.motion.rest = rests ? [3, 6] : [1, 2.5] }
        if (greet) react(current)
        ready.current?.(controlsFor(current))
      })
      .catch((error) => {
        console.error('Character load error:', error)
        if (active) setFailedId(character.id)
      })
    return () => { active = false }
  }, [character, idle, greet, rests])

  const onClick = (event: React.MouseEvent) => {
    const current = stage.current
    if (loaded && current?.hitTest(event.clientX, event.clientY)) react(current, Math.random() < 0.5 ? 'wave' : 'nod')
  }

  return (
    <div className={`stage ${bare ? 'stage--bare ' : ''}${className}`}>
      <div ref={host} className="stage__canvas" onClick={onClick} />
      {!loaded && (
        <div className="stage__loading" role="status">
          {failed ? `Could not load ${character.label}.` : <><span className="spinner" aria-hidden="true" />Loading {character.label}…</>}
        </div>
      )}
    </div>
  )
}
