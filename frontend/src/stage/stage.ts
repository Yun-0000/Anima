import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MToonMaterial, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM } from '@pixiv/three-vrm'
import { COMPANION_SCALE, scaleAvatar } from './meshyAnimation'
import { addRoom } from './room'
import { MotionController } from './controller'
import { gestures } from './catalog'
import type { Activity, Gesture, MotionName } from './catalog'
import { ALL_EMOTIONS } from '../types/expression'
import type { EmotionName } from '../types/expression'

/** Seconds a nod or head shake takes. */
const GESTURE_SECONDS = 1.1
/** The camera never moves. */
const CAMERA = { position: [0, 1.32, 4.4], target: [0, 0.92, 0], fov: 32 } as const
/** Narrow cards pull the view wider so at least this much floor width (world units, at the character) stays visible. */
const MIN_HALF_WIDTH = 1.05

export class Stage {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  vrm?: VRM
  motion?: MotionController
  activity: Activity = 'idle'
  /** Loudness of the character's own voice (0–1); drives the mouth. */
  audioLevel = 0
  private emotion: EmotionName = 'neutral'
  private weights = new Map<string, number>()
  private winkUntil = -1
  private winkSide: 'blinkLeft' | 'blinkRight' = 'blinkLeft'
  private gesture?: { name: Gesture; start: number }
  private frame = 0
  private owner: Window
  private previous = 0
  private renderTime = 0
  private elapsed = 0
  private blinkAt = 2
  private blinkStart = -1
  private generation = 0
  private lost = false
  private disposed = false
  private pointer = new THREE.Vector2()
  private gaze = new THREE.Object3D()
  private resize: ResizeObserver
  private breath = 0
  private sway = 0
  private nod = new THREE.Euler()
  /** Zoom into the view and lift its content (fraction of the height), e.g. to keep the character above overlays. */
  framing = { zoom: 1, lift: 0 }
  onStatus: (status: string) => void = () => {}
  readonly container: HTMLElement
  /** Without the room (the lab) the character stands on a plain backdrop with only its shadow on the floor. */
  constructor(container: HTMLElement, { room = true } = {}) {
    this.container = container
    // Nothing in view is nearer than a meter; a far-out near plane keeps the depth precision for the rug on the floor.
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 30)
    this.owner = container.ownerDocument.defaultView!
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(this.owner.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0xe9dece, 1)
    container.append(this.renderer.domElement)
    this.camera.position.set(...CAMERA.position); this.camera.lookAt(...CAMERA.target)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb7aa99, 1.65))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const light = new THREE.DirectionalLight(0xfff3df, 0.85)
    // In the room the light comes from the window side; on its own, from above so the shadow stays under the feet.
    if (room) light.position.set(-2, 4, 3)
    else light.position.set(-0.5, 6, 1.6)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048); light.shadow.normalBias = 0.02
    // The shadow camera covers the whole room; anything outside it would show a hard lit/unlit edge.
    light.shadow.camera.left = -3.5; light.shadow.camera.right = 3.5
    light.shadow.camera.top = 3.5; light.shadow.camera.bottom = -2.5; light.shadow.camera.far = 14
    this.scene.add(light)
    this.scene.add(this.gaze)
    if (room) addRoom(this.scene)
    else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.18 }))
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true
      this.scene.add(floor)
    }
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onRestored)
    container.addEventListener('pointermove', this.onPointer)
    this.resize = new ResizeObserver(() => this.fit()); this.resize.observe(container)
    this.owner.document.addEventListener('visibilitychange', this.onVisibility)
    this.fit(); this.resume()
  }
  /** Shows a character; resolves false when a newer load superseded this one. */
  async load(model: string, preferences: Partial<Record<string, number>> = {}): Promise<boolean> {
    const generation = ++this.generation
    this.onStatus('Loading…')
    const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser))
    const gltf = await loader.loadAsync(model)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm) throw new Error('The model is not a valid VRM')
    if (this.disposed || generation !== this.generation) { VRMUtils.deepDispose(vrm.scene); return false }
    this.motion?.dispose()
    if (this.vrm) { this.scene.remove(this.vrm.scene); VRMUtils.deepDispose(this.vrm.scene) }
    VRMUtils.rotateVRM0(vrm); scaleAvatar(vrm, COMPANION_SCALE)
    const materials = new Set<MToonMaterial>()
    vrm.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof MToonMaterial && !materials.has(material)) {
          material.matcapFactor.multiplyScalar(0.35); materials.add(material)
        }
      }
    })
    this.vrm = vrm; this.scene.add(vrm.scene)
    this.breath = 0; this.sway = 0; this.nod.set(0, 0, 0); this.weights.clear()
    if (vrm.lookAt) vrm.lookAt.target = this.gaze
    this.motion = new MotionController(vrm); this.motion.preferences = preferences
    this.motion.onError = this.onStatus
    await this.motion.play('idle')
    if (this.disposed || generation !== this.generation) return false
    this.motion.update(0); vrm.update(0); this.motion.constrain()
    // Initialize physics after the first standing pose and floor correction.
    vrm.springBoneManager?.reset()
    this.motion.setActivity(this.activity)
    this.onStatus('Ready'); this.resume()
    return true
  }
  setFraming(framing: { zoom: number; lift: number }) { this.framing = framing; this.fit() }
  setActivity(activity: Activity) {
    // Voice reports its activity many times a second; only a change matters.
    if (activity === this.activity) return
    this.activity = activity; this.motion?.setActivity(activity); this.resume()
  }
  /** A body motion, or a head gesture on top of the current one. */
  play(action: MotionName | Gesture) {
    if ((gestures as readonly string[]).includes(action)) this.gesture = { name: action as Gesture, start: this.elapsed }
    else void this.motion?.play(action as MotionName)
    this.resume()
  }
  /** Emotions blend in and out over a few frames instead of snapping. */
  setEmotion(emotion: EmotionName) {
    if (emotion === 'wink') { this.wink(); return }
    this.emotion = emotion; this.resume()
  }
  wink() {
    this.winkSide = Math.random() < 0.5 ? 'blinkLeft' : 'blinkRight'
    this.winkUntil = this.elapsed + 0.25; this.resume()
  }
  private onPointer = (event: PointerEvent) => {
    const rect = this.container.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
  }
  private fit() {
    const { width, height } = this.container.getBoundingClientRect()
    // CSS sizes the canvas; only the drawing buffer follows the container.
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    this.camera.aspect = width / Math.max(1, height)
    const narrow = THREE.MathUtils.radToDeg(2 * Math.atan(MIN_HALF_WIDTH / (this.camera.aspect * CAMERA.position[2])))
    this.camera.fov = Math.max(CAMERA.fov, narrow)
    const { zoom, lift } = this.framing
    const w = Math.max(1, width), h = Math.max(1, height)
    if (zoom !== 1 || lift) this.camera.setViewOffset(w, h, (w - w / zoom) / 2, (h - h / zoom) / 2 + lift * h, w / zoom, h / zoom)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    this.resume()
  }
  private onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.stop(); this.onStatus('Restoring the scene…') }
  private onRestored = () => {
    this.lost = false; this.fit(); this.vrm?.springBoneManager?.reset()
    this.renderer.compile(this.scene, this.camera); this.resume(); this.onStatus('Ready')
  }
  private onVisibility = () => { this.stop(); this.resume() }
  private stop() { if (this.frame) this.owner.cancelAnimationFrame(this.frame); this.frame = 0; this.previous = 0; this.renderTime = 0 }
  private resume() { if (!this.disposed && !this.lost && !this.owner.document.hidden && !this.frame) this.frame = this.owner.requestAnimationFrame(this.tick) }
  private tick = (now: number) => {
    this.frame = 0
    if (this.disposed || this.lost || this.owner.document.hidden) return
    // Wandering alone looks fine at 24 fps; conversation, gestures and speech get full frame rate.
    const busy = this.activity !== 'idle' || this.gesture || this.audioLevel > 0
    const frameMs = busy ? 1000 / 60 : 1000 / 24
    if (now - this.renderTime >= frameMs) {
      const dt = this.previous ? Math.min((now - this.previous) / 1000, 0.1) : 0
      this.previous = now; this.renderTime = now; this.elapsed += dt
      const vrm = this.vrm
      const chest = vrm?.humanoid.getNormalizedBoneNode('chest')
      const spine = vrm?.humanoid.getNormalizedBoneNode('spine')
      const head = vrm?.humanoid.getNormalizedBoneNode('head')
      // Undo the previous procedural offsets before applying this frame's animation.
      if (chest) chest.rotation.x -= this.breath
      if (spine) spine.rotation.z -= this.sway
      if (head) { head.rotation.x -= this.nod.x; head.rotation.y -= this.nod.y }
      this.motion?.update(dt)
      if (vrm) {
        // Breathing, a shift of weight and a head drift (slow sines that rarely line up), so rests never freeze.
        this.breath = Math.sin(this.elapsed * 1.9) * 0.012
        this.sway = Math.sin(this.elapsed * 0.45) * 0.012 + Math.sin(this.elapsed * 0.17) * 0.008
        this.nod.set(Math.sin(this.elapsed * 0.31) * 0.02, Math.sin(this.elapsed * 0.23 + 1) * 0.035, 0)
        if (this.gesture) {
          const t = (this.elapsed - this.gesture.start) / GESTURE_SECONDS
          if (t >= 1) this.gesture = undefined
          else if (this.gesture.name === 'nod') this.nod.x += Math.sin(t * Math.PI * 4) * 0.2 * (1 - t)
          else this.nod.y += Math.sin(t * Math.PI * 6) * 0.28 * (1 - t)
        }
        if (this.elapsed > this.blinkAt) { this.blinkStart = this.elapsed; this.blinkAt = this.elapsed + 2 + Math.random() * 4 }
        const blink = this.blinkStart >= 0 ? Math.max(0, 1 - Math.abs(this.elapsed - this.blinkStart - 0.09) / 0.09) : 0
        const winking = this.elapsed < this.winkUntil
        const expressions = vrm.expressionManager
        expressions?.setValue('blink', this.motion?.dozing ? 1 : winking ? 0 : blink)
        expressions?.setValue('blinkLeft', winking && this.winkSide === 'blinkLeft' ? 1 : 0)
        expressions?.setValue('blinkRight', winking && this.winkSide === 'blinkRight' ? 1 : 0)
        expressions?.setValue('aa', this.audioLevel * 0.7)
        expressions?.setValue('oh', this.audioLevel * 0.3)
        const blend = 1 - Math.exp(-8 * dt)
        for (const name of ALL_EMOTIONS) {
          if (name === 'neutral') continue
          // A faint smile at rest; a wink adds a relaxed look for a moment.
          let target = name === this.emotion ? 0.8 : 0
          if (name === 'happy' && this.emotion === 'neutral') target = 0.08
          if (name === 'relaxed' && this.elapsed < this.winkUntil + 0.1) target = Math.max(target, 0.4)
          const weight = this.weights.get(name) ?? target
          const next = weight + (target - weight) * blend
          this.weights.set(name, next); expressions?.setValue(name, next)
        }
        this.gaze.position.set(this.pointer.x * 1.2 + Math.sin(this.elapsed * 2.3) * 0.025, 1.03 + this.pointer.y * 0.4, 3)
        if (chest) chest.rotation.x += this.breath
        if (spine) spine.rotation.z += this.sway
        if (head) { head.rotation.x += this.nod.x; head.rotation.y += this.nod.y }
        vrm.update(dt)
        this.motion?.constrain()
      }
      this.renderer.render(this.scene, this.camera)
    }
    this.frame = this.owner.requestAnimationFrame(this.tick)
  }
  /** Whether a point on screen (client coordinates) is on the character. */
  hitTest(x: number, y: number) {
    if (!this.vrm) return false
    const rect = this.container.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), this.camera)
    return ray.intersectObject(this.vrm.scene, true).length > 0
  }
  dispose() {
    this.disposed = true; this.generation++; this.stop(); this.resize.disconnect()
    this.owner.document.removeEventListener('visibilitychange', this.onVisibility)
    this.container.removeEventListener('pointermove', this.onPointer)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored)
    this.motion?.dispose(); VRMUtils.deepDispose(this.scene); this.renderer.forceContextLoss(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
