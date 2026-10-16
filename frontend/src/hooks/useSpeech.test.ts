import { renderHook } from '@testing-library/react'
import { useSpeech } from './useSpeech'

const created: MockAudio[] = []
class MockAudio {
  onplay: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  pause = vi.fn()
  play = vi.fn(() => { this.onplay?.(); return Promise.resolve() })
  src: string
  constructor(src: string) { this.src = src; created.push(this) }
}

beforeEach(() => { created.length = 0; vi.stubGlobal('Audio', MockAudio) })
afterEach(() => vi.unstubAllGlobals())

const reply = (audio_url: string) => ({ text: 'hello', audio_url, duration: 1 })

it('plays the speech with lip sync and returns the character to idle when it ends', () => {
  const controls = { startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }
  const { result } = renderHook(() => useSpeech(controls))
  result.current(reply('/api/speech/1'))
  expect(created[0].src).toBe('/api/speech/1')
  expect(controls.startLipSync).toHaveBeenCalledWith(created[0])
  created[0].onended?.()
  expect(controls.forceReturnToIdle).toHaveBeenCalledTimes(1)
})

it('a text-only reply plays nothing', () => {
  const { result } = renderHook(() => useSpeech({ startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }))
  result.current(reply(''))
  expect(created).toHaveLength(0)
})

it('a new reply cuts off the old one, and leaving stops the voice', () => {
  const controls = { startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }
  const { result, unmount } = renderHook(() => useSpeech(controls))
  result.current(reply('/api/speech/1'))
  result.current(reply('/api/speech/2'))
  expect(created[0].pause).toHaveBeenCalled()
  // The old reply's end no longer resets the character.
  created[0].onended?.()
  expect(controls.forceReturnToIdle).not.toHaveBeenCalled()
  unmount()
  expect(created[1].pause).toHaveBeenCalled()
})
