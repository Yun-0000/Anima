import {
  createOpenAIRealtimeCall,
  fetchInteractionConfig,
  requestMotionPlan,
  resolveApiAssetUrl,
  sendTextMessageToAPI,
} from './client'

describe('resolveApiAssetUrl', () => {
  test('prefixes backend asset paths when an API base URL is configured', () => {
    expect(resolveApiAssetUrl('/assets/test.mp3', 'http://localhost:8001')).toBe('http://localhost:8001/assets/test.mp3')
  })

  test('leaves empty and absolute audio URLs unchanged', () => {
    expect(resolveApiAssetUrl('', 'http://localhost:8001')).toBe('')
    expect(resolveApiAssetUrl('https://cdn.example/audio.mp3', 'http://localhost:8001')).toBe('https://cdn.example/audio.mp3')
    expect(resolveApiAssetUrl('data:audio/mpeg;base64,bXAz', 'http://localhost:8001')).toBe('data:audio/mpeg;base64,bXAz')
  })
})

describe('sendTextMessageToAPI', () => {
  test('posts a typed message to the text conversation endpoint', async () => {
    const mockResponse = {
      text: 'Jane heard: hello',
      user_text: 'hello',
      emotion: 'happy',
      action: 'wave',
      audio_url: '',
      duration: 0,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await sendTextMessageToAPI('hello', 'jane')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/text-conversation?character_id=jane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })
    expect(result).toEqual(mockResponse)
  })
})

describe('fetchInteractionConfig', () => {
  test('loads text and voice availability', async () => {
    const mockResponse = {
      text_mode: { enabled: true },
      voice_mode: {
        enabled: false,
        provider: null,
        providers: {
          openai: { configured: false },
        },
        reason: 'Set OPENAI_API_KEY to enable voice mode.',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchInteractionConfig()

    expect(fetchMock).toHaveBeenCalledWith('/api/interaction-config')
    expect(result).toEqual(mockResponse)
  })
})

describe('createOpenAIRealtimeCall', () => {
  test('posts an SDP offer and returns an SDP answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('answer-sdp'),
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await createOpenAIRealtimeCall('offer-sdp', 'hans')

    expect(fetchMock).toHaveBeenCalledWith('/api/realtime/openai/call?character_id=hans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: 'offer-sdp',
    })
    expect(result).toBe('answer-sdp')
  })
})

describe('requestMotionPlan', () => {
  test('posts transcripts to the motion planning endpoint', async () => {
    const mockResponse = {
      emotion: 'happy',
      action: 'wave',
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await requestMotionPlan(
      {
        user_text: 'hello',
        assistant_text: 'Hi, nice to meet you.',
      },
      'jane'
    )

    expect(fetchMock).toHaveBeenCalledWith('/api/motion-plan?character_id=jane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_text: 'hello',
        assistant_text: 'Hi, nice to meet you.',
      }),
    })
    expect(result).toEqual(mockResponse)
  })
})
