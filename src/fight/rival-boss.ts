/**
 * The duel's rivals as Arena bosses: Thorne, Captain Rook, Vex, Mako and
 * Sable at life size, fought with the Arsenal's seven weapons.
 *
 * They do not stand still. Each roams an arc in front of you, walking (or
 * rolling) from spot to spot between attacks, turns to face you to throw,
 * and reacts when something is coming at them. Each keeps the trick they
 * have in the Ink Duel, turned into an Arena power:
 *
 *   Thorne Ember Volley: three fast embers in a row; rolls aside when threatened.
 *   Rook   Fan of Knives: three arcs that land one after another; ducks under high attacks.
 *   Vex    Tumble: never where you last aimed; two lobs at once, then she is gone.
 *   Mako   Thick Hide: the sword and the blaster bounce off. Charges in and slams.
 *   Sable  Parry: strike while her blade is up and your blow comes straight back.
 *
 * Below half health they are enraged: less rest, and they close in.
 * All their shots are stopped by the same defences as every other boss's.
 */
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, type Object3D, SphereGeometry, Vector3 } from '@iwsdk/core';
import { playWhoosh } from '../audio.js';
import { AIM_DROP, type Boss, type RayHit } from '../yash/opponent.js';
import { rayToSphere, ShotVolley } from '../yash/orbs.js';
import { sfx } from '../yash/sfx.js';
import type { Bursts } from '../yash/visuals.js';
import { NamePlate } from '../yash/witch-model.js';
import { preloadRival, Rival3D } from './rival3d.js';
import type { RivalMove, RivalSpec } from './rivals.js';

/** Feet this far below the player's eyes (the player is seated or standing; the floor is theirs). */
const FEET_DROP = 1.25;
/** Life-size heights and Arena health, by rival. */
const SIZE: Record<string, { height: number; girth: number; hp: number }> = {
  vance: { height: 1.75, girth: 0.24, hp: 130 },
  rook: { height: 1.55, girth: 0.3, hp: 120 },
  vex: { height: 1.68, girth: 0.22, hp: 110 },
  mako: { height: 1.95, girth: 0.36, hp: 190 },
  kai: { height: 1.78, girth: 0.24, hp: 140 },
  thorne: { height: 1.7, girth: 0.25, hp: 140 },
  sable: { height: 1.72, girth: 0.22, hp: 135 },
  morwen: { height: 1.6, girth: 0.22, hp: 160 },
};
/** The arc they roam: this far either side of straight ahead, between these distances. */
const ARC = 1.0;
const NEAR = 2.0;
const FAR = 3.3;
/** Charging in: this close, within sword reach. */
const CLOSE = 1.25;
const WALK_SPEED = 0.95;
const REST = 1.7;
const ENRAGED_REST = 1.0;
const SHOT_RADIUS = 0.1;
const AIM_RADIUS = 0.36;
const BOLT_SPEED = 2.8;
const FAST_SPEED = 3.6;
const LOB_TIME = 1.2;
const LOB_GRAVITY = 2;
/** Seconds between reactions (a roll, a duck) to what the player is doing. */
const REACT_EVERY = 2.4;
const MELT_AFTER = 1.4;
const MELT_TIME = 2;
const FINISH_TIME = 5.5;
const LOAD_TIMEOUT = 30;

type Mood = 'loading' | 'rest' | 'walk' | 'move' | 'charge' | 'defeated';

interface Pending {
  delay: number;
  hand: Object3D;
  /** Fired from here instead of the hand (the ultimate's fan). */
  from?: Vector3;
  /** A straight shot at this speed, or a lob taking this long. */
  speed?: number;
  lob?: number;
}

export class RivalBoss implements Boss {
  readonly name: string;
  readonly title: string;
  readonly maxHp: number;
  readonly labelRise = 0.95;
  readonly center = new Vector3();
  hp: number;
  hitsTaken = 0;
  defeats = 0;
  calm = false;
  finished = false;
  failed = false;

  private readonly spec: RivalSpec;
  private model: Rival3D | null = null;
  private readonly shots: ShotVolley;
  private readonly plate: NamePlate;
  private readonly pending: Pending[] = [];
  private active = false;
  private mood: Mood = 'loading';
  private timer = REST;
  private step = 0;
  private react = 0;
  private loadTime = 0;
  private chargeTime = 0;
  /** Seconds to their ultimate (only once enraged). */
  private ultimate = 6;
  /** Where the player is, and which way is "ahead" for them, from the last placement. */
  private readonly origin = new Vector3();
  private readonly forward = new Vector3(0, 0, -1);
  private feet = 0;
  private angle = 0;
  private distance = 2.7;
  private readonly spot = new Vector3();
  private readonly aim = new Vector3();
  private readonly from = new Vector3();
  private readonly tmp = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private hit: RayHit = { distance: 0, point: new Vector3(), orb: false };

  constructor(
    spec: RivalSpec,
    private parent: Group,
    private bursts: Bursts,
    onPlayerHit: () => void,
  ) {
    const size = SIZE[spec.id] ?? { height: 1.7, girth: 0.24, hp: 60 };
    // The same fighter, at life size.
    this.spec = { ...spec, height: size.height, girth: size.girth };
    this.name = spec.id;
    this.title = spec.name;
    this.maxHp = size.hp;
    this.hp = size.hp;
    const glow = spec.glow;
    this.shots = new ShotVolley(parent, bursts, () => makeShot(glow), SHOT_RADIUS, glow, () => {
      this.hitsTaken++;
      onPlayerHit();
    }, (object, dt) => {
      object.rotation.x += dt * 5;
    });
    this.plate = new NamePlate(spec.name, 0.9);
    this.plate.mesh.visible = false;
    parent.add(this.plate.mesh);
    void preloadRival(this.spec).then(() => {
      const model = Rival3D.create(this.spec);
      if (!model) {
        this.failed = true;
        return;
      }
      this.model = model;
      model.root.visible = this.active;
      this.parent.add(model.root);
      this.goTo(this.angle, this.distance, true);
      if (this.mood === 'loading') this.startFight();
    });
  }

  get alive(): boolean {
    return this.mood !== 'loading' && this.mood !== 'defeated';
  }

  get enraged(): boolean {
    return this.hp <= this.maxHp / 2;
  }

  get loadingText(): string | null {
    return this.mood === 'loading' ? `⚔️ ${this.title} is coming…` : null;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.plate.mesh.visible = active;
    if (this.model) this.model.root.visible = active;
    this.shots.clear();
    this.pending.length = 0;
  }

  place(head: Vector3, forward: Vector3): void {
    this.origin.copy(head);
    this.forward.copy(forward).setY(0).normalize();
    this.feet = Math.max(0, head.y - FEET_DROP);
    this.angle = 0;
    this.distance = 2.7;
    this.shots.clear();
    if (this.model) {
      this.goTo(0, 2.7, true);
      this.model.root.rotation.y = Math.atan2(-this.forward.x, -this.forward.z);
    }
    if (this.mood !== 'loading' && this.mood !== 'defeated') this.startFight();
  }

  reset(): void {
    this.hp = this.maxHp;
    this.finished = false;
    this.shots.clear();
    this.pending.length = 0;
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
    const model = this.model;
    if (!this.alive || !model) return false;
    const d = model.distanceTo(point, this.tmp);
    // Something is coming: a roll aside or a duck, if they see it in time.
    if (d < 1.1 && this.react <= 0 && !model.busy && !this.calm && this.mood === 'rest') this.dodge(model);
    return d < this.spec.girth + radius;
  }

  damage(amount: number, at: Vector3): void {
    const model = this.model;
    if (!this.alive || !model) return;
    // Sable's blade is up: the blow comes straight back.
    if (model.parrying) {
      this.bursts.spawn(at, this.spec.glow, 0.35);
      sfx.block();
      this.shots.fire(model.chestAt(this.from), this.aim, FAST_SPEED);
      return;
    }
    // Mako's hide: light blows (the sword's edge, the blaster) bounce off.
    if (this.spec.ability === 'armor' && amount <= 2) {
      this.bursts.spawn(at, 0xb8c8e0, 0.25);
      sfx.block();
      return;
    }
    const wasEnraged = this.enraged;
    this.hp = Math.max(0, this.hp - amount);
    model.flinch(amount >= 3);
    this.bursts.spawn(at, 0xffffff, 0.3);
    sfx.hit();
    if (this.hp === 0) {
      this.mood = 'defeated';
      this.timer = FINISH_TIME;
      this.defeats++;
      this.shots.clear();
      this.pending.length = 0;
      model.freeze = 0.2;
      model.play('death');
      sfx.defeated();
    } else if (this.enraged && !wasEnraged) {
      sfx.telegraph();
      this.bursts.spawn(model.chestAt(this.tmp), this.spec.glow, 0.6);
    } else if (this.spec.ability === 'parry' && !model.busy && Math.random() < 0.35) {
      // Stung, Sable brings her guard up at once.
      this.mood = 'move';
      model.play('skill');
    }
  }

  cutOrbs(point: Vector3, radius: number): number {
    return this.shots.cut(point, radius);
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
    this.shots.forEach((position) => test(position, SHOT_RADIUS, true));
    if (best === Infinity) return null;
    this.hit.distance = best;
    this.hit.orb = orb;
    return this.hit;
  }

  update(dt: number, _time: number, head: Vector3, absorbs: (point: Vector3, radius: number) => boolean): void {
    this.aim.copy(head);
    this.aim.y -= AIM_DROP;
    const model = this.model;
    if (!model) {
      this.loadTime += dt;
      if (this.loadTime > LOAD_TIMEOUT) this.failed = true;
      return;
    }
    this.timer -= dt;
    this.react -= dt;
    if (this.enraged) this.ultimate -= dt;
    switch (this.mood) {
      case 'rest':
        if (this.calm) this.timer = REST;
        else if (this.timer <= 0 && !model.busy) this.next(model);
        break;
      case 'walk':
        // Rival3D walks the slide and stands when it arrives.
        if (!model.sliding) this.rest(0.35);
        break;
      case 'move':
        if (model.released) {
          const hand = model.released;
          const by = model.releasedBy ?? 'throw';
          model.released = null;
          model.releasedBy = null;
          this.release(model, hand, by);
        }
        if (!model.busy) this.rest();
        break;
      case 'charge':
        this.charge(model, dt);
        break;
      case 'defeated':
        if (FINISH_TIME - this.timer > MELT_AFTER) model.melt = Math.min(1, model.melt + dt / MELT_TIME);
        if (this.timer <= 0) this.finished = true;
        break;
    }
    // The rest of a volley, each shot in its turn.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay > 0) continue;
      this.pending.splice(i, 1);
      if (p.from) this.from.copy(p.from);
      else model.handAt(p.hand, this.from);
      if (p.lob) this.shots.lob(this.from, this.aim, p.lob, LOB_GRAVITY);
      else this.shots.fire(this.from, this.aim, p.speed ?? BOLT_SPEED);
      sfx.shoot();
    }

    model.update(dt, this.mood === 'defeated' ? null : head);
    model.chestAt(this.center);
    const plate = this.plate.mesh;
    plate.visible = this.active && this.mood !== 'defeated';
    model.headAt(plate.position);
    plate.position.y += 0.32;
    plate.rotation.y = Math.atan2(head.x - plate.position.x, head.z - plate.position.z);
    this.plate.draw(this.hp / this.maxHp);
    this.shots.update(dt, absorbs);
  }

  // ----------------------------------------------------------------- Moves

  private startFight(): void {
    this.mood = 'rest';
    this.timer = REST;
    this.step = 0;
    if (this.active) sfx.telegraph();
  }

  private rest(seconds?: number): void {
    this.mood = 'rest';
    this.timer = seconds ?? (this.enraged ? ENRAGED_REST : REST);
  }

  /** A spot on the arc, in level space. */
  private at(angle: number, distance: number, out: Vector3): Vector3 {
    out.copy(this.forward).applyAxisAngle(this.up, angle).multiplyScalar(distance).add(this.origin);
    out.y = this.feet;
    return out;
  }

  /** Walks (or is put, at once) to a spot on the arc. */
  private goTo(angle: number, distance: number, instantly = false, seconds?: number): void {
    const model = this.model;
    if (!model) return;
    this.angle = angle;
    this.distance = distance;
    this.at(angle, distance, this.spot);
    if (instantly) {
      model.root.position.copy(this.spot);
      return;
    }
    if (seconds === undefined) {
      // A real walk (a run when enraged), legs matched to the ground speed.
      model.walkTo(this.spot, this.enraged ? WALK_SPEED * 2.2 : WALK_SPEED * (0.8 + Math.random() * 0.4));
      return;
    }
    model.slide(this.spot, seconds);
  }

  /** A new spot on the arc, well away from the current one; closer when enraged. */
  private roam(model: Rival3D): void {
    const side = this.angle > 0 ? -1 : 1;
    const angle = Math.max(-ARC, Math.min(ARC, this.angle + side * (0.45 + Math.random() * 0.75)));
    const far = this.enraged ? NEAR + 0.6 : FAR;
    this.goTo(angle, NEAR + Math.random() * (far - NEAR));
    this.mood = 'walk';
  }

  /** A roll aside (or a duck, for Rook), when something is about to hit. */
  private dodge(model: Rival3D): void {
    this.react = REACT_EVERY * (this.enraged ? 0.7 : 1);
    if (!model.has('dodge') || Math.random() > (this.spec.ability === 'tumble' ? 0.8 : 0.5)) return;
    if (this.spec.ability === 'duck') {
      this.mood = 'move';
      model.play('dodge');
      return;
    }
    const side = this.angle > 0 ? -1 : 1;
    const angle = Math.max(-ARC, Math.min(ARC, this.angle + side * 0.5));
    model.play('dodge');
    this.goTo(angle, this.distance, false, Math.max(0.5, model.duration('dodge') * 0.8));
    this.mood = 'walk';
    playWhoosh(0.4);
  }

  /** What they do next: walk somewhere, then attack from there, with their special every few turns. */
  private next(model: Rival3D): void {
    const turn = this.step++;
    // Enraged, every so often: their ultimate, a fan of seven shots that sweeps across you.
    if (this.enraged && this.ultimate <= 0) {
      this.ultimate = 12 + Math.random() * 5;
      this.mood = 'move';
      model.play(model.has('skill') ? 'skill' : 'attack');
      const chest = model.chestAt(new Vector3());
      const across = new Vector3().crossVectors(this.forward, this.up).normalize();
      for (let i = 0; i < 7; i++) {
        const from = chest.clone().addScaledVector(across, (i - 3) * 0.18);
        from.y += 0.2 + Math.abs(i - 3) * 0.05;
        this.pending.push({ delay: 0.5 + i * 0.16, hand: model.root, from, speed: BOLT_SPEED * 1.1 });
      }
      this.bursts.spawn(chest, this.spec.glow, 0.8);
      sfx.telegraph();
      return;
    }
    // Every other turn they move; Vex moves more than she stands.
    const restless = this.spec.ability === 'tumble' ? 0.7 : 0.5;
    if (turn % 2 === 0 && Math.random() < restless + 0.3) {
      this.roam(model);
      return;
    }
    const r = Math.random();
    const special = this.enraged ? 0.4 : 0.25;
    if (this.spec.ability === 'armor' && r < special) {
      // Mako comes for you.
      this.mood = 'charge';
      this.chargeTime = 0;
      this.angle *= 0.3;
      this.distance = CLOSE;
      model.walkTo(this.at(this.angle, CLOSE, this.spot), 2.6);
      sfx.telegraph();
      return;
    }
    this.mood = 'move';
    if (r < special) {
      model.play('skill');
      if (this.spec.ability === 'parry') this.bursts.spawn(model.chestAt(this.tmp), this.spec.glow, 0.4);
    } else model.play(r < special + 0.35 ? 'attack' : 'throw');
  }

  /** Mako's charge: in close, a slam that throws up three heavy lobs, then back out. */
  private charge(model: Rival3D, dt: number): void {
    this.chargeTime += dt;
    if (model.sliding) return;
    if (model.moving === 'walk' || model.moving === 'idle') {
      if (this.distance <= CLOSE + 0.01 && this.chargeTime < 6) {
        // Arrived: the slam.
        this.chargeTime = 6;
        model.play('skill');
        return;
      }
      if (this.chargeTime >= 6 && this.distance <= CLOSE + 0.01) {
        // Slam done: back out.
        this.goTo(this.angle, 2.6 + Math.random() * 0.5);
        return;
      }
      this.rest();
      return;
    }
    if (model.released) {
      const hand = model.released;
      model.released = null;
      model.releasedBy = null;
      this.release(model, hand, 'skill');
    }
  }

  /** A hand let go: what leaves it depends on the move and on who they are. */
  private release(model: Rival3D, hand: Object3D, by: RivalMove): void {
    model.handAt(hand, this.from);
    if (by === 'throw' || by === 'attack') {
      const shot = this.spec.shots[by];
      if (shot === 'bolt' || shot === 'pellet') this.shots.fire(this.from, this.aim, shot === 'pellet' ? FAST_SPEED : BOLT_SPEED);
      else this.shots.lob(this.from, this.aim, shot === 'heavy' ? 1.5 : LOB_TIME, LOB_GRAVITY);
      sfx.inkThrow();
      return;
    }
    if (by !== 'skill') return;
    switch (this.spec.ability) {
      case 'burst':
        // Three fast shots, a fifth of a second apart.
        this.shots.fire(this.from, this.aim, FAST_SPEED);
        this.pending.push({ delay: 0.22, hand, speed: FAST_SPEED }, { delay: 0.44, hand, speed: FAST_SPEED });
        sfx.shoot();
        break;
      case 'duck':
        // A fan of three: the same aim, three arcs, so they land one after another.
        this.shots.fire(this.from, this.aim, BOLT_SPEED);
        this.shots.lob(this.from, this.aim, 1.3, LOB_GRAVITY);
        this.shots.lob(this.from, this.aim, 1.8, LOB_GRAVITY);
        sfx.slice();
        break;
      case 'tumble':
        // Two lobs on different arcs, and she is already moving.
        this.shots.lob(this.from, this.aim, 1.1, LOB_GRAVITY);
        this.shots.lob(this.from, this.aim, 1.7, LOB_GRAVITY);
        playWhoosh(0.6);
        break;
      case 'armor': {
        // The slam: a ring of dust, and three heavy lobs thrown up from the ground.
        const feet = this.tmp.copy(model.root.position);
        feet.y += 0.1;
        this.bursts.spawn(feet, this.spec.glow, 0.9);
        sfx.wallBreak();
        model.chestAt(this.from);
        this.shots.lob(this.from, this.aim, 1.0, LOB_GRAVITY);
        this.pending.push({ delay: 0.35, hand, lob: 1.2 }, { delay: 0.7, hand, lob: 1.4 });
        break;
      }
      default:
        break;
    }
  }
}

/** A rival's shot: a white-hot core in a shell of their colour. */
function makeShot(color: number): Group {
  const shot = new Group();
  shot.name = 'RivalShot';
  const core = new Mesh(new SphereGeometry(0.045, 14, 10), new MeshBasicMaterial({ color: 0xffffff }));
  const shell = new Mesh(new SphereGeometry(0.085, 16, 12), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
  const ring = new Mesh(new SphereGeometry(0.11, 12, 8), new MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }));
  shot.add(core, shell, ring);
  return shot;
}
