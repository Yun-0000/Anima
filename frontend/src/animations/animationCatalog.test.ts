import { ANIMATIONS } from './animationCatalog'

describe('animationCatalog', () => {
  test('lists the supported studio actions', () => {
    const keys = ANIMATIONS.map((entry) => entry.key)

    expect(keys).toEqual([
      'idle',
      'sadIdle',
      'talking',
      'wave',
      'nod',
      'shake',
    ])
  })

  test('uses the exact filenames users need to download from Mixamo', () => {
    expect(ANIMATIONS.map((entry) => entry.file)).toEqual([
      '/animations/idle.fbx',
      '/animations/Sad Idle.fbx',
      '/animations/Talking.fbx',
      '/animations/wave.fbx',
      '/animations/nod.fbx',
      '/animations/shake.fbx',
    ])
  })

})
