import { Vector3 } from '@iwsdk/core';
import { recognise } from '../src/fight/sketch.ts';
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
// Drawn on a tilted plane, with hand wobble, at hand speed (a point every 7 mm).
function draw(path: Array<[number, number]>, closed: boolean, wobble = 0.002): Vector3[] {
  const pts: Vector3[] = [];
  const tilt = 0.4;
  const seq = closed ? [...path, path[0]] : path;
  for (let i = 1; i < seq.length; i++) {
    const [x0, y0] = seq[i - 1], [x1, y1] = seq[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.007));
    for (let k = 0; k < n; k++) {
      const x = x0 + ((x1 - x0) * k) / n + rnd() * wobble;
      const y = y0 + ((y1 - y0) * k) / n + rnd() * wobble;
      pts.push(new Vector3(x, y * Math.cos(tilt), y * Math.sin(tilt) + rnd() * wobble));
    }
  }
  if (closed) pts.push(pts[0].clone().add(new Vector3(0.006, 0.004, 0)));
  return pts;
}
const poly = (n: number, r: number, inner = 0, rot = 0): Array<[number, number]> => Array.from({ length: inner ? n * 2 : n }, (_, i) => {
  const a = rot + (i / (inner ? n * 2 : n)) * Math.PI * 2;
  const rr = inner && i % 2 ? inner : r;
  return [Math.cos(a) * rr, Math.sin(a) * rr];
});
const cases: Array<[string, Vector3[], boolean, string | null]> = [
  ['circle', draw(poly(40, 0.08), true), true, 'circle'],
  ['small circle', draw(poly(30, 0.04), true), true, 'circle'],
  ['triangle', draw(poly(3, 0.09, 0, Math.PI / 2), true), true, 'triangle'],
  ['star', draw(poly(5, 0.1, 0.04, Math.PI / 2), true), true, 'star'],
  ['blade', draw([[-0.02, -0.15], [0.02, -0.15], [0.02, 0.13], [0, 0.17], [-0.02, 0.13]], true), true, 'sword'],
  ['square', draw(poly(4, 0.09, 0, Math.PI / 4), true), true, 'box'],
  ['rectangle', draw([[-0.1, -0.06], [0.1, -0.06], [0.1, 0.06], [-0.1, 0.06]], true), true, 'box'],
  ['blob', draw([[0, 0], [0.08, 0.02], [0.1, 0.07], [0.05, 0.1], [-0.02, 0.08], [-0.04, 0.03]], true), true, null],
  ['zigzag', draw([[0, 0], [0.04, 0.06], [0.0, 0.1], [0.05, 0.16], [0.01, 0.2], [0.06, 0.26]], false), false, 'zigzag'],
  ['spiral', draw(Array.from({ length: 60 }, (_, i) => [Math.cos(i * 0.32) * (0.02 + i * 0.0015), Math.sin(i * 0.32) * (0.02 + i * 0.0015)] as [number, number]), false), false, 'spiral'],
  ['line', draw([[0, 0], [0.25, 0.05]], false), false, null],
  ['arc', draw(Array.from({ length: 12 }, (_, i) => [Math.cos(i * 0.2) * 0.12, Math.sin(i * 0.2) * 0.12] as [number, number]), false), false, null],
  ['L', draw([[0, 0.2], [0, 0], [0.15, 0]], false), false, null],
];
let bad = 0;
for (const [name, pts, closed, want] of cases) {
  const got = recognise(pts, closed);
  const ok = got === want;
  if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', name.padEnd(13), 'got', got, 'want', want);
}
console.log(bad ? `${bad} wrong` : 'all drawings recognised');
