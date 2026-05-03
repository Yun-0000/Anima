import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Character } from '../components/Character'
import type { CharacterControls } from '../components/Character'
import { CHARACTER_OPTIONS } from '../characters/catalog'
import { ensureBrowserAudioUnlocked } from '../utils/audioPlaybackUnlock'

const MIN_CHARACTER_LOADING_MS = 700

function CharacterPreview({ modelUrl, characterId }: { modelUrl: string; characterId: string }) {
  const [isPreviewReady, setIsPreviewReady] = useState(false)
  const loadingStartedAtRef = useRef<number | null>(null)
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadingStartedAtRef.current = Date.now()

    return () => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current)
      }
    }
  }, [])

  const markPreviewReady = useCallback(() => {
    const startedAt = loadingStartedAtRef.current ?? Date.now()
    const elapsedMs = Date.now() - startedAt
    const remainingMs = Math.max(0, MIN_CHARACTER_LOADING_MS - elapsedMs)

    if (readyTimerRef.current) {
      clearTimeout(readyTimerRef.current)
    }

    readyTimerRef.current = setTimeout(() => {
      setIsPreviewReady(true)
    }, remainingMs)
  }, [])

  const handleReady = useCallback((controls: CharacterControls) => {
    Promise.resolve(controls.playAnimation('idle'))
      .catch(() => {})
      .finally(markPreviewReady)
  }, [markPreviewReady])

  return (
    <>
      <Canvas className="character-frame__canvas" camera={{ position: [0, 1.2, 4.5], fov: 30 }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#b0c4de" />
        <Suspense fallback={null}>
          <Character key={`gallery-${characterId}`} url={modelUrl} position={[0, -0.8, 0]} onReady={handleReady} />
        </Suspense>
      </Canvas>
      {!isPreviewReady && (
        <div className="character-loading character-loading--card" role="status" aria-label="Loading character preview">
          <span className="character-loading__pulse" aria-hidden="true" />
        </div>
      )}
    </>
  )
}

function CharacterCard({
  character,
  onPick,
}: {
  character: (typeof CHARACTER_OPTIONS)[number]
  onPick: (id: string) => void
}) {
  return (
    <article className="gallery-card" onClick={() => onPick(character.id)}>
      <div className="gallery-card__canvas">
        <CharacterPreview modelUrl={character.modelUrl} characterId={character.id} />
      </div>
      <div className="gallery-card__info">
        <h2>{character.label}</h2>
        <span className="gallery-card__cue">
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </article>
  )
}

export function GalleryPage() {
  const navigate = useNavigate()

  const handlePick = useCallback(
    async (characterId: string) => {
      const initialAudioUnlocked = await ensureBrowserAudioUnlocked()

      navigate(`/studio/${characterId}`, {
        state: {
          initialAudioUnlocked,
          pipelineSessionId: Date.now(),
        },
      })
    },
    [navigate],
  )

  return (
    <div className="gallery-shell">
      <header className="gallery-nav">
        <button type="button" className="button button--ghost button--compact" onClick={() => navigate('/')}>
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </button>
        <span className="gallery-nav__brand">Anima</span>
        <div style={{ width: 80 }} />
      </header>

      <h1 className="gallery-title">Choose your character.</h1>

      <div className="gallery-layout">
        <div className="gallery-roster">
          {CHARACTER_OPTIONS.map((character) => (
            <CharacterCard key={character.id} character={character} onPick={handlePick} />
          ))}
        </div>
      </div>
    </div>
  )
}
