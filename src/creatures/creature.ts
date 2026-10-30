import { Color, Quaternion, Vector3 } from '@iwsdk/core';
import { playBoing, playGiggle } from '../audio.js';
import type { Effects } from './fx.js';
import type { HandState } from './hand-input.js';
import type { CreatureRig } from './rig.js';

export type CreatureState =
  | 'emerging'
  | 'leaping'
  | 'idle'
  | 'hopping'
  | 'held'
  | 'falling'
  | 'onPalm'
  | 'flying'
  | 'perched';

/** Where creatures live: a round stage in front of the player. */
export interface Ground {
  /** Centre of the stage's top surface. */
  center: Vector3;
  radius: number;
  /** The viewer's head, so creatures can look at them. */
  viewer: Vector3;
}

const EMERGE_TIME = 0.8;
const HOP_TIME = 0.32;
const GRAVITY = 9.8;
const PALM_WAIT = 0.45;
/** How long a pointed finger must be held up before a bird comes to perch. */
const PERCH_WAIT = 0.6;
const FLIGHT_TIME = 4.5;
const BLACK = new Color(0x140b05);
const UP = new Vector3(0, 1, 0);

/**
 * One living creature: its state machine, procedural animation, and reactions
 * to poking, petting, pinch-grabbing and an open palm.
 */
export class Creature {
  state: CreatureState = 'emerging';
  /** Feet position in world space. */
  readonly position = new Vector3();
  /** 0..1, rises while petted or carried on a palm. */
  happiness = 0;
  petting = false;

  private stateTime = 0;
  private velocity = new Vector3();
  private yaw = 0;
  private squash = 1;
  private squashVelocity = 0;
  private blinkIn = 2;
  private blinking = 0;
  private idleIn = 1.5;
  private twitch = 0;
  private twitchSide = 1;
  private heartIn = 0;
  private wasTouching = [false, false];
  private palmTime = [0, 0];
  private pointTime = [0, 0];
  private hand = -1;
  private flightAngle = 0;
  private flightRadius = 0.3;
  private leapFrom = new Vector3();
  private leapTo = new Vector3();
  private leapDuration = 0.8;
  private leapHeight = 0.15;
  private afterLeap: CreatureState = 'idle';
  private hopsLeft = 0;
  private emergeRotation = new Quaternion();
  private tmp = new Vector3();
  private top = new Vector3();
  private center = new Vector3();

  constructor(
    readonly rig: CreatureRig,
    private readonly fx: Effects,
    readonly scale = 1.25,
  ) {
    rig.root.scale.setScalar(scale);
  }

  /** Start as a flat shadow on the paper that inflates into colour. */
  emergeFrom(at: Vector3, facing: Quaternion): void {
    this.position.copy(at);
    this.emergeRotation.copy(facing);
    // Yaw that matches the paper's facing, so the hand-off to leaping is seamless.
    this.tmp.set(0, 0, 1).applyQuaternion(facing);
    this.yaw = Math.atan2(this.tmp.x, this.tmp.z);
    this.setTint(0);
    this.setState('emerging');
  }

  /** True once the emerge animation has finished and the creature can move. */
  get emerged(): boolean {
    return this.state !== 'emerging';
  }

  /** Leap from the paper to a resting spot on the stage. */
  landAt(spot: Vector3): void {
    this.leap(spot, 0.9, 0.22);
  }

  private setState(state: CreatureState): void {
    this.state = state;
    this.stateTime = 0;
  }

  private setTint(k: number): void {
    for (const { material, color } of this.rig.tints) {
      material.color.copy(BLACK).lerp(color, k);
    }
  }

  private leap(to: Vector3, duration: number, height: number, then: CreatureState = 'idle'): void {
    this.leapFrom.copy(this.position);
    this.leapTo.copy(to);
    this.leapDuration = duration;
    this.leapHeight = height;
    this.afterLeap = then;
    this.squash = 0.75;
    this.setState('leaping');
  }

  update(dt: number, time: number, ground: Ground, hands: HandState[]): void {
    this.stateTime += dt;
    const rig = this.rig;
    const s = this.scale;
    this.center.copy(this.position).addScaledVector(UP, rig.height * 0.35 * s);

    if (this.state === 'emerging') {
      const k = Math.min(1, this.stateTime / EMERGE_TIME);
      this.setTint(k * k);
      rig.root.position.copy(this.position);
      rig.root.quaternion.copy(this.emergeRotation);
      rig.root.scale.set(s, s, s * (0.05 + 0.95 * k));
      if (k >= 1) {
        rig.root.scale.setScalar(s);
        this.fx.burst(this.center, 24, 0.4);
        this.setState('idle');
      }
      return;
    }

    switch (this.state) {
      case 'leaping': {
        const k = Math.min(1, this.stateTime / this.leapDuration);
        this.position.lerpVectors(this.leapFrom, this.leapTo, k);
        this.position.y += Math.sin(k * Math.PI) * this.leapHeight;
        this.faceTowards(this.leapTo, dt, 10);
        if (k >= 1) {
          this.position.copy(this.leapTo);
          this.land(this.afterLeap === 'onPalm' ? 0.85 : 0.65);
          this.setState(this.afterLeap);
        }
        break;
      }
      case 'idle':
        this.updateIdle(dt, ground);
        break;
      case 'hopping':
        this.updateHopping(ground);
        break;
      case 'held': {
        const hand = hands[this.hand];
        if (!hand || !hand.tracked || !hand.pinching) {
          // Let go: keep the hand's motion so it can be gently tossed.
          if (hand) this.velocity.copy(hand.pinchVelocity).clampLength(0, 1.2);
          else this.velocity.set(0, 0, 0);
          this.setState('falling');
          break;
        }
        // Held by the scruff, hanging below the pinch.
        this.position.copy(hand.pinch).addScaledVector(UP, -rig.height * 0.8 * s);
        this.faceTowards(ground.viewer, dt, 4);
        break;
      }
      case 'falling':
        this.updateFalling(dt, ground);
        break;
      case 'onPalm': {
        const hand = hands[this.hand];
        if (!hand || !hand.tracked || hand.palmNormal.y < 0.35) {
          this.velocity.set(0, 0.3, 0);
          playGiggle();
          this.setState('falling');
          break;
        }
        this.position.copy(hand.palm).addScaledVector(hand.palmNormal, 0.012);
        this.happiness = Math.min(1, this.happiness + dt * 0.4);
        this.faceTowards(ground.viewer, dt, 3);
        break;
      }
      case 'flying':
        this.updateFlying(dt, ground);
        break;
      case 'perched': {
        const hand = hands[this.hand];
        if (!hand || !hand.tracked || !hand.pointing) {
          this.returnToStage(ground);
          break;
        }
        this.position.copy(hand.indexTip).addScaledVector(UP, 0.006);
        this.happiness = Math.min(1, this.happiness + dt * 0.3);
        this.faceTowards(ground.viewer, dt, 3);
        break;
      }
    }

    if (this.state !== 'leaping' && this.state !== 'falling') this.react(dt, hands);
    this.animate(dt, time, ground);
  }

  private updateIdle(dt: number, ground: Ground): void {
    this.position.y = ground.center.y;
    this.faceTowards(ground.viewer, dt, 3);
    this.idleIn -= dt;
    if (this.idleIn > 0 || this.petting) return;
    this.idleIn = 1.5 + Math.random() * 3;
    const roll = Math.random();
    if (this.rig.locomotion === 'flyer' && roll < 0.3) {
      // Take off for a lap around the player.
      this.flightAngle = Math.atan2(
        this.position.z - ground.center.z,
        this.position.x - ground.center.x,
      );
      this.flightRadius = 0.22 + Math.random() * 0.12;
      this.setState('flying');
    } else if (roll < 0.45) {
      // Wander: a few small hops to a nearby spot on the stage.
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * ground.radius * 0.65;
      this.leapTo.set(
        ground.center.x + Math.cos(angle) * r,
        ground.center.y,
        ground.center.z + Math.sin(angle) * r,
      );
      this.leapFrom.copy(this.position);
      this.hopsLeft = 2 + Math.floor(Math.random() * 2);
      this.setState('hopping');
    } else if (roll < 0.8) {
      this.twitch = 1;
      this.twitchSide = Math.random() < 0.5 ? -1 : 1;
    } else {
      this.squash = 0.8; // A little bounce in place.
    }
  }

  /** Small hops, each covering an equal share of the way to `leapTo`. */
  private updateHopping(ground: Ground): void {
    const k = Math.min(1, this.stateTime / HOP_TIME);
    this.tmp.subVectors(this.leapTo, this.leapFrom).divideScalar(this.hopsLeft);
    this.position.copy(this.leapFrom).addScaledVector(this.tmp, k);
    this.position.y = ground.center.y + Math.sin(k * Math.PI) * 0.035;
    this.yawTowards(this.leapTo);
    if (k >= 1) {
      this.leapFrom.copy(this.position).setY(ground.center.y);
      this.squash = 0.82;
      this.hopsLeft--;
      this.stateTime = 0;
      if (this.hopsLeft <= 0) this.setState('idle');
    }
  }

  /** Circle above the stage, rising and dipping, then glide back down. */
  private updateFlying(dt: number, ground: Ground): void {
    const climb = Math.min(1, this.stateTime / 0.6);
    this.flightAngle += dt * 1.6;
    const r = this.flightRadius * climb;
    this.tmp.set(
      ground.center.x + Math.cos(this.flightAngle) * r,
      ground.center.y + (0.18 + Math.sin(this.stateTime * 2.2) * 0.04) * climb,
      ground.center.z + Math.sin(this.flightAngle) * r,
    );
    this.position.lerp(this.tmp, Math.min(1, dt * 6));
    // Face along the direction of flight.
    this.tmp.set(-Math.sin(this.flightAngle), 0, Math.cos(this.flightAngle)).add(this.position);
    this.faceTowards(this.tmp, dt, 8);
    if (this.stateTime > FLIGHT_TIME) this.returnToStage(ground);
  }

  /** Fly or hop back to a random resting spot on the stage. */
  private returnToStage(ground: Ground): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * ground.radius * 0.55;
    this.tmp.set(
      ground.center.x + Math.cos(angle) * r,
      ground.center.y,
      ground.center.z + Math.sin(angle) * r,
    );
    this.leap(this.tmp, 0.8, 0.12);
  }

  private updateFalling(dt: number, ground: Ground): void {
    this.velocity.y -= GRAVITY * dt;
    this.velocity.x *= 1 - 1.5 * dt;
    this.velocity.z *= 1 - 1.5 * dt;
    this.position.addScaledVector(this.velocity, dt);
    // Drift back over the stage so a creature can never be lost.
    this.tmp.subVectors(this.position, ground.center).setY(0);
    const limit = ground.radius * 0.75;
    if (this.tmp.length() > limit) {
      this.tmp.setLength(limit);
      const pull = Math.min(1, dt * 4);
      this.position.x += (ground.center.x + this.tmp.x - this.position.x) * pull;
      this.position.z += (ground.center.z + this.tmp.z - this.position.z) * pull;
    }
    if (this.position.y <= ground.center.y && this.velocity.y < 0) {
      this.position.y = ground.center.y;
      const impact = Math.min(1, -this.velocity.y / 3);
      this.velocity.set(0, 0, 0);
      this.land(0.85 - impact * 0.3);
      this.setState('idle');
    }
  }

  private land(squash: number): void {
    this.squash = squash;
    this.squashVelocity = 0;
    playBoing();
    this.fx.burst(this.position, 6, 0.15);
  }

  /** Poke, pet, grab and palm checks against both hands. */
  private react(dt: number, hands: HandState[]): void {
    const rig = this.rig;
    const s = this.scale;
    const radius = rig.radius * s;
    this.top.copy(this.position).addScaledVector(UP, rig.height * 0.55 * s);
    let pettingNow = false;

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      if (!hand.tracked) {
        this.wasTouching[i] = false;
        this.palmTime[i] = 0;
        this.pointTime[i] = 0;
        continue;
      }

      // Grab: a pinch that starts on or right next to the body.
      if (
        this.state !== 'held' &&
        hand.pinchStarted &&
        hand.pinch.distanceTo(this.center) < radius + 0.035
      ) {
        this.hand = i;
        this.happiness = Math.max(this.happiness, 0.3);
        playGiggle();
        this.setState('held');
        return;
      }

      // Poke: the index tip pushes into the body.
      const touching = hand.indexTip.distanceTo(this.center) < radius;
      if (touching && !this.wasTouching[i] && this.state !== 'held') {
        this.squash = 0.62;
        this.squashVelocity = 0;
        this.blinking = 0.25;
        playGiggle();
        this.fx.burst(hand.indexTip, 5, 0.18);
      }
      this.wasTouching[i] = touching;

      // Pet: fingertips stroking over the head and back.
      for (let t = 0; t < hand.tips.length; t++) {
        if (hand.tipSpeeds[t] > 0.05 && hand.tips[t].distanceTo(this.top) < radius + 0.02) {
          pettingNow = true;
        }
      }

      // Perch: birds come and sit on a finger held up and pointing.
      const free = this.state === 'idle' || this.state === 'hopping' || this.state === 'flying';
      if (this.rig.locomotion === 'flyer' && free) {
        this.pointTime[i] = hand.pointing ? this.pointTime[i] + dt : 0;
        if (this.pointTime[i] > PERCH_WAIT) {
          this.pointTime[i] = 0;
          this.hand = i;
          this.tmp.copy(hand.indexTip).addScaledVector(UP, 0.006);
          this.leap(this.tmp, 0.7, 0.08, 'perched');
          playGiggle();
          return;
        }
      }

      // Palm: an open, upturned palm held close makes it hop on.
      if (this.state === 'idle' || this.state === 'hopping') {
        const near =
          !hand.pinching &&
          hand.palmNormal.y > 0.75 &&
          Math.hypot(hand.palm.x - this.position.x, hand.palm.z - this.position.z) < 0.14 &&
          Math.abs(hand.palm.y - this.position.y) < 0.15;
        this.palmTime[i] = near ? this.palmTime[i] + dt : 0;
        if (this.palmTime[i] > PALM_WAIT) {
          this.palmTime[i] = 0;
          this.hand = i;
          this.tmp.copy(hand.palm).addScaledVector(hand.palmNormal, 0.012);
          this.leap(this.tmp, 0.45, 0.06, 'onPalm');
          playGiggle();
          return;
        }
      }
    }

    this.petting = pettingNow;
    if (pettingNow) {
      this.happiness = Math.min(1, this.happiness + dt * 0.8);
      this.heartIn -= dt;
      if (this.heartIn <= 0) {
        this.heartIn = 0.3;
        this.fx.heart(this.tmp.copy(this.top).addScaledVector(UP, 0.03));
      }
    } else if (this.state !== 'onPalm' && this.state !== 'perched') {
      this.happiness = Math.max(0, this.happiness - dt * 0.25);
    }
  }

  private faceTowards(target: Vector3, dt: number, rate: number): void {
    this.turn(target, Math.min(1, dt * rate));
  }

  private yawTowards(target: Vector3): void {
    this.turn(target, 1);
  }

  private turn(target: Vector3, k: number): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const delta = Math.atan2(dx, dz) - this.yaw;
    this.yaw += Math.atan2(Math.sin(delta), Math.cos(delta)) * k;
  }

  /** Procedural life: squash spring, breathing, blinking, ears, tail, blush. */
  private animate(dt: number, time: number, ground: Ground): void {
    const rig = this.rig;
    rig.root.position.copy(this.position);
    rig.root.rotation.set(0, this.yaw, 0);

    // Damped spring back to the rest shape.
    const accel = -260 * (this.squash - 1) - 14 * this.squashVelocity;
    this.squashVelocity += accel * dt;
    this.squash += this.squashVelocity * dt;
    const sy = this.squash * (1 + Math.sin(time * 2.6) * 0.018);
    const sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    rig.body.scale.set(sxz, sy, sxz);

    // Blinking, or contented closed eyes while happy.
    const happy = this.happiness > 0.35 || this.petting;
    rig.happyEyes.visible = happy;
    rig.eyes.visible = !happy;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    rig.eyes.scale.y = this.blinking > 0 ? 0.12 : 1;

    // Ears: flatten while petted, stream back in the air, twitch now and then.
    this.twitch = Math.max(0, this.twitch - dt * 3);
    const airborne =
      this.state === 'leaping' ||
      this.state === 'falling' ||
      this.state === 'held' ||
      this.state === 'flying';
    const earBack = (this.petting ? -1.0 : airborne ? -0.5 : 0) + Math.sin(time * 1.7) * 0.05;
    const flutter = this.state === 'held' ? Math.sin(time * 18) * 0.15 : 0;
    const twitch = Math.sin(this.twitch * 20) * 0.3 * this.twitch;
    rig.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      ear.rotation.x = earBack + flutter * side + (this.twitchSide === side ? twitch : 0);
    });

    // Wings: fast flaps in the air, a happy flutter, otherwise folded.
    const flap = airborne
      ? 0.35 + Math.sin(time * (this.state === 'held' ? 38 : 30)) * 0.85
      : happy
        ? 0.15 + Math.sin(time * 20) * 0.15
        : this.twitch * 0.4;
    rig.wings.forEach((wing, i) => {
      wing.rotation.z = (i === 0 ? -1 : 1) * flap;
    });

    // Head follows the viewer within a comfortable range.
    const toViewer = Math.atan2(
      ground.viewer.x - this.position.x,
      ground.viewer.z - this.position.z,
    );
    let headYaw = toViewer - this.yaw;
    headYaw = Math.atan2(Math.sin(headYaw), Math.cos(headYaw));
    const clamped = Math.max(-0.7, Math.min(0.7, headYaw));
    rig.head.rotation.y += (clamped - rig.head.rotation.y) * Math.min(1, dt * 5);
    rig.head.rotation.z = happy ? Math.sin(time * 3) * 0.12 : 0;

    // Dangling, kicking feet when carried.
    const kick = this.state === 'held' ? Math.sin(time * 14) * 0.5 : 0;
    rig.feet[0].rotation.x = kick;
    rig.feet[1].rotation.x = -kick;

    rig.tail.rotation.y = happy ? Math.sin(time * 16) * 0.5 : 0;
    rig.cheeks.opacity = 0.3 + this.happiness * 0.6;
  }
}
