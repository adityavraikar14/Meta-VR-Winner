/**
 * Morwen, the Ink Witch, as a boss. She stands across the room and fights as
 * she does in the Ink Duel: ink lobbed in arcs, quick straight bolts, and a
 * ward of green runes that stops every hit while it turns. Every few moves
 * she walks in close, within sword reach, then steps back. Below half health
 * she is enraged: two lobs at once and less rest. All her ink is stopped by
 * the same defences as the sentinel's orbs and the dragon's fire.
 */
import { Group, Vector3 } from '@iwsdk/core';
import { AIM_DROP, Boss, RayHit } from './opponent.js';
import { rayToSphere, ShotVolley } from './orbs.js';
import { sfx } from './sfx.js';
import { Bursts, flickerShot, hexTrails, makeInkShot, Trail } from './visuals.js';
import { loadWitch, NamePlate, WitchModel, type WitchMove } from './witch-model.js';

/** Life-size, standing this far ahead, with her feet this far below the player's eyes. */
const HEIGHT = 1.6;
const DISTANCE = 2.6;
const FEET_DROP = 1.25;
const MAX_HP = 80;
/** Seconds between moves, calm and enraged. */
const REST = 2.0;
const ENRAGED_REST = 1.3;
/** Her moves, in turn. */
const PATTERN: ReadonlyArray<WitchMove | 'advance'> = ['throw', 'attack', 'throw', 'skill', 'advance'];
/**
 * A lob lands on the player after this long under this gravity: an arc about
 * 35 cm above the straight line (gT²/8), low enough that ink thrown overhand
 * still crosses the wall's plane under its top edge.
 */
const LOB_TIME = 1.2;
const LOB_GRAVITY = 2;
/** Enraged lobs come in pairs, this far either side of the chest. */
const LOB_SPREAD = 0.2;
const BOLT_SPEED = 2.6;
const INK_RADIUS = 0.1;
/** Her body for hits: a capsule this thick; for aiming, a sphere at her chest. */
const BODY_RADIUS = 0.22;
const AIM_RADIUS = 0.35;
/** Walking in: how close, and seconds in, waiting, and back. */
const CLOSE_DISTANCE = 1.15;
const WALK_IN = 1.6;
const WAIT_CLOSE = 2.2;
const WALK_OUT = 1.6;
/** Beaten: she falls, then melts away; the level moves on after this long. */
const MELT_AFTER = 1.4;
const MELT_TIME = 2;
const FINISH_TIME = 6;
const LOAD_TIMEOUT = 30;
const PLATE_WIDTH = 0.9;
const PLATE_RISE = 0.32;

type Mood = 'loading' | 'rest' | 'move' | 'advance' | 'defeated';

export class WitchBoss implements Boss {
  readonly name = 'morwen';
  readonly title = 'Morwen';
  readonly maxHp = MAX_HP;
  readonly labelRise = 0.95;
  readonly center = new Vector3();
  hp = MAX_HP;
  hitsTaken = 0;
  defeats = 0;
  calm = false;
  finished = false;
  failed = false;

  private model: WitchModel | null = null;
  private ink: ShotVolley;
  private trails: Trail[];
  private plate = new NamePlate('Morwen, the Ink Witch', PLATE_WIDTH);
  private active = false;
  private mood: Mood = 'loading';
  private timer = REST;
  private step = 0;
  private moveTime = 0;
  private wasWarded = false;
  private loadTime = 0;
  private home = new Vector3();
  private close = new Vector3();
  private aim = new Vector3();
  private side = new Vector3();
  private from = new Vector3();
  private tmp = new Vector3();
  private up = new Vector3(0, 1, 0);
  private hit: RayHit = { distance: 0, point: new Vector3(), orb: false };

  constructor(
    private parent: Group,
    private bursts: Bursts,
    onPlayerHit: () => void,
  ) {
    this.trails = hexTrails(parent);
    this.ink = new ShotVolley(
      parent,
      bursts,
      makeInkShot,
      INK_RADIUS,
      0x7dff6a,
      () => {
        this.hitsTaken++;
        onPlayerHit();
      },
      (object, dt, velocity) => {
        flickerShot(object, dt);
        // Green sparks and dark smoke trailing behind the hex.
        this.trails[0].emit(object.position, velocity);
        this.trails[0].emit(object.position, velocity);
        this.trails[1].emit(object.position, velocity);
      },
    );
    this.plate.mesh.visible = false;
    parent.add(this.plate.mesh);
    void loadWitch().then((gltf) => {
      if (!gltf) {
        this.failed = true;
        return;
      }
      this.model = new WitchModel(gltf, HEIGHT);
      this.model.root.visible = this.active;
      this.model.root.position.copy(this.home);
      this.parent.add(this.model.root);
      if (this.mood === 'loading') this.startFight();
    });
  }

  get alive(): boolean {
    return this.mood !== 'loading' && this.mood !== 'defeated';
  }

  get enraged(): boolean {
    return this.hp <= MAX_HP / 2;
  }

  get loadingText(): string | null {
    return this.mood === 'loading' ? '🧙 Morwen is coming…' : null;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.plate.mesh.visible = active;
    if (this.model) this.model.root.visible = active;
    this.ink.clear();
  }

  place(head: Vector3, forward: Vector3): void {
    const feet = Math.max(0, head.y - FEET_DROP);
    this.home.copy(forward).multiplyScalar(DISTANCE).add(head).setY(feet);
    this.close.copy(forward).multiplyScalar(CLOSE_DISTANCE).add(head).setY(feet);
    this.center.copy(this.home).setY(feet + HEIGHT * 0.62);
    if (this.model) {
      this.model.root.position.copy(this.home);
      this.model.root.rotation.y = Math.atan2(-forward.x, -forward.z);
    }
    this.ink.clear();
    if (this.mood !== 'loading' && this.mood !== 'defeated') this.startFight();
  }

  reset(): void {
    this.hp = MAX_HP;
    this.finished = false;
    this.ink.clear();
    this.plate.draw(1);
    if (this.model) {
      this.model.melt = 0;
      this.model.play('idle');
      this.startFight();
    } else {
      this.mood = 'loading';
    }
  }

  touches(point: Vector3, radius: number): boolean {
    return this.alive && this.model !== null && this.model.distanceTo(point, this.tmp) < BODY_RADIUS + radius;
  }

  damage(amount: number, at: Vector3): void {
    if (!this.alive || !this.model) return;
    // Her ward stops everything while it turns.
    if (this.model.warded) {
      this.bursts.spawn(at, 0x3ee08a, 0.3);
      sfx.block();
      return;
    }
    const wasEnraged = this.enraged;
    this.hp = Math.max(0, this.hp - amount);
    this.model.flinch();
    this.bursts.spawn(at, 0xffffff, 0.3);
    sfx.hit();
    if (this.hp === 0) {
      this.mood = 'defeated';
      this.timer = FINISH_TIME;
      this.defeats++;
      this.ink.clear();
      this.model.setWalkDirection(true);
      this.model.play('death');
      sfx.witchShriek();
    } else if (this.enraged && !wasEnraged) {
      sfx.witchCloseLaugh();
    }
  }

  cutOrbs(point: Vector3, radius: number): number {
    return this.ink.cut(point, radius);
  }

  fireNow(): void {
    if (!this.alive || !this.model || this.mood !== 'rest') return;
    this.mood = 'move';
    this.model.play('throw');
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
    if (this.alive && this.model) test(this.center, AIM_RADIUS, false);
    this.ink.forEach((position) => test(position, INK_RADIUS, true));
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
        else if (this.timer <= 0) this.nextMove(model);
        break;
      case 'move':
        // Ink leaves her hand at the moment the throw clip moves fastest.
        if (model.released) {
          model.handAt(model.released, this.from);
          model.released = null;
          this.release(model.moving);
        }
        if (!model.busy) this.rest();
        break;
      case 'advance':
        this.walk(model, dt);
        break;
      case 'defeated':
        if (FINISH_TIME - this.timer > MELT_AFTER) model.melt = Math.min(1, model.melt + dt / MELT_TIME);
        if (this.timer <= 0) this.finished = true;
        break;
    }

    model.update(dt, head);
    model.chestAt(this.center);
    // The pentagram has formed and she rises inside it: a ghostly, echoing laugh.
    if (model.warded && !this.wasWarded) sfx.witchWardLaugh();
    this.wasWarded = model.warded;

    // Her name plate above her head, turned to the player.
    const plate = this.plate.mesh;
    plate.visible = this.active && this.mood !== 'defeated';
    model.headAt(plate.position);
    plate.position.y += PLATE_RISE;
    plate.rotation.y = Math.atan2(head.x - plate.position.x, head.z - plate.position.z);
    this.plate.draw(this.hp / MAX_HP);

    this.ink.update(dt, absorbs);
    for (const trail of this.trails) trail.update(dt);
  }

  private startFight(): void {
    if (this.active) sfx.witchAttackLaugh(0.3);
    this.mood = 'rest';
    this.timer = REST;
    this.step = 0;
    if (this.model) this.model.root.position.copy(this.home);
  }

  private rest(): void {
    this.mood = 'rest';
    this.timer = this.enraged ? ENRAGED_REST : REST;
  }

  private nextMove(model: WitchModel): void {
    const move = PATTERN[this.step % PATTERN.length];
    this.step++;
    if (move === 'advance') {
      this.mood = 'advance';
      this.moveTime = 0;
      model.setWalkDirection(true);
      model.play('walk');
      return;
    }
    this.mood = 'move';
    model.play(move);
    if (move === 'skill') {
      sfx.ward();
    }
  }

  /** The ink leaves her hand: a lob (two when enraged) or a quick bolt. */
  private release(move: WitchMove): void {
    if (move === 'attack') {
      this.ink.fire(this.from, this.aim, BOLT_SPEED);
    } else if (this.enraged) {
      this.side.copy(this.aim).sub(this.from).cross(this.up).normalize().multiplyScalar(LOB_SPREAD);
      this.ink.lob(this.from, this.tmp.copy(this.aim).add(this.side), LOB_TIME, LOB_GRAVITY);
      this.ink.lob(this.from, this.tmp.copy(this.aim).sub(this.side), LOB_TIME, LOB_GRAVITY);
    } else {
      this.ink.lob(this.from, this.aim, LOB_TIME, LOB_GRAVITY);
    }
    sfx.inkThrow();
    // She laughs after every throw, whether or not it hits.
    sfx.witchAttackLaugh();
  }

  /** Walk in close, wait there open to the sword, then step back. */
  private walk(model: WitchModel, dt: number): void {
    this.moveTime += dt;
    const t = this.moveTime;
    const root = model.root;
    if (t < WALK_IN) {
      root.position.lerpVectors(this.home, this.close, smooth(t / WALK_IN));
    } else if (t < WALK_IN + WAIT_CLOSE) {
      root.position.copy(this.close);
      if (model.moving === 'walk') {
        // Arrived, right in front of the player: her scariest laugh.
        model.play('idle');
        sfx.witchCloseLaugh();
      }
    } else if (t < WALK_IN + WAIT_CLOSE + WALK_OUT) {
      if (model.moving !== 'walk') {
        model.setWalkDirection(false);
        model.play('walk');
      }
      root.position.lerpVectors(this.close, this.home, smooth((t - WALK_IN - WAIT_CLOSE) / WALK_OUT));
    } else {
      root.position.copy(this.home);
      model.setWalkDirection(true);
      model.play('idle');
      this.rest();
    }
  }
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}
