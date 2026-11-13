import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playAwaken, playClang, playClunk, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { hardwood, hemp, iron, RopeSpan } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * The Shadow Slingshot: a shadow that comes alive.
 *
 * Make a V with your index and middle fingers (the others folded): on the
 * screen your shadow is a slingshot's fork. Hold it, and a real slingshot
 * steps out of the screen onto the table. Pinch the pouch, pull back, aim,
 * let go: the stone flies on a real arc (an elastic band's launch speed grows
 * with the pull, v = ω·x; then gravity) at Captain Rook's three targets: the
 * rope holding a caged lantern shard, his flag, and his alarm bell.
 */

/** Stage-local layout (the table's earth is at `floor`; you sit at +z). */
const SLING = new Vector3(0, 0, 0.16);
const FORK_HALF = 0.03;
const FORK_TOP = 0.12;
const POUCH_REST = new Vector3(0, FORK_TOP - 0.004, 0.012);
/** Pull limits, and launch speed per metre of pull (the band's ω): 0.15 m gives 3.3 m/s. */
const MAX_PULL = 0.15;
const MIN_PULL = 0.025;
const OMEGA = 22;
const GRAVITY = 9.8;
const STONE_R = 0.009;
const GRAB_REACH = 0.055;
/** The V must be held this long to bring the slingshot to life. */
const SHAPE_HOLD = 0.8;
const ALIVE_TIME = 1.3;
const PREVIEW_DOTS = 9;

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

export class ShadowSlingshot {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private phase: 'shape' | 'alive' | 'aim' | 'won' = 'shape';
  private phaseTime = 0;
  private shapeTime = 0;
  private readonly sling = new Group();
  private readonly woodMaterial: MeshStandardMaterial;
  private readonly bands = [new RopeSpan(0.0016), new RopeSpan(0.0016)];
  private readonly pouch: Mesh;
  private readonly stoneMesh: Mesh;
  private readonly pouchAt = new Vector3();
  private holder = -1;
  private readonly flight = new Vector3();
  private flying = false;
  private flightTime = 0;
  private readonly preview: Mesh[] = [];
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

  constructor(private readonly floor: number) {
    this.group.name = 'ShadowSlingshot';
    const f = floor;

    // ---- The slingshot: a forked hardwood branch, rubber bands, a leather pouch and a stone.
    this.woodMaterial = hardwood().clone();
    this.woodMaterial.color = new Color(0x000000);
    const handle = new Mesh(new CylinderGeometry(0.0065, 0.0075, 0.075, 10), this.woodMaterial);
    handle.position.y = 0.0375;
    this.sling.add(handle);
    for (const side of [-1, 1]) {
      const prong = new Mesh(new CylinderGeometry(0.0052, 0.0062, 0.058, 10), this.woodMaterial);
      prong.position.set(side * FORK_HALF * 0.5, 0.075 + 0.024, 0);
      prong.rotation.z = -side * 0.5;
      this.sling.add(prong);
    }
    this.pouch = new Mesh(new BoxGeometry(0.018, 0.012, 0.006), new MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }));
    this.stoneMesh = new Mesh(new DodecahedronGeometry(STONE_R, 0), new MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, flatShading: true }));
    for (const band of this.bands) {
      band.mesh.material = new MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.6 });
      this.group.add(band.mesh);
    }
    this.sling.position.set(SLING.x, f + SLING.y, SLING.z);
    this.sling.visible = false;
    for (const o of [this.sling, this.pouch, this.stoneMesh]) o.userData.keep = true;
    this.group.add(this.sling, this.pouch, this.stoneMesh, this.sparks.points);
    this.pouch.visible = this.stoneMesh.visible = false;

    // The aiming arc: dots along the first part of the flight.
    const dot = new SphereGeometry(0.0035, 8, 6);
    for (let i = 0; i < PREVIEW_DOTS; i++) {
      const mesh = new Mesh(dot, new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 * (1 - i / PREVIEW_DOTS), depthWrite: false }));
      mesh.visible = false;
      mesh.userData.keep = true;
      this.preview.push(mesh);
      this.group.add(mesh);
    }

    this.buildTargets(f);

    devInfo.slingshot = () => this.state;
    // Dev: [ brings the slingshot to life; ] fires a perfect shot at the next target.
    devActions['['] = () => {
      if (this.phase === 'shape') this.comeAlive();
    };
    devActions[']'] = () => this.devShot();
  }

  get state(): string {
    return `${this.phase} shots=${this.shots} hits=${this.hits} targets=${this.targets.map((t) => `${t.kind}:${t.hit ? 'hit' : '-'}`).join(',')} flying=${this.flying}`;
  }

  /** For the Inventor's Journal. */
  journal(): string[] {
    return [
      `${this.shots} stone${this.shots === 1 ? '' : 's'} fired, ${this.hits} on target`,
      `Launch speed grows with the pull: v = ω·x, with ω ≈ ${OMEGA} per second`,
      'A shadow made real: the fork your fingers cast became the slingshot',
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
      this.targets.push({ kind: 'rope', at: new Vector3(x, f + 0.235, z), radius: 0.022, hit: false, time: 0, group: g });
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
      this.targets.push({ kind: 'flag', at: new Vector3(0.107, f + 0.27, -0.5), radius: 0.05, hit: false, time: 0, group: g });
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
      this.targets.push({ kind: 'bell', at: new Vector3(0.27, f + 0.2, -0.36), radius: 0.032, hit: false, time: 0, group: g });
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
    if (this.phase === 'shape') this.watchShape(dt, hands);
    else if (this.phase === 'alive') this.bringToLife();
    else if (this.phase === 'aim') this.aim(dt, hands);
    if (this.flying) this.fly(dt);
    this.animateTargets(dt);
    this.layout();
    this.sparks.update(dt);
    if (this.finishIn > 0) {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.done = true;
    }
    this.caption = this.noteTime > 0 ? this.note : this.prompt();
  }

  /** A V of index and middle fingers, held, brings the slingshot to life. */
  private watchShape(dt: number, hands: readonly HandState[]): void {
    const vee = hands.some((h) => h.tracked && h.ext.index > 0.75 && h.ext.middle > 0.75 && h.ext.ring < 0.45 && h.ext.pinky < 0.45);
    this.shapeTime = vee ? this.shapeTime + dt : Math.max(0, this.shapeTime - dt * 2);
    if (this.shapeTime >= SHAPE_HOLD) this.comeAlive();
  }

  private comeAlive(): void {
    this.phase = 'alive';
    this.phaseTime = 0;
    this.sling.visible = true;
    playAwaken();
    this.burst(this.v.set(SLING.x, this.floor + FORK_TOP, SLING.z), 30, 0x2a2a3a);
  }

  /** It steps out of the screen as a shadow and takes on colour. */
  private bringToLife(): void {
    const k = Math.min(1, this.phaseTime / ALIVE_TIME);
    const e = 1 - (1 - k) * (1 - k);
    this.sling.scale.setScalar(0.4 + 0.6 * e);
    this.woodMaterial.color.setHex(0x000000).lerp(new Color(0x8a5a34), e);
    if (k >= 1) {
      this.phase = 'aim';
      this.phaseTime = 0;
      this.reload();
      this.say('It came alive! Pinch the pouch, pull it back towards you, aim, and let go', 4);
    }
  }

  private reload(): void {
    this.pouchAt.copy(POUCH_REST).add(this.v.set(SLING.x, this.floor + SLING.y, SLING.z));
    this.pouch.visible = this.stoneMesh.visible = true;
    this.stoneMesh.position.copy(this.pouchAt);
  }

  /** Pinch the pouch and pull: the stone follows; let go and it flies. */
  private aim(dt: number, hands: readonly HandState[]): void {
    const rest = this.w.copy(POUCH_REST).add(this.v.set(SLING.x, this.floor + SLING.y, SLING.z));
    if (this.holder < 0 && !this.flying) {
      hands.forEach((hand, h) => {
        if (this.holder >= 0 || !hand.tracked || !hand.pinchStarted) return;
        const p = this.group.worldToLocal(this.v.copy(hand.pinch));
        if (p.distanceTo(this.pouchAt) < GRAB_REACH) {
          this.holder = h;
          playTink(0.03);
        }
      });
    }
    if (this.holder >= 0) {
      const hand = hands[this.holder];
      if (!hand || !hand.tracked || !hand.pinching) {
        this.holder = -1;
        this.release(rest);
        return;
      }
      const p = this.group.worldToLocal(this.v.copy(hand.pinch));
      // The pouch follows the pinch, but the bands only stretch so far.
      const pull = p.sub(rest);
      if (pull.length() > MAX_PULL) pull.setLength(MAX_PULL);
      this.pouchAt.copy(rest).add(pull);
      this.stoneMesh.position.copy(this.pouchAt);
    } else if (!this.flying) {
      // Not held: the bands pull the pouch back to rest.
      this.pouchAt.lerp(rest, Math.min(1, dt * 12));
      this.stoneMesh.position.copy(this.pouchAt);
    }
  }

  /** Let go: launch at ω·(pull), opposite the pull. */
  private release(rest: Vector3): void {
    const pull = this.v.subVectors(this.pouchAt, rest);
    if (pull.length() < MIN_PULL) {
      this.say('Pull it further back before you let go', 1.6);
      return;
    }
    this.flight.copy(pull).multiplyScalar(-OMEGA);
    this.launch();
  }

  private launch(): void {
    this.flying = true;
    this.flightTime = 0;
    this.shots++;
    this.pouchAt.copy(POUCH_REST).add(this.v.set(SLING.x, this.floor + SLING.y, SLING.z));
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
    if (!hit) {
      this.mistakes++;
      this.say(['Missed! Watch the arc and adjust your aim', 'Close! Pull a little more or less', 'Aim at the glowing rings'][this.shots % 3], 1.8);
    }
    if (this.phase === 'aim') this.reload();
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
      this.pouch.visible = this.stoneMesh.visible = false;
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

  /** Bands, pouch, rope and the aiming arc where the state puts them. */
  private layout(): void {
    const base = this.v.set(SLING.x, this.floor + SLING.y, SLING.z);
    const scale = this.sling.scale.x;
    for (const [i, side] of [[0, -1], [1, 1]] as const) {
      const tip = this.w.set(base.x + side * FORK_HALF * scale, base.y + FORK_TOP * scale, base.z);
      this.bands[i].mesh.visible = this.phase === 'aim' || this.phase === 'won';
      if (this.bands[i].mesh.visible) this.bands[i].set(tip, this.pouchAt);
    }
    this.pouch.position.copy(this.pouchAt);
    // The rope: until it snaps, from the arm down to the cage.
    const rope = this.targets[0];
    this.rope.mesh.visible = !rope.hit;
    if (!rope.hit) this.rope.set(this.ropeTop, this.w.copy(this.cage.position).setY(this.cage.position.y + 0.032));
    // The arc while pulling: where the stone will start to go.
    const pulling = this.holder >= 0;
    const rest = this.w.copy(POUCH_REST).add(base);
    const pull = this.v.subVectors(this.pouchAt, rest);
    const show = pulling && pull.length() >= MIN_PULL;
    for (let i = 0; i < PREVIEW_DOTS; i++) {
      const dot = this.preview[i];
      dot.visible = show;
      if (!show) continue;
      const t = (i + 1) * 0.035;
      dot.position.set(
        this.pouchAt.x - pull.x * OMEGA * t,
        this.pouchAt.y - pull.y * OMEGA * t - 0.5 * GRAVITY * t * t,
        this.pouchAt.z - pull.z * OMEGA * t,
      );
    }
  }

  private prompt(): string {
    if (this.phase === 'won') return 'All three targets down! Rook’s lookout is in chaos.';
    if (this.phase === 'shape') {
      return this.shapeTime > 0.1
        ? 'Hold that V still… it is coming alive'
        : 'Make a slingshot with your shadow: index and middle fingers up in a V, the others folded';
    }
    if (this.phase === 'alive') return 'Your shadow is stepping out of the screen…';
    const left = this.targets.filter((t) => !t.hit).length;
    if (this.holder >= 0) return 'Aim with the dots, then let go';
    return `Pinch the pouch, pull back and let go · ${left} target${left === 1 ? '' : 's'} left: the rope, the flag, the bell`;
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
    if (this.phase === 'shape') this.comeAlive();
    if (this.phase !== 'aim' || this.flying) return;
    const target = this.targets.find((t) => !t.hit);
    if (!target) return;
    const time = 0.45;
    this.flight.subVectors(target.at, this.pouchAt).divideScalar(time);
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
