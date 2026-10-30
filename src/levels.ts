import type { ShapeRule } from './hand-pose.js';

/** How a creature moves once it comes alive. */
export type Motion = 'hop' | 'fly' | 'crawl';

export interface Level {
  id: string;
  name: string;
  motion: Motion;
  /** The hand shape that brings this creature to life. */
  shape: ShapeRule;
  /**
   * Silhouette shown as the glowing hint outline and used for the creature,
   * as a hex-packed GRID x GRID cell map (see matcher.ts), row 0 at the
   * bottom. Capture one in the dev build by holding the shape and pressing C.
   */
  outline: string;
}

export const LEVELS: Level[] = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    motion: 'hop',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'in', pinky: 'in' },
      pointUp: true,
    },
    outline:
      '00001e0000007f0000007f000000ff000001ff800003ff800003ff800003ff800003ff80' +
      '0007ff800007ff80000fffc0000fffc0000fffc0000fffc0000fff80001fff8000787c00' +
      '007070000070600000e0600001c0600001c0600001806000038',
  },
];

/** Shape score (0..1) needed to bring a creature to life. */
export const MATCH_THRESHOLD = 0.7;
/** Seconds the shape must be held above the threshold. */
export const MATCH_HOLD = 0.5;
/** Seconds of struggling before the caption offers a finger hint. */
export const HINT_DELAY = 2.5;
