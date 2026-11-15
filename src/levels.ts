import type { PairRule, ShapeRule } from './hand-pose.js';

/** How a creature moves once it comes alive. */
export type Motion = 'hop' | 'fly' | 'crawl';

export interface Level {
  /** Also the creature kind spawned in 3D. */
  id: string;
  name: string;
  motion: Motion;
  /** A short plain-language description of the hand shape. */
  tip: string;
  /** One-hand shape that brings this creature to life (either hand). */
  shape?: ShapeRule;
  /** Two-hand shape, used instead of `shape`. */
  pair?: PairRule;
  /**
   * Silhouette shown as the glowing hint outline and used for the shadow
   * creature, as a hex-packed GRID x GRID cell map (see matcher.ts), row 0 at
   * the bottom. The rabbit was captured from a real hand shadow (press C in
   * the dev build); the rest are drawn as stylized hand shadows.
   */
  outline: string;
}

export const LEVELS: Level[] = [
  {
    id: 'fox',
    name: 'Fox',
    motion: 'hop',
    tip: 'index and pinky up for the ears, thumb to your middle fingers for the snout',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'in', ring: 'in', pinky: 'out' },
      pointUp: true,
    },
    // A fox's head in profile: pointed ears, a long snout, an eye (not two ears on a blob: that read as a rabbit).
    outline:
      '003fe000003fe000003fe000003fe000003fe000007fe000007fe000007fe000' +
      '007fe000007ff00000ffffc000fffffc01fffffc01fffff001ff9f8001ffde00' +
      '00fff00000fff00000ffe00000ffe00000ffc00000f3c00000f3c00000e1c000' +
      '00e1c00000c1c00000c080000080800000800000000000000000000000000000',
  },
  {
    id: 'stag',
    name: 'Stag',
    motion: 'hop',
    tip: 'three fingers up for antlers',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'out', pinky: 'in' },
      pointUp: true,
    },
    outline:
      '0007f8000007f8000007f8000007f8000007f800000ff800001ffc00003ffe00' +
      '003ffe00003ffe00007fff00003ffe00003ffe00003ffe00003ffe00003ffe00' +
      '003bee000039ce000039cf000039cf000079c7000071c7000071c70000f1c780' +
      '01f1c7c003f1c3e003e1c3f003e1c3f000e1c3800001c0000001c0000001c000',
  },
  {
    id: 'horse',
    name: 'Horse',
    motion: 'hop',
    tip: 'hand flat on its side, fingers pointing forward, thumb up for the ear',
    // Easy on purpose: a flat hand on its side is the horse's head. The thumb raised for the ear
    // looks best but is not required, and the pinky can do what it likes (holding it down alone,
    // with the ring finger straight, is hard for most hands).
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'out', pinky: 'any' },
      pointSide: true,
    },
    outline:
      '00000000000000000000000078000000fe000000ff000000ff800000ffe00000' +
      'fff003e0fff8ffe07fffffe01fffff000fffe00003ffe00007fff7fc07fffffe' +
      '07fffffe03ffbffe03ffbffe03ffff0003ff000003c0000003c0000003c00000' +
      '07c0000007c00000078000000780000007800000030000000000000000000000',
  },
];

/** Shape score (0..1) needed to bring a creature to life. */
export const MATCH_THRESHOLD = 0.7;
/** Seconds the shape must be held above the threshold. */
export const MATCH_HOLD = 0.7;
/** Seconds of struggling before the caption offers a finger hint. */
export const HINT_DELAY = 2.5;
