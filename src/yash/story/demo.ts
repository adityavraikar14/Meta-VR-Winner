import { stage } from './stage-state.js';
import { DUEL_INDEX, type Puzzle, PUZZLES } from './world/puzzles.js';

/**
 * The Judge's Demo: a short cut of the story for someone with a few minutes.
 * Seven levels that show every kind of play once, told as one tale: Morwen
 * the Ink Witch bewitched the Shadow Dragon, the theatre's guardian. You
 * gather the scattered light, beat the dragon and break her spell, then face
 * Morwen with the freed guardian at your side.
 *
 * It saves nothing: no stars, no Journal pages, no place in the story, so
 * every judge starts it fresh and the real story stays as it was.
 */

/** The demo's levels, in order (the duel is last). */
const ORDER = ['lantern', 'shadow-bridge', 'fallen-log', 'lost-star', 'sky-lantern', 'shadow-dragon', 'duel'];

/** Story-index of each demo level (the duel's own index for the last). */
export const DEMO_LEVELS = ORDER.map((id) => (id === 'duel' ? DUEL_INDEX : PUZZLES.findIndex((p) => p.id === id)));

/** The demo's own telling: the story card and the cleared line, by level id. */
const TEXT: Record<string, { story: string; solved?: string }> = {
  lantern: {
    story: 'A lantern burns behind you. Its light is your way out, and your shadow answers to it.',
  },
  'shadow-bridge': {
    story: 'Since the spell, the shadow world lies broken. A shadow hare is stranded: your hand’s shadow is solid ground.',
  },
  'fallen-log': {
    story: 'Beyond a fallen tree glows a shard of the scattered Great Lantern. Wake a shadow friend to fetch it.',
  },
  'lost-star': {
    story: 'The brightest shard rolled deep inside a hollow log: the Lantern Stone itself.',
    solved: 'The Lantern Stone is free! Its light will lead you up the mountain.',
  },
  'sky-lantern': {
    story: 'The guardian’s mountain starts on a ledge no one can climb. A paper lantern could carry the Lantern Stone up, if the air inside is hot enough.',
  },
  'shadow-dragon': {
    story: 'At the top waits the Shadow Dragon, the theatre’s guardian, its eyes red with Morwen’s spell. Beat it, but don’t destroy it.',
    solved: 'The spell is broken. The guardian remembers who it is.',
  },
  duel: {
    story: 'Morwen the Ink Witch steps out of the screen. Draw in the air and throw your drawings at her. The guardian is mending the Lantern, but it will come.',
    solved: 'Morwen melts back into ink, and the shadows are free.',
  },
};

/** Where the demo stands: which of its levels, or -1 when it isn't running. */
export const demo = { step: -1 };

export function demoStart(): void {
  stage.demo = true;
  demo.step = 0;
}

export function demoStop(): void {
  stage.demo = false;
  demo.step = -1;
}

export function demoCount(): number {
  return DEMO_LEVELS.length;
}

/** The story-index of the demo's level after `index`, or null after the last. */
export function demoNext(index: number): number | null {
  const at = DEMO_LEVELS.indexOf(index);
  demo.step = at + 1;
  return at >= 0 && at + 1 < DEMO_LEVELS.length ? DEMO_LEVELS[at + 1] : null;
}

/** The friends the demo has taught before this level (it never teaches the Stag or the Horse). */
export function demoTaught(index: number): string[] {
  const at = DEMO_LEVELS.indexOf(index);
  return DEMO_LEVELS.slice(0, Math.max(0, at))
    .map((i) => PUZZLES[i]?.teach)
    .filter((t): t is string => !!t);
}

/** A level's story card text: the demo's telling while it runs. */
export function storyOf(puzzle: Puzzle): string {
  return (stage.demo && TEXT[puzzle.id]?.story) || puzzle.story;
}

/** A level's cleared line: the demo's telling while it runs. */
export function solvedOf(puzzle: Puzzle): string {
  return (stage.demo && TEXT[puzzle.id]?.solved) || puzzle.solved;
}

/** "Judge's Demo · 3 of 7" for the level card. */
export function demoKicker(index: number): string {
  return `Judge’s Demo · ${DEMO_LEVELS.indexOf(index) + 1} of ${DEMO_LEVELS.length}`;
}
