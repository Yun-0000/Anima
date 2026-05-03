import type { AgentResponse } from '../types/agent'

type Handler = (response: AgentResponse) => void
type SpeechHandler = () => void

const handlers = new Set<Handler>()
const speechHandlers = new Set<SpeechHandler>()

export function subscribeAgentResponse(handler: Handler) {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function emitAgentResponse(response: AgentResponse) {
  handlers.forEach((handler) => handler(response))
}

export function subscribeSpeechDetected(handler: SpeechHandler) {
  speechHandlers.add(handler)
  return () => {
    speechHandlers.delete(handler)
  }
}

export function emitSpeechDetected() {
  speechHandlers.forEach((handler) => handler())
}
