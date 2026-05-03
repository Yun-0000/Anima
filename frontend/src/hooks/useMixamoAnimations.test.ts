import { renderHook, act } from '@testing-library/react'
import { useMixamoAnimations } from './useMixamoAnimations'
import { loadMixamoAnimation } from '../animations/loadMixamoAnimation'

const mixerMocks = vi.hoisted(() => {
  const createAction = () => ({
    setLoop: vi.fn(),
    reset: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    fadeIn: vi.fn(),
    crossFadeTo: vi.fn(),
    clampWhenFinished: false,
  })

  const actionRef = { current: createAction() }
  const actionQueueRef = { current: [] as ReturnType<typeof createAction>[] }

  class AnimationMixerMock {
    clipAction = vi.fn(() => actionQueueRef.current.shift() ?? actionRef.current)
    addEventListener = vi.fn()
    update = vi.fn()
  }

  return { createAction, actionRef, actionQueueRef, AnimationMixerMock }
})

vi.mock('three', () => ({
  AnimationMixer: mixerMocks.AnimationMixerMock,
  LoopRepeat: 'LoopRepeat',
}))

vi.mock('../animations/loadMixamoAnimation', () => ({
  loadMixamoAnimation: vi.fn(async () => ({})),
}))

describe('useMixamoAnimations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mixerMocks.actionRef.current = mixerMocks.createAction()
    mixerMocks.actionQueueRef.current = []
    ;(window as Window & { __mixamoDebug?: unknown }).__mixamoDebug = undefined
    vi.mocked(loadMixamoAnimation).mockImplementation(async () => ({
      duration: 1,
      userData: {},
    }) as any)
  })

  test('replaying same action does not stop it', async () => {
    const vrm = { scene: {} } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('wave')
    })

    await act(async () => {
      await result.current.playAnimation('wave')
    })

    expect(mixerMocks.actionRef.current.stop).not.toHaveBeenCalled()
  })

  test('first idle request still loads and reveals the avatar', async () => {
    const vrm = { scene: { visible: false } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('idle')
    })

    expect(loadMixamoAnimation).toHaveBeenCalledWith('/animations/idle.fbx', vrm, 'idle')
    expect(vrm.scene.visible).toBe(true)
    expect(mixerMocks.actionRef.current.play).toHaveBeenCalled()
  })

  test('first idle request also primes talking so the default text action feels immediate', async () => {
    const vrm = { scene: { visible: false } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('idle')
      await Promise.resolve()
    })

    expect(loadMixamoAnimation).toHaveBeenCalledWith('/animations/Talking.fbx', vrm, 'talking')
  })

  test('talking plays once before returning to idle', async () => {
    const vrm = { scene: {} } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('talking')
    })

    expect(mixerMocks.actionRef.current.setLoop).toHaveBeenCalledWith('LoopRepeat', 1)
  })

  test('sad idle repeats twice before returning to idle', async () => {
    const vrm = { scene: {} } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('sadIdle')
    })

    expect(mixerMocks.actionRef.current.setLoop).toHaveBeenCalledWith('LoopRepeat', 2)
  })

  test('crossfades from one supported action into the next', async () => {
    const firstAction = mixerMocks.createAction()
    const secondAction = mixerMocks.createAction()
    mixerMocks.actionQueueRef.current = [firstAction, secondAction]
    const vrm = { scene: { visible: true } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('wave')
    })

    await act(async () => {
      await result.current.playAnimation('talking')
    })

    expect(firstAction.crossFadeTo).toHaveBeenCalledWith(secondAction, expect.any(Number), false)
    expect(secondAction.fadeIn).toHaveBeenCalled()
    expect(firstAction.stop).not.toHaveBeenCalled()
  })

  test('passes the supported animation key to the loader', async () => {
    const vrm = { scene: { visible: true } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await result.current.playAnimation('shake')
    })

    expect(loadMixamoAnimation).toHaveBeenCalledWith('/animations/shake.fbx', vrm, 'shake')
  })

  test('missing optional animation falls back without throwing', async () => {
    vi.mocked(loadMixamoAnimation).mockRejectedValueOnce(new Error('missing asset'))
    const vrm = { scene: { visible: true } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await expect(result.current.playAnimation('wave')).resolves.toBeUndefined()
    })
  })

  test('missing idle animation still reveals the static avatar', async () => {
    vi.mocked(loadMixamoAnimation).mockRejectedValue(new Error('missing asset'))
    const vrm = { scene: { visible: false } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await expect(result.current.playAnimation('idle')).resolves.toBeUndefined()
    })

    expect(vrm.scene.visible).toBe(true)
  })

  test('missing animation duration resolves to zero', async () => {
    vi.mocked(loadMixamoAnimation).mockRejectedValueOnce(new Error('missing asset'))
    const vrm = { scene: { visible: true } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await expect(result.current.getAnimationDuration('wave')).resolves.toBe(0)
  })

  test('does not accept removed locomotion and scene actions', async () => {
    const vrm = { scene: { visible: true } } as any
    const { result } = renderHook(() => useMixamoAnimations(vrm))

    await act(async () => {
      await expect(result.current.playAnimation('walking')).resolves.toBeUndefined()
    })

    expect(loadMixamoAnimation).toHaveBeenCalledWith('/animations/idle.fbx', vrm, 'idle')
  })
})
