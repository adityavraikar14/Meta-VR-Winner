/**
 * The Daily Light generator over 120 days: every day must yield a proven
 * course (finishable with flat shadow bridges, not finishable without the
 * player) without falling back to the fixed course. Run: npm run test:daily
 */
import { dailyLevel, dateKey } from '../src/run/daily.js';

let fallbacks = 0;
const pars: number[] = [];
const gapCounts: Record<number, number> = {};
let roofs = 0;
let mirrored = 0;
const start = new Date(2026, 10, 1);
for (let i = 0; i < 120; i++) {
  const key = dateKey(new Date(start.getTime() + i * 86400000));
  const level = dailyLevel(key);
  if (level.par === 12 && level.terrain.length === 2 && level.solution.length === 1) fallbacks++;
  pars.push(level.par);
  gapCounts[level.solution.length] = (gapCounts[level.solution.length] ?? 0) + 1;
  if (level.terrain.some((piece) => piece.some(([, y]) => y >= 0.35))) roofs++;
  if (level.gate[0] < 0) mirrored++;
  if (i < 3) console.log(key, level.title, `gaps ${level.solution.length}, par ${level.par} s, motes ${level.motes.length}`);
}
console.log(`120 days: ${fallbacks} fallbacks · gaps ${JSON.stringify(gapCounts)} · ${roofs} with a low roof · ${mirrored} right-to-left · par ${Math.min(...pars)}–${Math.max(...pars)} s`);
if (fallbacks > 0) process.exit(1);
console.log('every day has its own proven course');
