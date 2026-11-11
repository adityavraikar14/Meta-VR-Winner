/**
 * Story progress shared between the paper (game.ts) and the diorama
 * (creature-system.ts), plus saving it between sessions.
 */

/** How a creature's attempt at the current puzzle went. */
export interface Outcome {
  kind: string;
  solved: boolean;
  /** Caption shown when the attempt failed. */
  line?: string;
}

export const play = {
  /** Index into PUZZLES of the puzzle on stage, or -1 for free play. */
  puzzleIndex: 0,
  /** Bumped whenever a puzzle starts, so the diorama rebuilds. */
  puzzleVersion: 0,
  /** Set by the diorama when a creature finishes its attempt. */
  outcome: null as Outcome | null,
  /** Friends the player has learned to make, in order. */
  unlocked: [] as string[],
  /** Best stars per puzzle id. */
  stars: {} as Record<string, number>,
  /** Things made along the way (an axe, potions…), carried on the wrist. */
  items: [] as string[],
  /** Resources gathered in the worlds (wood, stone, iron, herbs, crystal, embers). */
  bag: {} as Record<string, number>,
  /** Inventor's Journal: each cleared level's "your run" lines, by puzzle id. */
  journal: {} as Record<string, string[]>,
  /** The Arena's bosses beaten: best time (seconds) and wins, by boss name. */
  arena: {} as Record<string, { best: number; wins: number }>,
  /** Deeds a level can't tell from its stars, like which powers beat the dragon. */
  feats: [] as string[],
  /** Trophies already announced (they are judged from the save; see trophies.ts). */
  trophies: [] as string[],
  /** Best time (seconds) per spark level, and per day for the Daily Light ('daily-YYYYMMDD'). */
  best: {} as Record<string, number>,
  /** The Daily Light: the last day played and how many days in a row. */
  daily: { last: '', streak: 0 },
};

let loaded = false;

/** Whether the save has been read this session (the Arsenal page doesn't, until a record needs it). */
export function progressLoaded(): boolean {
  return loaded;
}

const SAVE_KEY = 'shadowplay.progress.v1';

export function loadProgress(): void {
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!saved) return;
    if (typeof saved.puzzleIndex === 'number') play.puzzleIndex = saved.puzzleIndex;
    if (Array.isArray(saved.unlocked)) play.unlocked = saved.unlocked;
    if (saved.stars && typeof saved.stars === 'object') play.stars = saved.stars;
    if (Array.isArray(saved.items)) play.items = saved.items;
    if (saved.bag && typeof saved.bag === 'object') play.bag = saved.bag;
    if (saved.journal && typeof saved.journal === 'object') play.journal = saved.journal;
    if (saved.arena && typeof saved.arena === 'object') play.arena = saved.arena;
    if (Array.isArray(saved.feats)) play.feats = saved.feats;
    if (Array.isArray(saved.trophies)) play.trophies = saved.trophies;
    if (saved.best && typeof saved.best === 'object') play.best = saved.best;
    if (saved.daily && typeof saved.daily === 'object') play.daily = { last: String(saved.daily.last ?? ''), streak: Number(saved.daily.streak ?? 0) };
  } catch {
    // Storage blocked or corrupt: start a fresh story.
  }
}

export function saveProgress(): void {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ puzzleIndex: play.puzzleIndex, unlocked: play.unlocked, stars: play.stars, items: play.items, bag: play.bag, journal: play.journal, arena: play.arena, feats: play.feats, trophies: play.trophies, best: play.best, daily: play.daily }),
    );
  } catch {
    // Not saved; the story still plays.
  }
}

export function resetProgress(): void {
  play.puzzleIndex = 0;
  play.unlocked = [];
  play.stars = {};
  play.items = [];
  play.bag = {};
  play.journal = {};
  play.arena = {};
  play.feats = [];
  play.trophies = [];
  play.best = {};
  play.daily = { last: '', streak: 0 };
  saveProgress();
}

export function totalStars(): number {
  return Object.values(play.stars).reduce((sum, n) => sum + n, 0);
}
