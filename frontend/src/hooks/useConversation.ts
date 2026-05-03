import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationResponse } from '../api/client'
import type { CharacterControls } from '../components/Character'
import { emitAgentResponse } from '../state/agentEvents'

type PlaybackFinishReason = 'ended' | 'error' | 'interrupted' | 'text-only'

interface UseConversationOptions {
  onPlaybackStart?: () => void
  onPlaybackFinish?: (reason: PlaybackFinishReason) => void
}

interface UseConversationReturn {
  isProcessing: boolean
  isSpeaking: boolean
  error: string | null
  playResponse: (response: ConversationResponse) => Promise<void>
  interruptSpeaking: () => void
  disposeConversation: () => void
}

export function useConversation(
  characterControls: Pick<CharacterControls, 'setEmotion' | 'startLipSync' | 'stopLipSync' | 'wink' | 'forceReturnToIdle'> | null,
  _characterId: string,
  options: UseConversationOptions = {}
): UseConversationReturn {
  const shouldLog = import.meta.env.DEV && import.meta.env.MODE !== 'test'
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playbackResolverRef = useRef<(() => void) | null>(null)
  const responseVersionRef = useRef(0)
  const disposedRef = useRef(false)
  const { onPlaybackStart, onPlaybackFinish } = options

  useEffect(() => {
    disposedRef.current = false
  }, [])

  const setSpeakingState = useCallback((next: boolean) => {
    setIsSpeaking(next)
  }, [])

  const resetCharacter = useCallback(() => {
    characterControls?.stopLipSync()
    characterControls?.setEmotion('neutral')
    characterControls?.forceReturnToIdle?.()
  }, [characterControls])

  const interruptSpeaking = useCallback(() => {
    responseVersionRef.current += 1

    const audio = currentAudioRef.current
    if (audio) {
      audio.pause()
    }

    playbackResolverRef.current?.()
  }, [])

  const disposeConversation = useCallback(() => {
    disposedRef.current = true
    responseVersionRef.current += 1

    const audio = currentAudioRef.current
    if (audio) {
      audio.pause()
      currentAudioRef.current = null
    }

    playbackResolverRef.current?.()
    playbackResolverRef.current = null
    setSpeakingState(false)
    setIsProcessing(false)
    setError(null)
    resetCharacter()
  }, [resetCharacter, setSpeakingState])

  const playResponseAudio = useCallback(
    async (response: ConversationResponse) => {
      if (!characterControls || disposedRef.current) return

      if (shouldLog) {
        console.debug('[Conversation] response', {
          action: response.action,
          emotion: response.emotion,
        })
      }

      emitAgentResponse({
        text: response.text,
        userText: response.user_text ?? '',
        emotion: response.emotion,
        action: response.action ?? 'idle',
      })

      if (response.emotion === 'wink') {
        void characterControls.wink?.()
      } else {
        characterControls.setEmotion(response.emotion)
      }

      if (!response.audio_url) {
        characterControls.stopLipSync()
        onPlaybackFinish?.('text-only')
        return
      }

      const audio = new Audio(response.audio_url)
      currentAudioRef.current = audio

      await new Promise<void>((resolve) => {
        let finished = false
        const finish = (reason: PlaybackFinishReason) => {
          if (finished) {
            return
          }
          finished = true
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null
          }
          playbackResolverRef.current = null
          setSpeakingState(false)
          characterControls.stopLipSync()
          characterControls.setEmotion('neutral')
          characterControls.forceReturnToIdle?.()
          onPlaybackFinish?.(reason)
          resolve()
        }

        playbackResolverRef.current = () => finish('interrupted')

        audio.onplay = () => {
          setSpeakingState(true)
          onPlaybackStart?.()
          characterControls.startLipSync(audio)
        }

        audio.onended = () => finish('ended')
        audio.onerror = () => finish('error')

        audio.play().catch((err) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          setError(errorMessage)
          console.error('Conversation error:', err)
          finish('error')
        })
      })
    },
    [characterControls, onPlaybackFinish, onPlaybackStart, setSpeakingState, shouldLog]
  )

  const playResponse = useCallback(
    async (response: ConversationResponse) => {
      if (disposedRef.current) {
        return
      }

      if (!characterControls) {
        setError('Character not ready')
        return
      }

      setError(null)
      setIsProcessing(true)
      const responseVersion = responseVersionRef.current
      try {
        if (!disposedRef.current && responseVersion === responseVersionRef.current) {
          await playResponseAudio(response)
        }
      } finally {
        if (!disposedRef.current && responseVersion === responseVersionRef.current) {
          setIsProcessing(false)
        }
      }
    },
    [characterControls, playResponseAudio]
  )

  return {
    isProcessing,
    isSpeaking,
    error,
    playResponse,
    interruptSpeaking,
    disposeConversation,
  }
}
