/**
 * The training sentinel: floats in front of the player, telegraphs, then fires
 * slow orbs at the player's chest. Orbs can be blocked by the wall, cut by the
 * sword or spear, or popped by a power ball. The sentinel itself takes damage
 * from thrown balls and spears, and respawns after it is defeated.
 */
import { Group, Vector3 } from '@iwsdk/core';
import { rayToSphere, ShotVolley } from './orbs.js';
import { sfx } from './sfx.js';
import { Bursts, FOE_RADIUS, FoeRig, makeFoe, makeOrb, ORB_RADIUS } from './visuals.js';

/** Metres in front of the player. */
const DISTANCE = 3;
/** The sentinel floats this far below eye level. */
const DROP = 0.1;
export const MAX_HP = 20;
/** Seconds between attacks, and how long the wind-up glow lasts. */
const REST = 2.6;
const TELEGRAPH = 1.0;
/** Orbs are slow on purpose: about two seconds to react. */
const ORB_SPEED = 1.5;
/** Orbs aim this far below the eyes (the chest), within sword reach. */
export const AIM_DROP = 0.25;
const RESPAWN = 3;

type Mood = 'rest' | 'telegraph' | 'defeated';

/** Something the arsenal can damage. */
export interface Foe {
  /** Centre of the body, in level space. */
  readonly center: Vector3;
  readonly alive: boolean;
  /** True when a sphere at `point` touches the body. */
  touches(point: Vector3, radius: number): boolean;
  damage(amount: number, at: Vector3): void;
  /** Destroys orbs touching the sphere; returns how many. */
  cutOrbs(point: Vector3, radius: number): number;
  /**
   * The nearest target (body or orb) along a ray. Targets count as `assist`
   * metres wider per metre of distance, a little aim help for shaky hands.
   */
  raycast(origin: Vector3, direction: Vector3, assist: number): RayHit | null;
}

export interface RayHit {
  distance: number;
  /** Centre of what was hit. */
  point: Vector3;
  orb: boolean;
}

/** A foe the level can run a fight against. */
export interface Boss extends Foe {
  /** For the readout. */
  readonly name: string;
  /** For the label above it. */
  readonly title: string;
  readonly hp: number;
  readonly maxHp: number;
  /** How far above its centre its label floats. */
  readonly labelRise: number;
  /** Shots that reached the player. */
  hitsTaken: number;
  defeats: number;
  /** While calm (during the tutorial) it never attacks on its own; see fireNow. */
  calm: boolean;
  /** The fight is over and the level should move on. */
  readonly finished: boolean;
  /** Its model couldn't be loaded; the level should go back to the sentinel. */
  readonly failed: boolean;
  /** Shown instead of its health while its model loads; null once it's here. */
  readonly loadingText: string | null;
  place(head: Vector3, forward: Vector3): void;
  reset(): void;
  /** Winds up and fires now, even while calm. */
  fireNow(): void;
  setActive(active: boolean): void;
  update(
    dt: number,
    time: number,
    head: Vector3,
    /** True when something (the wall) took the shot; it handles its own damage. */
    absorbs: (point: Vector3, radius: number) => boolean,
  ): void;
}

export class Opponent implements Boss {
  readonly name = 'sentinel';
  readonly title = 'Sentinel';
  readonly maxHp = MAX_HP;
  readonly labelRise = 0.7;
  readonly finished = false;
  readonly failed = false;
  readonly loadingText = null;
  readonly center = new Vector3();
  hp = MAX_HP;
  /** Orbs that reached the player since the level started. */
  hitsTaken = 0;
  defeats = 0;
  calm = false;

  private rig: FoeRig;
  private orbs: ShotVolley;
  private mood: Mood = 'rest';
  private timer = REST;
  private flash = 0;
  private shake = 0;
  private home = new Vector3();
  private aim = new Vector3();
  private hit: RayHit = { distance: 0, point: new Vector3(), orb: false };

  constructor(
    parent: Group,
    private bursts: Bursts,
    /** Called when an orb reaches the player. */
    onPlayerHit: () => void,
  ) {
    this.rig = makeFoe();
    parent.add(this.rig.root);
    this.orbs = new ShotVolley(parent, bursts, makeOrb, ORB_RADIUS, 0xffb070, () => {
      this.hitsTaken++;
      onPlayerHit();
    });
  }

  get alive(): boolean {
    return this.mood !== 'defeated';
  }

  setActive(active: boolean): void {
    this.rig.root.visible = active;
    this.orbs.clear();
  }

  /** Places the sentinel straight ahead of the player. */
  place(head: Vector3, forward: Vector3): void {
    this.home.copy(forward).multiplyScalar(DISTANCE).add(head);
    this.home.y = head.y - DROP;
    this.center.copy(this.home);
    this.orbs.clear();
    this.mood = 'rest';
    this.timer = REST;
  }

  reset(): void {
    this.hp = MAX_HP;
    this.rig.root.visible = true;
    this.rig.root.scale.setScalar(1);
    this.orbs.clear();
    this.mood = 'rest';
    this.timer = REST;
  }

  touches(point: Vector3, radius: number): boolean {
    return this.alive && point.distanceTo(this.center) < FOE_RADIUS + radius;
  }

  damage(amount: number, at: Vector3): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.2;
    this.shake = 0.25;
    this.bursts.spawn(at, 0xffffff, 0.25);
    sfx.hit();
    if (this.hp === 0) {
      this.mood = 'defeated';
      this.timer = RESPAWN;
      this.defeats++;
      this.orbs.clear();
      this.bursts.spawn(this.center, 0xc58cff, 0.8, 0.8);
      sfx.defeated();
    }
  }

  cutOrbs(point: Vector3, radius: number): number {
    return this.orbs.cut(point, radius);
  }

  fireNow(): void {
    if (!this.alive || this.mood === 'telegraph') return;
    this.mood = 'telegraph';
    this.timer = TELEGRAPH;
    sfx.telegraph();
  }

  raycast(origin: Vector3, direction: Vector3, assist: number): RayHit | null {
    let best = Infinity;
    let orb = false;
    const test = (center: Vector3, radius: number, isOrb: boolean) => {
      const along = rayToSphere(origin, direction, center, radius, assist);
      if (along > 0 && along < best) {
        best = along;
        orb = isOrb;
        this.hit.point.copy(center);
      }
    };
    if (this.alive) test(this.center, FOE_RADIUS, false);
    this.orbs.forEach((position) => test(position, ORB_RADIUS, true));
    if (best === Infinity) return null;
    this.hit.distance = best;
    this.hit.orb = orb;
    return this.hit;
  }

  update(
    dt: number,
    time: number,
    head: Vector3,
    absorbs: (point: Vector3, radius: number) => boolean,
  ): void {
    const root = this.rig.root;
    this.aim.copy(head);
    this.aim.y -= AIM_DROP;

    if (this.mood === 'defeated') {
      this.timer -= dt;
      root.scale.setScalar(Math.max(0.001, 1 - (RESPAWN - this.timer) * 3));
      if (this.timer <= 0) this.reset();
    } else {
      this.timer -= dt;
      if (this.mood === 'rest' && this.calm) {
        this.timer = REST;
      } else if (this.mood === 'rest' && this.timer <= 0) {
        this.mood = 'telegraph';
        this.timer = TELEGRAPH;
        sfx.telegraph();
      } else if (this.mood === 'telegraph' && this.timer <= 0) {
        this.orbs.fire(this.center, this.aim, ORB_SPEED);
        this.mood = 'rest';
        this.timer = REST;
      }
    }

    // Hover, face the player, spin the rings, glow while winding up.
    this.center.copy(this.home);
    this.center.y += Math.sin(time * 1.3) * 0.04;
    if (this.shake > 0) {
      this.shake -= dt;
      this.center.x += (Math.random() - 0.5) * 0.04;
      this.center.y += (Math.random() - 0.5) * 0.04;
    }
    root.position.copy(this.center);
    root.rotation.y = Math.atan2(head.x - this.center.x, head.z - this.center.z);
    this.rig.rings[0].rotation.z += dt * 0.8;
    this.rig.rings[1].rotation.z -= dt * 1.1;
    const windUp = this.mood === 'telegraph' ? 1 - this.timer / TELEGRAPH : 0;
    this.rig.body.scale.setScalar(1 + windUp * 0.18);
    this.flash = Math.max(0, this.flash - dt);
    const color = this.rig.bodyMaterial.color;
    if (this.flash > 0) color.setHex(0xffffff);
    else color.setRGB(0.29 + windUp * 0.6, 0.14 + windUp * 0.2, 0.44 - windUp * 0.2);
    this.rig.barFill.scale.x = Math.max(0.001, this.hp / MAX_HP);

    this.orbs.update(dt, absorbs);
  }
}
