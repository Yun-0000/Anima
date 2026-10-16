/// <reference types="node" />
// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Bone } from 'three'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { expect, it } from 'vitest'
import { loadMeshyAnimation } from './meshyAnimation'

it('retargets both Meshy skeleton formats in place, with posed fingers', async () => {
  const bones = new Map<VRMHumanBoneName, Bone>()
  const vrm = { humanoid: { normalizedRestPose: { hips: { position: [0, 1, 0] } }, getNormalizedBoneNode(name: VRMHumanBoneName) {
    if (!bones.has(name)) { const bone = new Bone(); bone.name = `vrm_${name}`; bones.set(name, bone) }
    return bones.get(name)
  } } } as unknown as VRM
  for (const filename of readdirSync(resolve('public/motions')).filter(file => file.endsWith('.glb'))) {
    const bytes = readFileSync(resolve('public/motions', filename))
    const clip = await loadMeshyAnimation(`data:model/gltf-binary;base64,${bytes.toString('base64')}`, vrm)
    expect(clip.duration).toBeGreaterThan(0)
    const hips = clip.tracks.find(track => track.name === 'vrm_hips.position')!
    expect(hips).toBeDefined()
    for (let index = 0; index < hips.values.length; index += 3) {
      expect(hips.values[index]).toBe(0)
      expect(hips.values[index + 2]).toBe(0)
      expect(hips.values[index + 1]).toBeGreaterThan(0)
    }
    expect(clip.tracks.every(track => [...track.values].every(Number.isFinite))).toBe(true)
    // Fingers are posed for every clip.
    expect(clip.tracks.some(track => track.name === 'vrm_leftIndexProximal.quaternion')).toBe(true)
  }
})

it('scales an avatar uniformly together with its spring-bone radii', async () => {
  const { Object3D } = await import('three')
  const { scaleAvatar } = await import('./meshyAnimation')
  const collider = { shape: { radius: 0.1 } }
  const joint = { settings: { hitRadius: 0.02 } }
  let reset = 0
  const vrm = { scene: new Object3D(), springBoneManager: { colliders: [collider], joints: [joint], reset: () => reset++ } }
  scaleAvatar(vrm as unknown as VRM, 0.5)
  expect(vrm.scene.scale.toArray()).toEqual([0.5, 0.5, 0.5])
  expect(collider.shape.radius).toBeCloseTo(0.05)
  expect(joint.settings.hitRadius).toBeCloseTo(0.01)
  expect(reset).toBe(1)
})
