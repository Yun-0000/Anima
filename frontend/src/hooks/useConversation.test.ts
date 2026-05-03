import { act, renderHook } from '@testing-library/react'
import { useConversation } from './useConversation'
import { emitAgentResponse } from '../state/agentEvents'
import type { ConversationResponse } from '../api/client'

vi.mock('../state/agentEvents', () => ({
  emitAgentResponse: vi.fn(),
}))

const mockedEmitAgentResponse = vi.mocked(emitAgentResponse)

function makeControls() {
  return {
    setEmotion: vi.fn(),
    startLipSync: vi.fn(),
    stopLipSync: vi.fn(),
    wink: vi.fn(() => Promise.resolve()),
    forceReturnToIdle: vi.fn(),
  }
}

describe('useConversation', () => {
  beforeEach(() => {
    mockedEmitAgentResponse.mockReset()
  })

  test('plays text-only response without immediately interrupting the chosen avatar action', async () => {
    const controls = makeControls()
    const onPlaybackFinish = vi.fn()
    const response: ConversationResponse = {
      text: 'hello',
      user_text: 'typed hello',
      emotion: 'happy',
      action: 'wave',
      audio_url: '',
      duration: 0,
    }

    const { result } = renderHook(() => useConversation(controls, 'jane', { onPlaybackFinish }))

    await act(async () => {
      await result.current.playResponse(response)
    })

    expect(mockedEmitAgentResponse).toHaveBeenCalledWith({
      text: 'hello',
      userText: 'typed hello',
      emotion: 'happy',
      action: 'wave',
    })
    expect(controls.setEmotion).toHaveBeenCalledWith('happy')
    expect(controls.setEmotion).not.toHaveBeenCalledWith('neutral')
    expect(controls.stopLipSync).toHaveBeenCalled()
    expect(controls.forceReturnToIdle).not.toHaveBeenCalled()
    expect(onPlaybackFinish).toHaveBeenCalledWith('text-only')
  })

  test('plays audio response with lip sync', async () => {
    const controls = makeControls()
    const onPlaybackStart = vi.fn()
    const onPlaybackFinish = vi.fn()
    let lastAudio: { src: string } | null = null

    class MockAudio {
      src: string
      onplay: (() => void) | null = null
      onended: (() => void) | null = null
      onerror: (() => void) | null = null

      constructor(src: string) {
        this.src = src
        lastAudio = this
      }

      play = vi.fn(() => {
        this.onplay?.()
        this.onended?.()
        return Promise.resolve()
      })

      pause = vi.fn()
    }

    const originalAudio = globalThis.Audio
    globalThis.Audio = MockAudio as unknown as typeof Audio

    const { result } = renderHook(() =>
      useConversation(controls, 'jane', {
        onPlaybackStart,
        onPlaybackFinish,
      })
    )

    await act(async () => {
      await result.current.playResponse({
        text: 'hello',
        user_text: 'typed hello',
        emotion: 'happy',
        action: 'talking',
        audio_url: 'data:audio/mpeg;base64,bXAz',
        duration: 1.2,
      })
    })

    if (!lastAudio) {
      throw new Error('Expected audio element to be created')
    }

    expect((lastAudio as { src: string }).src).toBe('data:audio/mpeg;base64,bXAz')
    expect(onPlaybackStart).toHaveBeenCalled()
    expect(controls.startLipSync).toHaveBeenCalledWith(lastAudio)
    expect(controls.stopLipSync).toHaveBeenCalled()
    expect(onPlaybackFinish).toHaveBeenCalledWith('ended')

    globalThis.Audio = originalAudio
  })

  test('triggers wink emotion without calling setEmotion first', async () => {
    const controls = makeControls()
    const { result } = renderHook(() => useConversation(controls, 'jane'))

    await act(async () => {
      await result.current.playResponse({
        text: 'wink',
        user_text: 'wink',
        emotion: 'wink',
        action: 'idle',
        audio_url: '',
        duration: 0,
      })
    })

    expect(controls.wink).toHaveBeenCalled()
    expect(controls.setEmotion).not.toHaveBeenCalled()
  })

  test('reports character not ready when controls are missing', async () => {
    const { result } = renderHook(() => useConversation(null, 'jane'))

    await act(async () => {
      await result.current.playResponse({
        text: 'hello',
        user_text: 'hello',
        emotion: 'happy',
        action: 'idle',
        audio_url: '',
        duration: 0,
      })
    })

    expect(result.current.error).toBe('Character not ready')
    expect(mockedEmitAgentResponse).not.toHaveBeenCalled()
  })

  test('dispose resets active playback and character state', async () => {
    const controls = makeControls()
    let activeAudio: { pause: ReturnType<typeof vi.fn>; onplay: (() => void) | null } | null = null

    class MockAudio {
      onplay: (() => void) | null = null
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      pause = vi.fn()

      constructor() {
        activeAudio = this
      }

      play = vi.fn(() => {
        this.onplay?.()
        return Promise.resolve()
      })
    }

    const originalAudio = globalThis.Audio
    globalThis.Audio = MockAudio as unknown as typeof Audio

    const { result } = renderHook(() => useConversation(controls, 'jane'))

    void act(() => {
      void result.current.playResponse({
        text: 'hello',
        user_text: 'hello',
        emotion: 'happy',
        action: 'talking',
        audio_url: 'data:audio/mpeg;base64,bXAz',
        duration: 1,
      })
    })

    await act(async () => {})

    act(() => {
      result.current.disposeConversation()
    })

    const capturedAudio = activeAudio as { pause: ReturnType<typeof vi.fn> } | null
    expect(capturedAudio?.pause).toHaveBeenCalled()
    expect(controls.stopLipSync).toHaveBeenCalled()
    expect(controls.setEmotion).toHaveBeenCalledWith('neutral')
    expect(controls.forceReturnToIdle).toHaveBeenCalled()

    globalThis.Audio = originalAudio
  })
})
