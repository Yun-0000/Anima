import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useVRM } from '../hooks/useVRM'
import { useExpressions } from '../hooks/useExpressions'
import { useLipSync } from '../hooks/useLipSync'
import { useMixamoAnimations } from '../hooks/useMixamoAnimations'
import type { EmotionName } from '../types/expression'

export interface CharacterControls {
  setEmotion: (emotion: EmotionName, intensity?: number) => void
  blink: (durationMs?: number) => Promise<void>
  blinkLeft: (durationMs?: number) => Promise<void>
  blinkRight: (durationMs?: number) => Promise<void>
  wink: (durationMs?: number) => Promise<void>
  startLipSync: (audioElement: HTMLAudioElement) => void
  stopLipSync: () => void
  playAnimation: (key: string) => Promise<void>
  getAnimationDuration: (key: string) => Promise<number>
  forceReturnToIdle: () => void
  setRootTransform: (position?: [number, number, number], rotationY?: number) => void
}

interface CharacterProps {
  url: string
  position?: [number, number, number]
  rotationY?: number
  onReady?: (controls: CharacterControls) => void
}

// Auto-blink configuration
const BLINK_MIN_INTERVAL_MS = 3000
const BLINK_MAX_INTERVAL_MS = 10000
const DOUBLE_BLINK_PROBABILITY = 0.07 // 7% chance

const getNextBlinkTime = () => {
  return Date.now() + BLINK_MIN_INTERVAL_MS + Math.random() * (BLINK_MAX_INTERVAL_MS - BLINK_MIN_INTERVAL_MS)
}

export function Character({ url, position = [0, 0, 0], rotationY = 0, onReady }: CharacterProps) {
  const { vrm, isLoaded, error } = useVRM(url)
  const groupRef = useRef<THREE.Group>(null)
  const controlsExposedRef = useRef(false)
  const rootPositionRef = useRef(new THREE.Vector3(...position))
  const rootRotationYRef = useRef(rotationY)
  const { setEmotion, blink, blinkLeft, blinkRight, wink } = useExpressions(vrm)
  const { startLipSync, stopLipSync } = useLipSync(vrm)
  const { update, playAnimation, getAnimationDuration, forceReturnToIdle } = useMixamoAnimations(vrm)

  // Auto-blink state
  const nextBlinkTimeRef = useRef(getNextBlinkTime())
  const isBlinkingRef = useRef(false)

  // Update VRM each frame (required for expressions, look-at, etc.)
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.copy(rootPositionRef.current)
      groupRef.current.rotation.y = rootRotationYRef.current
    }

    if (vrm) {
      vrm.update(delta)
    }
    update(delta)

    // Auto-blink system
    if (vrm && !isBlinkingRef.current && Date.now() >= nextBlinkTimeRef.current) {
      isBlinkingRef.current = true
      const isDoubleBlink = Math.random() < DOUBLE_BLINK_PROBABILITY

      const doBlink = async () => {
        await blink(120)
        if (isDoubleBlink) {
          await new Promise(r => setTimeout(r, 80))
          await blink(120)
        }
        isBlinkingRef.current = false
        nextBlinkTimeRef.current = getNextBlinkTime()
      }
      void doBlink()
    }
  })

  useEffect(() => {
    if (!isLoaded || !vrm || !onReady || controlsExposedRef.current) return

    controlsExposedRef.current = true
    onReady({
      setEmotion,
      blink,
      blinkLeft,
      blinkRight,
      wink,
      startLipSync,
      stopLipSync,
      playAnimation,
      getAnimationDuration,
      forceReturnToIdle,
      setRootTransform: (nextPosition, nextRotationY) => {
        if (nextPosition) {
          rootPositionRef.current.set(...nextPosition)
        }
        if (typeof nextRotationY === 'number') {
          rootRotationYRef.current = nextRotationY
        }
      },
    })
  }, [
    blink,
    blinkLeft,
    blinkRight,
    forceReturnToIdle,
    getAnimationDuration,
    isLoaded,
    onReady,
    playAnimation,
    setEmotion,
    startLipSync,
    stopLipSync,
    vrm,
    wink,
  ])

  if (error) {
    console.error('Character load error:', error)
    return null
  }

  if (!isLoaded || !vrm) {
    return null
  }

  return (
    <group ref={groupRef} position={position}>
      <primitive object={vrm.scene} />
    </group>
  )
}
