import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ className }: { className?: string; children?: ReactNode }) => (
    <div data-testid="mock-canvas" className={className} />
  ),
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="mock-orbit-controls" />,
}))

vi.mock('./components/Character', () => ({
  Character: ({ url }: { url: string }) => <div data-testid="mock-character">{url}</div>,
}))

vi.mock('./components/StudioInteractionControls', () => ({
  StudioInteractionControls: () => <div data-testid="mock-studio-controls" />,
}))

vi.mock('./state/agentEvents', () => ({
  subscribeAgentResponse: () => () => {},
}))

vi.mock('./utils/audioPlaybackUnlock', () => ({
  ensureBrowserAudioUnlocked: vi.fn().mockResolvedValue(true),
}))

describe('App routes', () => {
  test('landing page enters the studio-first product path', async () => {
    window.history.pushState({}, '', '/')

    render(<App />)

    expect(screen.getByRole('heading', { name: /characters\s*that feel alive\./i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try it now/i }))

    expect(screen.getByRole('heading', { name: /choose your character/i })).toBeInTheDocument()
  })

  test('gallery route presents a studio-only character roster', () => {
    window.history.pushState({}, '', '/gallery')

    render(<App />)

    expect(screen.getByRole('heading', { name: /choose your character/i })).toBeInTheDocument()
    expect(screen.getByText('Jane')).toBeInTheDocument()
    expect(screen.getByText('Hans')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument()
  })

  test('studio route starts with text-mode chrome', () => {
    window.history.pushState({}, '', '/studio/jane')

    render(<App />)

    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    expect(screen.getByTestId('mock-studio-controls')).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(screen.queryByText('Final')).not.toBeInTheDocument()
  })
})
