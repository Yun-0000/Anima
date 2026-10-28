import { useEffect, useRef, useState } from 'react'
import { Stage } from '../stage/stage'
import type { Activity } from '../stage/catalog'
import type { DirectedGesture } from '../api/client'
import type { CharacterOption } from '../characters/catalog'
import type { EmotionName } from '../types/expression'

export interface CharacterControls {
  setEmotion: (emotion: EmotionName) => void
  playAnimation: (gesture: DirectedGesture) => void
  setActivity: (activity: Activity) => void
  /** 0 to 1, from the character's voice. */
  setAudioLevel: (level: number) => void
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
  /** Without the room. */
  bare?: boolean
  /** On arrival. A room smiles instead of waving, as the conversation's hello would repeat a wave. */
  greet?: 'wave' | 'smile'
  awake?: boolean
  /** Rest 3-6 s between idles instead of 1-2.5 s. */
  rests?: boolean
}

function react(stage: Stage, action: 'wave' | 'nod' | 'smile' = 'wave') {
  stage.setEmotion('happy')
  if (action !== 'smile') stage.play(action)
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

/** The stage lives as long as this component; switching characters reloads only the model. */
export function StageView({ character, onReady, className = '', zoom = 1, lift = 0, idle = '', bare = false, greet, awake = false, rests = false }: StageViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const ready = useRef(onReady)
  // A new character shows the loading overlay until its model is ready.
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
    current.load(character.modelUrl, awake ? { ...character.preferences, doze: 0 } : character.preferences)
      .then((shown) => {
        if (!active || !shown) return
        setLoadedId(character.id)
        if (current.motion) { current.motion.idleFile = idle; current.motion.rest = rests ? [3, 6] : [1, 2.5] }
        if (greet) react(current, greet)
        ready.current?.(controlsFor(current))
      })
      .catch((error) => {
        console.error('Character load error:', error)
        if (active) setFailedId(character.id)
      })
    return () => { active = false }
  }, [character, idle, greet, awake, rests])

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
