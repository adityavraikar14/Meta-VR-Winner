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
    id: 'rabbit',
    name: 'Rabbit',
    motion: 'hop',
    tip: 'two fingers up for the ears',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'in', pinky: 'in' },
      pointUp: true,
    },
    outline:
      '0007f8000007f8000007f8000007f8000007f800000ff800001ffc00007ffe00' +
      '00fffe0000fffe0000ffff80007fff80003fff80003ffe00001ffc00001ff800' +
      '001ffc00001e3c00001e3c00001e3c00003c3c00003c1e00003c1e00003c1e00' +
      '00781e0000781e0000780f0000780f0000780f0000700e000000000000000000',
  },
  {
    id: 'snail',
    name: 'Snail',
    motion: 'crawl',
    tip: 'index and pinky up, like eye stalks',
    shape: {
      fingers: { thumb: 'any', index: 'out', middle: 'in', ring: 'in', pinky: 'out' },
      pointUp: true,
    },
    outline:
      '0007f8000007f8000007f8000007f8000007f800000ff800001ffc00003ffe00' +
      '003ffe00003ffe00007fff00003ffe00003ffe00003ffe00001ffe00001ffe00' +
      '003ffe00003c2f00003c07000038070000380700007807800078078000780380' +
      '00700380007003800070038000f0018000f00000006000000000000000000000',
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
    tip: 'thumb up for the ear, drop your pinky for the jaw',
    shape: {
      fingers: { thumb: 'out', index: 'out', middle: 'out', ring: 'out', pinky: 'in' },
    },
    outline:
      '00000000000000000000000078000000fe000000ff000000ff800000ffe00000' +
      'fff003e0fff8ffe07fffffe01fffff000fffe00003ffe00007fff7fc07fffffe' +
      '07fffffe03ffbffe03ffbffe03ffff0003ff000003c0000003c0000003c00000' +
      '07c0000007c00000078000000780000007800000030000000000000000000000',
  },
  {
    id: 'bird',
    name: 'Bird',
    motion: 'fly',
    tip: 'hook your thumbs, spread your fingers like wings',
    pair: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'out', pinky: 'out' },
      thumbsTouch: true,
      spread: 'wide',
    },
    outline:
      '000000000000000000000000000000000000000000000000000080000007f000' +
      '001ffc00001ffc00003ffe0001ffff803ffffffcffffffffffffffff3ffffffe' +
      'fff9cfffffe3e7ff1fc3e3fc3fc3f1fe3f81f0fe0e0080700e00003000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000',
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    motion: 'fly',
    tip: 'hook your thumbs, fingers held together',
    pair: {
      fingers: { thumb: 'any', index: 'out', middle: 'out', ring: 'out', pinky: 'out' },
      thumbsTouch: true,
      spread: 'together',
    },
    outline:
      '0000000000000000000000000000000000000000000000000020020001fc9fc0' +
      '03febfe003ffffe003ffffe003ffffe003ffffe003ffffe001fddfc003f9cfe0' +
      '0ffffff81ffffffc1ffffffc1ffffffc3ffffffe1ffffffc1ffffffc1ffffffc' +
      '0fff7ff803fe3fe000463100000c1800000c1800001c1c00001c1c0000000000',
  },
  {
    id: 'dragon',
    name: 'Dragon',
    motion: 'fly',
    tip: 'both hands: index and pinky up like horns',
    pair: {
      fingers: { thumb: 'any', index: 'out', middle: 'in', ring: 'in', pinky: 'out' },
    },
    outline:
      '03f80fe003f80fe003f80fe003f80fe003f80fe003f80fe007fc1ff00ffe3ff8' +
      '0ffe3ff80ffe3ff81fff7ffc0ffe3ff80ffe3ff80ffe3ff807fc1ff80ffc1ff8' +
      '0e4e19380e0e38380e0e38380e0e381c1c0e381c1c0e381c1c0e381c1c06381c' +
      '1806380e3806300e3806300e3800000e00000000000000000000000000000000',
  },
];

/** Shape score (0..1) needed to bring a creature to life. */
export const MATCH_THRESHOLD = 0.7;
/** Seconds the shape must be held above the threshold. */
export const MATCH_HOLD = 0.7;
/** Seconds of struggling before the caption offers a finger hint. */
export const HINT_DELAY = 2.5;
