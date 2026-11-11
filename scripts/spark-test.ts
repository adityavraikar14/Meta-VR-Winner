/**
 * Physics checks for the spark (run: npm run test:spark). Each prints PASS or FAIL.
 */
import { box, capsule, GRAVITY, poly, Spark, SPARK_RADIUS, TAG_HAND_RIGHT } from '../src/run/spark-physics.js';

const bounds = { hw: 0.5, hh: 0.35 };
const DT = 1 / 72;
let failed = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failed++;
}

// 1. Dropped on a floor from 20 cm: bounces low (restitution 0.25), then rests on top.
{
  const s = new Spark();
  const floor = box(-0.5, -0.3, 0.5, -0.2);
  s.place(0, 0);
  let apex = Number.NaN;
  let falling = true;
  for (let i = 0; i < 72 * 3; i++) {
    s.step(DT, [], [floor], bounds);
    if (falling && s.vy > 0) falling = false;
    if (!falling && s.vy <= 0 && Number.isNaN(apex)) apex = s.y;
  }
  const rest = -0.2 + SPARK_RADIUS;
  const h0 = 0 - rest;
  check('drop: first bounce ≈ e²·h', apex > rest && apex - rest < 0.25 * h0, `bounce ${((apex - rest) * 100).toFixed(1)} cm of ${(h0 * 100).toFixed(0)} cm`);
  check('drop: comes to rest on the floor', Math.abs(s.y - rest) < 0.002 && Math.abs(s.vy) < 0.05, `y=${s.y.toFixed(4)} vy=${s.vy.toFixed(3)}`);
}

// 2. No tunnelling: at full speed into a thin shadow (a 6 mm finger bone), it bounces back.
{
  const s = new Spark();
  const finger = capsule(0.1, -0.2, 0.1, 0.2, 0.006, TAG_HAND_RIGHT);
  s.place(-0.3, 0);
  s.vx = 3;
  let crossed = false;
  let turned = false;
  for (let i = 0; i < 72; i++) {
    s.step(DT, [finger], [], bounds, 0);
    if (s.x > 0.1) crossed = true;
    if (s.vx < 0) turned = true;
  }
  check('no tunnelling at 3 m/s through a 6 mm shadow', !crossed && turned, `stayed left of the shadow, bounced back`);
}

// 3. A moving shadow bats the spark: a palm rising at 1 m/s under a resting spark throws it up.
{
  const s = new Spark();
  const palm = capsule(-0.1, -0.2, 0.1, -0.2, 0.01, TAG_HAND_RIGHT);
  s.place(0, -0.2 + 0.01 + SPARK_RADIUS);
  palm.vay = palm.vby = 1;
  for (let i = 0; i < 3; i++) {
    palm.ay += DT;
    palm.by += DT;
    s.step(DT, [palm], [], bounds);
  }
  check('a rising shadow throws the spark (about (1+e)·v)', s.vy > 1.2, `vy=${s.vy.toFixed(2)} m/s`);
}

// 4. Rolls down a 15° slope (a block with friction 0.35 would stick there).
{
  const s = new Spark();
  const angle = (15 * Math.PI) / 180;
  const slope = poly([[-0.5, -0.3], [0.5, -0.3], [0.5, -0.3 + Math.tan(angle) * 0.0001], [-0.5, -0.3 + Math.tan(angle)]]);
  s.place(-0.3, -0.3 + Math.tan(angle) * 0.8 + SPARK_RADIUS + 0.002);
  for (let i = 0; i < 72; i++) s.step(DT, [], [slope], bounds);
  const ideal = GRAVITY * Math.sin(angle);
  check('rolls down a gentle slope', s.vx > 0.3 * ideal, `after 1 s: ${s.vx.toFixed(2)} m/s (frictionless ${ideal.toFixed(2)})`);
}

// 5. Off the bottom of the paper is a miss: nothing catches it.
{
  const s = new Spark();
  s.place(0, 0);
  for (let i = 0; i < 72 * 2; i++) s.step(DT, [], [], bounds);
  check('falls off the bottom with nothing below', s.y < -bounds.hh, `y=${s.y.toFixed(2)}`);
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('all spark checks passed');
