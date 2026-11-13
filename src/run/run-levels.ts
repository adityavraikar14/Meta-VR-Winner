/**
 * Shadow Run levels: a spark of light, a paper course, a gate. Everything is
 * in paper metres (x right, y up, origin at the paper's centre; the paper is
 * 1.0 m × 0.7 m). Terrain is a list of convex polygons.
 *
 * Each level carries a `solution`: shadow shapes that solve it, used by the
 * solvability test (scripts/run-levels-test.ts) so every level is proven
 * finishable before anyone plays it.
 */

import type { ShardSpec } from './shards.js';

export type Pt = readonly [number, number];

export interface SolutionShape {
  /** A capsule from a to b with radius r (a hand's shadow, roughly). */
  a: Pt;
  b: Pt;
  r: number;
  /** Moving at this velocity (m/s) while active: a flick of the hand. */
  v?: Pt;
  /** Active from / until these times (s after the spark is released). */
  from?: number;
  to?: number;
  /** Instead of a capsule: a shard's shadow on the screen (convex, any winding). */
  poly?: Pt[];
}

export interface RunLevel {
  id: string;
  title: string;
  story: string;
  ask: string;
  /** Said after a few misses. */
  hint: string;
  terrain: Pt[][];
  start: Pt;
  gate: Pt;
  motes: Pt[];
  /** Seconds for the time star. */
  par: number;
  /** A shadow thinner than this (m) is needed somewhere: the caption reads out your scale. */
  showScale?: boolean;
  solution: SolutionShape[];
  /** Chapter (WORLDS index); 0 if absent. */
  world?: number;
  /** A build level: light shards to place, the spark dropped with a button, a star for hands-off. */
  build?: boolean;
  shards?: ShardSpec[];
  /** Where its best time is kept (default: its id). */
  bestKey?: string;
  /** The Workshop: the star and ring markers set the start and gate; a success starts the next try. */
  workshop?: boolean;
  /** Ink thorns: touch one and the spark is lost. Placed beside the path, to punish a careless shadow. */
  thorns?: Pt[];
}

/**
 * The course's floor: the lower part of the paper is hidden behind the
 * diorama in front of it, so courses live in the top half and a spark that
 * drops below this falls out of sight.
 */
const FLOOR = -0.15;

/**
 * Ground under a line of points, as one convex piece per segment (each a
 * quad down to the paper's bottom). Many short segments make a smooth curve,
 * which keeps the spark's speed: a sharp corner throws energy away.
 */
function ground(...points: Pt[]): Pt[][] {
  const pieces: Pt[][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    pieces.push([[x0, FLOOR], [x1, FLOOR], [x1, y1], [x0, y0]]);
  }
  return pieces;
}

export const RUN_LEVELS: RunLevel[] = [
  {
    id: 'run-bridge',
    title: 'First Light',
    story: 'A spark of the Great Lantern slipped past the witch. It can only stand on shadow; the ink below would swallow it.',
    ask: 'Hold your flat hand in the light: its shadow is the bridge',
    hint: 'Hold your hand flat, palm down, at chest height, until its shadow spans the gap',
    terrain: [
      [[-0.5, FLOOR], [-0.18, FLOOR], [-0.18, 0.1], [-0.5, 0.2]],
      [[0.14, FLOOR], [0.5, FLOOR], [0.5, 0.08], [0.14, 0.08]],
    ],
    start: [-0.43, 0.28],
    gate: [0.4, 0.115],
    motes: [[-0.06, 0.11], [0.05, 0.105], [0.24, 0.105]],
    par: 12,
    solution: [{ a: [-0.21, 0.088], b: [0.17, 0.068], r: 0.014 }],
  },
  {
    id: 'run-ramp',
    title: 'The Climb',
    story: 'The way out of the ink is a ledge above you. The spark has speed; give it a slope.',
    ask: 'Tilt your hand: make a ramp from the floor up to the ledge',
    hint: 'Fingertips higher than the wrist: the shadow of a tilted hand is a ramp',
    terrain: [
      // A smooth chute down to the floor, so the spark keeps its speed for the climb.
      ...ground([-0.5, 0.33], [-0.44, 0.22], [-0.38, 0.15], [-0.31, 0.06], [-0.23, 0.0], [-0.13, -0.04], [0.04, -0.05]),
      [[0.22, FLOOR], [0.5, FLOOR], [0.5, 0.08], [0.22, 0.08]],
    ],
    start: [-0.485, 0.33],
    gate: [0.4, 0.1],
    motes: [[0.06, 0.01], [0.15, 0.065], [0.3, 0.095]],
    par: 10,
    solution: [{ a: [0.0, -0.062], b: [0.235, 0.072], r: 0.014 }],
  },
  {
    id: 'run-kick',
    title: 'The Kick',
    story: 'The spark has fallen into a hollow of ink. A still shadow is ground; a moving one is a bat.',
    ask: 'Swing your hand up through the spark to kick it onto the high shelf',
    hint: 'Start with your hand low, then flick it up and to the right in one quick move',
    terrain: [
      [[-0.5, FLOOR], [0.0, FLOOR], [0.0, -0.1], [-0.5, 0.08]],
      [[0.0, FLOOR], [0.5, FLOOR], [0.5, 0.08], [0.0, -0.1]],
      [[0.26, 0.15], [0.5, 0.15], [0.5, 0.19], [0.26, 0.19]],
    ],
    start: [0.0, -0.06],
    gate: [0.42, 0.225],
    motes: [[0.11, 0.12], [0.19, 0.22], [0.3, 0.27]],
    par: 15,
    // A scoop: the shadow tilted down to the right, rising at about 1 m/s.
    solution: [{ a: [-0.093, -0.094], b: [0.05, -0.166], r: 0.016, v: [0.4, 0.95], from: 3.0, to: 3.1 }],
  },
  {
    id: 'run-long',
    title: 'Long Shadow',
    story: 'The gap is wider than your hand. But a shadow is not your hand: it is your hand times D ÷ d.',
    ask: 'Bring your hand toward the lantern (your face) to make its shadow longer',
    hint: 'The lantern is just behind your eyes: the closer your hand is to it, the bigger the shadow',
    terrain: [
      [[-0.5, FLOOR], [-0.28, FLOOR], [-0.28, 0.08], [-0.5, 0.18]],
      [[0.2, FLOOR], [0.5, FLOOR], [0.5, 0.06], [0.2, 0.06]],
    ],
    start: [-0.44, 0.25],
    gate: [0.41, 0.095],
    motes: [[-0.15, 0.085], [0.0, 0.08], [0.12, 0.075]],
    thorns: [[-0.06, 0.15], [0.19, 0.135]],
    par: 12,
    showScale: true,
    solution: [{ a: [-0.31, 0.07], b: [0.23, 0.048], r: 0.02 }],
  },
  {
    id: 'run-tunnel',
    title: 'The Low Tunnel',
    story: 'Under the ridge runs Morwen’s old drain, with a hole in its floor. A big, thick shadow will jam it.',
    ask: 'Bridge the hole with a thin shadow: hold your hand nearer the screen',
    hint: 'Move your hand away from your face, toward the screen: a smaller shadow is a thinner one',
    terrain: [
      [[-0.5, FLOOR], [-0.12, FLOOR], [-0.12, 0.0], [-0.5, 0.16]],
      [[0.04, FLOOR], [0.5, FLOOR], [0.5, 0.0], [0.04, 0.0]],
      // The tunnel's roof: low over the hole.
      [[-0.2, 0.07], [0.2, 0.07], [0.2, 0.55], [-0.2, 0.55]],
    ],
    start: [-0.45, 0.22],
    gate: [0.4, 0.028],
    motes: [[-0.06, 0.035], [0.08, 0.03], [0.25, 0.028]],
    thorns: [[-0.04, -0.07]],
    par: 12,
    showScale: true,
    solution: [{ a: [-0.14, -0.008], b: [0.06, -0.01], r: 0.01 }],
  },
  {
    id: 'run-twin',
    title: 'Twin Gaps',
    story: 'Two gaps, one spark, and the ink rising behind it: it will not wait for you.',
    ask: 'Use both hands: one shadow bridge for each gap',
    hint: 'Hold both hands flat in the light, one over each gap, before the spark arrives',
    terrain: [
      [[-0.5, FLOOR], [-0.27, FLOOR], [-0.27, 0.1], [-0.5, 0.2]],
      [[-0.12, FLOOR], [0.12, FLOOR], [0.12, 0.08], [-0.12, 0.085]],
      [[0.27, FLOOR], [0.5, FLOOR], [0.5, 0.06], [0.27, 0.06]],
    ],
    start: [-0.45, 0.26],
    gate: [0.42, 0.095],
    motes: [[-0.195, 0.09], [0.195, 0.07], [0.0, 0.12]],
    thorns: [[-0.19, -0.02], [0.2, -0.04], [0.0, 0.19]],
    par: 14,
    solution: [
      { a: [-0.29, 0.092], b: [-0.1, 0.08], r: 0.013 },
      { a: [0.1, 0.076], b: [0.29, 0.054], r: 0.013 },
    ],
  },
  // ---------------------------------------------------------------- Build: light shards
  {
    id: 'build-plank',
    world: 1,
    build: true,
    title: 'The Plank',
    story: 'Captain Rook the Corsair has flooded the river valley. Your hands are not the only things that cast shadows: glass shards of the Great Lantern float in the light.',
    ask: 'Pinch the shard, hold it in the light so its shadow bridges the gap, let go, then push Drop',
    hint: 'Pinch the glowing shard by your chest and lift it to eye height: watch its shadow, and line it up with the gap',
    terrain: [
      [[-0.5, FLOOR], [-0.15, FLOOR], [-0.15, 0.1], [-0.5, 0.18]],
      [[0.1, FLOOR], [0.5, FLOOR], [0.5, 0.08], [0.1, 0.08]],
    ],
    start: [-0.45, 0.24],
    gate: [0.41, 0.11],
    motes: [[-0.06, 0.115], [0.04, 0.11], [0.24, 0.105]],
    par: 15,
    shards: [{ kind: 'plank', at: [0.1, -0.2, 0.6] }],
    solution: [{ a: [0, 0], b: [0, 0], r: 0, poly: [[-0.17, 0.066], [0.12, 0.054], [0.12, 0.086], [-0.17, 0.098]] }],
  },
  {
    id: 'build-projection',
    world: 1,
    build: true,
    title: 'Projection',
    story: 'The gap is three times wider than the shard. But its shadow is the shard times D ÷ d.',
    ask: 'Hold the shard close to the lantern, near your face, until its shadow spans the gap',
    hint: 'The label on the shard reads its magnification: you need about ×3.5',
    terrain: [
      [[-0.5, FLOOR], [-0.3, FLOOR], [-0.3, 0.1], [-0.5, 0.17]],
      [[0.12, FLOOR], [0.5, FLOOR], [0.5, 0.08], [0.12, 0.08]],
    ],
    start: [-0.45, 0.23],
    gate: [0.41, 0.11],
    motes: [[-0.2, 0.12], [-0.05, 0.11], [0.06, 0.105]],
    par: 15,
    showScale: true,
    shards: [{ kind: 'plank', at: [0.1, -0.2, 0.6] }],
    solution: [{ a: [0, 0], b: [0, 0], r: 0, poly: [[-0.33, 0.04], [0.15, 0.026], [0.15, 0.086], [-0.33, 0.1]] }],
  },
  {
    id: 'build-launch',
    world: 1,
    build: true,
    title: 'Launch',
    story: 'Rook’s lookouts watch from a high ledge. A wedge of glass and a fast spark will get past them: angles do the rest.',
    ask: 'Set the wedge’s shadow as a ramp from the floor up to the ledge, then push Drop',
    hint: 'The wedge’s high corner must sit just above the ledge’s edge, or the spark bounces back off it',
    terrain: [
      ...ground([-0.5, 0.33], [-0.44, 0.22], [-0.38, 0.13], [-0.31, 0.05], [-0.23, 0.0], [-0.13, -0.04], [0.04, -0.05]),
      [[0.22, FLOOR], [0.5, FLOOR], [0.5, 0.04], [0.22, 0.04]],
    ],
    start: [-0.485, 0.33],
    gate: [0.4, 0.06],
    motes: [[0.06, -0.021], [0.16, 0.019], [0.3, 0.055]],
    par: 15,
    shards: [{ kind: 'wedge', at: [0.12, -0.2, 0.6] }],
    solution: [{ a: [0, 0], b: [0, 0], r: 0, poly: [[-0.03, -0.055], [0.24, -0.055], [0.24, 0.053]] }],
  },
  {
    id: 'build-slide',
    world: 1,
    build: true,
    title: 'The Slide',
    story: 'The spark will drop from high above the gap. Catch it on glass and let it run down to the gate.',
    ask: 'Hold the plank in the light and roll your wrist to tilt it: a slide from under the spark down to the ledge',
    hint: 'Tilt the plank about 20°, high end on the left under the spark, low end just above the ledge; about ×3',
    terrain: [[[0.25, FLOOR], [0.5, FLOOR], [0.5, -0.02], [0.25, -0.02]]],
    start: [-0.08, 0.3],
    gate: [0.4, 0.015],
    motes: [[-0.01, 0.14], [0.14, 0.085], [0.33, 0.01]],
    par: 15,
    shards: [{ kind: 'plank', at: [0.1, -0.2, 0.6] }],
    // A plank at ×3, turned −20°, its shadow centred at (0.08, 0.06).
    solution: [{ a: [0, 0], b: [0, 0], r: 0, poly: [[-0.099, 0.102], [-0.096, 0.096], [0.237, -0.025], [0.245, -0.023], [0.262, 0.023], [-0.082, 0.148]] }],
  },
  {
    id: 'build-pair',
    world: 1,
    build: true,
    title: 'Two Pieces',
    story: 'Two gaps and a pillar between them. One shard will not reach; two will.',
    ask: 'Place both planks: one shadow over each gap, resting on the pillar, then push Drop',
    hint: 'Each plank needs about ×2.6: hold them a little nearer your face than the screen',
    terrain: [
      [[-0.5, FLOOR], [-0.3, FLOOR], [-0.3, 0.1], [-0.5, 0.18]],
      [[-0.02, FLOOR], [0.04, FLOOR], [0.04, 0.08], [-0.02, 0.08]],
      [[0.32, FLOOR], [0.5, FLOOR], [0.5, 0.06], [0.32, 0.06]],
    ],
    start: [-0.45, 0.24],
    gate: [0.41, 0.095],
    motes: [[-0.16, 0.1], [0.01, 0.115], [0.18, 0.09]],
    thorns: [[0.0, -0.03], [0.17, 0.17]],
    par: 15,
    shards: [
      { kind: 'plank', at: [-0.02, -0.2, 0.6] },
      { kind: 'plank', at: [0.17, -0.2, 0.6] },
    ],
    // Two planks at ×2.6, nearly level, one over each gap.
    solution: [
      { a: [0, 0], b: [0, 0], r: 0, poly: [[-0.321, 0.065], [-0.312, 0.06], [-0.005, 0.05], [-0.003, 0.091], [-0.003, 0.096], [-0.32, 0.107]] },
      { a: [0, 0], b: [0, 0], r: 0, poly: [[0.023, 0.041], [0.33, 0.03], [0.34, 0.034], [0.341, 0.076], [0.025, 0.087], [0.024, 0.082]] },
    ],
  },
];
