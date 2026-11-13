import { Box3, Euler, type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { playClunk, playCrackle, playPop, playTink, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devInfo } from '../dev-tools.js';

/**
 * Everything around you is touchable: plants and flowers lean away from your
 * fingers and spring back; pinch one and it comes away in your hand, roots
 * and all; let go and it flies with your hand's speed, falls, bounces and
 * settles on the table or your floor, where you can pick it up again (or
 * leave it out of your way). Stones and stumps do the same, heavier.
 *
 * The scenery registers what it places (see placeAll in world/scenery.ts).
 * All motion is in world space: a picked-up thing is re-parented to the
 * scene so it keeps where you put it, and goes when the level's scenery is
 * cleared.
 */

export type TouchKind = 'plant' | 'stone';

interface Item {
  object: Object3D;
  kind: TouchKind;
  /** Base rotation, so a bend adds to it. */
  rest: Euler;
  /** The stem: world base and top, and how far the thing reaches round it. */
  base: Vector3;
  top: Vector3;
  radius: number;
  measured: boolean;
  /** Bend: a two-axis tilt (radians) and its speed, on a spring. */
  tiltX: number;
  tiltZ: number;
  speedX: number;
  speedZ: number;
  state: 'rooted' | 'held' | 'flying' | 'lying';
  hand: number;
  offset: Vector3;
  velocity: Vector3;
  spin: number;
  /** Lying down after a throw: how far it has toppled (0 → 1). */
  topple: number;
  toppleAxis: number;
  /** Seconds since its last landing sound, so a bounce series is not a drum roll. */
  sinceSound: number;
  /** Seconds since its stem was measured (rooted things grow in, so they are measured again). */
  sinceMeasure: number;
}

/** A pinch this close to a thing's stem takes it (metres); big plants reach further. */
const GRAB_MIN = 0.05;
const GRAB_MAX = 0.14;
/** A fingertip this close to the stem bends it. */
const BEND_REACH = 0.06;
const MAX_TILT = 0.45;
const SPRING = 60;
const DAMPING = 7;
const GRAVITY = 9.8;
/** The world floor (WebXR local-floor). */
const FLOOR_Y = 0;

export class Touchables {
  private items: Item[] = [];
  private scene: Object3D | null = null;
  /** Where the play table's surface is (world y) and its footprint test, set each frame. */
  private tableY = -1;
  private onTable: (p: Vector3) => boolean = () => false;
  private readonly box = new Box3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();
  private readonly segment = new Vector3();
  private readonly tilt = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly euler = new Euler();
  private grabs = 0;
  private lastHands: readonly HandState[] | null = null;
  private throws = 0;

  constructor() {
    devInfo.touch = () => ({
      items: this.items.length,
      held: this.items.filter((i) => i.state === 'held').length,
      flying: this.items.filter((i) => i.state === 'flying').length,
      lying: this.items.filter((i) => i.state === 'lying').length,
      grabs: this.grabs,
      throws: this.throws,
      // The nearest thing to the right hand's pinch, for testing: where its stem is and how far.
      near: (() => {
        const pinch = this.lastHands?.[1]?.pinch;
        if (!pinch) return null;
        let best: Item | null = null;
        for (const i of this.items) if (i.measured && (!best || this.toStem(i, pinch) < this.toStem(best, pinch))) best = i;
        if (!best) return null;
        const r = (n: number) => Math.round(n * 1000) / 1000;
        return { kind: best.kind, state: best.state, base: best.base.toArray().map(r), top: r(best.top.y), d: r(this.toStem(best, pinch)), at: best.object.getWorldPosition(new Vector3()).toArray().map(r) };
      })(),
    });
  }

  /** Something the player can touch, bend, pick up and throw. */
  register(object: Object3D, kind: TouchKind): void {
    object.userData.touchable = kind;
    this.items.push({
      object,
      kind,
      rest: object.rotation.clone(),
      base: new Vector3(),
      top: new Vector3(),
      radius: 0.05,
      measured: false,
      tiltX: 0,
      tiltZ: 0,
      speedX: 0,
      speedZ: 0,
      state: 'rooted',
      hand: -1,
      offset: new Vector3(),
      velocity: new Vector3(),
      spin: 0,
      topple: 0,
      toppleAxis: 0,
      sinceSound: 1,
      sinceMeasure: 0,
    });
  }

  /**
   * The level's scenery is being rebuilt: forget its things, and take away
   * any that were carried off into the room.
   */
  clear(): void {
    for (const item of this.items) {
      if (item.object.parent === this.scene) item.object.removeFromParent();
    }
    this.items = [];
  }

  /** The table's surface (world y) and whether a world point is over it. */
  setTable(y: number, onTable: (p: Vector3) => boolean): void {
    this.tableY = y;
    this.onTable = onTable;
  }

  update(dt: number, hands: readonly HandState[], scene: Object3D): void {
    this.scene = scene;
    this.lastHands = hands;
    // Things whose scenery has gone (a level changed) drop out of the list.
    this.items = this.items.filter((i) => i.object.parent !== null);
    for (const item of this.items) {
      if (!shown(item.object)) continue;
      item.sinceMeasure += dt;
      // Rooted things may still be growing in (they unfurl from nothing): measure again now and then.
      if (!item.measured || (item.state === 'rooted' && item.sinceMeasure > 2 && Math.abs(item.tiltX) + Math.abs(item.tiltZ) < 0.01)) this.measure(item);
      item.sinceSound += dt;
      if (item.state === 'held') this.carry(item, hands);
      else if (item.state === 'flying') this.fly(item, dt);
      else if (item.state === 'lying') this.lie(item, dt);
      else this.bend(item, dt, hands);
    }
    this.grab(hands);
  }

  /** The stem from the base to the top of its bounds, in world space. */
  private measure(item: Item): void {
    item.sinceMeasure = Math.random() * 0.5;
    item.object.updateWorldMatrix(true, true);
    this.box.setFromObject(item.object);
    if (this.box.isEmpty()) return;
    const size = this.box.getSize(this.v);
    // Still a seedling (growing in): not touchable yet.
    if (size.y < 0.005) {
      item.measured = false;
      return;
    }
    item.object.getWorldPosition(item.base);
    item.top.set(item.base.x, this.box.max.y, item.base.z);
    item.radius = Math.max(0.02, Math.min(0.5, Math.max(size.x, size.z) * 0.5));
    item.measured = true;
  }

  /** Distance from a point to an item's stem. */
  private toStem(item: Item, p: Vector3): number {
    const a = item.base;
    this.segment.subVectors(item.top, a);
    const length = this.segment.lengthSq();
    const t = length > 0 ? Math.max(0, Math.min(1, this.w.subVectors(p, a).dot(this.segment) / length)) : 0;
    return p.distanceTo(this.w.copy(a).addScaledVector(this.segment, t));
  }

  /** Fingertips push the plant over, away from them; a spring brings it back upright. */
  private bend(item: Item, dt: number, hands: readonly HandState[]): void {
    let pushX = 0;
    let pushZ = 0;
    const reach = BEND_REACH + item.radius * 0.6;
    for (const hand of hands) {
      if (!hand.tracked) continue;
      for (let t = 0; t < hand.tips.length; t++) {
        const tip = hand.tips[t];
        if (tip.y < item.base.y - 0.02 || tip.y > item.top.y + 0.04) continue;
        const d = this.toStem(item, tip);
        if (d > reach) continue;
        // Lean away from the finger, harder the closer it comes and the higher up it touches.
        const height = (tip.y - item.base.y) / Math.max(0.01, item.top.y - item.base.y);
        const strength = (1 - d / reach) * (0.4 + 0.6 * Math.min(1, height));
        const dx = item.base.x - tip.x;
        const dz = item.base.z - tip.z;
        const n = Math.hypot(dx, dz) || 1;
        pushX += (dz / n) * strength;
        pushZ += (-dx / n) * strength;
      }
    }
    if (item.kind === 'stone') return;
    const wantX = Math.max(-1, Math.min(1, pushX)) * MAX_TILT;
    const wantZ = Math.max(-1, Math.min(1, pushZ)) * MAX_TILT;
    item.speedX += ((wantX - item.tiltX) * SPRING - item.speedX * DAMPING) * dt;
    item.speedZ += ((wantZ - item.tiltZ) * SPRING - item.speedZ * DAMPING) * dt;
    item.tiltX += item.speedX * dt;
    item.tiltZ += item.speedZ * dt;
    if (Math.abs(item.tiltX) + Math.abs(item.tiltZ) + Math.abs(item.speedX) + Math.abs(item.speedZ) < 1e-4) return;
    // A brush past a plant rustles it.
    if ((Math.abs(pushX) + Math.abs(pushZ) > 0.3) && item.sinceSound > 0.6) {
      item.sinceSound = 0;
      playCrackle(0.006);
    }
    // The tilt is about the plant's own base, in world axes: convert to its parent's frame.
    const o = item.object;
    o.rotation.copy(item.rest);
    if (o.parent) {
      // local = P⁻¹ · T · P, applied before the rest rotation: a tilt about world axes at the plant's base.
      o.parent.getWorldQuaternion(this.parentQ);
      this.tilt.setFromEuler(this.euler.set(item.tiltX, 0, item.tiltZ));
      this.q.copy(this.parentQ).invert().multiply(this.tilt).multiply(this.parentQ);
      o.quaternion.premultiply(this.q);
    }
  }

  /** A pinch near a thing's stem takes it out of the ground. */
  private grab(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      if (!hand.tracked || !hand.pinchStarted) return;
      if (this.items.some((i) => i.state === 'held' && i.hand === h)) return;
      let best: Item | null = null;
      let bestD = Infinity;
      for (const item of this.items) {
        if (item.state === 'held' || item.state === 'flying' || !item.measured || !shown(item.object)) continue;
        const reach = Math.max(GRAB_MIN, Math.min(GRAB_MAX, item.radius * 0.6));
        const d = this.toStem(item, hand.pinch);
        if (d < reach && d < bestD) {
          best = item;
          bestD = d;
        }
      }
      if (!best || !this.scene) return;
      const o = best.object;
      // Out of the ground and into the room: it keeps its place in the world as it comes away.
      o.rotation.copy(best.rest);
      this.scene.attach(o);
      best.rest.copy(o.rotation);
      o.getWorldPosition(this.v);
      best.offset.subVectors(this.v, hand.pinch);
      // Hold big things by where you pinched, small ones a little below the fingers.
      if (best.radius < 0.06) best.offset.set(0, -0.015, 0);
      best.state = 'held';
      best.hand = h;
      best.tiltX = best.tiltZ = best.speedX = best.speedZ = 0;
      best.topple = 0;
      this.grabs++;
      if (best.kind === 'plant') playPop(0.05);
      else playTink(0.04);
    });
  }

  private carry(item: Item, hands: readonly HandState[]): void {
    const hand = hands[item.hand];
    if (!hand || !hand.tracked || !hand.pinching) {
      // Let go: it flies with the hand's speed.
      item.state = 'flying';
      item.velocity.copy(hand?.pinchVelocity ?? this.v.set(0, 0, 0)).clampLength(0, 4);
      item.spin = (Math.random() - 0.5) * 6 * Math.min(1, item.velocity.length());
      if (item.velocity.length() > 1.2) {
        this.throws++;
        playWhoosh(Math.min(1, item.velocity.length() / 4));
      }
      item.hand = -1;
      return;
    }
    item.object.position.copy(hand.pinch).add(item.offset);
    // A gentle sway as it is carried.
    item.object.rotation.z = item.rest.z + Math.max(-0.4, Math.min(0.4, -hand.pinchVelocity.x * 0.15));
  }

  /** Gravity, a bounce or two, and it settles on the table or the floor. */
  private fly(item: Item, dt: number): void {
    const o = item.object;
    const heavy = item.kind === 'stone';
    item.velocity.y -= GRAVITY * dt;
    item.velocity.multiplyScalar(1 - (heavy ? 0.05 : 0.6) * dt);
    o.position.addScaledVector(item.velocity, dt);
    o.rotation.y += item.spin * dt;
    const surface = this.tableY > 0 && this.onTable(o.position) && o.position.y >= this.tableY - 0.05 ? this.tableY : FLOOR_Y;
    if (o.position.y > surface) return;
    o.position.y = surface;
    if (Math.abs(item.velocity.y) > 0.7) {
      if (item.sinceSound > 0.12) {
        item.sinceSound = 0;
        if (heavy) playClunk(Math.min(0.08, 0.02 + Math.abs(item.velocity.y) * 0.02));
        else playTink(0.02);
      }
      item.velocity.y = -item.velocity.y * (heavy ? 0.35 : 0.2);
      item.velocity.x *= 0.6;
      item.velocity.z *= 0.6;
      item.spin *= 0.5;
      return;
    }
    // Down to stay: a plant lies over on its side, a stone sits.
    item.velocity.set(0, 0, 0);
    item.state = 'lying';
    item.topple = item.kind === 'plant' ? 0 : 1;
    item.toppleAxis = Math.random() < 0.5 ? -1 : 1;
    item.rest.copy(o.rotation);
    item.measured = false;
  }

  /** A pulled plant topples over where it landed; then it can be picked up again. */
  private lie(item: Item, dt: number): void {
    if (item.topple >= 1) return;
    item.topple = Math.min(1, item.topple + dt * 2.5);
    const k = item.topple * item.topple;
    item.object.rotation.z = item.rest.z + item.toppleAxis * k * 1.35;
    if (item.topple >= 1) {
      item.rest.copy(item.object.rotation);
      item.measured = false;
    }
  }
}

/** Visible only if it and all its parents are. */
function shown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** The one set of touchable things, shared by the scenery and the creature system. */
export const touchables = new Touchables();
