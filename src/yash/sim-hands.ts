/**
 * Simulated hands for testing without a headset. Each pose writes real WebXR
 * joint positions into the HandStates, so the recognizer, arsenal and throw
 * detection run exactly as they do for tracked hands. A skeleton is drawn so
 * the pose is visible. Real tracked hands always take over.
 */
import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Sign } from './gestures.js';
import { HandState, JOINT_COUNT, Side, SIDES } from './hands.js';

export type SimPose = 'relaxed' | Exclude<Sign, 'none'>;
export type SimMove = 'push' | 'swing';

/** Head-relative frame: x to the right, y up, z forward (metres / directions). */
type V3 = readonly [number, number, number];

interface HandPose {
  wrist: V3;
  /** Out of the palm. */
  normal: V3;
  /** Wrist towards the fingertips. */
  fingers: V3;
  fist: boolean;
}

const RELAXED_LEFT: HandPose = { wrist: [-0.17, -0.38, 0.28], normal: [0, -1, 0], fingers: [0.1, 0, 1], fist: false };
const RELAXED_RIGHT: HandPose = { wrist: [0.17, -0.38, 0.28], normal: [0, -1, 0], fingers: [-0.1, 0, 1], fist: false };

const POSES: Record<SimPose, Record<Side, HandPose>> = {
  relaxed: { left: RELAXED_LEFT, right: RELAXED_RIGHT },
  arm: {
    left: { wrist: [-0.1, -0.27, 0.3], normal: [1, 0, 0], fingers: [0, 0.35, 1], fist: false },
    right: { wrist: [0.1, -0.27, 0.3], normal: [-1, 0, 0], fingers: [0, 0.35, 1], fist: false },
  },
  sword: {
    left: RELAXED_LEFT,
    right: { wrist: [0.13, -0.27, 0.3], normal: [-1, 0, 0], fingers: [0, 0, 1], fist: true },
  },
  spear: {
    left: { wrist: [0.06, -0.36, 0.3], normal: [1, 0, 0], fingers: [0, 0, 1], fist: true },
    right: { wrist: [0.06, -0.19, 0.3], normal: [-1, 0, 0], fingers: [0, 0, 1], fist: true },
  },
  ball: {
    left: RELAXED_LEFT,
    right: { wrist: [0.12, -0.3, 0.26], normal: [0, 1, 0], fingers: [0, 0, 1], fist: false },
  },
  wall: {
    left: { wrist: [-0.17, -0.32, 0.33], normal: [0, 0, 1], fingers: [0, 1, 0], fist: false },
    right: { wrist: [0.17, -0.32, 0.33], normal: [0, 0, 1], fingers: [0, 1, 0], fist: false },
  },
};

/** A push drives the hands this far forward in PUSH_OUT seconds (about 2.3 m/s), then back. */
const PUSH_DISTANCE = 0.35;
const PUSH_OUT = 0.15;
const PUSH_BACK = 0.35;
/** A spear is let go this far into the push. */
const SPEAR_RELEASE = 0.4;
/** A swing sweeps the right hand from upper right to lower left. */
const SWING_FROM: V3 = [0.12, 0.14, -0.04];
const SWING_TO: V3 = [-0.22, -0.08, 0.12];
const SWING_OUT = 0.22;
const SWING_BACK = 0.35;

/** Every pose is shifted up and out by this much, to sit comfortably in view. */
const LIFT = 0.07;
const REACH = 0.06;

/** Extra seconds each recipe step is held beyond what the recognizer needs. */
const STEP_MARGIN = 0.3;

/** Thumb, then index/middle/ring/pinky knuckle offsets across the palm (towards the thumb). */
const KNUCKLE_ACROSS = [0.025, 0.008, -0.01, -0.028];

interface Step {
  pose: SimPose;
  seconds: number;
}

export class SimHands {
  /** True while simulated hands stand in for tracked ones. */
  active = false;
  pose: SimPose = 'relaxed';
  move: SimMove | null = null;
  private moveTime = 0;
  private steps: Step[] = [];
  private stepLeft = 0;

  private origin = new Vector3();
  private right = new Vector3();
  private up = new Vector3(0, 1, 0);
  private forward = new Vector3();
  private wrist = new Vector3();
  private normal = new Vector3();
  private fingers = new Vector3();
  private thumbSide = new Vector3();
  private v = new Vector3();
  private w = new Vector3();

  setPose(pose: SimPose): void {
    this.active = true;
    this.pose = pose;
    this.steps = [];
  }

  /** Plays a list of poses, each held for its time, then stays on the last one. */
  play(steps: Step[]): void {
    this.active = true;
    this.steps = steps.slice(1);
    this.pose = steps[0].pose;
    this.stepLeft = steps[0].seconds + STEP_MARGIN;
  }

  startMove(move: SimMove): void {
    if (!this.active) this.setPose(move === 'swing' ? 'sword' : 'relaxed');
    this.move = move;
    this.moveTime = 0;
  }

  release(): void {
    this.active = false;
    this.move = null;
    this.steps = [];
  }

  /** Writes both hands for this frame, relative to the head's flattened facing. */
  apply(
    dt: number,
    time: number,
    head: Vector3,
    forward: Vector3,
    hands: Record<Side, HandState>,
  ): void {
    if (this.steps.length > 0) {
      this.stepLeft -= dt;
      if (this.stepLeft <= 0) {
        const next = this.steps.shift()!;
        this.pose = next.pose;
        this.stepLeft = next.seconds + STEP_MARGIN;
      }
    }
    this.origin.copy(head);
    this.forward.copy(forward);
    this.right.set(-forward.z, 0, forward.x);

    let push = 0;
    let swing = -1;
    let openSpear = false;
    if (this.move) {
      this.moveTime += dt;
      const t = this.moveTime;
      if (this.move === 'push') {
        push = t < PUSH_OUT ? t / PUSH_OUT : Math.max(0, 1 - (t - PUSH_OUT) / PUSH_BACK);
        openSpear = this.pose === 'spear' && t > PUSH_OUT * SPEAR_RELEASE;
        if (t > PUSH_OUT + PUSH_BACK) this.move = null;
      } else {
        swing = t < SWING_OUT ? t / SWING_OUT : Math.max(0, 1 - (t - SWING_OUT) / SWING_BACK);
        if (t > SWING_OUT + SWING_BACK) {
          this.move = null;
          swing = -1;
        }
      }
    }

    for (const side of SIDES) {
      const pose = POSES[this.pose][side];
      this.toWorld(pose.wrist, this.wrist, true);
      this.wrist.addScaledVector(this.forward, push * PUSH_DISTANCE);
      if (swing >= 0 && side === 'right') {
        for (let i = 0; i < 3; i++) {
          const offset = SWING_FROM[i] + (SWING_TO[i] - SWING_FROM[i]) * swing;
          const axis = i === 0 ? this.right : i === 1 ? this.up : this.forward;
          this.wrist.addScaledVector(axis, offset);
        }
      }
      this.toWorld(pose.normal, this.normal, false).normalize();
      this.toWorld(pose.fingers, this.fingers, false).normalize();
      this.writeHand(hands[side], pose.fist && !openSpear);
      hands[side].tracked = true;
      hands[side].lostFor = 0;
      hands[side].update(time);
    }
  }

  private toWorld(v: V3, out: Vector3, isPoint: boolean): Vector3 {
    out.set(0, 0, 0)
      .addScaledVector(this.right, v[0])
      .addScaledVector(this.up, v[1])
      .addScaledVector(this.forward, v[2]);
    if (isPoint) out.add(this.origin).addScaledVector(this.up, LIFT).addScaledVector(this.forward, REACH);
    return out;
  }

  /** Lays out the 25 joints from the wrist, palm normal and finger direction. */
  private writeHand(hand: HandState, fist: boolean): void {
    const j = hand.joints;
    const put = (i: number, p: Vector3) => {
      j[i * 3] = p.x;
      j[i * 3 + 1] = p.y;
      j[i * 3 + 2] = p.z;
    };
    const n = this.normal;
    const d = this.fingers;
    // For a right hand the thumb is on the −(n × d) side; mirrored for a left.
    this.thumbSide.crossVectors(n, d).normalize();
    if (hand.side === 'right') this.thumbSide.negate();
    const t = this.thumbSide;
    put(0, this.wrist);

    // Thumb: out to the side and forward, tucked across the fingers in a fist.
    for (let k = 1; k <= 4; k++) {
      this.v.copy(this.wrist).addScaledVector(t, fist ? 0.03 + 0.004 * k : 0.02 + 0.017 * k);
      this.v.addScaledVector(d, fist ? 0.02 + 0.016 * k : 0.018 * k);
      if (fist) this.v.addScaledVector(n, 0.008 * k);
      put(k, this.v);
    }
    for (let f = 0; f < 4; f++) {
      const base = 5 + f * 5;
      this.v.copy(this.wrist).addScaledVector(d, 0.03).addScaledVector(t, KNUCKLE_ACROSS[f] * 0.6);
      put(base, this.v);
      const knuckle = this.w.copy(this.wrist).addScaledVector(d, 0.09).addScaledVector(t, KNUCKLE_ACROSS[f]);
      put(base + 1, knuckle);
      const length = f === 3 ? 0.8 : 1;
      if (!fist) {
        for (const [k, along] of [[2, 0.042], [3, 0.068], [4, 0.088]] as const) {
          this.v.copy(knuckle).addScaledVector(d, along * length);
          put(base + k, this.v);
        }
      } else {
        // Curl: down into the palm, then back towards the wrist.
        this.v.copy(knuckle).addScaledVector(n, 0.035 * length);
        put(base + 2, this.v);
        this.v.addScaledVector(d, -0.022 * length).addScaledVector(n, 0.004);
        put(base + 3, this.v);
        this.v.addScaledVector(d, -0.018 * length);
        put(base + 4, this.v);
      }
    }
  }
}

/** Joint pairs drawn as bones. */
const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  ...[5, 10, 15, 20].flatMap((b) => [
    [0, b], [b, b + 1], [b + 1, b + 2], [b + 2, b + 3], [b + 3, b + 4],
  ] as Array<[number, number]>),
];
const JOINT_RADIUS = 0.009;
const BONE_RADIUS = 0.006;

/** Draws a hand as joints and bones (used for the simulated hands). */
export class HandSkeleton {
  readonly root = new Group();
  private joints: InstancedMesh;
  private bones: InstancedMesh;
  private matrix = new Matrix4();
  private quat = new Quaternion();
  private scale = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private dir = new Vector3();
  private static readonly Y = new Vector3(0, 1, 0);

  constructor(color: number) {
    const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    this.joints = new InstancedMesh(new SphereGeometry(JOINT_RADIUS, 8, 6), material, JOINT_COUNT);
    this.bones = new InstancedMesh(new CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 6), material, BONES.length);
    this.joints.frustumCulled = false;
    this.bones.frustumCulled = false;
    this.root.add(this.joints, this.bones);
    this.root.name = 'SimHand';
  }

  update(hand: HandState): void {
    this.quat.identity();
    this.scale.set(1, 1, 1);
    for (let i = 0; i < JOINT_COUNT; i++) {
      hand.joint(i, this.a);
      this.matrix.compose(this.a, this.quat, this.scale);
      this.joints.setMatrixAt(i, this.matrix);
    }
    BONES.forEach(([from, to], i) => {
      hand.joint(from, this.a);
      hand.joint(to, this.b);
      this.dir.copy(this.b).sub(this.a);
      const length = this.dir.length();
      this.quat.setFromUnitVectors(HandSkeleton.Y, this.dir.divideScalar(length || 1));
      this.scale.set(1, length, 1);
      this.matrix.compose(this.a.add(this.b).multiplyScalar(0.5), this.quat, this.scale);
      this.bones.setMatrixAt(i, this.matrix);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}
