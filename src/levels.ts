import type { PairRule, ShapeRule } from './hand-pose.js';

/** How a creature moves once it comes alive. */
export type Motion = 'hop' | 'fly' | 'crawl';

export interface Level {
  /** Also the creature kind spawned in 3D. */
  id: string;
  name: string;
  motion: Motion;
  /** One-hand shape that brings this creature to life (either hand). */
  shape?: ShapeRule;
  /** Two-hand shape, used instead of `shape`. */
  pair?: PairRule;
  /**
   * Silhouette shown as the glowing hint outline and used for the creature,
   * as a hex-packed GRID x GRID cell map (see matcher.ts), row 0 at the
   * bottom. Capture one in the dev build by holding the shape and pressing C.
   */
  outline: string;
}

const RABBIT_OUTLINE =
  '00001e0000007f0000007f000000ff000001ff800003ff800003ff800003ff800003ff80' +
  '0007ff800007ff80000fffc0000fffc0000fffc0000fffc0000fff80001fff8000787c00' +
  '007070000070600000e0600001c0600001c0600001806000038';

export const LEVELS: Level[] = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    motion: 'hop',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'in', pinky: 'in' },
      pointUp: true,
    },
    outline: RABBIT_OUTLINE,
  },
  {
    id: 'bird',
    name: 'Bird',
    motion: 'fly',
    pair: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'out', pinky: 'out' },
      thumbsTouch: true,
    },
    // Drawn rather than captured: real players fan their fingers sideways
    // as wings, which the emulator's poses cannot show.
    outline:
      '000000000000000000000000000000000000000000000000000080000007f000' +
      '001ffc00001ffc00003ffe0001ffff803ffffffcffffffffffffffff3ffffffe' +
      'fff9cfffffe3e7ff1fc3e3fc3fc3f1fe3f81f0fe0e0080700e00003000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000',
  },
];

/** Shape score (0..1) needed to bring a creature to life. */
export const MATCH_THRESHOLD = 0.7;
/** Seconds the shape must be held above the threshold. */
export const MATCH_HOLD = 0.5;
/** Seconds of struggling before the caption offers a finger hint. */
export const HINT_DELAY = 2.5;
