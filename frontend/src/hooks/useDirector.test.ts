import { act, renderHook } from '@testing-library/react'
import { sentences, useDirector } from './useDirector'

it('splits replies into sentences, Latin and Chinese', () => {
  expect(sentences('Hi! How are you? I am fine.')).toEqual(['Hi!', 'How are you?', 'I am fine.'])
  expect(sentences('你好！今天怎么样？')).toEqual(['你好！', '今天怎么样？'])
  expect(sentences('No end mark')).toEqual(['No end mark'])
})

it('directs a whole reply at once, knowing the conversation, and plays each sentence\'s direction as it is said', async () => {
  vi.useFakeTimers()
  const answers = [[{ gesture: 'none', emotion: 'neutral' }], [{ gesture: 'wave', emotion: 'happy' }, { gesture: 'explain', emotion: 'relaxed' }]]
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ directions: answers.shift() })))
  vi.stubGlobal('fetch', fetchMock)
  const controls = { setEmotion: vi.fn(), playAnimation: vi.fn(), explain: vi.fn() } as never
  const { result } = renderHook(() => useDirector(controls, 'mio'))
  await act(async () => { await result.current.direct('user', 'Hi Mio!') })
  await act(async () => { await result.current.directReply('Hello there! Let me tell you how tea is made.'); await vi.advanceTimersByTimeAsync(0) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const [, request] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
  expect(JSON.parse(String(request.body))).toMatchObject({
    speaker: 'character',
    lines: ['Hello there!', 'Let me tell you how tea is made.'],
    context: [{ speaker: 'user', text: 'Hi Mio!' }],
  })
  const c = controls as unknown as { setEmotion: ReturnType<typeof vi.fn>; playAnimation: ReturnType<typeof vi.fn>; explain: ReturnType<typeof vi.fn> }
  expect(c.playAnimation).toHaveBeenCalledExactlyOnceWith('wave')
  expect(c.explain).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(c.explain).toHaveBeenCalledOnce()
  expect(c.setEmotion.mock.calls.map(call => call[0])).toEqual(['neutral', 'happy', 'relaxed'])
  // The face relaxes back to neutral after a while.
  await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
  expect(c.setEmotion).toHaveBeenLastCalledWith('neutral')
  vi.useRealTimers(); vi.unstubAllGlobals()
})

it('does not repeat a gesture while it plays, nor crowd gestures together', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const { lines } = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ directions: [{ gesture: lines[0].startsWith('nod') ? 'nod' : 'wave', emotion: 'happy' }] }))
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
