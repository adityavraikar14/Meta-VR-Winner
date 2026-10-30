import { Color, Quaternion, Vector3 } from '@iwsdk/core';
import {
  playBark,
  playBleat,
  playBoing,
  playChirp,
  playGiggle,
  playRawr,
  playSqueak,
  playTinkle,
  playYawn,
} from '../audio.js';
import { PetBrain, type Behavior } from './brain.js';
import type { Effects } from './fx.js';
import type { HandState } from './hand-input.js';
import type { CreatureRig } from './rig.js';

export type CreatureState =
  | 'emerging'
  | 'leaping'
  | 'idle'
  | 'held'
  | 'falling'
  | 'onPalm'
  | 'flying'
  | 'perched';

/** Where creatures live and what they can see around them. */
export interface Ground {
  /** Centre of the stage's top surface. */
  center: Vector3;
  radius: number;
  /** The viewer's head, so creatures can look at them. */
  viewer: Vector3;
  /** Every creature, so pets can find each other. */
  creatures: Creature[];
}

const EMERGE_TIME = 0.8;
const GRAVITY = 9.8;
const PALM_WAIT = 0.45;
/** How long a pointed finger must be held up before a bird comes to perch. */
const PERCH_WAIT = 0.6;
/** Pets keep at least this far apart on the stage. */
const PERSONAL_SPACE = 0.065;
const BLACK = new Color(0x140b05);
const UP = new Vector3(0, 1, 0);

/** Each kind's voice. */
const VOICES: Record<string, () => void> = {
  rabbit: playGiggle,
  bird: playChirp,
  snail: playSqueak,
  deer: playBleat,
  dog: playBark,
  butterfly: playTinkle,
  dragon: playRawr,
};

/** Temperament nudges per kind, applied on top of the random personality. */
const TEMPERAMENT: Record<string, Partial<Record<'energetic' | 'affectionate' | 'playful' | 'curious', number>>> = {
  dog: { affectionate: 1.5, playful: 1.3 },
  snail: { energetic: 0.55, curious: 1.3 },
  deer: { energetic: 1.2, affectionate: 0.8 },
  butterfly: { energetic: 1.3, playful: 1.2 },
  dragon: { playful: 1.4, energetic: 1.2 },
};

/**
 * One living creature: a state machine for being carried, perched or thrown,
 * a pet brain that chooses what to do on its own, procedural animation, and
 * reactions to poking, petting, pinch-grabbing and an open palm.
 */
export class Creature {
  state: CreatureState = 'emerging';
  /** Feet position in world space. */
  readonly position = new Vector3();
  /** 0..1, rises while petted or carried on a palm. */
  happiness = 0;
  petting = false;
  readonly brain = new PetBrain();
  behavior: Behavior = 'lookAround';

  private stateTime = 0;
  private velocity = new Vector3();
  private yaw = 0;
  private squash = 1;
  private squashVelocity = 0;
  private blinkIn = 2;
  private blinking = 0;
  private twitch = 0;
  private twitchSide = 1;
  private heartIn = 0;
  private wasTouching = [false, false];
  private palmTime = [0, 0];
  private pointTime = [0, 0];
  private hand = -1;
  private flightAngle = 0;
  private flightRadius = 0.3;
  private flightTime = 4.5;
  private leapFrom = new Vector3();
  private leapTo = new Vector3();
  private leapDuration = 0.8;
  private leapHeight = 0.15;
  private afterLeap: CreatureState = 'idle';
  private emergeRotation = new Quaternion();

  // Behaviour state.
  private behaviorTime = 0;
  private behaviorDuration = 1;
  private goal = new Vector3();
  private hasGoal = false;
  private goalAngle = 0;
  private hopT = -1;
  private hopTime = 0.32;
  private hopFrom = new Vector3();
  private hopTo = new Vector3();
  private friend: Creature | null = null;
  private lookTarget = new Vector3();
  private beatIn = 0;
  private sinceAttention = 0;
  private pettedFor = 0;
  private excitedFor = 0;

  // Posture, eased towards targets set by the current behaviour.
  private headPitch = 0;
  private headPitchTarget = 0;
  private lookOffset = 0;
  private lie = 0;
  private lieTarget = 0;
  private sway = 0;
  private sleeping = false;
  private preen = false;

  private tmp = new Vector3();
  private top = new Vector3();
  private center = new Vector3();

  constructor(
    readonly rig: CreatureRig,
    private readonly fx: Effects,
    readonly scale = 1.25,
  ) {
    rig.root.scale.setScalar(scale);
    const nudges = TEMPERAMENT[rig.kind] ?? {};
    for (const [trait, factor] of Object.entries(nudges)) {
      this.brain.personality[trait as keyof typeof nudges] *= factor;
    }
  }

  private hideFor = 0;
  private sneezeIn = 4 + Math.random() * 6;
  private trailIn = 0;
  private mouthPoint = new Vector3();

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

  /** Resting on the stage and free to be visited by other pets. */
  get settled(): boolean {
    return this.state === 'idle' && this.hopT < 0;
  }

  /** Leap from the paper to a resting spot on the stage. */
  landAt(spot: Vector3): void {
    this.leap(spot, 0.9, 0.22);
  }

  private setState(state: CreatureState): void {
    this.state = state;
    this.stateTime = 0;
    if (state !== 'idle') this.wake();
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
    this.hopT = -1;
    this.setState('leaping');
  }

  /** Any attention from the player: resets loneliness and wakes a napper. */
  private noticed(): void {
    this.sinceAttention = 0;
    if (this.sleeping) {
      this.wake();
      this.squash = 0.7;
      this.blinking = 0.3;
      this.startBehavior('lookAround', 2.5);
    }
  }

  private wake(): void {
    this.sleeping = false;
    this.lieTarget = 0;
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

    this.sinceAttention += dt;
    this.hideFor = Math.max(0, this.hideFor - dt);
    if (this.rig.extras?.mouth && this.state === 'idle' && !this.sleeping) {
      this.sneezeIn -= dt * (this.happiness > 0.3 ? 3 : 1);
      if (this.sneezeIn <= 0) {
        this.sneezeIn = 6 + Math.random() * 10;
        this.sneeze();
      }
    }
    this.excitedFor = Math.max(0, this.excitedFor - dt);
    if (this.sleeping) this.brain.energy = Math.min(1, this.brain.energy + dt * 0.06);
    else this.brain.tick(dt, this.state !== 'idle' || this.hopT >= 0);

    // Behaviours set their posture each frame; default is neutral.
    this.headPitchTarget = 0;
    this.lookOffset = 0;
    this.sway = 0;
    this.preen = false;
    this.lookTarget.copy(ground.viewer);

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
          if (this.afterLeap === 'idle') this.startBehavior('lookAround', 1 + Math.random() * 1.5);
        }
        break;
      }
      case 'idle':
        this.live(dt, ground, hands);
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
        this.noticed();
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
        this.noticed();
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
        this.noticed();
        if (Math.random() < dt * 0.4) this.sing();
        break;
      }
    }

    if (this.state !== 'leaping' && this.state !== 'falling') this.react(dt, hands);
    this.animate(dt, time);
  }

  // ---------------------------------------------------------------- Behaviour

  private startBehavior(behavior: Behavior, duration: number): void {
    this.behavior = behavior;
    this.behaviorTime = 0;
    this.behaviorDuration = duration;
    this.hasGoal = false;
    this.friend = null;
    this.beatIn = 0;
  }

  private pickBehavior(ground: Ground, hands: HandState[]): void {
    const wasNapping = this.behavior === 'nap';
    const friend = ground.creatures.find((c) => c !== this && c.settled) ?? null;
    const { behavior, duration } = this.brain.choose({
      locomotion: this.rig.locomotion,
      handNearby: this.nearestHand(hands) !== null,
      friendAvailable: friend !== null,
      sinceAttention: this.sinceAttention,
      excited: this.excitedFor > 0,
    });
    if (wasNapping) {
      // Waking up: a big stretch and a yawn.
      this.wake();
      this.squash = 1.25;
      playYawn();
    }
    this.startBehavior(behavior, duration);
    if (behavior === 'visit') this.friend = friend;
    if (behavior === 'nap') this.sleeping = true;
    if (behavior === 'fly') {
      this.flightAngle = Math.atan2(
        this.position.z - ground.center.z,
        this.position.x - ground.center.x,
      );
      this.flightRadius = 0.22 + Math.random() * 0.12;
      this.flightTime = duration;
      this.setState('flying');
    }
  }

  /** Life on the stage: run the current behaviour, then choose another. */
  private live(dt: number, ground: Ground, hands: HandState[]): void {
    if (this.hideFor > 0 && this.hopT < 0) {
      // Tucked into its shell: wait it out without moving.
      this.position.y = ground.center.y;
      return;
    }
    this.behaviorTime += dt;
    if (this.behaviorTime >= this.behaviorDuration && this.hopT < 0 && !this.petting) {
      this.pickBehavior(ground, hands);
      if (this.state !== 'idle') return;
    }
    const t = this.behaviorTime;

    switch (this.behavior) {
      case 'wander':
        if (!this.hasGoal) this.pickSpot(ground, 0.7);
        this.hopTowards(this.goal, 0.035, 0.32, ground, dt);
        break;
      case 'lookAround':
        this.lookOffset = Math.sin(t * 1.3) * 0.9;
        if (Math.random() < dt * 0.5) this.earTwitch();
        break;
      case 'sniff':
        this.headPitchTarget = 0.45 + Math.sin(t * 14) * 0.06;
        this.lookOffset = Math.sin(t * 0.9) * 0.4;
        if (!this.hasGoal && Math.random() < dt * 0.5) this.pickSpot(ground, 0.6, 0.05);
        if (this.hasGoal) this.hopTowards(this.goal, 0.02, 0.25, ground, dt);
        break;
      case 'groom':
        this.headPitchTarget = 0.55;
        this.lookOffset = Math.sin(t * 2) * 0.5;
        this.preen = true;
        if (Math.random() < dt * 1.5) this.earTwitch();
        break;
      case 'nap':
        this.sleeping = true;
        this.lieTarget = 1;
        this.headPitchTarget = 0.3;
        this.beatIn -= dt;
        if (this.beatIn <= 0) {
          this.beatIn = 1.4;
          this.fx.zzz(this.tmp.copy(this.position).addScaledVector(UP, this.rig.height * 0.7 * this.scale));
        }
        break;
      case 'beg':
        this.headPitchTarget = -0.35;
        this.beatIn -= dt;
        if (this.beatIn <= 0) {
          this.beatIn = 0.55 + Math.random() * 0.3;
          this.squash = 0.78;
          if (Math.random() < 0.4) this.voice();
        }
        break;
      case 'zoomies':
        if (!this.hasGoal) {
          this.goalAngle += 1.1 + Math.random() * 0.6;
          const r = ground.radius * 0.6;
          this.goal.set(
            ground.center.x + Math.cos(this.goalAngle) * r,
            ground.center.y,
            ground.center.z + Math.sin(this.goalAngle) * r,
          );
          this.hasGoal = true;
        }
        this.hopTowards(this.goal, 0.06, 0.2, ground, dt);
        break;
      case 'dance':
        this.sway = Math.sin(t * 6) * 0.28;
        this.beatIn -= dt;
        if (this.beatIn <= 0) {
          this.beatIn = 0.52;
          this.squash = 0.82;
        }
        break;
      case 'visit': {
        const friend = this.friend;
        if (!friend || friend.state !== 'idle') {
          this.startBehavior('lookAround', 1.5);
          break;
        }
        this.lookTarget.copy(friend.position);
        // Stop just beside the friend, then nuzzle.
        this.tmp.subVectors(this.position, friend.position).setY(0);
        if (this.tmp.lengthSq() < 1e-6) this.tmp.set(1, 0, 0);
        this.tmp.setLength(PERSONAL_SPACE).add(friend.position);
        this.goal.copy(this.tmp);
        this.hasGoal = true;
        if (this.position.distanceTo(this.goal) > 0.015 || this.hopT >= 0) {
          this.hopTowards(this.goal, 0.035, 0.3, ground, dt);
        } else {
          this.headPitchTarget = 0.15;
          this.sway = Math.sin(t * 5) * 0.12;
          this.beatIn -= dt;
          if (this.beatIn <= 0) {
            this.beatIn = 0.9;
            this.fx.heart(this.tmp.copy(this.position).lerp(friend.position, 0.5).addScaledVector(UP, 0.1));
            friend.happiness = Math.min(1, friend.happiness + 0.15);
            this.happiness = Math.min(1, this.happiness + 0.15);
          }
        }
        break;
      }
      case 'followHand': {
        const hand = this.nearestHand(hands);
        if (!hand) {
          this.behaviorDuration = Math.min(this.behaviorDuration, this.behaviorTime + 0.5);
          break;
        }
        this.lookTarget.copy(hand.palm);
        this.headPitchTarget = -0.35;
        this.tmp.set(hand.palm.x, ground.center.y, hand.palm.z);
        this.clampToStage(this.tmp, ground, 0.8);
        this.goal.copy(this.tmp);
        this.hasGoal = true;
        if (this.position.distanceTo(this.goal) > 0.03 || this.hopT >= 0) {
          this.hopTowards(this.goal, 0.03, 0.3, ground, dt);
        } else if (Math.random() < dt * 0.6) {
          this.voice();
        }
        break;
      }
      case 'sing':
        this.sing(dt);
        break;
      case 'fly':
        break;
    }

    if (this.hopT < 0) {
      this.position.y = ground.center.y;
      this.faceTowards(this.lookTarget, dt, 3);
    }
    this.keepPersonalSpace(ground);
  }

  /** A random spot on the stage within `reach` of its radius (optionally near here). */
  private pickSpot(ground: Ground, reach: number, near = 0): void {
    if (near > 0) {
      const angle = Math.random() * Math.PI * 2;
      this.goal.set(
        this.position.x + Math.cos(angle) * near,
        ground.center.y,
        this.position.z + Math.sin(angle) * near,
      );
    } else {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * ground.radius * reach;
      this.goal.set(
        ground.center.x + Math.cos(angle) * r,
        ground.center.y,
        ground.center.z + Math.sin(angle) * r,
      );
    }
    this.clampToStage(this.goal, ground, reach);
    this.hasGoal = true;
  }

  private clampToStage(point: Vector3, ground: Ground, reach: number): void {
    const dx = point.x - ground.center.x;
    const dz = point.z - ground.center.z;
    const d = Math.hypot(dx, dz);
    const limit = ground.radius * reach;
    if (d > limit) {
      point.x = ground.center.x + (dx / d) * limit;
      point.z = ground.center.z + (dz / d) * limit;
    }
  }

  /** Hops of at most `step` meters towards a goal; clears the goal on arrival. */
  private hopTowards(goal: Vector3, step: number, hopTime: number, ground: Ground, dt: number): void {
    const crawler = this.rig.locomotion === 'crawler';
    if (crawler) {
      // Snails glide: shorter, slower, flat hops that leave a sparkle trail.
      step *= 0.6;
      hopTime *= 2.6;
      this.trailIn -= dt;
      if (this.trailIn <= 0) {
        this.trailIn = 0.35;
        this.fx.burst(this.position, 1, 0.01);
      }
    }
    const lift = crawler ? 0 : this.rig.kind === 'deer' ? 1.8 : 0.9;
    if (this.hopT < 0) {
      const remaining = Math.hypot(goal.x - this.position.x, goal.z - this.position.z);
      if (remaining < 0.01) {
        this.hasGoal = false;
        return;
      }
      this.hopFrom.copy(this.position).setY(ground.center.y);
      this.hopTo.copy(goal);
      if (remaining > step) {
        this.hopTo.sub(this.hopFrom).setY(0).setLength(step).add(this.hopFrom);
      }
      this.hopTo.y = ground.center.y;
      this.hopTime = hopTime;
      this.hopT = 0;
      if (!crawler) this.squash = 0.8;
    }
    this.hopT = Math.min(1, this.hopT + dt / this.hopTime);
    this.position.lerpVectors(this.hopFrom, this.hopTo, this.hopT);
    this.position.y = ground.center.y + Math.sin(this.hopT * Math.PI) * step * lift;
    this.yawTowards(this.hopTo);
    if (this.hopT >= 1) {
      this.hopT = -1;
      if (!crawler) this.squash = 0.85;
    }
  }


  /** Nudge away from any pet that is too close. */
  private keepPersonalSpace(ground: Ground): void {
    for (const other of ground.creatures) {
      if (other === this || other.state !== 'idle') continue;
      this.tmp.subVectors(this.position, other.position).setY(0);
      const d = this.tmp.length();
      if (d > 1e-4 && d < PERSONAL_SPACE * 0.9) {
        this.position.addScaledVector(this.tmp, ((PERSONAL_SPACE * 0.9 - d) / d) * 0.3);
      }
    }
    this.clampToStage(this.position, ground, 0.85);
  }

  private nearestHand(hands: HandState[]): HandState | null {
    let best: HandState | null = null;
    let bestDistance = 0.3;
    for (const hand of hands) {
      if (!hand.tracked || hand.pinching) continue;
      const d = hand.palm.distanceTo(this.position);
      if (d < bestDistance) {
        bestDistance = d;
        best = hand;
      }
    }
    return best;
  }

  private earTwitch(): void {
    this.twitch = 1;
    this.twitchSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** A little sound in the creature's own voice. */
  private voice(): void {
    (VOICES[this.rig.kind] ?? playGiggle)();
  }

  /** Baby dragons sneeze little bursts of sparkly fire. */
  private sneeze(): void {
    const mouth = this.rig.extras?.mouth;
    if (!mouth) return;
    mouth.getWorldPosition(this.mouthPoint);
    this.squash = 1.2;
    this.fx.burst(this.mouthPoint, 16, 0.35);
    playRawr();
  }

  private sing(dt = 0.1): void {
    this.headPitchTarget = -0.3;
    this.sway = Math.sin(this.behaviorTime * 4) * 0.1;
    this.beatIn -= dt;
    if (this.beatIn <= 0) {
      this.beatIn = 0.45 + Math.random() * 0.4;
      playChirp();
      this.fx.note(this.tmp.copy(this.position).addScaledVector(UP, this.rig.height * this.scale));
    }
  }

  // ------------------------------------------------------------------ Motion

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
    if (this.stateTime > this.flightTime) this.returnToStage(ground);
  }

  /** Fly or hop back to a random resting spot on the stage. */
  private returnToStage(ground: Ground): void {
    this.pickSpot(ground, 0.55);
    this.leap(this.goal, 0.8, 0.12);
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
      this.startBehavior('lookAround', 1 + Math.random());
    }
  }

  private land(squash: number): void {
    this.squash = squash;
    this.squashVelocity = 0;
    playBoing();
    this.fx.burst(this.position, 6, 0.15);
  }

  // ------------------------------------------------------------- Interaction

  /** Poke, pet, grab, perch and palm checks against both hands. */
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
        this.noticed();
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
        this.noticed();
        this.fx.burst(hand.indexTip, 5, 0.18);
        if (this.rig.extras?.shell) {
          // Shy snail: tuck into the shell for a moment.
          this.hideFor = 2.5;
          playSqueak();
        } else if (this.rig.extras?.mouth && Math.random() < 0.6) {
          this.sneeze();
        } else {
          this.voice();
        }
      }
      this.wasTouching[i] = touching;

      // Pet: fingertips stroking over the head and back.
      for (let t = 0; t < hand.tips.length; t++) {
        if (hand.tipSpeeds[t] > 0.05 && hand.tips[t].distanceTo(this.top) < radius + 0.02) {
          pettingNow = true;
        }
      }

      // Perch: birds come and sit on a finger held up and pointing.
      const free = this.state === 'idle' || this.state === 'flying';
      if (this.rig.locomotion === 'flyer' && free && !this.sleeping) {
        this.pointTime[i] = hand.pointing ? this.pointTime[i] + dt : 0;
        if (this.pointTime[i] > PERCH_WAIT) {
          this.pointTime[i] = 0;
          this.hand = i;
          this.tmp.copy(hand.indexTip).addScaledVector(UP, 0.006);
          this.leap(this.tmp, 0.7, 0.08, 'perched');
          playChirp();
          return;
        }
      }

      // Palm: an open, upturned palm held close makes it hop on.
      if (this.state === 'idle') {
        const near =
          !hand.pinching &&
          hand.palmNormal.y > 0.75 &&
          Math.hypot(hand.palm.x - this.position.x, hand.palm.z - this.position.z) < 0.14 &&
          Math.abs(hand.palm.y - this.position.y) < 0.15;
        this.palmTime[i] = near ? this.palmTime[i] + dt : 0;
        if (this.palmTime[i] > PALM_WAIT) {
          this.palmTime[i] = 0;
          this.hand = i;
          this.noticed();
          this.tmp.copy(hand.palm).addScaledVector(hand.palmNormal, 0.012);
          this.leap(this.tmp, 0.45, 0.06, 'onPalm');
          this.voice();
          return;
        }
      }
    }

    this.petting = pettingNow;
    if (pettingNow) {
      this.noticed();
      this.happiness = Math.min(1, this.happiness + dt * 0.8);
      this.pettedFor += dt;
      // A really good petting leaves it bursting with playful energy.
      if (this.pettedFor > 2.5) this.excitedFor = 8;
      this.heartIn -= dt;
      if (this.heartIn <= 0) {
        this.heartIn = 0.3;
        this.fx.heart(this.tmp.copy(this.top).addScaledVector(UP, 0.03));
      }
    } else {
      this.pettedFor = Math.max(0, this.pettedFor - dt);
      if (this.state !== 'onPalm' && this.state !== 'perched') {
        this.happiness = Math.max(0, this.happiness - dt * 0.25);
      }
    }
  }

  private faceTowards(target: Vector3, dt: number, rate: number): void {
    this.turn(target, Math.min(1, dt * rate));
  }

  private yawTowards(target: Vector3): void {
    this.turn(target, 0.35);
  }

  private turn(target: Vector3, k: number): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const delta = Math.atan2(dx, dz) - this.yaw;
    this.yaw += Math.atan2(Math.sin(delta), Math.cos(delta)) * k;
  }

  // --------------------------------------------------------------- Animation

  /** Procedural life: squash, breathing, posture, eyes, ears, wings, tail, blush. */
  private animate(dt: number, time: number): void {
    const rig = this.rig;
    const ease = Math.min(1, dt * 6);
    this.lie += (this.lieTarget - this.lie) * Math.min(1, dt * 2.5);
    this.headPitch += (this.headPitchTarget - this.headPitch) * ease;

    rig.root.position.copy(this.position);
    rig.root.rotation.set(0, this.yaw, this.sway);

    // Damped spring back to the rest shape; sleepers breathe slow and deep.
    const accel = -260 * (this.squash - 1) - 14 * this.squashVelocity;
    this.squashVelocity += accel * dt;
    this.squash += this.squashVelocity * dt;
    const breath = this.sleeping ? Math.sin(time * 1.4) * 0.04 : Math.sin(time * 2.6) * 0.018;
    const sy = this.squash * (1 + breath) * (1 - this.lie * 0.28);
    const sxz = (1 / Math.sqrt(Math.max(0.3, sy))) * (1 + this.lie * 0.05);
    rig.body.scale.set(sxz, sy, sxz);

    // Eyes: closed while asleep, "^ ^" when happy, otherwise blinking.
    const happy = !this.sleeping && (this.happiness > 0.35 || this.petting);
    rig.happyEyes.visible = happy;
    rig.eyes.visible = !happy;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    rig.eyes.scale.y = this.sleeping ? 0.08 : this.blinking > 0 ? 0.12 : 1;

    // Ears: flatten while petted or asleep, stream back in the air, twitch.
    this.twitch = Math.max(0, this.twitch - dt * 3);
    const airborne =
      this.state === 'leaping' ||
      this.state === 'falling' ||
      this.state === 'held' ||
      this.state === 'flying' ||
      this.hopT >= 0;
    const earBack =
      (this.petting ? -1.0 : this.sleeping ? -1.2 : airborne ? -0.45 : 0) +
      Math.sin(time * 1.7) * 0.05;
    const flutter = this.state === 'held' ? Math.sin(time * 18) * 0.15 : 0;
    const twitch = Math.sin(this.twitch * 20) * 0.3 * this.twitch;
    rig.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      ear.rotation.x = earBack + flutter * side + (this.twitchSide === side ? twitch : 0);
    });

    // Wings: fast flaps in flight, a quick flick when hopping, preening, or folded.
    const flying = this.state !== 'idle' && airborne;
    rig.wings.forEach((wing, i) => {
      const side = i === 0 ? -1 : 1;
      let flap = 0;
      if (rig.kind === 'butterfly') {
        // Butterflies never quite stop: slow open-close at rest, fast in flight.
        flap = flying || this.hopT >= 0
          ? 0.7 + Math.sin(time * 34) * 0.7
          : this.sleeping ? 1.2 : 0.55 + Math.sin(time * 5) * 0.5;
        wing.rotation.z = side * flap;
        return;
      }
      if (flying) flap = 0.35 + Math.sin(time * (this.state === 'held' ? 38 : 30)) * 0.85;
      else if (this.hopT >= 0) flap = Math.sin(this.hopT * Math.PI) * 0.6;
      else if (this.preen && i === 1) flap = 0.5 + Math.sin(time * 9) * 0.15;
      else if (happy) flap = 0.15 + Math.sin(time * 20) * 0.15;
      else flap = this.twitch * 0.4;
      wing.rotation.z = side * flap;
    });

    // Head: look at what interests it, nod down to sniff or groom, up to beg.
    const toTarget = Math.atan2(
      this.lookTarget.x - this.position.x,
      this.lookTarget.z - this.position.z,
    );
    let headYaw = toTarget - this.yaw + this.lookOffset;
    headYaw = Math.atan2(Math.sin(headYaw), Math.cos(headYaw));
    const clamped = Math.max(-0.8, Math.min(0.8, headYaw));
    rig.head.rotation.y += (clamped - rig.head.rotation.y) * ease;
    rig.head.rotation.x = this.headPitch;
    rig.head.rotation.z = happy
      ? Math.sin(time * 3) * 0.12
      : this.behavior === 'followHand' || this.behavior === 'beg'
        ? Math.sin(time * 1.5) * 0.18 // a curious head tilt
        : 0;

    // Dangling, kicking feet when carried.
    const kick = this.state === 'held' ? Math.sin(time * 14) * 0.5 : 0;
    rig.feet.forEach((foot, i) => {
      foot.rotation.x = i % 2 === 0 ? kick : -kick;
    });

    const wagging = happy || this.behavior === 'beg';
    if (rig.kind === 'dog') {
      // Dogs wag all the time; faster when happy.
      rig.tail.rotation.y = Math.sin(time * (wagging ? 20 : 8)) * (wagging ? 0.6 : 0.25);
    } else {
      rig.tail.rotation.y = wagging ? Math.sin(time * 16) * 0.5 : 0;
    }

    // A startled snail pulls its head into the shell.
    const tucked = this.hideFor > 0 ? 1 : 0;
    if (rig.extras?.shell) {
      const k = Math.min(1, dt * 8);
      const target = 1 - tucked * 0.7;
      rig.head.scale.setScalar(rig.head.scale.x + (target - rig.head.scale.x) * k);
      rig.extras.shell.rotation.z = tucked * Math.sin(time * 30) * 0.06;
    }
    rig.cheeks.opacity = 0.3 + this.happiness * 0.6;
  }
}
