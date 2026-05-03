export interface AnimationEntry {
  key: string
  label: string
  file: string
  loop: boolean
  controllerDurationSec?: number
}

export const ANIMATIONS: AnimationEntry[] = [
  { key: 'idle', label: 'Idle', file: '/animations/idle.fbx', loop: true },
  { key: 'sadIdle', label: 'Sad Idle', file: '/animations/Sad Idle.fbx', loop: false },
  { key: 'talking', label: 'Talking', file: '/animations/Talking.fbx', loop: false },
  { key: 'wave', label: 'Wave', file: '/animations/wave.fbx', loop: false },
  { key: 'nod', label: 'Nod', file: '/animations/nod.fbx', loop: false },
  { key: 'shake', label: 'Shake', file: '/animations/shake.fbx', loop: false },
]

export function getAnimationEntry(key: string) {
  return ANIMATIONS.find((entry) => entry.key === key)
}
