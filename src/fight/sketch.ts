import { Vector3 } from '@iwsdk/core';

/**
 * What a drawing is: a few simple shapes become weapons when drawn.
 *
 *   sword     a long, thin closed shape (a blade outline)
 *   star      a closed star: deep points all round
 *   triangle  a closed shape with three corners (a spearhead)
 *   circle    a round closed shape (a ball)
 *   zigzag    an open line that turns sharply back and forth (lightning)
 *   spiral    an open line that winds round and round (a boomerang's spin)
 *   box       a closed shape with four corners (a shield, or a wall)
 *
 * Anything else stays what it was: an open line is ink, a closed shape
 * comes alive as a creature. Works on the drawing's own plane, whatever way
 * you faced while drawing it.
 */
export type Sketch = 'sword' | 'star' | 'triangle' | 'circle' | 'zigzag' | 'spiral' | 'box';

export const SKETCH_NAMES: Record<Sketch, string> = {
  sword: 'a sword',
  star: 'a star',
  triangle: 'a spearhead',
  circle: 'a ball',
  zigzag: 'lightning',
  spiral: 'a whirl',
  box: 'a box',
};

type P = [number, number];

/** The drawing flattened onto its own best-fitting plane. */
function flatten(points: readonly Vector3[]): P[] {
  const n = points.length;
  const c = new Vector3();
  for (const p of points) c.add(p);
  c.divideScalar(n);
  // Covariance, then its two main axes by power iteration.
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += d[i] * d[j];
  }
  const mul = (v: number[]) => [0, 1, 2].map((i) => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map((x) => x / l);
  };
  let a = norm([1, 0.3, 0.2]);
  for (let k = 0; k < 30; k++) a = norm(mul(a));
  let b = norm([0.2, 1, 0.3]);
  for (let k = 0; k < 30; k++) {
    b = mul(b);
    const dot = b[0] * a[0] + b[1] * a[1] + b[2] * a[2];
    b = norm([b[0] - dot * a[0], b[1] - dot * a[1], b[2] - dot * a[2]]);
  }
  return points.map((p) => {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    return [d[0] * a[0] + d[1] * a[1] + d[2] * a[2], d[0] * b[0] + d[1] * b[1] + d[2] * b[2]] as P;
  });
}

/** The path, resampled to `n` evenly spaced points. */
function resample(path: P[], n: number): P[] {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  if (length === 0) return [path[0]];
  const step = length / (n - 1);
  const out: P[] = [path[0]];
  let carried = 0;
  for (let i = 1; i < path.length && out.length < n; i++) {
    let [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    let seg = Math.hypot(x1 - x0, y1 - y0);
    while (carried + seg >= step && out.length < n) {
      const t = (step - carried) / seg;
      x0 += (x1 - x0) * t;
      y0 += (y1 - y0) * t;
      out.push([x0, y0]);
      seg = Math.hypot(x1 - x0, y1 - y0);
      carried = 0;
    }
    carried += seg;
  }
  while (out.length < n) out.push(path[path.length - 1]);
  return out;
}

function area(path: P[]): number {
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const [x0, y0] = path[i];
    const [x1, y1] = path[(i + 1) % path.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
}

function hull(points: P[]): P[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Turning at each point, over a few points either side (radians, signed). */
function turns(path: P[], closed: boolean, k = 3): number[] {
  const n = path.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? path[(i - k + n) % n] : path[Math.max(0, i - k)];
    const b = path[i];
    const c = closed ? path[(i + k) % n] : path[Math.min(n - 1, i + k)];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = h2 - h1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    out.push(a === b || b === c ? 0 : d);
  }
  return out;
}

/** Sharp corners: local peaks of turning above `min` radians. */
function corners(t: number[], closed: boolean, min: number): number[] {
  const n = t.length;
  const at: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.abs(t[i]);
    if (v < min) continue;
    const prev = Math.abs(t[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]);
    const next = Math.abs(t[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]);
    if (v >= prev && v > next) at.push(i);
  }
  return at;
}

/** Recognise a finished drawing (points relative to anywhere), or null. */
export function recognise(points: readonly Vector3[], closed: boolean): Sketch | null {
  if (points.length < 8) return null;
  const flat = flatten(points);
  const path = resample(flat, 64);
  // Size and shape of the spread: aspect from the extents along the main axes.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h);
  if (size < 0.04) return null;
  const aspect = size / Math.max(1e-4, Math.min(w, h));
  let perimeter = 0;
  for (let i = 1; i < path.length; i++) perimeter += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);

  if (closed) {
    const ring = path.slice(0, -1);
    const a = area(ring);
    const roundness = (4 * Math.PI * a) / (perimeter * perimeter);
    const solidity = a / Math.max(1e-6, area(hull(ring)));
    const t = turns(ring, true);
    const sharp = corners(t, true, 0.9).length;
    if (aspect > 3 && roundness < 0.6) return 'sword';
    if (solidity < 0.72 && sharp >= 6) return 'star';
    if (roundness > 0.8 && sharp <= 1) return 'circle';
    if (sharp >= 3 && sharp <= 4 && solidity > 0.85 && roundness < 0.72 && roundness > 0.45) {
      // Three clear corners (a fourth is often where the pen started).
      const strong = corners(t, true, 1.4).length;
      if (strong === 3 || (sharp === 3 && strong >= 2)) return 'triangle';
    }
    if (sharp >= 4 && sharp <= 5 && solidity > 0.88 && roundness > 0.66 && roundness < 0.84 && aspect < 2.2) return 'box';
    return null;
  }

  const t = turns(path, false, 2);
  const total = t.reduce((s, v) => s + v, 0);
  if (Math.abs(total) > Math.PI * 3) return 'spiral';
  const sharp = corners(t, false, 1.2);
  if (sharp.length >= 3) {
    // A zigzag turns one way, then the other, again and again.
    let flips = 0;
    for (let i = 1; i < sharp.length; i++) if (Math.sign(t[sharp[i]]) !== Math.sign(t[sharp[i - 1]])) flips++;
    if (flips >= 2) return 'zigzag';
  }
  return null;
}
