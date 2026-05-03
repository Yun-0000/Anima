import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StudioInteractionControls } from './StudioInteractionControls'
import type { CharacterControls } from './Character'
import { fetchInteractionConfig, sendTextMessageToAPI, type InteractionConfig } from '../api/client'
import { useRealtimeVoice } from '../hooks/useRealtimeVoice'

vi.mock('../api/client', () => ({
  fetchInteractionConfig: vi.fn(),
  sendTextMessageToAPI: vi.fn(),
}))

const playResponse = vi.fn()
vi.mock('../hooks/useConversation', () => ({
  useConversation: () => ({
    isProcessing: false,
    error: null,
    playResponse,
    interruptSpeaking: vi.fn(),
    disposeConversation: vi.fn(),
  }),
}))

const startVoice = vi.fn()
const stopVoice = vi.fn()
vi.mock('../hooks/useRealtimeVoice', () => ({
  useRealtimeVoice: vi.fn(() => ({
    status: 'idle',
    error: null,
    isActive: false,
    isConnecting: false,
    start: startVoice,
    stop: stopVoice,
  })),
}))

const controls = {
  setEmotion: vi.fn(),
  blink: vi.fn(),
  blinkLeft: vi.fn(),
  blinkRight: vi.fn(),
  wink: vi.fn(),
  startLipSync: vi.fn(),
  stopLipSync: vi.fn(),
  playAnimation: vi.fn(),
  getAnimationDuration: vi.fn(),
  forceReturnToIdle: vi.fn(),
  setRootTransform: vi.fn(),
} as unknown as CharacterControls

const noVoiceConfig: InteractionConfig = {
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

const openAIConfig: InteractionConfig = {
  text_mode: { enabled: true },
  voice_mode: {
    enabled: true,
    provider: 'openai',
    providers: {
      openai: { configured: true },
    },
    reason: null,
  },
}

describe('StudioInteractionControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchInteractionConfig).mockResolvedValue(noVoiceConfig)
    vi.mocked(sendTextMessageToAPI).mockResolvedValue({
      text: 'Jane answers.',
      user_text: 'hello',
      emotion: 'happy',
      action: 'wave',
      audio_url: '',
      duration: 0,
    })
  })

  test('starts in text mode and sends typed messages', async () => {
    const user = userEvent.setup()
    const onLiveTranscriptChange = vi.fn()
    const onFinalTranscriptChange = vi.fn()

    render(
      <StudioInteractionControls
        characterControls={controls}
        characterId="jane"
        onLiveTranscriptChange={onLiveTranscriptChange}
        onFinalTranscriptChange={onFinalTranscriptChange}
      />
    )

    await user.clear(screen.getByLabelText('Message'))
    await user.type(screen.getByLabelText('Message'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(sendTextMessageToAPI).toHaveBeenCalledWith('hello', 'jane')
    await waitFor(() => {
      expect(playResponse).toHaveBeenCalled()
    })
    expect(onLiveTranscriptChange).not.toHaveBeenCalled()
    expect(onFinalTranscriptChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })

  test('disables voice mode until an OpenAI key is configured', async () => {
    render(
      <StudioInteractionControls
        characterControls={controls}
        characterId="jane"
        onLiveTranscriptChange={vi.fn()}
        onFinalTranscriptChange={vi.fn()}
      />
    )

    const voiceButton = await screen.findByRole('button', { name: 'Voice' })
    expect(voiceButton).toBeDisabled()
    expect(screen.getByText('Set OPENAI_API_KEY to enable voice mode.')).toBeInTheDocument()
  })

  test('starts realtime voice when voice mode is enabled', async () => {
    vi.mocked(fetchInteractionConfig).mockResolvedValue(openAIConfig)
    const user = userEvent.setup()
    const onModeChange = vi.fn()

    render(
      <StudioInteractionControls
        characterControls={controls}
        characterId="jane"
        onLiveTranscriptChange={vi.fn()}
        onFinalTranscriptChange={vi.fn()}
        onModeChange={onModeChange}
      />
    )

    await user.click(await screen.findByRole('button', { name: 'Voice' }))
    await user.click(screen.getByRole('button', { name: 'Start voice' }))

    expect(onModeChange).toHaveBeenCalledWith('voice')
    expect(useRealtimeVoice).toHaveBeenCalled()
    expect(startVoice).toHaveBeenCalled()
  })

  test('restores voice mode after a browser refresh when voice is configured', async () => {
    vi.mocked(fetchInteractionConfig).mockResolvedValue(openAIConfig)
    window.localStorage.setItem('anima:studio-interaction-mode', 'voice')
    const onModeChange = vi.fn()

    render(
      <StudioInteractionControls
        characterControls={controls}
        characterId="jane"
        onLiveTranscriptChange={vi.fn()}
        onFinalTranscriptChange={vi.fn()}
        onModeChange={onModeChange}
      />
    )

    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start voice' })).toBeInTheDocument()
    await waitFor(() => {
      expect(onModeChange).toHaveBeenCalledWith('voice')
    })
  })
})
