/**
 * 2D physics for the spark: a small ball of light that lives on the shadow
 * screen and collides with anything that casts a shadow there.
 *
 * Space: paper metres, x right, y up, origin at the paper's centre.
 *
 * Shapes:
 *  - Capsule: a segment with a radius (a projected finger bone, a drawn line).
 *    Each end has its own velocity, so a moving shadow can bat the spark.
 *  - Poly: a convex polygon, counter-clockwise (a cliff, a light shard's shadow),
 *    with one velocity for the whole shape.
 *
 * Integration: semi-implicit Euler, sub-stepped so the spark never moves more
 * than a third of its radius per step (no tunnelling through thin shadows).
 * Contacts: the spark is pushed out along the contact normal by the overlap,
 * then its velocity relative to the surface is reflected with restitution e,
 * and friction removes tangential speed up to mu times the normal impulse
 * (Coulomb). Slow contacts don't bounce, so the spark settles instead of jittering.
 * The spark is a glassy ball: low friction, so it rolls down gentle slopes
 * instead of sticking like a block; hands grip a little more, to carry it.
 */

export interface Capsule {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  /** Velocity of each end (m/s). */
  vax: number;
  vay: number;
  vbx: number;
  vby: number;
  e: number;
  mu: number;
  /** What it is, for sounds and scoring (e.g. HAND_LEFT). */
  tag: number;
}

export interface Poly {
  /** Counter-clockwise vertices, convex. */
  xs: number[];
  ys: number[];
  vx: number;
  vy: number;
  e: number;
  mu: number;
  tag: number;
}

export interface Contact {
  tag: number;
  /** Normal into the spark. */
  nx: number;
  ny: number;
  /** Closing speed along the normal at impact (m/s). */
  speed: number;
}

export interface Bounds {
  /** Half width and half height of the paper. */
  hw: number;
  hh: number;
}

export const TAG_WALL = 0;
export const TAG_TERRAIN = 1;
export const TAG_HAND_LEFT = 2;
export const TAG_HAND_RIGHT = 3;
export const TAG_SHARD = 4;
export const TAG_INK = 5;

/** Toy-scale gravity: the 1 m screen reads like a tall wall, and the motion stays easy to follow. */
export const GRAVITY = 2.2;
export const SPARK_RADIUS = 0.012;
export const MAX_SPEED = 3;
/** Below this closing speed a contact doesn't bounce (resting contact). */
const REST_SPEED = 0.06;
/** Rolling resistance while touching something, per second (a rolling ball barely slows). */
const ROLL_DRAG = 0.08;

export class Spark {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = SPARK_RADIUS;
  /** Contacts from the last step, strongest first. */
  readonly contacts: Contact[] = [];
  /** Seconds since it last touched anything. */
  airborne = 0;

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.airborne = 0;
    this.contacts.length = 0;
  }

  /** Advances by dt seconds against the given shapes. */
  step(dt: number, capsules: readonly Capsule[], polys: readonly Poly[], bounds: Bounds, gravity = GRAVITY): void {
    this.contacts.length = 0;
    const speed = Math.hypot(this.vx, this.vy);
    const steps = Math.max(2, Math.min(32, Math.ceil((speed * dt) / (this.r / 3))));
    const h = dt / steps;
    let touched = false;
    for (let s = 0; s < steps; s++) {
      this.vy -= gravity * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      for (const c of capsules) touched = this.capsule(c) || touched;
      for (const p of polys) touched = this.poly(p) || touched;
      touched = this.walls(bounds) || touched;
    }
    if (touched) {
      const k = Math.max(0, 1 - ROLL_DRAG * dt);
      this.vx *= k;
      this.vy *= k;
      this.airborne = 0;
    } else {
      this.airborne += dt;
    }
    const v = Math.hypot(this.vx, this.vy);
    if (v > MAX_SPEED) {
      this.vx *= MAX_SPEED / v;
      this.vy *= MAX_SPEED / v;
    }
    this.contacts.sort((a, b) => b.speed - a.speed);
  }

  private capsule(c: Capsule): boolean {
    const ex = c.bx - c.ax;
    const ey = c.by - c.ay;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 1e-12 ? ((this.x - c.ax) * ex + (this.y - c.ay) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = c.ax + ex * t;
    const qy = c.ay + ey * t;
    let nx = this.x - qx;
    let ny = this.y - qy;
    const reach = this.r + c.r;
    const d2 = nx * nx + ny * ny;
    if (d2 >= reach * reach) return false;
    const d = Math.sqrt(d2);
    if (d > 1e-9) {
      nx /= d;
      ny /= d;
    } else if (len2 > 1e-12) {
      // Dead centre on the bone: push out to its upper side.
      const l = Math.sqrt(len2);
      nx = -ey / l;
      ny = ex / l;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx = 0;
      ny = 1;
    }
    const svx = c.vax + (c.vbx - c.vax) * t;
    const svy = c.vay + (c.vby - c.vay) * t;
    this.resolve(nx, ny, reach - d, svx, svy, c.e, c.mu, c.tag);
    return true;
  }

  private poly(p: Poly): boolean {
    const n = p.xs.length;
    let best = -Infinity;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = p.xs[j] - p.xs[i];
      const ey = p.ys[j] - p.ys[i];
      const l = Math.hypot(ex, ey) || 1;
      // Outward normal of a counter-clockwise edge.
      const sep = ((this.x - p.xs[i]) * ey - (this.y - p.ys[i]) * ex) / l;
      if (sep > best) {
        best = sep;
        k = i;
      }
    }
    if (best >= this.r) return false;
    const j = (k + 1) % n;
    const ex = p.xs[j] - p.xs[k];
    const ey = p.ys[j] - p.ys[k];
    const len = Math.hypot(ex, ey) || 1;
    let nx: number;
    let ny: number;
    let depth: number;
    if (best < 0) {
      // Centre inside: out through the nearest edge.
      nx = ey / len;
      ny = -ex / len;
      depth = this.r - best;
    } else {
      let t = ((this.x - p.xs[k]) * ex + (this.y - p.ys[k]) * ey) / (len * len);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p.xs[k] + ex * t;
      const qy = p.ys[k] + ey * t;
      nx = this.x - qx;
      ny = this.y - qy;
      const d = Math.hypot(nx, ny);
      if (d >= this.r) return false;
      if (d > 1e-9) {
        nx /= d;
        ny /= d;
      } else {
        nx = ey / len;
        ny = -ex / len;
      }
      depth = this.r - d;
    }
    this.resolve(nx, ny, depth, p.vx, p.vy, p.e, p.mu, p.tag);
    return true;
  }

  private walls(b: Bounds): boolean {
    let hit = false;
    if (this.x - this.r < -b.hw) {
      this.resolve(1, 0, -b.hw - (this.x - this.r), 0, 0, 0.3, 0.2, TAG_WALL);
      hit = true;
    } else if (this.x + this.r > b.hw) {
      this.resolve(-1, 0, this.x + this.r - b.hw, 0, 0, 0.3, 0.2, TAG_WALL);
      hit = true;
    }
    if (this.y + this.r > b.hh) {
      this.resolve(0, -1, this.y + this.r - b.hh, 0, 0, 0.3, 0.2, TAG_WALL);
      hit = true;
    }
    // No floor: below the paper is the way out (a miss).
    return hit;
  }

  private resolve(nx: number, ny: number, depth: number, svx: number, svy: number, e: number, mu: number, tag: number): void {
    this.x += nx * depth;
    this.y += ny * depth;
    let rx = this.vx - svx;
    let ry = this.vy - svy;
    const vn = rx * nx + ry * ny;
    if (vn >= 0) return;
    const bounce = -vn < REST_SPEED ? 0 : e;
    const jn = -(1 + bounce) * vn;
    rx += jn * nx;
    ry += jn * ny;
    // Coulomb friction along the surface.
    const tx = -ny;
    const ty = nx;
    const vt = rx * tx + ry * ty;
    const limit = mu * jn;
    const dvt = vt > limit ? -limit : vt < -limit ? limit : -vt;
    rx += dvt * tx;
    ry += dvt * ty;
    this.vx = rx + svx;
    this.vy = ry + svy;
    if (-vn > 0.02) this.contacts.push({ tag, nx, ny, speed: -vn });
  }
}

/** A convex polygon from points, made counter-clockwise if needed. */
export function poly(points: ReadonlyArray<readonly [number, number]>, tag = TAG_TERRAIN, e = 0.25, mu = 0.02): Poly {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  const pts = area < 0 ? [...points].reverse() : points;
  return { xs: pts.map((p) => p[0]), ys: pts.map((p) => p[1]), vx: 0, vy: 0, e, mu, tag };
}

/** An axis-aligned box as a polygon (a cliff block). */
export function box(x0: number, y0: number, x1: number, y1: number, tag = TAG_TERRAIN): Poly {
  return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], tag);
}

/** A still capsule (a test hand, a drawn line). */
export function capsule(ax: number, ay: number, bx: number, by: number, r: number, tag = TAG_INK, e = 0.45, mu = 0.06): Capsule {
  return { ax, ay, bx, by, r, vax: 0, vay: 0, vbx: 0, vby: 0, e, mu, tag };
}
