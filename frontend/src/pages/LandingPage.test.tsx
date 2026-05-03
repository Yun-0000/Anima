import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

const playAnimation = vi.fn()

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <div data-testid="mock-canvas">{children}</div>,
}))

vi.mock('../components/Character', () => ({
  Character: ({
    onReady,
  }: {
    onReady?: (controls: {
      playAnimation: (key: string) => Promise<void>
    }) => void
  }) => {
    useEffect(() => {
      onReady?.({
        playAnimation,
      })
    }, [onReady])

    return <div data-testid="mock-character" />
  },
}))

describe('LandingPage', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

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
  })

  test('starts the hero character in idle without an automatic gesture', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(playAnimation).toHaveBeenCalledWith('idle')
    })

    expect(playAnimation).toHaveBeenCalledTimes(1)
    expect(playAnimation).not.toHaveBeenCalledWith('wave')
  })
})
