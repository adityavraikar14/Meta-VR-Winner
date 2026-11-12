import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { FONT } from '../ui-theme.js';

/**
 * A drawing that came alive.
 *
 * Close a shape in the air and it puffs up into a creature with your exact
 * outline: a soft body, googly eyes, stick arms and legs, and a name. What
 * it is depends on what you drew: a round loop is a bouncy Blob, a tall one
 * walks on Stilts, a wide one scuttles like a Crab, a jagged one is a
 * bad-tempered Spike. It drops to the ground, hops at the rival and
 * head-butts them.
 *
 * The motion is real: every hop is a ballistic arc (launch speed √(2gh)), a
 * landing squashes the body at constant volume (wider as it gets shorter),
 * and each pupil is a loose mass in its eye: it lies at the bottom under
 * gravity, floats in free fall and slams about when the body is thrown.
 */

export const DOODLE_G = 9.8;

export type DoodleKind = 'blob' | 'stilts' | 'crab' | 'spike' | 'doodle';
export type DoodleState = 'born' | 'air' | 'ground' | 'leap' | 'held' | 'thrown' | 'gone';
export type DoodleEvent = 'land' | 'hop' | 'leap' | 'bonk' | null;

const NAMES: Record<DoodleKind, string[]> = {
  blob: ['Big Steve', 'Sir Wobbles', 'Meatball', 'Gary', 'The Unit'],
  stilts: ['Long Gary', 'Tall Paul', 'Stretch', 'Lanky Frank', 'Beanpole'],
  crab: ['Crabsworth', 'Wide Load', 'Flat Stanley', 'Sideways Dave', 'Pancake'],
  spike: ['Mr. Pointy', 'Cactus Dave', 'Stabby', 'Spike Jr.', 'Angry Kevin'],
  doodle: ['Kevin', 'The Intern', 'Doug', 'Chaos Gremlin', 'Blorp', 'Unpaid Hero'],
};
const WHAT: Record<DoodleKind, string> = { blob: 'Blob', stilts: 'Stilts', crab: 'Crab', spike: 'Spike', doodle: 'Doodle' };
const PALETTE = [0xffd23a, 0x4ad6ff, 0xff6fae, 0x7be36a, 0xffa23a, 0xb48cff];
/** How far and how high each kind hops, metres. */
const HOPS: Record<DoodleKind, [number, number]> = {
  blob: [0.11, 0.1],
  stilts: [0.16, 0.045],
  crab: [0.07, 0.025],
  spike: [0.12, 0.06],
  doodle: [0.1, 0.06],
};

let used = 0;
let dark: MeshStandardMaterial | null = null;
let white: MeshStandardMaterial | null = null;
let black: MeshBasicMaterial | null = null;

function inks(): { dark: MeshStandardMaterial; white: MeshStandardMaterial; black: MeshBasicMaterial } {
  dark ??= new MeshStandardMaterial({ color: 0x1c1826, roughness: 0.5 });
  white ??= new MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0xffffff, emissiveIntensity: 0.25 });
  black ??= new MeshBasicMaterial({ color: 0x08060c });
  return { dark, white, black };
}

/** Is this stroke a closed shape (it ends where it began) big enough to live? */
export function isClosedLoop(points: readonly Vector3[]): boolean {
  if (points.length < 10) return false;
  let length = 0;
  const lo = points[0].clone();
  const hi = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    length += points[i].distanceTo(points[i - 1]);
    lo.min(points[i]);
    hi.max(points[i]);
  }
  const extent = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
  if (extent < 0.04 || length < 0.12) return false;
  return points[0].distanceTo(points[points.length - 1]) < Math.max(0.03, length * 0.16);
}

export interface DoodleWorld {
  /** Ground height under a point (group space). */
  ground(p: Vector3): number;
  /** The player's head (group space): the doodle shows them its face. */
  viewer: Vector3;
  /** Where the rival stands, and their head; null when there is no one to bonk. */
  target: Vector3 | null;
  head: Vector3 | null;
  /** How close to the rival before leaping at their head. */
  reach: number;
}

interface Eye {
  pupil: Mesh;
  centre: Vector2;
  offset: Vector2;
  speed: Vector2;
}

export class Doodle {
  readonly root = new Group();
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly kind: DoodleKind;
  readonly name: string;
  /** Half its largest side, metres: how close ink must come to hit it. */
  readonly radius: number;
  /** Kilograms: the area you enclosed, as a 3 cm slab of soft ink. */
  readonly mass: number;
  readonly color: number;
  state: DoodleState = 'born';
  /** Head-butts landed so far. */
  bonks = 0;
  /** The hand holding it (-1: none). */
  hand = -1;
  /** The rival has seen this throw coming (reset on each throw). */
  seen = false;

  private readonly rig = new Group();
  private readonly body = new Group();
  private readonly legs: Group[] = [];
  private readonly arms: Group[] = [];
  private readonly eyes: Eye[] = [];
  private readonly mouth: Mesh;
  private readonly tag: Mesh;
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly foot: number;
  private readonly limit: number;
  private readonly pupilZ: number;
  private readonly prevVel = new Vector3();
  private readonly accel = new Vector3();
  private readonly v = new Vector3();
  private time = 0;
  private stateTime = 0;
  private rest = 0;
  private squash = 0;
  private squashSpeed = 0;
  private phase = Math.random() * 6;
  private armUp = 0;
  private open = 0.3;
  private leapFor = 0;
  /** Where the head was when it leapt: if the head is still there when it arrives, it lands. */
  private readonly leapAim = new Vector3();

  /**
   * `points` are the stroke, relative to `at` (group space); `viewer` is the
   * player's head, so the creature keeps the outline exactly as they drew it.
   */
  constructor(points: readonly Vector3[], at: Vector3, viewer: Vector3) {
    const { dark: darkInk, white: whiteInk, black: blackInk } = inks();
    this.root.name = 'Doodle';
    this.pos.copy(at);

    // The outline as the player saw it: across (their right) and up.
    const f = this.v.copy(viewer).sub(at).setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    const rx = f.z;
    const rz = -f.x;
    let outline: Vector2[] = [];
    for (const p of points) {
      const q = new Vector2(p.x * rx + p.z * rz, p.y);
      if (outline.length === 0 || q.distanceTo(outline[outline.length - 1]) > 0.004) outline.push(q);
    }
    if (outline.length > 3 && outline[0].distanceTo(outline[outline.length - 1]) < 0.01) outline.pop();
    const lo = outline[0].clone();
    const hi = outline[0].clone();
    for (const q of outline) {
      lo.min(q);
      hi.max(q);
    }
    // Keep it a handy size: 7 to 16 cm across.
    const extent = Math.max(hi.x - lo.x, hi.y - lo.y, 1e-4);
    const k = Math.min(0.16, Math.max(0.07, extent)) / extent;
    const cx = (lo.x + hi.x) / 2;
    const cy = (lo.y + hi.y) / 2;
    outline = outline.map((q) => new Vector2((q.x - cx) * k, (q.y - cy) * k));
    const w = Math.max(0.02, (hi.x - lo.x) * k);
    const h = Math.max(0.02, (hi.y - lo.y) * k);
    this.radius = Math.max(w, h) / 2;

    // What did they draw? Roundness 4πA/P² is 1 for a circle; corners are sharp turns.
    let area = 0;
    let perimeter = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      area += a.x * b.y - b.x * a.y;
      perimeter += a.distanceTo(b);
    }
    area = Math.abs(area) / 2;
    const roundness = (4 * Math.PI * area) / Math.max(1e-6, perimeter * perimeter);
    const corners = countCorners(outline, perimeter / 26);
    const aspect = h / w;
    this.kind =
      corners >= 4 && roundness < 0.62 ? 'spike' : aspect > 1.5 ? 'stilts' : aspect < 0.62 ? 'crab' : roundness > 0.78 ? 'blob' : 'doodle';
    this.mass = Math.max(0.03, area * 9);
    const names = NAMES[this.kind];
    this.name = names[(used + Math.floor(Math.random() * 2)) % names.length];
    this.color = PALETTE[used % PALETTE.length];
    used++;

    // The body: the outline, extruded and bevelled into a soft slab.
    const bevel = Math.min(0.012, Math.max(0.004, Math.min(w, h) * 0.1));
    const depth = 0.014;
    const shape = new Shape(outline);
    const slab = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, steps: 1, curveSegments: 2 });
    slab.translate(0, 0, -depth / 2);
    const fill = new MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.3, roughness: 0.35 });
    const skin = new Mesh(slab, fill);
    skin.castShadow = true;
    this.owned.push(slab, fill);
    this.body.add(skin);
    const front = depth / 2 + bevel;
    // The line they drew, kept as a dark marker outline.
    const line = new TubeGeometry(new CatmullRomCurve3(outline.map((q) => new Vector3(q.x, q.y, front * 0.6)), true), Math.min(160, outline.length * 2), 0.003, 5, true);
    this.owned.push(line);
    this.body.add(new Mesh(line, darkInk));

    // Googly eyes: a white disc and a loose pupil each.
    const eyeR = Math.min(0.017, Math.max(0.008, Math.min(w, h) * 0.15));
    const pupilR = eyeR * 0.5;
    this.limit = eyeR - pupilR;
    this.pupilZ = front + eyeR * 0.45;
    const eyeGeo = new SphereGeometry(eyeR, 14, 10);
    const pupilGeo = new SphereGeometry(pupilR, 10, 8);
    this.owned.push(eyeGeo, pupilGeo);
    const eyeY = h * (this.kind === 'crab' ? 0.12 : 0.18);
    const eyeX = Math.max(eyeR * 1.15, w * 0.17);
    for (const side of [-1, 1]) {
      const white = new Mesh(eyeGeo, whiteInk);
      white.scale.z = 0.45;
      white.position.set(side * eyeX, eyeY, front);
      const pupil = new Mesh(pupilGeo, blackInk);
      pupil.scale.z = 0.4;
      this.body.add(white, pupil);
      this.eyes.push({ pupil, centre: new Vector2(side * eyeX, eyeY), offset: new Vector2(0, -this.limit), speed: new Vector2() });
      if (this.kind === 'spike') {
        // Bad-tempered brows.
        const browGeo = new BoxGeometry(eyeR * 2.1, eyeR * 0.42, 0.003);
        this.owned.push(browGeo);
        const brow = new Mesh(browGeo, darkInk);
        brow.position.set(side * eyeX, eyeY + eyeR * 1.15, front + eyeR * 0.5);
        brow.rotation.z = -side * 0.45;
        this.body.add(brow);
      }
    }
    const mouthGeo = new SphereGeometry(Math.max(0.005, w * 0.09), 12, 8);
    this.owned.push(mouthGeo);
    this.mouth = new Mesh(mouthGeo, blackInk);
    this.mouth.position.set(0, eyeY - eyeR * 2.1, front);
    this.mouth.scale.set(1.3, 0.3, 0.3);
    this.body.add(this.mouth);

    // Stick legs and arms, each hanging from a pivot.
    const legLength = Math.min(0.07, Math.max(0.018, h * (this.kind === 'stilts' ? 0.6 : 0.28)));
    const limbGeo = new CylinderGeometry(0.0028, 0.0028, 1, 6).translate(0, -0.5, 0);
    const footGeo = new SphereGeometry(0.007, 8, 6);
    this.owned.push(limbGeo, footGeo);
    const limb = (length: number, x: number, y: number): Group => {
      const pivot = new Group();
      pivot.position.set(x, y, 0);
      const stick = new Mesh(limbGeo, darkInk);
      stick.scale.y = length;
      const end = new Mesh(footGeo, darkInk);
      end.position.y = -length;
      end.scale.set(1.3, 0.7, 1.6);
      pivot.add(stick, end);
      return pivot;
    };
    const legSpread = Math.max(0.012, w * (this.kind === 'crab' ? 0.3 : 0.18));
    for (const side of [-1, 1]) {
      const hip = bottomAt(outline, side * legSpread);
      const leg = limb(legLength + 0.006, side * legSpread, hip + 0.006);
      this.legs.push(leg);
      this.body.add(leg);
      const shoulder = edgeAt(outline, 0, side);
      const arm = limb(Math.min(0.05, Math.max(0.02, h * 0.3)), shoulder * 0.94, 0);
      this.arms.push(arm);
      this.body.add(arm);
    }
    this.foot = h / 2 + legLength;
    // Squash about the feet: the rig's origin is on the ground.
    this.rig.position.y = -this.foot;
    this.body.position.y = this.foot;
    this.rig.add(this.body);
    this.root.add(this.rig);

    // A name tag over its head.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.font = `800 34px ${FONT}`;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(22,18,28,0.9)';
    g.strokeText(this.name, 128, 34);
    g.fillStyle = '#ffffff';
    g.fillText(this.name, 128, 34);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const tagGeo = new PlaneGeometry(0.11, 0.0275);
    const tagMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    this.owned.push(texture, tagGeo, tagMaterial);
    this.tag = new Mesh(tagGeo, tagMaterial);
    this.tag.position.y = h / 2 + 0.03;
    this.tag.renderOrder = 9;
    this.root.add(this.tag);

    this.root.traverse((o) => {
      o.userData.keep = true;
      (o as Mesh).frustumCulled = false;
    });
    this.root.position.copy(this.pos);
    this.root.scale.setScalar(0.01);
    this.face(viewer, 1);
  }

  /** "Blob", "Spike"… for the caption. */
  get what(): string {
    return WHAT[this.kind];
  }

  /** On the ground or hopping about: fair game for the rival's ink, and for your pinch. */
  get loose(): boolean {
    return this.state === 'air' || this.state === 'ground' || this.state === 'born';
  }

  /** Picked up: it follows the pinch and flails. */
  hold(hand: number): void {
    this.state = 'held';
    this.hand = hand;
    this.stateTime = 0;
  }

  /** While held: where the pinch is (group space). */
  carry(p: Vector3, dt: number): void {
    this.vel.copy(p).sub(this.pos).divideScalar(Math.max(dt, 1e-3));
    this.pos.copy(p);
  }

  /** Let go: thrown if `velocity` is fast enough, else it just drops. */
  release(velocity: Vector3 | null): void {
    this.hand = -1;
    this.seen = false;
    this.stateTime = 0;
    if (velocity && velocity.length() > 0.5) {
      this.vel.copy(velocity);
      this.state = 'thrown';
    } else {
      this.vel.set(0, 0, 0);
      this.state = 'air';
    }
    this.prevVel.copy(this.vel);
  }

  /** Bounce off whatever it just hit, away from `from`. */
  bounce(from: Vector3, speed = 0.35): void {
    this.v.copy(this.pos).sub(from).setY(0);
    if (this.v.lengthSq() < 1e-6) this.v.set(0, 0, 1);
    this.v.normalize();
    this.vel.set(this.v.x * speed + (Math.random() - 0.5) * 0.2, 1.2, this.v.z * speed + (Math.random() - 0.5) * 0.2);
    this.state = 'air';
    this.stateTime = 0;
    this.squash = 0.3;
  }

  update(dt: number, world: DoodleWorld): DoodleEvent {
    if (this.state === 'gone') return null;
    let event: DoodleEvent = null;
    this.time += dt;
    this.stateTime += dt;
    switch (this.state) {
      case 'born': {
        // It puffs up where it was drawn, wobbling, then drops.
        const t = Math.min(1, this.stateTime / 0.45);
        const pop = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
        this.root.scale.setScalar(Math.max(0.01, pop));
        if (t >= 1) {
          this.root.scale.setScalar(1);
          this.state = 'air';
          this.stateTime = 0;
        }
        break;
      }
      case 'air':
      case 'thrown': {
        this.vel.y -= DOODLE_G * dt;
        this.pos.addScaledVector(this.vel, dt);
        const ground = world.ground(this.pos) + this.foot;
        if (this.pos.y <= ground && this.vel.y < 0) {
          const impact = -this.vel.y;
          this.pos.y = ground;
          this.vel.set(0, 0, 0);
          // Landing squashes it; the squash springs back.
          this.squash = Math.min(0.5, impact * 0.2);
          this.squashSpeed = 0;
          this.state = 'ground';
          this.stateTime = 0;
          this.rest = 0.2 + Math.random() * 0.2;
          event = 'land';
        }
        break;
      }
      case 'ground': {
        this.rest -= dt;
        if (this.rest > 0) break;
        const [far, high] = HOPS[this.kind];
        if (!world.target) {
          // No one to fight: a happy hop on the spot.
          this.vel.set(0, Math.sqrt(2 * DOODLE_G * high * 0.6), 0);
          this.state = 'air';
          this.rest = 0;
          event = 'hop';
          break;
        }
        const to = this.v.copy(world.target).sub(this.pos).setY(0);
        const distance = to.length();
        if (distance > world.reach + 0.02 || !world.head) {
          // A hop: up at √(2gh), across at the speed that covers the distance in the flight time.
          const length = Math.min(Math.max(0.02, distance - world.reach), far);
          const up = Math.sqrt(2 * DOODLE_G * high);
          const flight = (2 * up) / DOODLE_G;
          to.normalize().multiplyScalar(length / flight);
          this.vel.set(to.x, up, to.z);
          this.state = 'air';
          event = 'hop';
        } else {
          // In reach: leap at their head, timed to arrive in a third of a second.
          const T = 0.34;
          this.vel.copy(world.head).sub(this.pos).divideScalar(T);
          this.vel.y += 0.5 * DOODLE_G * T;
          this.leapFor = T;
          this.leapAim.copy(world.head);
          this.state = 'leap';
          event = 'leap';
        }
        this.stateTime = 0;
        break;
      }
      case 'leap': {
        this.vel.y -= DOODLE_G * dt;
        this.pos.addScaledVector(this.vel, dt);
        const near = world.head ? this.pos.distanceTo(world.head) < 0.04 + this.radius * 0.5 : false;
        const arrived = this.stateTime >= this.leapFor;
        if (near || arrived) {
          // It lands if it is on the head, or if the leap is over and the head has not moved away
          // (so a slow frame cannot make it miss a rival who stood still).
          const still = arrived && world.head !== null && world.head.distanceTo(this.leapAim) < 0.12;
          if (world.head && (still || this.pos.distanceTo(world.head) < 0.16)) {
            if (still) this.pos.copy(world.head);
            this.bonks++;
            event = 'bonk';
            this.bounce(world.target ?? world.head, 0.3);
          } else {
            // They moved: it sails past and tries again.
            this.state = 'air';
            this.stateTime = 0;
          }
        }
        break;
      }
      case 'held':
        break;
    }

    // The body's acceleration this frame, for the eyes.
    this.accel.copy(this.vel).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
    this.prevVel.copy(this.vel);
    this.pose(dt, world.viewer);
    return event;
  }

  private face(viewer: Vector3, k: number): void {
    const want = Math.atan2(viewer.x - this.pos.x, viewer.z - this.pos.z);
    let delta = want - this.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.root.rotation.y += delta * k;
  }

  private pose(dt: number, viewer: Vector3): void {
    this.root.position.copy(this.pos);
    this.face(viewer, Math.min(1, dt * 8));
    const flying = this.state === 'air' || this.state === 'leap' || this.state === 'thrown';
    const held = this.state === 'held';

    // Squash and stretch at constant volume: a damped spring back to round, stretched by speed in the air.
    const want = flying ? -Math.min(0.28, Math.abs(this.vel.y) * 0.09) : this.state === 'ground' ? 0.12 * Math.max(0, 1 - this.rest / 0.2) : 0;
    this.squashSpeed += ((want - this.squash) * 260 - this.squashSpeed * 16) * dt;
    this.squash += this.squashSpeed * dt;
    const sy = Math.min(1.4, Math.max(0.5, 1 - this.squash));
    const sxz = 1 / Math.sqrt(sy);
    this.rig.scale.set(sxz, sy, sxz);

    // Waddle, limbs and mouth.
    this.phase += dt * (held ? 26 : flying ? 14 : 5);
    const swing = Math.sin(this.phase);
    this.body.rotation.z = swing * (held ? 0.22 : flying ? 0.14 : 0.05);
    this.legs.forEach((leg, i) => {
      const side = i === 0 ? -1 : 1;
      leg.rotation.z = held || flying ? side * 0.35 + swing * side * (held ? 0.9 : 0.5) * (i === 0 ? 1 : -1) : side * 0.12;
      leg.rotation.x = held || flying ? Math.cos(this.phase + i * Math.PI) * 0.5 : 0;
    });
    this.armUp += ((flying || held ? 1 : 0) - this.armUp) * Math.min(1, dt * 12);
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.rotation.z = side * (0.5 + 2.1 * this.armUp) + (held ? swing * 0.6 : flying ? swing * 0.25 : 0);
    });
    this.open += ((held || this.state === 'thrown' || this.state === 'leap' ? 1 : flying ? 0.7 : 0.3) - this.open) * Math.min(1, dt * 10);
    this.mouth.scale.set(1.3 - 0.4 * this.open, 0.3 + 0.9 * this.open, 0.3);

    // Googly eyes. Each pupil is a loose mass: in the body's frame it feels
    // gravity minus the body's own acceleration, so it floats in free fall
    // and slams down on landing. It bounces off the rim of the eye.
    const yaw = this.root.rotation.y;
    const ax = -(this.accel.x * Math.cos(yaw) - this.accel.z * Math.sin(yaw));
    const ay = -DOODLE_G - this.accel.y;
    const steps = 3;
    const h = Math.min(dt, 0.05) / steps;
    for (const eye of this.eyes) {
      for (let s = 0; s < steps; s++) {
        eye.speed.x += ax * h;
        eye.speed.y += ay * h;
        eye.speed.multiplyScalar(Math.exp(-9 * h));
        eye.offset.addScaledVector(eye.speed, h);
        const r = eye.offset.length();
        if (r > this.limit) {
          // Hit the rim: back inside, and the outward speed is reflected, losing most of it.
          const nx = eye.offset.x / r;
          const ny = eye.offset.y / r;
          eye.offset.set(nx * this.limit, ny * this.limit);
          const out = eye.speed.x * nx + eye.speed.y * ny;
          if (out > 0) {
            eye.speed.x -= 1.35 * out * nx;
            eye.speed.y -= 1.35 * out * ny;
          }
        }
      }
      eye.pupil.position.set(eye.centre.x + eye.offset.x, eye.centre.y + eye.offset.y, this.pupilZ);
    }
  }

  dispose(): void {
    this.state = 'gone';
    this.root.removeFromParent();
    for (const thing of this.owned) thing.dispose();
  }
}

/** Sharp turns (over 55°) along a closed outline, sampled every `step` metres. */
function countCorners(outline: Vector2[], step: number): number {
  const samples: Vector2[] = [];
  let carried = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const length = a.distanceTo(b);
    let at = step - carried;
    while (at <= length) {
      samples.push(a.clone().lerp(b, at / length));
      at += step;
    }
    carried = (carried + length) % step;
  }
  let corners = 0;
  const n = samples.length;
  for (let i = 0; i < n && n >= 6; i++) {
    const p = samples[(i + n - 1) % n];
    const q = samples[i];
    const r = samples[(i + 1) % n];
    const a1 = Math.atan2(q.y - p.y, q.x - p.x);
    const a2 = Math.atan2(r.y - q.y, r.x - q.x);
    const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    if (turn > 0.96) corners++;
  }
  return corners;
}

/** The lowest point of the outline near a given x: where a leg joins. */
function bottomAt(outline: Vector2[], x: number): number {
  let best = Infinity;
  let lowest = Infinity;
  for (const q of outline) {
    lowest = Math.min(lowest, q.y);
    if (Math.abs(q.x - x) < 0.012) best = Math.min(best, q.y);
  }
  return Number.isFinite(best) ? best : lowest;
}

/** The outline's furthest point to one side near a given y: where an arm joins. */
function edgeAt(outline: Vector2[], y: number, side: number): number {
  let best = 0;
  let any = 0;
  for (const q of outline) {
    if (q.x * side > any * side) any = q.x;
    if (Math.abs(q.y - y) < 0.015 && q.x * side > best * side) best = q.x;
  }
  return best !== 0 ? best : any;
}
