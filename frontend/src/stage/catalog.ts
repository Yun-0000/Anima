/** Each motion has one or more versions; every time it plays, one is picked at random. */
export const motions = {
  idle: { files: ['idle_243', 'idle_249', 'idle_252'], loop: true },
  // The right hand waves with an open palm.
  wave: { files: ['wave_290'], loop: false, hands: { all: { left: 'relaxed', right: 'open' } } },
  // Palms up: "I don't know" or "maybe".
  shrug: { files: ['shrug_317'], loop: false, hands: { all: { left: 'open', right: 'open' } } },
  // Only while the character speaks.
  talk: { files: ['talk_314'], loop: true, hands: { all: { left: 'soft', right: 'soft' } } },
} as const
export type MotionName = keyof typeof motions
/** Head gestures are procedural: they play on top of whatever the body is doing. */
export const gestures = ['nod', 'shake'] as const
export type Gesture = (typeof gestures)[number]
/** While talking, the character stands and faces the user. */
export type Activity = 'idle' | 'listening' | 'speaking'
