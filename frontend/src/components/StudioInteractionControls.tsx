import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  fetchInteractionConfig,
  sendTextMessageToAPI,
  type InteractionConfig,
} from '../api/client'
import { useConversation } from '../hooks/useConversation'
import { useRealtimeVoice } from '../hooks/useRealtimeVoice'
import type { CharacterControls } from './Character'

interface StudioInteractionControlsProps {
  characterControls: CharacterControls | null
  characterId: string
  onLiveTranscriptChange: (text: string) => void
  onFinalTranscriptChange: (text: string) => void
  onModeChange?: (mode: InteractionMode) => void
}

export type InteractionMode = 'text' | 'voice'

const INTERACTION_MODE_STORAGE_KEY = 'anima:studio-interaction-mode'

function readStoredInteractionMode(): InteractionMode {
  try {
    const storedMode = window.localStorage.getItem(INTERACTION_MODE_STORAGE_KEY)
    return storedMode === 'voice' ? 'voice' : 'text'
  } catch {
    return 'text'
  }
}

function storeInteractionMode(mode: InteractionMode) {
  try {
    window.localStorage.setItem(INTERACTION_MODE_STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable in private browsing; the UI still works in memory.
  }
}

const defaultInteractionConfig: InteractionConfig = {
  text_mode: { enabled: true },
  voice_mode: {
    enabled: false,
    provider: null,
    providers: {
      openai: { configured: false },
    },
    reason: 'Set OPENAI_API_KEY to enable voice mode.',
  },
}

function providerLabel(provider: InteractionConfig['voice_mode']['provider']) {
  if (provider === 'openai') return 'OpenAI'
  return 'Voice'
}

export function StudioInteractionControls({
  characterControls,
  characterId,
  onLiveTranscriptChange,
  onFinalTranscriptChange,
  onModeChange,
}: StudioInteractionControlsProps) {
  const [mode, setMode] = useState<InteractionMode>(readStoredInteractionMode)
  const [message, setMessage] = useState('Show me your energy')
  const [interactionConfig, setInteractionConfig] = useState<InteractionConfig>(defaultInteractionConfig)
  const [hasLoadedInteractionConfig, setHasLoadedInteractionConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [textError, setTextError] = useState<string | null>(null)
  const { isProcessing, playResponse } = useConversation(characterControls, characterId)
  const realtimeVoice = useRealtimeVoice({
    provider: interactionConfig.voice_mode.provider,
    characterControls,
    characterId,
    onLiveTranscriptChange,
    onFinalTranscriptChange,
  })

  useEffect(() => {
    let cancelled = false

    void fetchInteractionConfig()
      .then((config) => {
        if (!cancelled) {
          setInteractionConfig(config)
          setHasLoadedInteractionConfig(true)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : 'Failed to load interaction config.')
          setHasLoadedInteractionConfig(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectMode = useCallback((nextMode: InteractionMode) => {
    setMode(nextMode)
    storeInteractionMode(nextMode)
  }, [])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  useEffect(() => {
    if (hasLoadedInteractionConfig && mode === 'voice' && !interactionConfig.voice_mode.enabled) {
      selectMode('text')
    }
  }, [hasLoadedInteractionConfig, interactionConfig.voice_mode.enabled, mode, selectMode])

  const handleTextSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!characterControls || isProcessing) {
        return
      }

      const trimmedMessage = message.trim()
      if (!trimmedMessage) {
        return
      }

      setTextError(null)
      setMessage('')

      try {
        const response = await sendTextMessageToAPI(trimmedMessage, characterId)
        await playResponse(response)
      } catch (error) {
        setTextError(error instanceof Error ? error.message : 'Failed to send message.')
      }
    },
    [
      characterControls,
      characterId,
      isProcessing,
      message,
      playResponse,
    ]
  )

  const handleVoiceToggle = useCallback(async () => {
    if (realtimeVoice.isActive || realtimeVoice.isConnecting) {
      realtimeVoice.stop()
      return
    }

    await realtimeVoice.start()
  }, [realtimeVoice])

  const voiceDisabled = !interactionConfig.voice_mode.enabled || !characterControls
  const statusText =
    mode === 'voice'
      ? realtimeVoice.error ||
        (realtimeVoice.isActive
          ? `${providerLabel(interactionConfig.voice_mode.provider)} connected`
          : realtimeVoice.isConnecting
            ? 'Connecting voice...'
            : `${providerLabel(interactionConfig.voice_mode.provider)} ready`)
      : textError || configError || interactionConfig.voice_mode.reason

  return (
    <div className={`studio-control-panel studio-control-panel--${mode}`} aria-label="Studio controls">
      <div className="studio-mode-switch" role="group" aria-label="Interaction mode">
        <button
          type="button"
          className={mode === 'text' ? 'studio-mode-switch__button studio-mode-switch__button--active' : 'studio-mode-switch__button'}
          onClick={() => selectMode('text')}
        >
          Text
        </button>
        <button
          type="button"
          className={mode === 'voice' ? 'studio-mode-switch__button studio-mode-switch__button--active' : 'studio-mode-switch__button'}
          onClick={() => selectMode('voice')}
          disabled={!interactionConfig.voice_mode.enabled}
        >
          Voice
        </button>
      </div>

      {mode === 'text' ? (
        <form className="studio-text-composer" onSubmit={handleTextSubmit} aria-label="Message composer">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="Message"
            disabled={!characterControls || isProcessing}
          />
          <button type="submit" disabled={!characterControls || isProcessing || !message.trim()}>
            Send
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={realtimeVoice.isActive ? 'studio-voice-button studio-voice-button--active' : 'studio-voice-button'}
          disabled={voiceDisabled && !realtimeVoice.isActive}
          onClick={() => {
            void handleVoiceToggle()
          }}
        >
          {realtimeVoice.isActive || realtimeVoice.isConnecting ? 'Stop voice' : 'Start voice'}
        </button>
      )}

      {statusText && <p className="studio-control-status">{statusText}</p>}
    </div>
  )
}
