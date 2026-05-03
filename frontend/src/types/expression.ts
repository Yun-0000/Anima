/**
 * VRM Expression System
 *
 * VRM models have built-in BlendShapes for facial expressions.
 * No additional assets or animations needed.
 */

export type EmotionName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'angry'
  | 'relaxed'
  | 'wink'

// Viseme names for lip-sync (VRM standard)
export type VisemeName = 'aa' | 'ih' | 'ou' | 'ee' | 'oh'

export interface VisemeState {
  aa: number // mouth open (0-1)
  ih: number // mouth wide (0-1)
  ou: number // mouth round (0-1)
  ee: number // mouth smile (0-1)
  oh: number // mouth O-shape (0-1)
}

export const ALL_EMOTIONS: readonly EmotionName[] = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'relaxed']
export const ALL_VISEMES: readonly VisemeName[] = ['aa', 'ih', 'ou', 'ee', 'oh']
