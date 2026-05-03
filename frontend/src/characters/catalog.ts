export interface CharacterOption {
  id: string
  label: string
  description: string
  modelUrl: string
  signature: string
  presence: string
}

export const CHARACTER_OPTIONS = [
  {
    id: 'jane',
    label: 'Jane',
    description: 'Original VRM',
    modelUrl: '/models/character.vrm',
    signature: 'Velvet nocturne, close-mic energy, faster emotional turns.',
    presence: 'For a more intimate room with sharper reactions and a cinematic edge.',
  },
  {
    id: 'hans',
    label: 'Hans',
    description: 'Male VRM',
    modelUrl: encodeURI('/models/Generic male character.vrm'),
    signature: 'Lower register, steadier pace, restrained stage presence.',
    presence: 'For a calmer room with grounded pacing and broader conversational space.',
  },
] as const satisfies readonly CharacterOption[]

export type CharacterId = (typeof CHARACTER_OPTIONS)[number]['id']

export const DEFAULT_CHARACTER_ID: CharacterId = CHARACTER_OPTIONS[0].id
