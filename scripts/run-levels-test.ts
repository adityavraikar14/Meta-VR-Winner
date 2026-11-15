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

function play(level: RunLevel, solved: boolean, wait = 0): { sim: RunSim; path: Array<[number, number]> } {
  const sim = new RunSim(level);
  // Waiting before the drop (for a patrolling thorn or a riding ring to come round).
  for (let t = 0; t < wait; t += DT) sim.step(DT, []);
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

/** Release delays tried on levels with moving parts: a player waits for the right moment. */
const WAITS = Array.from({ length: 41 }, (_, i) => i * 0.1);

let failed = 0;
for (const level of RUN_LEVELS) {
  const moving = !!(level.movers?.length || level.gateMove);
  const waits = moving ? WAITS : [0];
  const tries = waits.map((wait) => play(level, true, wait));
  const good = tries.filter((t) => t.sim.state === 'won').length;
  const { sim, path } = tries.find((t) => t.sim.state === 'won') ?? tries[0];
  const bare = play(level, false).sim;
  const ok = sim.state === 'won';
  // How close the solution's path comes to any ink thorn (it must not touch one, or it would not win).
  const thorns = level.thorns ?? [];
  const clearance = thorns.length ? Math.min(...path.flatMap(([x, y]) => thorns.map(([tx, ty]) => Math.hypot(x - tx, y - ty)))) : Infinity;
  const needsYou = bare.state !== 'won';
  // No shortcut: a spark that reaches the ring before it has the stars the ring needs is turned back.
  const cheat = new RunSim(level);
  cheat.release();
  cheat.spark.place(cheat.gateNow[0], cheat.gateNow[1]);
  cheat.step(DT, []);
  const sealedOk = cheat.needs === 0 || cheat.state !== 'won';
  // The win must come with at least the stars the ring asks for.
  const enough = !ok || sim.stars() >= sim.needs;
  if (!ok || !needsYou || !sealedOk || !enough) failed++;
  const trace = path
    .filter((_, i) => i % 3 === 0)
    .map(([x, y]) => `(${x.toFixed(2)},${y.toFixed(2)})`)
    .join(' ');
  console.log(
    `${ok && needsYou ? 'PASS' : 'FAIL'}  ${level.id.padEnd(12)} solved:${ok ? `gate in ${sim.time.toFixed(1)} s` : `no (${sim.state}, ended at ${sim.spark.x.toFixed(2)},${sim.spark.y.toFixed(2)})`}` +
      `  motes ${sim.motesTaken}/${sim.motes.length}  stars ${sim.stars()} (ring needs ${sim.needs})  · without you: ${bare.state}${thorns.length ? `  · thorns ${thorns.length}, closest ${(clearance * 100).toFixed(1)} cm` : ''}` +
      `${moving ? `  · timing: ${good}/${waits.length} release moments win` : ''}${sealedOk ? '' : '  · RING NOT SEALED'}`,
  );
  if (!ok || process.argv.includes('--trace')) console.log(`      path: ${trace}`);
}
if (failed) {
  console.log(`${failed} level(s) failed`);
  process.exit(1);
}
console.log('every level is finishable, and none finishes itself');
