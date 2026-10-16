import { act, renderHook } from '@testing-library/react'
import { sentences, useDirector } from './useDirector'

it('splits replies into sentences, Latin and Chinese', () => {
  expect(sentences('Hi! How are you? I am fine.')).toEqual(['Hi!', 'How are you?', 'I am fine.'])
  expect(sentences('你好！今天怎么样？')).toEqual(['你好！', '今天怎么样？'])
  expect(sentences('No end mark')).toEqual(['No end mark'])
})

it('plays the directed gesture and expression, skipping "none", and spreads a reply over time', async () => {
  vi.useFakeTimers()
  const answers = [{ gesture: 'wave', emotion: 'happy' }, { gesture: 'none', emotion: 'relaxed' }]
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(answers.shift())))
  vi.stubGlobal('fetch', fetchMock)
  const controls = { setEmotion: vi.fn(), playAnimation: vi.fn() } as never
  const { result } = renderHook(() => useDirector(controls, 'mio'))
  act(() => result.current.directReply('Hello there! The weather is nice today.'))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const [, request] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
  const second = JSON.parse(String(request.body))
  expect(second).toMatchObject({ speaker: 'character', line: 'The weather is nice today.', previous: 'Hello there!' })
  const c = controls as unknown as { setEmotion: ReturnType<typeof vi.fn>; playAnimation: ReturnType<typeof vi.fn> }
  expect(c.playAnimation).toHaveBeenCalledExactlyOnceWith('wave')
  expect(c.setEmotion.mock.calls.map(call => call[0])).toEqual(['happy', 'relaxed'])
  // The face relaxes back to neutral after a while.
  await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
  expect(c.setEmotion).toHaveBeenLastCalledWith('neutral')
  vi.useRealTimers(); vi.unstubAllGlobals()
})

it('does not repeat a gesture while it plays, nor crowd gestures together', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const { line } = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ gesture: line.startsWith('nod') ? 'nod' : 'wave', emotion: 'happy' }))
  }))
  const controls = { setEmotion: vi.fn(), playAnimation: vi.fn() }
  const { result } = renderHook(() => useDirector(controls as never, 'mio'))
  await act(async () => { await result.current.direct('user', 'hi'); await result.current.direct('character', 'hello!'); await result.current.direct('character', 'nod please') })
  expect(controls.playAnimation.mock.calls.map(call => call[0])).toEqual(['wave'])
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); await result.current.direct('character', 'nod now') })
  expect(controls.playAnimation.mock.calls.map(call => call[0])).toEqual(['wave', 'nod'])
  // Nodding again once the first nod has finished is natural.
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); await result.current.direct('character', 'nod again') })
  expect(controls.playAnimation.mock.calls.map(call => call[0])).toEqual(['wave', 'nod', 'nod'])
  vi.useRealTimers(); vi.unstubAllGlobals()
})
