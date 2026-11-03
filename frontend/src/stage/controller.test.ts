import { AnimationClip, Group } from 'three'
import type { AnimationAction } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { expect, it, vi } from 'vitest'
import { MotionController } from './controller'

vi.mock('./meshyAnimation', () => ({ loadMeshyAnimation: async () => new AnimationClip('test', 1, []) }))
function setup() {
  const scene = new Group()
  const controller = new MotionController({ scene } as unknown as VRM)
  return { scene, controller }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
it('picks only in-place motions and never moves the character across the room', async () => {
  const { controller, scene } = setup()
  for (let i = 0; i < 20; i++) { controller.update(31); await settle() }
  expect(controller.current).toBe('idle')
  expect(scene.position.x).toBe(0); expect(scene.position.z).toBe(0)
  controller.dispose()
})
it('replays a completed single-use action', async () => {
  const { controller } = setup()
  controller.autonomous = false
  const play = vi.spyOn(controller.mixer, 'clipAction')
  await controller.play('wave')
  controller.update(2)
  const action = play.mock.results[0].value as AnimationAction
  expect(action.time).toBe(1)
  // Waving again starts over, whichever of the wave versions is picked this time.
  await controller.play('wave'); controller.update(0.1)
  const again = play.mock.results.at(-1)!.value as AnimationAction
  expect(again.time).toBeCloseTo(0.1)
  controller.dispose()
})
it('speaks standing, going on through the idle versions', async () => {
  const { controller } = setup()
  controller.autonomous = false
  await controller.play('idle', { dwell: 15 })
  const first = controller.file
  controller.setActivity('speaking'); await settle()
  expect(controller.current).toBe('idle')
  // Instead of the long rest of being alone: the one-second test clip, then at most 2.5 s.
  controller.update(3.6); await settle()
  expect(controller.current).toBe('idle')
  expect(controller.file).not.toBe(first)
  controller.dispose()
})
it('a gesture at the end of speech is not held: an idle follows', async () => {
  const { controller } = setup()
  await controller.play('idle')
  controller.setActivity('speaking'); controller.update(0)
  await controller.play('shrug')
  controller.setActivity('idle')
  // The one-second test shrug ends; its last pose used to hold for 15 s.
  controller.update(1.1); await settle()
  expect(controller.current).toBe('idle')
  controller.dispose()
})
it('left alone, it switches between the idle versions instead of repeating one', async () => {
  const { controller } = setup()
  const seen: string[] = []
  for (let i = 0; i < 6; i++) { controller.update(25); await settle(); seen.push(controller.file) }
  for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  controller.dispose()
})
it('a pinned idle version is always used for idling', async () => {
  const { controller } = setup()
  controller.idleFile = 'idle_249'
  for (let i = 0; i < 4; i++) { controller.update(25); await settle(); expect(controller.file).toBe('idle_249') }
  controller.dispose()
})
it('idling plays a version once, then holds still before the next one', async () => {
  const { controller } = setup()
  controller.rest = [3, 6]
  controller.update(0); await settle()
  const first = controller.file
  // The test clips last one second: after it, the pose holds for at least three more.
  controller.update(2.5); await settle()
  expect(controller.file).toBe(first)
  controller.update(5); await settle()
  expect(controller.file).not.toBe(first)
  controller.dispose()
})

it('a shorter rest (the studio) moves on sooner', async () => {
  const { controller } = setup()
  controller.rest = [1, 2.5]
  controller.update(0); await settle()
  const first = controller.file
  // One-second clip plus at most 2.5 s of rest.
  controller.update(3.6); await settle()
  expect(controller.file).not.toBe(first)
  controller.dispose()
})
