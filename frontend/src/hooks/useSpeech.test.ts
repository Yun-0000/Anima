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
  result.current.speak(reply('/api/speech/1'))
  expect(created[0].src).toBe('/api/speech/1')
  expect(controls.startLipSync).toHaveBeenCalledWith(created[0])
  created[0].onended?.()
  expect(controls.forceReturnToIdle).toHaveBeenCalledTimes(1)
})

it('feeds the speech in as it arrives where the browser can', async () => {
  const appended: unknown[] = []
  const endOfStream = vi.fn()
  const sources: EventTarget[] = []
  class MockMediaSource extends EventTarget {
    static isTypeSupported = () => true
    readyState = 'open'
    endOfStream = endOfStream
    constructor() { super(); sources.push(this) }
    addSourceBuffer() { return Object.assign(new EventTarget(), { updating: false, appendBuffer: (chunk: unknown) => appended.push(chunk) }) }
  }
  const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
  vi.stubGlobal('MediaSource', MockMediaSource)
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:speech')
  URL.revokeObjectURL = vi.fn()
  const { result } = renderHook(() => useSpeech({ startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }))
  result.current.speak(reply('/api/speech/1'))
  expect(created[0].src).toBe('blob:speech')
  sources[0].dispatchEvent(new Event('sourceopen'))
  await vi.waitFor(() => expect(endOfStream).toHaveBeenCalledWith())
  expect(fetchMock).toHaveBeenCalledWith('/api/speech/1')
  expect(appended.length).toBeGreaterThan(0)
})

it('a text-only reply plays nothing', () => {
  const { result } = renderHook(() => useSpeech({ startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }))
  result.current.speak(reply(''))
  expect(created).toHaveLength(0)
})

it('a new reply cuts off the old one, and leaving stops the voice', () => {
  const controls = { startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }
  const { result, unmount } = renderHook(() => useSpeech(controls))
  result.current.speak(reply('/api/speech/1'))
  result.current.speak(reply('/api/speech/2'))
  expect(created[0].pause).toHaveBeenCalled()
  // The old reply's end no longer resets the character.
  created[0].onended?.()
  expect(controls.forceReturnToIdle).not.toHaveBeenCalled()
  unmount()
  expect(created[1].pause).toHaveBeenCalled()
})

it('stopping cuts off the reply that is playing', () => {
  const controls = { startLipSync: vi.fn(), forceReturnToIdle: vi.fn() }
  const { result } = renderHook(() => useSpeech(controls))
  result.current.speak(reply('/api/speech/1'))
  result.current.stop()
  expect(created[0].pause).toHaveBeenCalled()
  expect(controls.forceReturnToIdle).toHaveBeenCalledTimes(1)
  // Its end no longer resets the character, and stopping twice does nothing.
  created[0].onended?.()
  result.current.stop()
  expect(controls.forceReturnToIdle).toHaveBeenCalledTimes(1)
})
