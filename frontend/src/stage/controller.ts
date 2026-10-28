import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { loadMeshyAnimation, type HandShape } from './meshyAnimation'
import { motions } from './catalog'
import type { Activity, MotionName } from './catalog'

/** Top of the rug the character stands on (world units). */
const FLOOR = 0.012
/** Dozing is standing with closed eyes. */
type Choice = MotionName | 'doze'

export class MotionController {
  mixer: THREE.AnimationMixer
  autonomous = true
  activity: Activity = 'idle'
  /** 'custom' is a file opened in the lab. */
  current: MotionName | 'custom' = 'idle'
  file = ''
  /** Pins the idle version (the intro page). */
  idleFile = ''
  /** Seconds to hold still after each idle, picked at random in this range. */
  rest: readonly [number, number] = [1, 2.5]
  private looping = true
  private clips = new Map<string, Promise<THREE.AnimationClip>>()
  private action?: THREE.AnimationAction
  private generation = 0
  private dwell = 0
  private quiet = Infinity
  /** The talk motion was started by the character speaking (not played on purpose), so silence ends it. */
  private voiceTalk = false
  private explaining = false
  private disposed = false
  preferences: Partial<Record<Choice, number>> = {}
  dozing = false
  /** Height of the sole below the ankle bone, measured in the bind pose. */
  private sole = 0
  onError: (message: string) => void = () => {}
  private vrm: VRM
  constructor(vrm: VRM) {
    this.vrm = vrm
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    vrm.scene.updateMatrixWorld(true)
    const ankle = vrm.humanoid?.getRawBoneNode('leftFoot')?.getWorldPosition(new THREE.Vector3()).y
    const bottom = new THREE.Box3().setFromObject(vrm.scene).min.y
    if (ankle !== undefined && Number.isFinite(bottom)) this.sole = Math.max(0, ankle - bottom)
  }
  async play(name: MotionName, intent: { dwell?: number; dozing?: boolean; file?: string; voice?: boolean } = {}) {
    this.dozing = false
    const [file, clip] = this.clip(name, intent.file)
    // Idles play once and rest; a version chosen in the lab loops so it can be watched.
    const once = name === 'idle' && !intent.file
    await this.start(name, clip, motions[name].loop, { ...intent, once }, file)
  }
  playFile(url: string, loop: boolean) {
    this.dozing = false
    return this.start('custom', loadMeshyAnimation(url, this.vrm), loop, { dwell: Infinity }, url)
  }
  private async start(name: MotionName | 'custom', clip: Promise<THREE.AnimationClip>, loop: boolean, intent: { dwell?: number; dozing?: boolean; voice?: boolean; once?: boolean }, file: string) {
    const generation = ++this.generation
    try {
      const resolved = await clip
      if (this.disposed || generation !== this.generation) return
      if (intent.dozing) this.dozing = true
      const next = this.mixer.clipAction(resolved)
      if (next === this.action && loop && !intent.once && !next.paused) { if (intent.dwell) this.dwell = intent.dwell; return }
      next.reset().setLoop(loop && !intent.once ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      // A clip that plays once holds its last pose.
      next.clampWhenFinished = true
      // Fading the first clip in would flash the T-pose, and the same idle cannot cross-fade with itself.
      const fade = this.action && next !== this.action ? 0.35 : 0
      next.fadeIn(fade).play()
      if (next !== this.action) this.action?.fadeOut(fade)
      this.action = next
      this.current = name
      this.file = file
      this.looping = loop
      this.voiceTalk = intent.voice === true
      const rest = this.rest[0] + Math.random() * (this.rest[1] - this.rest[0])
      this.dwell = intent.once ? Math.max(intent.dwell ?? 0, resolved.duration + rest) : intent.dwell ?? (loop ? 8 + Math.random() * 15 : resolved.duration)
    } catch (error) {
      this.onError(error instanceof Error ? error.message : String(error))
    }
  }
  /** Without a choice, a random version other than the one playing. */
  private clip(name: MotionName, chosen?: string): [string, Promise<THREE.AnimationClip>] {
    const files: readonly string[] = motions[name].files
    const others = files.length > 1 ? files.filter(file => file !== this.file) : files
    const pinned = name === 'idle' && files.includes(this.idleFile) ? this.idleFile : ''
    const file = chosen && files.includes(chosen) ? chosen : pinned || others[Math.floor(Math.random() * others.length)]
    let clip = this.clips.get(file)
    if (!clip) {
      // Hand shapes: per file, else for all of the motion's files, else relaxed.
      const byFile = ('hands' in motions[name] ? motions[name].hands : {}) as Record<string, { left: HandShape; right: HandShape }>
      const hands = byFile[file] ?? byFile.all
      clip = loadMeshyAnimation(`/motions/${file}.glb`, this.vrm, hands)
      clip.catch(() => this.clips.delete(file))
      this.clips.set(file, clip)
    }
    return [file, clip]
  }
  setActivity(activity: Activity) {
    if (this.activity === activity) return
    const alone = this.activity === 'idle'
    this.activity = activity
    if (activity !== 'idle') this.dozing = false
    // Talking interrupts a looping motion (to face the user) but lets a gesture such as a wave finish.
    const target = this.conversing()
    if (activity !== 'idle' && this.current !== target && this.looping) void this.play(target, { voice: true })
    // In conversation the next idle comes after a short rest, not the long one of being alone.
    if (alone && activity !== 'idle' && this.current === 'idle' && this.action) {
      const left = Math.max(0, this.action.getClip().duration - this.action.time)
      this.dwell = Math.min(this.dwell, left + this.rest[1])
    }
    // Stay with the user a while in an idle; a gesture's last pose, such as a shrug's open arms, is not held.
    if (activity === 'idle' && this.current === 'idle') this.dwell = Math.max(this.dwell, 15)
  }
  /** The character starts explaining something: it talks with its hands for the rest of what it says. */
  explain() {
    if (this.activity !== 'speaking') return
    this.explaining = true
    if (this.current !== 'talk' && this.looping) void this.play('talk', { voice: true })
  }
  private conversing(): MotionName { return this.activity === 'speaking' && this.explaining ? 'talk' : 'idle' }
  update(dt: number) {
    this.mixer.update(dt)
    // Voice pauses between sentences; stop talking with the hands only after a real silence.
    this.quiet = this.activity === 'speaking' ? 0 : this.quiet + dt
    if (this.quiet > 1.2) this.explaining = false
    // After talking, stay with the user for a while before idling on, unless they already talk back.
    if (this.current === 'talk' && this.voiceTalk && this.quiet > 1.2) void this.play('idle', this.activity === 'idle' ? { dwell: 15 } : {})
    this.dwell -= dt
    if (this.autonomous && this.activity === 'idle' && this.dwell <= 0) {
      // After dozing, wake up (idle) before doing anything else; just after talking, stay awake.
      const names: Choice[] = this.dozing || this.quiet < 15 ? ['idle'] : ['idle', 'doze']
      const total = names.reduce((sum, name) => sum + (this.preferences[name] ?? 1), 0)
      let weight = Math.random() * total
      const name = names.find(name => (weight -= this.preferences[name] ?? 1) < 0) ?? 'idle'
      // Placeholder until the clip starts; play() then sets the real dwell.
      this.dwell = 12
      void this.play('idle', name === 'doze' ? { dwell: 20, dozing: true } : {})
    }
    if (this.activity !== 'idle' && this.dwell <= 0 && (!this.looping || this.current === 'idle')) {
      this.dwell = 12
      void this.play(this.conversing(), { voice: true })
    }
  }
  /** Keep the lower sole on the floor. */
  constrain() {
    const feet = (['leftFoot', 'rightFoot'] as const).map(name => this.vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3()).y).filter((y): y is number => y !== undefined)
    if (!feet.length) return
    this.vrm.scene.position.y += FLOOR + this.sole - Math.min(...feet)
    this.vrm.scene.updateMatrixWorld(true)
  }
  dispose() {
    this.disposed = true; this.generation++
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.vrm.scene); this.clips.clear()
  }
}
