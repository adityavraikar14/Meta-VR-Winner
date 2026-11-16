// The Arsenal's signs with simulated hands: one sign summons its item straight
// away (no charging first), two hands never make two things, a pinching hand
// (drawing) makes no sign, a sign held on does not summon again, nothing comes
// while something is in hand, and a hand out of place (off the page) signs nothing.
import { Vector3 } from '@iwsdk/core';

import { classify, type GestureEvent, GestureRecognizer, type Item, type Reading } from '../src/yash/gestures.ts';
import type { HandState } from '../src/yash/hands.ts';

const S = 1; // straight
const C = -0.4; // curled
type Fingers = [index: number, middle: number, ring: number, pinky: number];
const forward = new Vector3(0, 0, -1);

function hand(side: 'left' | 'right', fingers: Fingers, normal: Vector3, pinch = 0.09, palm = new Vector3(side === 'right' ? 0.15 : -0.15, 1.1, -0.35)): HandState {
  return {
    side,
    tracked: true,
    lostFor: 0,
    straight: Float32Array.from(fingers),
    normal: normal.clone().normalize(),
    palm,
    pinch,
  } as unknown as HandState;
}
const none = { side: 'left', tracked: false, lostFor: Infinity, straight: new Float32Array(4), normal: new Vector3(), palm: new Vector3(), pinch: 1 } as unknown as HandState;
const FIST: Fingers = [C, C, C, C];
const OPEN: Fingers = [S, S, S, S];
const GUN: Fingers = [S, C, C, C];
const VEE: Fingers = [S, S, C, C];
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

let failures = 0;
function check(ok: boolean, what: string): void {
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', what);
}

/** Holds the hands for `seconds` at 72 fps; returns what was summoned. */
function hold(r: GestureRecognizer, left: HandState, right: HandState, seconds: number, allow: (item: Item) => boolean = () => true, usable?: (h: HandState) => boolean): Item[] {
  const reading: Reading = { sign: 'none', hand: null };
  const events: GestureEvent[] = [];
  const out: Item[] = [];
  for (let t = 0; t < seconds; t += 1 / 72) {
    classify(left, right, forward, reading, r.candidate, usable);
    r.update(1 / 72, reading, events, allow);
    for (const e of events) if (e.type === 'summon') out.push(e.item);
    events.length = 0;
  }
  return out;
}

// One sign, straight to its item: no "hold a ball" first.
for (const [name, fingers, normal, item] of [
  ['a fist', FIST, DOWN, 'sword'],
  ['an open palm up', OPEN, UP, 'ball'],
  ['an open palm forward', OPEN, forward, 'shield'],
  ['a finger gun', GUN, DOWN, 'gun'],
  ['a V sign', VEE, DOWN, 'sling'],
] as Array<[string, Fingers, Vector3, Item]>) {
  const got = hold(new GestureRecognizer(), none, hand('right', fingers, normal), 0.6);
  check(got.length === 1 && got[0] === item, `${name} summons the ${item} straight away (${got.join(',') || 'nothing'})`);
}
check(hold(new GestureRecognizer(), none, hand('right', FIST, DOWN), 0.25).length === 0, 'a sign only passed through (a quarter second) summons nothing');

// Held on, the same sign does not summon again and again.
{
  const r = new GestureRecognizer();
  const got = hold(r, none, hand('right', FIST, DOWN), 3);
  check(got.length === 1, `a fist held for 3 s: one sword, not ${got.length}`);
}

// Two hands: never two things at once.
{
  const got = hold(new GestureRecognizer(), hand('left', FIST, DOWN), hand('right', FIST, DOWN), 0.6);
  check(got.length === 1 && got[0] === 'sword', `two fists: one sword (${got.join(',')})`);
  const two = hold(new GestureRecognizer(), hand('left', OPEN, forward), hand('right', OPEN, forward), 0.6);
  check(two.length === 1 && two[0] === 'shield', `two palms forward: one shield, no wall (${two.join(',')})`);
}

// Drawing: a pinching hand makes no sign.
{
  const got = hold(new GestureRecognizer(), none, hand('right', [0.2, C, C, C], DOWN, 0.015), 0.8);
  check(got.length === 0, `a pinch with the other fingers curled is drawing, not a sword (${got.join(',') || 'nothing'})`);
  const fist = hold(new GestureRecognizer(), none, hand('right', FIST, DOWN, 0.02), 0.6);
  check(fist[0] === 'sword', 'a real fist with the thumb near the index is still a sword');
}

// Nothing new while something is in hand (the game says what may come).
{
  const got = hold(new GestureRecognizer(), none, hand('right', OPEN, forward), 0.8, (item) => item !== 'shield');
  check(got.length === 0, 'a sign for something that may not come now summons nothing');
}

// Out of place (off the page, or not in front of you): no sign.
{
  const got = hold(new GestureRecognizer(), none, hand('right', FIST, DOWN), 0.8, undefined, () => false);
  check(got.length === 0, 'a fist out of place summons nothing');
  const other = hold(new GestureRecognizer(), hand('left', FIST, DOWN), hand('right', OPEN, DOWN), 0.8, undefined, (h) => h.side === 'left');
  check(other[0] === 'sword', 'the hand that is in place still signs');
}

console.log(failures ? `${failures} failed` : 'all Arsenal sign checks passed');
if (failures) process.exitCode = 1;
