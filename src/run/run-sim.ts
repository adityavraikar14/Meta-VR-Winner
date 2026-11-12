import type { RunLevel } from './run-levels.js';
import { type Bounds, type Capsule, type Poly, poly, Spark, TAG_HAND_LEFT, TAG_HAND_RIGHT } from './spark-physics.js';

/**
 * One Shadow Run level's rules, with no drawing: the spark, the course, the
 * motes and the gate. The game drives it with your hands' shadows; the
 * solvability test drives it with each level's solution shapes.
 */

export const PAPER_BOUNDS: Bounds = { hw: 0.5, hh: 0.35 };
/** The spark is through the gate once its centre is this close to the gate's. */
export const GATE_RADIUS = 0.04;
export const MOTE_RADIUS = 0.028;
/** An ink thorn's reach (the spark's own radius is added). */
export const THORN_RADIUS = 0.02;
/** Below this the spark has dropped out of sight behind the diorama: lost. */
export const LOST_Y = -0.24;

export type RunState = 'ready' | 'live' | 'lost' | 'won';

export type RunEvent =
  | { type: 'bounce'; speed: number; tag: number }
  | { type: 'mote'; index: number }
  | { type: 'revive'; from: [number, number] }
  | { type: 'lost'; thorn?: number }
  | { type: 'won' };

/** A spark's special power (see spark-face.ts). None of them is needed to finish a level. */
export type Power = 'none' | 'magnet' | 'revive' | 'foresight';
/** The Lodestone pulls in motes from this far (the plain reach is MOTE_RADIUS). */
export const MAGNET_RADIUS = 0.075;

export class RunSim {
  readonly spark = new Spark();
  readonly terrain: Poly[];
  state: RunState = 'ready';
  /** Seconds since the spark was last released. */
  time = 0;
  /** Seconds since the level began (all attempts). */
  total = 0;
  retries = 0;
  /** The spark touched a hand's shadow this attempt (build levels give a star for hands-off). */
  handTouched = false;
  readonly motes: boolean[];
  readonly events: RunEvent[] = [];
  /** The power of the spark in play. */
  power: Power = 'none';
  /** Ember's second chances left this drop. */
  revives = 0;
  /** Where the spark recently stood on the course's own ground, oldest first. */
  private readonly ledges: Array<[number, number]> = [];
  private ledgeClock = 0;
  private readonly scout = new Spark();

  constructor(readonly level: RunLevel) {
    this.terrain = level.terrain.map((points) => poly(points));
    this.motes = level.motes.map(() => false);
    this.spark.place(level.start[0], level.start[1]);
  }

  /** Lets the spark fall (from the start). */
  release(): void {
    this.spark.place(this.level.start[0], this.level.start[1]);
    this.state = 'live';
    this.time = 0;
    this.handTouched = false;
    this.revives = this.power === 'revive' ? 1 : 0;
    this.ledges.length = 0;
  }

  /** Puts the spark back at the start, waiting; a retry unless it was never released. */
  reset(countRetry = true): void {
    if (countRetry) this.retries++;
    this.spark.place(this.level.start[0], this.level.start[1]);
    this.state = 'ready';
    this.time = 0;
  }

  get motesTaken(): number {
    return this.motes.filter(Boolean).length;
  }

  step(dt: number, shadows: readonly Capsule[], extra: readonly Poly[] = []): void {
    this.events.length = 0;
    this.total += dt;
    if (this.state !== 'live') return;
    this.time += dt;
    const polys = extra.length ? [...this.terrain, ...extra] : this.terrain;
    this.spark.step(dt, shadows, polys, PAPER_BOUNDS);
    for (const c of this.spark.contacts) {
      this.events.push({ type: 'bounce', speed: c.speed, tag: c.tag });
      if (c.tag === TAG_HAND_LEFT || c.tag === TAG_HAND_RIGHT) this.handTouched = true;
    }
    const { x, y } = this.spark;
    // Remember where it stood on the course's own ground, a few tenths of a second back.
    this.ledgeClock += dt;
    if (this.ledgeClock > 0.12 && this.spark.airborne === 0 && this.onGround(x, y)) {
      this.ledgeClock = 0;
      this.ledges.push([x, y]);
      if (this.ledges.length > 5) this.ledges.shift();
    }
    const reach = this.power === 'magnet' ? MAGNET_RADIUS : MOTE_RADIUS;
    this.level.motes.forEach(([mx, my], i) => {
      if (!this.motes[i] && Math.hypot(x - mx, y - my) < reach) {
        this.motes[i] = true;
        this.events.push({ type: 'mote', index: i });
      }
    });
    // An ink thorn: the spark is lost at once (Ember's second chance does not save it).
    const thorns = this.level.thorns ?? [];
    for (let i = 0; i < thorns.length; i++) {
      if (Math.hypot(x - thorns[i][0], y - thorns[i][1]) < THORN_RADIUS + this.spark.r) {
        this.state = 'lost';
        this.events.push({ type: 'lost', thorn: i });
        return;
      }
    }
    const [gx, gy] = this.level.gate;
    if (Math.hypot(x - gx, y - gy) < GATE_RADIUS) {
      this.state = 'won';
      this.events.push({ type: 'won' });
    } else if (y < LOST_Y) {
      const ledge = this.ledges[0];
      if (this.revives > 0 && ledge) {
        // Ember's second chance: back on the last ledge, standing still.
        this.revives--;
        this.events.push({ type: 'revive', from: [x, y] });
        this.spark.place(ledge[0], ledge[1] + 0.002);
        this.ledges.length = 0;
      } else {
        this.state = 'lost';
        this.events.push({ type: 'lost' });
      }
    }
  }

  /** Is the course's own ground (not a shadow) just under the spark? */
  private onGround(x: number, y: number): boolean {
    const py = y - this.spark.r - 0.004;
    for (const piece of this.level.terrain) {
      let inside = false;
      for (let i = 0, j = piece.length - 1; i < piece.length; j = i++) {
        const [xi, yi] = piece[i];
        const [xj, yj] = piece[j];
        if (yi > py !== yj > py && x < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  /**
   * The Prism's foresight: where the next `seconds` take the spark if nothing
   * moves, found by running the same physics ahead on a copy. Writes up to
   * `out.length` points (every `every` steps of 1/60 s) and returns how many.
   */
  foresee(shadows: readonly Capsule[], extra: readonly Poly[], out: Array<[number, number]>, seconds = 0.6, every = 4): number {
    const scout = this.scout;
    scout.x = this.spark.x;
    scout.y = this.spark.y;
    scout.vx = this.spark.vx;
    scout.vy = this.spark.vy;
    const polys = extra.length ? [...this.terrain, ...extra] : this.terrain;
    const steps = Math.round(seconds * 60);
    let n = 0;
    for (let i = 1; i <= steps && n < out.length; i++) {
      scout.step(1 / 60, shadows, polys, PAPER_BOUNDS);
      if (scout.y < LOST_Y) break;
      if (i % every === 0) {
        out[n][0] = scout.x;
        out[n][1] = scout.y;
        n++;
      }
    }
    return n;
  }

  /** Stars: through the gate, all three motes, and inside par time (build levels: hands-off). */
  stars(): number {
    if (this.state !== 'won') return 0;
    const third = this.level.build ? !this.handTouched : this.time <= this.level.par;
    return 1 + (this.motesTaken === this.motes.length ? 1 : 0) + (third ? 1 : 0);
  }
}
