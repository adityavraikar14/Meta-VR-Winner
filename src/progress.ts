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
};

const SAVE_KEY = 'shadowplay.progress.v1';

export function loadProgress(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!saved) return;
    if (typeof saved.puzzleIndex === 'number') play.puzzleIndex = saved.puzzleIndex;
    if (Array.isArray(saved.unlocked)) play.unlocked = saved.unlocked;
    if (saved.stars && typeof saved.stars === 'object') play.stars = saved.stars;
  } catch {
    // Storage blocked or corrupt: start a fresh story.
  }
}

export function saveProgress(): void {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ puzzleIndex: play.puzzleIndex, unlocked: play.unlocked, stars: play.stars }),
    );
  } catch {
    // Not saved; the story still plays.
  }
}

export function resetProgress(): void {
  play.puzzleIndex = 0;
  play.unlocked = [];
  play.stars = {};
  saveProgress();
}

export function totalStars(): number {
  return Object.values(play.stars).reduce((sum, n) => sum + n, 0);
}
