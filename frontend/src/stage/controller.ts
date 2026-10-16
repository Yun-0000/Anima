import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { loadMeshyAnimation, type HandShape } from './meshyAnimation'
import { motions } from './catalog'
import type { Activity, MotionName } from './catalog'

/** Top of the rug the character stands on (world units). */
const FLOOR = 0.012
/** What the character can decide to do on its own; dozing is standing with closed eyes. */
type Choice = MotionName | 'doze'

export class MotionController {
  mixer: THREE.AnimationMixer
  autonomous = true
  activity: Activity = 'idle'
  /** The playing motion; 'custom' is a file opened in the lab. */
  current: MotionName | 'custom' = 'idle'
  /** The file (version) playing now. */
  file = ''
  /** When set, idling always uses this version instead of rotating (the intro page). */
  idleFile = ''
  /** After each idle the character holds still for this many seconds (a random time in the range) before the next. */
  rest: readonly [number, number] = [1, 2.5]
  private looping = true
  private clips = new Map<string, Promise<THREE.AnimationClip>>()
  private action?: THREE.AnimationAction
  private generation = 0
  private dwell = 0
  private quiet = 0
  /** The talk motion was started by the character speaking (not played on purpose), so silence ends it. */
  private voiceTalk = false
  private disposed = false
  preferences: Partial<Record<Choice, number>> = {}
  /** Eyes stay closed while dozing (stage reads this). */
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
  /** Plays a motion; `file` picks one of its versions (the lab), otherwise one is chosen at random. */
  async play(name: MotionName, intent: { dwell?: number; dozing?: boolean; file?: string; voice?: boolean } = {}) {
    this.dozing = false
    const [file, clip] = this.clip(name, intent.file)
    // Idling plays a version once and then holds still for a moment (see `rest`) before the next one;
    // a version chosen on purpose (the lab) loops so it can be watched.
    const once = name === 'idle' && !intent.file
    await this.start(name, clip, motions[name].loop, { ...intent, once }, file)
  }
  /** Plays a motion file that is not in the catalog (opened in the lab); it repeats if `loop`. */
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
      // The first clip starts fully weighted; fading in from nothing would flash the T-pose. Restarting the same
      // (seamlessly looping) idle cannot cross-fade with itself, so it starts directly.
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
  /** The file to play and its clip. Without a choice, a random version other than the one playing now. */
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
    this.activity = activity
    // A dozing character opens its eyes when spoken to.
    if (activity !== 'idle') this.dozing = false
    // Talking interrupts a looping motion (to face the user) but lets a gesture such as a wave finish.
    const target = this.conversing()
    if (activity !== 'idle' && this.current !== target && this.looping) void this.play(target, { voice: true })
    if (activity === 'idle') this.dwell = Math.max(this.dwell, 15)
  }
  /** While speaking the character talks with its hands; while listening it stands still. */
  private conversing(): MotionName { return this.activity === 'speaking' ? 'talk' : 'idle' }
  update(dt: number) {
    this.mixer.update(dt)
    // Voice pauses between sentences; stop talking with the hands only after a real silence.
    this.quiet = this.activity === 'speaking' ? 0 : this.quiet + dt
    // After talking, stay with the user for a while before idling on.
    if (this.current === 'talk' && this.voiceTalk && this.quiet > 1.2) void this.play('idle', { dwell: 15 })
    this.dwell -= dt
    if (this.autonomous && this.activity === 'idle' && this.dwell <= 0) {
      // After dozing, wake up (idle) before doing anything else.
      const names: Choice[] = this.dozing ? ['idle'] : ['idle', 'doze']
      const total = names.reduce((sum, name) => sum + (this.preferences[name] ?? 1), 0)
      let weight = Math.random() * total
      const name = names.find(name => (weight -= this.preferences[name] ?? 1) < 0) ?? 'idle'
      // Placeholder until the clip starts; play() then sets the real dwell (and only if it is not superseded).
      // Each idle plays another version once, then rests (see play); dozing keeps the eyes closed for a while.
      this.dwell = 12
      void this.play('idle', name === 'doze' ? { dwell: 20, dozing: true } : {})
    }
    if (this.activity !== 'idle' && this.dwell <= 0 && !this.looping) void this.play(this.conversing(), { voice: true })
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
