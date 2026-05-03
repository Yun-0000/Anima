import { act, renderHook } from '@testing-library/react'
import { createOpenAIRealtimeCall, requestMotionPlan } from '../api/client'
import { useRealtimeVoice } from './useRealtimeVoice'
import type { CharacterControls } from '../components/Character'

vi.mock('../api/client', () => ({
  createOpenAIRealtimeCall: vi.fn(),
  requestMotionPlan: vi.fn(),
}))

function makeControls() {
  return {
    setEmotion: vi.fn(),
    blink: vi.fn(),
    blinkLeft: vi.fn(),
    blinkRight: vi.fn(),
    wink: vi.fn(() => Promise.resolve()),
    startLipSync: vi.fn(),
    stopLipSync: vi.fn(),
    playAnimation: vi.fn(() => Promise.resolve()),
    getAnimationDuration: vi.fn(),
    forceReturnToIdle: vi.fn(),
    setRootTransform: vi.fn(),
  } as unknown as CharacterControls
}

describe('useRealtimeVoice', () => {
  const originalNavigator = globalThis.navigator
  const originalRTCPeerConnection = globalThis.RTCPeerConnection
  const originalAudio = globalThis.Audio

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createOpenAIRealtimeCall).mockResolvedValue('answer-sdp')
    vi.mocked(requestMotionPlan).mockResolvedValue({ emotion: 'neutral', action: 'idle' })

    const fakeTrack = { stop: vi.fn() } as unknown as MediaStreamTrack
    const fakeStream = {
      getTracks: () => [fakeTrack],
    } as unknown as MediaStream

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        ...originalNavigator,
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(fakeStream),
        },
      },
    })

    class MockAudio {
      autoplay = false
      srcObject: MediaStream | null = null
      play = vi.fn(() => Promise.resolve())
      pause = vi.fn()
    }

    globalThis.Audio = MockAudio as unknown as typeof Audio
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
    globalThis.RTCPeerConnection = originalRTCPeerConnection
    globalThis.Audio = originalAudio
  })

  test('ignores OpenAI avatar tool calls because motion is client-directed', async () => {
    const sentMessages: Array<Record<string, unknown>> = []
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn((message: string) => {
        sentMessages.push(JSON.parse(message))
      })
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.done',
          response: {
            output: [
              {
                type: 'function_call',
                name: 'set_avatar_state',
                call_id: 'call-avatar',
                arguments: JSON.stringify({ emotion: 'happy', action: 'wave' }),
              },
            ],
          },
        }),
      })
    })

    expect(controls.setEmotion).not.toHaveBeenCalledWith('happy')
    expect(controls.playAnimation).not.toHaveBeenCalledWith('wave')
    expect(sentMessages).toEqual([])
  })

  test('uses the backend motion planner for OpenAI assistant transcripts', async () => {
    const sentMessages: Array<Record<string, unknown>> = []
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn((message: string) => {
        sentMessages.push(JSON.parse(message))
      })
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    vi.mocked(requestMotionPlan).mockResolvedValue({ emotion: 'happy', action: 'wave' })
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'user-input',
          transcript: 'hello',
        }),
      })
    })

    await act(async () => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.audio_transcript.done',
          transcript: 'Hi, nice to meet you.',
          response: { id: 'resp-active' },
        }),
      })
      await Promise.resolve()
    })

    expect(requestMotionPlan).toHaveBeenCalledWith(
      {
        user_text: 'hello',
        assistant_text: 'Hi, nice to meet you.',
      },
      'jane'
    )
    expect(controls.setEmotion).toHaveBeenCalledWith('happy')
    expect(controls.playAnimation).toHaveBeenCalledWith('wave')
    expect(sentMessages).toEqual([])
  })

  test('requests a backend motion plan once for duplicate OpenAI transcript events from the same response', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    vi.mocked(requestMotionPlan).mockResolvedValue({ emotion: 'happy', action: 'wave' })
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    await act(async () => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.audio_transcript.done',
          response_id: 'resp-one',
          transcript: 'Hi, nice to meet you.',
        }),
      })
      await Promise.resolve()
    })

    await act(async () => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.audio_transcript.done',
          response_id: 'resp-one',
          transcript: 'Hi, nice to meet you.',
        }),
      })
      await Promise.resolve()
    })

    expect(requestMotionPlan).toHaveBeenCalledTimes(1)
    expect(controls.playAnimation).toHaveBeenCalledTimes(1)
    expect(controls.playAnimation).toHaveBeenCalledWith('wave')
  })

  test('does not force the talking animation for every OpenAI response', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.created',
          response: { id: 'resp-speaking' },
        }),
      })
    })

    expect(controls.playAnimation).not.toHaveBeenCalledWith('talking')
  })

  test('does not let OpenAI choose the talking animation through the old avatar tool', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            name: 'set_avatar_state',
            call_id: 'call-avatar-talking',
            arguments: JSON.stringify({ emotion: 'happy', action: 'talking' }),
          },
        }),
      })
    })

    expect(controls.playAnimation).not.toHaveBeenCalledWith('talking')
  })

  test('does not create extra OpenAI responses for ignored avatar tool output', async () => {
    const sentMessages: Array<Record<string, unknown>> = []
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn((message: string) => {
        sentMessages.push(JSON.parse(message))
      })
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const controls = makeControls()
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: controls,
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            name: 'set_avatar_state',
            call_id: 'call-avatar-early',
            arguments: JSON.stringify({ emotion: 'happy', action: 'wave' }),
          },
        }),
      })
    })

    expect(sentMessages).toEqual([])

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.done',
          response: { id: 'resp-active', output: [] },
        }),
      })
    })

    expect(sentMessages).toEqual([])
  })

  test('keeps OpenAI voice connected when response creation races an active response', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: makeControls(),
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'error',
          error: {
            message:
              'Conversation already has an active response in progress: resp_active. Wait until the response is finished before creating a new one.',
          },
        }),
      })
    })

    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('connected')
  })

  test('does not fail voice mode when OpenAI cancels an interrupted response', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: makeControls(),
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'response.done',
          response: { id: 'resp-interrupted', status: 'cancelled' },
        }),
      })
    })

    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('connected')
  })

  test('surfaces OpenAI realtime server errors', async () => {
    let dataChannelMessageHandler: ((event: { data: string }) => void) | null = null

    class MockDataChannel {
      readyState = 'open'
      onmessage: ((event: { data: string }) => void) | null = null
      close = vi.fn()
      send = vi.fn()
    }

    class MockRTCPeerConnection {
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
      createDataChannel = vi.fn(() => {
        const channel = new MockDataChannel()
        dataChannelMessageHandler = (event: { data: string }) => channel.onmessage?.(event)
        return channel
      })
      addTrack = vi.fn()
      createOffer = vi.fn(() => Promise.resolve({ sdp: 'offer-sdp' }))
      setLocalDescription = vi.fn(() => Promise.resolve())
      setRemoteDescription = vi.fn(() => Promise.resolve())
      close = vi.fn()
    }

    globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection
    const { result } = renderHook(() =>
      useRealtimeVoice({
        provider: 'openai',
        characterControls: makeControls(),
        characterId: 'jane',
      })
    )

    await act(async () => {
      await result.current.start()
    })

    act(() => {
      dataChannelMessageHandler?.({
        data: JSON.stringify({
          type: 'error',
          error: { message: 'No audio response was created.' },
        }),
      })
    })

    expect(result.current.error).toBe('No audio response was created.')
    expect(result.current.status).toBe('error')
  })
})
