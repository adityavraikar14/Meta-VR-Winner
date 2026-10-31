import { Vector3 } from '@iwsdk/core';

/** WebXR hand joint order: wrist, thumb (4 joints), then index, middle, ring, pinky (5 each). */
export const JOINT_COUNT = 25;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const INDEX_TIP = 9;
const MIDDLE_KNUCKLE = 11;
const PINKY_KNUCKLE = 21;
/** Metacarpal joint of index, middle, ring and pinky: +1 knuckle, +2 middle joint, +4 tip. */
const FINGER_BASES = [5, 10, 15, 20] as const;

/** Hand speed is measured over roughly this many seconds. */
const VELOCITY_WINDOW = 0.08;
const HISTORY = 16;

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

/**
 * One tracked hand, reduced to the few features gestures are judged on.
 * Positions are in the player's (reference) space, in metres.
 */
export class HandState {
  tracked = false;
  /** Seconds since the hand was last tracked (0 while tracked). */
  lostFor = 0;
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
  /** Palm velocity in m/s, smoothed over VELOCITY_WINDOW. */
  readonly velocity = new Vector3();

  private readonly histPos = new Float32Array(HISTORY * 3);
  private readonly histTime = new Float64Array(HISTORY);
  private histHead = 0;
  private histCount = 0;
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();

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
    this.normal.crossVectors(index, pinky).normalize();
    if (this.side === 'left') this.normal.negate();
    this.knuckles.copy(index).sub(pinky).normalize();

    for (let f = 0; f < 4; f++) {
      const base = FINGER_BASES[f];
      const bone = this.joint(base + 1, this.b).sub(this.joint(base, this.c)).normalize();
      const tip = this.joint(base + 4, this.c).sub(this.joint(base + 2, this.a)).normalize();
      this.straight[f] = bone.dot(tip);
    }
    this.pinch = this.joint(THUMB_TIP, this.a).distanceTo(this.joint(INDEX_TIP, this.b));
    this.record(time);
  }

  /** Forgets motion history, so a hand that reappears doesn't "teleport-throw". */
  lose(dt: number): void {
    this.tracked = false;
    this.lostFor += dt;
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
