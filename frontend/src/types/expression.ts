/** Facial expressions built into every VRM model. */
export type EmotionName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'angry'
  | 'relaxed'
  | 'wink'

export const ALL_EMOTIONS: readonly EmotionName[] = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'relaxed']
