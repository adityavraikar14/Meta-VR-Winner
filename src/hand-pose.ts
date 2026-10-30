/**
 * Reads a hand shape from tracked joints. Pure math, no Three.js.
 *
 * Silhouettes alone cannot tell similar shapes apart (peace, three and rock
 * are all "a fist with some fingers up" at mask resolution), so levels are
 * judged on finger states instead: which fingers are straight, whether the
 * thumb is out, and which way the fingers point. This works at any hand
 * position or tilt, and tells us which finger to hint at.
 */

export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: readonly Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** What a level wants from a finger: straight, curled, or don't care. */
export type Want = 'out' | 'in' | 'any';

export interface ShapeRule {
  fingers: Record<Finger, Want>;
  /** Straight fingers should point up, as for rabbit ears. */
  pointUp?: boolean;
}

/** 0 = fully curled, 1 = fully straight, per finger. */
export type Extension = Record<Finger, number>;

export function createExtension(): Extension {
  return { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
}

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
/** First joint (proximal phalanx) of index..pinky; tip is +3. */
const KNUCKLES: Record<Exclude<Finger, 'thumb'>, number> = {
  index: 6,
  middle: 11,
  ring: 16,
  pinky: 21,
};

function dist(j: Float32Array, a: number, b: number): number {
  const dx = j[a * 3] - j[b * 3];
  const dy = j[a * 3 + 1] - j[b * 3 + 1];
  const dz = j[a * 3 + 2] - j[b * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function ramp(value: number, low: number, high: number): number {
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/**
 * Finger straightness: knuckle-to-tip distance over the length of its bones.
 * A straight finger is ~1, a curled one ~0.5 or less.
 */
export function readExtension(joints: Float32Array, out: Extension): Extension {
  for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
    const k = KNUCKLES[finger];
    const chain = dist(joints, k, k + 1) + dist(joints, k + 1, k + 2) + dist(joints, k + 2, k + 3);
    const reach = dist(joints, k, k + 3);
    out[finger] = ramp(chain > 0 ? reach / chain : 0, 0.6, 0.92);
  }
  // Thumb is "out" when its tip is far from the index knuckle, relative to palm size.
  const palm = dist(joints, WRIST, MIDDLE_KNUCKLE);
  out.thumb = ramp(palm > 0 ? dist(joints, THUMB_TIP, INDEX_KNUCKLE) / palm : 0, 0.45, 0.8);
  return out;
}

/** How upward the straight fingers point, from -1 (down) to 1 (up). */
export function fingersUp(joints: Float32Array, ext: Extension): number {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
    if (ext[finger] < 0.5) continue;
    const k = KNUCKLES[finger];
    x += joints[(k + 3) * 3] - joints[k * 3];
    y += joints[(k + 3) * 3 + 1] - joints[k * 3 + 1];
    z += joints[(k + 3) * 3 + 2] - joints[k * 3 + 2];
  }
  const length = Math.sqrt(x * x + y * y + z * z);
  return length > 0 ? y / length : 0;
}

/** A two-hand shape: both hands hold the same finger states. */
export interface PairRule {
  fingers: Record<Finger, Want>;
  /** Thumb tips hooked together, as in the classic shadow bird. */
  thumbsTouch?: boolean;
}

export interface ShapeScore {
  /** 0..1, the weakest requirement. */
  score: number;
  /** The requirement furthest from met, for hints. */
  worst: Finger | 'direction' | 'thumbs' | null;
}

const THUMB_TIP_JOINT = 4;

/** Scores both hands against a pair rule; the weaker hand decides. */
export function scorePair(
  rule: PairRule,
  left: Float32Array,
  right: Float32Array,
  leftExt: Extension,
  rightExt: Extension,
  out: ShapeScore,
): ShapeScore {
  const single: ShapeRule = { fingers: rule.fingers };
  scoreShape(single, left, leftExt, out);
  let score = out.score;
  let worst = out.worst;
  scoreShape(single, right, rightExt, out);
  if (out.score < score) {
    score = out.score;
    worst = out.worst;
  }
  if (rule.thumbsTouch) {
    const t = THUMB_TIP_JOINT * 3;
    const gap = Math.hypot(left[t] - right[t], left[t + 1] - right[t + 1], left[t + 2] - right[t + 2]);
    const s = 1 - ramp(gap, 0.045, 0.1);
    if (s < score) {
      score = s;
      worst = 'thumbs';
    }
  }
  out.score = score;
  out.worst = worst;
  return out;
}

export function scoreShape(
  rule: ShapeRule,
  joints: Float32Array,
  ext: Extension,
  out: ShapeScore,
): ShapeScore {
  let score = 1;
  let worst: ShapeScore['worst'] = null;
  for (const finger of FINGERS) {
    const want = rule.fingers[finger];
    if (want === 'any') continue;
    const s = want === 'out' ? ext[finger] : 1 - ext[finger];
    if (s < score) {
      score = s;
      worst = finger;
    }
  }
  if (rule.pointUp) {
    const s = ramp(fingersUp(joints, ext), 0.2, 0.6);
    if (s < score) {
      score = s;
      worst = 'direction';
    }
  }
  out.score = score;
  out.worst = worst;
  return out;
}
