const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const apiBaseUrl = API_BASE_URL.replace(/\/$/, '')

export function resolveApiAssetUrl(assetUrl: string, baseUrl = apiBaseUrl) {
  if (!assetUrl || !baseUrl || !assetUrl.startsWith('/')) {
    return assetUrl
  }

  return `${baseUrl}${assetUrl}`
}

function normalizeConversationResponse(response: ConversationResponse): ConversationResponse {
  return {
    ...response,
    audio_url: resolveApiAssetUrl(response.audio_url),
  }
}

function buildCharacterUrl(path: string, characterId: string) {
  const params = new URLSearchParams({ character_id: characterId })
  return `${apiBaseUrl}${path}?${params.toString()}`
}

export interface ConversationResponse {
  text: string
  user_text?: string
  emotion: 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'relaxed' | 'wink'
  action: 'idle' | 'sadIdle' | 'talking' | 'wave' | 'nod' | 'shake'
  audio_url: string
  duration: number
}

export interface InteractionConfig {
  text_mode: {
    enabled: boolean
  }
  voice_mode: {
    enabled: boolean
    provider: 'openai' | null
    providers: {
      openai: { configured: boolean }
    }
    reason: string | null
  }
}

export interface MotionPlanRequest {
  user_text: string
  assistant_text: string
}

export interface MotionPlanResponse {
  emotion: ConversationResponse['emotion']
  action: ConversationResponse['action']
}

async function requireOk(response: Response, label = 'API') {
  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`${label} error ${response.status}: ${errorBody || response.statusText}`)
  }
}

export async function sendTextMessageToAPI(message: string, characterId: string): Promise<ConversationResponse> {
  const requestUrl = buildCharacterUrl('/api/text-conversation', characterId)
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  await requireOk(response)

  return normalizeConversationResponse(await response.json())
}

export async function fetchInteractionConfig(): Promise<InteractionConfig> {
  const response = await fetch(`${apiBaseUrl}/api/interaction-config`)
  await requireOk(response)
  return response.json()
}

export async function createOpenAIRealtimeCall(offerSdp: string, characterId: string): Promise<string> {
  const requestUrl = buildCharacterUrl('/api/realtime/openai/call', characterId)
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offerSdp,
  })

  await requireOk(response, 'Realtime')

  return response.text()
}

export async function requestMotionPlan(
  payload: MotionPlanRequest,
  characterId: string
): Promise<MotionPlanResponse> {
  const requestUrl = buildCharacterUrl('/api/motion-plan', characterId)
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  await requireOk(response, 'Motion')

  return response.json()
}
