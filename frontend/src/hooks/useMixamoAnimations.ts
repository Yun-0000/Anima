import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { loadMixamoAnimation } from '../animations/loadMixamoAnimation'
import { ANIMATIONS } from '../animations/animationCatalog'

const CROSSFADE_DURATION_SEC = 0.28
const PRELOAD_AFTER_IDLE_KEYS = ['talking']

export function useMixamoAnimations(vrm: VRM | null) {
  const shouldLog = import.meta.env.DEV && import.meta.env.MODE !== 'test'
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const currentActionRef = useRef<THREE.AnimationAction | null>(null)
  const currentKeyRef = useRef<string | null>(null)
  const returnToIdleRef = useRef(false)
  const clipCacheRef = useRef<Map<string, THREE.AnimationClip>>(new Map())
  const clipLoadPromiseCacheRef = useRef<Map<string, Promise<THREE.AnimationClip>>>(new Map())
  const primedAfterIdleRef = useRef(false)

  const update = useCallback((delta: number) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta)
    }
  }, [])

  const loadClip = useCallback(async (key: string) => {
    if (!vrm) {
      throw new Error('VRM is not available for animation loading')
    }

    const entry = ANIMATIONS.find((item) => item.key === key)
    if (!entry) {
      throw new Error(`Unknown animation key: ${key}`)
    }

    const cachedClip = clipCacheRef.current.get(entry.key)
    if (cachedClip) {
      return { entry, clip: cachedClip, source: 'cache' as const }
    }

    const pendingClip = clipLoadPromiseCacheRef.current.get(entry.key)
    if (pendingClip) {
      return { entry, clip: await pendingClip, source: 'pending' as const }
    }

    if (shouldLog) {
      console.debug('[Mixamo] loading animation file', { key: entry.key, file: entry.file })
    }

    const clipPromise = loadMixamoAnimation(entry.file, vrm, entry.key)
      .then((loadedClip) => {
        clipCacheRef.current.set(entry.key, loadedClip)
        clipLoadPromiseCacheRef.current.delete(entry.key)
        return loadedClip
      })
      .catch((error) => {
        clipLoadPromiseCacheRef.current.delete(entry.key)
        throw error
      })

    clipLoadPromiseCacheRef.current.set(entry.key, clipPromise)

    return { entry, clip: await clipPromise, source: 'fresh' as const }
  }, [shouldLog, vrm])

  const primeAfterIdle = useCallback(() => {
    if (!vrm || primedAfterIdleRef.current) return

    primedAfterIdleRef.current = true
    PRELOAD_AFTER_IDLE_KEYS.forEach((key) => {
      void loadClip(key).catch((error) => {
        primedAfterIdleRef.current = false
        if (shouldLog) {
          console.warn('[Mixamo] failed to preload animation', { key, error })
        }
      })
    })
  }, [loadClip, shouldLog, vrm])

  const playAnimation = useCallback(async (key: string) => {
    if (!vrm) return

    if (!mixerRef.current) {
      mixerRef.current = new THREE.AnimationMixer(vrm.scene)
      mixerRef.current.addEventListener('finished', () => {
        if (!returnToIdleRef.current) return
        if (currentKeyRef.current === 'idle') return
        returnToIdleRef.current = false
        if (shouldLog) {
          console.debug('[Mixamo] clip finished, returning to idle', {
            from: currentKeyRef.current,
          })
        }
        void playAnimation('idle')
      })
    }

    if (currentKeyRef.current === key && currentActionRef.current) {
      return
    }

    if (key === 'idle') {
      primeAfterIdle()
    }

    let loadedClip: Awaited<ReturnType<typeof loadClip>>
    try {
      loadedClip = await loadClip(key)
    } catch (error) {
      if (shouldLog) {
        console.warn('[Mixamo] failed to load animation; falling back to idle', { key, error })
      }
      if (key === 'idle' && vrm.scene.visible === false) {
        vrm.scene.visible = true
      }
      if (key !== 'idle') {
        await playAnimation('idle')
      }
      return
    }

    const { entry, clip } = loadedClip
    if (shouldLog) {
      console.debug('[Mixamo] playAnimation', {
        key: entry.key,
        file: entry.file,
        loop: entry.loop,
        cacheKeys: Array.from(clipCacheRef.current.keys()),
      })
    }

    const action = mixerRef.current.clipAction(clip)
    const isLooping = entry.loop
    const repeatCount = isLooping
      ? Infinity
      : (key === 'sadIdle' || key === 'nod' || key === 'shake' ? 2 : 1)
    action.setLoop(THREE.LoopRepeat, repeatCount)
    action.clampWhenFinished = !isLooping
    action.reset()

    const previousAction = currentActionRef.current
    currentActionRef.current = action
    currentKeyRef.current = key
    returnToIdleRef.current = !isLooping

    if (previousAction && previousAction !== action) {
      const crossfadeDurationSec = CROSSFADE_DURATION_SEC
      action.fadeIn(crossfadeDurationSec)
      previousAction.crossFadeTo(action, crossfadeDurationSec, false)
    }
    action.play()

    if (vrm.scene.visible === false) {
      vrm.scene.visible = true
    }
  }, [loadClip, primeAfterIdle, shouldLog, vrm])

  const getAnimationDuration = useCallback(async (key: string) => {
    try {
      const { clip } = await loadClip(key)
      return clip.duration
    } catch {
      return 0
    }
  }, [loadClip])

  const forceReturnToIdle = useCallback(() => {
    if (!vrm) return
    if (currentKeyRef.current === 'idle') return
    if (shouldLog) {
      console.debug('[Mixamo] forceReturnToIdle', { from: currentKeyRef.current })
    }
    returnToIdleRef.current = false
    void playAnimation('idle')
  }, [vrm, playAnimation, shouldLog])

  return {
    update,
    playAnimation,
    getAnimationDuration,
    forceReturnToIdle,
  }
}
