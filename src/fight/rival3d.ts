import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RivalMove, RivalSpec } from './rivals.js';
import { cry } from '../voices.js';

/**
 * A duel rival in 3D: any of the roster's rigged, animated models. They walk
 * out onto the hill in front of the screen and stand between you and it,
 * always turning to face you. Throws let go at the moment the throwing hand
 * moves fastest (found by sampling the clip), so ink leaves the hand where
 * you see it. Struck, they stagger and flash; a dodge rolls them to a new
 * spot; beaten, they fall and melt back into ink. The lantern behind you
 * throws their real shadow onto the screen.
 */

/** The colour skin flares to when struck. */
const STRUCK = new Color(2.2, 1.1, 2.4);
/** Moves that loop; the rest play once and return to idle (death stays down). */
const LOOPING = new Set<RivalMove>(['idle', 'walk', 'run']);
const MOVES: RivalMove[] = ['idle', 'walk', 'run', 'throw', 'attack', 'skill', 'dodge', 'hit', 'death', 'taunt'];
/** Moves whose release (a hand letting go) the duel listens for. */
const THROWS: RivalMove[] = ['throw', 'attack', 'skill'];

interface Loaded {
  promise: Promise<void>;
  gltf?: GLTF;
  state: string;
}

const models = new Map<string, Loaded>();

/** Starts loading a rival's model (once); resolves when it is ready or has failed. */
export function preloadRival(spec: RivalSpec): Promise<void> {
  let entry = models.get(spec.url);
  if (!entry) {
    const fresh: Loaded = { state: 'waiting', promise: Promise.resolve() };
    fresh.promise = load(spec.url, fresh);
    models.set(spec.url, fresh);
    entry = fresh;
  }
  return entry.promise;
}

/** For dev info: how a rival's model is getting on. */
export function rivalLoadState(spec: RivalSpec): string {
  return models.get(spec.url)?.state ?? 'not asked';
}

async function load(url: string, entry: Loaded): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    entry.state = `loading (try ${attempt + 1})`;
    try {
      entry.gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${url}`);
      entry.state = 'ready';
      return;
    } catch (error) {
      entry.state = `failed (try ${attempt + 1})`;
      console.warn(`Could not load ${url} (try ${attempt + 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
}

interface Release {
  /** Seconds into the clip when the hand lets go. */
  time: number;
  hand: Object3D;
}

export class Rival3D {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = {} as Record<RivalMove, AnimationAction | null>;
  private readonly releases: Partial<Record<RivalMove, Release>> = {};
  private readonly head: Object3D | null;
  private readonly chest: Object3D | null;
  private readonly materials: Array<{ material: MeshStandardMaterial; color: Color }> = [];
  private readonly ward: Mesh | null = null;
  private readonly wardMaterial: MeshBasicMaterial | null = null;
  private move: RivalMove = 'idle';
  private time = 0;
  private hurt = 0;
  /** A roll to a new spot: from, to, and how far along (0 → 1). */
  private readonly slideFrom = new Vector3();
  private readonly slideTo = new Vector3();
  private slideTime = 1;
  private slideSeconds = 0.8;
  /** A walk moves at a steady pace (feet on the ground); a dodge eases in and out. */
  private slideSteady = false;
  /** Set on the frame a throwing hand lets go; read and cleared by the duel. */
  released: Object3D | null = null;
  /** Which move let go (the duel decides what it sends). */
  releasedBy: RivalMove | null = null;
  /** 0 → 1 as they melt away, beaten. */
  melt = 0;
  /** Seconds of freeze on a big hit (hit-stop). */
  freeze = 0;

  /** Null until the model has loaded. */
  static create(spec: RivalSpec): Rival3D | null {
    const gltf = models.get(spec.url)?.gltf;
    return gltf ? new Rival3D(spec, cloneRig(gltf.scene), gltf.animations) : null;
  }

  private constructor(
    readonly spec: RivalSpec,
    model: Object3D,
    clips: AnimationClip[],
  ) {
    this.root.name = 'Rival3D';
    this.body.add(model);
    this.root.add(this.body);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => this.own(m as MeshStandardMaterial));
      } else {
        mesh.material = this.own(mesh.material as MeshStandardMaterial);
      }
    });
    this.mixer = new AnimationMixer(model);
    const clipFor = (words: string[]): AnimationClip | null => {
      for (const word of words) {
        const clip = clips.find((c) => c.name.split('|').includes(word));
        if (clip) return clip;
      }
      return null;
    };
    for (const move of MOVES) {
      const clip = clipFor(spec.clips[move]);
      this.actions[move] = clip ? this.mixer.clipAction(clip) : null;
    }
    // Every rival has an idle; fall back to the first clip if the words miss.
    this.actions.idle ??= this.mixer.clipAction(clips[0]);
    const find = (names: string[]) => {
      for (const name of names) {
        const bone = model.getObjectByName(name);
        if (bone) return bone;
      }
      return null;
    };
    this.head = find(spec.head);
    this.chest = find(spec.chest);
    const hands = spec.hands.map(find).filter((h): h is Object3D => h !== null);
    for (const move of THROWS) {
      const action = this.actions[move];
      if (!action) continue;
      const at = spec.releaseAt?.[move];
      this.releases[move] = at !== undefined
        ? { time: action.getClip().duration * at, hand: hands[0] ?? this.body }
        : this.findRelease(action, hands);
    }

    // Size them standing in their idle pose.
    this.actions.idle.setLoop(LoopRepeat, Infinity).play();
    this.mixer.update(0);
    fitHeight(model, spec.height);
    this.mixer.addEventListener('finished', (e) => {
      if ((e.action as AnimationAction) !== this.actions.death) this.play('idle');
    });

    if (spec.ability === 'ward') {
      // A turning circle of green runes, held out in front.
      this.wardMaterial = new MeshBasicMaterial({ map: runeCircle(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      this.ward = new Mesh(new CircleGeometry(WARD_RADIUS, 48), this.wardMaterial);
      this.ward.position.set(0, spec.height * 0.6, 0.12);
      this.ward.renderOrder = 7;
      this.ward.visible = false;
      this.root.add(this.ward);
    }
  }

  private own(source: MeshStandardMaterial): MeshStandardMaterial {
    const material = source.clone();
    this.materials.push({ material, color: material.color.clone() });
    return material;
  }

  /**
   * When does a throw let go, and from which hand? Sample the clip and take
   * the moment a hand moves fastest: that is when the ink leaves it.
   */
  private findRelease(action: AnimationAction, hands: Object3D[]): Release {
    const clip = action.getClip();
    let best: Release = { time: clip.duration * 0.5, hand: hands[0] ?? this.body };
    if (hands.length === 0) return best;
    let fastest = 0;
    const last = hands.map(() => new Vector3());
    const p = new Vector3();
    action.setLoop(LoopRepeat, Infinity).play();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      action.time = (i / steps) * clip.duration * 0.999;
      this.mixer.update(0);
      this.body.updateMatrixWorld(true);
      hands.forEach((hand, k) => {
        hand.getWorldPosition(p);
        const speed = p.distanceTo(last[k]);
        if (i > 1 && speed > fastest) {
          fastest = speed;
          best = { time: action.time, hand };
        }
        last[k].copy(p);
      });
    }
    action.stop();
    return best;
  }

  get moving(): RivalMove {
    return this.move;
  }

  /** Busy with a throw, a dodge or a special. */
  get busy(): boolean {
    return !LOOPING.has(this.move) || this.slideTime < 1;
  }

  has(move: RivalMove): boolean {
    return this.actions[move] !== null;
  }

  /** How far through the current move, 0 → 1. */
  get progress(): number {
    const action = this.actions[this.move];
    return action ? action.time / action.getClip().duration : 0;
  }

  /** Seconds the move takes (0 if this rival has no clip for it). */
  duration(move: RivalMove): number {
    return this.actions[move]?.getClip().duration ?? 0;
  }

  play(move: RivalMove): void {
    if (move === this.move && LOOPING.has(move)) return;
    const next = this.actions[move];
    if (!next) return;
    const prev = this.actions[this.move];
    next.reset();
    next.setLoop(LOOPING.has(move) ? LoopRepeat : LoopOnce, Infinity);
    next.clampWhenFinished = move === 'death';
    next.fadeIn(0.15).play();
    if (prev && prev !== next) prev.fadeOut(0.15);
    this.move = move;
    this.voice(move);
  }

  /** Their own voice: a shout as they strike (now and then), a cry as they fall. Morwen laughs instead of shouting. */
  private voice(move: RivalMove): void {
    const id = this.spec.id;
    if (move === 'death') cry(id, 'fall');
    else if (id === 'morwen') return;
    else if (move === 'skill' && Math.random() < 0.7) cry(id, 'shout', 1.1);
    else if ((move === 'throw' || move === 'attack') && Math.random() < 0.35) cry(id, 'shout');
    else if (move === 'taunt') cry(id, 'taunt');
  }

  /** Roll (or step) to a new spot over `seconds`, in the parent's space. */
  slide(to: Vector3, seconds: number): void {
    this.slideFrom.copy(this.root.position);
    this.slideTo.copy(to);
    this.slideTime = 0;
    this.slideSeconds = Math.max(0.2, seconds);
    this.slideSteady = false;
  }

  /**
   * Walk (or run, when faster than a walk) to a spot at `speed` m/s. The
   * clip plays at the rate that matches the ground speed, so the feet do
   * not glide: a stride covers about 0.75 of the body's height per second
   * of walk clip, 1.6 of it per second of run clip. Returns the seconds.
   */
  walkTo(to: Vector3, speed: number): number {
    const distance = this.root.position.distanceTo(to);
    const seconds = Math.max(0.3, distance / Math.max(0.05, speed));
    const h = this.spec.height;
    const run = this.has('run') && speed > h * 1.1;
    const move: RivalMove = run ? 'run' : 'walk';
    this.play(move);
    const action = this.actions[move];
    if (action) action.timeScale = Math.min(1.8, Math.max(0.6, speed / (h * (run ? 1.6 : 0.75))));
    this.slideFrom.copy(this.root.position);
    this.slideTo.copy(to);
    this.slideTime = 0;
    this.slideSeconds = seconds;
    this.slideSteady = true;
    return seconds;
  }

  get sliding(): boolean {
    return this.slideTime < 1;
  }

  /** The ward is up (in the middle of casting it). */
  get warded(): boolean {
    if (!this.ward || this.move !== 'skill') return false;
    const t = this.progress;
    return t > 0.15 && t < 0.92;
  }

  /** Ducked down (Rook): head-high throws pass over. */
  get ducking(): boolean {
    if (this.move !== 'dodge' || this.spec.ability !== 'duck') return false;
    const t = this.progress;
    return t > 0.1 && t < 0.85;
  }

  /** Mid-slash with the blade (Sable): ink that arrives now is sent back. */
  get parrying(): boolean {
    if (this.move !== 'skill' || this.spec.ability !== 'parry') return false;
    const t = this.progress;
    return t > 0.12 && t < 0.7;
  }

  /** Points in the root's parent space. */
  headAt(out: Vector3): Vector3 {
    return this.point(this.head, out, 0.9);
  }

  chestAt(out: Vector3): Vector3 {
    return this.point(this.chest, out, 0.62);
  }

  wardAt(out: Vector3): Vector3 {
    if (!this.ward) return this.chestAt(out);
    this.root.updateMatrixWorld(true);
    this.ward.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  handAt(hand: Object3D, out: Vector3): Vector3 {
    return this.point(hand, out, 0.6);
  }

  private point(bone: Object3D | null, out: Vector3, fallback: number): Vector3 {
    this.root.updateMatrixWorld(true);
    if (!bone) return out.copy(this.root.position).setY(this.root.position.y + this.spec.height * fallback);
    bone.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  /**
   * Distance from a point (parent space) to the body: a capsule from the
   * shins to just above the head bone, so a duck really lowers the target.
   */
  distanceTo(p: Vector3, scratch: Vector3): number {
    const r = this.root.position;
    const top = Math.max(r.y + this.spec.height * 0.35, this.headAt(scratch).y + 0.03);
    const y = Math.min(top, Math.max(r.y + this.spec.height * 0.12, p.y));
    return scratch.set(r.x, y, r.z).distanceTo(p);
  }

  wardRadius(): number {
    return WARD_RADIUS;
  }

  /** Struck: they flinch and cry out, louder and longer for a big blow. */
  flinch(big = false): void {
    this.hurt = 0.6;
    cry(this.spec.id, big ? 'big' : 'hurt');
    // A clear reaction if they were only standing there.
    if (!this.busy && this.has('hit')) this.play('hit');
  }

  /** Off the stage for good: their own materials go with them (the model's geometry is shared). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    for (const { material } of this.materials) material.dispose();
    this.wardMaterial?.dispose();
    this.ward?.geometry.dispose();
  }

  /** `face` is where to turn towards (the player's head), in the parent's space. */
  update(dt: number, face: Vector3 | null): void {
    // Hit-stop: a few frames frozen on a big hit, so it lands with weight.
    if (this.freeze > 0) {
      this.freeze -= dt;
      dt *= 0.05;
    }
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    const h = this.hurt / 0.6;
    const action = this.actions[this.move];
    const before = action?.time ?? 0;
    this.mixer.update(dt);
    const release = this.releases[this.move];
    if (release && action && before < release.time && action.time >= release.time) {
      this.released = release.hand;
      this.releasedBy = this.move;
    }

    let want: number | null = null;
    if (this.slideTime < 1) {
      this.slideTime = Math.min(1, this.slideTime + dt / this.slideSeconds);
      const s = this.slideTime;
      // A walk keeps a steady pace, easing only in its first and last tenth; a dodge eases throughout.
      const k = this.slideSteady ? steady(s) : s * s * (3 - 2 * s);
      this.root.position.lerpVectors(this.slideFrom, this.slideTo, k);
      // Face the way they are going.
      if (this.move === 'dodge' || this.move === 'walk' || this.move === 'run') {
        want = Math.atan2(this.slideTo.x - this.slideFrom.x, this.slideTo.z - this.slideFrom.z);
      }
      if (this.slideTime >= 1 && (this.move === 'walk' || this.move === 'run')) {
        const action = this.actions[this.move];
        if (action) action.timeScale = 1;
        this.play('idle');
      }
    }
    if (want === null && face) want = Math.atan2(face.x - this.root.position.x, face.z - this.root.position.z);
    if (want !== null) {
      let delta = want - this.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.root.rotation.y += delta * Math.min(1, dt * (this.slideTime < 1 ? 10 : 4));
    }
    // Struck: they stagger back and their skin flares.
    this.body.rotation.x = -0.22 * Math.sin(h * Math.PI);
    this.body.position.z = -0.03 * h;
    for (const { material, color } of this.materials) {
      material.color.copy(color).lerp(STRUCK, h * 0.7);
      if (this.melt > 0) {
        material.transparent = true;
        material.opacity = 1 - this.melt;
        material.depthWrite = this.melt < 0.5;
      }
    }

    if (this.ward && this.wardMaterial) {
      const warded = this.warded;
      this.wardMaterial.opacity += ((warded ? 0.95 : 0) - this.wardMaterial.opacity) * Math.min(1, dt * 8);
      this.ward.visible = this.wardMaterial.opacity > 0.02;
      this.ward.rotation.z += dt * 1.6;
      this.ward.scale.setScalar(0.6 + 0.4 * this.wardMaterial.opacity);
    }
  }
}

const WARD_RADIUS = 0.15;

/** Position along a walk (0 → 1): constant speed, with a short ease at each end. */
function steady(s: number): number {
  const e = 0.1;
  if (s < e) return (s * s) / (2 * e * (1 - e));
  if (s > 1 - e) return 1 - ((1 - s) * (1 - s)) / (2 * e * (1 - e));
  return (s - e / 2) / (1 - e);
}

/** Scale a standing figure to a height, centred on the origin with feet on y=0. */
function fitHeight(model: Object3D, height: number): void {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  const size = box.getSize(new Vector3());
  const k = height / size.y;
  model.scale.multiplyScalar(k);
  const c = box.getCenter(new Vector3());
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
}

/** A magic circle: rings, a six-pointed star and a band of runes, glowing green. */
function runeCircle(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(120,255,170,0.25)');
  glow.addColorStop(0.7, 'rgba(60,220,140,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(170,255,200,0.95)';
  g.shadowColor = 'rgba(80,255,160,1)';
  g.shadowBlur = 8;
  for (const [r, w] of [[120, 4], [104, 2], [70, 3]] as const) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
  }
  // Two triangles: the star.
  g.lineWidth = 3;
  for (const turn of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = turn + (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * 70;
      const y = c + Math.sin(a) * 70;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Runes between the outer rings: little strokes, the same every time.
  g.lineWidth = 2;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.save();
    g.translate(c + Math.cos(a) * 112, c + Math.sin(a) * 112);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    for (let s = 0; s < 3; s++) {
      g.moveTo((rand() - 0.5) * 9, (rand() - 0.5) * 9);
      g.lineTo((rand() - 0.5) * 9, (rand() - 0.5) * 9);
    }
    g.stroke();
    g.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A floating name and health bar above a rival's head, drawn on a canvas. */
export class NamePlate {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown = -1;
  private name: string;
  private accent: string;

  constructor(name: string, accent = '#3ee08a') {
    this.name = name;
    this.accent = accent;
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.26, 0.065), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 9;
    this.draw(1);
  }

  /** A different fighter: new name, new colour. */
  rename(name: string, accent: string): void {
    this.name = name;
    this.accent = accent;
    this.shown = -1;
    this.draw(1);
  }

  draw(health: number): void {
    const k = Math.max(0, Math.min(1, health));
    if (Math.abs(k - this.shown) < 0.004) return;
    this.shown = k;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.textAlign = 'center';
    // The name as large as fits the plate.
    let px = 46;
    g.font = `700 ${px}px ${FONT}`;
    const wide = g.measureText(this.name).width;
    if (wide > 480) {
      px = Math.floor((px * 480) / wide);
      g.font = `700 ${px}px ${FONT}`;
    }
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(20,10,30,0.85)';
    g.strokeText(this.name, 256, 50);
    g.fillStyle = '#ffffff';
    g.fillText(this.name, 256, 50);
    // The bar: a dark frame, filled in the fighter's colour (red when nearly beaten).
    g.fillStyle = 'rgba(20,10,30,0.8)';
    roundRect(g, 56, 72, 400, 34, 17);
    g.fill();
    const fill = g.createLinearGradient(60, 0, 452, 0);
    fill.addColorStop(0, k < 0.3 ? '#ff4a3a' : this.accent);
    fill.addColorStop(1, k < 0.3 ? '#ffb03a' : '#ffffff');
    g.fillStyle = fill;
    if (k > 0) {
      roundRect(g, 62, 78, 388 * k, 22, 11);
      g.fill();
    }
    this.texture.needsUpdate = true;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
