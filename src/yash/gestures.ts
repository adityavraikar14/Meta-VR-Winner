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
 *   spear two fists, one above the other (or together side by side), as if gripping a pole
 *   ball  one open hand, palm up
 *   wall  both open palms pushed forward, side by side
 *   gun   a finger gun: index pointing, the other three fingers curled
 */
import { Vector3 } from '@iwsdk/core';
import type { HandState, Side } from './hands.js';

export type Item = 'sword' | 'spear' | 'ball' | 'wall' | 'gun';
export const ITEMS: readonly Item[] = ['sword', 'spear', 'ball', 'wall', 'gun'];
/** Each item's sign shares its name; `arm` is the base sign every recipe starts with. */
export type Sign = 'none' | 'arm' | Item;

/** What each sign looks like, for recipes, buttons and the in-game menu. */
export const SIGN_LABELS: Record<Exclude<Sign, 'none'>, string> = {
  arm: '🤲 Hold a ball',
  sword: '✊ Fist',
  spear: '✊✊ Fists stacked',
  ball: '🫴 Palm up',
  wall: '🙌 Palms forward',
  gun: '👉 Finger gun',
};

export const ITEM_LABELS: Record<Item, string> = {
  sword: '🗡️ Sword',
  spear: '🔱 Spear',
  ball: '🔮 Power ball',
  wall: '🧱 Wall',
  gun: '🔫 Blaster',
};

/** The signs that summon each item, in order. */
export const RECIPES: Record<Item, readonly Exclude<Sign, 'none'>[]> = {
  sword: ['arm', 'sword'],
  spear: ['arm', 'spear'],
  ball: ['arm', 'ball'],
  wall: ['arm', 'wall'],
  gun: ['arm', 'gun'],
};

/** Finger straightness (see HandState.straight) above which a finger is straight… */
const STRAIGHT = 0.5;
/** …and below which it is curled. Real fists rarely close fully, so this is generous. */
const CURLED = 0.3;

/** Arm: gap between the palms, and how squarely they face each other (cosine). */
const ARM_MIN_GAP = 0.06;
const ARM_MAX_GAP = 0.45;
const ARM_FACING = 0.4;
/** Ball: how squarely the palm faces up (cosine). */
const PALM_UP = 0.5;
/** Wall: how squarely the palms face forward, how level and how far apart the hands are. */
const PALM_FORWARD = 0.45;
const WALL_MAX_RISE = 0.22;
const WALL_MIN_GAP = 0.1;
const WALL_MAX_GAP = 0.8;
/** Spear: the upper fist must sit at least this far above the lower, and nearly in line… */
const SPEAR_MIN_RISE = 0.05;
const SPEAR_MAX_SIDEWAYS = 0.2;
/**
 * …or (backup, in case stacked fists hide each other from the headset) both
 * fists held together side by side, as if gripping a pole across the body.
 */
const SPEAR_GRIP_GAP = 0.15;
/**
 * Once a sign is being held, its angle and finger limits relax by this much,
 * so a hand that wobbles slightly doesn't drop the sign it is making.
 */
const STICKY = 0.12;

/** Seconds the arm sign must be held. */
export const ARM_HOLD = 0.5;
/** Seconds an item sign must be held once armed. */
export const ITEM_HOLD = 0.35;
/** Seconds you stay armed before the charge fizzles. */
export const ARMED_WINDOW = 3.5;
/** Wobbles out of a sign shorter than this don't reset a hold. */
const GRACE = 0.15;
/**
 * While a hand has been lost for less than this, sign timers pause instead of
 * counting the missing hand as a failed sign.
 */
const LOST_PAUSE = 0.35;

const UP = new Vector3(0, 1, 0);
const between = new Vector3();

/** Straight fingers counted out of four; the ring finger often lags, so 3 is enough. */
export function isOpen(hand: HandState, slack = 0): boolean {
  let count = 0;
  for (let f = 0; f < 4; f++) if (hand.straight[f] > STRAIGHT - slack) count++;
  return count >= 3;
}

/** Finger gun: index straight, middle/ring/pinky curled (two of three is enough), none of them straight. */
export function isPointing(hand: HandState, slack = 0): boolean {
  if (hand.straight[0] < STRAIGHT - slack) return false;
  let curled = 0;
  for (let f = 1; f < 4; f++) {
    if (hand.straight[f] > STRAIGHT + slack) return false;
    if (hand.straight[f] < CURLED + slack) curled++;
  }
  return curled >= 2;
}

export function isFist(hand: HandState, slack = 0): boolean {
  let curled = 0;
  for (let f = 0; f < 4; f++) {
    if (hand.straight[f] > STRAIGHT + slack) return false;
    if (hand.straight[f] < CURLED + slack) curled++;
  }
  return curled >= 3;
}

export interface Reading {
  sign: Sign;
  /** The hand that holds the item, when that matters. */
  hand: Side | null;
  /** No sign, but only because a hand just dropped out of tracking: hold timers pause. */
  paused?: boolean;
}

/**
 * Names the sign being made this frame. `forward` is the flattened direction
 * the player faces. `keep` is the sign currently being held, which gets a
 * little extra tolerance (see STICKY).
 */
export function classify(
  left: HandState,
  right: HandState,
  forward: Vector3,
  out: Reading,
  keep: Sign = 'none',
): Reading {
  out.sign = 'none';
  out.hand = null;
  out.paused = false;
  const blip = (h: HandState) => !h.tracked && h.lostFor < LOST_PAUSE;
  const handBlipped = blip(left) || blip(right);
  // Mid two-handed sign with one hand briefly gone: wait for it rather than
  // reading the other hand alone (a lone fist would otherwise look like a sword).
  if (handBlipped && TWO_HANDED.includes(keep)) {
    out.paused = true;
    return out;
  }
  classifySign(left, right, forward, out, keep);
  if (out.sign === 'none') out.paused = handBlipped;
  return out;
}

const TWO_HANDED: readonly Sign[] = ['arm', 'spear', 'wall'];

function classifySign(
  left: HandState,
  right: HandState,
  forward: Vector3,
  out: Reading,
  keep: Sign,
): Reading {
  const slack = (sign: Sign) => (sign === keep ? STICKY : 0);
  const both = left.tracked && right.tracked;

  if (both) {
    if (isOpen(left, STICKY) && isOpen(right, STICKY)) {
      between.copy(right.palm).sub(left.palm);
      const gap = between.length();
      between.divideScalar(gap || 1);
      // Left palm faces towards the right hand, right palm towards the left.
      const arm = slack('arm');
      if (
        isOpen(left, arm) &&
        isOpen(right, arm) &&
        gap > ARM_MIN_GAP &&
        gap < ARM_MAX_GAP + arm &&
        left.normal.dot(between) > ARM_FACING - arm &&
        right.normal.dot(between) < -(ARM_FACING - arm)
      ) {
        out.sign = 'arm';
        return out;
      }
      const wall = slack('wall');
      if (
        isOpen(left, wall) &&
        isOpen(right, wall) &&
        left.normal.dot(forward) > PALM_FORWARD - wall &&
        right.normal.dot(forward) > PALM_FORWARD - wall &&
        Math.abs(right.palm.y - left.palm.y) < WALL_MAX_RISE + wall &&
        gap > WALL_MIN_GAP &&
        gap < WALL_MAX_GAP
      ) {
        out.sign = 'wall';
        return out;
      }
    }
    const spear = slack('spear');
    if (isFist(left, spear) && isFist(right, spear)) {
      const rise = Math.abs(right.palm.y - left.palm.y);
      const sideways = Math.hypot(right.palm.x - left.palm.x, right.palm.z - left.palm.z);
      const stacked = rise > SPEAR_MIN_RISE && sideways < SPEAR_MAX_SIDEWAYS + spear;
      const gripped = rise <= SPEAR_MIN_RISE && sideways < SPEAR_GRIP_GAP + spear;
      if (stacked || gripped) {
        out.sign = 'spear';
        out.hand = 'right';
      }
      // Two fists apart mean nothing: don't fall through to sword.
      return out;
    }
  }

  // Palm-up ball, right hand first.
  const ball = slack('ball');
  for (const hand of [right, left]) {
    if (hand.tracked && isOpen(hand, ball) && hand.normal.dot(UP) > PALM_UP - ball) {
      out.sign = 'ball';
      out.hand = hand.side;
      return out;
    }
  }
  const gun = slack('gun');
  for (const hand of [right, left]) {
    if (hand.tracked && isPointing(hand, gun)) {
      out.sign = 'gun';
      out.hand = hand.side;
      return out;
    }
  }
  for (const hand of [right, left]) {
    if (hand.tracked && isFist(hand, slack('sword'))) {
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
    // A hand just dropped out of tracking: freeze everything, including the armed countdown.
    if (reading.paused) return;
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
