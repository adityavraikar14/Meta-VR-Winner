import { noteRun } from './journal.js';
import { loadProgress, play, progressLoaded, saveProgress } from './progress.js';
import { awardTrophies, trophyLine } from './trophies.js';

/**
 * The Arena's records: each boss's best time and wins, kept with the story's
 * save, and the Arsenal's Journal page filled with your latest win.
 */

export interface ArenaWin {
  seconds: number;
  best: number;
  newBest: boolean;
  /** This win filled the Arsenal's Journal page for the first time. */
  newPage: boolean;
  /** Trophies this win earned, as a line ("🏆 Boss Slayer"), or empty. */
  trophies: string;
}

/** Bosses in the order the Arena offers them, for the Journal line. */
const ORDER = ['sentinel', 'dragon', 'witch', 'morwen', 'vance', 'rook', 'vex', 'mako', 'kai'];

export function recordArenaWin(boss: string, title: string, seconds: number, blows: number): ArenaWin {
  // The Arsenal page (yash.html) never loaded the save; never overwrite it with an empty one.
  if (!progressLoaded()) loadProgress();
  const record = play.arena[boss] ?? { best: 0, wins: 0 };
  const newBest = record.best === 0 || seconds < record.best;
  record.best = newBest ? seconds : record.best;
  record.wins++;
  play.arena[boss] = record;
  const names: Record<string, string> = { sentinel: 'Sentinel', dragon: 'Dragon', witch: 'Morwen', morwen: 'Morwen', vance: 'Vance', rook: 'Rook', vex: 'Vex', mako: 'Mako', kai: 'Kai' };
  const tally = ORDER.filter((b) => play.arena[b]).map((b) => `${names[b] ?? b} ×${play.arena[b].wins}`).join(' · ');
  const newPage = noteRun('arsenal', [
    `${title} beaten in ${Math.round(seconds)} s${newBest ? ', your best yet' : ` (best ${Math.round(record.best)} s)`}`,
    `${blows} blows landed`,
    `Arena wins: ${tally}`,
  ]);
  const trophies = trophyLine(awardTrophies());
  saveProgress();
  return { seconds, best: record.best, newBest, newPage, trophies };
}
