import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { CharacterOption } from './characters/catalog'

const controls = vi.hoisted(() => ({
  setEmotion: vi.fn(), playAnimation: vi.fn(), explain: vi.fn(), setActivity: vi.fn(), setAudioLevel: vi.fn(),
  startLipSync: vi.fn(), stopLipSync: vi.fn(), forceReturnToIdle: vi.fn(),
}))
const live = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn(() => Promise.resolve()) }))

// WebGL does not run in jsdom: the stage reports ready with spy controls.
vi.mock('./components/StageView', () => ({
  StageView: ({ character, onReady }: { character: CharacterOption; onReady?: (value: typeof controls) => void }) => {
    useEffect(() => { onReady?.(controls) }, [character, onReady])
    return <div data-testid="stage">{character.label}</div>
  },
}))
vi.mock('./voice/live', async importOriginal => ({
  ...(await importOriginal<typeof import('./voice/live')>()),
  LiveClient: class {
    onChange = () => {}; onActivity = () => {}; onAudio = () => {}
    connect = live.connect; close = live.close
  },
}))

function serve(voice: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/interaction-config')) {
      return new Response(JSON.stringify({ voice_enabled: voice }))
    }
    const body = JSON.parse(String(init?.body))
    // The director relaxes the face at what the user says and waves at the character's greeting.
    if (url.startsWith('/api/direct')) {
      const direction = body.speaker === 'user' ? { gesture: 'none', emotion: 'relaxed' } : { gesture: 'wave', emotion: 'happy' }
      return new Response(JSON.stringify({ directions: body.lines.map(() => direction) }))
    }
    return new Response(JSON.stringify({ text: `You said: ${body.message}`, audio_url: '', duration: 0 }))
  }))
}

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); window.history.pushState({}, '', '/') })
afterEach(() => vi.unstubAllGlobals())

it('goes from the intro to the characters, into a studio and back', async () => {
  serve(false)
  render(<App />)
  expect(screen.getByRole('heading', { name: /characters\s*that feel alive/i })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: /meet them/i }))
  // One character is featured at a time; the others are thumbnails.
  expect(await screen.findByRole('heading', { name: 'Mio' })).toBeInTheDocument()
  for (const name of ['Mio', 'Rin', 'Kai']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Kai' }))
  expect(screen.getByRole('heading', { name: 'Kai' })).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: /enter kai’s room/i })[0])
  expect(await screen.findByTestId('stage')).toHaveTextContent('Kai')
  // Kai greets you on arrival.
  expect(screen.getByText(/Make yourself comfortable/)).toBeInTheDocument()
  // A clear way back to the characters, and from there home.
  await userEvent.click(screen.getByRole('link', { name: /characters/i }))
  expect(await screen.findByRole('heading', { name: 'Mio' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: /home/i }))
  expect(await screen.findByRole('heading', { name: /characters\s*that feel alive/i })).toBeInTheDocument()
})

it('shows a typed reply and lets the character act on it', async () => {
  serve(false)
  window.history.pushState({}, '', '/studio/rin')
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'hello there')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('You said: hello there')).toBeInTheDocument()
  // Body language comes from the director: a reaction to the message, then a wave with the reply.
  await waitFor(() => expect(controls.playAnimation).toHaveBeenCalledWith('wave'))
  expect(controls.setEmotion).toHaveBeenCalledWith('relaxed')
  expect(controls.setEmotion).toHaveBeenCalledWith('happy')
  // Chat has no microphone, and without a key the Voice mode cannot be chosen.
  expect(screen.queryByRole('button', { name: 'Talk with your voice' })).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Voice' })).toBeDisabled())
})

it('starts voice for the shown character and ends it when switching characters', async () => {
  serve(true)
  window.history.pushState({}, '', '/studio/kai')
  render(<App />)
  // Voice mode has no text bar: subtitles and one microphone button.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Voice' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Voice' }))
  expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
  const mic = screen.getByRole('button', { name: 'Talk with your voice' })
  await waitFor(() => expect(mic).toBeEnabled())
  await userEvent.click(mic)
  expect(live.connect).toHaveBeenCalledWith('kai')
  await act(async () => { await userEvent.click(screen.getByRole('button', { name: 'Mio' })) })
  expect(await screen.findByTestId('stage')).toHaveTextContent('Mio')
  expect(live.close).toHaveBeenCalled()
})

it('a typed message shows, small, above the reply', async () => {
  serve(false)
  window.history.pushState({}, '', '/studio/mio')
  render(<App />)
  const box = await screen.findByRole('textbox', { name: 'Message' })
  await waitFor(() => expect(box).toBeEnabled())
  await userEvent.type(box, 'How was your day?{Enter}')
  expect(await screen.findByText('You said: How was your day?')).toBeInTheDocument()
  expect(screen.getByText('“How was your day?”')).toBeInTheDocument()
})
