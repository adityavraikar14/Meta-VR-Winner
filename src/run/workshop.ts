import type { RunLevel } from './run-levels.js';
import { holdFor, type Lantern, type ShardKind } from './shard-shapes.js';
import type { ShardSpec } from './shards.js';

/**
 * The Workshop: build your own Shadow Run course. You build in 3D, and the
 * game happens in shadow: the star's shadow is where the spark drops, the
 * ring's shadow is the gate, and the glass pieces' shadows are the ground.
 * Arrange them in the light, push Drop, and catch or steer the spark with
 * your hands. Your design is saved on the device every time you drop.
 */

const KEY = 'shadowplay.workshop.v1';

/**
 * The default layout: the star and ring already in the light (their shadows
 * upper left and right), the glass pieces on a shelf at chest height. In
 * paper space; z is the distance in front of the screen (the eyes are at 1 m).
 */
const DEFAULT: ShardSpec[] = [
  { kind: 'star', at: [-0.182, 0.06, 0.6] },
  { kind: 'ring', at: [0.16, -0.055, 0.6] },
  { kind: 'plank', at: [-0.21, -0.2, 0.62] },
  { kind: 'plank', at: [-0.12, -0.2, 0.62] },
  { kind: 'wedge', at: [-0.03, -0.2, 0.62] },
  { kind: 'wedge', at: [0.05, -0.2, 0.62] },
  { kind: 'block', at: [0.13, -0.2, 0.62] },
  { kind: 'block', at: [0.2, -0.2, 0.62] },
];

const KINDS: ShardKind[] = ['plank', 'wedge', 'block', 'star', 'ring'];

/** The lantern in paper space (stage.ts: 12 cm below the paper's centre line minus 22 cm, 1.1 m out). */
const LANTERN: Lantern = [0, -0.1, 1.1];

/** A piece held so its shadow's centre falls at (X, Y) on the screen, at depth z, turned `angle` degrees. */
function shadowAt(kind: ShardKind, X: number, Y: number, z: number, angle = 0): ShardSpec {
  return { kind, at: holdFor(X, Y, z, LANTERN), angle };
}

/**
 * A demonstration course (dev key ]): two planks held at ×3, end to end, a
 * gentle 15° slope from under the star to the ring. npm run test:workshop
 * proves it carries the spark through the gate.
 */
export const DEMO: ShardSpec[] = [
  shadowAt('star', -0.4, 0.25, 0.6),
  shadowAt('ring', 0.35, 0.0, 0.6),
  shadowAt('plank', -0.24, 0.12, 0.733, -15),
  shadowAt('plank', 0.09, 0.03, 0.733, -15),
  DEFAULT[4],
  DEFAULT[5],
  DEFAULT[6],
  DEFAULT[7],
];

function load(): ShardSpec[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { shards?: ShardSpec[] } | null;
    const shards = saved?.shards;
    if (
      Array.isArray(shards) &&
      shards.length === DEFAULT.length &&
      shards.every((s) => KINDS.includes(s.kind) && Array.isArray(s.at) && s.at.length === 3 && s.at.every(Number.isFinite))
    ) {
      return shards;
    }
  } catch {
    // Nothing saved, or storage blocked: the default layout.
  }
  return DEFAULT;
}

export function saveWorkshop(shards: ShardSpec[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, shards }));
  } catch {
    // Not saved; the design still plays.
  }
}

export function resetWorkshop(): ShardSpec[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Fine: the default is used anyway.
  }
  return DEFAULT;
}

/** The Workshop as a level: no ground of its own, everything is yours. */
export function workshopLevel(): RunLevel {
  return {
    id: 'workshop',
    title: 'The Workshop',
    story: 'Build your own course. The star’s shadow is where the spark drops, the ring’s shadow is the gate, and the glass is the ground.',
    ask: 'Pinch the glass into the light to build a path from the star to the ring, then push Drop',
    hint: 'Bring a piece toward your face to make its shadow bigger; roll your wrist to tilt it',
    terrain: [],
    start: [-0.4, 0.25],
    gate: [0.35, 0.0],
    motes: [],
    par: 999,
    solution: [],
    world: 0,
    build: true,
    workshop: true,
    shards: load(),
  };
}
