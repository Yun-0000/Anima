import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Character } from '../components/Character'
import type { CharacterControls } from '../components/Character'
import { StudioInteractionControls } from '../components/StudioInteractionControls'
import type { InteractionMode } from '../components/StudioInteractionControls'
import { CHARACTER_OPTIONS, DEFAULT_CHARACTER_ID, type CharacterId } from '../characters/catalog'
import { subscribeAgentResponse } from '../state/agentEvents'
import { ensureBrowserAudioUnlocked } from '../utils/audioPlaybackUnlock'

interface StudioLocationState {
  initialAudioUnlocked?: boolean
  pipelineSessionId?: number
}

const MIN_CHARACTER_LOADING_MS = 700

interface StudioSessionProps {
  selectedCharacter: (typeof CHARACTER_OPTIONS)[number]
  sessionKey: string
  onExit: () => void
}

function LoadingFallback() {
  return (
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#666666" wireframe />
    </mesh>
  )
}

function StudioSession({ selectedCharacter, sessionKey, onExit }: StudioSessionProps) {
  const [characterControls, setCharacterControls] = useState<CharacterControls | null>(null)
  const [isCharacterReady, setIsCharacterReady] = useState(false)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('text')
  const [liveUserText, setLiveUserText] = useState('')
  const [latestUserText, setLatestUserText] = useState('')
  const loadingStartedAtRef = useRef<number | null>(null)
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void ensureBrowserAudioUnlocked()
  }, [])

  useEffect(() => {
    loadingStartedAtRef.current = Date.now()

    return () => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current)
      }
    }
  }, [])

  const markCharacterReady = useCallback(() => {
    const startedAt = loadingStartedAtRef.current ?? Date.now()
    const elapsedMs = Date.now() - startedAt
    const remainingMs = Math.max(0, MIN_CHARACTER_LOADING_MS - elapsedMs)

    if (readyTimerRef.current) {
      clearTimeout(readyTimerRef.current)
    }

    readyTimerRef.current = setTimeout(() => {
      setIsCharacterReady(true)
    }, remainingMs)
  }, [])

  const handleCharacterReady = useCallback((controls: CharacterControls) => {
    setCharacterControls(controls)
    Promise.resolve(controls.playAnimation('idle'))
      .catch((error) => {
        console.error('Failed to play initial animation:', error)
      })
      .finally(markCharacterReady)
  }, [markCharacterReady])

  const handleInteractionModeChange = useCallback((mode: InteractionMode) => {
    setInteractionMode(mode)
    setLiveUserText('')
    setLatestUserText('')
  }, [])

  useEffect(() => {
    if (!characterControls) {
      return
    }

    const unsubscribe = subscribeAgentResponse((response) => {
      characterControls.setEmotion(response.emotion)
      Promise.resolve(characterControls.playAnimation(response.action ?? 'idle')).catch((error) => {
        console.error('Failed to play animation:', error)
      })
    })

    return unsubscribe
  }, [characterControls])

  return (
    <div className="studio-shell">
      <Canvas
        className={isCharacterReady ? 'studio-canvas' : 'studio-canvas studio-canvas--loading'}
        camera={{ position: [0, 1.5, 3], fov: 45 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-5, 3, -5]} intensity={0.3} />

        <Suspense fallback={<LoadingFallback />}>
          <Character
            key={`studio-character-${sessionKey}`}
            url={selectedCharacter.modelUrl}
            position={[0, 0, 0]}
            onReady={handleCharacterReady}
          />
        </Suspense>

        <OrbitControls
          target={[0, 1, 0]}
          minDistance={1.5}
          maxDistance={5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2}
        />

        <gridHelper args={[10, 10, '#444444', '#333333']} />
      </Canvas>

      {!isCharacterReady && (
        <div className="character-loading character-loading--studio" role="status" aria-label="Loading selected character">
          <span className="character-loading__pulse" aria-hidden="true" />
        </div>
      )}

      {/* Top-left: back button */}
      <button
        type="button"
        className="studio-back"
        onClick={onExit}
      >
        <span aria-hidden="true">←</span>
        <span>Exit</span>
      </button>

      {interactionMode === 'voice' && (
        <div className="studio-transcripts">
          <div className={`studio-transcript${liveUserText || latestUserText ? '' : ' studio-transcript--empty'}`}>
            <span className="studio-transcript__label">Heard</span>
            <p>{liveUserText || latestUserText || 'Waiting for speech...'}</p>
          </div>
        </div>
      )}

      <StudioInteractionControls
        key={`studio-${sessionKey}`}
        characterControls={characterControls}
        characterId={selectedCharacter.id}
        onLiveTranscriptChange={setLiveUserText}
        onFinalTranscriptChange={setLatestUserText}
        onModeChange={handleInteractionModeChange}
      />
    </div>
  )
}

export function StudioPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { characterId: paramCharacterId } = useParams<{ characterId: string }>()
  const characterId = (paramCharacterId ?? DEFAULT_CHARACTER_ID) as CharacterId

  const selectedCharacter = CHARACTER_OPTIONS.find((character) => character.id === characterId) ?? CHARACTER_OPTIONS[0]
  const locationState = (location.state ?? null) as StudioLocationState | null
  const pipelineSessionId = locationState?.pipelineSessionId
  const pipelineSessionKey = pipelineSessionId ? `${selectedCharacter.id}:${pipelineSessionId}` : selectedCharacter.id

  return (
    <StudioSession
      key={pipelineSessionKey}
      selectedCharacter={selectedCharacter}
      sessionKey={pipelineSessionKey}
      onExit={() => navigate('/gallery')}
    />
  )
}
