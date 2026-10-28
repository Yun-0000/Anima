export interface CharacterOption {
  id: string
  label: string
  tagline: string
  greeting: string
  modelUrl: string
  preview: string
  /** Background tint on the characters page. */
  tint: string
  /** Weights for what the character does when left alone. */
  preferences: Partial<Record<string, number>>
}

export const CHARACTER_OPTIONS = [
  {
    id: 'mio',
    label: 'Mio',
    tagline: 'Gentle, thoughtful, a little shy',
    greeting: "Hi... it's nice to have company. What are you thinking about?",
    modelUrl: '/models/sample_a.vrm',
    preview: '/characters/mio.png',
    tint: '#ece3da',
    preferences: { idle: 5, doze: 0.5 },
  },
  {
    id: 'rin',
    label: 'Rin',
    tagline: 'Cool, playful, a little mischievous',
    greeting: "Oh, look who showed up. Took you long enough. So, what's new?",
    modelUrl: '/models/sample_b.vrm',
    preview: '/characters/rin.png',
    tint: '#e7e1ef',
    preferences: { idle: 6, doze: 0.2 },
  },
  {
    id: 'kai',
    label: 'Kai',
    tagline: 'Calm, easygoing, fond of naps',
    greeting: 'Mm, hey. Make yourself comfortable. No rush.',
    modelUrl: '/models/sample_c.vrm',
    preview: '/characters/kai.png',
    tint: '#dfe3e6',
    preferences: { idle: 3, doze: 2 },
  },
] as const satisfies readonly CharacterOption[]

export function findCharacter(id: string | undefined): CharacterOption {
  return CHARACTER_OPTIONS.find((character) => character.id === id) ?? CHARACTER_OPTIONS[0]
}
