/**
 * Arsenal gesture recognition. Pure logic, no Three.js scene or DOM.
 *
 * Every frame `classify` names the sign the hands are making right now. The
 * `GestureRecognizer` then turns that noisy per-frame answer into events: a
 * sign only counts once it has been held for a moment, short tracking dropouts
 * are forgiven. One sign, one item, straight away: no charging first.
 *
 *   sword  a fist
 *   ball   an open hand, palm up
 *   shield an open palm pushed forward
 *   gun    a finger gun: index pointing, the other three fingers curled
 *   sling  a V sign: index and middle up, the other two curled; they are the fork
 *
 *   wall   BOTH open palms pushed forward, side by side (the defence wall)
 *
 * The wall is the only two-hand sign; otherwise one hand each, so two hands
 * never make two things by accident. A hand that is pinching (drawing in the
 * air) makes no sign. The spear is drawn in the air (see air-sketch.ts).
 */
import { Vector3 } from '@iwsdk/core';
import type { HandState, Side } from './hands.js';

export type Item = 'sword' | 'spear' | 'ball' | 'wall' | 'gun' | 'shield' | 'sling';
export const ITEMS: readonly Item[] = ['sword', 'spear', 'ball', 'wall', 'gun', 'shield', 'sling'];
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
  shield: '✋ One palm forward',
  sling: '✌️ V sign',
};

export const ITEM_LABELS: Record<Item, string> = {
  sword: '🗡️ Sword',
  spear: '🔱 Spear',
  ball: '🔮 Power ball',
  wall: '🧱 Wall',
  gun: '🔫 Blaster',
  shield: '🛡️ Shield',
  sling: '🎯 Slingshot',
};

/** The sign that summons each item (one sign, no charging first; the spear and wall are drawn). */
export const RECIPES: Record<Item, readonly Exclude<Sign, 'none'>[]> = {
  sword: ['sword'],
  spear: ['spear'],
  ball: ['ball'],
  wall: ['wall'],
  gun: ['gun'],
  shield: ['shield'],
  sling: ['sling'],
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
/** Seconds an item sign must be held. */
export const ITEM_HOLD = 0.4;
/** Thumb and index this close: a pinch (drawing), not a sign. */
const DRAWING_GAP = 0.04;
/** A pinching index is straighter than this; a fist's index is curled in below it. */
const PINCH_INDEX = 0.0;
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
/** V sign: index and middle straight, ring and pinky curled (one is enough), neither straight. */
export function isVSign(hand: HandState, slack = 0): boolean {
  if (hand.straight[0] < STRAIGHT - slack || hand.straight[1] < STRAIGHT - slack) return false;
  if (hand.straight[2] > STRAIGHT + slack || hand.straight[3] > STRAIGHT + slack) return false;
  return hand.straight[2] < CURLED + slack || hand.straight[3] < CURLED + slack;
}

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

/**
 * A hand pinching to draw: thumb and index together, the index only bent to
 * meet the thumb. (In a fist the index is curled right in, below 0, though
 * the thumb may rest near its tip.)
 */
function drawing(hand: HandState): boolean {
  return hand.pinch < DRAWING_GAP && hand.straight[0] > PINCH_INDEX;
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
  /** Which hands may sign (on the page, in front of you); default all. */
  usable: (hand: HandState) => boolean = () => true,
): Reading {
  out.sign = 'none';
  out.hand = null;
  out.paused = false;
  // Hands drawing in the air, or out of place, sign nothing: treat them as not there.
  const ok = (h: HandState) => h.tracked && !drawing(h) && usable(h);
  if (!ok(left) || !ok(right)) {
    const l = ok(left) ? left : NOT_SIGNING;
    const r = ok(right) ? right : NOT_SIGNING;
    classifySign(l, r, forward, out, keep);
    return out;
  }
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

const TWO_HANDED: readonly Sign[] = ['wall'];
/** Stands in for a hand that is drawing or out of place. */
const NOT_SIGNING = { tracked: false } as HandState;

function classifySign(
  left: HandState,
  right: HandState,
  forward: Vector3,
  out: Reading,
  keep: Sign,
): Reading {
  const slack = (sign: Sign) => (sign === keep ? STICKY : 0);
  // Two open palms pushed forward, side by side: the defence wall (one palm alone is the shield).
  // No charging, and no other two-handed signs.
  if (left.tracked && right.tracked && isOpen(left, STICKY) && isOpen(right, STICKY)) {
    between.copy(right.palm).sub(left.palm);
    const gap = between.length();
    const wall = slack('wall');
    if (
      isOpen(left, wall) &&
      isOpen(right, wall) &&
      left.normal.dot(forward) > PALM_FORWARD - wall &&
      right.normal.dot(forward) > PALM_FORWARD - wall &&
      Math.abs(right.palm.y - left.palm.y) < WALL_MAX_RISE + wall &&
      gap > WALL_MIN_GAP &&
      gap < WALL_MAX_GAP + wall
    ) {
      out.sign = 'wall';
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
  // One open palm pushed forward: the shield (two would have been the wall, above).
  const shield = slack('shield');
  for (const hand of [left, right]) {
    if (hand.tracked && isOpen(hand, shield) && hand.normal.dot(forward) > PALM_FORWARD - shield) {
      out.sign = 'shield';
      out.hand = hand.side;
      return out;
    }
  }
  const sling = slack('sling');
  for (const hand of [left, right]) {
    if (hand.tracked && isVSign(hand, sling)) {
      out.sign = 'sling';
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
  /** Always idle now: a sign summons straight away (kept for the HUD and tutorial). */
  phase: Phase = 'idle';
  /** The sign just used: it must be let go before it summons again. */
  private spent: Sign = 'none';
  /** The sign currently being held towards a trigger. */
  candidate: Sign = 'none';
  /** 0 → 1 while the candidate is held. */
  progress = 0;
  /** Seconds left while armed. */
  armedLeft = 0;
  private held = 0;
  private miss = 0;
  private hand: Side | null = null;

  /**
   * `allow(item)`: may this item come now (not while another is in hand,
   * not straight after a throw); a sign for one that may not is ignored.
   */
  update(dt: number, reading: Reading, events: GestureEvent[], allow: (item: Item) => boolean = () => true): void {
    // A hand just dropped out of tracking: freeze everything.
    if (reading.paused) return;
    let sign = reading.sign;
    // The sign that just summoned must be let go first.
    if (this.spent !== 'none') {
      if (sign === this.spent) sign = 'none';
      else this.spent = 'none';
    }
    if (sign !== 'none' && sign !== 'arm' && !allow(sign)) sign = 'none';
    const wanted = sign !== 'none' && sign !== 'arm';
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

    const need = ITEM_HOLD;
    this.progress = Math.min(1, this.held / need);
    if (this.held < need) return;

    const item = this.candidate as Item;
    const hand = this.hand;
    this.reset();
    this.spent = item;
    events.push({ type: 'summon', item, hand });
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
