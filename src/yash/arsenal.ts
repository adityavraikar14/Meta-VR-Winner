/**
 * Summoned items: what is held, how it follows the hand, how it is thrown,
 * and what it hits. Flight and collisions are plain math (spheres, segments
 * and one box), no physics engine.
 *
 *   sword  rides the fist along the knuckle line; a fast swing cuts orbs.
 *   spear  points where the fist points; thrust to cut, open the hand mid-push to throw.
 *   ball   grows on the open palm; push or throw the palm forward to launch it.
 *   wall   rises in front of the player and blocks orbs for a few seconds.
 *   gun    rides the pointing index finger with a crosshair; drop the thumb to fire.
 */
import { Group, Mesh, Quaternion, Sprite, Vector3 } from '@iwsdk/core';
import { isFist, Item } from './gestures.js';
import { HandState, Side } from './hands.js';
import type { Foe } from './opponent.js';
import { sfx } from './sfx.js';
import {
  BALL_RADIUS,
  Bursts,
  makeBall,
  makeBeam,
  makeCrosshair,
  makeGun,
  makeSpear,
  makeSword,
  makeWall,
  SPEAR_TIP,
  SWORD_LENGTH,
  WALL_HEIGHT,
  WALL_WIDTH,
  WallRig,
} from './visuals.js';

/** A blade or spear point must move at least this fast (m/s) to cut or hurt. */
const CUT_SPEED = 1.2;
/** Seconds between two damaging melee hits. */
const MELEE_COOLDOWN = 0.4;
const SWORD_DAMAGE = 2;
const THRUST_DAMAGE = 3;
const BALL_DAMAGE = 3;
const SPEAR_DAMAGE = 5;

/** The ball grows for this long before it can be thrown. */
const BALL_GROW = 0.4;
/** Ball sits this far out from the palm. */
const BALL_LIFT = 0.08;
/** Palm speed (m/s) that launches the ball, and spear throw speed. */
const THROW_SPEED = 1.0;
const SPEAR_THROW_SPEED = 1.2;
/** Launch speed is hand speed times this, clamped. */
const THROW_BOOST = 4;
const MIN_LAUNCH = 4;
const MAX_LAUNCH = 10;
/** Gentle arcs: gravity in m/s² for each projectile. */
const BALL_GRAVITY = 1;
const SPEAR_GRAVITY = 3;
const PROJECTILE_LIFE = 4;
/** A thrown spear stays stuck in the target this long. */
const STUCK_TIME = 1.2;
/**
 * How quickly a held sword or spear turns to follow the hand (per second).
 * High enough to feel attached, low enough to hide knuckle jitter.
 */
const HOLD_SMOOTHING = 22;
/** Throws within this angle (cosine) of the target get nudged onto it. */
const AIM_ASSIST = Math.cos((25 * Math.PI) / 180);
const AIM_PULL = 0.7;

/** The wall rises this far in front of the eyes, and lasts this long. */
const WALL_DISTANCE = 0.75;
const WALL_DROP = 0.75;
const WALL_LIFE = 8;
const WALL_RISE = 0.25;
const WALL_FADE = 1;
/** Orbs the wall can take before it shatters. */
export const WALL_HP = 5;
const WALL_FLASH = 0.15;

/** Blaster: damage per shot and seconds between shots. */
const GUN_DAMAGE = 1;
const GUN_COOLDOWN = 0.2;
/** Thumb-to-finger distance (m) that pulls the trigger, and that releases it again. */
const TRIGGER_PULL = 0.03;
const TRIGGER_RELEASE = 0.045;
/** A freshly summoned gun ignores the trigger this long, so summoning can't misfire. */
const GUN_READY = 0.3;
/**
 * The aim runs from a point just below the eye on the shooting side, through
 * the index fingertip, the way people line a finger up with a target. Meta's
 * own hand rays work this way: positions are tracked far more steadily than
 * a finger's angle, and the long eye-to-fingertip baseline shrinks jitter.
 */
const AIM_EYE_DROP = 0.1;
const AIM_EYE_SIDE = 0.05;
/** The aim line passes this far from the index knuckle towards the fingertip (tip jitters more). */
const AIM_FINGER_POINT = 0.7;
/**
 * Adaptive smoothing (per second): slow while the aim barely moves, which
 * hides jitter, fast for deliberate moves, so turning to a new target doesn't lag.
 */
const AIM_SMOOTH_SLOW = 8;
const AIM_SMOOTH_FAST = 35;
/** Aim changes of this many degrees per frame count as deliberate. */
const AIM_DELIBERATE_DEG = 1.0;
/** Aim help: targets count this much wider per metre of distance (about 2.5°). */
const GUN_ASSIST = 0.044;
/**
 * A shot uses the aim from this long before the trigger: dropping the thumb
 * jolts the finger a little, and this keeps that jolt out of the shot.
 */
const SHOT_LOOKBACK = 0.08;
/** With nothing under it, the crosshair floats this far out. */
const CROSSHAIR_DISTANCE = 4;
/** Crosshair size per metre of distance, so it looks the same size anywhere. */
const CROSSHAIR_SIZE = 0.045;
const SHOT_RANGE = 20;
const TRACER_TIME = 0.07;
const AIM_HISTORY = 12;
/** Index finger joints: the knuckle and the tip. */
const INDEX_KNUCKLE = 6;
const INDEX_TIP = 9;

const Y = new Vector3(0, 1, 0);

/** Where a hand is, for holding items: a tracked hand, or a controller / default spot. */
export interface Anchor {
  position: Vector3;
  /** Direction the hand points (forward for a controller). */
  pointing: Vector3;
  /** The hand, while it is tracked. */
  hand: HandState | null;
  /** The hand, while it is briefly lost (position is then where it was last seen). */
  recent: HandState | null;
}

export type AnchorFn = (side: Side, out: Anchor) => Anchor;

interface Held {
  item: Exclude<Item, 'wall'>;
  side: Side;
  object: Group;
  age: number;
  cooldown: number;
  /** Tip position last frame, to measure tip speed. */
  lastTip: Vector3;
  hasLastTip: boolean;
}

interface Projectile {
  item: 'ball' | 'spear';
  object: Group;
  velocity: Vector3;
  gravity: number;
  age: number;
  /** >0 while stuck in the target. */
  stuck: number;
}

export class Arsenal {
  held: Held | null = null;
  readonly projectiles: Projectile[] = [];
  /** Seconds left on the wall, 0 when there is none. */
  wallLeft = 0;
  wallHp = 0;

  private wall: WallRig;
  private wallFlash = 0;
  private wallCenter = new Vector3();
  private wallRight = new Vector3();
  private wallNormal = new Vector3();
  private anchor: Anchor = { position: new Vector3(), pointing: new Vector3(), hand: null, recent: null };
  private target = new Quaternion();
  private axis = new Vector3();
  private tip = new Vector3();
  private mid = new Vector3();
  private dir = new Vector3();
  private toFoe = new Vector3();

  // Blaster state: smoothed aim, its recent history, the trigger and the visuals.
  private aim = new Vector3();
  private aimReady = false;
  private head = new Vector3();
  private eye = new Vector3();
  private lastForward = new Vector3(0, 0, -1);
  private muzzle = new Vector3();
  private aimTimes = new Float64Array(AIM_HISTORY);
  private aimDirs = new Float32Array(AIM_HISTORY * 3);
  private aimHead = 0;
  private clock = 0;
  private triggerDown = false;
  private crosshair: Sprite;
  private laser: Mesh;
  private tracer: Mesh;
  private tracerLeft = 0;
  private shotDir = new Vector3();
  private shotEnd = new Vector3();
  /** Shots fired since the level started. */
  shots = 0;

  constructor(
    private root: Group,
    private bursts: Bursts,
    private foe: Foe,
    private anchorOf: AnchorFn,
  ) {
    this.wall = makeWall();
    this.wall.root.visible = false;
    root.add(this.wall.root);
    this.crosshair = makeCrosshair();
    this.laser = makeBeam(0.0025, 0x7af0ff, 0.25);
    this.tracer = makeBeam(0.006, 0xbff8ff, 0.9);
    this.crosshair.visible = this.laser.visible = this.tracer.visible = false;
    root.add(this.crosshair, this.laser, this.tracer);
  }

  summon(item: Item, side: Side | null, head: Vector3, forward: Vector3): void {
    sfx.summon(item);
    if (item === 'wall') {
      this.raiseWall(head, forward);
      return;
    }
    this.drop();
    const object =
      item === 'sword' ? makeSword() : item === 'spear' ? makeSpear() : item === 'gun' ? makeGun() : makeBall();
    if (item === 'ball') object.scale.setScalar(0.01);
    this.aimReady = false;
    this.triggerDown = false;
    this.root.add(object);
    this.held = {
      item,
      side: side ?? 'right',
      object,
      age: 0,
      cooldown: 0,
      lastTip: new Vector3(),
      hasLastTip: false,
    };
    this.anchorOf(this.held.side, this.anchor);
    this.bursts.spawn(this.anchor.position, 0x9fe8ff, 0.2);
  }

  /** Removes the held item (not the wall or anything in flight). */
  drop(): void {
    if (!this.held) return;
    this.dispose(this.held.object);
    this.held = null;
    this.crosshair.visible = this.laser.visible = false;
  }

  clear(): void {
    this.drop();
    for (const p of this.projectiles) this.dispose(p.object);
    this.projectiles.length = 0;
    this.wallLeft = 0;
    this.wall.root.visible = false;
  }

  /**
   * Test shortcut: throws the held ball or spear along `direction` (aim assist
   * still applies), for when hand motion can't be measured well, as with a webcam.
   */
  throwHeld(direction: Vector3): void {
    const held = this.held;
    if (!held || held.item === 'sword' || held.item === 'gun') return;
    if (held.item === 'ball') held.age = Math.max(held.age, BALL_GROW);
    this.dir.copy(direction).normalize().multiplyScalar(7);
    this.launch(held, this.dir);
  }

  /**
   * True when a sphere at `point` hits the wall. The wall takes the hit: it
   * loses health, and shatters when it has none left.
   */
  absorb(point: Vector3, radius: number): boolean {
    if (!this.inWall(point, radius)) return false;
    this.wallHp--;
    this.wallFlash = WALL_FLASH;
    if (this.wallHp <= 0) {
      this.wallLeft = 0;
      this.wall.root.visible = false;
      this.bursts.spawn(this.wallCenter, 0x9fe8ff, 0.9, 0.6);
      sfx.wallBreak();
    }
    return true;
  }

  private inWall(point: Vector3, radius: number): boolean {
    if (this.wallLeft <= 0) return false;
    const dx = point.x - this.wallCenter.x;
    const dy = point.y - this.wallCenter.y;
    const dz = point.z - this.wallCenter.z;
    const across = dx * this.wallRight.x + dz * this.wallRight.z;
    const through = dx * this.wallNormal.x + dz * this.wallNormal.z;
    return (
      Math.abs(across) < WALL_WIDTH / 2 + radius &&
      Math.abs(dy) < WALL_HEIGHT / 2 + radius &&
      Math.abs(through) < radius + 0.05
    );
  }

  update(dt: number, forward: Vector3, head: Vector3): void {
    this.clock += dt;
    this.head.copy(head);
    this.lastForward.copy(forward);
    if (this.held) this.updateHeld(this.held, dt, forward);
    this.updateProjectiles(dt);
    this.updateWall(dt);
    if (this.tracerLeft > 0) {
      this.tracerLeft -= dt;
      this.tracer.visible = this.tracerLeft > 0;
    }
  }

  /** Fires the held blaster, if any (the thumb trigger, or the test panel's Shoot). */
  fireGun(): void {
    const held = this.held;
    if (!held || held.item !== 'gun' || held.cooldown > 0 || !this.aimReady) return;
    held.cooldown = GUN_COOLDOWN;
    this.shots++;

    // Aim from just before the trigger, if the history reaches that far back.
    this.shotDir.copy(this.aim);
    for (let n = 1; n < AIM_HISTORY; n++) {
      const k = (this.aimHead - n + AIM_HISTORY) % AIM_HISTORY;
      if (this.aimTimes[k] === 0) break;
      if (this.clock - this.aimTimes[k] >= SHOT_LOOKBACK) {
        this.shotDir.set(this.aimDirs[k * 3], this.aimDirs[k * 3 + 1], this.aimDirs[k * 3 + 2]);
        break;
      }
    }

    const hit = this.foe.raycast(this.muzzle, this.shotDir, GUN_ASSIST);
    if (hit?.orb) this.shotEnd.copy(hit.point);
    else this.shotEnd.copy(this.muzzle).addScaledVector(this.shotDir, hit ? hit.distance : SHOT_RANGE);
    this.stretch(this.tracer, this.muzzle, this.shotEnd);
    this.tracer.visible = true;
    this.tracerLeft = TRACER_TIME;
    this.bursts.spawn(this.muzzle, 0x7af0ff, 0.06, 0.12);
    sfx.shoot();
    if (hit?.orb) {
      if (this.foe.cutOrbs(hit.point, 0.02) > 0) sfx.slice();
    } else if (hit) {
      this.foe.damage(GUN_DAMAGE, this.shotEnd);
    }
  }

  private updateGun(held: Held, anchor: Anchor, dt: number): void {
    // Muzzle at the fingertip; aim from beside the eye through the finger. A controller just points forward.
    const finger = anchor.hand ?? anchor.recent;
    if (finger) {
      finger.joint(INDEX_TIP, this.muzzle);
      const through = finger.joint(INDEX_KNUCKLE, this.tip).lerp(this.muzzle, AIM_FINGER_POINT);
      const side = held.side === 'right' ? 1 : -1;
      // Right of the eyes is (−forward.z, 0, forward.x); forward comes from the last summon/update.
      this.eye.copy(this.head);
      this.eye.y -= AIM_EYE_DROP;
      this.eye.x += -this.lastForward.z * AIM_EYE_SIDE * side;
      this.eye.z += this.lastForward.x * AIM_EYE_SIDE * side;
      this.dir.copy(through).sub(this.eye).normalize();
    } else {
      this.dir.copy(anchor.pointing);
      this.muzzle.copy(anchor.position).addScaledVector(anchor.pointing, 0.12);
    }
    if (!this.aimReady) {
      this.aim.copy(this.dir);
      this.aimReady = true;
      this.aimTimes.fill(0);
    } else {
      const change = (Math.acos(Math.min(1, this.aim.dot(this.dir))) * 180) / Math.PI;
      const k = Math.min(1, change / AIM_DELIBERATE_DEG);
      const rate = AIM_SMOOTH_SLOW + (AIM_SMOOTH_FAST - AIM_SMOOTH_SLOW) * k;
      this.aim.lerp(this.dir, 1 - Math.exp(-rate * dt)).normalize();
    }
    const h = this.aimHead;
    this.aimTimes[h] = this.clock;
    this.aimDirs[h * 3] = this.aim.x;
    this.aimDirs[h * 3 + 1] = this.aim.y;
    this.aimDirs[h * 3 + 2] = this.aim.z;
    this.aimHead = (h + 1) % AIM_HISTORY;

    held.object.position.copy(this.muzzle);
    held.object.quaternion.setFromUnitVectors(Y, this.aim);

    // Crosshair on whatever the gun points at (red over a target), else floating ahead.
    const hit = this.foe.raycast(this.muzzle, this.aim, GUN_ASSIST);
    const distance = hit ? hit.distance : CROSSHAIR_DISTANCE;
    if (hit?.orb) this.mid.copy(hit.point);
    else this.mid.copy(this.muzzle).addScaledVector(this.aim, distance);
    this.crosshair.position.copy(this.mid);
    this.crosshair.scale.setScalar(Math.max(0.05, distance * CROSSHAIR_SIZE));
    this.crosshair.material.color.setHex(hit ? 0xff4a4a : 0xffffff);
    this.crosshair.visible = true;
    this.stretch(this.laser, this.muzzle, this.mid);
    this.laser.visible = true;

    // Thumb trigger, with a gap between pull and release so it can't chatter.
    const hand = anchor.hand;
    if (!hand) return;
    if (!this.triggerDown && hand.thumbDrop < TRIGGER_PULL) {
      this.triggerDown = true;
      if (held.age > GUN_READY) this.fireGun();
    } else if (this.triggerDown && hand.thumbDrop > TRIGGER_RELEASE) {
      this.triggerDown = false;
    }
  }

  /** Points a beam (built along +Y, length 1) from `from` to `to`. */
  private stretch(beam: Mesh, from: Vector3, to: Vector3): void {
    this.toFoe.copy(to).sub(from);
    const length = this.toFoe.length();
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(Y, this.toFoe.divideScalar(length || 1));
    beam.scale.set(1, Math.max(0.001, length), 1);
  }

  private updateHeld(held: Held, dt: number, forward: Vector3): void {
    held.age += dt;
    held.cooldown = Math.max(0, held.cooldown - dt);
    const anchor = this.anchorOf(held.side, this.anchor);
    const hand = anchor.hand;
    const object = held.object;

    if (held.item === 'gun') {
      this.updateGun(held, anchor, dt);
      return;
    }

    // The hand vanished mid-throw: throw along the way it was moving.
    const recent = anchor.recent;
    if (recent && (held.item === 'spear' || (held.item === 'ball' && held.age >= BALL_GROW))) {
      const v = recent.lastVelocity;
      if (v.length() > THROW_SPEED && v.dot(forward) > 0) {
        this.dir.copy(v).multiplyScalar(THROW_BOOST);
        this.launch(held, this.dir);
        return;
      }
    }

    if (held.item === 'ball') {
      const grow = Math.min(1, held.age / BALL_GROW);
      object.scale.setScalar(0.01 + grow * (1 + Math.sin(held.age * 9) * 0.04));
      object.position.copy(anchor.position);
      const palm = hand ?? recent;
      if (palm) object.position.addScaledVector(palm.normal, BALL_LIFT);
      else object.position.addScaledVector(anchor.pointing, BALL_LIFT);
      if (hand && grow >= 1) {
        const speed = hand.velocity.length();
        const pushing = hand.velocity.dot(hand.normal) > 0.5 * speed;
        const throwing = hand.velocity.dot(forward) > 0.7 * speed;
        if (speed > THROW_SPEED && (pushing || throwing)) {
          this.dir.copy(hand.velocity).multiplyScalar(THROW_BOOST);
          this.launch(held, this.dir);
        }
      }
      return;
    }

    // Sword along the knuckle line of the fist; otherwise along the pointing direction.
    // The blade eases towards that direction, which hides tracking jitter.
    const fist = hand ?? recent;
    if (held.item === 'sword' && fist) this.axis.copy(fist.knuckles);
    else this.axis.copy(anchor.pointing);
    object.position.copy(anchor.position);
    this.target.setFromUnitVectors(Y, this.axis);
    if (held.age <= dt) object.quaternion.copy(this.target);
    else object.quaternion.slerp(this.target, 1 - Math.exp(-HOLD_SMOOTHING * dt));
    this.axis.copy(Y).applyQuaternion(object.quaternion);

    const reach = held.item === 'sword' ? SWORD_LENGTH : SPEAR_TIP;
    this.tip.copy(anchor.position).addScaledVector(this.axis, reach);
    this.mid.copy(anchor.position).addScaledVector(this.axis, reach * 0.55);
    const tipSpeed = held.hasLastTip && dt > 0 ? this.tip.distanceTo(held.lastTip) / dt : 0;
    held.lastTip.copy(this.tip);
    held.hasLastTip = true;

    if (tipSpeed > CUT_SPEED) {
      const cut = this.foe.cutOrbs(this.tip, 0.06) + this.foe.cutOrbs(this.mid, 0.06);
      if (cut > 0) sfx.slice();
      if (held.cooldown === 0 && (this.foe.touches(this.tip, 0.04) || this.foe.touches(this.mid, 0.04))) {
        this.foe.damage(held.item === 'sword' ? SWORD_DAMAGE : THRUST_DAMAGE, this.tip);
        held.cooldown = MELEE_COOLDOWN;
      }
    }

    // Spear throw: open the fist while the hand is moving.
    if (held.item === 'spear' && hand && held.age > 0.4 && !isFist(hand)) {
      if (hand.velocity.length() > SPEAR_THROW_SPEED) {
        this.dir.copy(hand.velocity).multiplyScalar(THROW_BOOST);
        this.launch(held, this.dir);
      }
    }
  }

  private launch(held: Held, velocity: Vector3): void {
    const item = held.item;
    if (item === 'sword' || item === 'gun') return;
    const from = held.object.position;
    let speed = velocity.length();
    speed = Math.min(MAX_LAUNCH, Math.max(MIN_LAUNCH, speed));
    this.dir.copy(velocity).normalize();
    // Aim assist: a throw roughly at the target goes at the target.
    if (this.foe.alive) {
      this.toFoe.copy(this.foe.center).sub(from).normalize();
      if (this.dir.dot(this.toFoe) > AIM_ASSIST) this.dir.lerp(this.toFoe, AIM_PULL).normalize();
    }
    this.projectiles.push({
      item,
      object: held.object,
      velocity: this.dir.clone().multiplyScalar(speed),
      gravity: item === 'ball' ? BALL_GRAVITY : SPEAR_GRAVITY,
      age: 0,
      stuck: 0,
    });
    if (item === 'ball') held.object.scale.setScalar(1);
    this.held = null;
    sfx.throw();
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      const object = p.object;
      if (p.stuck > 0) {
        p.stuck -= dt;
        if (p.stuck <= 0) this.removeProjectile(i);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      object.position.addScaledVector(p.velocity, dt);

      if (p.item === 'spear') {
        this.dir.copy(p.velocity).normalize();
        object.quaternion.setFromUnitVectors(Y, this.dir);
        this.tip.copy(object.position).addScaledVector(this.dir, SPEAR_TIP);
        if (this.foe.cutOrbs(this.tip, 0.05) > 0) sfx.slice();
        if (this.foe.touches(this.tip, 0.03)) {
          this.foe.damage(SPEAR_DAMAGE, this.tip);
          p.stuck = STUCK_TIME;
          continue;
        }
      } else {
        object.rotation.y += dt * 6;
        if (this.foe.cutOrbs(object.position, BALL_RADIUS) > 0) sfx.block();
        if (this.foe.touches(object.position, BALL_RADIUS)) {
          this.foe.damage(BALL_DAMAGE, object.position);
          this.bursts.spawn(object.position, 0x6fd6ff, 0.5);
          this.removeProjectile(i);
          continue;
        }
      }
      if (p.age > PROJECTILE_LIFE || object.position.y < -1) this.removeProjectile(i);
    }
  }

  private raiseWall(head: Vector3, forward: Vector3): void {
    this.wallCenter.copy(forward).multiplyScalar(WALL_DISTANCE).add(head);
    this.wallCenter.y = head.y - WALL_DROP + WALL_HEIGHT / 2;
    this.wallNormal.copy(forward);
    this.wallRight.set(-forward.z, 0, forward.x);
    const root = this.wall.root;
    root.position.set(this.wallCenter.x, head.y - WALL_DROP, this.wallCenter.z);
    root.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    root.visible = true;
    this.wallLeft = WALL_LIFE;
    this.wallHp = WALL_HP;
    this.wallFlash = 0;
    this.bursts.spawn(this.wallCenter, 0x9fe8ff, 0.6, 0.5);
  }

  private updateWall(dt: number): void {
    if (this.wallLeft <= 0) return;
    this.wallLeft -= dt;
    const age = WALL_LIFE - this.wallLeft;
    const rise = Math.min(1, age / WALL_RISE);
    const fade = Math.min(1, this.wallLeft / WALL_FADE);
    this.wall.root.scale.set(1, Math.max(0.001, rise * fade), 1);
    if (this.wallLeft <= 0) this.wall.root.visible = false;

    // Health bar: green when fresh, through amber, to red when about to break.
    const health = this.wallHp / WALL_HP;
    this.wall.barFill.scale.x = Math.max(0.001, health);
    this.wall.barMaterial.color.setRGB(Math.min(1, 2 - 2 * health), Math.min(1, 2 * health), 0.3);
    this.wallFlash = Math.max(0, this.wallFlash - dt);
    this.wall.panelMaterial.color.setHex(this.wallFlash > 0 ? 0xffffff : 0x59c8ff);
    this.wall.panelMaterial.opacity = this.wallFlash > 0 ? 0.5 : 0.12 + 0.1 * health;
  }

  private removeProjectile(index: number): void {
    this.dispose(this.projectiles[index].object);
    this.projectiles.splice(index, 1);
  }

  private dispose(object: Group): void {
    this.root.remove(object);
    object.traverse((node) => {
      const mesh = node as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
  }
}
