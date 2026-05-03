import { describe, expect, test, vi } from 'vitest'
import { emitAgentResponse, emitSpeechDetected, subscribeAgentResponse, subscribeSpeechDetected } from './agentEvents'
import type { AgentResponse } from '../types/agent'

describe('agentEvents', () => {
  test('notifies subscribers with response payload', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAgentResponse(handler)

    const payload: AgentResponse = {
      text: 'hello',
      emotion: 'happy',
      action: 'wave',
    }

    emitAgentResponse(payload)
    expect(handler).toHaveBeenCalledWith(payload)

    unsubscribe()
  })

  test('notifies speech subscribers when speech is detected', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeSpeechDetected(handler)

    emitSpeechDetected()
    expect(handler).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})
