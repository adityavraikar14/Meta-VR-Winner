// Shadow Arms with simulated hands: every hand shape forms its weapon, a punch
// throws it, the sword swings, the shield blocks only when it faces the foe,
// and a drawn weapon stays in hand whatever shape the hand makes.
import { Group, Vector3 } from '@iwsdk/core';

import type { HandState } from '../src/creatures/hand-input.ts';
import { createExtension, type Extension } from '../src/hand-pose.ts';
import { type ArmShot, classifyShape, ShadowArms, type ShadowShape } from '../src/fight/shadow-arms.ts';

const S = 0.95; // straight
const C = 0.2; // curled
type Pose = [thumb: number, index: number, middle: number, ring: number, pinky: number];
const POSES: Record<ShadowShape, Pose> = {
  fist: [C, C, C, C, C],
  blade: [C, S, S, S, S],
  palm: [S, S, S, S, S],
  point: [C, S, C, C, C],
  vee: [C, S, S, C, C],
  three: [C, S, S, S, C],
  horns: [C, S, C, C, S],
  shaka: [S, C, C, C, S],
  ell: [S, S, C, C, C],
  thumb: [S, C, C, C, C],
};

function hand(pose: Pose, palm: Vector3, facing = new Vector3(0, 0, -1)): HandState {
  const ext: Extension = createExtension();
  [ext.thumb, ext.index, ext.middle, ext.ring, ext.pinky] = pose;
  return {
    tracked: true,
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
check(classifyShape(hand([0.65, 0.6, 0.6, 0.6, 0.6], new Vector3())) === null, 'a half-open hand is no shape');

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
for (const shape of Object.keys(POSES) as ShadowShape[]) {
  const arms = new ShadowArms(space);
  const shots: ArmShot[] = [];
  const formed: ShadowShape[] = [];
  run(arms, 40, () => hand(POSES[shape], still), shots, formed);
  check(formed[0] === shape && arms.shapeIn(1) === shape, `${shape}: forms after holding the shape`);
  if (shape === 'palm') continue;
  // A punch towards the foe at 2 m/s (the sword: a sideways swing at 2.5 m/s).
  const swing = shape === 'blade' ? new Vector3(2.5, 0, 0) : foe.clone().sub(still).normalize().multiplyScalar(2);
  run(arms, 12, (f) => hand(POSES[shape], still.clone().addScaledVector(swing, f * dt)), shots, formed);
  check(shots.length === 1 && shots[0].shape === shape, `${shape}: ${shape === 'blade' ? 'a swing sends a slash' : 'a punch throws it'} (${shots.length} shot)`);
  check(shape === 'blade' ? arms.shapeIn(1) === 'blade' : arms.shapeIn(1) === null, `${shape}: ${shape === 'blade' ? 'the sword stays in hand' : 'gone from the hand once thrown'}`);
}
// A slow drift is no punch.
{
  const arms = new ShadowArms(space);
  const shots: ArmShot[] = [];
  run(arms, 40, () => hand(POSES.fist, still), shots, []);
  run(arms, 60, (f) => hand(POSES.fist, still.clone().add(new Vector3(0, 0, -0.3 * f * dt))), shots, []);
  check(shots.length === 0, 'fist: a slow drift towards them throws nothing');
}
// The shield: only facing the foe, and it blocks in front of the palm.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.palm, still, new Vector3(0, -1, 0)), [], []);
  check(arms.shapeIn(1) === null, 'palm facing the floor: no shield (a relaxed hand)');
  const toFoe = foe.clone().sub(still).normalize();
  run(arms, 40, () => hand(POSES.palm, still, toFoe), [], []);
  check(arms.shapeIn(1) === 'palm', 'palm facing the foe: shield');
  check(arms.blocks(still.clone().addScaledVector(toFoe, 0.05)), 'the shield blocks ink just in front of it');
  check(!arms.blocks(still.clone().add(new Vector3(0.5, 0, 0))), 'and not ink well to the side');
}
// The sword blocks along its blade.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.blade, still), [], []);
  check(arms.blocks(still.clone().add(new Vector3(0, 0.09 + 0.15, -0.02))), 'the sword blocks ink along its blade');
}
// A drawn weapon stays, whatever shape the hand is in, until it is thrown.
{
  const arms = new ShadowArms(space);
  arms.give(1, 'point');
  const shots: ArmShot[] = [];
  run(arms, 120, () => hand(POSES.palm, still), shots, []);
  check(arms.shapeIn(1) === 'point', 'a drawn spear stays through an open hand');
  const punch = foe.clone().sub(still).normalize().multiplyScalar(2);
  run(arms, 12, (f) => hand(POSES.palm, still.clone().addScaledVector(punch, f * dt)), shots, []);
  check(shots.length === 1 && shots[0].shape === 'point', 'and a punch throws it');
}
// Untracked: everything is let go.
{
  const arms = new ShadowArms(space);
  run(arms, 40, () => hand(POSES.fist, still), [], []);
  arms.update(dt, [off, off], foe, () => {}, () => {});
  check(arms.shapeIn(1) === null, 'a hand lost to tracking drops its weapon');
}
console.log(failures ? `${failures} failed` : 'all shadow arms checks passed');
if (failures) process.exitCode = 1;
