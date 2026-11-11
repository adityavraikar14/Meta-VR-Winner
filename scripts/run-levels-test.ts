/**
 * Proves every Shadow Run level is finishable, and that it needs the player
 * (run: npm run test:levels). For each level:
 *   - with its solution shapes, the spark must reach the gate;
 *   - with no shadows at all, it must not.
 * Prints the time and motes the solution gets, to tune par times and mote spots.
 */
import { RUN_LEVELS, type RunLevel } from '../src/run/run-levels.js';
import { RunSim } from '../src/run/run-sim.js';
import { type Capsule, capsule, type Poly, poly, TAG_HAND_RIGHT, TAG_SHARD } from '../src/run/spark-physics.js';

const DT = 1 / 72;
const LIMIT = 25;

function play(level: RunLevel, solved: boolean): { sim: RunSim; path: Array<[number, number]> } {
  const sim = new RunSim(level);
  sim.release();
  const path: Array<[number, number]> = [];
  while (sim.state === 'live' && sim.time < LIMIT) {
    const t = sim.time;
    const shapes: Capsule[] = [];
    const shards: Poly[] = [];
    if (solved) {
      for (const s of level.solution) {
        if (s.poly) {
          shards.push(poly(s.poly, TAG_SHARD));
          continue;
        }
        const from = s.from ?? 0;
        const to = s.to ?? Infinity;
        if (t < from || t > to) continue;
        const [vx, vy] = s.v ?? [0, 0];
        const dt = t - from;
        const c = capsule(s.a[0] + vx * dt, s.a[1] + vy * dt, s.b[0] + vx * dt, s.b[1] + vy * dt, s.r, TAG_HAND_RIGHT, 0.55, 0.06);
        c.vax = c.vbx = vx;
        c.vay = c.vby = vy;
        shapes.push(c);
      }
    }
    sim.step(DT, shapes, shards);
    if (Math.round(sim.time * 72) % 9 === 0) path.push([sim.spark.x, sim.spark.y]);
  }
  return { sim, path };
}

let failed = 0;
for (const level of RUN_LEVELS) {
  const { sim, path } = play(level, true);
  const bare = play(level, false).sim;
  const ok = sim.state === 'won';
  const needsYou = bare.state !== 'won';
  if (!ok || !needsYou) failed++;
  const trace = path
    .filter((_, i) => i % 3 === 0)
    .map(([x, y]) => `(${x.toFixed(2)},${y.toFixed(2)})`)
    .join(' ');
  console.log(
    `${ok && needsYou ? 'PASS' : 'FAIL'}  ${level.id.padEnd(12)} solved:${ok ? `gate in ${sim.time.toFixed(1)} s` : `no (${sim.state}, ended at ${sim.spark.x.toFixed(2)},${sim.spark.y.toFixed(2)})`}` +
      `  motes ${sim.motesTaken}/${sim.motes.length}  stars ${sim.stars()}  · without you: ${bare.state}`,
  );
  if (!ok || process.argv.includes('--trace')) console.log(`      path: ${trace}`);
}
if (failed) {
  console.log(`${failed} level(s) failed`);
  process.exit(1);
}
console.log('every level is finishable, and none finishes itself');
