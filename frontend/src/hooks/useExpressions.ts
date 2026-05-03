import { useCallback } from 'react'
import { VRM } from '@pixiv/three-vrm'
import type { EmotionName, VisemeState } from '../types/expression'
import { ALL_EMOTIONS, ALL_VISEMES } from '../types/expression'

type BlinkName = 'blink' | 'blinkLeft' | 'blinkRight'

interface UseExpressionsReturn {
  setEmotion: (emotion: EmotionName, intensity?: number) => void
  setVisemes: (visemes: Partial<VisemeState>) => void
  blink: (durationMs?: number) => Promise<void>
  blinkLeft: (durationMs?: number) => Promise<void>
  blinkRight: (durationMs?: number) => Promise<void>
  wink: (durationMs?: number) => Promise<void>
  resetExpression: () => void
}

/**
 * Hook for controlling VRM facial expressions and lip-sync
 * Uses VRM's built-in BlendShape system
 */
export function useExpressions(vrm: VRM | null): UseExpressionsReturn {

  const setEmotion = useCallback((emotion: EmotionName, intensity: number = 0.8) => {
    const expressionManager = vrm?.expressionManager
    if (!expressionManager) return

    // Clamp intensity to valid range (0-1)
    const clampedIntensity = Math.max(0, Math.min(1, intensity))

    // Reset all emotions first
    ALL_EMOTIONS.forEach(e => {
      expressionManager.setValue(e, 0)
    })

    // Set target emotion
    expressionManager.setValue(emotion, clampedIntensity)
    console.log(`Expression: ${emotion} (${clampedIntensity})`)
  }, [vrm])

  const setVisemes = useCallback((visemes: Partial<VisemeState>) => {
    const expressionManager = vrm?.expressionManager
    if (!expressionManager) return

    // Update each provided viseme with clamped values
    Object.entries(visemes).forEach(([name, value]) => {
      // Clamp viseme value to valid range (0-1)
      const clampedValue = Math.max(0, Math.min(1, value))
      expressionManager.setValue(name, clampedValue)
    })
  }, [vrm])

  const triggerBlink = useCallback((name: BlinkName, durationMs: number = 120) => {
    const expressionManager = vrm?.expressionManager
    if (!expressionManager) return Promise.resolve()

    expressionManager.setValue(name, 1)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expressionManager.setValue(name, 0)
        resolve()
      }, durationMs)
    })
  }, [vrm])

  const blink = useCallback((durationMs?: number) => {
    return triggerBlink('blink', durationMs)
  }, [triggerBlink])

  const blinkLeft = useCallback((durationMs?: number) => {
    return triggerBlink('blinkLeft', durationMs)
  }, [triggerBlink])

  const blinkRight = useCallback((durationMs?: number) => {
    return triggerBlink('blinkRight', durationMs)
  }, [triggerBlink])

  const wink = useCallback(async (durationMs: number = 200) => {
    const expressionManager = vrm?.expressionManager
    if (!expressionManager) return

    // Randomly choose left or right eye
    const side = Math.random() < 0.5 ? 'blinkLeft' : 'blinkRight'

    // Set wink + slight relaxed smile
    expressionManager.setValue(side, 1)
    expressionManager.setValue('relaxed', 0.4)

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expressionManager.setValue(side, 0)
        // Keep smile a bit longer for natural feel
        setTimeout(() => {
          expressionManager.setValue('relaxed', 0)
          resolve()
        }, 100)
      }, durationMs)
    })
  }, [vrm])

  const resetExpression = useCallback(() => {
    const expressionManager = vrm?.expressionManager
    if (!expressionManager) return

    // Reset to neutral
    setEmotion('neutral', 0)

    // Reset all visemes
    ALL_VISEMES.forEach(name => {
      expressionManager.setValue(name, 0)
    })
  }, [vrm, setEmotion])

  return {
    setEmotion,
    setVisemes,
    blink,
    blinkLeft,
    blinkRight,
    wink,
    resetExpression,
  }
}
