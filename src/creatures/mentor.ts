import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  type AnimationAction,
  AnimationMixer,
  Box3,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Ada, the Lantern's engineer: the mentor who stands on the lab table beside
 * the screen. A rigged character (Quaternius, CC0) dressed for work: a white
 * shirt, navy trousers, and a yellow hard hat with a headlamp, the last of
 * the Lantern's light. About 20 cm tall, like a figure on the table.
 *
 * She reacts to the game through cues: she waves when a level opens, reaches
 * towards the screen when play starts, flinches when the spark is lost, and
 * waves twice when a level is cleared.
 */

export type MentorCue = 'wave' | 'point' | 'oops' | 'cheer';

const MODEL_URL = 'gltf/ada.glb';
const HEIGHT = 0.2;
/** The speech bubble's width on the table (m). */
const BUBBLE_W = 0.36;
const CLIPS = {
  idle: 'CharacterArmature|Idle_Neutral',
  wave: 'CharacterArmature|Wave',
  point: 'CharacterArmature|Interact',
  oops: 'CharacterArmature|HitRecieve',
} as const;
type Move = keyof typeof CLIPS;
/** Work clothes: material name → colour. */
const OUTFIT: Record<string, number> = { White: 0xf2f6fb, Orange: 0x2a3a63, Grey: 0x1d2230 };

function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 250, 225, 1)');
  grad.addColorStop(0.3, 'rgba(255, 220, 140, 0.55)');
  grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A yellow hard hat with a headlamp, sized to a head `width` across (the hat's own units). */
function hardHat(width: number): Group {
  const hat = new Group();
  hat.name = 'HardHat';
  const yellow = new MeshStandardMaterial({ color: 0xffc928, roughness: 0.35 });
  const r = width * 0.62;
  const dome = new Mesh(new SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), yellow);
  dome.scale.set(1, 0.82, 1.1);
  hat.add(dome);
  const ridge = new Mesh(new CylinderGeometry(r * 0.12, r * 0.12, r * 2.15, 10), yellow);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = r * 0.72;
  ridge.scale.set(1, 1, 0.6);
  hat.add(ridge);
  const brim = new Mesh(new CylinderGeometry(r * 1.18, r * 1.2, r * 0.08, 32), yellow);
  brim.position.set(0, r * 0.02, r * 0.12);
  hat.add(brim);
  // The headlamp at the front: a dark housing, a glowing lens, and a soft halo.
  const lamp = new Mesh(new CylinderGeometry(r * 0.26, r * 0.26, r * 0.22, 16), new MeshStandardMaterial({ color: 0x22304f, roughness: 0.4, metalness: 0.4 }));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, r * 0.38, r * 1.0);
  hat.add(lamp);
  const lens = new Mesh(new CylinderGeometry(r * 0.2, r * 0.2, r * 0.05, 16), new MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe8a0, emissiveIntensity: 2.4 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, r * 0.38, r * 1.12);
  hat.add(lens);
  const halo = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false }));
  halo.scale.setScalar(r * 1.6);
  // Only a glow: rays (ground finding, desktop clicks) pass through it.
  halo.raycast = () => {};
  halo.position.set(0, r * 0.38, r * 1.18);
  hat.add(halo);
  return hat;
}

export class Mentor {
  readonly root = new Group();
  ready = false;
  private mixer: AnimationMixer | null = null;
  private actions: Partial<Record<Move, AnimationAction>> = {};
  private current: AnimationAction | null = null;
  private queue: Move[] = [];
  private time = 0;
  /** Her speech bubble: the sprite, its canvas, what it says, and how long it stays. */
  private bubble: Sprite;
  private bubbleCanvas = document.createElement('canvas');
  private bubbleTexture: CanvasTexture;
  private bubbleLeft = 0;
  private said = '';

  constructor(parent: Object3D) {
    this.root.name = 'Mentor';
    this.root.visible = false;
    parent.add(this.root);
    this.bubbleCanvas.width = 640;
    this.bubbleCanvas.height = 200;
    this.bubbleTexture = new CanvasTexture(this.bubbleCanvas);
    this.bubbleTexture.colorSpace = SRGBColorSpace;
    this.bubble = new Sprite(new SpriteMaterial({ map: this.bubbleTexture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    // About 2 cm letters: readable from your seat, a metre away.
    this.bubble.scale.set(BUBBLE_W, BUBBLE_W * (200 / 640), 1);
    this.bubble.position.y = HEIGHT + 0.075;
    this.bubble.renderOrder = 14;
    this.bubble.raycast = () => {};
    this.root.add(this.bubble);
    void this.load();
  }

  private async load(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${MODEL_URL}`);
        this.build(gltf.scene, gltf.animations);
        return;
      } catch (error) {
        console.warn(`Could not load the mentor (try ${attempt + 1})`, error);
        await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
      }
    }
  }

  private build(model: Object3D, clips: import('@iwsdk/core').AnimationClip[]): void {
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials as MeshStandardMaterial[]) {
        const colour = OUTFIT[material.name];
        if (colour !== undefined) material.color.setHex(colour);
        material.roughness = Math.max(material.roughness ?? 0.6, 0.55);
      }
    });
    // Scale to a figure on the table, feet on the board.
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const scale = HEIGHT / Math.max(0.001, box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    this.root.add(model);
    this.root.updateMatrixWorld(true);
    // The hard hat sits on the head at rest, then rides on the Head bone.
    const head = model.getObjectByName('Casual_Head');
    const bone = model.getObjectByName('Head');
    if (head && bone) {
      // The head's box in world space, brought into Ada's own frame (the hat is placed there).
      const headBox = new Box3().setFromObject(head).applyMatrix4(new Matrix4().copy(this.root.matrixWorld).invert());
      const size = headBox.getSize(new Vector3());
      const centre = headBox.getCenter(new Vector3());
      const hat = hardHat(Math.max(size.x, size.z));
      hat.position.set(centre.x, headBox.max.y - size.y * 0.22, centre.z);
      this.root.add(hat);
      hat.updateMatrixWorld(true);
      bone.attach(hat);
    }
    this.mixer = new AnimationMixer(model);
    for (const move of Object.keys(CLIPS) as Move[]) {
      const clip = clips.find((c) => c.name === CLIPS[move]);
      if (clip) this.actions[move] = this.mixer.clipAction(clip);
    }
    this.mixer.addEventListener('finished', () => this.next());
    this.play('idle');
    this.ready = true;
  }

  private play(move: Move): void {
    const action = this.actions[move];
    if (!action) return;
    const looping = move === 'idle';
    action.reset();
    action.setLoop(looping ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !looping;
    action.enabled = true;
    if (this.current && this.current !== action) action.crossFadeFrom(this.current, 0.25, false);
    action.play();
    this.current = action;
  }

  private next(): void {
    const move = this.queue.shift();
    this.play(move ?? 'idle');
  }

  /** React: a wave, a reach towards the screen, a flinch, or a double wave. */
  cue(cue: MentorCue): void {
    if (!this.ready) return;
    this.queue = cue === 'cheer' ? ['wave'] : [];
    this.play(cue === 'cheer' ? 'wave' : cue);
  }

  /** A line in her speech bubble for a few seconds (longer lines stay longer). */
  say(text: string): void {
    this.bubbleLeft = 2.2 + text.length * 0.055;
    if (text === this.said) return;
    this.said = text;
    const c = this.bubbleCanvas;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    // Up to three lines of bold type, centred.
    g.font = `700 34px ${FONT}`;
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > 560 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3);
    const h = 40 + shown.length * 40;
    const top = 150 - h;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#14213d';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(8, top, c.width - 16, h, 28);
    g.fill();
    g.stroke();
    // The tail, pointing down to her.
    g.beginPath();
    g.moveTo(c.width / 2 - 22, top + h - 3);
    g.lineTo(c.width / 2, top + h + 34);
    g.lineTo(c.width / 2 + 22, top + h - 3);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(c.width / 2 - 22, top + h);
    g.lineTo(c.width / 2, top + h + 34);
    g.lineTo(c.width / 2 + 22, top + h);
    g.stroke();
    g.fillStyle = '#14213d';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    shown.forEach((l, i) => g.fillText(l, c.width / 2, top + 40 + i * 40));
    this.bubbleTexture.needsUpdate = true;
  }

  /** Stand at (x, z) on the board (stage space), facing the player and a little towards the middle. */
  place(x: number, floor: number, z: number): void {
    this.root.position.set(x, floor, z);
    this.root.rotation.y = -Math.sign(x) * 0.45;
  }

  update(dt: number, visible: boolean): void {
    this.time += dt;
    this.root.visible = visible && this.ready;
    if (this.root.visible) this.mixer?.update(dt);
    // The bubble pops in and fades out.
    this.bubbleLeft = Math.max(0, this.bubbleLeft - dt);
    const material = this.bubble.material as SpriteMaterial;
    const target = this.bubbleLeft > 0 ? 1 : 0;
    material.opacity += (target - material.opacity) * Math.min(1, dt * 8);
    this.bubble.visible = material.opacity > 0.02;
    const pop = 1 + (1 - material.opacity) * 0.15;
    this.bubble.scale.set(BUBBLE_W * pop, BUBBLE_W * (200 / 640) * pop, 1);
  }
}
