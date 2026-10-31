/**
 * Summoned items: what is held, how it follows the hand, how it is thrown,
 * and what it hits. Flight and collisions are plain math (spheres, segments
 * and one box), no physics engine.
 *
 *   sword  rides the fist along the knuckle line; a fast swing cuts orbs.
 *   spear  points where the fist points; thrust to cut, open the hand mid-push to throw.
 *   ball   grows on the open palm; push or throw the palm forward to launch it.
 *   wall   rises in front of the player and blocks orbs for a few seconds.
 */
import { Group, Vector3 } from '@iwsdk/core';
import { isFist, Item } from './gestures.js';
import { HandState, Side } from './hands.js';
import type { Foe } from './opponent.js';
import { sfx } from './sfx.js';
import {
  BALL_RADIUS,
  Bursts,
  makeBall,
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

const Y = new Vector3(0, 1, 0);

/** Where a hand is, for holding items: a tracked hand, or a controller / default spot. */
export interface Anchor {
  position: Vector3;
  /** Direction the hand points (forward for a controller). */
  pointing: Vector3;
  hand: HandState | null;
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
  private anchor: Anchor = { position: new Vector3(), pointing: new Vector3(), hand: null };
  private axis = new Vector3();
  private tip = new Vector3();
  private mid = new Vector3();
  private dir = new Vector3();
  private toFoe = new Vector3();

  constructor(
    private root: Group,
    private bursts: Bursts,
    private foe: Foe,
    private anchorOf: AnchorFn,
  ) {
    this.wall = makeWall();
    this.wall.root.visible = false;
    root.add(this.wall.root);
  }

  summon(item: Item, side: Side | null, head: Vector3, forward: Vector3): void {
    sfx.summon(item);
    if (item === 'wall') {
      this.raiseWall(head, forward);
      return;
    }
    this.drop();
    const object = item === 'sword' ? makeSword() : item === 'spear' ? makeSpear() : makeBall();
    if (item === 'ball') object.scale.setScalar(0.01);
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
  }

  clear(): void {
    this.drop();
    for (const p of this.projectiles) this.dispose(p.object);
    this.projectiles.length = 0;
    this.wallLeft = 0;
    this.wall.root.visible = false;
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

  update(dt: number, forward: Vector3): void {
    if (this.held) this.updateHeld(this.held, dt, forward);
    this.updateProjectiles(dt);
    this.updateWall(dt);
  }

  private updateHeld(held: Held, dt: number, forward: Vector3): void {
    held.age += dt;
    held.cooldown = Math.max(0, held.cooldown - dt);
    const anchor = this.anchorOf(held.side, this.anchor);
    const hand = anchor.hand;
    const object = held.object;

    if (held.item === 'ball') {
      const grow = Math.min(1, held.age / BALL_GROW);
      object.scale.setScalar(0.01 + grow * (1 + Math.sin(held.age * 9) * 0.04));
      object.position.copy(anchor.position);
      if (hand) object.position.addScaledVector(hand.normal, BALL_LIFT);
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

    // Sword along the knuckle line of a tracked fist; otherwise along the pointing direction.
    if (held.item === 'sword' && hand) this.axis.copy(hand.knuckles);
    else this.axis.copy(anchor.pointing);
    object.position.copy(anchor.position);
    object.quaternion.setFromUnitVectors(Y, this.axis);

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
    if (item === 'sword') return;
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
