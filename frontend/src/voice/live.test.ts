import { LiveClient, spoken } from './live'

// The SDK's session is replaced by one whose callbacks the test calls.
const sdk = vi.hoisted(() => ({ options: {} as Record<string, (...args: never[]) => void>, endSession: vi.fn(() => Promise.resolve()) }))
vi.mock('@elevenlabs/client', () => ({
  VoiceConversation: {
    startSession: vi.fn(async (options: Record<string, (...args: never[]) => void>) => {
      sdk.options = options
      return { endSession: sdk.endSession, getOutputVolume: () => 0.2 }
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

it('shows why a session could not start', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Set ELEVENLABS_API_KEY' }), { status: 403 })))
  const client = new LiveClient()
  await client.connect('kai')
  expect(client.snapshot).toMatchObject({ connected: false, status: 'Set ELEVENLABS_API_KEY' })
})
