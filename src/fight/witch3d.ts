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

/**
 * Morwen, the Ink Witch (Witch by LxNazarov, CC-BY): the Ink Duel's rival
 * in 3D. She walks out onto the hill in front of the screen and stands
 * between you and it, always turning to face you. She hurls ink from her
 * hand, flicks quick bolts, and raises a ward of green runes that stops
 * your throws. Struck, she staggers and flashes; beaten, she falls and
 * melts away into ink. The lantern behind you throws her real shadow onto
 * the screen.
 */

const WITCH_URL = 'gltf/witch.glb';
/** Standing height in the room, metres. */
export const WITCH_HEIGHT = 0.5;
const WARD_RADIUS = 0.15;
/** The colour her skin flares to when struck. */
const STRUCK = new Color(2.2, 1.1, 2.4);

export type WitchMove = 'idle' | 'walk' | 'throw' | 'attack' | 'skill' | 'death';
const CLIPS: Record<WitchMove, string> = {
  idle: 'Witch.Skeleton|idle',
  walk: 'Witch.Skeleton|walk',
  throw: 'Witch.Skeleton|throw',
  attack: 'Witch.Skeleton|attack',
  skill: 'Witch.Skeleton|skill',
  death: 'Witch.Skeleton|death',
};
/** Moves that loop; the rest play once and return to idle (death stays down). */
const LOOPING = new Set<WitchMove>(['idle', 'walk']);

let loading: Promise<void> | null = null;
let gltf: GLTF | undefined;
/** For dev info: how the model is getting on. */
export const witchLoad = { state: 'waiting' };

export function preloadWitch(): Promise<void> {
  loading ??= loadWitch();
  return loading;
}

async function loadWitch(): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    witchLoad.state = `loading (try ${attempt + 1})`;
    try {
      gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${WITCH_URL}`);
      witchLoad.state = 'ready';
      return;
    } catch (error) {
      witchLoad.state = `failed (try ${attempt + 1})`;
      console.warn(`Could not load the witch (try ${attempt + 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
}

interface Release {
  /** Seconds into the clip when the hand lets go. */
  time: number;
  hand: Object3D;
}

export class Witch3D {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = {} as Record<WitchMove, AnimationAction>;
  private readonly releases: Partial<Record<WitchMove, Release>> = {};
  private readonly head: Object3D | null;
  private readonly chest: Object3D | null;
  private readonly materials: Array<{ material: MeshStandardMaterial; color: Color }> = [];
  private readonly ward: Mesh;
  private readonly wardMaterial: MeshBasicMaterial;
  private move: WitchMove = 'idle';
  private time = 0;
  private hurt = 0;
  /** Set on the frame a throwing hand lets go; read and cleared by the duel. */
  released: Object3D | null = null;
  /** 0 → 1 as she melts away, beaten. */
  melt = 0;

  /** Null until the model has loaded. */
  static create(): Witch3D | null {
    return gltf ? new Witch3D(cloneRig(gltf.scene), gltf.animations) : null;
  }

  private constructor(model: Object3D, clips: AnimationClip[]) {
    this.root.name = 'Witch3D';
    this.body.add(model);
    this.root.add(this.body);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      const material = (mesh.material as MeshStandardMaterial).clone();
      this.materials.push({ material, color: material.color.clone() });
      mesh.material = material;
    });
    this.mixer = new AnimationMixer(model);
    for (const [move, name] of Object.entries(CLIPS) as Array<[WitchMove, string]>) {
      const clip = clips.find((c) => c.name === name) ?? clips[0];
      this.actions[move] = this.mixer.clipAction(clip);
    }
    // three.js drops the dots from bone names: Hand.01.R becomes Hand01R.
    const find = (name: string) => model.getObjectByName(name) ?? null;
    this.head = find('head01_09');
    this.chest = find('spine03_05');
    const hands = [find('Hand01R_033'), find('Hand01L_014')].filter((h): h is Object3D => h !== null);
    for (const move of ['throw', 'attack'] as const) this.releases[move] = this.findRelease(this.actions[move], hands);

    // Size her standing in her idle pose.
    this.actions.idle.setLoop(LoopRepeat, Infinity).play();
    this.mixer.update(0);
    fitHeight(model, WITCH_HEIGHT);
    this.mixer.addEventListener('finished', (e) => {
      if ((e.action as AnimationAction) !== this.actions.death) this.play('idle');
    });

    // Her ward: a turning circle of green runes, held out in front of her.
    this.wardMaterial = new MeshBasicMaterial({ map: runeCircle(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.ward = new Mesh(new CircleGeometry(WARD_RADIUS, 48), this.wardMaterial);
    this.ward.position.set(0, WITCH_HEIGHT * 0.6, 0.12);
    this.ward.renderOrder = 7;
    this.ward.visible = false;
    this.root.add(this.ward);
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

  get moving(): WitchMove {
    return this.move;
  }

  /** Busy with a throw, a bolt or a ward. */
  get busy(): boolean {
    return !LOOPING.has(this.move);
  }

  play(move: WitchMove): void {
    if (move === this.move && LOOPING.has(move)) return;
    const next = this.actions[move];
    const prev = this.actions[this.move];
    next.reset();
    next.setLoop(LOOPING.has(move) ? LoopRepeat : LoopOnce, Infinity);
    next.clampWhenFinished = move === 'death';
    next.fadeIn(0.2).play();
    if (prev !== next) prev.fadeOut(0.2);
    this.move = move;
  }

  /** Her ward is up (in the middle of casting it). */
  get warded(): boolean {
    if (this.move !== 'skill') return false;
    const t = this.actions.skill.time / this.actions.skill.getClip().duration;
    return t > 0.15 && t < 0.92;
  }

  /** Points in the root's parent space. */
  headAt(out: Vector3): Vector3 {
    return this.point(this.head, out, 0.9);
  }

  chestAt(out: Vector3): Vector3 {
    return this.point(this.chest, out, 0.62);
  }

  wardAt(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    this.ward.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  handAt(hand: Object3D, out: Vector3): Vector3 {
    return this.point(hand, out, 0.6);
  }

  private point(bone: Object3D | null, out: Vector3, fallback: number): Vector3 {
    this.root.updateMatrixWorld(true);
    if (!bone) return out.copy(this.root.position).setY(this.root.position.y + WITCH_HEIGHT * fallback);
    bone.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  /** Distance from a point (parent space) to her body, a capsule from shins to crown. */
  distanceTo(p: Vector3, scratch: Vector3): number {
    const r = this.root.position;
    const y = Math.min(r.y + WITCH_HEIGHT * 0.92, Math.max(r.y + WITCH_HEIGHT * 0.12, p.y));
    return scratch.set(r.x, y, r.z).distanceTo(p);
  }

  wardRadius(): number {
    return WARD_RADIUS;
  }

  flinch(): void {
    this.hurt = 0.6;
  }

  /** `face` is where to turn towards (the player's head), in the parent's space. */
  update(dt: number, face: Vector3 | null): void {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    const h = this.hurt / 0.6;
    const action = this.actions[this.move];
    const before = action.time;
    this.mixer.update(dt);
    const release = this.releases[this.move];
    if (release && before < release.time && action.time >= release.time) this.released = release.hand;

    if (face) {
      const want = Math.atan2(face.x - this.root.position.x, face.z - this.root.position.z);
      let delta = want - this.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.root.rotation.y += delta * Math.min(1, dt * 4);
    }
    // Struck: she staggers back and her skin flares.
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

    const warded = this.warded;
    this.wardMaterial.opacity += ((warded ? 0.95 : 0) - this.wardMaterial.opacity) * Math.min(1, dt * 8);
    this.ward.visible = this.wardMaterial.opacity > 0.02;
    this.ward.rotation.z += dt * 1.6;
    this.ward.scale.setScalar(0.6 + 0.4 * this.wardMaterial.opacity);
  }
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

/** A floating name and health bar above her head, drawn on a canvas. */
export class NamePlate {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown = -1;

  constructor(private readonly name: string) {
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.26, 0.065), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 9;
    this.draw(1);
  }

  draw(health: number): void {
    const k = Math.max(0, Math.min(1, health));
    if (Math.abs(k - this.shown) < 0.004) return;
    this.shown = k;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.textAlign = 'center';
    g.font = 'bold 44px Georgia, serif';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(20,10,30,0.85)';
    g.strokeText(this.name, 256, 50);
    g.fillStyle = '#d8ffe4';
    g.fillText(this.name, 256, 50);
    // The bar: a dark frame, a green-to-gold fill.
    g.fillStyle = 'rgba(20,10,30,0.8)';
    roundRect(g, 56, 72, 400, 34, 17);
    g.fill();
    const fill = g.createLinearGradient(60, 0, 452, 0);
    fill.addColorStop(0, '#3ee08a');
    fill.addColorStop(1, '#c8f060');
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
