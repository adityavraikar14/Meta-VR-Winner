import { play } from '../progress.js';
import type { Pt, RunLevel, SolutionShape } from './run-levels.js';
import { RunSim } from './run-sim.js';
import { capsule, TAG_HAND_RIGHT } from './spark-physics.js';

/**
 * The Daily Light: one Shadow Run course a day, the same for everyone that
 * day (it is generated from the date), with a best time and a day streak.
 *
 * Generation is seeded (mulberry32 from YYYYMMDD) and every candidate is
 * proven before it is used: the course is played in the physics simulation
 * with a flat shadow bridging each gap (it must reach the gate) and with no
 * shadows at all (it must not). The par time comes from that proof run.
 */

const FLOOR = -0.15;
const BRIDGE_RADIUS = 0.013;
/** Lowest top an island may have: the spark stays well above the lost line. */
const LOWEST = -0.1;

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function box(x0: number, x1: number, top: number): Pt[] {
  return [[x0, FLOOR], [x1, FLOOR], [x1, top], [x0, top]];
}

/** One candidate course from the random stream (not yet proven). */
function candidate(rand: () => number): { terrain: Pt[][]; start: Pt; gate: Pt; motes: Pt[]; solution: SolutionShape[] } {
  const r = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const terrain: Pt[][] = [];
  // The start: a ramp down from the left edge, so the spark arrives with some speed.
  const rampEnd = r(-0.3, -0.2);
  let top = r(0.02, 0.14);
  const rampTop = top + r(0.06, 0.11);
  terrain.push([[-0.5, FLOOR], [rampEnd, FLOOR], [rampEnd, top], [-0.5, rampTop]]);
  const start: Pt = [-0.45, rampTop + 0.06];

  const gaps = rand() < 0.5 ? 2 : 3;
  const solution: SolutionShape[] = [];
  const motes: Pt[] = [];
  // Room the rest of the course needs after an island: its gaps (≥ 0.1), middle islands (≥ 0.06), a last island (≥ 0.2).
  const need = (left: number) => (left === 0 ? 0 : left * 0.1 + (left - 1) * 0.06 + 0.2);
  let x = rampEnd;
  let lastIsland = -1;
  for (let i = 0; i < gaps; i++) {
    const last = i === gaps - 1;
    const left = gaps - i - 1;
    const room = 0.5 - x;
    const maxGap = last ? room - 0.2 : room - 0.06 - need(left);
    const gap = Math.min(gaps === 3 ? r(0.1, 0.18) : r(0.12, 0.24), maxGap);
    if (gap < 0.1) break;
    const x0 = x + gap;
    const width = last ? 0.5 - x0 : Math.min(r(0.06, gaps === 3 ? 0.1 : 0.15), 0.5 - x0 - need(left));
    if (width < 0.06) break;
    const nextTop = Math.max(LOWEST, top - r(0, 0.05));
    lastIsland = terrain.length;
    terrain.push(box(x0, x0 + width, nextTop));
    // A low roof over this gap, now and then: the bridge's shadow must be thin.
    if (!last && rand() < 0.3) {
      const low = Math.max(top, nextTop) + r(0.06, 0.08);
      terrain.push([[x - 0.03, low], [x0 + 0.03, low], [x0 + 0.03, 0.35], [x - 0.03, 0.35]]);
    }
    solution.push({ a: [x - 0.03, top - BRIDGE_RADIUS + 0.001], b: [x0 + 0.03, nextTop - BRIDGE_RADIUS + 0.001], r: BRIDGE_RADIUS });
    motes.push([x + gap / 2, (top + nextTop) / 2 + 0.026]);
    x = x0 + width;
    top = nextTop;
  }
  // The last island always runs to the edge, so the gate stands on it.
  if (lastIsland >= 0) {
    const island = terrain[lastIsland];
    terrain[lastIsland] = box(island[0][0], 0.5, island[2][1]);
  }
  const gate: Pt = [0.4, top + 0.035];
  if (motes.length < 3) motes.push([0.4 - 0.12, top + 0.025]);
  const course = { terrain, start, gate, motes: motes.slice(0, 3), solution };
  // Some days run right to left.
  return rand() < 0.4 ? mirror(course) : course;
}

function mirror<T extends { terrain: Pt[][]; start: Pt; gate: Pt; motes: Pt[]; solution: SolutionShape[] }>(c: T): T {
  const fx = (p: Pt): Pt => [-p[0], p[1]];
  return {
    ...c,
    terrain: c.terrain.map((piece) => piece.map(fx)),
    start: fx(c.start),
    gate: fx(c.gate),
    motes: c.motes.map(fx),
    solution: c.solution.map((s) => ({ ...s, a: fx(s.a), b: fx(s.b) })),
  };
}

function prove(level: RunLevel): number | null {
  const run = (withShadows: boolean): RunSim => {
    const sim = new RunSim(level);
    sim.release();
    const shapes = withShadows ? level.solution.map((s) => capsule(s.a[0], s.a[1], s.b[0], s.b[1], s.r, TAG_HAND_RIGHT, 0.55, 0.06)) : [];
    while (sim.state === 'live' && sim.time < 20) sim.step(1 / 72, shapes);
    return sim;
  };
  const solved = run(true);
  if (solved.state !== 'won' || solved.motesTaken < solved.motes.length) return null;
  if (run(false).state === 'won') return null;
  return solved.time;
}

const cache = new Map<string, RunLevel>();

/** Today's course (or another day's, by its key), proven finishable. */
export function dailyLevel(key = dateKey()): RunLevel {
  const hit = cache.get(key);
  if (hit) return hit;
  const rand = mulberry32(Number(key) * 2654435761);
  const month = MONTHS[Number(key.slice(4, 6)) - 1] ?? '';
  const day = Number(key.slice(6, 8));
  let level: RunLevel | null = null;
  for (let attempt = 0; attempt < 60 && !level; attempt++) {
    const c = candidate(rand);
    const draft: RunLevel = {
      id: 'daily',
      bestKey: `daily-${key}`,
      title: `Daily Light · ${month} ${day}`,
      story: 'A new course every day, the same one for everyone. Beat your best before midnight.',
      ask: 'Bridge every gap with your hands’ shadows, and take all three motes',
      hint: 'Get your hands flat in the light over the gaps before the spark arrives; nearer the lantern makes a longer shadow',
      ...c,
      par: 0,
      showScale: true,
    };
    const time = prove(draft);
    if (time !== null) {
      draft.par = Math.ceil(time + 4);
      level = draft;
    }
  }
  // Practically unreachable: a plain two-gap course that is known to work.
  level ??= {
    id: 'daily',
    bestKey: `daily-${key}`,
    title: `Daily Light · ${month} ${day}`,
    story: 'A new course every day, the same one for everyone.',
    ask: 'Bridge both gaps with your hands’ shadows',
    hint: 'Hold your hands flat in the light over the gaps',
    terrain: [[[-0.5, FLOOR], [-0.18, FLOOR], [-0.18, 0.1], [-0.5, 0.2]], box(0.14, 0.5, 0.08)],
    start: [-0.43, 0.28],
    gate: [0.4, 0.115],
    motes: [[-0.06, 0.11], [0.05, 0.105], [0.24, 0.105]],
    par: 12,
    solution: [{ a: [-0.21, 0.088], b: [0.17, 0.068], r: 0.014 }],
  };
  cache.set(key, level);
  return level;
}

/** Notes today's clear: a streak counts days in a row. Returns the streak. */
export function noteDaily(key = dateKey()): number {
  const today = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
  const yesterday = dateKey(new Date(today.getTime() - 86400000));
  if (play.daily.last === key) return play.daily.streak;
  play.daily.streak = play.daily.last === yesterday ? play.daily.streak + 1 : 1;
  play.daily.last = key;
  return play.daily.streak;
}
