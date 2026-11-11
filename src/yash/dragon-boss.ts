/**
 * The dragon boss. It hovers ahead of the player and breathes fireballs, which
 * every defence handles the same way as the sentinel's orbs. Every few attacks
 * it swoops in within sword reach, leaving itself open. Below half health it
 * is enraged: faster twin fireballs, less rest.
 */
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from '@iwsdk/core';
import { DragonModel, loadDragon } from './dragon-model.js';
import { AIM_DROP, Boss, RayHit } from './opponent.js';
import { rayToSphere, ShotVolley } from './orbs.js';
import { sfx } from './sfx.js';
import { Bursts, fireTrails, flickerShot, makeFireball, Trail } from './visuals.js';

/** Nose to tail, metres, and how far ahead of the player it hovers. */
const LENGTH = 1.6;
const DISTANCE = 2.6;
/** Its feet hang this far below the eyes, which puts its chest about level with them. */
const HOVER_DROP = 0.9;
/** The health bar floats this far above its chest, clear of the wings. */
const BAR_RISE = 0.85;
const MAX_HP = 60;
/** Seconds between attacks, calm and enraged, and how long it draws breath. */
const REST = 2.4;
const ENRAGED_REST = 1.5;
const BREATH = 1.0;
const FIRE_SPEED = 1.6;
const ENRAGED_FIRE_SPEED = 2.1;
const FIRE_RADIUS = 0.11;
/** Enraged: two fireballs, aimed this far either side of the chest. */
const TWIN_SPREAD = 0.2;
/** Every this many attacks it swoops: seconds in, hanging there, and back out. */
const SWOOP_EVERY = 3;
const SWOOP_DISTANCE = 1.0;
const SWOOP_IN = 1.2;
const SWOOP_HOLD = 2.2;
const SWOOP_OUT = 1.2;
const DEFEAT_TIME = 3;
/** Seconds the victory stays up before the level moves on. */
const VICTORY_TIME = 3;
/** Give up if the model hasn't arrived after this long. */
const LOAD_TIMEOUT = 30;
const BAR_WIDTH = 1.0;

type Mood = 'loading' | 'rest' | 'breath' | 'swoop' | 'defeated';

export class DragonBoss implements Boss {
  readonly name = 'dragon';
  readonly title = 'Dragon';
  readonly maxHp = MAX_HP;
  readonly labelRise = BAR_RISE + 0.13;
  readonly center = new Vector3();
  hp = MAX_HP;
  hitsTaken = 0;
  defeats = 0;
  calm = false;
  finished = false;
  /** The model couldn't be loaded; the level should go back to the sentinel. */
  failed = false;

  private model: DragonModel | null = null;
  private fire: ShotVolley;
  private trails: Trail[];
  private active = false;
  private mood: Mood = 'loading';
  private timer = REST;
  private attacks = 0;
  private swoopTime = 0;
  private loadTime = 0;
  private home = new Vector3();
  private close = new Vector3();
  private aim = new Vector3();
  private side = new Vector3();
  private mouth = new Vector3();
  private hit: RayHit = { distance: 0, point: new Vector3(), orb: false };

  private bar = new Group();
  private barFill: Mesh;
  private barMaterial = new MeshBasicMaterial({ color: 0xff5a7a, depthTest: false, transparent: true });

  constructor(
    private parent: Group,
    private bursts: Bursts,
    onPlayerHit: () => void,
  ) {
    this.trails = fireTrails(parent);
    this.fire = new ShotVolley(
      parent,
      bursts,
      makeFireball,
      FIRE_RADIUS,
      0xffa040,
      () => {
        this.hitsTaken++;
        onPlayerHit();
        sfx.dragonSnarl();
      },
      (object, dt, velocity) => {
        flickerShot(object, dt);
        // Two embers and a puff of smoke a frame, streaming off behind it.
        this.trails[0].emit(object.position, velocity);
        this.trails[0].emit(object.position, velocity);
        this.trails[1].emit(object.position, velocity);
      },
    );
    // Drawn over everything: wings must never hide how much health it has left.
    const back = new Mesh(
      new PlaneGeometry(BAR_WIDTH + 0.03, 0.075),
      new MeshBasicMaterial({ color: 0x1d1028, depthTest: false, transparent: true }),
    );
    back.renderOrder = 10;
    const fillGeometry = new PlaneGeometry(BAR_WIDTH, 0.05);
    fillGeometry.translate(BAR_WIDTH / 2, 0, 0);
    this.barFill = new Mesh(fillGeometry, this.barMaterial);
    this.barFill.renderOrder = 11;
    this.barFill.position.set(-BAR_WIDTH / 2, 0, 0.003);
    this.bar.add(back, this.barFill);
    this.bar.visible = false;
    parent.add(this.bar);
    void loadDragon().then((gltf) => {
      if (!gltf) {
        this.failed = true;
        return;
      }
      this.model = new DragonModel(gltf, LENGTH);
      this.model.root.visible = this.active;
      this.parent.add(this.model.root);
      if (this.mood === 'loading') this.startFight();
    });
  }

  get alive(): boolean {
    return this.mood !== 'loading' && this.mood !== 'defeated';
  }

  /** True once its second phase has begun. */
  get enraged(): boolean {
    return this.hp <= MAX_HP / 2;
  }

  get loadingText(): string | null {
    return this.mood === 'loading' ? '🐉 The dragon approaches…' : null;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.bar.visible = active;
    if (this.model) this.model.root.visible = active;
    this.fire.clear();
  }

  place(head: Vector3, forward: Vector3): void {
    this.home.copy(forward).multiplyScalar(DISTANCE).add(head);
    this.home.y = head.y - HOVER_DROP;
    this.close.copy(forward).multiplyScalar(SWOOP_DISTANCE).add(head);
    this.close.y = this.home.y;
    this.center.copy(this.home);
    if (this.model) {
      this.model.root.position.copy(this.home);
      this.model.root.rotation.y = Math.atan2(-forward.x, -forward.z);
    }
    this.fire.clear();
    if (this.mood !== 'loading' && this.mood !== 'defeated') this.startFight();
  }

  reset(): void {
    this.hp = MAX_HP;
    this.finished = false;
    this.fire.clear();
    if (this.model) {
      this.model.defeat = 0;
      this.model.windup = 0;
      this.startFight();
    } else {
      this.mood = 'loading';
    }
  }

  touches(point: Vector3, radius: number): boolean {
    return this.alive && this.model !== null && point.distanceTo(this.center) < this.model.radius + radius;
  }

  damage(amount: number, at: Vector3): void {
    if (!this.alive || !this.model) return;
    const wasEnraged = this.enraged;
    this.hp = Math.max(0, this.hp - amount);
    this.model.flinch();
    this.bursts.spawn(at, 0xffffff, 0.3);
    sfx.hit();
    sfx.dragonHurt();
    if (this.hp === 0) {
      this.mood = 'defeated';
      this.timer = DEFEAT_TIME + VICTORY_TIME;
      this.defeats++;
      this.model.windup = 0;
      this.fire.clear();
      this.bursts.spawn(this.center, 0xffd38a, 1.4, 1);
      sfx.dragonDeath();
    } else if (this.enraged && !wasEnraged) {
      sfx.dragonRoar(1);
    }
  }

  cutOrbs(point: Vector3, radius: number): number {
    return this.fire.cut(point, radius);
  }

  fireNow(): void {
    if (!this.alive || this.mood === 'breath') return;
    this.mood = 'breath';
    this.timer = BREATH;
    sfx.roar();
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
    if (this.alive && this.model) test(this.center, this.model.radius, false);
    this.fire.forEach((position) => test(position, FIRE_RADIUS, true));
    if (best === Infinity) return null;
    this.hit.distance = best;
    this.hit.orb = orb;
    return this.hit;
  }

  update(
    dt: number,
    _time: number,
    head: Vector3,
    absorbs: (point: Vector3, radius: number) => boolean,
  ): void {
    this.aim.copy(head);
    this.aim.y -= AIM_DROP;
    const model = this.model;
    if (!model) {
      this.loadTime += dt;
      if (this.loadTime > LOAD_TIMEOUT) this.failed = true;
      return;
    }

    this.timer -= dt;
    switch (this.mood) {
      case 'rest':
        if (this.calm) this.timer = REST;
        else if (this.timer <= 0) {
          this.attacks++;
          if (this.attacks % (SWOOP_EVERY + 1) === 0) {
            this.mood = 'swoop';
            this.swoopTime = 0;
            sfx.roar();
          } else {
            this.mood = 'breath';
            this.timer = BREATH;
            sfx.dragonSnarl();
          }
        }
        break;
      case 'breath':
        model.windup = Math.min(1, 1 - this.timer / BREATH);
        if (this.timer <= 0) this.breatheFire(model);
        break;
      case 'swoop':
        this.swoop(model, dt);
        break;
      case 'defeated':
        model.defeat = Math.min(1, model.defeat + dt / DEFEAT_TIME);
        if (this.timer <= 0) this.finished = true;
        break;
    }

    model.update(dt, head);
    model.heartAt(this.center);

    // Health bar above it, turned to the player.
    this.bar.visible = this.active && this.mood !== 'defeated';
    this.bar.position.copy(this.center);
    this.bar.position.y += BAR_RISE;
    this.bar.rotation.y = Math.atan2(head.x - this.bar.position.x, head.z - this.bar.position.z);
    this.barFill.scale.x = Math.max(0.001, this.hp / MAX_HP);
    this.barMaterial.color.setHex(this.enraged ? 0xff7a1a : 0xff5a7a);

    this.fire.update(dt, absorbs);
    for (const trail of this.trails) trail.update(dt);
  }

  private startFight(): void {
    if (this.active) sfx.dragonRoar(0.7);
    this.mood = 'rest';
    this.timer = REST;
    this.attacks = 0;
    if (this.model) this.model.root.position.copy(this.home);
  }

  private breatheFire(model: DragonModel): void {
    model.mouthAt(this.mouth);
    if (this.enraged) {
      this.side.copy(this.aim).sub(this.mouth).cross(this.up).normalize().multiplyScalar(TWIN_SPREAD);
      this.fire.fire(this.mouth, this.aim.clone().add(this.side), ENRAGED_FIRE_SPEED);
      this.fire.fire(this.mouth, this.aim.clone().sub(this.side), ENRAGED_FIRE_SPEED);
    } else {
      this.fire.fire(this.mouth, this.aim, FIRE_SPEED);
    }
    sfx.fireball();
    model.windup = 0;
    this.mood = 'rest';
    this.timer = this.enraged ? ENRAGED_REST : REST;
  }

  /** In close, hang there open to the sword, then back out. */
  private swoop(model: DragonModel, dt: number): void {
    this.swoopTime += dt;
    const t = this.swoopTime;
    let k: number;
    if (t < SWOOP_IN) k = smooth(t / SWOOP_IN);
    else if (t < SWOOP_IN + SWOOP_HOLD) k = 1;
    else k = 1 - smooth((t - SWOOP_IN - SWOOP_HOLD) / SWOOP_OUT);
    model.root.position.lerpVectors(this.home, this.close, k);
    if (t >= SWOOP_IN + SWOOP_HOLD + SWOOP_OUT) {
      model.root.position.copy(this.home);
      this.mood = 'rest';
      this.timer = this.enraged ? ENRAGED_REST : REST;
    }
  }

  private up = new Vector3(0, 1, 0);
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}
