import { type DragEvent, useEffect, useRef, useState } from 'react'
import { Stage } from '../stage/stage'
import { gestures, motions, type Gesture, type MotionName } from '../stage/catalog'
import { ALL_EMOTIONS, type EmotionName } from '../types/expression'
import { CHARACTER_OPTIONS } from '../characters/catalog'

type Model = { id: string; label: string; url: string }

/** The app's characters; a dropped .vrm is added for the session. */
const MODELS: Model[] = CHARACTER_OPTIONS.map((character) => ({ id: character.id, label: character.label, url: character.modelUrl }))
const EXPRESSIONS: EmotionName[] = [...ALL_EMOTIONS, 'wink']

/** For checking characters, motions and expressions; drop in a .vrm or .glb file to try it. Open /lab. */
export function LabPage() {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const [model, setModel] = useState<Model>(MODELS[0])
  const [playing, setPlaying] = useState('')
  const [expression, setExpression] = useState<EmotionName>('neutral')
  const [note, setNote] = useState('')

  useEffect(() => {
    const created = new Stage(host.current!, { room: false })
    created.renderer.setClearColor(0xf1eee9, 1)
    // A bit closer than the room view; the feet stay above the buttons.
    created.setFraming({ zoom: 1.3, lift: 0.07 })
    created.onStatus = (status) => setNote(status === 'Ready' ? '' : status)
    stage.current = created
    // Development only: lets visual QA scripts drive the stage.
    if (import.meta.env.DEV) (window as unknown as { __stage?: Stage }).__stage = created
    return () => { created.dispose(); stage.current = null }
  }, [])

  useEffect(() => {
    const current = stage.current!
    let active = true
    current.load(model.url)
      .then((shown) => {
        if (!active || !shown) return
        current.motion!.autonomous = false
        setPlaying(''); setExpression('neutral')
      })
      .catch((error) => { if (active) setNote(`Could not load ${model.label}: ${error instanceof Error ? error.message : error}`) })
    return () => { active = false }
  }, [model])

  const play = (name: MotionName | Gesture) => {
    if ((gestures as readonly string[]).includes(name)) stage.current?.play(name as Gesture)
    else { void stage.current?.motion?.play(name as MotionName); setPlaying(name) }
  }
  // Each version of a motion is checked on its own.
  const playFile = (name: MotionName, file: string) => { void stage.current?.motion?.play(name, { file }); setPlaying(file) }
  const express = (name: EmotionName) => { stage.current?.setEmotion(name); if (name !== 'wink') setExpression(name) }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (/\.vrm$/i.test(file.name)) setModel({ id: file.name, label: file.name, url })
    else if (/\.glb$/i.test(file.name)) { void stage.current?.motion?.playFile(url, true); setPlaying(file.name) }
    else setNote(`${file.name}: drop a .vrm character or a .glb motion`)
  }
  const inCatalog = MODELS.some((option) => option.id === model.id)
  const fromFile = !(Object.values(motions) as { files: readonly string[] }[]).some((motion) => motion.files.includes(playing))

  return (
    <div className="scene-page lab" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <div ref={host} className="stage" />
      <nav className="lab__row lab__row--top" aria-label="Characters">
        {MODELS.map((option) => (
          <button key={option.id} type="button" aria-pressed={model.id === option.id} onClick={() => setModel(option)}>{option.label}</button>
        ))}
        {!inCatalog && <button type="button" aria-pressed>{model.label}</button>}
      </nav>
      {note && <p className="lab__note" role="status">{note}</p>}
      <div className="lab__bottom">
        <nav className="lab__row" aria-label="Motions">
          {(Object.keys(motions) as MotionName[]).flatMap((name) => motions[name].files.map((file) => (
            <button key={file} type="button" aria-pressed={playing === file} onClick={() => playFile(name, file)}>{file}</button>
          )))}
          {gestures.map((name) => <button key={name} type="button" onClick={() => play(name)}>{name}</button>)}
          {fromFile && playing && <button type="button" aria-pressed>{playing}</button>}
        </nav>
        <nav className="lab__row lab__row--small" aria-label="Expressions">
          {EXPRESSIONS.map((name) => (
            <button key={name} type="button" aria-pressed={expression === name} onClick={() => express(name)}>{name}</button>
          ))}
        </nav>
        <p className="lab__hint">Drop a .vrm or .glb here to try it</p>
      </div>
    </div>
  )
}
