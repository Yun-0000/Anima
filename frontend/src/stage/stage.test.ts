// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { Stage } from './stage'

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>()
  return { ...original, WebGLRenderer: class {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false, type: 0 }
    render = vi.fn(); compile = vi.fn(); dispose = vi.fn(); forceContextLoss = vi.fn()
    setPixelRatio() {} setClearColor() {} setSize() {}
  } }
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('owns one loop, restores after context loss and stops on dispose', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const frames = new Map<number, FrameRequestCallback>()
  let sequence = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++sequence, callback); return sequence })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const host = document.createElement('div'); document.body.append(host)
  const stage = new Stage(host)
  expect(frames.size).toBe(1)
  const [id, callback] = [...frames][0]; frames.delete(id); callback(60_000)
  expect(stage.renderer.render).toHaveBeenCalledOnce()
  // Requests that change what is visible never start a second loop or reset its clock.
  const pending = [...frames.keys()]
  stage.setEmotion('happy'); stage.play('nod'); stage.setActivity('speaking'); stage.setActivity('speaking')
  expect([...frames.keys()]).toEqual(pending)
  stage.renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  expect(frames.size).toBe(0)
  stage.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'))
  expect(stage.renderer.compile).toHaveBeenCalledOnce(); expect(frames.size).toBe(1)
  stage.dispose(); expect(frames.size).toBe(0); expect(host.querySelector('canvas')).toBeNull(); host.remove()
})
