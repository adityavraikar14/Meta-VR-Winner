import type { Pt } from './run-levels.js';

/**
 * The light shards' shapes and their shadows, with no 3D dependencies (so the
 * Node tests can prove courses built from them).
 *
 * A point P in paper space (the screen is z = 0, the lantern at L, Lz in
 * front) casts its shadow at P′ = L + (P − L)·t with t = Lz ÷ (Lz − Pz). A
 * shard's shadow is the convex hull of its corners, front and back faces,
 * projected that way: a uniform scale about L by D ÷ d, slightly more for the
 * nearer face.
 */

/** Planks, wedges and blocks are ground; the star and ring are the Workshop's start and gate markers. */
export type ShardKind = 'plank' | 'wedge' | 'block' | 'beam' | 'pillar' | 'disc' | 'bump' | 'star' | 'ring';

export const THICKNESS = 0.012;

export const OUTLINES: Record<ShardKind, Pt[]> = {
  plank: [[-0.06, -0.008], [0.06, -0.008], [0.06, 0.008], [-0.06, 0.008]],
  // A 22° wedge: steeper ones meet the floor in a corner that eats the spark's speed.
  wedge: [[-0.05, -0.02], [0.05, -0.02], [0.05, 0.02]],
  block: [[-0.025, -0.025], [0.025, -0.025], [0.025, 0.025], [-0.025, 0.025]],
  // Workshop pieces: a long beam, a tall pillar, a round disc to roll off, a curved bump.
  beam: [[-0.1, -0.007], [0.1, -0.007], [0.1, 0.007], [-0.1, 0.007]],
  pillar: [[-0.009, -0.04], [0.009, -0.04], [0.009, 0.04], [-0.009, 0.04]],
  disc: Array.from({ length: 14 }, (_, i): Pt => [Math.cos((i / 14) * Math.PI * 2) * 0.024, Math.sin((i / 14) * Math.PI * 2) * 0.024]),
  bump: [[-0.045, -0.012], [0.045, -0.012], ...Array.from({ length: 9 }, (_, i): Pt => [Math.cos(((i + 1) / 10) * Math.PI) * 0.045, -0.012 + Math.sin(((i + 1) / 10) * Math.PI) * 0.03])],
  star: Array.from({ length: 10 }, (_, i): Pt => {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.011 : 0.026;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }),
  ring: Array.from({ length: 24 }, (_, i): Pt => [Math.cos((i / 24) * Math.PI * 2) * 0.026, Math.sin((i / 24) * Math.PI * 2) * 0.026]),
};

/** The ring's hole (clockwise, as a hole must be). */
export const RING_HOLE: Pt[] = Array.from({ length: 24 }, (_, i): Pt => [Math.cos((-i / 24) * Math.PI * 2) * 0.017, Math.sin((-i / 24) * Math.PI * 2) * 0.017]);

/** Markers place things on the screen with their shadows; they are not ground. */
export function isMarker(kind: ShardKind): boolean {
  return kind === 'star' || kind === 'ring';
}

export type Lantern = readonly [number, number, number];

/** D ÷ d for a point this far in front of the screen. */
export function shadowScale(z: number, lantern: Lantern): number {
  return lantern[2] / (lantern[2] - z);
}

/** Where a point's shadow falls on the screen. */
export function shadowOf(x: number, y: number, z: number, lantern: Lantern): [number, number] {
  const [lx, ly] = lantern;
  const t = shadowScale(z, lantern);
  return [lx + (x - lx) * t, ly + (y - ly) * t];
}

/** A shard's shadow on the screen: the counter-clockwise hull of its projected corners. */
export function shardShadow(kind: ShardKind, x: number, y: number, z: number, angle: number, lantern: Lantern): Array<[number, number]> {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts: Array<[number, number]> = [];
  for (const [ox, oy] of OUTLINES[kind]) {
    const px = x + ox * c - oy * s;
    const py = y + ox * s + oy * c;
    for (const dz of [-THICKNESS / 2, THICKNESS / 2]) pts.push(shadowOf(px, py, z + dz, lantern));
  }
  return convexHull(pts);
}

/**
 * Where to hold a shard so its centre's shadow falls at (X, Y): along the
 * line from the lantern through that point, at depth z.
 */
export function holdFor(X: number, Y: number, z: number, lantern: Lantern): [number, number, number] {
  const [lx, ly] = lantern;
  const t = shadowScale(z, lantern);
  return [lx + (X - lx) / t, ly + (Y - ly) / t, z];
}

/** Andrew's monotone chain: counter-clockwise hull of 2D points. */
export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
