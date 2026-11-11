/**
 * The Workshop's demonstration course must carry the spark from the star's
 * shadow to the ring's (run: npm run test:workshop). Also checks that each
 * build level's solution shadow is one its shard can actually cast at a
 * depth the game allows.
 */
import { RUN_LEVELS, type RunLevel } from '../src/run/run-levels.js';
import { RunSim } from '../src/run/run-sim.js';
import { isMarker, type Lantern, shadowOf, shardShadow } from '../src/run/shard-shapes.js';
import { poly, TAG_SHARD } from '../src/run/spark-physics.js';
import { DEMO } from '../src/run/workshop.js';

const LANTERN: Lantern = [0, -0.1, 1.1];
let failed = 0;

{
  const star = DEMO.find((s) => s.kind === 'star')!;
  const ring = DEMO.find((s) => s.kind === 'ring')!;
  const level: RunLevel = {
    id: 'workshop-demo', title: '', story: '', ask: '', hint: '',
    terrain: [], motes: [], par: 99, solution: [],
    start: shadowOf(star.at[0], star.at[1], star.at[2], LANTERN),
    gate: shadowOf(ring.at[0], ring.at[1], ring.at[2], LANTERN),
  };
  const ground = DEMO.filter((s) => !isMarker(s.kind)).map((s) =>
    poly(shardShadow(s.kind, s.at[0], s.at[1], s.at[2], ((s.angle ?? 0) * Math.PI) / 180, LANTERN), TAG_SHARD),
  );
  const sim = new RunSim(level);
  sim.release();
  const path: string[] = [];
  while (sim.state === 'live' && sim.time < 15) {
    sim.step(1 / 72, [], ground);
    if (Math.round(sim.time * 72) % 18 === 0) path.push(`(${sim.spark.x.toFixed(2)},${sim.spark.y.toFixed(2)})`);
  }
  const ok = sim.state === 'won';
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  workshop demo: start (${level.start.map((n) => n.toFixed(2))}) gate (${level.gate.map((n) => n.toFixed(2))}) → ${sim.state} in ${sim.time.toFixed(1)} s`);
  if (!ok) console.log(`      path: ${path.join(' ')}`);
}

// Each build level's solution shadow, matched against its shard at the depth that gives the same length.
for (const level of RUN_LEVELS.filter((l) => l.build && l.shards?.length)) {
  const shard = level.shards![0];
  const want = level.solution.find((s) => s.poly)!.poly!;
  const span = (pts: ReadonlyArray<readonly [number, number]>) => Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const target = span(want);
  // Depths the game allows: 20% to 80% of the lantern's distance.
  let best = { z: 0, error: Infinity };
  for (let z = 0.22; z <= 0.88; z += 0.002) {
    const got = span(shardShadow(shard.kind, 0, 0, z, 0, LANTERN));
    const error = Math.abs(got - target);
    if (error < best.error) best = { z, error };
  }
  const ok = best.error < 0.01;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${level.id}: a ${shard.kind} casts the ${target.toFixed(2)} m solution at ${Math.round((1 - best.z / LANTERN[2]) * 1000) / 10}% of the way from the lantern (z = ${best.z.toFixed(2)} m, off by ${(best.error * 1000).toFixed(0)} mm)`);
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('the workshop demo works, and every build solution is castable');
