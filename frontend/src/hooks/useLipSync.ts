import { useEffect, useRef, useCallback } from 'react'
import { VRM } from '@pixiv/three-vrm'

interface UseLipSyncReturn {
  startLipSync: (audioElement: HTMLAudioElement) => void
  stopLipSync: () => void
}

/**
 * Lip-sync by analyzing audio volume and mapping to mouth visemes
 * Uses Web Audio API to get real-time audio data
 */
export function useLipSync(vrm: VRM | null): UseLipSyncReturn {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const startLipSync = useCallback((audioElement: HTMLAudioElement) => {
    if (!vrm?.expressionManager) return

    // Create Web Audio context and analyzer
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }

    const audioContext = audioContextRef.current
    const analyzer = audioContext.createAnalyser()
    analyzer.fftSize = 256

    const source = audioContext.createMediaElementSource(audioElement)
    source.connect(analyzer)
    analyzer.connect(audioContext.destination)

    analyzerRef.current = analyzer

    // Buffer for frequency data
    const dataArray = new Uint8Array(analyzer.frequencyBinCount)

    // Animation loop
    const updateMouth = () => {
      if (!analyzerRef.current || !vrm?.expressionManager) return

      analyzerRef.current.getByteFrequencyData(dataArray)

      // Calculate average volume (0-255)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length

      // Normalize to 0-1 and apply curve
      const volume = Math.min((average / 128) * 1.5, 1.0)

      // Map volume to visemes (simple approach)
      // aa = mouth openness (main driver)
      // oh = rounded mouth (adds variety)
      vrm.expressionManager.setValue('aa', volume * 0.7)
      vrm.expressionManager.setValue('oh', volume * 0.3)

      animationFrameRef.current = requestAnimationFrame(updateMouth)
    }

    updateMouth()
    console.log('Lip-sync started')
  }, [vrm])

  const stopLipSync = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Reset mouth to closed
    if (vrm?.expressionManager) {
      vrm.expressionManager.setValue('aa', 0)
      vrm.expressionManager.setValue('oh', 0)
    }

    console.log('Lip-sync stopped')
  }, [vrm])

  return {
    startLipSync,
    stopLipSync,
  }
}
