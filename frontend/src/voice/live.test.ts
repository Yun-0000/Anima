import { LiveClient, spoken } from './live'

// The SDK's session is replaced by one whose callbacks the test calls.
const sdk = vi.hoisted(() => ({ options: {} as Record<string, (...args: never[]) => void>, endSession: vi.fn(() => Promise.resolve()), sendContextualUpdate: vi.fn(), setMicMuted: vi.fn(), volume: 0.2 }))
vi.mock('@elevenlabs/client', () => ({
  VoiceConversation: {
    startSession: vi.fn(async (options: Record<string, (...args: never[]) => void>) => {
      sdk.options = options
      return { endSession: sdk.endSession, getOutputVolume: () => sdk.volume, sendContextualUpdate: sdk.sendContextualUpdate, setMicMuted: sdk.setMicMuted }
    }),
  },
}))

async function connected() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ conversation_token: 't', overrides: {} }))))
  const client = new LiveClient()
  await client.connect('kai')
  sdk.options.onConnect({ conversationId: 'c' } as never)
  return client
}

afterEach(() => vi.unstubAllGlobals())

it('drops delivery tags from what the character says', () => {
  expect(spoken('[happy] Hey there! [slow] Take your time.')).toBe('Hey there! Take your time.')
  expect(spoken('[laughs]')).toBe('')
})

it('shows the reply as the subtitle and reports both sides of the conversation', async () => {
  const client = await connected()
  const lines: string[] = []
  client.onLine = (speaker, line) => lines.push(`${speaker}: ${line}`)
  sdk.options.onMessage({ role: 'agent', message: '[relaxed] Hey. Slow day here.' } as never)
  expect(client.snapshot).toMatchObject({ connected: true, answer: 'Hey. Slow day here.' })
  // The user speaking starts a new exchange on screen.
  sdk.options.onMessage({ role: 'user', message: 'Same here.' } as never)
  expect(client.snapshot.answer).toBe('')
  expect(lines).toEqual(['character: Hey. Slow day here.', 'user: Same here.'])
  await client.close()
})

it('tells a new session what was said before, unless only the greeting was', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ conversation_token: 't', overrides: {} }))))
  const greeting = { role: 'assistant' as const, content: 'Hi.' }
  const quiet = new LiveClient()
  await quiet.connect('mio', [greeting])
  expect(sdk.sendContextualUpdate).not.toHaveBeenCalled()
  await quiet.close()
  const client = new LiveClient()
  await client.connect('mio', [greeting, { role: 'user', content: 'My cat is Momo.' }])
  expect(sdk.sendContextualUpdate).toHaveBeenCalledExactlyOnceWith('Earlier in this conversation:\nYou: Hi.\nUser: My cat is Momo.')
  await client.close()
})

it('listens while the user talks and speaks while the agent talks', async () => {
  const client = await connected()
  const activity = vi.fn(); client.onActivity = activity
  sdk.options.onVadScore({ vadScore: 0.9 } as never)
  expect(activity).toHaveBeenLastCalledWith('listening')
  sdk.options.onVadScore({ vadScore: 0.1 } as never)
  sdk.options.onModeChange({ mode: 'speaking' } as never)
  expect(activity).toHaveBeenLastCalledWith('speaking')
  await client.close()
})

it('closing ends the session, resets the character and reports the reason', async () => {
  const client = await connected()
  const activity = vi.fn(), audio = vi.fn()
  client.onActivity = activity; client.onAudio = audio
  await client.close('Voice ended')
  expect(sdk.endSession).toHaveBeenCalled()
  expect(activity).toHaveBeenLastCalledWith('idle')
  expect(audio).toHaveBeenLastCalledWith(0)
  expect(client.snapshot).toMatchObject({ connected: false, connecting: false, status: 'Voice ended' })
})

it('the microphone button only mutes and unmutes; the session and the character go on', async () => {
  const client = await connected()
  sdk.endSession.mockClear(); sdk.setMicMuted.mockClear()
  sdk.options.onModeChange({ mode: 'speaking' } as never)
  client.setMuted(true)
  expect(sdk.setMicMuted).toHaveBeenLastCalledWith(true)
  expect(client.snapshot).toMatchObject({ connected: true, muted: true })
  client.setMuted(false)
  expect(sdk.setMicMuted).toHaveBeenLastCalledWith(false)
  expect(client.snapshot).toMatchObject({ connected: true, muted: false })
  expect(sdk.endSession).not.toHaveBeenCalled()
  await client.close()
  expect(client.snapshot.muted).toBe(false)
})

it('leaving voice mode lets the character finish what it is saying, however the SDK reports its mode', async () => {
  vi.useFakeTimers()
  sdk.volume = 0.2
  const client = await connected()
  await vi.advanceTimersByTimeAsync(100)
  sdk.endSession.mockClear(); sdk.setMicMuted.mockClear()
  // LiveKit's active speaker can say "listening" while the character's voice still plays.
  sdk.options.onModeChange({ mode: 'listening' } as never)
  await client.finish()
  expect(sdk.setMicMuted).toHaveBeenCalledWith(true)
  await vi.advanceTimersByTimeAsync(3000)
  expect(sdk.endSession).not.toHaveBeenCalled()
  // Silence after the last sound ends it.
  sdk.volume = 0
  await vi.advanceTimersByTimeAsync(1500)
  expect(sdk.endSession).toHaveBeenCalledTimes(1)
  expect(client.snapshot.connected).toBe(false)
  vi.useRealTimers(); sdk.volume = 0.2
})

it('leaving voice mode while the character is quiet ends the session at once', async () => {
  vi.useFakeTimers()
  sdk.volume = 0
  const client = await connected()
  await vi.advanceTimersByTimeAsync(1500)
  sdk.endSession.mockClear()
  await client.finish()
  expect(sdk.endSession).toHaveBeenCalledTimes(1)
  vi.useRealTimers(); sdk.volume = 0.2
})

it('while finishing, the microphone stays off; turning it back on keeps the session', async () => {
  vi.useFakeTimers()
  sdk.volume = 0.2
  const client = await connected()
  await vi.advanceTimersByTimeAsync(100)
  await client.finish()
  expect(client.snapshot.muted).toBe(true)
  sdk.endSession.mockClear()
  client.setMuted(false)
  expect(sdk.setMicMuted).toHaveBeenLastCalledWith(false)
  sdk.volume = 0
  await vi.advanceTimersByTimeAsync(3000)
  expect(sdk.endSession).not.toHaveBeenCalled()
  expect(client.snapshot.connected).toBe(true)
  await client.close()
  vi.useRealTimers(); sdk.volume = 0.2
})

it('shows why a session could not start', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Set ELEVENLABS_API_KEY' }), { status: 403 })))
  const client = new LiveClient()
  await client.connect('kai')
  expect(client.snapshot).toMatchObject({ connected: false, status: 'Set ELEVENLABS_API_KEY' })
})
