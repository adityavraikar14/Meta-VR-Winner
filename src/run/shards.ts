import {
  CanvasTexture,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  RingGeometry,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playClick, playTink } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { stage } from '../stage-state.js';
import { isMarker, OUTLINES, RING_HOLE, type ShardKind, shadowOf, shadowScale, shardShadow, THICKNESS } from './shard-shapes.js';
import { type Poly, TAG_SHARD } from './spark-physics.js';

export { isMarker, type ShardKind } from './shard-shapes.js';

/**
 * Light shards: cut-glass pieces you hold in the lantern's light. Their
 * shadows are solid ground for the spark, exactly like your hands'.
 *
 * Holding one: pinch near it (thumb and index tips within 3 cm, released at
 * 5 cm, the hand tracker's own hysteresis). It follows the pinch in 3D; roll
 * your wrist to turn it (the knuckle line's angle on the screen's plane);
 * let go and it stays, its angle snapped to 15°. Its depth is kept between
 * the lantern and the screen, so it always casts a shadow.
 *
 * Its shadow is the convex hull of its corners projected through the lantern
 * (P′ = L + (P − L)·D/d), so the physics matches what you see, and while you
 * hold it a label reads the magnification: bring it towards the lantern and
 * the shadow grows.
 */

export interface ShardSpec {
  kind: ShardKind;
  /** Where it waits, in paper space (x, y, z = distance in front of the screen). */
  at: readonly [number, number, number];
  /** Degrees. */
  angle?: number;
}

/** A pinch this close to a shard's centre takes it. */
const GRAB_REACH = 0.07;
/** Depth limits, as a fraction of the lantern-to-screen distance from the screen. */
const NEAREST = 0.2;
const FARTHEST = 0.8;
const SNAP = (15 * Math.PI) / 180;
const KNUCKLE_INDEX = 6;
const KNUCKLE_PINKY = 21;
/** The pinch cursor's ring: open at this thumb-to-index gap (m) and wider, closed at a full pinch. */
const CURSOR_OPEN_GAP = 0.08;
const CURSOR_RADIUS = 0.016;
/** Where the player's eyes are in paper space, for turning the cursor towards them. */
const VIEWER = new Vector3(0, 0.12, 1.0);
const CURSOR_IDLE = 0xf4f8ff;
const CURSOR_REACH = 0x5fd3ff;
const CURSOR_HELD = 0xffc94d;

export class Shard {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly position = new Vector3();
  angle = 0;
  held = -1;
  /** A pinch is close enough to take it (it glows). */
  hover = false;
  /** This frame's shadow on the screen, and its scale (D ÷ d). */
  readonly shadow: Poly = { xs: [], ys: [], vx: 0, vy: 0, e: 0.25, mu: 0.02, tag: TAG_SHARD };
  scale = 1;
  private lastCentre: [number, number] | null = null;

  constructor(
    readonly kind: ShardKind,
    parent: Group,
  ) {
    const shape = new Shape();
    OUTLINES[kind].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    if (kind === 'ring') {
      const hole = new Path();
      RING_HOLE.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    geometry.translate(0, 0, -THICKNESS / 2);
    this.material = new MeshStandardMaterial({
      color: isMarker(kind) ? 0xfff1c4 : 0xd8f3ff,
      emissive: isMarker(kind) ? 0xffaa2a : 0x47b6ff,
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    parent.add(this.mesh);
  }

  /** Where its centre's shadow falls on the screen (paper space). */
  shadowCentre(): [number, number] {
    return shadowOf(this.position.x, this.position.y, this.position.z, stage.lantern);
  }

  /** Its shadow on the screen this frame (a collider), its scale, and the shadow's own velocity. */
  project(dt: number): void {
    const hull = shardShadow(this.kind, this.position.x, this.position.y, this.position.z, this.angle, stage.lantern);
    this.shadow.xs = hull.map((p) => p[0]);
    this.shadow.ys = hull.map((p) => p[1]);
    this.scale = shadowScale(this.position.z, stage.lantern);
    // The shadow's own velocity, so a shard swept through the spark bats it.
    const [cx, cy] = this.shadowCentre();
    if (this.lastCentre && dt > 0) {
      this.shadow.vx = (cx - this.lastCentre[0]) / dt;
      this.shadow.vy = (cy - this.lastCentre[1]) / dt;
    }
    this.lastCentre = [cx, cy];
    if (this.held < 0) this.shadow.vx = this.shadow.vy = 0;
  }

  place(time = 0): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, 0, this.angle);
    // Held: bright; within a pinch's reach: a quick pulse, so you know which one you will take.
    this.material.emissiveIntensity = this.held >= 0 ? 1.1 : this.hover ? 0.8 + 0.25 * Math.sin(time * 12) : 0.45;
    this.mesh.scale.setScalar(this.hover && this.held < 0 ? 1.08 : 1);
  }
}

function scaleLabel(): { sprite: Sprite; set(text: string): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(0.07, 0.07 * (96 / 256), 1);
  sprite.renderOrder = 9;
  sprite.visible = false;
  let last = '';
  return {
    sprite,
    set(text: string) {
      if (text === last) return;
      last = text;
      const g = canvas.getContext('2d')!;
      g.clearRect(0, 0, 256, 96);
      g.fillStyle = 'rgba(16, 22, 48, 0.85)';
      g.beginPath();
      g.roundRect(4, 4, 248, 88, 40);
      g.fill();
      g.fillStyle = '#bfe9ff';
      g.font = '600 50px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 128, 50);
      texture.needsUpdate = true;
    },
  };
}

/** The level's shards and the hands that hold them. */
export class ShardSet {
  readonly shards: Shard[];
  /** Shadows of every shard this frame (colliders). */
  readonly shadows: Poly[] = [];
  /** Shards moved by the player this attempt. */
  moves = 0;
  private grabs: Array<{ shard: Shard; offset: Vector3; roll0: number; angle0: number } | null> = [null, null];
  private label = scaleLabel();
  /** One pinch cursor per hand: a ring at the fingertips that closes as you pinch. */
  private cursors: Array<{ ring: Mesh; material: MeshBasicMaterial }> = [];
  private time = 0;
  private eye = new Vector3();
  private v = new Vector3();
  private a = new Vector3();
  private b = new Vector3();

  constructor(
    specs: readonly ShardSpec[],
    private parent: Group,
  ) {
    this.shards = specs.map((spec) => this.make(spec));
    parent.add(this.label.sprite);
    for (let h = 0; h < 2; h++) {
      const material = new MeshBasicMaterial({ color: CURSOR_IDLE, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: DoubleSide });
      const ring = new Mesh(new RingGeometry(0.82, 1, 40), material);
      ring.renderOrder = 10;
      ring.visible = false;
      parent.add(ring);
      this.cursors.push({ ring, material });
    }
  }

  private make(spec: ShardSpec): Shard {
    const shard = new Shard(spec.kind, this.parent);
    shard.position.set(spec.at[0], spec.at[1], spec.at[2]);
    shard.angle = ((spec.angle ?? 0) * Math.PI) / 180;
    shard.place();
    return shard;
  }

  /** A new piece (the Workshop's Add). */
  add(spec: ShardSpec): Shard {
    const shard = this.make(spec);
    this.shards.push(shard);
    return shard;
  }

  /** Takes away the newest piece that is not held and not a marker; false if there is none. */
  removeLast(): boolean {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i];
      if (shard.held >= 0 || isMarker(shard.kind)) continue;
      this.drop(i);
      return true;
    }
    return false;
  }

  private drop(i: number): void {
    const [shard] = this.shards.splice(i, 1);
    shard.mesh.removeFromParent();
    shard.mesh.geometry.dispose();
    shard.material.dispose();
  }

  /** Puts every piece back where `specs` say (by index), e.g. the Workshop's default layout; a different set of pieces is rebuilt. */
  restore(specs: readonly ShardSpec[]): void {
    const same = specs.length === this.shards.length && specs.every((spec, i) => spec.kind === this.shards[i].kind);
    if (!same && this.shards.every((s) => s.held < 0)) {
      while (this.shards.length) this.drop(this.shards.length - 1);
      for (const spec of specs) this.shards.push(this.make(spec));
      return;
    }
    specs.forEach((spec, i) => {
      const shard = this.shards[i];
      if (!shard || shard.held >= 0) return;
      shard.position.set(spec.at[0], spec.at[1], spec.at[2]);
      shard.angle = ((spec.angle ?? 0) * Math.PI) / 180;
    });
  }

  /** Where every piece is, for saving a Workshop design. */
  layout(): ShardSpec[] {
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return this.shards.map((s) => ({
      kind: s.kind,
      at: [round(s.position.x), round(s.position.y), round(s.position.z)] as const,
      angle: Math.round((s.angle * 180) / Math.PI),
    }));
  }

  /** The wrist's roll on the screen's plane: the knuckle line's angle. */
  private roll(h: number): number | null {
    const paper = stage.paper;
    if (!paper) return null;
    const j = stage.joints[h];
    this.a.set(j[KNUCKLE_INDEX * 3], j[KNUCKLE_INDEX * 3 + 1], j[KNUCKLE_INDEX * 3 + 2]);
    this.b.set(j[KNUCKLE_PINKY * 3], j[KNUCKLE_PINKY * 3 + 1], j[KNUCKLE_PINKY * 3 + 2]);
    paper.worldToLocal(this.a);
    paper.worldToLocal(this.b);
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    if (Math.hypot(dx, dy) < 0.02) return null;
    return Math.atan2(dy, dx);
  }

  update(dt: number, hands: readonly HandState[]): void {
    this.time += dt;
    const paper = stage.paper;
    const [, , lz] = stage.lantern;
    for (const shard of this.shards) shard.hover = false;
    for (let h = 0; h < hands.length && h < 2; h++) {
      const hand = hands[h];
      const grab = this.grabs[h];
      if (grab && (!hand.tracked || !hand.pinching)) {
        grab.shard.held = -1;
        grab.shard.angle = Math.round(grab.shard.angle / SNAP) * SNAP;
        this.grabs[h] = null;
        playTink(0.04);
        continue;
      }
      const cursor = this.cursors[h];
      cursor.ring.visible = false;
      if (!paper || !hand.tracked) continue;
      this.v.copy(hand.pinch);
      paper.worldToLocal(this.v);
      // The shard this hand would take, if it pinched now.
      let reach: Shard | null = null;
      if (!grab) {
        let nearest = GRAB_REACH;
        for (const shard of this.shards) {
          if (shard.held >= 0) continue;
          const d = shard.position.distanceTo(this.v);
          if (d < nearest) {
            nearest = d;
            reach = shard;
          }
        }
        if (reach) reach.hover = true;
      }
      // The cursor: a ring between thumb and index, shrinking as they close.
      const closed = Math.min(1, Math.max(0, 1 - hand.pinchGap / CURSOR_OPEN_GAP));
      cursor.ring.visible = true;
      cursor.ring.position.copy(this.v);
      cursor.ring.scale.setScalar(CURSOR_RADIUS * (1.15 - 0.6 * closed));
      cursor.ring.lookAt(this.parent.localToWorld(this.eye.copy(VIEWER)));
      cursor.material.color.setHex(grab ? CURSOR_HELD : reach ? CURSOR_REACH : CURSOR_IDLE);
      cursor.material.opacity = grab ? 0.95 : reach ? 0.9 : 0.35 + 0.4 * closed;
      if (!grab && hand.pinchStarted) {
        let best: Shard | null = null;
        let bestDistance = GRAB_REACH;
        for (const shard of this.shards) {
          if (shard.held >= 0) continue;
          const d = shard.position.distanceTo(this.v);
          if (d < bestDistance) {
            bestDistance = d;
            best = shard;
          }
        }
        if (best) {
          best.held = h;
          this.grabs[h] = { shard: best, offset: best.position.clone().sub(this.v), roll0: this.roll(h) ?? 0, angle0: best.angle };
          this.moves++;
          playClick();
        }
      } else if (grab) {
        grab.shard.position.copy(this.v).add(grab.offset);
        grab.shard.position.z = Math.min(lz * FARTHEST, Math.max(lz * NEAREST, grab.shard.position.z));
        const roll = this.roll(h);
        if (roll !== null) {
          let turn = roll - grab.roll0;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          grab.shard.angle = grab.angle0 + turn;
        }
      }
    }
    this.shadows.length = 0;
    let shown: Shard | null = null;
    for (const shard of this.shards) {
      shard.project(dt);
      shard.place(this.time);
      if (!isMarker(shard.kind)) this.shadows.push(shard.shadow);
      if (shard.held >= 0) shown = shard;
    }
    // While held: the shard's magnification, read live.
    this.label.sprite.visible = shown !== null;
    if (shown) {
      this.label.set(`×${shown.scale.toFixed(1)}`);
      this.label.sprite.position.set(shown.position.x, shown.position.y + 0.05, shown.position.z);
    }
  }
}
