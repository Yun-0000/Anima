/** A random version plays each time. */
export const motions = {
  idle: { files: ['idle_243', 'idle_249', 'idle_252'], loop: true },
  wave: { files: ['wave_290'], loop: false, hands: { all: { left: 'relaxed', right: 'open' } } },
  shrug: { files: ['shrug_317'], loop: false, hands: { all: { left: 'open', right: 'open' } } },
  explain: { files: ['explain_314'], loop: false, hands: { all: { left: 'soft', right: 'soft' } } },
} as const
export type MotionName = keyof typeof motions
/** Procedural, on top of whatever the body is doing. */
export const gestures = ['nod', 'shake'] as const
export type Gesture = (typeof gestures)[number]
export type Activity = 'idle' | 'listening' | 'speaking'
