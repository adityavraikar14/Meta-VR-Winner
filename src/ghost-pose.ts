/**
 * Builds a life-size hand skeleton (25 joints, WebXR order) for the ghost
 * hand that shows players how to make each shape. Pure math, no Three.js,
 * so the poses can be checked against the same rules used for matching.
 *
 * Local frame of a right hand: fingers point +Y, the back of the hand faces
 * +Z (towards the player), the palm faces -Z, the thumb is on the -X side.
 * A left hand is the same pose mirrored in X.
 */

import type { Finger, PairRule, ShapeRule } from './hand-pose.js';

export const GHOST_JOINTS = 25;

/** How the hand should look: 0 = straight, 1 = fully curled, per finger. */
export interface GhostShape {
  curl: Record<Finger, number>;
  /** Sideways fan of index..pinky in radians, negative towards the thumb. */
  splay: [number, number, number, number];
}

const SPLAY_WIDE: GhostShape['splay'] = [-0.32, -0.08, 0.14, 0.38];
const SPLAY_TOGETHER: GhostShape['splay'] = [-0.05, 0, 0.04, 0.08];
const SPLAY_NORMAL: GhostShape['splay'] = [-0.12, -0.03, 0.06, 0.16];

/** A loose, open hand: where every demonstration starts. */
export const RELAXED: GhostShape = {
  curl: { thumb: 0.45, index: 0.15, middle: 0.15, ring: 0.2, pinky: 0.2 },
  splay: SPLAY_NORMAL,
};

/** The shape a finger rule asks for. Unconstrained thumbs tuck in, as in real hand shadows. */
export function shapeFor(rule: ShapeRule | PairRule): GhostShape {
  const curl = {} as Record<Finger, number>;
  for (const [finger, want] of Object.entries(rule.fingers) as Array<[Finger, string]>) {
    curl[finger] = want === 'out' ? 0 : want === 'in' ? 1 : finger === 'thumb' ? 0.85 : 0.4;
  }
  const spread = 'spread' in rule ? rule.spread : undefined;
  const splay = spread === 'wide' ? SPLAY_WIDE : spread === 'together' ? SPLAY_TOGETHER : SPLAY_NORMAL;
  return { curl, splay };
}

export function blendShapes(a: GhostShape, b: GhostShape, k: number, out: GhostShape): GhostShape {
  for (const finger of Object.keys(a.curl) as Finger[]) {
    out.curl[finger] = a.curl[finger] + (b.curl[finger] - a.curl[finger]) * k;
  }
  for (let i = 0; i < 4; i++) out.splay[i] = a.splay[i] + (b.splay[i] - a.splay[i]) * k;
  return out;
}

export function createShape(): GhostShape {
  return { curl: { ...RELAXED.curl }, splay: [...RELAXED.splay] };
}

const LONG_FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
/** Metacarpal base (near the wrist) and knuckle of index..pinky. */
const BASES = [
  [-0.012, 0.012], [-0.002, 0.013], [0.008, 0.012], [0.017, 0.01],
] as const;
const KNUCKLES = [
  [-0.024, 0.085], [-0.007, 0.088], [0.01, 0.084], [0.026, 0.076],
] as const;
const PHALANGES = [
  [0.04, 0.024, 0.022], [0.045, 0.028, 0.024], [0.041, 0.026, 0.023], [0.032, 0.02, 0.019],
] as const;
/** Bend at each finger joint when fully curled, in radians. */
const CURL_BENDS = [1.5, 1.7, 1.1] as const;

/** Thumb bones (metacarpal, proximal, distal) and their straight / tucked directions. */
const THUMB_ROOT = [-0.018, 0.022, -0.012] as const;
const THUMB_BONES = [0.04, 0.032, 0.027] as const;
const THUMB_OUT = [
  [-0.8, 0.5, -0.3], [-0.88, 0.4, -0.2], [-0.9, 0.38, -0.15],
] as const;
/** Tucked across the curled fingers, tip resting on the middle finger. */
const THUMB_IN = [
  [-0.2, 0.85, -0.45], [0.7, 0.55, -0.45], [0.75, -0.2, -0.1],
] as const;

/**
 * Writes the hand's joints (xyz per joint) into `out`, with the wrist at the
 * origin. Pass `mirror` for a left hand.
 */
export function buildPose(shape: GhostShape, mirror: boolean, out: Float32Array): Float32Array {
  const set = (joint: number, x: number, y: number, z: number) => {
    out[joint * 3] = mirror ? -x : x;
    out[joint * 3 + 1] = y;
    out[joint * 3 + 2] = z;
  };
  set(0, 0, 0, 0);

  // Thumb: blend each bone's direction between straight out and tucked in.
  const t = shape.curl.thumb;
  let [x, y, z] = THUMB_ROOT;
  set(1, x, y, z);
  for (let b = 0; b < 3; b++) {
    let dx = THUMB_OUT[b][0] + (THUMB_IN[b][0] - THUMB_OUT[b][0]) * t;
    let dy = THUMB_OUT[b][1] + (THUMB_IN[b][1] - THUMB_OUT[b][1]) * t;
    let dz = THUMB_OUT[b][2] + (THUMB_IN[b][2] - THUMB_OUT[b][2]) * t;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    x += dx * THUMB_BONES[b];
    y += dy * THUMB_BONES[b];
    z += dz * THUMB_BONES[b];
    set(2 + b, x, y, z);
  }

  // Long fingers: each joint bends towards the palm by its share of the curl.
  LONG_FINGERS.forEach((finger, f) => {
    const first = 5 + f * 5;
    const c = shape.curl[finger];
    const s = shape.splay[f];
    const sx = Math.sin(s);
    const sy = Math.cos(s);
    set(first, BASES[f][0], BASES[f][1], 0);
    let px = KNUCKLES[f][0];
    let py = KNUCKLES[f][1];
    let pz = 0;
    set(first + 1, px, py, pz);
    let bend = 0;
    for (let p = 0; p < 3; p++) {
      bend += CURL_BENDS[p] * c;
      const along = Math.cos(bend);
      px += sx * along * PHALANGES[f][p];
      py += sy * along * PHALANGES[f][p];
      pz -= Math.sin(bend) * PHALANGES[f][p];
      set(first + 2 + p, px, py, pz);
    }
  });
  return out;
}

/** How a level's hands are held: which hands, tilt, and where they sit. */
export interface GhostLayout {
  /** Right-hand pose first; pairs add a mirrored left hand. */
  pair: boolean;
  /** Tilt about the view axis in radians; negative leans the fingers right. */
  tilt: number;
  /** Pairs: bring the thumb tips together in the middle. */
  thumbsMeet: boolean;
  /** Pairs: gap between the two wrists when the thumbs do not meet. */
  gap: number;
}

export function layoutFor(rule: { shape?: ShapeRule; pair?: PairRule }): GhostLayout {
  if (rule.pair) {
    const meet = !!rule.pair.thumbsTouch;
    return { pair: true, tilt: meet ? -0.95 : 0, thumbsMeet: meet, gap: 0.11 };
  }
  // Shapes that do not point up (the dog) are held sideways, snout forward.
  return { pair: false, tilt: rule.shape?.pointUp ? 0 : -Math.PI / 2, thumbsMeet: false, gap: 0 };
}

/**
 * Poses the right hand (and the left, for pairs) in ghost space, writing
 * joints into `right` and `left`. Returns false when there is no left hand.
 */
export function placeHands(
  layout: GhostLayout,
  shape: GhostShape,
  right: Float32Array,
  left: Float32Array,
): boolean {
  buildPose(shape, false, right);
  rotateZ(right, layout.tilt);
  if (!layout.pair) return false;
  buildPose(shape, true, left);
  rotateZ(left, -layout.tilt);
  // Thumb tips (joint 4) meet just apart in the middle, or the wrists sit `gap` apart.
  const shift = layout.thumbsMeet ? 0.012 - right[12] : layout.gap / 2;
  for (let j = 0; j < GHOST_JOINTS; j++) {
    right[j * 3] += shift;
    left[j * 3] -= shift;
  }
  return true;
}

function rotateZ(joints: Float32Array, angle: number): void {
  if (angle === 0) return;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let j = 0; j < GHOST_JOINTS; j++) {
    const x = joints[j * 3];
    const y = joints[j * 3 + 1];
    joints[j * 3] = x * c - y * s;
    joints[j * 3 + 1] = x * s + y * c;
  }
}
