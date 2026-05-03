import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import type { VRM } from '@pixiv/three-vrm'
import { mixamoVRMRigMap } from './mixamoVRMRigMap'

type HumanoidBoneName = Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]

function normalizeMixamoRigName(name: string) {
  if (!name) return name
  if (name.startsWith('mixamorig10')) {
    return `mixamorig${name.slice('mixamorig10'.length)}`
  }
  return name
}

function mixamoNameMatches(targetName: string, candidateName: string) {
  if (!targetName || !candidateName) return false
  if (candidateName === targetName) return true
  return normalizeMixamoRigName(candidateName) === normalizeMixamoRigName(targetName)
}

function findMixamoNode(asset: THREE.Object3D, mixamoName: string) {
  const direct = asset.getObjectByName(mixamoName)
  if (direct) return direct

  let found: THREE.Object3D | null = null
  asset.traverse((obj) => {
    if (found || !obj.name) return
    if (mixamoNameMatches(mixamoName, obj.name)) {
      found = obj
    }
  })
  return found
}

export async function loadMixamoAnimation(
  url: string,
  vrm: VRM,
  clipName?: string,
) {
  const loader = new FBXLoader()
  const asset = await loader.loadAsync(url)
  const animationName = clipName ?? url.split('/').pop()?.replace('.fbx', '') ?? 'mixamoAnimation'

  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com')
    || asset.animations[0]

  if (!clip) {
    throw new Error('No animation found in FBX file')
  }

  const tracks: THREE.KeyframeTrack[] = []

  const restRotationInverse = new THREE.Quaternion()
  const parentRestWorldRotation = new THREE.Quaternion()
  const _quatA = new THREE.Quaternion()

  const motionHipsNode = findMixamoNode(asset, 'mixamorigHips')
  if (!motionHipsNode) {
    throw new Error('mixamorigHips not found in FBX')
  }

  const motionHipsHeight = motionHipsNode.position.y
  const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] || 1
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight

  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split('.')
    const mixamoRigName = trackSplitted[0]
    const normalizedMixamoRigName = normalizeMixamoRigName(mixamoRigName)
    const vrmBoneName = mixamoVRMRigMap[normalizedMixamoRigName]
    if (!vrmBoneName) return

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as HumanoidBoneName)
    const vrmNodeName = vrmNode?.name
    const mixamoRigNode = findMixamoNode(asset, mixamoRigName)

    if (vrmNodeName != null && mixamoRigNode != null) {
      const propertyName = trackSplitted[1]

      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert()
      mixamoRigNode.parent?.getWorldQuaternion(parentRestWorldRotation)

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        for (let i = 0; i < track.values.length; i += 4) {
          const flatQuaternion = track.values.slice(i, i + 4)
          _quatA.fromArray(flatQuaternion)
          _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse)

          _quatA.toArray(flatQuaternion)
          flatQuaternion.forEach((v, index) => {
            track.values[index + i] = v
          })
        }

        const values = track.values.map((v, i) =>
          (vrm.meta?.metaVersion === '0' && i % 2 === 0 ? -v : v)
        )

        tracks.push(new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          values
        ))
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const values = track.values.map((v, i) =>
          (vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? -v : v) * hipsPositionScale
        )

        tracks.push(new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          values
        ))
      }
    }
  })

  const normalizedClip = new THREE.AnimationClip(
    animationName,
    clip.duration,
    tracks,
  )

  normalizedClip.userData = {
    ...normalizedClip.userData,
    mixamoDebug: {
      animationName,
      sourceUrl: url,
    },
  }

  return normalizedClip
}
