import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { GalleryPage } from './GalleryPage'

const { ensureBrowserAudioUnlocked } = vi.hoisted(() => ({
  ensureBrowserAudioUnlocked: vi.fn().mockResolvedValue(true),
}))

const playAnimation = vi.fn()
const navigate = vi.fn()
let shouldAutoReadyCharacter = true
let errorSpy: ReturnType<typeof vi.spyOn>

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <div data-testid="mock-canvas">{children}</div>,
}))

vi.mock('../components/Character', () => ({
  Character: ({
    onReady,
  }: {
    onReady?: (controls: {
      playAnimation: (key: string) => Promise<void>
      setEmotion: () => void
      blink: () => Promise<void>
      blinkLeft: () => Promise<void>
      blinkRight: () => Promise<void>
      wink: () => Promise<void>
      startLipSync: () => void
      stopLipSync: () => void
      forceReturnToIdle: () => void
    }) => void
  }) => {
    useEffect(() => {
      if (!shouldAutoReadyCharacter) return

      onReady?.({
        playAnimation,
        setEmotion: vi.fn(),
        blink: vi.fn().mockResolvedValue(undefined),
        blinkLeft: vi.fn().mockResolvedValue(undefined),
        blinkRight: vi.fn().mockResolvedValue(undefined),
        wink: vi.fn().mockResolvedValue(undefined),
        startLipSync: vi.fn(),
        stopLipSync: vi.fn(),
        forceReturnToIdle: vi.fn(),
      })
    }, [onReady])

    return <div data-testid="mock-character" />
  },
}))

vi.mock('../utils/audioPlaybackUnlock', () => ({
  ensureBrowserAudioUnlocked,
}))

describe('GalleryPage', () => {
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
    playAnimation.mockReset()
    playAnimation.mockResolvedValue(undefined)
    navigate.mockReset()
    shouldAutoReadyCharacter = true
    ensureBrowserAudioUnlocked.mockReset()
    ensureBrowserAudioUnlocked.mockResolvedValue(true)
  })

  test('shows a loading state while gallery previews are preparing', () => {
    shouldAutoReadyCharacter = false

    render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    )

    expect(screen.getAllByLabelText('Loading character preview')).toHaveLength(2)
  })

  test('plays idle once when the gallery previews enter', async () => {
    render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(playAnimation).toHaveBeenCalled()
    })

    expect(playAnimation).toHaveBeenCalledTimes(2)
    expect(playAnimation).toHaveBeenNthCalledWith(1, 'idle')
    expect(playAnimation).toHaveBeenNthCalledWith(2, 'idle')
    expect(playAnimation).not.toHaveBeenCalledWith('wave')
  })

  test('pre-unlocks audio and creates a fresh studio session when entering studio mode', async () => {
    render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByText('Jane'))

    await waitFor(() => {
      expect(ensureBrowserAudioUnlocked).toHaveBeenCalledTimes(1)
    })

    expect(navigate).toHaveBeenCalledWith('/studio/jane', {
      state: {
        initialAudioUnlocked: true,
        pipelineSessionId: expect.any(Number),
      },
    })
  })

  test('does not expose beta mode controls', async () => {
    render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryAllByLabelText('Loading character preview')).toHaveLength(0)
    })

    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument()
  })
})
