import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  DoubleSide,
  CircleGeometry,
} from '@iwsdk/core';

import type { HandState } from '../creatures/hand-input.js';

/**
 * Shadow Arms: in the story's fights, the shape your hand makes (the shadow
 * it casts) becomes a weapon of shadow in that hand. Hold the shape for a
 * moment and the weapon forms; punch towards your foe to let it fly (swing,
 * for the sword). The Arsenal's signs stay in the Arsenal: here it is all
 * hand shadows.
 *
 *   Fist                      Shadow Ball      a heavy ball: punch to throw
 *   Flat hand, thumb in       Shadow Sword     cuts ink out of the air; swing it to send a slash
 *   Open palm, thumb out      Shadow Shield    hold it up: ink stops on it
 *   Index finger              Shadow Spear     a fast, straight throw
 *   Peace sign                Twin Stars       two shuriken bending in from both sides
 *   Three fingers             Shadow Claw      three slashes at once
 *   Index and pinky (horns)   Lightning        punch, and a bolt falls on them from above
 *   Thumb and pinky           Boomerang        swings wide and comes in from the side
 *   Thumb and index (an L)    Fire Bolt        the fastest of all, light damage
 *   Thumb up                  Shadow Hammer    a slow, heavy lob that hits hardest
 */
export type ShadowShape = 'fist' | 'blade' | 'palm' | 'point' | 'vee' | 'three' | 'horns' | 'shaka' | 'ell' | 'thumb';

export interface ArmSpec {
  name: string;
  /** How to make it, in a few words (for the How to play card and captions). */
  how: string;
  color: number;
  /** Damage per projectile. */
  power: number;
  /** Held (blocks ink while up) rather than thrown. */
  held?: boolean;
}

export const ARMS: Record<ShadowShape, ArmSpec> = {
  fist: { name: 'Shadow Ball', how: 'a fist', color: 0x9a6bff, power: 14 },
  blade: { name: 'Shadow Sword', how: 'a flat hand, thumb tucked in', color: 0x6fd3ff, power: 11 },
  palm: { name: 'Shadow Shield', how: 'an open palm, thumb out', color: 0x7fffc4, power: 0, held: true },
  point: { name: 'Shadow Spear', how: 'point one finger', color: 0xffd84a, power: 12 },
  vee: { name: 'Twin Stars', how: 'a peace sign', color: 0xff8ad8, power: 7 },
  three: { name: 'Shadow Claw', how: 'three fingers up', color: 0xff5a5a, power: 5 },
  horns: { name: 'Lightning', how: 'index and pinky up', color: 0xfff27a, power: 16 },
  shaka: { name: 'Boomerang', how: 'thumb and pinky out', color: 0x7affd1, power: 10 },
  ell: { name: 'Fire Bolt', how: 'thumb and index out, an L', color: 0xff8a2a, power: 7 },
  thumb: { name: 'Shadow Hammer', how: 'a thumbs-up', color: 0xc9a25a, power: 20 },
};

/** Out: straight; in: curled. Between the two, a finger counts as neither. */
const OUT = 0.72;
const IN = 0.5;
const THUMB_OUT = 0.8;
const THUMB_IN = 0.62;

/** Which shape a hand is making, if any. */
export function classifyShape(hand: HandState): ShadowShape | null {
  if (!hand.tracked) return null;
  const e = hand.ext;
  const o = (v: number) => v > OUT;
  const i = (v: number) => v < IN;
  const thumbOut = e.thumb > THUMB_OUT;
  const thumbIn = e.thumb < THUMB_IN;
  const [ix, mi, ri, pi] = [e.index, e.middle, e.ring, e.pinky];
  if (o(ix) && o(mi) && o(ri) && o(pi)) return thumbOut ? 'palm' : thumbIn ? 'blade' : null;
  if (i(ix) && i(mi) && i(ri) && i(pi)) return thumbOut ? 'thumb' : thumbIn ? 'fist' : null;
  if (o(ix) && o(mi) && o(ri) && i(pi)) return 'three';
  if (o(ix) && o(mi) && i(ri) && i(pi)) return 'vee';
  if (o(ix) && i(mi) && i(ri) && o(pi)) return 'horns';
  if (i(ix) && i(mi) && i(ri) && o(pi) && thumbOut) return 'shaka';
  if (o(ix) && i(mi) && i(ri) && i(pi)) return thumbOut ? 'ell' : 'point';
  return null;
}

/** A shot leaving a hand: what, from where (stage-local), and the hand's swing. */
export interface ArmShot {
  shape: ShadowShape;
  from: Vector3;
  /** The hand's velocity (stage-local), for the sword's slash. */
  swing: Vector3;
}

/** Seconds the shape must be held for its weapon to form. */
const FORM_TIME = 0.35;
/** A punch: the hand moving towards the foe at least this fast (m/s). */
const PUNCH = 0.9;
/** A sword swing: this fast, any direction. */
const SWING = 1.5;
/** After a shot, that hand rests this long. */
const COOLDOWN = 0.5;
/** A formed weapon waits this long unused, then fades. */
const IDLE_LIMIT = 8;

interface HandArm {
  shape: ShadowShape | null;
  /** The shape being made now, and for how long. */
  forming: ShadowShape | null;
  formTime: number;
  /** Seconds the weapon's shape has been let go (a punch can blur the fingers). */
  lost: number;
  idle: number;
  cooldown: number;
  model: Group | null;
  prev: Vector3;
  vel: Vector3;
  seen: boolean;
  /** Given by a drawing, not a hand shape: it stays until thrown (or left too long). */
  drawn: boolean;
}

export class ShadowArms {
  readonly root = new Group();
  /** What each hand looked like last frame (for testing). */
  readonly seen: Array<ShadowShape | null> = [null, null];
  private readonly hands: HandArm[] = [0, 1].map(() => ({
    shape: null, forming: null, formTime: 0, lost: 0, idle: 0, cooldown: 0, model: null, prev: new Vector3(), vel: new Vector3(), seen: false, drawn: false,
  }));
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  /** Each held weapon's blocking reach this frame (stage-local): a segment (sword) or a disc (shield). */
  private readonly guards: Array<{ a: Vector3; b: Vector3; r: number }> = [];

  /** `space`: the stage group the fight lives in (hands come in world space). */
  constructor(private readonly space: Object3D) {
    space.add(this.root);
  }

  /** The weapon in each hand now (null: none). */
  shapeIn(h: number): ShadowShape | null {
    return this.hands[h].shape;
  }

  /** A drawing came alive as this weapon, in hand `h`. */
  give(h: number, shape: ShadowShape): void {
    const arm = this.hands[h];
    this.disarm(arm);
    arm.shape = shape;
    arm.drawn = true;
    arm.idle = 0;
    arm.cooldown = 0.3;
    arm.model = model(shape);
    this.root.add(arm.model);
  }

  /** This hand is making (or holding) a shadow weapon: no drawing with it. */
  busy(h: number): boolean {
    const arm = this.hands[h];
    return arm.shape !== null || (arm.forming !== null && arm.formTime > 0.12);
  }

  /** Does a held sword or shield stand in the way of this point? */
  blocks(p: Vector3, radius = 0.02): boolean {
    for (const g of this.guards) {
      const ab = this.v.subVectors(g.b, g.a);
      const t = Math.max(0, Math.min(1, this.w.subVectors(p, g.a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
      if (this.w.copy(g.a).addScaledVector(ab, t).distanceTo(p) < g.r + radius) return true;
    }
    return false;
  }

  /**
   * Reads both hands. `toward`: the foe's chest (stage-local), so a punch
   * means moving that way. Calls `onForm` when a weapon appears, `onShot` when
   * one is let fly. Returns nothing; held weapons block through blocks().
   */
  update(
    dt: number,
    hands: readonly HandState[],
    toward: Vector3 | null,
    onForm: (h: number, shape: ShadowShape, at: Vector3) => void,
    onShot: (shot: ArmShot) => void,
  ): void {
    this.guards.length = 0;
    hands.forEach((hand, h) => {
      const arm = this.hands[h];
      if (!hand || !hand.tracked) {
        arm.seen = false;
        this.disarm(arm);
        return;
      }
      // The hand's own velocity, from its palm, in stage space.
      const palm = this.space.worldToLocal(new Vector3().copy(hand.palm));
      if (arm.seen && dt > 0) arm.vel.lerp(this.w.subVectors(palm, arm.prev).divideScalar(dt), Math.min(1, dt * 18));
      arm.prev.copy(palm);
      arm.seen = true;
      arm.cooldown = Math.max(0, arm.cooldown - dt);

      let now = classifyShape(hand);
      // An open hand is only a shield when its palm faces your foe (a relaxed hand does not count).
      if (now === 'palm' && toward) {
        const normal = this.space.worldToLocal(new Vector3().copy(hand.palm).add(hand.palmNormal)).sub(palm).normalize();
        if (normal.dot(this.w.subVectors(toward, palm).normalize()) < 0.55) now = null;
      }
      this.seen[h] = now;
      // Forming: the same shape held for a moment (a drawn weapon is kept until it is used).
      if (now && now !== arm.shape && !arm.drawn) {
        if (now === arm.forming) arm.formTime += dt;
        else {
          arm.forming = now;
          arm.formTime = 0;
        }
        if (arm.formTime >= FORM_TIME && arm.cooldown <= 0 && (!arm.shape || arm.lost > 0.15)) {
          this.disarm(arm);
          arm.shape = now;
          arm.idle = 0;
          arm.lost = 0;
          arm.model = model(now);
          this.root.add(arm.model);
          onForm(h, now, palm.clone());
        }
      } else if (!now) {
        arm.forming = null;
        arm.formTime = 0;
      }
      if (!arm.shape) return;
      arm.lost = now === arm.shape ? 0 : arm.lost + dt;
      arm.idle += dt;
      const spec = ARMS[arm.shape];
      // A held weapon lasts only while its shape does; a thrown one keeps through a blurry punch.
      if ((!arm.drawn && ((spec.held && arm.lost > 0.3) || arm.lost > 1.2)) || arm.idle > IDLE_LIMIT * (arm.drawn ? 2 : 1)) {
        this.disarm(arm);
        return;
      }
      this.pose(arm, hand, palm);

      // Let fly: a punch towards the foe, or (the sword) a fast swing.
      if (spec.held || arm.cooldown > 0) return;
      const speed = arm.vel.length();
      const along = toward ? this.w.subVectors(toward, palm).normalize().dot(arm.vel) : 0;
      const fire = arm.shape === 'blade' ? speed > SWING : along > PUNCH;
      if (!fire) return;
      onShot({ shape: arm.shape, from: palm.clone(), swing: arm.vel.clone() });
      arm.cooldown = COOLDOWN;
      arm.idle = 0;
      // The sword stays in hand; everything else is gone once thrown.
      if (arm.shape !== 'blade') this.disarm(arm);
    });
  }

  /** Puts a weapon in place on its hand, and notes what it guards. */
  private pose(arm: HandArm, hand: HandState, palm: Vector3): void {
    const model = arm.model;
    if (!model) return;
    const tip = this.space.worldToLocal(new Vector3().copy(hand.indexTip));
    const wrist = this.space.worldToLocal(new Vector3().copy(hand.wrist));
    const along = tip.clone().sub(wrist).normalize();
    model.position.copy(palm);
    if (arm.shape === 'blade') {
      // The blade runs on from the fingertips.
      model.position.copy(tip);
      model.quaternion.copy(this.q.setFromUnitVectors(this.up, along));
      this.guards.push({ a: tip.clone(), b: tip.clone().addScaledVector(along, 0.26), r: 0.02 });
    } else if (arm.shape === 'palm') {
      // The shield faces out of the palm, a hand's width in front of it.
      const normal = this.space.worldToLocal(new Vector3().copy(hand.palm).add(hand.palmNormal)).sub(palm).normalize();
      model.position.copy(palm).addScaledVector(normal, 0.04);
      model.quaternion.copy(this.q.setFromUnitVectors(new Vector3(0, 0, 1), normal));
      this.guards.push({ a: model.position.clone(), b: model.position.clone(), r: 0.1 });
    } else {
      model.position.copy(palm).addScaledVector(along, 0.03);
      model.quaternion.copy(this.q.setFromUnitVectors(this.up, along));
    }
    model.rotateY(0.02);
  }

  private disarm(arm: HandArm): void {
    if (arm.model) {
      arm.model.removeFromParent();
      arm.model.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
    arm.model = null;
    arm.shape = null;
    arm.lost = 0;
    arm.drawn = false;
  }

  dispose(): void {
    for (const arm of this.hands) this.disarm(arm);
    this.root.removeFromParent();
  }
}

const materials = new Map<number, MeshStandardMaterial>();
/** Shadow with a coloured glow: the weapons are made of it. */
export function shadowMaterial(color: number): MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color: new Color(0x1a1230), emissive: new Color(color), emissiveIntensity: 0.75, roughness: 0.5, metalness: 0.1, side: DoubleSide });
    materials.set(color, m);
  }
  return m;
}

/** The weapon that forms in the hand, pointing along +Y. */
function model(shape: ShadowShape): Group {
  const g = new Group();
  const m = shadowMaterial(ARMS[shape].color);
  const add = (mesh: Mesh, x = 0, y = 0, z = 0, rz = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    mesh.userData.keep = true;
    g.add(mesh);
    return mesh;
  };
  switch (shape) {
    case 'fist':
      add(new Mesh(new SphereGeometry(0.035, 20, 14), m), 0, 0.02);
      add(new Mesh(new TorusGeometry(0.045, 0.004, 8, 32), m), 0, 0.02);
      break;
    case 'blade':
      add(new Mesh(new BoxGeometry(0.016, 0.24, 0.004), m), 0, 0.13);
      add(new Mesh(new ConeGeometry(0.008, 0.03, 4), m), 0, 0.265);
      add(new Mesh(new BoxGeometry(0.06, 0.008, 0.01), m), 0, 0.01);
      break;
    case 'palm':
      add(new Mesh(new CircleGeometry(0.09, 32), shadowGlass(ARMS.palm.color)));
      add(new Mesh(new RingGeometry(0.085, 0.095, 40), m));
      break;
    case 'point':
      add(new Mesh(new CylinderGeometry(0.004, 0.004, 0.22, 8), m), 0, 0.08);
      add(new Mesh(new ConeGeometry(0.012, 0.045, 8), m), 0, 0.21);
      break;
    case 'vee':
      add(star(0.03), -0.025, 0.04);
      add(star(0.03), 0.025, 0.04);
      break;
    case 'three':
      for (const x of [-0.018, 0, 0.018]) add(new Mesh(new BoxGeometry(0.005, 0.09, 0.003), m), x, 0.06, 0, -x * 6);
      break;
    case 'horns': {
      const bolt = [[0, 0], [0.015, 0.04], [-0.01, 0.06], [0.01, 0.1]];
      for (let i = 1; i < bolt.length; i++) {
        const [x0, y0] = bolt[i - 1];
        const [x1, y1] = bolt[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        add(new Mesh(new BoxGeometry(0.008, len, 0.005), m), (x0 + x1) / 2, (y0 + y1) / 2 + 0.02, 0, -Math.atan2(x1 - x0, y1 - y0));
      }
      break;
    }
    case 'shaka':
      add(new Mesh(new BoxGeometry(0.012, 0.07, 0.004), m), -0.02, 0.04, 0, 0.6);
      add(new Mesh(new BoxGeometry(0.012, 0.07, 0.004), m), 0.02, 0.04, 0, -0.6);
      break;
    case 'ell':
      add(new Mesh(new ConeGeometry(0.018, 0.07, 10), m), 0, 0.05);
      add(new Mesh(new SphereGeometry(0.02, 12, 8), shadowMaterial(0xffc04a)), 0, 0.02);
      break;
    case 'thumb':
      add(new Mesh(new CylinderGeometry(0.005, 0.005, 0.12, 8), m), 0, 0.06);
      add(new Mesh(new BoxGeometry(0.07, 0.035, 0.035), m), 0, 0.13);
      break;
  }
  return g;
}

function star(r: number): Mesh {
  const geometry = new CylinderGeometry(r, r, 0.004, 4);
  geometry.rotateX(Math.PI / 2);
  return new Mesh(geometry, shadowMaterial(ARMS.vee.color));
}

function shadowGlass(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(0x10202a), emissive: new Color(color), emissiveIntensity: 0.35, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false });
}
