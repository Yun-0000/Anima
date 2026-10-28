import type { EmotionName } from '../types/expression'

/** The backend's address; empty when the dev server proxies /api. */
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function resolveApiAssetUrl(assetUrl: string) {
  return assetUrl.startsWith('/') ? `${apiBaseUrl}${assetUrl}` : assetUrl
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
  audio_url: string
  duration: number
}

export interface InteractionConfig {
  voice_enabled: boolean
}

async function requireOk(response: Response, label = 'API') {
  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`${label} error ${response.status}: ${errorBody || response.statusText}`)
  }
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function sendTextMessageToAPI(message: string, characterId: string, history: ChatTurn[] = []): Promise<ConversationResponse> {
  const requestUrl = buildCharacterUrl('/api/text-conversation', characterId)
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })

  await requireOk(response)

  return normalizeConversationResponse(await response.json())
}

export async function fetchInteractionConfig(): Promise<InteractionConfig> {
  const response = await fetch(`${apiBaseUrl}/api/interaction-config`)
  await requireOk(response)
  return response.json()
}

export type Speaker = 'character' | 'user'
export type Line = { speaker: Speaker; text: string }

export interface Direction {
  /** "explain" talks with the hands for the rest of the reply. */
  gesture: 'none' | 'explain' | DirectedGesture
  emotion: EmotionName
}
export type DirectedGesture = 'wave' | 'nod' | 'shake' | 'shrug'

/** `context` is the conversation before `lines`, oldest first. */
export async function directLines(characterId: string, speaker: Speaker, lines: string[], context: Line[]): Promise<Direction[]> {
  const response = await fetch(`${apiBaseUrl}/api/direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: characterId, speaker, lines, context }),
  })
  await requireOk(response, 'Director')
  return (await response.json()).directions
}
