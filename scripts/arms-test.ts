// Shadow Arms with simulated hands: three signs (fist, one finger, open palm),
// a punch throws, the shield blocks only when it faces the foe, a drawn weapon
// stays in hand; a pinch is drawing (never a sign), one weapon at a time, and
// a sign counts only with its shadow on the screen.
import { Group, Vector3 } from '@iwsdk/core';
import { stage } from '../src/stage-state.ts';

import type { HandState } from '../src/creatures/hand-input.ts';
import { createExtension, type Extension } from '../src/hand-pose.ts';
import { type ArmShot, classifyShape, planVolley, shadowOnScreen, ShadowArms, type ShadowShape } from '../src/fight/shadow-arms.ts';

const S = 0.95; // straight
const C = 0.2; // curled
type Pose = [thumb: number, index: number, middle: number, ring: number, pinky: number];
const POSES: Partial<Record<ShadowShape, Pose>> = {
  fist: [C, C, C, C, C],
  palm: [S, S, S, S, S],
  point: [C, S, C, C, C],
};

function hand(pose: Pose, palm: Vector3, facing = new Vector3(0, 0, -1), pinchGap = 0.09): HandState {
  const ext: Extension = createExtension();
  [ext.thumb, ext.index, ext.middle, ext.ring, ext.pinky] = pose;
  return {
    tracked: true,
    pinchGap,
    pinching: pinchGap < 0.03,
    ext,
    palm: palm.clone(),
    palmNormal: facing.clone().normalize(),
    wrist: palm.clone().add(new Vector3(0, -0.07, 0.02)),
    indexTip: palm.clone().add(new Vector3(0, 0.09, -0.02)),
  } as unknown as HandState;
}
const off = { tracked: false } as unknown as HandState;

let failures = 0;
function check(ok: boolean, what: string): void {
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', what);
}

// 1. Every pose is read as its own shape, and an in-between hand as none.
for (const [shape, pose] of Object.entries(POSES) as Array<[ShadowShape, Pose]>) {
  check(classifyShape(hand(pose, new Vector3())) === shape, `pose reads as ${shape}`);
}
check(classifyShape(hand([0.65, 0.65, 0.65, 0.65, 0.65], new Vector3())) === null, 'a half-open hand is no shape');
// Fists come every way: thumb tucked, wrapped over the fingers, sticking up, or resting by the index.
check(classifyShape(hand([S, C, C, C, C], new Vector3())) === 'fist', 'a fist with the thumb out is still a fist');
check(classifyShape(hand([0.7, C, C, C, C], new Vector3())) === 'fist', 'a fist with the thumb across the fingers is a fist');
check(classifyShape(hand([C, 0.1, 0.5, 0.55, 0.5], new Vector3())) === 'fist', 'a loose fist is a fist');
check(classifyShape(hand([C, C, C, C, C], new Vector3(), undefined, 0.02)) === 'fist', 'a fist whose thumb rests by the index is a fist, not a pinch');
// Gone: a flat hand (it was a sword), a peace sign and the rest are no weapons now.
check(classifyShape(hand([C, S, S, S, S], new Vector3())) === null, 'a flat hand, thumb in, is no weapon');
check(classifyShape(hand([C, S, S, C, C], new Vector3())) === null, 'a peace sign is no weapon');
// Drawing: a pinch is never a sign.
check(classifyShape(hand([0.6, 0.6, S, S, S], new Vector3(), undefined, 0.015)) === null, 'a pinch (others open) is drawing, not a sign');
check(classifyShape(hand([0.6, 0.55, C, C, C], new Vector3(), undefined, 0.015)) === null, 'a pinch (others curled) is drawing, not a fist');
check(classifyShape(hand([C, S, C, C, C], new Vector3(), undefined, 0.02)) === null, 'one finger pinched to the thumb is drawing, not a spear');

// 2. Forming, punching, swinging, shielding.
const space = new Group();
const foe = new Vector3(0, 1.2, -1.2);
const dt = 1 / 72;
function run(arms: ShadowArms, frames: number, make: (f: number) => HandState, shots: ArmShot[], formed: ShadowShape[]): void {
  for (let f = 0; f < frames; f++) {
    arms.update(dt, [off, make(f)], foe, (_h, shape) => formed.push(shape), (shot) => shots.push(shot));
  }
}
const still = new Vector3(0.15, 1.1, -0.3);
for (const shape of ['fist', 'point'] as ShadowShape[]) {
  const arms = new ShadowArms(space);
  const shots: ArmShot[] = [];
  const formed: ShadowShape[] = [];
  run(arms, 40, () => hand(POSES[shape]!, still), shots, formed);
  check(formed[0] === shape && arms.shapeIn(1) === shape, `${shape}: forms after holding the shape`);
  // A punch towards the foe at 2 m/s.
  const swing = foe.clone().sub(still).normalize().multiplyScalar(2);
  run(arms, 12, (f) => hand(POSES[shape]!, still.clone().addScaledVector(swing, f * dt)), shots, formed);
  check(shots.length === 1 && shots[0].shape === shape, `${shape}: a punch throws it (${shots.length} shot)`);
  check(arms.shapeIn(1) === null, `${shape}: gone from the hand once thrown`);
}
// One weapon to throw at a time: two fists make one ball, not two.
{
  const arms = new ShadowArms(space);
  const formed: ShadowShape[] = [];
  const other = new Vector3(-0.15, 1.1, -0.3);
  for (let f = 0; f < 60; f++) arms.update(dt, [hand(POSES.fist!, other), hand(POSES.fist!, still)], foe, (_h, shape) => formed.push(shape), () => {});
  check(formed.length === 1, `two fists: one Shadow Ball, not two (${formed.length})`);
}
// A pinch drops a hand-made ball at once: drawing comes first.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.fist!, still), [], []);
  run(arms, 2, () => hand([0.6, 0.6, S, S, S], still, undefined, 0.015), [], []);
  check(arms.shapeIn(1) === null && !arms.busy(1), 'pinching to draw drops the ball, and the hand is free to draw');
}
// On the page: a sign counts only with its shadow on the screen.
{
  const paper = new Group();
  paper.updateMatrixWorld(true);
  stage.paper = paper;
  stage.lantern = [0, -0.1, 1.1];
  check(shadowOnScreen(new Vector3(0, 0, 0.6)), 'a hand up in the light: its shadow is on the screen');
  check(!shadowOnScreen(new Vector3(0, -0.6, 0.7)), 'a hand down in your lap: its shadow is off the screen');
  check(!shadowOnScreen(new Vector3(0, 0, 1.3)), 'a hand behind the lantern casts no shadow');
  const arms = new ShadowArms(space);
  const formed: ShadowShape[] = [];
  run(arms, 40, () => hand(POSES.fist!, new Vector3(0, -0.6, 0.7)), [], formed);
  check(formed.length === 0 && arms.offScreenSign() > 0.3, 'a fist out of the light makes no ball (and the fight can say why)');
  run(arms, 40, () => hand(POSES.fist!, new Vector3(0, 0, 0.6)), [], formed);
  check(formed[0] === 'fist', 'the same fist up in the light makes its ball');
  stage.paper = null;
}
// A slow drift is no punch.
{
  const arms = new ShadowArms(space);
  const shots: ArmShot[] = [];
  run(arms, 40, () => hand(POSES.fist!, still), shots, []);
  run(arms, 60, (f) => hand(POSES.fist!, still.clone().add(new Vector3(0, 0, -0.3 * f * dt))), shots, []);
  check(shots.length === 0, 'fist: a slow drift towards them throws nothing');
}
// The shield: only facing the foe, and it blocks in front of the palm.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.palm!, still, new Vector3(0, -1, 0)), [], []);
  check(arms.shapeIn(1) === null, 'palm facing the floor: no shield (a relaxed hand)');
  const toFoe = foe.clone().sub(still).normalize();
  run(arms, 40, () => hand(POSES.palm!, still, toFoe), [], []);
  check(arms.shapeIn(1) === 'palm', 'palm facing the foe: shield');
  check(arms.blocks(still.clone().addScaledVector(toFoe, 0.05)), 'the shield blocks ink just in front of it');
  check(!arms.blocks(still.clone().add(new Vector3(0.5, 0, 0))), 'and not ink well to the side');
}
// A drawn weapon stays, whatever shape the hand is in, until it is thrown.
{
  const arms = new ShadowArms(space);
  arms.give(1, 'point');
  const shots: ArmShot[] = [];
  run(arms, 120, () => hand(POSES.palm!, still), shots, []);
  check(arms.shapeIn(1) === 'point', 'a drawn spear stays through an open hand');
  const punch = foe.clone().sub(still).normalize().multiplyScalar(2);
  run(arms, 12, (f) => hand(POSES.palm!, still.clone().addScaledVector(punch, f * dt)), shots, []);
  check(shots.length === 1 && shots[0].shape === 'point', 'and a punch throws it');
}
// Untracked: everything is let go.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.fist!, still), [], []);
  arms.update(dt, [off, off], foe, () => {}, () => {});
  check(arms.shapeIn(1) === null, 'a hand lost to tracking drops its weapon');
}
// Every thrown weapon has a volley: how many projectiles, and they all fly.
{
  const want: Partial<Record<ShadowShape, number>> = { fist: 1, blade: 1, point: 1, vee: 2, three: 3, horns: 1, shaka: 1, ell: 1, thumb: 1 };
  for (const [shape, n] of Object.entries(want) as Array<[ShadowShape, number]>) {
    const parts = planVolley({ shape, from: still.clone(), swing: new Vector3() }, foe, new Vector3(1, 0, 0));
    check(parts.length === n && parts.every((p) => p.points.length >= 2 && p.flight > 0), `${shape}: a volley of ${n}`);
  }
  const bolt = planVolley({ shape: 'horns', from: still.clone(), swing: new Vector3() }, foe, new Vector3(1, 0, 0))[0];
  check(bolt.from.y > foe.y + 0.5, 'lightning starts above them');
}
console.log(failures ? `${failures} failed` : 'all shadow arms checks passed');
if (failures) process.exitCode = 1;
