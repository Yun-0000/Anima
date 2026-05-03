import { useState, useEffect } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'

export const DEFAULT_MODEL_Y_ROTATION = 0

export function applyVrmFacing(vrmModel: VRM, rotationY = DEFAULT_MODEL_Y_ROTATION) {
  vrmModel.scene.rotation.y = rotationY
}

export function useVRM(url: string) {
  const [vrm, setVRM] = useState<VRM | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    loader.load(
      url,
      (gltf) => {
        const vrmModel = gltf.userData.vrm as VRM
        if (vrmModel) {
          // Flip model to face camera if needed (default is no rotation)
          applyVrmFacing(vrmModel)
          // Hide until idle animation is loaded to prevent T-pose flash
          vrmModel.scene.visible = false
          setVRM(vrmModel)
          setIsLoaded(true)
          console.log('VRM loaded successfully:', vrmModel)
        } else {
          setError('Failed to parse VRM from GLTF')
        }
      },
      (progress) => {
        console.log('Loading VRM:', (progress.loaded / progress.total) * 100, '%')
      },
      (err) => {
        console.error('Error loading VRM:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    )

    return () => {
      if (vrm) {
        vrm.scene.traverse((obj) => {
          if ('dispose' in obj && typeof obj.dispose === 'function') {
            obj.dispose()
          }
        })
      }
    }
  }, [url])

  return { vrm, isLoaded, error }
}
