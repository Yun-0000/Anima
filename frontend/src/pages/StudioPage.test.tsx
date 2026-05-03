import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { StudioPage } from './StudioPage'

const navigate = vi.fn()
let currentCharacterId = 'jane'
let currentLocationState: { initialAudioUnlocked?: boolean; pipelineSessionId?: number } | null = null
let controlsMounts = 0
let controlsUnmounts = 0
let mockedControlsMode: 'text' | 'voice' = 'text'
let mockedControlsFinalText: string | null = null
let shouldAutoReadyCharacter = true
let errorSpy: ReturnType<typeof vi.spyOn>

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useLocation: () => ({ state: currentLocationState }),
    useNavigate: () => navigate,
    useParams: () => ({ characterId: currentCharacterId }),
  }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div data-testid="mock-canvas" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="mock-orbit-controls" />,
}))

vi.mock('../components/Character', () => ({
  Character: ({
    url,
    onReady,
  }: {
    url: string
    onReady?: (controls: {
      playAnimation: (name: string) => Promise<void>
      setEmotion: () => void
      startLipSync: () => void
      stopLipSync: () => void
      forceReturnToIdle: () => void
      wink: () => Promise<void>
    }) => void
  }) => {
    useEffect(() => {
      if (!shouldAutoReadyCharacter) return

      onReady?.({
        playAnimation: vi.fn().mockResolvedValue(undefined),
        setEmotion: vi.fn(),
        startLipSync: vi.fn(),
        stopLipSync: vi.fn(),
        forceReturnToIdle: vi.fn(),
        wink: vi.fn().mockResolvedValue(undefined),
      })
    }, [onReady])

    return <div data-testid="mock-character">{url}</div>
  },
}))

vi.mock('../components/StudioInteractionControls', () => ({
  StudioInteractionControls: ({
    characterId,
    onModeChange,
    onFinalTranscriptChange,
  }: {
    characterId: string
    onModeChange?: (mode: 'text' | 'voice') => void
    onFinalTranscriptChange?: (text: string) => void
  }) => {
    useEffect(() => {
      controlsMounts += 1
      if (mockedControlsFinalText) {
        onFinalTranscriptChange?.(mockedControlsFinalText)
      }
      onModeChange?.(mockedControlsMode)

      return () => {
        controlsUnmounts += 1
      }
    }, [])

    return <div data-testid="mock-studio-controls">{characterId}</div>
  },
}))

vi.mock('../state/agentEvents', () => ({
  subscribeAgentResponse: () => () => {},
}))

vi.mock('../utils/audioPlaybackUnlock', () => ({
  ensureBrowserAudioUnlocked: vi.fn().mockResolvedValue(true),
}))

describe('StudioPage', () => {
  beforeAll(() => {
    const originalError = console.error
    errorSpy = vi.spyOn(console, 'error').mockImplementation((message, ...rest) => {
      if (
        typeof message === 'string' &&
        (message.includes('is unrecognized in this browser') || message.includes('is using incorrect casing'))
      ) {
        return
      }

      originalError(message, ...rest)
    })
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  beforeEach(() => {
    currentCharacterId = 'jane'
    currentLocationState = null
    controlsMounts = 0
    controlsUnmounts = 0
    mockedControlsMode = 'text'
    mockedControlsFinalText = null
    shouldAutoReadyCharacter = true
    navigate.mockReset()
  })

  test('shows a loading state until the selected character is ready', () => {
    shouldAutoReadyCharacter = false

    render(<StudioPage />)

    expect(screen.getByLabelText('Loading selected character')).toBeInTheDocument()
  })

  test('hides the studio canvas until the idle animation is ready', () => {
    shouldAutoReadyCharacter = false

    render(<StudioPage />)

    expect(screen.getByTestId('mock-canvas')).toHaveClass('studio-canvas--loading')
  })

  test('keeps the interaction controls visible in studio', async () => {
    render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('mock-studio-controls')).toHaveTextContent('jane')
  })

  test('hides voice transcript while text mode is active', async () => {
    render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.queryByText('Heard')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for speech...')).not.toBeInTheDocument()
  })

  test('shows a single voice transcript box in voice mode', async () => {
    mockedControlsMode = 'voice'

    render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Heard')).toBeInTheDocument()
    expect(screen.getByText('Waiting for speech...')).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(screen.queryByText('Final')).not.toBeInTheDocument()
  })

  test('clears stale transcript text when entering voice mode', async () => {
    mockedControlsMode = 'voice'
    mockedControlsFinalText = 'previous typed message'

    render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Waiting for speech...')).toBeInTheDocument()
    expect(screen.queryByText('previous typed message')).not.toBeInTheDocument()
  })

  test('switching characters creates a fresh interaction session', async () => {
    const { rerender } = render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('mock-studio-controls')).toHaveTextContent('jane')
    expect(controlsMounts).toBe(1)
    expect(controlsUnmounts).toBe(0)

    currentCharacterId = 'hans'
    rerender(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('mock-studio-controls')).toHaveTextContent('hans')
    expect(controlsMounts).toBe(2)
    expect(controlsUnmounts).toBe(1)
  })

  test('re-entering studio with a fresh pipeline session remounts the interaction session for the same character', async () => {
    currentLocationState = { initialAudioUnlocked: true, pipelineSessionId: 1 }
    const { rerender } = render(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('mock-studio-controls')).toHaveTextContent('jane')
    expect(controlsMounts).toBe(1)
    expect(controlsUnmounts).toBe(0)

    currentLocationState = { initialAudioUnlocked: true, pipelineSessionId: 2 }
    rerender(<StudioPage />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading selected character')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('mock-studio-controls')).toHaveTextContent('jane')
    expect(controlsMounts).toBe(2)
    expect(controlsUnmounts).toBe(1)
  })
})
