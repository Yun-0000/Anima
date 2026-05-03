import { applyVrmFacing, DEFAULT_MODEL_Y_ROTATION } from './useVRM'

describe('applyVrmFacing', () => {
  test('sets default rotation', () => {
    const vrm = { scene: { rotation: { y: Math.PI } } } as any

    applyVrmFacing(vrm)

    expect(vrm.scene.rotation.y).toBe(DEFAULT_MODEL_Y_ROTATION)
  })

  test('sets custom rotation', () => {
    const vrm = { scene: { rotation: { y: 0 } } } as any

    applyVrmFacing(vrm, Math.PI)

    expect(vrm.scene.rotation.y).toBe(Math.PI)
  })
})
