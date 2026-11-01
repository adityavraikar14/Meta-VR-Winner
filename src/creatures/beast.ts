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
import { playHoof, playNicker, playSnort } from '../audio.js';
import type { Ground, Harness, HarnessPose, TaskPose, TaskStep } from './creature.js';
import type { Effects } from './fx.js';
import type { HandState } from './hand-input.js';

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
      Eating: 'Fox_Sit2_Idle', Idle_2: 'Fox_Sit_Idle_Break', Idle_Headlow: 'Fox_Sit_Yes', Idle_2_HeadLow: 'Fox_Sit_Yes',
      Idle_HitReact_Left: 'Fox_Falling_Left', Idle_HitReact_Right: 'Fox_Falling', Attack: 'Fox_Attack_Paws', Attack_Headbutt: 'Fox_Attack_Paws', Attack_Kick: 'Fox_Attack_Tail',
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

type BeastState = 'emerging' | 'leaping' | 'idle' | 'task';
type BeastGround = Pick<Ground, 'center' | 'radius' | 'viewer' | 'blockers'>;
type Mood = 'stand' | 'graze' | 'rest' | 'shift' | 'stroll' | 'approach';

const EMERGE_TIME = 0.9;
const LEAP_TIME = 0.9;
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

  private task: TaskStep[] = [];
  private taskTime = 0;
  private taskStarted = false;
  private taskDone: (() => void) | null = null;
  private taskLook = new Vector3();
  private taskLooking = false;
  private readonly harnessPose: HarnessPose = { position: new Vector3(), yaw: 0, speed: 0, strain: 0 };
  /** Forward lean into the collar, radians. */
  private lean = 0;

  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private forward = new Vector3();
  private rel = new Vector3();
  private contact = new Vector3();
  private headAt = new Vector3();
  private quat = new Quaternion();
  private quat2 = new Quaternion();

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
    this.play('Gallop_Jump', false, 0.15, 1.1);
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

  /** A celebration: a happy buck on the spot and a call. */
  cheer(): void {
    if (this.state !== 'idle') return;
    this.happiness = 1;
    this.playOnce('Gallop_Jump', 1.1);
    playNicker(this.spec.voice);
  }

  update(dt: number, time: number, ground: BeastGround, hands: HandState[]): void {
    this.stateTime += dt;
    if (this.oneShot > 0) {
      this.oneShot -= dt;
      // The one-shot is over: settle back into the current mood's loop.
      if (this.oneShot <= 0 && this.state === 'idle') this.setMood(this.mood, this.moodLength - this.moodTime);
    }
    this.happiness = Math.max(0, this.happiness - dt * 0.05);

    switch (this.state) {
      case 'emerging': {
        const k = Math.min(1, this.stateTime / EMERGE_TIME);
        this.setTint(k * k);
        this.root.scale.setScalar(0.8 + 0.2 * k);
        if (k >= 1) this.state = 'idle';
        break;
      }
      case 'leaping': {
        const k = Math.min(1, this.stateTime / LEAP_TIME);
        this.position.lerpVectors(this.leapFrom, this.leapTo, k);
        this.position.y += Math.sin(k * Math.PI) * this.height * 0.9;
        this.setTint(1);
        this.root.scale.setScalar(1);
        if (k >= 1) {
          playHoof(0.06);
          this.fx.burst(this.position, 6, 0.12);
          const next = this.afterLeap;
          this.setState(next);
          this.afterLeap = 'idle';
          if (next === 'idle') this.playOnce('Jump_toIdle');
        }
        break;
      }
      case 'task':
        this.runTask(dt);
        break;
      case 'idle':
        this.live(dt, ground, hands);
        break;
    }

    this.restoreLook();
    this.mixer.update(dt);
    this.place();
    this.aimHead(dt, time, ground.viewer);
  }

  // ------------------------------------------------------------ Free life

  private live(dt: number, ground: BeastGround, hands: HandState[]): void {
    this.feel(dt, hands);
    if (this.oneShot > 0) return;

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
      if (!wasPetting && this.oneShot <= 0) {
        this.setMood('rest', 4);
        playNicker(this.spec.voice, 0.6);
      }
      this.moodTime = 0;
    }

    // Hover: a hand close by but not touching, and fairly still.
    const handNear = nearest < 0.25 && nearest > radius;
    const still = hands.some((hand) => hand.tracked && hand.tipSpeeds[0] < 0.08);
    this.hoverTime = handNear && still ? this.hoverTime + dt : Math.max(0, this.hoverTime - dt);
    this.interest = nearest < 0.3 ? Math.min(1, this.interest + dt * 3) : Math.max(0, this.interest - dt);
    if (this.interest > 0.2 && this.hoverPoint.lengthSq() > 0) this.lookAt(this.hoverPoint, this.interest);
  }

  private poked(at: Vector3, forward: Vector3): void {
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
        this.play('Gallop_Jump', false, 0.15, 0.9 / step.time);
      } else if (step.do === 'pose') {
        const clip = POSE_CLIPS[step.pose];
        this.play(clip, clip !== 'Gallop_Jump' && !clip.includes('HitReact') && !clip.startsWith('Attack'));
        if (step.look) {
          this.taskLook.copy(step.look);
          this.taskLooking = true;
        }
        if (step.pose === 'cheer') playNicker(this.spec.voice);
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
        if (this.walkTowards(step.to, dt, 0.004)) this.nextStep();
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
  private walkTowards(goal: Vector3, dt: number, stop: number): boolean {
    const dx = goal.x - this.position.x;
    const dz = goal.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= stop) {
      this.play('Idle');
      return true;
    }
    const gallop = distance > this.length * 2.2;
    const speed = this.spec.height * Math.sqrt(this.size) * (gallop ? this.spec.gallop : this.spec.walk);
    this.play(gallop ? 'Gallop' : 'Walk', true, 0.3, 1 / Math.sqrt(this.size));
    // Turn first, then go: a sharp turn slows the stride.
    const turn = this.faceTowards(goal, Math.min(1, dt * 3.5));
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
    this.root.rotation.set(this.lean, this.yaw, 0, 'YXZ');
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
