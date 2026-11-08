import { Group, type Mesh, type MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { type Anchor, Arsenal } from '../../arsenal.js';
import {
  ARMED_WINDOW,
  classify,
  type GestureEvent,
  GestureRecognizer,
  ITEMS,
  type Item,
  type Reading,
  SIGN_LABELS,
} from '../../gestures.js';
import { HandState, JOINT_COUNT, type Side, SIDES } from '../../hands.js';
import type { Foe, RayHit } from '../../opponent.js';
import { rayToSphere } from '../../orbs.js';
import { sfx } from '../../sfx.js';
import { Bursts, Label, makeRing, setRing } from '../../visuals.js';
import { devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';

/**
 * The Arsenal's way of fighting, in Story mode's Shadow Dragon battle: hold
 * an invisible ball to arm, then sign for a sword, spear, power ball, wall,
 * blaster, shield or slingshot (src/yash/gestures.ts and arsenal.ts, used
 * as they are). Hands come from stage.joints, so headset, emulator and
 * webcam hands all work; everything runs in the battle group's own space.
 */

/** What the battle lets the Arsenal reach: the dragon's weak points and its fire. */
export interface DragonTarget {
  /** Head, then heart, in the battle group's space. */
  weakPoints(): Vector3[];
  /** The body's reach around the heart. */
  bodyRadius(): number;
  readonly fighting: boolean;
  /** A blow landed; `weak` when it struck the head or heart. */
  hit(amount: number, at: Vector3, weak: boolean): void;
  /** Fireballs in flight, for cutting and aiming. */
  fire(): readonly { pos: Vector3 }[];
  /** Puts out fireballs touching the sphere; returns how many. */
  cutFire(point: Vector3, radius: number): number;
}

const HEAD_RADIUS = 0.09;
const HEART_RADIUS = 0.1;
const FIRE_RADIUS = 0.04;
/** Body blows (not the head or heart) count this much. */
const BODY_SHARE = 0.5;
/** A hand briefly lost keeps holding its item this long. */
const KEEP_THROUGH_LOSS = 0.5;
/** The sign menu floats this far ahead of the eyes and below them. */
const ICON_DISTANCE = 0.55;
const ICON_DROP = 0.12;
const ICON_GAP = 0.15;
const ICON_ROW_GAP = 0.06;
const ICONS_PER_ROW = 4;

export class ArsenalPlayer implements Foe {
  readonly root = new Group();
  readonly arsenal: Arsenal;
  readonly recognizer = new GestureRecognizer();
  readonly hands: Record<Side, HandState> = { left: new HandState('left'), right: new HandState('right') };
  readonly center = new Vector3();

  private bursts: Bursts;
  private reading: Reading = { sign: 'none', hand: null };
  private events: GestureEvent[] = [];
  private head = new Vector3();
  private forward = new Vector3(0, 0, -1);
  private right = new Vector3(1, 0, 0);
  private facing = new Quaternion();
  private ring: Mesh;
  private ringMaterial: MeshBasicMaterial;
  private armedLabel = new Label(0.04);
  private icons = {} as Record<Item, Label>;
  private v = new Vector3();

  constructor(
    parent: Group,
    private target: DragonTarget,
  ) {
    this.root.name = 'ArsenalPlayer';
    parent.add(this.root);
    this.bursts = new Bursts(this.root);
    this.arsenal = new Arsenal(this.root, this.bursts, this, this.anchorOf);
    this.ring = makeRing(0.07, 0x9fe8ff);
    this.ringMaterial = this.ring.material as MeshBasicMaterial;
    this.ring.visible = false;
    this.armedLabel.set('Armed! Make a sign:', '#bff0ff');
    this.armedLabel.sprite.visible = false;
    this.root.add(this.ring, this.armedLabel.sprite);
    for (const item of ITEMS) {
      const label = new Label(0.04);
      label.set(SIGN_LABELS[item]);
      label.sprite.visible = false;
      this.icons[item] = label;
      this.root.add(label.sprite);
    }
    sfx.unlock();
    devInfo.arsenal = () => {
      const round = (p: Vector3) => p.toArray().map((n) => Number(n.toFixed(2)));
      const [head, heart] = this.target.weakPoints();
      const held = this.arsenal.held;
      const tip = held ? round(this.root.worldToLocal(held.object.getWorldPosition(new Vector3()))) : null;
      return { eyes: round(this.head), head: round(head), heart: round(heart), held: held?.item ?? null, grip: tip };
    };
    // How close the blade (tip and middle) comes to the head and heart, for tuning reach.
    devInfo.arsenalTip = () => {
      const blade = this.arsenal as unknown as { tip: Vector3; mid: Vector3 };
      const [head, heart] = this.target.weakPoints();
      const near = (p: Vector3) => Math.min(blade.tip.distanceTo(p), blade.mid.distanceTo(p));
      return { dHead: near(head), dHeart: near(heart), tipY: blade.tip.y, tipZ: blade.tip.z };
    };
  }

  get alive(): boolean {
    return this.target.fighting;
  }

  get armed(): boolean {
    return this.recognizer.phase === 'armed';
  }

  /** `head` and `forward` (level, towards the dragon) are in the battle group's space. */
  update(dt: number, time: number, head: Vector3, forward: Vector3, group: Group): void {
    this.head.copy(head);
    this.forward.copy(forward);
    this.right.set(-forward.z, 0, forward.x);
    this.facing.setFromUnitVectors(this.v.set(0, 0, 1), this.v.copy(forward).negate());
    this.center.copy(this.target.weakPoints()[1]);
    this.readHands(dt, time, group);

    const anyHand = this.hands.left.tracked || this.hands.right.tracked;
    if (anyHand && this.target.fighting) {
      classify(this.hands.left, this.hands.right, this.forward, this.reading, this.recognizer.candidate);
      this.recognizer.update(dt, this.reading, this.events);
    }
    for (const event of this.events) {
      if (event.type === 'armed') {
        sfx.armed();
        this.bursts.spawn(this.ring.position, 0x9fe8ff, 0.25);
      } else if (event.type === 'fizzle') {
        sfx.fizzle();
      } else {
        this.arsenal.summon(event.item, event.hand, this.head, this.forward);
      }
    }
    this.events.length = 0;
    this.arsenal.update(dt, this.forward, this.head);
    this.bursts.update(dt);
    this.drawHud();
  }

  /** Drops every weapon and forgets any half-made sign. */
  reset(): void {
    this.arsenal.clear();
    this.recognizer.reset();
  }

  /** True if a shield or the wall took a fireball at `point`. */
  absorb(point: Vector3, radius: number): boolean {
    return this.arsenal.absorb(point, radius);
  }

  /** A shield worn or a wall standing blocks the dragon's bite. */
  get guarded(): boolean {
    return this.arsenal.shield !== null || this.arsenal.wallLeft > 0;
  }

  /** Short name of what the hands hold, for the caption and the dev readout. */
  get holding(): string {
    const items: string[] = [];
    if (this.arsenal.held) items.push(this.arsenal.held.item);
    if (this.arsenal.shield) items.push('shield');
    if (this.arsenal.wallLeft > 0) items.push('wall');
    return items.join('+') || '-';
  }

  // ---------------------------------------------------------------- Foe

  touches(point: Vector3, radius: number): boolean {
    const [head, heart] = this.target.weakPoints();
    return (
      point.distanceTo(head) < HEAD_RADIUS + radius ||
      point.distanceTo(heart) < Math.max(HEART_RADIUS, this.target.bodyRadius()) + radius
    );
  }

  damage(amount: number, at: Vector3): void {
    const [head, heart] = this.target.weakPoints();
    const weak = at.distanceTo(head) < HEAD_RADIUS + 0.05 || at.distanceTo(heart) < HEART_RADIUS + 0.05;
    this.target.hit(weak ? amount : amount * BODY_SHARE, at, weak);
  }

  cutOrbs(point: Vector3, radius: number): number {
    return this.target.cutFire(point, radius);
  }

  raycast(origin: Vector3, direction: Vector3, assist: number): RayHit | null {
    let best: RayHit | null = null;
    const consider = (center: Vector3, radius: number, orb: boolean) => {
      const d = rayToSphere(origin, direction, center, radius, assist);
      if (d >= 0 && (!best || d < best.distance)) best = { distance: d, point: center.clone(), orb };
    };
    const [head, heart] = this.target.weakPoints();
    consider(head, HEAD_RADIUS, false);
    consider(heart, Math.max(HEART_RADIUS, this.target.bodyRadius()), false);
    for (const f of this.target.fire()) consider(f.pos, FIRE_RADIUS, true);
    return best;
  }

  // -------------------------------------------------------------- Hands

  private readHands(dt: number, time: number, group: Group): void {
    group.updateWorldMatrix(true, false);
    SIDES.forEach((side, i) => {
      const hand = this.hands[side];
      if (!stage.tracked[i]) {
        hand.lose(dt);
        return;
      }
      // stage.joints are in the player's space, which the shadow game treats as the world.
      const src = stage.joints[i];
      for (let j = 0; j < JOINT_COUNT; j++) {
        group.worldToLocal(this.v.set(src[j * 3], src[j * 3 + 1], src[j * 3 + 2]));
        hand.joints[j * 3] = this.v.x;
        hand.joints[j * 3 + 1] = this.v.y;
        hand.joints[j * 3 + 2] = this.v.z;
      }
      hand.tracked = true;
      hand.lostFor = 0;
      hand.update(time);
    });
  }

  /** Where a side's hand is: the tracked (or just lost) hand, else a spot by the chest. */
  private anchorOf = (side: Side, out: Anchor): Anchor => {
    const hand = this.hands[side];
    out.hand = null;
    out.recent = null;
    if (hand.tracked || hand.lostFor < KEEP_THROUGH_LOSS) {
      out.position.copy(hand.palm);
      out.pointing.copy(hand.pointing);
      if (hand.tracked) out.hand = hand;
      else out.recent = hand;
      return out;
    }
    const sign = side === 'right' ? 1 : -1;
    out.position.copy(this.head).addScaledVector(this.forward, 0.4).addScaledVector(this.right, 0.18 * sign);
    out.position.y -= 0.3;
    out.pointing.copy(this.forward).setY(0.8).normalize();
    return out;
  };

  // ---------------------------------------------------------------- HUD

  /** The arming ring at the palms, and the sign menu while armed (as in the Arsenal). */
  private drawHud(): void {
    const r = this.recognizer;
    const armed = r.phase === 'armed';
    const { left, right } = this.hands;
    if (left.tracked && right.tracked) this.ring.position.copy(left.palm).lerp(right.palm, 0.5);
    else if (right.tracked) this.ring.position.copy(right.palm);
    else if (left.tracked) this.ring.position.copy(left.palm);
    else this.ring.position.copy(this.head).addScaledVector(this.forward, 0.4).setY(this.head.y - 0.25);
    this.ring.quaternion.copy(this.facing);
    if (!armed && r.progress > 0) {
      this.ring.visible = true;
      this.ringMaterial.color.setHex(0x9fe8ff);
      setRing(this.ring, r.progress);
    } else if (armed) {
      this.ring.visible = true;
      const summoning = r.progress > 0;
      this.ringMaterial.color.setHex(summoning ? 0xffd27a : 0x5a8cc8);
      setRing(this.ring, summoning ? r.progress : r.armedLeft / ARMED_WINDOW);
    } else {
      this.ring.visible = false;
    }

    const center = this.v.copy(this.head).addScaledVector(this.forward, ICON_DISTANCE);
    center.y = this.head.y - ICON_DROP;
    this.armedLabel.sprite.visible = armed;
    this.armedLabel.sprite.position.copy(center).setY(center.y + 0.065);
    ITEMS.forEach((item, i) => {
      const icon = this.icons[item];
      icon.sprite.visible = armed;
      const row = i < ICONS_PER_ROW ? 0 : 1;
      const inRow = row === 0 ? Math.min(ITEMS.length, ICONS_PER_ROW) : ITEMS.length - ICONS_PER_ROW;
      const col = row === 0 ? i : i - ICONS_PER_ROW;
      icon.sprite.position.copy(center).addScaledVector(this.right, (col - (inRow - 1) / 2) * ICON_GAP);
      icon.sprite.position.y -= row * ICON_ROW_GAP;
      const active = armed && r.candidate === item;
      icon.sprite.material.opacity = active ? 1 : 0.75;
      icon.resize(active ? 0.045 : 0.034);
    });
  }
}
