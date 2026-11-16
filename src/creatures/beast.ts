import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  AssetManager,
  Box3,
  type BufferGeometry,
  Color,
  LoopOnce,
  LoopRepeat,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Group,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playAnimalCall, playContent, playHoof, playHorseCall, playNicker, playSnort, playWhoosh } from '../audio.js';
import type { ActStep, Ground, Harness, HarnessPose, TaskPose, TaskStep } from './creature.js';
import type { Effects } from './fx.js';
import type { HandState } from './hand-input.js';
import { PetMood, petNow } from './mood.js';

/**
 * A rigged, animated animal friend loaded from glTF (Quaternius, CC0).
 * Unlike the plush pets it has no cartoon face: personality comes from body
 * language. It tracks your hand with its head, flinches away from a poke on
 * the side you poked, leans into a slow stroke, and loses patience if you
 * keep jabbing it.
 */
export interface BeastSpec {
  file: string;
  /** Overall height on the stage, ears included, in metres. */
  height: number;
  /** Walking and galloping speed, in body heights per second. */
  walk: number;
  gallop: number;
  /** One-shot clip played when it has been poked too often. */
  temper: string;
  /** Pitch of its call (1 = horse). */
  voice: number;
  /** The model's own clip names for the ones this code asks for (Idle, Walk, Gallop…). */
  clips?: Record<string, string>;
  /** Textured HD model: keep its colours as they are. */
  hd?: boolean;
}

export const BEASTS: Record<string, BeastSpec> = {
  horse: { file: 'gltf/horse.glb', height: 0.15, walk: 0.5, gallop: 2.0, temper: 'Attack_Kick', voice: 1 },
  // A realistic elk (WildMesh 3D, CC-BY) plays the stag.
  stag: {
    file: 'gltf/elk.glb', height: 0.17, walk: 0.45, gallop: 1.9, temper: 'Attack_Headbutt', voice: 0.7, hd: true,
    clips: {
      Idle: 'Stand_Breathing_01', Walk: 'Walk', Gallop: 'Run', Gallop_Jump: 'JumpStand', Jump_toIdle: 'Stand_Breathing_01',
      Eating: 'Stand_Eating_01', Idle_2: 'Take 001', Idle_Headlow: 'Stand_Eating_01', Idle_2_HeadLow: 'Stand_Eating_01',
      Idle_HitReact_Left: 'Hit_Stand_L01', Idle_HitReact_Right: 'Hit_Stand_L01', Attack_Headbutt: 'JumpStand', Attack_Kick: 'JumpStand', Attack: 'JumpStand',
    },
  },
  // A fox with thirty clips (pxltiger, CC-BY); in-place clips, since the code moves it.
  fox: {
    file: 'gltf/fox-hd.glb', height: 0.085, walk: 0.8, gallop: 2.6, temper: 'Attack', voice: 1.7, hd: true,
    clips: {
      Idle: 'Fox_Idle', Walk: 'Fox_Walk_InPlace', Gallop: 'Fox_Run_InPlace', Gallop_Jump: 'Fox_Jump_Pivot_InPlace', Jump_toIdle: 'Fox_Idle',
      Eating: 'Fox_Idle', Idle_2: 'Fox_Sit_Idle_Break', Idle_Headlow: 'Fox_Sit_Yes', Idle_2_HeadLow: 'Fox_Sit_Yes',
      Idle_HitReact_Left: 'Fox_Falling_Left', Idle_HitReact_Right: 'Fox_Falling', Attack: 'Fox_Attack_Paws', Attack_Headbutt: 'Fox_Attack_Paws', Attack_Kick: 'Fox_Attack_Tail',
      // For the Pet Park's tricks: a real sit, a nod from sitting, and a fall that serves as playing dead.
      Sit: 'Fox_Sit2_Idle', Sit_Yes: 'Fox_Sit_Yes', Death: 'Fox_Falling',
    },
  },
};

/** The animal packs name a few clips differently; try these when a name is missing. */
const CLIP_ALIASES: Record<string, string[]> = {
  Idle_Headlow: ['Idle_2_HeadLow'],
  Jump_toIdle: ['Jump_ToIdle'],
  Attack_Headbutt: ['Attack', 'Attack_Kick'],
  Attack_Kick: ['Attack', 'Attack_Headbutt'],
};

/**
 * The models are faceted low-poly: weld the split corners and average the
 * normals so the body reads as rounded muscle, not cut paper. Clones share
 * geometry, so this runs once per model.
 */
function smoothShade(geometry: BufferGeometry): void {
  if (geometry.userData.smoothed) return;
  geometry.userData.smoothed = true;
  geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry, 1e-4);
  geometry.setIndex(welded.index);
  for (const name of Object.keys(welded.attributes)) geometry.setAttribute(name, welded.attributes[name]);
  geometry.computeVertexNormals();
}

/** Starts loading every beast model; spawning falls back to plush pets until they arrive. */
export function preloadBeasts(): void {
  for (const [kind, spec] of Object.entries(BEASTS)) {
    const url = `${import.meta.env.BASE_URL}${spec.file}`;
    AssetManager.loadGLTF(url, `beast-${kind}`).catch((error) => console.warn(`Could not load ${kind}`, error));
  }
}

/** A fresh beast, or null if its model has not loaded yet. */
export function createBeast(kind: string, fx: Effects, size = 1): Beast | null {
  const spec = BEASTS[kind];
  const gltf = spec ? AssetManager.getGLTF(`beast-${kind}`) : null;
  if (!spec || !gltf) return null;
  return new Beast(kind, spec, gltf.scene, gltf.animations, fx, size);
}

type BeastState = 'emerging' | 'leaping' | 'idle' | 'task' | 'held' | 'thrown';
type BeastGround = Pick<Ground, 'center' | 'radius' | 'viewer' | 'blockers' | 'table' | 'keepOn'>;
type Mood = 'stand' | 'graze' | 'rest' | 'shift' | 'stroll' | 'approach';

const EMERGE_TIME = 0.9;
const LEAP_TIME = 0.9;
/** A pinch this far outside the body still takes it (hand tracking is a centimetre or two off). */
const GRAB_SLACK = 0.045;
const GRAVITY = 9.8;
/** The real floor (WebXR local-floor), where a thrown pet can land if it misses the table. */
const FLOOR_Y = 0;
/** Shadow colour the body fades in from as it steps out of the paper. */
const SHADOW = new Color(0x140b05);
const UP = new Vector3(0, 1, 0);
/** Fingertip speeds (m/s) that read as a poke, and as a gentle stroke. */
const POKE_SPEED = 0.45;
const STROKE_SPEED = 0.25;
/** Pokes within this many seconds add up to a temper. */
const PATIENCE_TIME = 8;
const PATIENCE = 3;
/** How long a hand must hover near the stage before the beast comes to sniff it. */
const CURIOUS_AFTER = 1.2;

/** Task poses as clips: the body language closest to each scripted beat. */
const POSE_CLIPS: Record<TaskPose, string> = {
  look: 'Idle',
  reach: 'Idle_2',
  eat: 'Eating',
  sniff: 'Idle_Headlow',
  dig: 'Eating',
  bonk: 'Attack_Headbutt',
  shrug: 'Idle_HitReact_Left',
  cheer: 'Gallop_Jump',
};

export class Beast {
  state: BeastState = 'emerging';
  /** Hooves position in world space. */
  readonly position = new Vector3();
  happiness = 0;
  petting = false;
  readonly root = new Group();
  readonly height: number;
  /** Nose-to-tail length on the stage. */
  readonly length: number;
  /** Side to side. */
  readonly width: number;
  mood: Mood = 'stand';

  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  /** Seconds left of a one-shot clip that movement waits for. */
  private oneShot = 0;
  private readonly tints: Array<{ material: MeshStandardMaterial; color: Color }> = [];
  private readonly head: Object3D | null;
  private readonly neck: Object3D | null;
  private readonly headRest = new Quaternion();
  private readonly neckRest = new Quaternion();

  private yaw = 0;
  /** Picked up and thrown: the hand holding it, its flight, and its tumble (roll about its own length). */
  private holder = -1;
  private readonly flight = new Vector3();
  private roll = 0;
  private rollSpeed = 0;
  private leapTime = LEAP_TIME;
  private bounces = 0;
  private stateTime = 0;
  private moodTime = 0;
  private moodLength = 3;
  private goal = new Vector3();
  private leapFrom = new Vector3();
  private leapTo = new Vector3();
  private afterLeap: BeastState = 'idle';
  private clopIn = 0;

  private lookTarget = new Vector3();
  private lookWeight = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private interest = 0;

  private touching = [false, false];
  /** This touch began as a poke, so resting there afterwards is not petting. */
  private jabbed = [false, false];
  private strokeTime = 0;
  private pokes: number[] = [];
  private hoverTime = 0;
  private hoverPoint = new Vector3();
  private snortIn = 6;
  /** A trick's body language on top of the clip (see ActStep): eased in and out, added in place(). */
  private actPitch = 0;
  private actRoll = 0;
  private actLift = 0;
  private actYaw = 0;
  private actSpin = 0;
  /** Seconds left of a nap you tucked it into (0: awake), and the next sleepy Z. */
  private sleepFor = 0;
  private zzzIn = 0;

  private task: TaskStep[] = [];
  private taskTime = 0;
  private taskStarted = false;
  private taskDone: (() => void) | null = null;
  private taskLook = new Vector3();
  private taskLooking = false;
  private readonly harnessPose: HarnessPose = { position: new Vector3(), yaw: 0, speed: 0, strain: 0 };
  /** Forward lean into the collar, radians. */
  private lean = 0;

  /** The table's top this frame (world y), which the body never sinks below. */
  private surface = 0;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private tmp3 = new Vector3();
  private forward = new Vector3();
  private rel = new Vector3();
  private contact = new Vector3();
  private headAt = new Vector3();
  private quat = new Quaternion();
  private quat2 = new Quaternion();

  /** How it feels about you, from how you treat it. */
  readonly feelings = new PetMood('fox');

  constructor(
    readonly kind: string,
    private readonly spec: BeastSpec,
    model: Object3D,
    clips: AnimationClip[],
    private readonly fx: Effects,
    /**
     * Body size from the shadow it was cast from (1 = normal). Bigger animals
     * walk faster but with slower strides (speed grows with the square root of
     * leg length) and pull harder (strength grows with muscle cross-section).
     */
    readonly size = 1,
  ) {
    this.root.name = `Beast-${kind}`;
    this.root.add(model);

    // Normalise size and put the hooves on the origin.
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true);
    const extent = box.getSize(this.tmp);
    const scale = (spec.height * this.size) / extent.y;
    model.scale.multiplyScalar(scale);
    const center = box.getCenter(this.tmp2);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    this.height = spec.height * this.size;
    this.length = extent.z * scale;
    this.width = extent.x * scale;

    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      // Skinned bounds do not follow the animation; the beast is always in view anyway.
      mesh.frustumCulled = false;
      smoothShade(mesh.geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const graded = materials.map((m) => this.grade(m));
      mesh.material = Array.isArray(mesh.material) ? graded : graded[0];
    });

    this.head = model.getObjectByName('Head') ?? null;
    this.neck = model.getObjectByName('Neck2') ?? model.getObjectByName('Neck1') ?? null;
    if (this.head) this.headRest.copy(this.head.quaternion);
    if (this.neck) this.neckRest.copy(this.neck.quaternion);

    this.mixer = new AnimationMixer(model);
    for (const clip of clips) {
      const name = clip.name.slice(clip.name.lastIndexOf('|') + 1);
      if (!this.actions.has(name)) this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.setTint(0);
  }

  /** Lantern-lit, grown-up palette: a little less saturated, matte, per-instance. */
  private grade(source: Material): Material {
    const standard = source as MeshStandardMaterial;
    if (!standard.isMeshStandardMaterial) return source;
    const material = standard.clone();
    if (!this.spec.hd) {
      // Flat-coloured low-poly packs: soften to a matte finish.
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      material.color.setHSL(hsl.h, hsl.s * 0.82, hsl.l * 0.92);
      material.roughness = 0.82;
    }
    material.metalness = 0;
    this.tints.push({ material, color: material.color.clone() });
    return material;
  }

  private setTint(k: number): void {
    for (const { material, color } of this.tints) material.color.copy(SHADOW).lerp(color, k);
  }

  get emerged(): boolean {
    return this.state !== 'emerging';
  }

  /** Radius of its contact shadow on the stage. */
  get footprint(): number {
    return this.length * 0.5;
  }

  get busy(): boolean {
    return this.task.length > 0 || this.state === 'task';
  }

  get taskLabel(): string {
    const step = this.task[0];
    if (!step) return '';
    return `${step.do === 'pose' ? step.pose : step.do} t=${this.taskTime.toFixed(1)} (${this.task.length} left)`;
  }

  /** Clip names, for debugging. */
  get clip(): string {
    return this.current?.getClip().name ?? '';
  }

  /** Start as a flat shadow on the paper that fills with colour. */
  emergeFrom(at: Vector3, facing: Quaternion): void {
    this.position.copy(at);
    this.tmp.set(0, 0, 1).applyQuaternion(facing);
    this.yaw = Math.atan2(this.tmp.x, this.tmp.z);
    this.setTint(0);
    this.play('Idle');
    this.setState('emerging');
    this.place();
  }

  /** Leap from the paper down onto the stage. */
  landAt(spot: Vector3): void {
    this.leapFrom.copy(this.position);
    this.leapTo.copy(spot);
    this.afterLeap = this.task.length > 0 ? 'task' : 'idle';
    this.faceTowards(spot, 1);
    this.leapTime = LEAP_TIME;
    this.play('Gallop_Jump', false, 0.15, this.clipLength('Gallop_Jump', 0.9) / this.leapTime);
    this.setState('leaping');
  }

  perform(steps: TaskStep[], done?: () => void): void {
    this.task = steps.slice();
    this.taskStarted = false;
    this.taskDone = done ?? null;
    if (this.state === 'leaping') this.afterLeap = 'task';
    else if (this.state !== 'emerging') this.setState('task');
  }

  cancelTask(): void {
    this.task = [];
    this.taskDone = null;
    if (this.state === 'task') this.setState('idle');
    if (this.afterLeap === 'task') this.afterLeap = 'idle';
  }

  /** Shadow Pets care (see pet-care.ts): where its mouth and back are, and how wide it is. */
  mouth(out: Vector3): Vector3 {
    this.tmp3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.head) {
      // The head bone sits at the skull; the mouth is a little ahead of it and lower, at the muzzle.
      return this.head.getWorldPosition(out).addScaledVector(this.tmp3, this.height * 0.2).addScaledVector(UP, -this.height * 0.07);
    }
    return out.copy(this.position).addScaledVector(this.tmp3, this.length * 0.5).addScaledVector(UP, this.height * 0.75);
  }

  /** A berry or the ball held out to it: it turns its head to look. */
  notice(at: Vector3): void {
    this.lookAt(at, 1);
    if (this.state === 'idle' && this.oneShot <= 0) this.faceTowards(at, 0.05);
  }

  /** Takes a bite: head down, chewing, for a moment (the berry is in its mouth). */
  chew(): void {
    if (this.state !== 'idle') return;
    this.play('Eating', true, 0.15);
    this.oneShot = 1.1;
    this.mood = 'graze';
    this.moodTime = 0;
    this.moodLength = 2;
  }

  back(out: Vector3): Vector3 {
    return out.copy(this.position).addScaledVector(UP, this.height * 0.85);
  }

  get reach(): number {
    return Math.max(0.06, this.length * 0.45);
  }

  get asleep(): boolean {
    return this.sleepFor > 0;
  }

  /** A berry from your fingers: it eats, hearts float up, and it nickers happily. */
  feed(): void {
    this.feelings.fed();
    this.happiness = 1;
    this.sleepFor = 0;
    for (let i = 0; i < 3; i++) this.fx.heart(this.back(this.tmp2));
    if (this.state === 'idle') this.setMood('stand', 2.5);
    playContent(0.05);
    window.setTimeout(() => this.call(0.6), 450);
  }

  /** Your palm over its back: it lowers its head and dozes, with sleepy Zs, until you lift or poke it. */
  tuckIn(): void {
    if (this.state !== 'idle') return;
    this.feelings.sleep();
    this.sleepFor = 16;
    this.setMood('rest', 16);
  }

  /** A celebration: a happy buck on the spot and a call. */
  cheer(): void {
    if (this.state !== 'idle') return;
    this.happiness = 1;
    this.playOnce('Gallop_Jump', 1.1);
    this.call();
  }

  /** Its call, on command (Speak!). */
  speak(): void {
    this.call();
  }

  /** Its voice: a real recording for the horse; the others keep their synthesized calls. */
  private call(volume = 1): void {
    if (this.kind === 'horse' && playHorseCall(0.45 * volume)) return;
    // The fox and the stag have their own real voices: a full call when it matters, a short one otherwise.
    if ((this.kind === 'fox' || this.kind === 'stag') && playAnimalCall(this.kind, volume >= 0.9, 0.5 * volume)) return;
    playNicker(this.spec.voice, volume);
  }

  update(dt: number, time: number, ground: BeastGround, hands: HandState[]): void {
    this.stateTime += dt;
    this.surface = ground.center.y;
    this.feelings.kind = this.kind;
    this.feelings.tick(dt);
    petNow.mood = this.feelings;
    if (this.oneShot > 0) {
      this.oneShot -= dt;
      // The one-shot is over: settle back into the current mood's loop.
      if (this.oneShot <= 0 && this.state === 'idle') this.setMood(this.mood, this.moodLength - this.moodTime);
    }
    this.happiness = Math.max(0, this.happiness - dt * 0.05);
    // Picked up, thrown or busy: no longer asleep.
    if (this.state !== 'idle') this.sleepFor = 0;

    switch (this.state) {
      case 'emerging': {
        const k = Math.min(1, this.stateTime / EMERGE_TIME);
        this.setTint(k * k);
        this.root.scale.setScalar(0.8 + 0.2 * k);
        if (k >= 1) this.state = 'idle';
        break;
      }
      case 'leaping': {
        const k = Math.min(1, this.stateTime / this.leapTime);
        this.position.lerpVectors(this.leapFrom, this.leapTo, k);
        this.position.y += Math.sin(k * Math.PI) * this.height * 0.9;
        this.setTint(1);
        this.root.scale.setScalar(1);
        if (k >= 1) {
          playHoof(0.06);
          this.fx.burst(this.position, 6, 0.12);
          this.leapTime = LEAP_TIME;
          const next = this.afterLeap;
          this.setState(next);
          this.afterLeap = 'idle';
          if (next === 'idle') this.play('Idle', true, 0.25);
        }
        break;
      }
      case 'task':
        this.runTask(dt);
        break;
      case 'idle':
        this.live(dt, ground, hands);
        break;
      case 'held':
        this.carried(dt, hands, ground);
        break;
      case 'thrown':
        this.tumble(dt, ground);
        break;
    }

    // A trick interrupted (picked up, thrown): its body language goes with it, eased away, not snapped.
    if (this.state !== 'task') {
      const k = Math.min(1, dt * 10);
      this.actPitch -= this.actPitch * k;
      this.actRoll -= this.actRoll * k;
      this.actLift -= this.actLift * k;
      this.actYaw -= this.actYaw * k;
      this.actSpin = 0;
    }
    // Landed from a tumble: it rights itself over a moment, the nearer way round.
    if (this.state !== 'thrown' && this.state !== 'held') {
      this.roll = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
      const k = Math.min(1, dt * 7);
      this.roll -= this.roll * k;
      if (this.state !== 'task') this.lean -= this.lean * k;
    }
    this.restoreLook();
    this.mixer.update(dt);
    this.place();
    this.aimHead(dt, time, ground.viewer);
    // Frightened, it trembles.
    const shake = this.feelings.tremble;
    if (shake > 0) {
      this.root.position.x += (Math.random() - 0.5) * 0.004 * shake;
      this.root.position.z += (Math.random() - 0.5) * 0.004 * shake;
    }
  }

  // ------------------------------------------------------------ Free life

  private live(dt: number, ground: BeastGround, hands: HandState[]): void {
    this.feel(dt, hands);
    if (this.oneShot > 0) return;
    // Tucked in: it dozes, head low, until the nap is over or it is stroked awake.
    if (this.sleepFor > 0) {
      this.sleepFor -= dt;
      this.zzzIn -= dt;
      if (this.zzzIn <= 0) {
        this.zzzIn = 1.4;
        this.fx.zzz(this.back(this.tmp2));
      }
      if (this.mood !== 'rest') this.sleepFor = 0;
      else {
        this.moodTime = 0;
        return;
      }
    }

    this.moodTime += dt;
    this.snortIn -= dt;
    if (this.snortIn <= 0) {
      this.snortIn = 7 + Math.random() * 9;
      if (this.mood !== 'graze') playSnort(0.03);
    }

    // A hand held still near the stage is interesting: walk over and sniff it.
    if (this.mood !== 'approach' && this.hoverTime > CURIOUS_AFTER && !this.petting) {
      this.goal.copy(this.hoverPoint);
      this.goal.y = ground.center.y;
      this.clampToStage(this.goal, ground);
      if (this.position.distanceTo(this.goal) > this.length * 0.7) this.setMood('approach', 6);
    }

    switch (this.mood) {
      case 'stroll':
      case 'approach': {
        const stop = this.mood === 'approach' ? this.length * 0.6 : 0.01;
        if (this.mood === 'approach') this.lookAt(this.hoverPoint, 1);
        if (this.walkTowards(this.goal, dt, stop) || this.moodTime > this.moodLength) {
          if (this.mood === 'approach') {
            this.playOnce('Idle_Headlow');
            playSnort(0.04);
            this.hoverTime = 0;
          }
          this.pickMood(ground);
        }
        break;
      }
      default:
        if (this.moodTime > this.moodLength) this.pickMood(ground);
    }
  }

  private setMood(mood: Mood, length: number): void {
    this.mood = mood;
    this.moodTime = 0;
    this.moodLength = length;
    if (mood === 'stand') this.play('Idle');
    else if (mood === 'graze') this.play('Eating');
    else if (mood === 'rest') this.play('Idle_Headlow');
    else if (mood === 'shift') this.play('Idle_2');
  }

  private pickMood(ground: BeastGround): void {
    const roll = Math.random();
    if (roll < 0.3) {
      // Wander somewhere free on the stage.
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * ground.radius * 0.55;
        this.goal.set(ground.center.x + Math.cos(angle) * r, ground.center.y, ground.center.z + Math.sin(angle) * r);
        const blocked = ground.blockers.some((b) => this.tmp.copy(this.goal).sub(b.center).setY(0).length() < b.radius + this.length * 0.4);
        if (!blocked && this.goal.distanceTo(this.position) > this.length * 0.5) break;
      }
      this.setMood('stroll', 8);
    } else if (roll < 0.5) {
      this.setMood('graze', 4 + Math.random() * 4);
    } else if (roll < 0.65) {
      this.setMood('rest', 4 + Math.random() * 3);
    } else if (roll < 0.8) {
      this.setMood('shift', 3 + Math.random() * 2);
    } else {
      this.setMood('stand', 3 + Math.random() * 3);
    }
  }

  /**
   * Touch: the body is a capsule from rump to chest plus a sphere at the
   * head. A fast fingertip is a poke, a slow one moving across the coat a
   * stroke, and a still hand nearby makes it curious.
   */
  private feel(dt: number, hands: HandState[]): void {
    const forward = this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const mid = this.height * 0.55;
    const half = this.length * 0.32;
    const radius = this.height * 0.2;
    const headAt = this.head ? this.head.getWorldPosition(this.headAt) : null;
    let stroking = false;
    let nearest = Infinity;

    hands.forEach((hand, h) => {
      let touch = false;
      let speed = 0;
      // A pinch on its back or head picks it up.
      if (hand.tracked && hand.pinchStarted && this.state === 'idle') {
        const rel = this.rel.copy(hand.pinch).sub(this.position);
        const along = Math.max(-half, Math.min(half, rel.dot(forward)));
        const d = Math.hypot(rel.x - forward.x * along, rel.y - mid, rel.z - forward.z * along);
        const toHead = headAt ? hand.pinch.distanceTo(headAt) : Infinity;
        if (d < radius + GRAB_SLACK || toHead < this.height * 0.14 + GRAB_SLACK) {
          this.pickUp(h);
          return;
        }
      }
      if (hand.tracked) {
        hand.tips.forEach((tip, i) => {
          // Distance from the fingertip to the body's spine segment.
          const rel = this.rel.copy(tip).sub(this.position);
          const along = Math.max(-half, Math.min(half, rel.dot(forward)));
          const d = Math.hypot(rel.x - forward.x * along, rel.y - mid, rel.z - forward.z * along);
          const toHead = headAt ? tip.distanceTo(headAt) : Infinity;
          nearest = Math.min(nearest, d, toHead);
          if (d < radius || toHead < this.height * 0.14) {
            touch = true;
            speed = Math.max(speed, hand.tipSpeeds[i]);
            this.contact.copy(tip);
          }
        });
        // A palm held near the stage is something to look at and sniff.
        if (hand.palm.distanceTo(this.position) < 0.35 && hand.palm.y - this.position.y < this.height * 1.6) {
          this.hoverPoint.copy(hand.palm);
        }
      }

      if (touch && !this.touching[h] && speed > POKE_SPEED) {
        this.jabbed[h] = true;
        this.poked(this.contact, forward);
      }
      if (!touch) this.jabbed[h] = false;
      if (touch && !this.jabbed[h] && speed < STROKE_SPEED) stroking = true;
      this.touching[h] = touch;
    });

    // Petting: a slow hand resting on the coat for a moment.
    this.strokeTime = stroking ? this.strokeTime + dt : Math.max(0, this.strokeTime - dt * 2);
    const wasPetting = this.petting;
    this.petting = this.strokeTime > 0.35;
    if (this.petting) {
      this.happiness = Math.min(1, this.happiness + dt * 0.4);
      this.feelings.stroke(dt);
      if (!wasPetting && this.oneShot <= 0) this.setMood('rest', 4);
      this.moodTime = 0;
    } else if (wasPetting) this.feelings.strokeEnd();

    // Hover: a hand close by but not touching, and fairly still.
    const handNear = nearest < 0.25 && nearest > radius;
    const still = hands.some((hand) => hand.tracked && hand.tipSpeeds[0] < 0.08);
    this.hoverTime = handNear && still ? this.hoverTime + dt : Math.max(0, this.hoverTime - dt);
    this.interest = nearest < 0.3 ? Math.min(1, this.interest + dt * 3) : Math.max(0, this.interest - dt);
    if (this.interest > 0.2 && this.hoverPoint.lengthSq() > 0) this.lookAt(this.hoverPoint, this.interest);
  }

  // ------------------------------------------------------------ Pick up and throw

  /** Lifted by the scruff: it calls out, legs paddling. */
  private pickUp(hand: number): void {
    this.holder = hand;
    this.setState('held');
    this.oneShot = 0;
    this.strokeTime = 0;
    this.petting = false;
    this.play('Gallop', true, 0.15, 0.55);
    this.feelings.lifted();
    this.happiness = Math.min(1, this.happiness + 0.2);
  }

  private carried(dt: number, hands: HandState[], ground: BeastGround): void {
    const hand = hands[this.holder];
    if (!hand || !hand.tracked || !hand.pinching) {
      // Let go: it flies with the hand's speed and tumbles.
      this.flight.copy(hand?.releaseVelocity ?? this.flight.set(0, 0, 0)).clampLength(0, 4);
      const speed = this.flight.length();
      this.rollSpeed = (Math.random() < 0.5 ? -1 : 1) * Math.min(9, speed * 3.5);
      this.bounces = 0;
      this.holder = -1;
      this.setState('thrown');
      this.play('Idle_HitReact_Right', true, 0.1, 0.7);
      if (speed > 1.2) playWhoosh(Math.min(1, speed / 4));
      this.feelings.released(speed);
      return;
    }
    // Hanging below the pinch, swinging with the hand; lowered onto the table, it stands on it, not in it.
    this.position.copy(hand.hold).addScaledVector(UP, -this.height * 0.75);
    if (this.onTable(this.position, ground) && this.position.y < ground.center.y) this.position.y = ground.center.y;
    const swing = Math.max(-0.6, Math.min(0.6, hand.pinchVelocity.x * 0.35));
    this.roll += (swing - this.roll) * Math.min(1, dt * 8);
    this.lean = Math.max(-0.4, Math.min(0.4, -hand.pinchVelocity.y * 0.2));
    if (Math.random() < dt * 0.25) this.call(0.5);
  }

  /** Gravity and a tumble; it lands on the table's earth or the floor, shakes it off, and comes back. */
  private tumble(dt: number, ground: BeastGround): void {
    this.flight.y -= GRAVITY * dt;
    this.flight.multiplyScalar(1 - 0.1 * dt);
    this.position.addScaledVector(this.flight, dt);
    this.roll += this.rollSpeed * dt;
    this.yaw += this.rollSpeed * 0.15 * dt;
    // A pet stays on its table: thrown at the edge, it bumps back in (no falling to the floor and through it).
    if (ground.keepOn && ground.keepOn(this.position)) {
      this.flight.x *= -0.3;
      this.flight.z *= -0.3;
    }
    const overTable = this.onTable(this.position, ground);
    const surface = overTable && this.position.y > ground.center.y - 0.06 ? ground.center.y : FLOOR_Y;
    if (this.position.y > surface && this.stateTime < 6) return;
    this.position.y = surface;
    const impact = -this.flight.y;
    if (this.bounces === 0) this.feelings.landed(impact);
    if (impact > 1 && this.bounces < 2) {
      // A bounce: a thump, a puff of dust.
      this.bounces++;
      this.flight.y = impact * 0.3;
      this.flight.x *= 0.5;
      this.flight.z *= 0.5;
      this.rollSpeed *= 0.4;
      playHoof(Math.min(0.12, 0.04 + impact * 0.02));
      this.fx.burst(this.position, 8, 0.15);
      return;
    }
    // Down: back on its feet with a shake and a call.
    this.roll = 0;
    this.lean = 0;
    this.flight.set(0, 0, 0);
    playHoof(0.06);
    this.fx.burst(this.position, 6, 0.12);
    if (this.feelings.fear < 0.3) this.call(0.6);
    if (surface === ground.center.y) {
      this.setState('idle');
      this.playOnce(Math.random() < 0.5 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right');
      return;
    }
    // Missed the table: it leaps back up onto it.
    this.leapFrom.copy(this.position);
    this.leapTo.copy(this.position);
    this.clampToStage(this.leapTo, ground);
    this.tmp2.copy(this.leapTo).sub(ground.center).setY(0).multiplyScalar(0.6);
    this.leapTo.set(ground.center.x + this.tmp2.x, ground.center.y, ground.center.z + this.tmp2.z);
    this.leapTime = 1.4;
    this.afterLeap = 'idle';
    this.yaw = Math.atan2(this.leapTo.x - this.position.x, this.leapTo.z - this.position.z);
    this.play('Gallop_Jump', false, 0.1, this.clipLength('Gallop_Jump', 0.9) / this.leapTime);
    this.setState('leaping');
  }

  private onTable(p: Vector3, ground: BeastGround): boolean {
    return ground.table ? ground.table(p) : this.tmp.copy(p).sub(ground.center).setY(0).length() < ground.radius;
  }

  private poked(at: Vector3, forward: Vector3): void {
    this.feelings.poke();
    const now = performance.now() / 1000;
    this.pokes = this.pokes.filter((t) => now - t < PATIENCE_TIME);
    this.pokes.push(now);
    // Which side was poked: positive is the beast's left.
    const side = this.rel.copy(at).sub(this.position).cross(forward).y;
    if (this.pokes.length >= PATIENCE) {
      this.pokes = [];
      this.playOnce(this.spec.temper);
      playSnort(0.08);
      window.setTimeout(() => playHoof(0.08), 350);
      this.fx.burst(this.position, 10, 0.18);
      this.happiness = 0;
    } else {
      this.playOnce(side > 0 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right');
      playSnort(0.05);
    }
    this.lookAt(at, 1);
  }

  // ---------------------------------------------------------------- Tasks

  private runTask(dt: number): void {
    const step = this.task[0];
    if (!step) {
      this.setState('idle');
      this.setMood('stand', 2);
      const done = this.taskDone;
      this.taskDone = null;
      done?.();
      return;
    }
    if (!this.taskStarted) {
      this.taskStarted = true;
      this.taskTime = 0;
      this.taskLooking = false;
      if (step.do === 'leap') {
        this.leapFrom.copy(this.position);
        this.leapTo.copy(step.to);
        this.faceTowards(step.to, 1);
        this.play('Gallop_Jump', false, 0.15, this.clipLength('Gallop_Jump', 0.9) / step.time);
      } else if (step.do === 'act') {
        if (step.clip) this.play(step.clip, !step.once, 0.25, step.rate ?? 1);
        step.sound?.();
      } else if (step.do === 'pose') {
        const clip = POSE_CLIPS[step.pose];
        this.play(clip, clip !== 'Gallop_Jump' && !clip.includes('HitReact') && !clip.startsWith('Attack'));
        if (step.look) {
          this.taskLook.copy(step.look);
          this.taskLooking = true;
        }
        if (step.pose === 'cheer') this.call();
        if (step.pose === 'bonk') playSnort(0.06);
      }
    }
    this.taskTime += dt;

    switch (step.do) {
      case 'call':
        step.run();
        this.nextStep();
        break;
      case 'walk':
        if (this.walkTowards(step.to, dt, 0.004, step.rush ?? 1)) this.nextStep();
        break;
      case 'leap': {
        const k = Math.min(1, this.taskTime / step.time);
        this.position.lerpVectors(this.leapFrom, this.leapTo, k);
        this.position.y += Math.sin(k * Math.PI) * step.height;
        if (k >= 1) {
          playHoof(0.05);
          this.nextStep();
        }
        break;
      }
      case 'pose':
        if (this.taskLooking) {
          this.faceTowards(this.taskLook, Math.min(1, dt * 4));
          this.lookAt(this.taskLook, 1);
        }
        if (this.taskTime >= step.time) this.nextStep();
        break;
      case 'harness':
        if (!this.pull(step.rig, dt)) this.nextStep();
        break;
      case 'act':
        this.act(step, dt);
        break;
    }
  }

  /** Harnessed to a machine: it leads us round; we walk, or dig in and strain. */
  private pull(rig: Harness, dt: number): boolean {
    const pose = this.harnessPose;
    const going = rig.drive(dt, this.size, pose);
    this.lean += ((going ? pose.strain * 0.11 : 0) - this.lean) * Math.min(1, dt * 5);
    if (!going) {
      this.play('Idle');
      return false;
    }
    this.position.copy(pose.position);
    this.yaw = pose.yaw;
    // The clip's natural pace at this size; the stride rate follows the ground speed.
    const pace = this.spec.height * Math.sqrt(this.size) * this.spec.walk;
    let rate = pose.speed / pace;
    // Digging in against a load that will not move: hooves scrabble on the spot.
    if (pose.strain > 0.6 && rate < 0.3) rate = 0.55 + 0.25 * Math.sin(this.taskTime * 9);
    if (rate > 0.05) {
      this.play('Walk', true, 0.3, rate / Math.sqrt(this.size));
      this.clopIn -= dt * rate;
      if (this.clopIn <= 0) {
        this.clopIn = 0.3;
        playHoof(0.012 + pose.strain * 0.01);
        if (pose.strain > 0.6) this.fx.burst(this.position, 2, 0.05);
      }
    } else {
      this.play('Idle');
    }
    if (pose.strain > 0.8 && Math.random() < dt * 0.7) playSnort(0.05);
    return true;
  }

  private nextStep(): void {
    this.task.shift();
    this.taskStarted = false;
  }

  // ------------------------------------------------------------- Movement

  /** Walk (or gallop when far) towards a point; true once there. */
  private walkTowards(goal: Vector3, dt: number, stop: number, rush = 1): boolean {
    const dx = goal.x - this.position.x;
    const dz = goal.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= stop) {
      this.play('Idle');
      return true;
    }
    const gallop = distance > this.length * (rush > 1 ? 0.9 : 2.2);
    const speed = this.spec.height * Math.sqrt(this.size) * (gallop ? this.spec.gallop : this.spec.walk) * rush;
    this.play(gallop ? 'Gallop' : 'Walk', true, 0.3, Math.sqrt(rush) / Math.sqrt(this.size));
    // Turn first, then go: a sharp turn slows the stride.
    const turn = this.faceTowards(goal, Math.min(1, dt * 3.5 * rush));
    const pace = speed * Math.max(0.2, Math.cos(Math.min(Math.PI / 2, Math.abs(turn))));
    const move = Math.min(distance - stop * 0.5, pace * dt);
    this.position.x += Math.sin(this.yaw) * move;
    this.position.z += Math.cos(this.yaw) * move;

    this.clopIn -= dt;
    if (this.clopIn <= 0) {
      this.clopIn = gallop ? 0.11 : 0.3;
      playHoof(gallop ? 0.025 : 0.015);
    }
    return false;
  }

  /** Turn part way towards a point; returns the remaining angle. */
  private faceTowards(target: Vector3, k: number): number {
    const want = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    let delta = want - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * k;
    return delta * (1 - k);
  }

  private clampToStage(point: Vector3, ground: BeastGround): void {
    const limit = ground.radius - this.length * 0.5;
    this.tmp2.copy(point).sub(ground.center).setY(0);
    if (this.tmp2.length() > limit) this.tmp2.setLength(limit);
    point.set(ground.center.x + this.tmp2.x, ground.center.y, ground.center.z + this.tmp2.z);
  }

  private place(): void {
    this.root.position.copy(this.position);
    this.root.position.y += this.actLift * this.height;
    this.root.rotation.set(this.lean + this.actPitch, this.yaw + this.actYaw + this.actSpin, this.roll + this.actRoll, 'YXZ');
    // Rolled, rearing, lying down or sitting: the body turns about its hooves, so lift it until
    // nothing is under the table's top (its back when rolled over, its flank when lying on its side).
    const grounded = this.state === 'idle' || this.state === 'task' || this.state === 'thrown' || this.state === 'leaping';
    if (!grounded || this.position.y < this.surface - 0.05) return;
    const lowest = this.lowestPoint();
    if (lowest < this.surface) this.root.position.y += this.surface - lowest;
  }

  /** World height of the body's lowest point: its hooves (the box's bottom corners) or its rounded body. */
  private lowestPoint(): number {
    const q = this.root.quaternion;
    const h = this.height;
    const halfW = this.width * 0.4;
    const halfL = this.length * 0.4;
    let lowest = Infinity;
    for (let c = 0; c < 4; c++) {
      const y = this.tmp.set((c & 1 ? 1 : -1) * halfW, 0, (c & 2 ? 1 : -1) * halfL).applyQuaternion(q).y;
      if (y < lowest) lowest = y;
    }
    // The body as an ellipsoid about its middle: how far it reaches straight down.
    const centreY = this.tmp.set(0, h * 0.5, 0).applyQuaternion(q).y;
    const down = this.tmp2.set(0, -1, 0).applyQuaternion(this.quat.copy(q).invert());
    const reach = Math.hypot(down.x * this.width * 0.45, down.y * h * 0.5, down.z * this.length * 0.45);
    lowest = Math.min(lowest, centreY - reach);
    return this.root.position.y + lowest;
  }

  /** A clip's length in seconds (or a fallback when the model has none). */
  private clipLength(name: string, fallback: number): number {
    return this.action(name)?.getClip().duration ?? fallback;
  }

  /** Whether the model has a clip of its own for this (a trick may pose its way round a missing one). */
  hasClip(name: string): boolean {
    return !!(this.spec.clips?.[name] ? this.actions.get(this.spec.clips[name]) : this.actions.get(name));
  }

  /** A trick's step, frame by frame: the clip plays, the body leans, rolls, spins and bounces. */
  private act(step: ActStep, dt: number): void {
    const t = this.taskTime;
    const k = Math.min(1, t / step.time);
    // In over the first 0.3 s, out over the last 0.3 s.
    const ease = Math.max(0, Math.min(1, t / 0.3, (step.time - t) / 0.3));
    const smooth = ease * ease * (3 - 2 * ease);
    const beat = (step.beat ?? 3) * Math.PI * 2 * t;
    this.actPitch = (step.pitch ?? 0) * smooth + (step.nod ?? 0) * Math.sin(beat) * smooth;
    this.actRoll = (step.roll ?? 0) * (Math.abs(step.roll ?? 0) > 3 ? k : smooth) + (step.sway ?? 0) * Math.sin(beat) * smooth;
    this.actLift = (step.lift ?? 0) * smooth + (step.hop ?? 0) * Math.abs(Math.sin(beat)) * smooth;
    this.actYaw = (step.shake ?? 0) * Math.sin(beat) * smooth;
    this.actSpin = (step.spin ?? 0) * Math.PI * 2 * (k * k * (3 - 2 * k));
    if (step.face && t < 0.4) this.faceTowards(step.face, Math.min(1, dt * 6));
    if (t >= step.time) {
      // A full spin ends facing the same way: fold it into the heading so nothing jumps.
      this.actPitch = this.actRoll = this.actLift = this.actYaw = 0;
      this.actSpin = 0;
      this.nextStep();
    }
  }

  // ------------------------------------------------------------ Animation

  private action(name: string): AnimationAction | undefined {
    const own = this.spec.clips?.[name];
    if (own) {
      const mapped = this.actions.get(own);
      if (mapped) return mapped;
    }
    const direct = this.actions.get(name);
    if (direct) return direct;
    for (const alias of CLIP_ALIASES[name] ?? []) {
      const found = this.actions.get(alias);
      if (found) return found;
    }
    return undefined;
  }

  private play(name: string, loop = true, fade = 0.3, speed = 1): void {
    const action = this.action(name);
    if (!action) return;
    action.timeScale = speed;
    if (action === this.current && loop) return;
    action.reset();
    action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    if (this.current && this.current !== action) this.current.crossFadeTo(action, fade, false);
    this.current = action;
  }

  /** A one-shot clip that pauses free movement, then eases back to standing. */
  private playOnce(name: string, speed = 1): void {
    const action = this.action(name);
    if (!action) return;
    this.play(name, false, 0.12, speed);
    this.oneShot = action.getClip().duration / speed;
    this.mood = 'stand';
    this.moodTime = 0;
    this.moodLength = 2 + Math.random() * 2;
  }

  private setState(state: BeastState): void {
    this.state = state;
    this.stateTime = 0;
  }

  /** Point the head (and part of the neck) at something this frame. */
  private lookAt(point: Vector3, weight: number): void {
    this.lookTarget.copy(point);
    this.lookWeight = Math.max(this.lookWeight, weight);
  }

  private restoreLook(): void {
    // Clips that don't key the head would otherwise accumulate the offset.
    if (this.head) this.head.quaternion.copy(this.headRest);
    if (this.neck) this.neck.quaternion.copy(this.neckRest);
  }

  /** Layered on top of the clip: the head turns to what it is looking at. */
  private aimHead(dt: number, time: number, viewer: Vector3): void {
    if (!this.head) return;
    this.headRest.copy(this.head.quaternion);
    if (this.neck) this.neckRest.copy(this.neck.quaternion);

    // Glance at the player now and then when nothing else is going on.
    if (this.lookWeight === 0 && this.state === 'idle' && (this.mood === 'stand' || this.mood === 'shift')) {
      const glance = Math.sin(time * 0.37) > 0.3 ? 0.8 : 0;
      if (glance > 0) this.lookAt(viewer, glance);
    }

    let yaw = 0;
    let pitch = 0;
    if (this.lookWeight > 0) {
      this.root.updateMatrixWorld(true);
      const headAt = this.head.getWorldPosition(this.tmp2);
      const dx = this.lookTarget.x - headAt.x;
      const dz = this.lookTarget.z - headAt.z;
      yaw = Math.atan2(dx, dz) - this.yaw;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      // Behind it: don't twist the neck all the way round.
      yaw = Math.max(-1.0, Math.min(1.0, yaw)) * (Math.abs(yaw) > 2.2 ? 0 : this.lookWeight);
      pitch = Math.max(-0.5, Math.min(0.45, Math.atan2(this.lookTarget.y - headAt.y, Math.hypot(dx, dz)))) * this.lookWeight;
    }
    const ease = Math.min(1, dt * 5);
    this.lookYaw += (yaw - this.lookYaw) * ease;
    this.lookPitch += (pitch - this.lookPitch) * ease;
    this.lookWeight = 0;
    if (Math.abs(this.lookYaw) < 1e-3 && Math.abs(this.lookPitch) < 1e-3) return;

    this.root.updateMatrixWorld(true);
    const right = this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.neck) this.turnBone(this.neck, UP, this.lookYaw * 0.5);
    this.turnBone(this.head, UP, this.lookYaw * (this.neck ? 0.5 : 1));
    this.turnBone(this.head, right, -this.lookPitch);
  }

  /** Rotate a bone about a world-space axis, on top of its animated pose. */
  private turnBone(bone: Object3D, axis: Vector3, angle: number): void {
    if (!bone.parent) return;
    bone.parent.getWorldQuaternion(this.quat).invert();
    const local = this.tmp2.copy(axis).applyQuaternion(this.quat);
    bone.quaternion.premultiply(this.quat2.setFromAxisAngle(local, angle));
    bone.updateMatrixWorld(true);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const { material } of this.tints) material.dispose();
    this.root.removeFromParent();
  }
}
