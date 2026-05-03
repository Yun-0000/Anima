export type ActionName =
  | 'idle'
  | 'sadIdle'
  | 'talking'
  | 'wave'
  | 'nod'
  | 'shake'
export type EmotionName = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'relaxed' | 'wink'

export interface AgentResponse {
  text: string
  userText?: string
  emotion: EmotionName
  action: ActionName
}
