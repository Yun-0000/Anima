import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createOpenAIRealtimeCall,
  requestMotionPlan,
  type InteractionConfig,
} from '../api/client'
import type { CharacterControls } from '../components/Character'
import type { ActionName, EmotionName } from '../types/agent'

type VoiceProvider = NonNullable<InteractionConfig['voice_mode']['provider']>
type RealtimeVoiceStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface UseRealtimeVoiceOptions {
  provider: VoiceProvider | null
  characterControls: CharacterControls | null
  characterId: string
  onLiveTranscriptChange?: (text: string) => void
  onFinalTranscriptChange?: (text: string) => void
}

function isActiveResponseError(message: string) {
  return message.includes('active response in progress')
}

function mergeTranscript(existing: string, next: string) {
  if (!existing || next.startsWith(existing)) {
    return next
  }
  if (existing.endsWith(next)) {
    return existing
  }
  return `${existing}${next}`
}

function openAIResponseKey(event: Record<string, unknown>, response: Record<string, unknown> | undefined, itemId: string) {
  if (typeof event.response_id === 'string') {
    return event.response_id
  }
  if (typeof response?.id === 'string') {
    return response.id
  }
  return itemId
}

export function useRealtimeVoice({
  provider,
  characterControls,
  characterId,
  onLiveTranscriptChange,
  onFinalTranscriptChange,
}: UseRealtimeVoiceOptions) {
  const [status, setStatus] = useState<RealtimeVoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const openAITranscriptDeltasRef = useRef<Map<string, string>>(new Map())
  const openAIOutputTranscriptDeltasRef = useRef<Map<string, string>>(new Map())
  const latestUserTranscriptRef = useRef('')
  const plannedMotionResponseIdsRef = useRef<Set<string>>(new Set())

  const applyAvatarState = useCallback(
    async (emotion: EmotionName = 'neutral', action: ActionName = 'idle') => {
      if (!characterControls) {
        return
      }

      if (emotion === 'wink') {
        void characterControls.wink()
      } else {
        characterControls.setEmotion(emotion)
      }

      await characterControls.playAnimation(action)
    },
    [characterControls]
  )

  const applyDirectedMotion = useCallback(
    async (assistantText: string, responseKey: string) => {
      const normalizedAssistantText = assistantText.trim()
      if (!normalizedAssistantText || plannedMotionResponseIdsRef.current.has(responseKey)) {
        return
      }

      plannedMotionResponseIdsRef.current.add(responseKey)
      try {
        const plan = await requestMotionPlan(
          {
            user_text: latestUserTranscriptRef.current,
            assistant_text: normalizedAssistantText,
          },
          characterId
        )
        if (plan.emotion === 'neutral' && plan.action === 'idle') {
          return
        }
        await applyAvatarState(plan.emotion, plan.action)
      } catch (err) {
        console.warn('Failed to plan avatar motion:', err)
        return
      }
    },
    [applyAvatarState, characterId]
  )

  const cleanup = useCallback(() => {
    dataChannelRef.current?.close()
    dataChannelRef.current = null

    peerConnectionRef.current?.close()
    peerConnectionRef.current = null

    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause()
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }

    characterControls?.stopLipSync()
    characterControls?.setEmotion('neutral')
    characterControls?.forceReturnToIdle()
    openAITranscriptDeltasRef.current.clear()
    openAIOutputTranscriptDeltasRef.current.clear()
    latestUserTranscriptRef.current = ''
    plannedMotionResponseIdsRef.current.clear()
  }, [characterControls])

  const handleOpenAIEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = typeof event.type === 'string' ? event.type : ''
      const itemId = typeof event.item_id === 'string' ? event.item_id : 'current'
      const eventError = event.error as Record<string, unknown> | undefined
      const response = event.response as Record<string, unknown> | undefined
      const responseKey = openAIResponseKey(event, response, itemId)

      if (type === 'error') {
        const message = typeof eventError?.message === 'string' ? eventError.message : 'OpenAI realtime error.'
        if (isActiveResponseError(message)) {
          setError(null)
          setStatus('connected')
          return
        }

        setError(message)
        setStatus('error')
        return
      }

      if (type === 'response.done' && response?.status === 'cancelled') {
        setError(null)
        setStatus('connected')
        return
      }

      if (
        type === 'response.done' &&
        (response?.status === 'failed' || response?.status === 'incomplete')
      ) {
        const statusDetails = response.status_details as Record<string, unknown> | undefined
        const statusError = statusDetails?.error as Record<string, unknown> | undefined
        setError(
          typeof statusError?.message === 'string'
            ? statusError.message
            : `OpenAI response ${String(response.status)}.`
        )
        setStatus('error')
        return
      }

      if (type.includes('input_audio_transcription.delta') && typeof event.delta === 'string') {
        const nextTranscript = `${openAITranscriptDeltasRef.current.get(itemId) ?? ''}${event.delta}`
        openAITranscriptDeltasRef.current.set(itemId, nextTranscript)
        onLiveTranscriptChange?.(nextTranscript)
      } else if (typeof event.transcript === 'string') {
        if (type.includes('input_audio_transcription.completed')) {
          openAITranscriptDeltasRef.current.delete(itemId)
          latestUserTranscriptRef.current = event.transcript
          onFinalTranscriptChange?.(event.transcript)
          onLiveTranscriptChange?.('')
        } else if (type.includes('input_audio_transcription')) {
          onLiveTranscriptChange?.(event.transcript)
        }
      }

      const isAssistantTranscriptEvent =
        !type.includes('input_audio_transcription') &&
        (type.includes('audio_transcript') || type.includes('output_audio_transcription'))
      if (isAssistantTranscriptEvent && typeof event.delta === 'string') {
        const nextTranscript = mergeTranscript(openAIOutputTranscriptDeltasRef.current.get(responseKey) ?? '', event.delta)
        openAIOutputTranscriptDeltasRef.current.set(responseKey, nextTranscript)
      } else if (isAssistantTranscriptEvent && typeof event.transcript === 'string') {
        openAIOutputTranscriptDeltasRef.current.delete(responseKey)
        void applyDirectedMotion(event.transcript, responseKey)
      }
    },
    [applyDirectedMotion, onFinalTranscriptChange, onLiveTranscriptChange]
  )

  const startOpenAI = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    localStreamRef.current = stream

    const peerConnection = new RTCPeerConnection()
    peerConnectionRef.current = peerConnection

    const audioElement = new Audio()
    audioElement.autoplay = true
    remoteAudioRef.current = audioElement

    peerConnection.ontrack = (event) => {
      audioElement.srcObject = event.streams[0]
      void audioElement.play()
      characterControls?.startLipSync(audioElement)
    }

    const dataChannel = peerConnection.createDataChannel('oai-events')
    dataChannelRef.current = dataChannel
    dataChannel.onmessage = (event) => {
      try {
        handleOpenAIEvent(JSON.parse(event.data))
      } catch (err) {
        console.error('Failed to parse OpenAI realtime event:', err)
      }
    }

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream)
    })

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    const answerSdp = await createOpenAIRealtimeCall(offer.sdp ?? '', characterId)
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  }, [characterControls, characterId, handleOpenAIEvent])

  const stop = useCallback(() => {
    cleanup()
    setStatus('idle')
  }, [cleanup])

  const start = useCallback(async () => {
    if (!provider) {
      setError('Voice mode needs OPENAI_API_KEY configuration.')
      setStatus('error')
      return
    }

    cleanup()
    setStatus('connecting')
    setError(null)

    try {
      await startOpenAI()
      setStatus('connected')
    } catch (err) {
      cleanup()
      const message = err instanceof Error ? err.message : 'Voice mode failed to start.'
      setError(message)
      setStatus('error')
    }
  }, [cleanup, provider, startOpenAI])

  useEffect(() => cleanup, [cleanup])

  return {
    status,
    error,
    isActive: status === 'connected',
    isConnecting: status === 'connecting',
    start,
    stop,
  }
}
