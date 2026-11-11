import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import type { Finger } from './hand-pose.js';
import {
  blendShapes,
  createShape,
  GHOST_JOINTS,
  type GhostLayout,
  type GhostShape,
  layoutFor,
  placeHands,
  RELAXED,
  shapeFor,
} from './ghost-pose.js';
import type { Level } from './levels.js';
import { FINGER_BONES, PALM_BONES } from './stage.js';

/**
 * Ghost position in paper space: beside the player's hands, just outside the
 * creature stage, so it never hides the paper or the diorama.
 */
const GHOST_X = 0.27;
const GHOST_Y = -0.05;
const GHOST_Z = 0.6;
/** Where the player's eyes are in paper space (see ShadowStageSystem). */
const VIEWER = new Vector3(0, 0.12, 1.0);

/** One demonstration: open hand, close into the shape, hold, open again. */
const CYCLE = 3.6;
const OPEN_TIME = 0.5;
const CLOSE_TIME = 0.8;
const RELEASE_TIME = 0.35;

const OPACITY = 0.72;
const GLOW = new Color(0xcfe8ff);
const FIX = new Color(0xffc34d);

const FINGER_JOINTS: Record<Finger, readonly [number, number]> = {
  thumb: [1, 4],
  index: [5, 9],
  middle: [10, 14],
  ring: [15, 19],
  pinky: [20, 24],
};
const JOINT_RADIUS = 0.0085;
const TIP_RADIUS = 0.007;
const BONE_RADIUS = 0.0075;
const PALM_RADIUS = 0.019;

/** Parts of the hand the ghost can light up as the thing to fix. */
export type GhostFocus = Finger | 'thumbs' | 'spread' | null;

interface GhostHandMesh {
  joints: InstancedMesh;
  bones: InstancedMesh;
  points: Float32Array;
}

function smooth(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
}

/**
 * A glowing, life-size hand beside the player that slowly makes the shape
 * a friend needs, and lights up the finger that is still wrong.
 */
export class GhostHand {
  private root = new Group();
  private material: MeshBasicMaterial;
  private hands: [GhostHandMesh, GhostHandMesh];
  private level: Level | null = null;
  private layout: GhostLayout | null = null;
  private target: GhostShape = createShape();
  private shape: GhostShape = createShape();
  private time = 0;
  private appear = 0;
  private focus: GhostFocus = null;
  private colored: GhostFocus | undefined = undefined;
  private leftHanded = false;
  private label: Sprite;
  private labelMaterial: SpriteMaterial;

  private a = new Vector3();
  private b = new Vector3();
  private mid = new Vector3();
  private dir = new Vector3();
  private scale = new Vector3();
  private quat = new Quaternion();
  private mat = new Matrix4();
  private up = new Vector3(0, 1, 0);

  constructor(parent: Object3D) {
    this.root.name = 'GhostHand';
    this.root.visible = false;
    this.material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: true,
      side: DoubleSide,
    });
    const sphere = new SphereGeometry(1, 12, 8);
    const cylinder = new CylinderGeometry(1, 1, 1, 10, 1);
    const make = (): GhostHandMesh => {
      const joints = new InstancedMesh(sphere, this.material, GHOST_JOINTS);
      const bones = new InstancedMesh(cylinder, this.material, FINGER_BONES.length + PALM_BONES.length);
      for (const mesh of [joints, bones]) {
        mesh.frustumCulled = false;
        mesh.renderOrder = 5;
        this.root.add(mesh);
      }
      return { joints, bones, points: new Float32Array(GHOST_JOINTS * 3) };
    };
    this.hands = [make(), make()];
    parent.add(this.root);
    // "Copy this hand", above the ghost (on the paper, so mirroring never flips the text).
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'rgba(27, 35, 64, 0.82)';
    g.beginPath();
    g.roundRect(4, 4, 504, 88, 44);
    g.fill();
    g.fillStyle = '#fff1c9';
    g.font = '600 44px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Copy this hand ↓', 256, 50);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.labelMaterial = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
    this.label = new Sprite(this.labelMaterial);
    this.label.scale.set(0.15, 0.15 * (96 / 512), 1);
    this.label.renderOrder = 6;
    parent.add(this.label);
  }

  /** Starts demonstrating a friend's shape, or fades out for null. */
  show(level: Level | null): void {
    if (level === this.level) return;
    this.level = level;
    if (!level) return;
    const rule = (level.pair ?? level.shape)!;
    this.layout = layoutFor(level);
    this.target = shapeFor(rule);
    this.time = 0;
    this.hands[1].joints.visible = this.layout.pair;
    this.hands[1].bones.visible = this.layout.pair;
  }

  /** The finger (or two-hand detail) to light up gold; null for none. */
  setFocus(focus: GhostFocus): void {
    this.focus = focus;
  }

  /** Mirror one-hand shapes for a player using their left hand. */
  setLeftHanded(left: boolean): void {
    this.leftHanded = left;
  }

  /**
   * Advances the demonstration. `fade` (0..1) dims the ghost while the
   * player's own shape gets close, so it never competes with their shadow.
   */
  update(dt: number, fade: number): void {
    const target = this.level ? 1 : 0;
    this.appear += (target - this.appear) * Math.min(1, dt * 4);
    this.root.visible = this.appear > 0.02 && this.layout !== null;
    this.label.visible = this.root.visible;
    if (!this.root.visible) return;
    this.labelMaterial.opacity = 0.95 * this.appear;
    this.time += dt;
    this.material.opacity = OPACITY * this.appear * (1 - 0.75 * fade);

    // Closed amount through the cycle.
    const t = this.time % CYCLE;
    const closeEnd = OPEN_TIME + CLOSE_TIME;
    const releaseStart = CYCLE - RELEASE_TIME;
    const k = t < OPEN_TIME ? 0
      : t < closeEnd ? smooth((t - OPEN_TIME) / CLOSE_TIME)
      : t < releaseStart ? 1
      : 1 - smooth((t - releaseStart) / RELEASE_TIME);
    blendShapes(RELAXED, this.target, k, this.shape);

    const layout = this.layout!;
    const [right, left] = this.hands;
    placeHands(layout, this.shape, right.points, left.points);
    // One-hand shapes follow the player's hand; pairs always show both.
    const mirror = this.leftHanded && !layout.pair;
    this.root.scale.set(mirror ? -1 : 1, 1, 1);
    this.root.position.set(mirror ? -GHOST_X : GHOST_X, GHOST_Y + Math.sin(this.time * 1.8) * 0.004, GHOST_Z);
    this.label.position.set(this.root.position.x, GHOST_Y + 0.14, GHOST_Z);
    // Turn the back of the hand towards the player's eyes.
    this.root.rotation.set(0, Math.atan2(VIEWER.x - this.root.position.x, VIEWER.z - this.root.position.z), 0);

    this.drawHand(right);
    if (layout.pair) this.drawHand(left);
    if (this.colored !== this.focus) this.paint(this.focus);
  }

  private drawHand(hand: GhostHandMesh): void {
    const p = hand.points;
    for (let j = 0; j < GHOST_JOINTS; j++) {
      const tip = j === 4 || (j > 5 && (j - 4) % 5 === 0);
      const r = tip ? TIP_RADIUS : JOINT_RADIUS;
      this.a.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
      this.mat.makeScale(r, r, r).setPosition(this.a);
      hand.joints.setMatrixAt(j, this.mat);
    }
    let index = 0;
    for (const [from, to] of FINGER_BONES) this.setBone(hand, index++, from, to, BONE_RADIUS);
    for (const [from, to] of PALM_BONES) this.setBone(hand, index++, from, to, PALM_RADIUS);
    hand.joints.instanceMatrix.needsUpdate = true;
    hand.bones.instanceMatrix.needsUpdate = true;
  }

  private setBone(hand: GhostHandMesh, index: number, from: number, to: number, radius: number): void {
    const p = hand.points;
    this.a.set(p[from * 3], p[from * 3 + 1], p[from * 3 + 2]);
    this.b.set(p[to * 3], p[to * 3 + 1], p[to * 3 + 2]);
    this.dir.subVectors(this.b, this.a);
    const length = this.dir.length();
    if (length < 1e-5) {
      this.mat.makeScale(0, 0, 0);
    } else {
      this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.quat.setFromUnitVectors(this.up, this.dir.divideScalar(length));
      this.scale.set(radius, length, radius);
      this.mat.compose(this.mid, this.quat, this.scale);
    }
    hand.bones.setMatrixAt(index, this.mat);
  }

  /** Colours the focused finger's joints and bones gold. */
  private paint(focus: GhostFocus): void {
    this.colored = focus;
    const hot = (joint: number): boolean => {
      if (focus === null) return false;
      if (focus === 'thumbs') return joint >= 1 && joint <= 4;
      if (focus === 'spread') return joint >= 5;
      const [first, last] = FINGER_JOINTS[focus];
      // Long fingers light up from the knuckle; their first joint sits in the palm.
      return joint >= (focus === 'thumb' ? first : first + 1) && joint <= last;
    };
    for (const hand of this.hands) {
      for (let j = 0; j < GHOST_JOINTS; j++) hand.joints.setColorAt(j, hot(j) ? FIX : GLOW);
      let index = 0;
      for (const [from, to] of FINGER_BONES) {
        hand.bones.setColorAt(index++, hot(from) && hot(to) ? FIX : GLOW);
      }
      for (let i = 0; i < PALM_BONES.length; i++) hand.bones.setColorAt(index++, GLOW);
      hand.joints.instanceColor!.needsUpdate = true;
      hand.bones.instanceColor!.needsUpdate = true;
    }
  }
}
