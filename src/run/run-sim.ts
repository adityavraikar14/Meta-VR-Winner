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
/** Below this the spark has dropped out of sight behind the diorama: lost. */
export const LOST_Y = -0.24;

export type RunState = 'ready' | 'live' | 'lost' | 'won';

export type RunEvent =
  | { type: 'bounce'; speed: number; tag: number }
  | { type: 'mote'; index: number }
  | { type: 'lost' }
  | { type: 'won' };

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
    this.level.motes.forEach(([mx, my], i) => {
      if (!this.motes[i] && Math.hypot(x - mx, y - my) < MOTE_RADIUS) {
        this.motes[i] = true;
        this.events.push({ type: 'mote', index: i });
      }
    });
    const [gx, gy] = this.level.gate;
    if (Math.hypot(x - gx, y - gy) < GATE_RADIUS) {
      this.state = 'won';
      this.events.push({ type: 'won' });
    } else if (y < LOST_Y) {
      this.state = 'lost';
      this.events.push({ type: 'lost' });
    }
  }

  /** Stars: through the gate, all three motes, and inside par time (build levels: hands-off). */
  stars(): number {
    if (this.state !== 'won') return 0;
    const third = this.level.build ? !this.handTouched : this.time <= this.level.par;
    return 1 + (this.motesTaken === this.motes.length ? 1 : 0) + (third ? 1 : 0);
  }
}
