import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playAwaken, playClang, playClunk, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { makeSlingshot, SLING_TIP_SPREAD, SLING_TIP_UP, type SlingRig } from '../yash/visuals.js';
import { hardwood, hemp, iron, RopeSpan } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * The Shadow Slingshot: a shadow that comes alive, as a real slingshot in
 * your hand (the same slingshot as the Arena's).
 *
 *   1. Make a V with index and middle fingers: its shadow on the screen is a
 *      slingshot's fork. Hold it, and the slingshot is in that hand.
 *   2. With your other hand, pinch the pouch and pull it back towards you.
 *      A bold line of dots shows the stone's path, and a ring marks where it
 *      will land: green on a target, red when it would miss.
 *   3. Let go. Knock down Captain Rook's three targets: the rope holding a
 *      caged lantern shard, his flag, and his alarm bell.
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

type TargetKind = 'rope' | 'flag' | 'bell';

interface Target {
  kind: TargetKind;
  /** Where a stone must pass to hit it, and how close. */
  at: Vector3;
  radius: number;
  hit: boolean;
  time: number;
  group: Group;
}

const ORDER: Record<TargetKind, string> = {
  rope: 'the rope holding the caged shard (left)',
  flag: "Rook's flag (middle)",
  bell: 'the alarm bell (right)',
};

export class ShadowSlingshot {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private phase: 'shape' | 'aim' | 'won' = 'shape';
  private phaseTime = 0;
  private shapeTime = 0;
  /** The hand holding the slingshot (the V hand), and how long it has been out of sight. */
  private holdHand = -1;
  private lostFor = 0;
  /** The other hand, pinching the pouch (-1: nobody). */
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
  /** The aim: bold dots along the path, and a ring where it lands. */
  private readonly path: Mesh[] = [];
  private readonly pathMaterial: MeshBasicMaterial;
  private readonly landing: Mesh;
  private readonly landingMaterial: MeshBasicMaterial;
  private readonly targets: Target[] = [];
  private readonly sparks = new ParticlePool({ count: 80, additive: true, soft: false });
  private cage!: Group;
  private cageFall = 0;
  private cageVelocity = 0;
  private rope!: RopeSpan;
  private ropeTop = new Vector3();
  private shots = 0;
  private hits = 0;
  private note = '';
  private noteTime = 0;
  private finishIn = -1;
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

    // The aim: dark, solid dots drawn over everything, so the path reads against any background.
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
    this.landingMaterial = new MeshBasicMaterial({ color: 0xd2380c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: DoubleSide });
    this.landing = new Mesh(new RingGeometry(0.016, 0.026, 28), this.landingMaterial);
    this.landing.renderOrder = 41;
    this.landing.visible = false;
    this.landing.userData.keep = true;
    this.group.add(this.landing);

    this.buildTargets(f);

    devInfo.slingshot = () => this.state;
    // Dev: [ puts the slingshot in your right hand; ] fires a perfect shot at the next target.
    devActions['['] = () => {
      if (this.phase === 'shape') this.comeAlive(1);
    };
    devActions[']'] = () => this.devShot();
  }

  get state(): string {
    return `${this.phase} hand=${this.holdHand} shots=${this.shots} hits=${this.hits} targets=${this.targets.map((t) => `${t.kind}:${t.hit ? 'hit' : '-'}`).join(',')} flying=${this.flying}`;
  }

  /** For the Inventor's Journal. */
  journal(): string[] {
    return [
      `${this.shots} stone${this.shots === 1 ? '' : 's'} fired, ${this.hits} on target`,
      `Launch speed grows with the pull: v = ω·x, with ω ≈ ${OMEGA} per second`,
      'A shadow made real: the fork your fingers cast became the slingshot in your hand',
    ];
  }

  // ================================================================ Build

  private buildTargets(f: number): void {
    const wood = hardwood();
    // The rope and the cage: a gallows post, a rope, a cage of iron bars with a glowing shard.
    {
      const g = new Group();
      const x = -0.24;
      const z = -0.38;
      const post = new Mesh(new BoxGeometry(0.014, 0.3, 0.014), wood);
      post.position.set(x - 0.07, f + 0.15, z);
      const arm = new Mesh(new BoxGeometry(0.1, 0.012, 0.012), wood);
      arm.position.set(x - 0.025, f + 0.296, z);
      g.add(post, arm);
      this.ropeTop.set(x, f + 0.29, z);
      this.rope = new RopeSpan(0.0016);
      this.rope.mesh.material = hemp();
      g.add(this.rope.mesh);
      this.cage = new Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bar = new Mesh(new CylinderGeometry(0.0013, 0.0013, 0.06, 4), iron());
        bar.position.set(Math.cos(a) * 0.024, 0, Math.sin(a) * 0.024);
        this.cage.add(bar);
      }
      for (const y of [-0.03, 0.03]) {
        const ring = new Mesh(new CylinderGeometry(0.026, 0.026, 0.003, 16), iron());
        ring.position.y = y;
        this.cage.add(ring);
      }
      const shard = new Mesh(new DodecahedronGeometry(0.01, 0), new MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa030, emissiveIntensity: 2 }));
      this.cage.add(shard);
      this.cage.position.set(x, f + 0.17, z);
      this.cage.userData.keep = true;
      g.add(this.cage);
      this.group.add(g);
      this.targets.push({ kind: 'rope', at: new Vector3(x, f + 0.235, z), radius: 0.034, hit: false, time: 0, group: g });
    }
    // Rook's flag: a pole and a black flag with crossed white cutlasses.
    {
      const g = new Group();
      const pole = new Mesh(new CylinderGeometry(0.004, 0.005, 0.32, 8), wood);
      pole.position.y = 0.16;
      const flag = new Mesh(new PlaneGeometry(0.13, 0.085), new MeshBasicMaterial({ map: flagTexture(), side: DoubleSide }));
      flag.position.set(0.067, 0.27, 0);
      g.add(pole, flag);
      g.position.set(0.04, f, -0.5);
      g.userData.keep = true;
      this.group.add(g);
      this.targets.push({ kind: 'flag', at: new Vector3(0.107, f + 0.27, -0.5), radius: 0.056, hit: false, time: 0, group: g });
    }
    // The alarm bell: a frame and a bronze bell.
    {
      const g = new Group();
      for (const side of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.01, 0.24, 0.01), wood);
        leg.position.set(side * 0.04, 0.12, 0);
        g.add(leg);
      }
      const top = new Mesh(new BoxGeometry(0.1, 0.012, 0.012), wood);
      top.position.y = 0.24;
      g.add(top);
      const bell = new Group();
      const body = new Mesh(new CylinderGeometry(0.012, 0.03, 0.04, 16, 1, true), new MeshStandardMaterial({ color: 0xb8862a, metalness: 0.85, roughness: 0.3, side: DoubleSide }));
      body.position.y = -0.03;
      bell.add(body);
      bell.position.y = 0.232;
      bell.name = 'Bell';
      g.add(bell);
      g.position.set(0.27, f, -0.36);
      g.userData.keep = true;
      this.group.add(g);
      this.targets.push({ kind: 'bell', at: new Vector3(0.27, f + 0.2, -0.36), radius: 0.042, hit: false, time: 0, group: g });
    }
    // A halo on each target so it reads from the seat.
    for (const t of this.targets) {
      const ring = new Mesh(new SphereGeometry(t.radius, 16, 10), new MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.42, blending: AdditiveBlending, depthWrite: false }));
      ring.position.copy(t.at).sub(t.group.position);
      ring.name = 'Halo';
      t.group.add(ring);
    }
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[]): void {
    if (!stage.playing) hands = [];
    this.phaseTime += dt;
    this.noteTime -= dt;
    this.reload = Math.max(0, this.reload - dt);
    if (this.phase === 'shape') this.watchShape(dt, hands);
    else if (this.phase === 'aim') this.aim(dt, hands);
    if (this.flying) this.fly(dt);
    this.animateTargets(dt);
    this.layoutRope();
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
        // Out of sight too long: it fades back into shadow; make the V again.
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
    // Bands from the tips to the pouch, the stone in it.
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

  /** Where the stone would go from here: dots along the arc, and a ring where it lands. */
  private showAim(): void {
    const pull = this.v.subVectors(this.pouch, this.fork);
    if (pull.length() < MIN_PULL) {
      this.hideAim();
      return;
    }
    this.sim.copy(this.pouch);
    this.simV.copy(pull).multiplyScalar(-OMEGA);
    let landed: Target | null = null;
    let ended = false;
    let shown = 0;
    const h = 0.01;
    for (let step = 0, t = 0; step < 200 && !ended; step++, t += h) {
      this.simV.y -= GRAVITY * h;
      this.sim.addScaledVector(this.simV, h);
      for (const target of this.targets) {
        if (!target.hit && this.sim.distanceTo(target.at) < target.radius + STONE_R) {
          landed = target;
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
    // The ring: on the target it would hit (green), or on the ground where it would fall (red).
    const color = landed ? 0x1fae3a : 0xd2380c;
    this.pathMaterial.color.setHex(color);
    this.landingMaterial.color.setHex(color);
    this.landing.visible = true;
    if (landed) {
      this.landing.position.copy(landed.at);
      this.landing.lookAt(this.fork);
      this.landing.scale.setScalar(1.6);
    } else {
      this.landing.position.copy(this.sim).setY(Math.max(this.floor + 0.002, this.sim.y));
      this.landing.rotation.set(-Math.PI / 2, 0, 0);
      this.landing.scale.setScalar(1);
    }
  }

  private hideAim(): void {
    for (const dot of this.path) dot.visible = false;
    this.landing.visible = false;
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
    // A few sub-steps so a fast stone cannot skip through a target.
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.flight.y -= GRAVITY * h;
      s.addScaledVector(this.flight, h);
      for (const t of this.targets) {
        if (t.hit) continue;
        if (s.distanceTo(t.at) < t.radius + STONE_R) {
          this.hitTarget(t);
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
      this.say('Missed! Pull again and move your hands until the ring turns GREEN on a target', 2.2);
    }
  }

  private hitTarget(t: Target): void {
    t.hit = true;
    t.time = 0;
    this.hits++;
    this.burst(t.at, 24, 0xffd27a);
    const halo = t.group.getObjectByName('Halo');
    if (halo) halo.visible = false;
    if (t.kind === 'rope') {
      playWhoosh(0.5);
      this.cageVelocity = 0;
      this.say('The rope snapped! The cage falls, and the lantern shard is free', 2.5);
    } else if (t.kind === 'flag') {
      playClunk(0.08);
      this.say('Rook’s flag is down!', 2);
    } else {
      playClang(1, 0.08);
      window.setTimeout(() => playClang(0.8, 0.05), 380);
      window.setTimeout(() => playClang(0.6, 0.03), 760);
      this.say('The alarm bell rings out across the river!', 2);
    }
    if (this.targets.every((x) => x.hit)) {
      this.phase = 'won';
      this.rig.root.visible = false;
      this.hideAim();
      this.finishIn = 2.6;
      playTinkle();
    }
  }

  private animateTargets(dt: number): void {
    for (const t of this.targets) {
      if (!t.hit) {
        const halo = t.group.getObjectByName('Halo');
        if (halo) halo.scale.setScalar(1 + 0.12 * Math.sin(this.phaseTime * 4 + t.at.x * 10));
        continue;
      }
      t.time += dt;
      if (t.kind === 'flag') t.group.rotation.z = -Math.min(1.45, t.time * t.time * 6);
      if (t.kind === 'bell') {
        const bell = t.group.getObjectByName('Bell');
        if (bell) bell.rotation.z = Math.sin(t.time * 14) * 0.5 * Math.exp(-t.time * 1.2);
      }
      if (t.kind === 'rope' && this.cageFall < 1) {
        // The cage drops, lands, and its glowing shard floats free.
        this.cageVelocity += GRAVITY * dt;
        const ground = this.floor + 0.03;
        this.cage.position.y = Math.max(ground, this.cage.position.y - this.cageVelocity * dt);
        if (this.cage.position.y <= ground) {
          this.cageFall = 1;
          playClunk(0.08);
          playTinkle();
          this.burst(this.cage.position, 30, 0xffd27a);
        }
      }
    }
  }

  /** The rope: until it snaps, from the arm down to the cage. */
  private layoutRope(): void {
    const rope = this.targets[0];
    this.rope.mesh.visible = !rope.hit;
    if (!rope.hit) this.rope.set(this.ropeTop, this.w.copy(this.cage.position).setY(this.cage.position.y + 0.032));
  }

  private prompt(): string {
    if (this.phase === 'won') return 'All three targets down! Rook’s lookout is in chaos.';
    if (this.phase === 'shape') {
      return this.shapeTime > 0.1
        ? 'Hold that V still… your shadow is coming alive'
        : 'Step 1: make a V with your index and middle fingers (others folded) up in the light';
    }
    const next = this.targets.find((t) => !t.hit);
    const left = this.targets.filter((t) => !t.hit).length;
    if (this.puller >= 0) return 'Move until the ring turns GREEN on a target, then let go';
    return `Step 2: pinch the pouch with your other hand and pull back · ${left} left · next: ${next ? ORDER[next.kind] : ''}`;
  }

  private say(text: string, seconds: number): void {
    this.note = text;
    this.noteTime = seconds;
  }

  private burst(at: Vector3, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      this.sparks.emit(at, new Vector3(Math.cos(a) * r, Math.abs(u) + 0.3, Math.sin(a) * r).multiplyScalar(0.25 + Math.random() * 0.3), { life: 0.5 + Math.random() * 0.4, gravity: 1.2, size: [0.006, 0.002], from: color, to: 0x402010 });
    }
  }

  /** Dev: a perfect shot at the next target (the flight time fixed, the launch solved for it). */
  private devShot(): void {
    if (this.phase === 'shape') this.comeAlive(1);
    if (this.phase !== 'aim' || this.flying) return;
    const target = this.targets.find((t) => !t.hit);
    if (!target) return;
    const time = 0.45;
    // From where a seated player's hands are: above the table, in front of you.
    const from = this.v.set(0, this.floor + 0.28, 0.22);
    this.stoneMesh.position.copy(from);
    this.flight.subVectors(target.at, from).divideScalar(time);
    this.flight.y += 0.5 * GRAVITY * time;
    this.launch();
  }
}

/** Rook's flag: black, with two crossed white cutlasses (no skull, no face). */
function flagTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#c8261e';
  g.fillRect(0, 0, 192, 128);
  g.fillStyle = '#14121a';
  g.fillRect(10, 10, 172, 108);
  g.strokeStyle = '#f2ece0';
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.save();
    g.translate(96, 64);
    g.rotate(side * 0.75);
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, 46);
    g.quadraticCurveTo(side * 10, 0, 0, -46);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(-14, 34);
    g.lineTo(14, 34);
    g.stroke();
    g.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
