import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

// Meshy auto-rig skeleton (Mixamo-like, no fingers). Spine02 is the lowest.
const meshyVRMRigMap: Record<string, VRMHumanBoneName> = {
  Hips: 'hips',
  Spine02: 'spine',
  Spine01: 'chest',
  Spine: 'upperChest',
  neck: 'neck',
  Head: 'head',
  LeftShoulder: 'leftShoulder',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
  RightToeBase: 'rightToes',
}

// Text to Motion exports use an SMPL-H skeleton, unlike Meshy's auto-rig library.
const textMotionRigMap: Record<string, VRMHumanBoneName> = {
  Pelvis: 'hips', Spine1: 'spine', Spine2: 'chest', Spine3: 'upperChest', Neck: 'neck', Head: 'head',
  L_Collar: 'leftShoulder', L_Shoulder: 'leftUpperArm', L_Elbow: 'leftLowerArm', L_Wrist: 'leftHand',
  R_Collar: 'rightShoulder', R_Shoulder: 'rightUpperArm', R_Elbow: 'rightLowerArm', R_Wrist: 'rightHand',
  L_Hip: 'leftUpperLeg', L_Knee: 'leftLowerLeg', L_Ankle: 'leftFoot', L_Foot: 'leftToes',
  R_Hip: 'rightUpperLeg', R_Knee: 'rightLowerLeg', R_Ankle: 'rightFoot', R_Foot: 'rightToes',
}
// Generated finger motion comes out clawed or fisted, so fingers are posed here instead: each joint curls toward
// the palm (normalized VRM bones: arms along ±X, palms facing -Y), the thumb less than the others.
const RELAXED = { Proximal: 0.35, Intermediate: 0.45, Distal: 0.3 }
const SOFT = { Proximal: 0.15, Intermediate: 0.2, Distal: 0.12 }
const OPEN = { Proximal: 0.06, Intermediate: 0.08, Distal: 0.05 }
const all = (curl: typeof RELAXED) => ({ Index: curl, Middle: curl, Ring: curl, Little: curl })
const SHAPES = {
  relaxed: all(RELAXED),
  soft: all(SOFT),
  open: all(OPEN),
}
export type HandShape = keyof typeof SHAPES
const THUMB_CURL = { Metacarpal: 0.1, Proximal: 0.2, Distal: 0.2 } as const
/**
 * VRM 0.x normalized bones face the other way (turned 180° about Y): the x and z of every rotation flip.
 * Rotations here are written for VRM 1.0, so they are mirrored for 0.x models.
 */
function forVersion(vrm: VRM, q: THREE.Quaternion) {
  if (vrm.meta?.metaVersion === '0') { q.x = -q.x; q.z = -q.z }
  return q
}

function posedFingers(vrm: VRM, duration: number, hands: { left: HandShape; right: HandShape }) {
  const tracks: THREE.KeyframeTrack[] = []
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1
    const add = (bone: VRMHumanBoneName, rotation: THREE.Euler) => {
      const node = vrm.humanoid.getNormalizedBoneNode(bone)
      if (!node) return
      const q = forVersion(vrm, new THREE.Quaternion().setFromEuler(rotation)).toArray()
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, [0, duration], [...q, ...q]))
    }
    const shape = SHAPES[hands[side]]
    for (const finger of ['Index', 'Middle', 'Ring', 'Little'] as const) {
      for (const [joint, angle] of Object.entries(shape[finger])) add(`${side}${finger}${joint}` as VRMHumanBoneName, new THREE.Euler(0, 0, sign * angle))
    }
    for (const [joint, angle] of Object.entries(THUMB_CURL)) add(`${side}Thumb${joint}` as VRMHumanBoneName, new THREE.Euler(0, -sign * angle, sign * angle * 0.5))
  }
  return tracks
}

/**
 * Retarget a Meshy animation GLB onto a VRM: rest-pose-relative rotations, plus the hips' height scaled to the
 * VRM. Horizontal hip travel is dropped, because the motion controller moves the character itself.
 */
export async function loadMeshyAnimation(url: string, vrm: VRM, hands: { left: HandShape; right: HandShape } = { left: 'relaxed', right: 'relaxed' }) {
  const gltf = await new GLTFLoader().loadAsync(url)
  const asset = gltf.scene
  const clip = gltf.animations[0]
  if (!clip) throw new Error(`no animation in ${url}`)
  asset.updateMatrixWorld(true)

  const hips = asset.getObjectByName('Hips') ?? asset.getObjectByName('Pelvis')
  if (!hips) throw new Error('Hips not found')
  const rigMap = hips.name === 'Pelvis' ? textMotionRigMap : meshyVRMRigMap
  const hipsWorld = new THREE.Vector3()
  hips.getWorldPosition(hipsWorld)
  const foot = asset.getObjectByName(hips.name === 'Pelvis' ? 'L_Ankle' : 'LeftFoot')
  const hipsHeight = foot ? hipsWorld.y - foot.getWorldPosition(new THREE.Vector3()).y : hipsWorld.y
  if (hipsHeight <= 0) throw new Error('Animation skeleton has no valid standing height')
  // Match leg length: the VRM's hips-to-ankle height over the source's (the floor offset below the ankle is handled by constrain).
  const rest = vrm.humanoid.normalizedRestPose
  const ankle = (['hips', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot'] as const).reduce((height, bone) => height + (rest[bone]?.position?.[1] ?? 0), 0)
  const vrmHipsHeight = rest.hips?.position?.[1] ?? 1
  const hipsScale = (ankle > 0 && ankle < vrmHipsHeight ? vrmHipsHeight - ankle : vrmHipsHeight) / hipsHeight

  const restInv = new THREE.Quaternion()
  const parentRest = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  const parentMat = new THREE.Matrix4()
  const v = new THREE.Vector3()
  const tracks: THREE.KeyframeTrack[] = []

  for (const track of clip.tracks) {
    const [boneName, prop] = track.name.split('.')
    const vrmBone = rigMap[boneName]
    if (!vrmBone) continue
    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBone)
    const src = asset.getObjectByName(boneName)
    if (!vrmNode || !src) continue
    src.getWorldQuaternion(restInv).invert()
    src.parent?.getWorldQuaternion(parentRest)

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = track.values.slice()
      for (let i = 0; i < values.length; i += 4) {
        forVersion(vrm, q.fromArray(values, i).premultiply(parentRest).multiply(restInv)).toArray(values, i)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.quaternion`, track.times, values))
    } else if (track instanceof THREE.VectorKeyframeTrack && prop === 'position' && vrmBone === 'hips') {
      // hips translation: local -> world (armature transform), then scale to the VRM's hip height
      parentMat.copy(src.parent!.matrixWorld)
      const values = track.values.slice()
      for (let i = 0; i < values.length; i += 3) {
        v.fromArray(values, i).applyMatrix4(parentMat).multiplyScalar(hipsScale)
        v.x = 0; v.z = 0
        v.toArray(values, i)
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.position`, track.times, values))
    }
  }
  tracks.push(...posedFingers(vrm, clip.duration, hands))
  return new THREE.AnimationClip(url.split('/').pop()!.replace('.glb', ''), clip.duration, tracks)
}

/** Companions keep their authored proportions and are shown smaller than life size. */
export const COMPANION_SCALE = 0.72

/** Uniformly scale an avatar. Spring-bone radii live in world units, so they are scaled with it. */
export function scaleAvatar(vrm: VRM, scale: number) {
  vrm.scene.scale.setScalar(scale)
  vrm.scene.updateMatrixWorld(true)
  for (const collider of vrm.springBoneManager?.colliders ?? []) {
    const shape = collider.shape as { radius?: number }
    if (shape.radius !== undefined) shape.radius *= scale
  }
  for (const joint of vrm.springBoneManager?.joints ?? []) joint.settings.hitRadius *= scale
  vrm.springBoneManager?.reset()
}
