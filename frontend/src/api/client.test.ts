import { fetchInteractionConfig, resolveApiAssetUrl, sendTextMessageToAPI } from './client'

afterEach(() => vi.unstubAllGlobals())

it('leaves URLs that are not backend paths unchanged', () => {
  expect(resolveApiAssetUrl('')).toBe('')
  expect(resolveApiAssetUrl('https://cdn.example/audio.mp3')).toBe('https://cdn.example/audio.mp3')
  // Without VITE_API_BASE_URL the dev server proxies /api, so backend paths stay relative.
  expect(resolveApiAssetUrl('/api/speech/1')).toBe('/api/speech/1')
})

it('posts a typed message and the conversation so far', async () => {
  const reply = { text: 'Mio heard: hello', audio_url: '/api/speech/1', duration: 1 }
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply)))
  vi.stubGlobal('fetch', fetchMock)
  const history = [{ role: 'assistant' as const, content: 'Hi!' }]

  expect(await sendTextMessageToAPI('hello', 'mio', history)).toEqual(reply)
  expect(fetchMock).toHaveBeenCalledWith('/api/text-conversation?character_id=mio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello', history }),
  })
})

it('loads whether voice is available', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ voice_enabled: false }))))
  expect(await fetchInteractionConfig()).toEqual({ voice_enabled: false })
})
