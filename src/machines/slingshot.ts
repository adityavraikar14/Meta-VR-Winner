import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { playAwaken, playClunk, playSplat, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { makeSlingshot, SLING_TIP_SPREAD, SLING_TIP_UP, type SlingRig } from '../yash/visuals.js';
import { hardwood } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * Rook's Ink Jars: a shadow that comes alive as a slingshot in your hand
 * (the Arena's slingshot), and five jars of Morwen's ink on Captain Rook's
 * fence to knock off before the ink reaches the river.
 *
 *   1. Make a V with index and middle fingers: its shadow on the screen is a
 *      slingshot's fork. Hold it, and the slingshot is in that hand.
 *   2. With your other hand, pinch the pouch and pull it back towards you.
 *      Dots show the stone's path, and a round sight (always facing you)
 *      shows where it will land: green on a jar, red when it would miss.
 *   3. Let go. A jar that is hit tumbles off the fence and bursts.
 *
 * The stone flies on a real arc: the band's launch speed grows with the
 * pull (v = ω·x), then gravity.
 */

/** The V must be held this long to bring the slingshot to life. */
const SHAPE_HOLD = 0.6;
/** Launch speed per metre of pull (the band's ω), and the pull's limits. */
const OMEGA = 16;
const MAX_PULL = 0.22;
const MIN_PULL = 0.03;
const GRAVITY = 9.8;
const STONE_R = 0.009;
/** A pinch this close to the pouch takes it. */
const GRAB_REACH = 0.09;
/** The slingshot leaves your hand if it is out of sight this long. */
const LOST_DROP = 1.2;
const RELOAD = 0.4;
const PATH_DOTS = 18;
const PATH_STEP = 0.03;
/** A jar's size, and how close a stone must pass to knock it. */
const JAR_R = 0.024;
const JAR_H = 0.06;
const HIT_R = 0.036;

/**
 * The jars, stage-local: on the fence's top rail and on two crates, near and far. The fence
 * stands mid-table, low, so the screen's card never hides it from your seat.
 */
const FENCE_X = [-0.34, -0.17, 0, 0.17, 0.34];
const fenceZ = (x: number) => -0.17 - (0.34 - Math.abs(x)) * 0.35;
const RAIL = 0.095;
const JARS: Array<[number, number, number]> = [
  [-0.26, RAIL + 0.006, fenceZ(-0.26)],
  [-0.1, RAIL + 0.006, fenceZ(-0.1)],
  [0.02, 0.15, -0.36],
  [0.13, RAIL + 0.006, fenceZ(0.13)],
  [0.3, 0.12, -0.2],
];

interface Jar {
  root: Group;
  /** Centre (where a stone must pass), stage-local. */
  at: Vector3;
  hit: boolean;
  time: number;
  /** Knocked off: its flight and spin. */
  vel: Vector3;
  spin: Vector3;
  halo: Mesh;
}

export class ShadowSlingshot {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private phase: 'shape' | 'aim' | 'won' = 'shape';
  private phaseTime = 0;
  private shapeTime = 0;
  private holdHand = -1;
  private lostFor = 0;
  private puller = -1;
  private reload = 0;
  private readonly rig: SlingRig;
  private readonly fork = new Vector3();
  private readonly tipA = new Vector3();
  private readonly tipB = new Vector3();
  private readonly pouch = new Vector3();
  private readonly stoneMesh: Mesh;
  private readonly flight = new Vector3();
  private flying = false;
  private flightTime = 0;
  private readonly path: Mesh[] = [];
  private readonly pathMaterial: MeshBasicMaterial;
  /** The sight: a ring and a dot, always turned to face you. */
  private readonly sight = new Group();
  private readonly sightMaterial: MeshBasicMaterial;
  private readonly jars: Jar[] = [];
  private readonly sparks = new ParticlePool({ count: 120, additive: false, soft: false });
  private shots = 0;
  private hits = 0;
  private note = '';
  private noteTime = 0;
  private finishIn = -1;
  private readonly eye = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  private readonly back = new Vector3();
  private readonly basis = new Matrix4();
  private readonly sim = new Vector3();
  private readonly simV = new Vector3();

  constructor(private readonly floor: number) {
    this.group.name = 'ShadowSlingshot';
    const f = floor;

    // The Arena's slingshot: a wooden Y frame, two bands of light, a pouch.
    this.rig = makeSlingshot();
    this.rig.root.visible = false;
    this.rig.root.userData.keep = true;
    for (const dot of this.rig.dots) dot.visible = false;
    this.rig.stone.visible = false;
    this.group.add(this.rig.root);
    this.stoneMesh = new Mesh(new DodecahedronGeometry(STONE_R, 0), new MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, flatShading: true }));
    this.stoneMesh.visible = false;
    this.stoneMesh.userData.keep = true;
    this.group.add(this.stoneMesh, this.sparks.points);

    // The path: dark, solid dots over everything, so it reads against any background.
    this.pathMaterial = new MeshBasicMaterial({ color: 0xd2380c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const dot = new SphereGeometry(0.0055, 10, 8);
    for (let i = 0; i < PATH_DOTS; i++) {
      const mesh = new Mesh(dot, this.pathMaterial);
      mesh.renderOrder = 40;
      mesh.visible = false;
      mesh.userData.keep = true;
      this.path.push(mesh);
      this.group.add(mesh);
    }
    // The sight: a ring with a dot in the middle, like a scope's.
    this.sightMaterial = new MeshBasicMaterial({ color: 0xd2380c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: DoubleSide });
    const ring = new Mesh(new RingGeometry(0.02, 0.027, 32), this.sightMaterial);
    const centre = new Mesh(new RingGeometry(0, 0.005, 16), this.sightMaterial);
    for (const m of [ring, centre]) m.renderOrder = 41;
    this.sight.add(ring, centre);
    this.sight.visible = false;
    this.sight.userData.keep = true;
    this.group.add(this.sight);

    this.buildFence(f);

    devInfo.slingshot = () => this.state;
    // Dev: [ puts the slingshot in your right hand; ] fires a perfect shot at the next jar.
    devActions['['] = () => {
      if (this.phase === 'shape') this.comeAlive(1);
    };
    devActions[']'] = () => this.devShot();
  }

  get state(): string {
    return `${this.phase} hand=${this.holdHand} shots=${this.shots} hits=${this.hits} jars=${this.jars.map((j) => (j.hit ? 'x' : 'o')).join('')} flying=${this.flying}`;
  }

  /** For the Inventor's Journal. */
  journal(): string[] {
    return [
      `${this.shots} stone${this.shots === 1 ? '' : 's'} fired, ${this.hits} ink jar${this.hits === 1 ? '' : 's'} knocked off`,
      `Launch speed grows with the pull: v = ω·x, with ω ≈ ${OMEGA} per second`,
      'A shadow made real: the fork your fingers cast became the slingshot in your hand',
    ];
  }

  // ================================================================ Build

  private buildFence(f: number): void {
    const wood = hardwood();
    // A rough fence across the back of the table: posts and a top rail; two crates for the higher jars.
    const fence = new Group();
    for (const x of FENCE_X) {
      const post = new Mesh(new BoxGeometry(0.016, RAIL + 0.012, 0.016), wood);
      post.position.set(x, f + (RAIL + 0.012) / 2, fenceZ(x));
      fence.add(post);
    }
    const rail = (a: [number, number], b: [number, number], y: number) => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      const bar = new Mesh(new BoxGeometry(length, 0.012, 0.022), wood);
      bar.position.set((a[0] + b[0]) / 2, f + y, (a[1] + b[1]) / 2);
      bar.rotation.y = -Math.atan2(dz, dx);
      fence.add(bar);
    };
    const pts: Array<[number, number]> = FENCE_X.map((x) => [x, fenceZ(x)]);
    for (let i = 0; i < pts.length - 1; i++) {
      rail(pts[i], pts[i + 1], RAIL);
      rail(pts[i], pts[i + 1], RAIL / 2);
    }
    // Crates for the middle (behind the fence) and right jars.
    for (const [x, z, h] of [[0.02, -0.36, 0.15], [0.3, -0.2, 0.12]] as Array<[number, number, number]>) {
      const crate = new Mesh(new BoxGeometry(0.07, h, 0.07), wood);
      crate.position.set(x, f + h / 2, z);
      fence.add(crate);
    }
    fence.userData.keep = true;
    this.group.add(fence);

    // The jars: dark glass full of ink, a cork, a faint purple glow so they read from the seat.
    const glass = new MeshStandardMaterial({ color: 0x2a1640, roughness: 0.25, metalness: 0.1, emissive: 0x3a1a6a, emissiveIntensity: 0.6 });
    const cork = new MeshStandardMaterial({ color: 0xb08050, roughness: 0.9 });
    for (const [x, y, z] of JARS) {
      const root = new Group();
      const body = new Mesh(new CylinderGeometry(JAR_R, JAR_R * 0.9, JAR_H, 16), glass);
      const neck = new Mesh(new CylinderGeometry(JAR_R * 0.5, JAR_R * 0.6, 0.012, 12), glass);
      neck.position.y = JAR_H / 2 + 0.006;
      const top = new Mesh(new CylinderGeometry(JAR_R * 0.45, JAR_R * 0.45, 0.01, 10), cork);
      top.position.y = JAR_H / 2 + 0.016;
      const halo = new Mesh(new SphereGeometry(HIT_R, 16, 10), new MeshBasicMaterial({ color: 0xb47aff, transparent: true, opacity: 0.18, depthWrite: false }));
      root.add(body, neck, top, halo);
      root.position.set(x, f + y + JAR_H / 2, z);
      root.userData.keep = true;
      this.group.add(root);
      this.jars.push({ root, at: root.position.clone(), hit: false, time: 0, vel: new Vector3(), spin: new Vector3(), halo });
    }
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[], head?: Vector3): void {
    if (!stage.playing) hands = [];
    if (head) this.group.worldToLocal(this.eye.copy(head));
    this.phaseTime += dt;
    this.noteTime -= dt;
    this.reload = Math.max(0, this.reload - dt);
    if (this.phase === 'shape') this.watchShape(dt, hands);
    else if (this.phase === 'aim') this.aim(dt, hands);
    if (this.flying) this.fly(dt);
    this.animateJars(dt);
    this.sparks.update(dt);
    if (this.finishIn > 0) {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.done = true;
    }
    this.caption = this.noteTime > 0 ? this.note : this.prompt();
  }

  /** A V of index and middle fingers, held: the slingshot appears in that hand. */
  private watchShape(dt: number, hands: readonly HandState[]): void {
    const vee = hands.findIndex((h) => h.tracked && h.ext.index > 0.72 && h.ext.middle > 0.72 && h.ext.ring < 0.5 && h.ext.pinky < 0.55 && !h.pinching);
    this.shapeTime = vee >= 0 ? this.shapeTime + dt : Math.max(0, this.shapeTime - dt * 2);
    if (vee >= 0 && this.shapeTime >= SHAPE_HOLD) this.comeAlive(vee);
  }

  private comeAlive(hand: number): void {
    this.phase = 'aim';
    this.phaseTime = 0;
    this.holdHand = hand;
    this.lostFor = 0;
    this.puller = -1;
    this.rig.root.visible = true;
    this.rig.frame.scale.setScalar(0.3);
    playAwaken();
    this.say('Your shadow came alive: a slingshot in your hand! Now pinch the pouch with your OTHER hand and pull back', 4.5);
  }

  /** The slingshot follows the V hand; the other hand pinches the pouch, pulls and lets go. */
  private aim(dt: number, hands: readonly HandState[]): void {
    const holder = hands[this.holdHand];
    if (!holder || !holder.tracked) {
      this.lostFor += dt;
      if (this.lostFor > LOST_DROP) {
        this.phase = 'shape';
        this.shapeTime = 0;
        this.rig.root.visible = false;
        this.puller = -1;
        this.hideAim();
        this.say('Your slingshot slipped away: make the V again', 2.5);
      }
      return;
    }
    this.lostFor = 0;
    const frame = this.rig.frame;
    frame.scale.setScalar(Math.min(1, frame.scale.x + dt * 3));
    // Grip in the palm, fork up along the fingers (leaning towards upright), arms across your view.
    const palm = this.group.worldToLocal(this.v.copy(holder.palm));
    const tip = this.group.worldToLocal(this.w.copy(holder.indexTip));
    this.up.subVectors(tip, palm).normalize().lerp(this.sim.set(0, 1, 0), 0.5).normalize();
    this.right.set(1, 0, 0).addScaledVector(this.up, -this.up.x).normalize();
    this.back.crossVectors(this.right, this.up).normalize();
    this.basis.makeBasis(this.right, this.up, this.back);
    frame.position.lerp(palm, frame.scale.x < 1 ? 1 : Math.min(1, dt * 20));
    frame.quaternion.setFromRotationMatrix(this.basis);
    const k = frame.scale.x;
    this.tipA.set(-SLING_TIP_SPREAD * k, SLING_TIP_UP * k, 0).applyQuaternion(frame.quaternion).add(frame.position);
    this.tipB.set(SLING_TIP_SPREAD * k, SLING_TIP_UP * k, 0).applyQuaternion(frame.quaternion).add(frame.position);
    this.fork.copy(this.tipA).add(this.tipB).multiplyScalar(0.5);

    // The other hand takes the pouch.
    if (this.puller < 0 && !this.flying && this.reload === 0) {
      hands.forEach((hand, h) => {
        if (h === this.holdHand || this.puller >= 0 || !hand.tracked || !hand.pinchStarted) return;
        const at = this.group.worldToLocal(this.v.copy(hand.pinch));
        if (at.distanceTo(this.fork) < GRAB_REACH) {
          this.puller = h;
          playTink(0.03);
        }
      });
    }
    let pulling = false;
    if (this.puller >= 0) {
      const hand = hands[this.puller];
      if (!hand || !hand.tracked || !hand.pinching) {
        this.puller = -1;
        this.release();
      } else {
        const at = this.group.worldToLocal(this.v.copy(hand.hold));
        const pull = at.sub(this.fork);
        if (pull.length() > MAX_PULL) pull.setLength(MAX_PULL);
        this.pouch.copy(this.fork).add(pull);
        pulling = true;
      }
    }
    if (!pulling) this.pouch.lerp(this.fork, Math.min(1, dt * 14));
    this.stretch(this.rig.bands[0], this.tipA, this.pouch);
    this.stretch(this.rig.bands[1], this.tipB, this.pouch);
    this.rig.pouch.position.copy(this.pouch);
    if (!this.flying) {
      this.stoneMesh.visible = this.reload === 0;
      this.stoneMesh.position.copy(this.pouch);
    }
    if (pulling) this.showAim();
    else this.hideAim();
  }

  private stretch(beam: Mesh, from: Vector3, to: Vector3): void {
    const d = this.sim.subVectors(to, from);
    const length = d.length();
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(this.simV.set(0, 1, 0), d.divideScalar(length || 1));
    beam.scale.set(1, Math.max(0.001, length), 1);
  }

  /** Where the stone would go from here: dots along the arc, and the sight where it lands. */
  private showAim(): void {
    const pull = this.v.subVectors(this.pouch, this.fork);
    if (pull.length() < MIN_PULL) {
      this.hideAim();
      return;
    }
    this.sim.copy(this.pouch);
    this.simV.copy(pull).multiplyScalar(-OMEGA);
    let landed: Jar | null = null;
    let ended = false;
    let shown = 0;
    const h = 0.01;
    for (let step = 0, t = 0; step < 200 && !ended; step++, t += h) {
      this.simV.y -= GRAVITY * h;
      this.sim.addScaledVector(this.simV, h);
      for (const jar of this.jars) {
        if (!jar.hit && this.sim.distanceTo(jar.at) < HIT_R + STONE_R) {
          landed = jar;
          ended = true;
        }
      }
      if (this.sim.y <= this.floor + STONE_R || this.sim.z < -1 || Math.abs(this.sim.x) > 1) ended = true;
      if (shown < PATH_DOTS && t >= (shown + 1) * PATH_STEP) {
        this.path[shown].position.copy(this.sim);
        this.path[shown].visible = true;
        shown++;
      }
    }
    for (let i = shown; i < PATH_DOTS; i++) this.path[i].visible = false;
    const color = landed ? 0x1fae3a : 0xd2380c;
    this.pathMaterial.color.setHex(color);
    this.sightMaterial.color.setHex(color);
    // The sight on the jar it would hit, or where it would land; always turned to face you.
    this.sight.position.copy(landed ? landed.at : this.sim);
    if (!landed) this.sight.position.y = Math.max(this.floor + 0.012, this.sight.position.y);
    this.sight.lookAt(this.group.localToWorld(this.w.copy(this.eye)));
    this.sight.scale.setScalar(landed ? 1.5 : 1);
    this.sight.visible = true;
    for (const jar of this.jars) (jar.halo.material as MeshBasicMaterial).opacity = jar === landed ? 0.45 : 0.18;
  }

  private hideAim(): void {
    for (const dot of this.path) dot.visible = false;
    this.sight.visible = false;
    for (const jar of this.jars) (jar.halo.material as MeshBasicMaterial).opacity = 0.18;
  }

  /** Let go: launch at ω·(pull), opposite the pull. */
  private release(): void {
    const pull = this.v.subVectors(this.pouch, this.fork);
    this.hideAim();
    if (pull.length() < MIN_PULL) {
      this.say('Pull the pouch further back towards you before you let go', 1.8);
      return;
    }
    this.flight.copy(pull).multiplyScalar(-OMEGA);
    this.stoneMesh.position.copy(this.pouch);
    this.launch();
  }

  private launch(): void {
    this.flying = true;
    this.flightTime = 0;
    this.shots++;
    this.stoneMesh.visible = true;
    playWhoosh(Math.min(1, this.flight.length() / 3.5));
  }

  private fly(dt: number): void {
    const s = this.stoneMesh.position;
    // A few sub-steps so a fast stone cannot skip through a jar.
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.flight.y -= GRAVITY * h;
      s.addScaledVector(this.flight, h);
      for (const jar of this.jars) {
        if (jar.hit) continue;
        if (s.distanceTo(jar.at) < HIT_R + STONE_R) {
          this.knock(jar, this.flight);
          this.endFlight(true);
          return;
        }
      }
    }
    this.stoneMesh.rotation.x += dt * 12;
    this.flightTime += dt;
    if (s.y <= this.floor + STONE_R || this.flightTime > 2.5 || Math.abs(s.x) > 1.2 || s.z < -1.2) {
      if (s.y <= this.floor + STONE_R) playClunk(0.03);
      this.endFlight(false);
    }
  }

  private endFlight(hit: boolean): void {
    this.flying = false;
    this.reload = RELOAD;
    this.stoneMesh.visible = false;
    if (!hit) {
      this.mistakes++;
      this.say('Missed! Pull again and move your hands until the sight turns GREEN on a jar', 2.2);
    }
  }

  /** Hit: the jar flies back off the fence, tumbling, and bursts when it lands. */
  private knock(jar: Jar, by: Vector3): void {
    jar.hit = true;
    jar.time = 0;
    this.hits++;
    jar.vel.copy(by).setY(0).normalize().multiplyScalar(0.8).setY(1.1);
    jar.spin.set(4 + Math.random() * 4, 0, (Math.random() - 0.5) * 8);
    jar.halo.visible = false;
    playTink(0.06);
    const left = this.jars.filter((j) => !j.hit).length;
    this.say(left ? `Knocked off! ${left} jar${left === 1 ? '' : 's'} to go` : 'The last jar! Rook’s ink will never reach the river', 2.2);
    if (left === 0) {
      this.phase = 'won';
      this.rig.root.visible = false;
      this.hideAim();
      this.finishIn = 2.6;
      playTinkle();
    }
  }

  private animateJars(dt: number): void {
    for (const jar of this.jars) {
      if (!jar.hit) {
        jar.halo.scale.setScalar(1 + 0.08 * Math.sin(this.phaseTime * 3 + jar.at.x * 10));
        continue;
      }
      if (!jar.root.visible) continue;
      jar.time += dt;
      jar.vel.y -= GRAVITY * dt;
      jar.root.position.addScaledVector(jar.vel, dt);
      jar.root.rotation.x += jar.spin.x * dt;
      jar.root.rotation.z += jar.spin.z * dt;
      if (jar.root.position.y <= this.floor + JAR_R) {
        // Smash: a splash of ink, and it is gone.
        jar.root.visible = false;
        playSplat(0.06);
        this.splash(jar.root.position.setY(this.floor + 0.01));
      }
    }
  }

  private prompt(): string {
    if (this.phase === 'won') return 'Every ink jar is off the fence! The river stays clean.';
    if (this.phase === 'shape') {
      return this.shapeTime > 0.1
        ? 'Hold that V still… your shadow is coming alive'
        : 'Step 1: make a V with your index and middle fingers (others folded) up in the light';
    }
    const left = this.jars.filter((j) => !j.hit).length;
    if (this.puller >= 0) return 'Move until the sight turns GREEN on a jar, then let go';
    return `Step 2: pinch the pouch with your other hand and pull back · ${left} ink jar${left === 1 ? '' : 's'} left`;
  }

  private say(text: string, seconds: number): void {
    this.note = text;
    this.noteTime = seconds;
  }

  private splash(at: Vector3): void {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.emit(at, this.v.set(Math.cos(a) * (0.2 + Math.random() * 0.3), 0.3 + Math.random() * 0.4, Math.sin(a) * (0.2 + Math.random() * 0.3)), { life: 0.5 + Math.random() * 0.3, gravity: 2, size: [0.008, 0.003], from: 0x3a1a6a, to: 0x140820 });
    }
  }

  /** Dev: a perfect shot at the next jar (the flight time fixed, the launch solved for it). */
  private devShot(): void {
    if (this.phase === 'shape') this.comeAlive(1);
    if (this.phase !== 'aim' || this.flying) return;
    const jar = this.jars.find((j) => !j.hit);
    if (!jar) return;
    const time = 0.45;
    const from = this.v.set(0, this.floor + 0.28, 0.22);
    this.stoneMesh.position.copy(from);
    this.flight.subVectors(jar.at, from).divideScalar(time);
    this.flight.y += 0.5 * GRAVITY * time;
    this.launch();
  }
}
