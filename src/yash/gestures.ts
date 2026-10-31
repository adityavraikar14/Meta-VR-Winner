/**
 * Arsenal gesture recognition. Pure logic, no Three.js scene or DOM.
 *
 * Every frame `classify` names the sign the hands are making right now. The
 * `GestureRecognizer` then turns that noisy per-frame answer into events: a
 * sign only counts once it has been held for a moment, short tracking dropouts
 * are forgiven, and an item can only be summoned while armed.
 *
 *   arm   both open palms facing each other, as if holding a ball
 *   sword one fist (the other hand anything else)
 *   spear two fists, one above the other, as if gripping a pole
 *   ball  one open hand, palm up
 *   wall  both open palms pushed forward, side by side
 */
import { Vector3 } from '@iwsdk/core';
import type { HandState, Side } from './hands.js';

export type Item = 'sword' | 'spear' | 'ball' | 'wall';
export const ITEMS: readonly Item[] = ['sword', 'spear', 'ball', 'wall'];
export type Sign = 'none' | 'arm' | Item;

/** Finger straightness (see HandState.straight) above which a finger is straight… */
const STRAIGHT = 0.6;
/** …and below which it is curled. In between counts as neither. */
const CURLED = 0.1;

/** Arm: gap between the palms, and how squarely they face each other (cosine). */
const ARM_MIN_GAP = 0.06;
const ARM_MAX_GAP = 0.4;
const ARM_FACING = 0.5;
/** Ball: how squarely the palm faces up (cosine). */
const PALM_UP = 0.6;
/** Wall: how squarely the palms face forward, how level and how far apart the hands are. */
const PALM_FORWARD = 0.5;
const WALL_MAX_RISE = 0.18;
const WALL_MIN_GAP = 0.1;
const WALL_MAX_GAP = 0.8;
/** Spear: the upper fist must sit at least this far above the lower, and nearly in line. */
const SPEAR_MIN_RISE = 0.05;
const SPEAR_MAX_SIDEWAYS = 0.16;

/** Seconds the arm sign must be held. */
export const ARM_HOLD = 0.5;
/** Seconds an item sign must be held once armed. */
export const ITEM_HOLD = 0.35;
/** Seconds you stay armed before the charge fizzles. */
export const ARMED_WINDOW = 3.5;
/** Tracking blips shorter than this don't reset a hold. */
const GRACE = 0.15;

const UP = new Vector3(0, 1, 0);
const between = new Vector3();

/** Straight fingers counted out of four; the ring finger often lags, so 3 is enough. */
export function isOpen(hand: HandState): boolean {
  let count = 0;
  for (let f = 0; f < 4; f++) if (hand.straight[f] > STRAIGHT) count++;
  return count >= 3;
}

export function isFist(hand: HandState): boolean {
  let curled = 0;
  for (let f = 0; f < 4; f++) {
    if (hand.straight[f] > STRAIGHT) return false;
    if (hand.straight[f] < CURLED) curled++;
  }
  return curled >= 3;
}

export interface Reading {
  sign: Sign;
  /** The hand that holds the item, when that matters. */
  hand: Side | null;
}

/**
 * Names the sign being made this frame. `forward` is the flattened direction
 * the player faces.
 */
export function classify(
  left: HandState,
  right: HandState,
  forward: Vector3,
  out: Reading,
): Reading {
  out.sign = 'none';
  out.hand = null;
  const both = left.tracked && right.tracked;

  if (both) {
    const leftOpen = isOpen(left);
    const rightOpen = isOpen(right);
    if (leftOpen && rightOpen) {
      between.copy(right.palm).sub(left.palm);
      const gap = between.length();
      between.divideScalar(gap || 1);
      // Left palm faces towards the right hand, right palm towards the left.
      if (
        gap > ARM_MIN_GAP &&
        gap < ARM_MAX_GAP &&
        left.normal.dot(between) > ARM_FACING &&
        right.normal.dot(between) < -ARM_FACING
      ) {
        out.sign = 'arm';
        return out;
      }
      if (
        left.normal.dot(forward) > PALM_FORWARD &&
        right.normal.dot(forward) > PALM_FORWARD &&
        Math.abs(right.palm.y - left.palm.y) < WALL_MAX_RISE &&
        gap > WALL_MIN_GAP &&
        gap < WALL_MAX_GAP
      ) {
        out.sign = 'wall';
        return out;
      }
    }
    if (isFist(left) && isFist(right)) {
      const rise = Math.abs(right.palm.y - left.palm.y);
      const sideways = Math.hypot(right.palm.x - left.palm.x, right.palm.z - left.palm.z);
      if (rise > SPEAR_MIN_RISE && sideways < SPEAR_MAX_SIDEWAYS) {
        out.sign = 'spear';
        out.hand = 'right';
      }
      // Two fists side by side mean nothing: don't fall through to sword.
      return out;
    }
  }

  // Palm-up ball, right hand first.
  for (const hand of [right, left]) {
    if (hand.tracked && isOpen(hand) && hand.normal.dot(UP) > PALM_UP) {
      out.sign = 'ball';
      out.hand = hand.side;
      return out;
    }
  }
  for (const hand of [right, left]) {
    if (hand.tracked && isFist(hand)) {
      out.sign = 'sword';
      out.hand = hand.side;
      return out;
    }
  }
  return out;
}

export type GestureEvent =
  | { type: 'armed' }
  | { type: 'fizzle' }
  | { type: 'summon'; item: Item; hand: Side | null };

export type Phase = 'idle' | 'armed';

/**
 * Base sign, then item sign. Holds are timed so a sign has to be meant, not
 * passed through on the way to another one.
 */
export class GestureRecognizer {
  phase: Phase = 'idle';
  /** The sign currently being held towards a trigger. */
  candidate: Sign = 'none';
  /** 0 → 1 while the candidate is held. */
  progress = 0;
  /** Seconds left while armed. */
  armedLeft = 0;
  private held = 0;
  private miss = 0;
  private hand: Side | null = null;

  update(dt: number, reading: Reading, events: GestureEvent[]): void {
    if (this.phase === 'armed') {
      this.armedLeft -= dt;
      if (this.armedLeft <= 0) {
        this.reset();
        events.push({ type: 'fizzle' });
        return;
      }
    }

    const sign = reading.sign;
    const wanted = this.phase === 'idle' ? sign === 'arm' : sign !== 'none' && sign !== 'arm';
    if (wanted) {
      if (sign !== this.candidate) this.held = 0;
      this.candidate = sign;
      this.hand = reading.hand;
      this.held += dt;
      this.miss = 0;
    } else if (this.held > 0) {
      this.miss += dt;
      if (this.miss > GRACE) {
        this.held = 0;
        this.candidate = 'none';
      }
    }

    const need = this.phase === 'idle' ? ARM_HOLD : ITEM_HOLD;
    this.progress = Math.min(1, this.held / need);
    if (this.held < need) return;

    if (this.phase === 'idle') {
      this.phase = 'armed';
      this.armedLeft = ARMED_WINDOW;
      this.held = 0;
      this.candidate = 'none';
      this.progress = 0;
      events.push({ type: 'armed' });
    } else {
      const item = this.candidate as Item;
      const hand = this.hand;
      this.reset();
      events.push({ type: 'summon', item, hand });
    }
  }

  /** Debug buttons: skip straight to armed. */
  forceArm(events: GestureEvent[]): void {
    this.reset();
    this.phase = 'armed';
    this.armedLeft = ARMED_WINDOW;
    events.push({ type: 'armed' });
  }

  /** Debug buttons: summon as if the full sequence had been made. */
  forceSummon(item: Item, events: GestureEvent[]): void {
    this.reset();
    events.push({ type: 'summon', item, hand: null });
  }

  reset(): void {
    this.phase = 'idle';
    this.candidate = 'none';
    this.progress = 0;
    this.armedLeft = 0;
    this.held = 0;
    this.miss = 0;
    this.hand = null;
  }
}
