import { Vector3 } from '@iwsdk/core';
import { createExtension, type Extension, readExtension } from '../hand-pose.js';
import { stage } from '../stage-state.js';

/** WebXR joint indices used for interaction. */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const PINKY_KNUCKLE = 21;
/** Fingertips that can poke and pet: index, middle, ring. */
export const TOUCH_TIPS = [9, 14, 19] as const;
const INDEX_TIP = 9;

/** Pinch closes below this thumb-index gap and opens above the second. */
const PINCH_CLOSE = 0.03;
const PINCH_OPEN = 0.05;

export interface HandState {
  tracked: boolean;
  pinching: boolean;
  /** Thumb-to-index tip distance in meters. */
  pinchGap: number;
  pinchStarted: boolean;
  pinchEnded: boolean;
  /** Midpoint between thumb and index tips. */
  pinch: Vector3;
  pinchVelocity: Vector3;
  palm: Vector3;
  wrist: Vector3;
  /** Unit vector out of the palm. */
  palmNormal: Vector3;
  tips: Vector3[];
  tipSpeeds: number[];
  indexTip: Vector3;
  /** Index straight, other fingers folded: a perch for birds. */
  pointing: boolean;
  /** How straight each finger is, 0 (curled) to 1 (straight). */
  ext: Extension;
}

function createHand(): HandState {
  return {
    tracked: false,
    pinching: false,
    pinchGap: 1,
    pinchStarted: false,
    pinchEnded: false,
    pinch: new Vector3(),
    pinchVelocity: new Vector3(),
    palm: new Vector3(),
    wrist: new Vector3(),
    palmNormal: new Vector3(0, -1, 0),
    tips: TOUCH_TIPS.map(() => new Vector3()),
    tipSpeeds: TOUCH_TIPS.map(() => 0),
    indexTip: new Vector3(),
    pointing: false,
    ext: createExtension(),
  };
}

/** Per-frame hand gestures for creature interaction: [left, right]. */
export class HandInput {
  readonly hands: [HandState, HandState] = [createHand(), createHand()];
  private previousPinch = [new Vector3(), new Vector3()];
  private previousTips = [TOUCH_TIPS.map(() => new Vector3()), TOUCH_TIPS.map(() => new Vector3())];
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private extension = createExtension();

  update(dt: number): void {
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      const joints = stage.joints[i];
      const wasTracked = hand.tracked;
      hand.tracked = stage.tracked[i];
      hand.pinchStarted = false;
      hand.pinchEnded = false;
      if (!hand.tracked) {
        if (hand.pinching) hand.pinchEnded = true;
        hand.pinching = false;
        hand.pointing = false;
        continue;
      }

      this.joint(joints, THUMB_TIP, this.a);
      this.joint(joints, INDEX_TIP, this.b);
      hand.indexTip.copy(this.b);
      const gap = this.a.distanceTo(this.b);
      hand.pinchGap = gap;
      this.previousPinch[i].copy(hand.pinch);
      hand.pinch.addVectors(this.a, this.b).multiplyScalar(0.5);
      if (wasTracked && dt > 0) {
        hand.pinchVelocity.subVectors(hand.pinch, this.previousPinch[i]).divideScalar(dt);
      } else {
        hand.pinchVelocity.set(0, 0, 0);
      }
      if (!hand.pinching && gap < PINCH_CLOSE) {
        hand.pinching = true;
        hand.pinchStarted = true;
      } else if (hand.pinching && gap > PINCH_OPEN) {
        hand.pinching = false;
        hand.pinchEnded = true;
      }

      // Palm normal from the wrist and the index/pinky knuckles; the cross
      // product points out of the palm for a right hand, so flip the left.
      this.joint(joints, WRIST, this.a);
      hand.wrist.copy(this.a);
      this.joint(joints, INDEX_KNUCKLE, this.b).sub(this.a);
      this.joint(joints, PINKY_KNUCKLE, this.c).sub(this.a);
      hand.palmNormal.crossVectors(this.b, this.c).normalize();
      if (i === 0) hand.palmNormal.negate();
      this.joint(joints, MIDDLE_KNUCKLE, this.b);
      hand.palm.addVectors(this.a, this.b).multiplyScalar(0.5);

      const ext = readExtension(joints, hand.ext);
      hand.pointing = ext.index > 0.8 && ext.middle < 0.35 && ext.ring < 0.35 && ext.pinky < 0.35;

      for (let t = 0; t < TOUCH_TIPS.length; t++) {
        const tip = hand.tips[t];
        const previous = this.previousTips[i][t];
        previous.copy(tip);
        this.joint(joints, TOUCH_TIPS[t], tip);
        hand.tipSpeeds[t] = wasTracked && dt > 0 ? tip.distanceTo(previous) / dt : 0;
      }
    }
  }

  private joint(joints: Float32Array, index: number, out: Vector3): Vector3 {
    return out.set(joints[index * 3], joints[index * 3 + 1], joints[index * 3 + 2]);
  }
}
