/**
 * A pin-jointed truss in a vertical plane, solved with small-step XPBD.
 *
 * Every timber is a two-force member: it can only push or pull along its
 * length, and its joints are pins that let it swing. That is why a square
 * frame racks over and collapses while a triangle cannot change shape, the
 * first lesson of structural engineering. Each member is an elastic spring
 * of stiffness EA/L; it snaps if pulled past its tensile strength and
 * buckles if squeezed past Euler's critical load π²EI/L², so long struts in
 * compression fail first and short ones are strong.
 */

export interface Joint {
  x: number;
  y: number;
  /** Position at the start of the step (for velocity). */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Load hung on this joint this step, newtons (downward positive). */
  load: number;
  mass: number;
  pinned: boolean;
}

export interface Member {
  a: number;
  b: number;
  rest: number;
  /** Axial force, newtons: + tension (pulled), − compression (squeezed). */
  force: number;
  broken: boolean;
  /** How it failed, if it did. */
  failure: 'snapped' | 'buckled' | null;
  /** Part of the road deck. */
  deck: boolean;
}

/** Timber, toy scale: axial stiffness, mass per metre, strengths. */
export const TIMBER = {
  /** E·A, newtons: a 10 cm timber stretches 2.5 mm under 10 N. */
  EA: 400,
  /** kg per metre of timber. */
  density: 0.12,
  /** Pulled harder than this, it snaps. */
  tension: 15,
  /** E·I, N·m²: a 10 cm strut buckles under 9 N; a 5 cm one under 36 N. */
  EI: 0.0091,
};

const GRAVITY = 9.8;
/** Hardware at each joint (pin and plates), kg. */
const JOINT_MASS = 0.004;
const DAMPING = 0.6;

export function buckleLoad(length: number): number {
  return (Math.PI * Math.PI * TIMBER.EI) / (length * length);
}

export class Truss {
  joints: Joint[] = [];
  members: Member[] = [];

  addJoint(x: number, y: number, pinned = false): number {
    this.joints.push({ x, y, px: x, py: y, vx: 0, vy: 0, load: 0, mass: JOINT_MASS, pinned });
    return this.joints.length - 1;
  }

  addMember(a: number, b: number, deck = false): number {
    const ja = this.joints[a];
    const jb = this.joints[b];
    const rest = Math.hypot(jb.x - ja.x, jb.y - ja.y);
    this.members.push({ a, b, rest, force: 0, broken: false, failure: null, deck });
    this.updateMasses();
    return this.members.length - 1;
  }

  /** Joint masses: each carries half of every timber that meets it. */
  updateMasses(): void {
    for (const j of this.joints) j.mass = JOINT_MASS;
    for (const m of this.members) {
      if (m.broken) continue;
      const half = (m.rest * TIMBER.density) / 2;
      this.joints[m.a].mass += half;
      this.joints[m.b].mass += half;
    }
  }

  /** Put every joint back where it was built, at rest, unbroken. */
  reset(built: Array<[number, number]>): void {
    this.joints.forEach((j, i) => {
      j.x = j.px = built[i][0];
      j.y = j.py = built[i][1];
      j.vx = j.vy = 0;
      j.load = 0;
    });
    for (const m of this.members) {
      m.broken = false;
      m.failure = null;
      m.force = 0;
    }
    this.updateMasses();
  }

  /** Advance `dt` seconds in `substeps` small steps. Returns members that failed. */
  step(dt: number, substeps = 16): Member[] {
    const h = dt / substeps;
    const failed: Member[] = [];
    for (let s = 0; s < substeps; s++) {
      // Predict: gravity, hung loads, a little air damping.
      for (const j of this.joints) {
        j.px = j.x;
        j.py = j.y;
        if (j.pinned) continue;
        j.vy -= (GRAVITY + j.load / j.mass) * h;
        const keep = Math.max(0, 1 - DAMPING * h);
        j.vx *= keep;
        j.vy *= keep;
        j.x += j.vx * h;
        j.y += j.vy * h;
      }
      // Each member pulls its joints back towards its rest length, with the
      // softness its stiffness gives it (XPBD compliance α = L/EA).
      for (const m of this.members) {
        if (m.broken) continue;
        const a = this.joints[m.a];
        const b = this.joints[m.b];
        const wa = a.pinned ? 0 : 1 / a.mass;
        const wb = b.pinned ? 0 : 1 / b.mass;
        if (wa + wb === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1e-9;
        const C = length - m.rest;
        const alpha = m.rest / TIMBER.EA / (h * h);
        const lambda = -C / (wa + wb + alpha);
        const nx = dx / length;
        const ny = dy / length;
        a.x -= wa * lambda * nx;
        a.y -= wa * lambda * ny;
        b.x += wb * lambda * nx;
        b.y += wb * lambda * ny;
        m.force = (TIMBER.EA * C) / m.rest;
      }
      for (const j of this.joints) {
        if (j.pinned) continue;
        j.vx = (j.x - j.px) / h;
        j.vy = (j.y - j.py) / h;
      }
    }
    // Strength checks once per frame, on the settled forces.
    for (const m of this.members) {
      if (m.broken) continue;
      if (m.force > TIMBER.tension) m.failure = 'snapped';
      else if (-m.force > buckleLoad(m.rest)) m.failure = 'buckled';
      if (m.failure) {
        m.broken = true;
        failed.push(m);
      }
    }
    if (failed.length) this.updateMasses();
    return failed;
  }

  /** How close each member is to failing: −1 (about to buckle) … +1 (about to snap). */
  usage(m: Member): number {
    if (m.force >= 0) return Math.min(1, m.force / TIMBER.tension);
    return -Math.min(1, -m.force / buckleLoad(m.rest));
  }
}
