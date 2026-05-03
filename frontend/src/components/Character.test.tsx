import { render } from '@testing-library/react'
import { Character } from './Character'

const setEmotion = vi.fn()
const blink = vi.fn()
const blinkLeft = vi.fn()
const blinkRight = vi.fn()
const startLipSync = vi.fn()
const stopLipSync = vi.fn()
let errorSpy: ReturnType<typeof vi.spyOn>

vi.mock('@react-three/fiber', () => ({
  useFrame: () => {},
}))

vi.mock('../hooks/useVRM', () => ({
  useVRM: () => ({
    vrm: {
      scene: {},
      update: vi.fn(),
    },
    isLoaded: true,
    error: null,
  }),
}))

vi.mock('../hooks/useExpressions', () => ({
  useExpressions: () => ({
    setEmotion,
    blink,
    blinkLeft,
    blinkRight,
    wink: vi.fn(),
  }),
}))

vi.mock('../hooks/useLipSync', () => ({
  useLipSync: () => ({
    startLipSync,
    stopLipSync,
  }),
}))

describe('Character', () => {
  beforeAll(() => {
    const originalError = console.error
    errorSpy = vi.spyOn(console, 'error').mockImplementation((message, ...rest) => {
      if (
        typeof message === 'string' &&
        message.includes('is unrecognized in this browser')
      ) {
        return
      }

      originalError(message, ...rest)
    })
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  test('exposes controls via onReady when loaded', () => {
    const onReady = vi.fn()

    render(<Character url="/models/character.vrm" onReady={onReady} />)

    expect(onReady).toHaveBeenCalledTimes(1)

    const controls = onReady.mock.calls[0][0]
    controls.setEmotion('happy')
    controls.startLipSync(new Audio())
    controls.stopLipSync()
    controls.setRootTransform([0, 0.12, 1.6], 0.5)
    expect(typeof controls.playAnimation).toBe('function')

    expect(setEmotion).toHaveBeenCalled()
    expect(startLipSync).toHaveBeenCalled()
    expect(stopLipSync).toHaveBeenCalled()
  })
})
