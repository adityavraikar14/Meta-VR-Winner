/**
 * Shadow Run levels: a spark of light, a paper course, a gate. Everything is
 * in paper metres (x right, y up, origin at the paper's centre; the paper is
 * 1.0 m × 0.7 m). Terrain is a list of convex polygons.
 *
 * Each level carries a `solution`: shadow shapes that solve it, used by the
 * solvability test (scripts/run-levels-test.ts) so every level is proven
 * finishable before anyone plays it.
 */

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
    story: 'A spark of the Great Lantern is loose on the screen. It can only touch shadow.',
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
    story: 'The way on is a ledge above you. The spark has speed; give it a slope.',
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
    story: 'The spark has fallen into a hollow. A still shadow is ground; a moving one is a bat.',
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
    par: 12,
    showScale: true,
    solution: [{ a: [-0.31, 0.07], b: [0.23, 0.048], r: 0.02 }],
  },
  {
    id: 'run-tunnel',
    title: 'The Low Tunnel',
    story: 'Under the ridge runs a low tunnel with a hole in its floor. A big, thick shadow will jam it.',
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
    par: 12,
    showScale: true,
    solution: [{ a: [-0.14, -0.008], b: [0.06, -0.01], r: 0.01 }],
  },
  {
    id: 'run-twin',
    title: 'Twin Gaps',
    story: 'Two gaps, one spark, and it will not wait for you.',
    ask: 'Use both hands: one shadow bridge for each gap',
    hint: 'Hold both hands flat in the light, one over each gap, before the spark arrives',
    terrain: [
      [[-0.5, FLOOR], [-0.3, FLOOR], [-0.3, 0.1], [-0.5, 0.2]],
      [[-0.08, FLOOR], [0.06, FLOOR], [0.06, 0.08], [-0.08, 0.085]],
      [[0.28, FLOOR], [0.5, FLOOR], [0.5, 0.06], [0.28, 0.06]],
    ],
    start: [-0.45, 0.26],
    gate: [0.42, 0.095],
    motes: [[-0.19, 0.09], [0.17, 0.07], [0.0, 0.12]],
    par: 12,
    solution: [
      { a: [-0.32, 0.092], b: [-0.06, 0.08], r: 0.013 },
      { a: [0.04, 0.076], b: [0.3, 0.054], r: 0.013 },
    ],
  },
];
