import { Vector3 } from '@iwsdk/core';
import { stage } from '../stage-state.js';
import { FINGER_BONES, PALM_BONES } from '../stage.js';
import { type Capsule, TAG_HAND_LEFT, TAG_HAND_RIGHT } from './spark-physics.js';

/**
 * Your hands' shadows as solid shapes, computed from the tracked joints rather
 * than read back from the shadow image (which arrives ~20 times a second and
 * lags behind a quick hand).
 *
 * Every joint is projected through the lantern onto the paper plane:
 *
 *   P′ = L + (P − L)·t,   t = Lz ÷ (Lz − Pz) = D ÷ d
 *
 * (paper space: the paper is z = 0, the lantern sits at L with Lz = D in front
 * of it, d is the joint's distance from the lantern along the paper's normal).
 * Each bone becomes a capsule between its projected ends, with the rig's own
 * radius scaled by t — the same shapes that cast the shadow you see. Their
 * velocities are finite differences of the projected ends, smoothed over
 * ~30 ms, so a quick flick of the wrist becomes a fast-moving shadow paddle
 * that throws the spark: the shadow moves D/d times faster than your hand.
 */

const JOINTS = 25;
const WRIST = 0;
const MIDDLE_METACARPAL = 10;
/** The shadow rig's sizes (see stage.ts), so physics matches what you see. */
const FINGER_RADIUS = 0.009;
const PALM_RADIUS = 0.02;
const FOREARM_LENGTH = 0.28;
const FOREARM_RADIUS = 0.03;
/** Velocity smoothing time constant (s). */
const VELOCITY_TAU = 0.03;
/** Joints this close to the lantern (or behind the paper) cast nothing usable. */
const NEAR_LANTERN = 0.03;

export interface HandShadowStats {
  /** Shadow scale D/d at the palm, per hand (0 when not tracked). */
  scale: [number, number];
}

export class HandShadows {
  /** This frame's capsules for both hands (rebuilt each update). */
  readonly capsules: Capsule[] = [];
  readonly stats: HandShadowStats = { scale: [0, 0] };
  /** Bounce and grip of a hand's shadow. */
  bounce = 0.55;
  grip = 0.06;

  private pool: Capsule[] = [];
  private projected = [new Float32Array(JOINTS * 2 + 2), new Float32Array(JOINTS * 2 + 2)];
  private scales = [new Float32Array(JOINTS + 1), new Float32Array(JOINTS + 1)];
  private previous = [new Float32Array(JOINTS * 2 + 2), new Float32Array(JOINTS * 2 + 2)];
  private velocity = [new Float32Array(JOINTS * 2 + 2), new Float32Array(JOINTS * 2 + 2)];
  private valid = [new Uint8Array(JOINTS + 1), new Uint8Array(JOINTS + 1)];
  private hadPrevious = [false, false];
  private p = new Vector3();
  private w = new Vector3();
  private m = new Vector3();

  update(dt: number): void {
    this.capsules.length = 0;
    let used = 0;
    const take = (): Capsule => {
      if (used >= this.pool.length) this.pool.push({ ax: 0, ay: 0, bx: 0, by: 0, r: 0, vax: 0, vay: 0, vbx: 0, vby: 0, e: 0, mu: 0, tag: 0 });
      return this.pool[used++];
    };
    const paper = stage.paper;
    const [lx, ly, lz] = stage.lantern;
    for (let h = 0; h < 2; h++) {
      this.stats.scale[h] = 0;
      if (!paper || !stage.tracked[h]) {
        this.hadPrevious[h] = false;
        continue;
      }
      const joints = stage.joints[h];
      const out = this.projected[h];
      const scale = this.scales[h];
      const valid = this.valid[h];
      // The 25 joints, then a 26th point: the elbow end of the forearm.
      for (let j = 0; j <= JOINTS; j++) {
        if (j < JOINTS) this.p.set(joints[j * 3], joints[j * 3 + 1], joints[j * 3 + 2]);
        else {
          this.w.set(joints[WRIST * 3], joints[WRIST * 3 + 1], joints[WRIST * 3 + 2]);
          this.m.set(joints[MIDDLE_METACARPAL * 3], joints[MIDDLE_METACARPAL * 3 + 1], joints[MIDDLE_METACARPAL * 3 + 2]);
          this.p.subVectors(this.w, this.m).normalize().multiplyScalar(FOREARM_LENGTH).add(this.w);
        }
        paper.worldToLocal(this.p);
        const d = lz - this.p.z;
        if (d < NEAR_LANTERN || this.p.z <= 0) {
          valid[j] = 0;
          continue;
        }
        const t = lz / d;
        valid[j] = 1;
        scale[j] = t;
        out[j * 2] = lx + (this.p.x - lx) * t;
        out[j * 2 + 1] = ly + (this.p.y - ly) * t;
      }
      // Velocities of the projected points, smoothed.
      const prev = this.previous[h];
      const vel = this.velocity[h];
      const k = dt > 0 ? Math.min(1, dt / VELOCITY_TAU) : 0;
      for (let i = 0; i < out.length; i++) {
        const raw = this.hadPrevious[h] && dt > 0 ? (out[i] - prev[i]) / dt : 0;
        vel[i] = this.hadPrevious[h] ? vel[i] + (raw - vel[i]) * k : 0;
        prev[i] = out[i];
      }
      this.hadPrevious[h] = true;
      this.stats.scale[h] = valid[MIDDLE_METACARPAL] ? scale[MIDDLE_METACARPAL] : 0;

      const tag = h === 0 ? TAG_HAND_LEFT : TAG_HAND_RIGHT;
      const add = (a: number, b: number, radius: number) => {
        if (!valid[a] || !valid[b]) return;
        const c = take();
        c.ax = out[a * 2];
        c.ay = out[a * 2 + 1];
        c.bx = out[b * 2];
        c.by = out[b * 2 + 1];
        c.r = radius * (scale[a] + scale[b]) * 0.5;
        c.vax = vel[a * 2];
        c.vay = vel[a * 2 + 1];
        c.vbx = vel[b * 2];
        c.vby = vel[b * 2 + 1];
        c.e = this.bounce;
        c.mu = this.grip;
        c.tag = tag;
        this.capsules.push(c);
      };
      for (const [a, b] of FINGER_BONES) add(a, b, a === WRIST ? PALM_RADIUS * 0.8 : FINGER_RADIUS);
      for (const [a, b] of PALM_BONES) add(a, b, PALM_RADIUS);
      add(WRIST, JOINTS, FOREARM_RADIUS);
    }
  }
}
