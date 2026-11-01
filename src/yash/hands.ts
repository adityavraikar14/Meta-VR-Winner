import { Vector3 } from '@iwsdk/core';

/** WebXR hand joint order: wrist, thumb (4 joints), then index, middle, ring, pinky (5 each). */
export const JOINT_COUNT = 25;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const INDEX_MIDDLE = 7;
const INDEX_TIP = 9;
const MIDDLE_KNUCKLE = 11;
const MIDDLE_MIDDLE = 12;
const PINKY_KNUCKLE = 21;
/** Metacarpal joint of index, middle, ring and pinky: +1 knuckle, +2 middle joint, +4 tip. */
const FINGER_BASES = [5, 10, 15, 20] as const;

/** Hand speed is measured over roughly this many seconds. */
const VELOCITY_WINDOW = 0.08;
const HISTORY = 16;
/**
 * How much of each new frame goes into the smoothed palm normal and finger
 * values (the rest is last frame's). Real tracking jitters a little every
 * frame; this steadies sign detection without adding noticeable lag.
 */
const SMOOTHING = 0.55;

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

/**
 * One tracked hand, reduced to the few features gestures are judged on.
 * Positions are in the player's (reference) space, in metres.
 */
export class HandState {
  tracked = false;
  /** Seconds since the hand was last tracked (0 while tracked, Infinity if never seen). */
  lostFor = Infinity;
  readonly joints = new Float32Array(JOINT_COUNT * 3);
  /** Centre of the palm. */
  readonly palm = new Vector3();
  /** Unit vector pointing out of the palm (the side you'd catch a ball with). */
  readonly normal = new Vector3();
  /** Unit vector from the wrist to the middle knuckle: where the hand points. */
  readonly pointing = new Vector3();
  /** Unit vector from the pinky knuckle to the index knuckle: a held sword's blade axis. */
  readonly knuckles = new Vector3();
  /** Per finger (index, middle, ring, pinky): 1 = straight, about −0.5 = curled into a fist. */
  readonly straight = new Float32Array(4);
  /** Thumb tip to index tip, in metres. */
  pinch = 1;
  /**
   * Finger-gun trigger: how close the thumb tip is to the side of the curled
   * middle finger / index base, in metres. Small when the thumb is dropped.
   */
  thumbDrop = 1;
  /** Palm velocity in m/s, smoothed over VELOCITY_WINDOW. */
  readonly velocity = new Vector3();
  /**
   * Palm velocity on the last tracked frame. Fast throws often lose tracking
   * mid-motion; this lets a throw still go where the hand was heading.
   */
  readonly lastVelocity = new Vector3();

  /** True until the first frame after (re)appearing, so smoothing starts fresh. */
  private fresh = true;
  private readonly histPos = new Float32Array(HISTORY * 3);
  private readonly histTime = new Float64Array(HISTORY);
  private histHead = 0;
  private histCount = 0;
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private d = new Vector3();

  constructor(readonly side: Side) {}

  joint(index: number, out: Vector3): Vector3 {
    const j = this.joints;
    return out.set(j[index * 3], j[index * 3 + 1], j[index * 3 + 2]);
  }

  /** Recomputes every derived feature after `joints` was filled this frame. */
  update(time: number): void {
    const wrist = this.joint(WRIST, this.a);
    const middle = this.joint(MIDDLE_KNUCKLE, this.b);
    this.palm.copy(wrist).lerp(middle, 0.6);
    this.pointing.copy(middle).sub(wrist).normalize();

    // Palm normal from the triangle wrist / index knuckle / pinky knuckle.
    // The cross product points out of the palm for a right hand; mirror it for a left.
    const index = this.joint(INDEX_KNUCKLE, this.b).sub(wrist);
    const pinky = this.joint(PINKY_KNUCKLE, this.c).sub(wrist);
    const k = this.fresh ? 1 : SMOOTHING;
    const normal = this.c.crossVectors(index, pinky).normalize();
    if (this.side === 'left') normal.negate();
    if (this.fresh) this.normal.copy(normal);
    else this.normal.lerp(normal, k).normalize();
    this.knuckles.copy(index).sub(this.joint(PINKY_KNUCKLE, this.c).sub(wrist)).normalize();

    // Straightness compares wrist → knuckle with knuckle → fingertip. Both spans
    // are 7–9 cm long, so a few millimetres of tracking jitter barely move them.
    const wristAgain = this.joint(WRIST, this.a);
    for (let f = 0; f < 4; f++) {
      const base = FINGER_BASES[f];
      const knuckle = this.joint(base + 1, this.c);
      const bone = this.b.copy(knuckle).sub(wristAgain).normalize();
      const tip = this.joint(base + 4, this.d).sub(knuckle).normalize();
      this.straight[f] += (bone.dot(tip) - this.straight[f]) * k;
    }
    const thumb = this.joint(THUMB_TIP, this.a);
    this.pinch = thumb.distanceTo(this.joint(INDEX_TIP, this.b));
    this.thumbDrop = Math.min(
      thumb.distanceTo(this.joint(INDEX_MIDDLE, this.b)),
      thumb.distanceTo(this.joint(MIDDLE_KNUCKLE, this.b)),
      thumb.distanceTo(this.joint(MIDDLE_MIDDLE, this.b)),
    );
    this.fresh = false;
    this.record(time);
    this.lastVelocity.copy(this.velocity);
  }

  /**
   * Sanity check for hand data sources: fingers bend towards the palm, so the
   * bend of slightly curled fingers should point the same way as `normal`.
   * Returns about +1 when consistent, about −1 when the hand data is mirrored,
   * near 0 when the fingers are too straight to tell.
   */
  palmCheck(): number {
    let sum = 0;
    const wrist = this.joint(WRIST, this.a);
    for (const base of FINGER_BASES) {
      const knuckle = this.joint(base + 1, this.b);
      const along = this.c.copy(knuckle).sub(wrist).normalize();
      const tip = this.joint(base + 4, this.d).sub(knuckle);
      // The part of knuckle → tip that leaves the straight line is the bend.
      tip.addScaledVector(along, -tip.dot(along));
      sum += tip.dot(this.normal);
    }
    return Math.max(-1, Math.min(1, sum / 0.04));
  }

  /** Forgets motion history, so a hand that reappears doesn't "teleport-throw". */
  lose(dt: number): void {
    this.tracked = false;
    this.lostFor += dt;
    this.fresh = true;
    this.histCount = 0;
    this.velocity.set(0, 0, 0);
  }

  private record(time: number): void {
    const h = this.histHead;
    this.histPos[h * 3] = this.palm.x;
    this.histPos[h * 3 + 1] = this.palm.y;
    this.histPos[h * 3 + 2] = this.palm.z;
    this.histTime[h] = time;
    this.histHead = (h + 1) % HISTORY;
    this.histCount = Math.min(this.histCount + 1, HISTORY);

    // Walk back to the newest sample at least VELOCITY_WINDOW old.
    let k = h;
    for (let n = 1; n < this.histCount; n++) {
      const prev = (h - n + HISTORY) % HISTORY;
      k = prev;
      if (time - this.histTime[prev] >= VELOCITY_WINDOW) break;
    }
    const dt = time - this.histTime[k];
    if (k === h || dt <= 0) {
      this.velocity.set(0, 0, 0);
      return;
    }
    this.velocity.set(
      (this.palm.x - this.histPos[k * 3]) / dt,
      (this.palm.y - this.histPos[k * 3 + 1]) / dt,
      (this.palm.z - this.histPos[k * 3 + 2]) / dt,
    );
  }
}
