import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playClick, playClunk, playCreak, playPawl, playTink } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { PushButton } from '../push-button.js';
import { stage } from '../stage-state.js';
import { hardwood, iron, stone, timber } from './parts.js';
import { ParticlePool } from './particles.js';
import { type Member, Truss } from './truss.js';

/**
 * The Broken Bridge: build a timber truss across the river, joint by joint,
 * then send the ore cart over it. The design is drawn in one vertical plane
 * (the truss) and built twice, front and back, with a plank deck between.
 * Under test it runs as a real truss: members carry pure tension or
 * compression, glow blue when stretched and red when squeezed, snap or
 * buckle when overloaded, and a frame without triangles folds up.
 */

/** Bridge-local: x across the river, y up from the floor, z towards the player. */
const SPAN = 0.15;
const DECK_Y = 0.12;
const LOW_Y = 0.055;
const HALF_W = 0.032;
const BANK_W = 0.17;
const BANK_D = 0.18;
const MAX_LENGTH = 0.11;
const MIN_LENGTH = 0.025;
const GRID = 0.005;
const SNAP = 0.014;
const BUDGET = 20;
const BEAM = 0.0065;
const CART_MASS = 0.9;
const CART_START = -SPAN - 0.08;
const CART_END = SPAN + 0.08;
const CART_SPEED = 0.05;
const WHEEL_R = 0.007;
/** Railing posts stand this tall over the road; room for them in the instances. */
const RAIL_H = 0.026;
const RAIL_CAPACITY = 60;
/** Water surface height in the river. */
const RIVER_Y = 0.032;

type Mode = 'build' | 'settle' | 'roll' | 'failed' | 'passed';

interface DesignJoint {
  x: number;
  y: number;
  pinned: boolean;
}

interface DesignMember {
  a: number;
  b: number;
}

interface Drag {
  hand: number;
  from: number;
  x: number;
  y: number;
  /** Snapped onto this existing joint, or -1 for a new one. */
  to: number;
  valid: boolean;
}

export class Bridge {
  readonly group = new Group();
  caption = '';
  done = false;
  /** Tests that failed: a perfect run passes first time. */
  mistakes = 0;

  private mode: Mode = 'build';
  private modeTime = 0;
  private readonly joints: DesignJoint[] = [];
  private readonly members: DesignMember[] = [];
  private readonly history: Array<{ member: DesignMember; joint: number }> = [];
  private truss = new Truss();
  private built: Array<[number, number]> = [];
  private drags: Array<Drag | null> = [null, null];
  private deleting: Array<{ member: number; at: Vector3 } | null> = [null, null];
  private failure = '';
  /** The hardest any timber worked during the test, as a share of its limit. */
  private peak = 0;
  private cartX = CART_START;
  private cartY = DECK_Y;
  private cartFall = { vy: 0, spin: 0, falling: false };
  private creakIn = 0;
  private faced = false;

  private readonly beams: InstancedMesh;
  private readonly planks: InstancedMesh;
  private readonly pins: InstancedMesh;
  private readonly ghost: Mesh;
  private readonly ghostMaterial: MeshBasicMaterial;
  private readonly cart = new Group();
  private readonly wheels: Mesh[] = [];
  private readonly debris: Array<{ mesh: Mesh; vx: number; vy: number; spin: number; age: number }> = [];
  private readonly splash = new ParticlePool({ count: 80, additive: false, soft: true });
  private readonly buttons: { test: PushButton; undo: PushButton };

  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly zAxis = new Vector3(0, 0, 1);
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly tips: Vector3[] = [];

  /** Timbers you may use, and the loaded cart's mass (kg, toy scale). */
  private readonly budget: number;
  private readonly cartMass: number;

  constructor(floor: number, at: Vector3, options: { budget?: number; cartMass?: number } = {}) {
    this.budget = options.budget ?? BUDGET;
    this.cartMass = options.cartMass ?? CART_MASS;
    this.group.name = 'Bridge';
    this.group.position.set(at.x, floor, at.z);

    this.buildBanks();

    // Anchors: iron plates bolted to each abutment, at road level and lower down.
    for (const side of [-1, 1]) {
      for (const y of [DECK_Y, LOW_Y]) this.joints.push({ x: side * SPAN, y, pinned: true });
    }
    for (const j of this.joints) {
      for (const z of [-HALF_W, HALF_W]) {
        const plate = new Mesh(new BoxGeometry(0.006, 0.018, 0.018), iron());
        plate.position.set(j.x + Math.sign(j.x) * 0.002, j.y, z);
        this.group.add(plate);
      }
    }

    const beamMaterial = timber().clone();
    // Eight-sided like hewn logs, axis along x; scaled to length and thickness.
    const log = new CylinderGeometry(0.5, 0.5, 1, 8);
    log.rotateZ(Math.PI / 2);
    this.beams = new InstancedMesh(log, beamMaterial, (options.budget ?? BUDGET) * 2 + 8 + RAIL_CAPACITY);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.beams.userData.keep = true;
    this.planks = new InstancedMesh(new BoxGeometry(0.009, 0.003, HALF_W * 2 + 0.016), hardwood(), 120);
    this.planks.count = 0;
    this.planks.frustumCulled = false;
    this.planks.userData.keep = true;
    this.pins = new InstancedMesh(new CylinderGeometry(0.0045, 0.0045, 0.002, 10).rotateX(Math.PI / 2), iron(), 96);
    this.pins.count = 0;
    this.pins.frustumCulled = false;
    this.pins.userData.keep = true;
    this.group.add(this.beams, this.planks, this.pins);

    this.ghostMaterial = new MeshBasicMaterial({ color: 0x9cf09c, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghost = new Mesh(new BoxGeometry(1, BEAM, BEAM), this.ghostMaterial);
    this.ghost.visible = false;
    this.ghost.userData.keep = true;
    this.group.add(this.ghost);

    this.buildCart();
    this.group.add(this.splash.points);

    // A push button on each bank, by the road: take back the last timber, and test.
    const undo = new PushButton(this.group, 'Undo');
    const test = new PushButton(this.group, 'Test');
    for (const [button, x] of [[undo, -0.25], [test, 0.25]] as const) {
      button.size = 0.42;
      // Clear of the bank: the button tilts to face you, so its centre sits a full radius above the road.
      button.root.position.set(x, DECK_Y + 0.034, 0.07);
      button.show(true);
    }
    this.buttons = { test, undo };

    devInfo.bridge = () => this.state;
    devActions.t = () => this.startTest();
    devActions.u = () => this.undo();
    devActions.l = () => this.devDesign('warren');
    devActions.m = () => this.devDesign('square');
    devActions.w = () => this.devDesign('braced');
    this.render();
  }

  /** Your bridge under the cart, for the Inventor's Journal. */
  journal(): string[] {
    const peak = Math.round(this.peak * 100);
    return [
      `${this.members.length} timbers of ${this.budget} carried a ${this.cartMass} kg cart`,
      `Hardest-working timber: ${peak}% of its limit`,
      peak < 60 ? 'Plenty to spare: a stiff, safe bridge' : peak < 90 ? 'Well matched to the load' : 'Close to the limit: an engineer would add a brace',
    ];
  }

  get state(): string {
    const worst = this.truss.members.reduce((m, x) => Math.max(m, Math.abs(this.truss.usage(x))), 0);
    return `${this.mode} timbers=${this.members.length} cart=${this.cartX.toFixed(3)} worst=${worst.toFixed(2)} fail=${this.failure}`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[]): void {
    if (!this.faced && stage.paper) {
      // Turn the buttons to the player's eyes, now the bridge is in the scene.
      this.faced = true;
      const eye = stage.paper.localToWorld(new Vector3(0, 0.12, 1.0));
      this.group.updateWorldMatrix(true, true);
      this.buttons.undo.root.lookAt(eye);
      this.buttons.test.root.lookAt(eye);
    }
    this.modeTime += dt;
    if (!stage.playing) hands = [];
    this.tips.length = 0;
    for (const hand of hands) if (hand.tracked) this.tips.push(...hand.tips);
    const building = this.mode === 'build';
    this.buttons.undo.show(building && this.members.length > 0);
    this.buttons.test.show(building);
    if (this.buttons.undo.update(dt, this.tips, false)) this.undo();
    if (this.buttons.test.update(dt, this.tips, false)) this.startTest();

    if (building) this.build(hands);
    else this.test(dt);
    this.fallDebris(dt);
    this.splash.update(dt);
    this.render();
    this.say();
  }

  private say(): void {
    const used = `Timbers ${this.members.length}/${this.budget}`;
    switch (this.mode) {
      case 'build':
        if (this.members.length === 0) this.caption = 'Pinch an iron anchor on the bank, pull out a timber, and let go';
        else if (!this.roadAcross()) this.caption = `${used} · Build a road of timbers across at bank height, held up by triangles`;
        else this.caption = `${used} · The road is across. Push Test when you think it will hold`;
        if (this.drags.some((d) => d && !d.valid) && this.members.length >= this.budget) this.caption = 'No timbers left: push Undo to take one back';
        break;
      case 'settle':
        this.caption = 'Knocking out the props… will it stand on its own?';
        break;
      case 'roll':
        this.caption = 'Blue: stretched. Red: squeezed. Here comes the cart…';
        break;
      case 'failed':
        this.caption = this.failure;
        break;
      case 'passed':
        this.caption = `It holds! ${this.members.length} timbers carried the cart across`;
        break;
    }
  }

  // ============================================================== Building

  private build(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const drag = this.drags[h];
      if (!hand.tracked) {
        this.drags[h] = null;
        this.deleting[h] = null;
        return;
      }
      const p = this.group.worldToLocal(this.v.copy(hand.pinch));
      if (hand.pinchStarted && Math.abs(p.z) < 0.09) {
        const from = this.nearestJoint(p.x, p.y, SNAP + 0.008);
        if (from >= 0) {
          this.drags[h] = { hand: h, from, x: p.x, y: p.y, to: -1, valid: false };
          playPawl(0.015);
        } else {
          const member = this.nearestMember(p.x, p.y, 0.012);
          if (member >= 0) this.deleting[h] = { member, at: p.clone() };
        }
      }
      if (drag && hand.pinching) this.aim(drag, p.x, p.y);
      if (hand.pinchEnded) {
        if (drag) this.place(drag);
        const del = this.deleting[h];
        if (del && del.at.distanceTo(p) < 0.015) this.remove(del.member);
        this.drags[h] = null;
        this.deleting[h] = null;
      }
    });
  }

  /** Where a timber dragged from `drag.from` would end: snapped, clamped, checked. */
  private aim(drag: Drag, x: number, y: number): void {
    const from = this.joints[drag.from];
    let dx = x - from.x;
    let dy = y - from.y;
    const length = Math.hypot(dx, dy);
    if (length > MAX_LENGTH) {
      dx *= MAX_LENGTH / length;
      dy *= MAX_LENGTH / length;
    }
    let ex = from.x + dx;
    let ey = Math.max(0.01, from.y + dy);
    const to = this.nearestJoint(ex, ey, SNAP, drag.from);
    if (to >= 0) {
      ex = this.joints[to].x;
      ey = this.joints[to].y;
    } else {
      ex = Math.round(ex / GRID) * GRID;
      ey = Math.round(ey / GRID) * GRID;
      // Road level is sticky, so decks come out straight.
      if (Math.abs(ey - DECK_Y) < 0.008) ey = DECK_Y;
    }
    const span = Math.hypot(ex - from.x, ey - from.y);
    const duplicate = to >= 0 && this.members.some((m) => (m.a === drag.from && m.b === to) || (m.b === drag.from && m.a === to));
    const insideBank = to < 0 && Math.abs(ex) > SPAN - 0.002 && ey < DECK_Y + 0.004;
    drag.x = ex;
    drag.y = ey;
    drag.to = to;
    drag.valid = span >= MIN_LENGTH && span <= MAX_LENGTH + 1e-6 && !duplicate && !insideBank && this.members.length < this.budget;
  }

  private place(drag: Drag): void {
    if (!drag.valid) return;
    let joint = -1;
    let to = drag.to;
    if (to < 0) {
      this.joints.push({ x: drag.x, y: drag.y, pinned: false });
      to = joint = this.joints.length - 1;
    }
    const member = { a: drag.from, b: to };
    this.members.push(member);
    this.history.push({ member, joint });
    playClunk(0.035);
  }

  private undo(): void {
    const last = this.history.pop();
    if (!last) return;
    const i = this.members.indexOf(last.member);
    if (i >= 0) this.members.splice(i, 1);
    if (last.joint >= 0 && last.joint === this.joints.length - 1 && !this.members.some((m) => m.a === last.joint || m.b === last.joint)) {
      this.joints.pop();
    }
    playTink(0.02);
  }

  /** Pinch a timber and let go without dragging: it comes away. */
  private remove(index: number): void {
    const [member] = this.members.splice(index, 1);
    const h = this.history.findIndex((e) => e.member === member);
    if (h >= 0) this.history.splice(h, 1);
    playTink(0.02);
  }

  private nearestJoint(x: number, y: number, within: number, except = -1): number {
    let best = -1;
    let bestD = within;
    this.joints.forEach((j, i) => {
      if (i === except) return;
      const d = Math.hypot(j.x - x, j.y - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private nearestMember(x: number, y: number, within: number): number {
    let best = -1;
    let bestD = within;
    this.members.forEach((m, i) => {
      const a = this.joints[m.a];
      const b = this.joints[m.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.min(0.85, Math.max(0.15, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** Is there an unbroken run of road-level timbers from bank to bank? */
  private roadAcross(): boolean {
    const reach = new Set<number>([this.nearestJoint(-SPAN, DECK_Y, 0.001)]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of this.members) {
        if (!this.isDeck(m)) continue;
        if (reach.has(m.a) !== reach.has(m.b)) {
          reach.add(m.a);
          reach.add(m.b);
          grew = true;
        }
      }
    }
    return reach.has(this.nearestJoint(SPAN, DECK_Y, 0.001));
  }

  private isDeck(m: DesignMember): boolean {
    return Math.abs(this.joints[m.a].y - DECK_Y) < 0.004 && Math.abs(this.joints[m.b].y - DECK_Y) < 0.004;
  }

  // ================================================================ Testing

  private startTest(): void {
    if (this.mode !== 'build' || this.members.length === 0) return;
    this.truss = new Truss();
    for (const j of this.joints) this.truss.addJoint(j.x, j.y, j.pinned);
    for (const m of this.members) this.truss.addMember(m.a, m.b, this.isDeck(m));
    this.built = this.joints.map((j) => [j.x, j.y]);
    this.cartX = CART_START;
    this.cartFall = { vy: 0, spin: 0, falling: false };
    this.failure = '';
    this.peak = 0;
    this.setMode('settle');
    playClick();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private test(dt: number): void {
    const truss = this.truss;
    for (const j of truss.joints) j.load = 0;

    if (this.mode === 'settle' && this.modeTime > 1.6) this.setMode('roll');
    if (this.mode === 'roll' || this.mode === 'failed' || this.mode === 'passed') this.moveCart(dt);

    const failed = this.mode === 'passed' ? [] : truss.step(Math.min(dt, 1 / 45), 16);
    for (const m of failed) this.breakMember(m);

    // Timber groans in proportion to how hard it is working.
    const worst = truss.members.reduce((w, m) => (m.broken ? w : Math.max(w, Math.abs(truss.usage(m)))), 0);
    if (this.mode === 'roll') this.peak = Math.max(this.peak, worst);
    this.creakIn -= dt * (0.5 + worst * 3);
    if (this.creakIn <= 0 && worst > 0.35 && this.mode !== 'passed') {
      this.creakIn = 0.4 + Math.random() * 0.5;
      playCreak(worst);
    }

    if (this.mode === 'settle' || this.mode === 'roll') {
      const sagged = truss.joints.some((j, i) => !j.pinned && Math.hypot(j.x - this.built[i][0], j.y - this.built[i][1]) > 0.03);
      if (failed.length) this.fail(failed[0].failure === 'buckled'
        ? 'A long timber buckled under the squeeze! Short struts are stronger: add joints, or brace it with triangles'
        : 'A timber snapped: pulled too hard. A deeper truss shares the load over more timbers');
      else if (sagged) this.fail(this.members.length < 3
        ? 'It just folds up. Timbers on pins can swing: only triangles hold their shape'
        : 'It folded! A square on pins racks over; a triangle cannot. Add diagonals');
      else if (this.cartFall.falling) this.fail('The road has a gap: the cart needs timbers all the way across at bank height');
    }
    if (this.mode === 'roll' && this.cartX >= CART_END) {
      this.setMode('passed');
      playClunk(0.05);
    }
    if (this.mode === 'passed' && this.modeTime > 1.8) this.done = true;
    if (this.mode === 'failed' && this.modeTime > 3.6) this.rebuild();
  }

  private fail(why: string): void {
    this.failure = why;
    this.mistakes++;
    this.setMode('failed');
  }

  private rebuild(): void {
    this.truss.reset(this.built);
    this.cartX = CART_START;
    this.cartFall = { vy: 0, spin: 0, falling: false };
    this.cart.rotation.set(0, 0, 0);
    this.setMode('build');
  }

  /** The cart rolls along the deck, pressing on the deck's joints. */
  private moveCart(dt: number): void {
    const truss = this.truss;
    if (this.cartFall.falling) {
      this.cartFall.vy -= 9.8 * dt;
      this.cartY += this.cartFall.vy * dt;
      this.cartX += CART_SPEED * 0.6 * dt;
      this.cart.rotation.z -= this.cartFall.spin * dt;
      if (this.cartY < RIVER_Y - 0.01) {
        this.cartY = RIVER_Y - 0.01;
        if (this.cartFall.vy < -0.3) this.splashAt(this.cartX);
        this.cartFall.vy = 0;
        this.cartFall.spin = 0;
      }
      return;
    }
    if (this.mode === 'roll') this.cartX += CART_SPEED * dt;
    const x = this.cartX;
    if (Math.abs(x) >= SPAN) {
      this.cartY = DECK_Y;
      return;
    }
    // Find the deck timber under the cart and share its weight between that timber's joints.
    for (const m of truss.members) {
      if (m.broken || !m.deck) continue;
      const a = truss.joints[m.a];
      const b = truss.joints[m.b];
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo || x > hi || hi - lo < 1e-4) continue;
      const t = (x - a.x) / (b.x - a.x);
      // Each of the two trusses carries half.
      const weight = (this.cartMass * 9.8) / 2;
      a.load += weight * (1 - t);
      b.load += weight * t;
      this.cartY = a.y + (b.y - a.y) * t;
      this.cart.rotation.z = Math.atan((b.y - a.y) / (b.x - a.x));
      return;
    }
    this.cartFall.falling = true;
    this.cartFall.spin = 2.5;
  }

  private breakMember(m: Member): void {
    playTink(0.06);
    playCreak(1);
    const a = this.truss.joints[m.a];
    const b = this.truss.joints[m.b];
    for (const z of [-HALF_W, HALF_W]) {
      const mesh = new Mesh(new BoxGeometry(m.rest * 0.5, BEAM, BEAM), timber());
      mesh.userData.keep = true;
      mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
      mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      this.group.add(mesh);
      this.debris.push({ mesh, vx: (Math.random() - 0.5) * 0.2, vy: 0.1, spin: (Math.random() - 0.5) * 8, age: 0 });
    }
  }

  private fallDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      d.vy -= 9.8 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y = Math.max(RIVER_Y - 0.002, d.mesh.position.y + d.vy * dt);
      d.mesh.rotation.z += d.spin * dt;
      if (d.mesh.position.y <= RIVER_Y - 0.002) {
        if (d.vy < -0.4) this.splashAt(d.mesh.position.x);
        d.vy = 0;
        d.spin *= 0.9;
      }
      if (d.age > 3) {
        this.group.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.debris.splice(i, 1);
      }
    }
  }

  private splashAt(x: number): void {
    for (let i = 0; i < 18; i++) {
      this.v.set(x + (Math.random() - 0.5) * 0.03, RIVER_Y + 0.004, (Math.random() - 0.5) * 0.04);
      this.s.set((Math.random() - 0.5) * 0.25, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.25);
      this.splash.emit(this.v, this.s, { life: 0.6 + Math.random() * 0.4, gravity: 2.5, drag: 0.5, size: [0.008, 0.02], from: 0xdcecf2, to: 0xb8d4e0, alpha: 0.8 });
    }
  }

  // ================================================================ Drawing

  private render(): void {
    const testing = this.mode !== 'build';
    const joints = testing ? this.truss.joints : this.joints;
    let beam = 0;
    let rails = 0;
    let plank = 0;
    let pin = 0;
    const list: Array<{ a: number; b: number; usage: number; deck: boolean }> = testing
      ? this.truss.members.filter((m) => !m.broken).map((m) => ({ a: m.a, b: m.b, usage: this.truss.usage(m), deck: m.deck }))
      : this.members.map((m) => ({ a: m.a, b: m.b, usage: 0, deck: this.isDeck(m) }));
    for (const m of list) {
      const a = joints[m.a];
      const b = joints[m.b];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      this.q.setFromAxisAngle(this.v.set(0, 0, 1), angle);
      // Stress view: blue when pulled, red when squeezed, deeper as it nears failure.
      // (Over-bright tints, so they read on dark timber.)
      const u = Math.abs(m.usage);
      if (testing && m.usage > 0) this.c.setRGB(1 - 0.5 * u, 1 + 0.4 * u, 1 + 2.4 * u);
      else if (testing && m.usage < 0) this.c.setRGB(1 + 2.6 * u, 1 - 0.4 * u, 1 - 0.6 * u);
      else this.c.setRGB(1, 1, 1);
      for (const z of [-HALF_W, HALF_W]) {
        this.m4.compose(this.v.set((a.x + b.x) / 2, (a.y + b.y) / 2, z), this.q, this.s.set(length + BEAM * 0.6, BEAM, BEAM));
        this.beams.setMatrixAt(beam, this.m4);
        this.beams.setColorAt(beam, this.c);
        beam++;
      }
      if (m.deck && rails < RAIL_CAPACITY - 6) {
        this.c.setRGB(1, 1, 1);
        for (const side of [-1, 1]) {
          const z = side * (HALF_W + 0.006);
          // A post at each end, and a handrail along the top.
          for (const end of [a, b]) {
            this.q2.setFromAxisAngle(this.zAxis, Math.PI / 2);
            this.m4.compose(this.v.set(end.x, end.y + RAIL_H / 2, z), this.q2, this.s.set(RAIL_H, BEAM * 0.7, BEAM * 0.7));
            this.beams.setMatrixAt(beam, this.m4);
            this.beams.setColorAt(beam, this.c);
            beam++;
            rails++;
          }
          this.m4.compose(this.v.set((a.x + b.x) / 2, (a.y + b.y) / 2 + RAIL_H, z), this.q, this.s.set(length + BEAM * 0.7, BEAM * 0.6, BEAM * 0.6));
          this.beams.setMatrixAt(beam, this.m4);
          this.beams.setColorAt(beam, this.c);
          beam++;
          rails++;
        }
      }
      if (m.deck) {
        const n = Math.max(1, Math.floor(length / 0.011));
        for (let i = 0; i < n && plank < 120; i++) {
          const t = (i + 0.5) / n;
          this.m4.compose(
            this.v.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + BEAM / 2 + 0.0015, 0),
            this.q,
            this.s.set(1, 1, 1),
          );
          this.planks.setMatrixAt(plank++, this.m4);
        }
      }
    }
    // The timber being drawn right now.
    const drag = this.drags.find((d) => d !== null) ?? null;
    this.ghost.visible = !!drag && this.mode === 'build';
    if (drag) {
      const a = this.joints[drag.from];
      const length = Math.hypot(drag.x - a.x, drag.y - a.y);
      this.ghost.position.set((a.x + drag.x) / 2, (a.y + drag.y) / 2, 0);
      this.ghost.rotation.set(0, 0, Math.atan2(drag.y - a.y, drag.x - a.x));
      this.ghost.scale.set(Math.max(0.001, length), 2.2, HALF_W * 2 / BEAM + 1);
      this.ghostMaterial.color.setHex(drag.valid ? 0x9cf09c : 0xf08a7a);
    }
    joints.forEach((j) => {
      for (const z of [-HALF_W - BEAM / 2 - 0.001, HALF_W + BEAM / 2 + 0.001]) {
        if (pin >= 96) return;
        this.m4.compose(this.v.set(j.x, j.y, z), this.q.identity(), this.s.set(1, 1, 1));
        this.pins.setMatrixAt(pin++, this.m4);
      }
    });
    this.beams.count = beam;
    this.planks.count = plank;
    this.pins.count = pin;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    this.planks.instanceMatrix.needsUpdate = true;
    this.pins.instanceMatrix.needsUpdate = true;

    // The cart, its wheels turning as it rolls.
    this.cart.position.set(this.cartX, this.cartY + BEAM / 2 + 0.003 + WHEEL_R, 0);
    for (const wheel of this.wheels) wheel.rotation.z = -this.cartX / WHEEL_R;
  }

  // =============================================================== Scenery

  private buildBanks(): void {
    let seed = 5;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const blocks: BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      // Dry-stone abutment: courses of rough blocks, broken joints.
      const courses = 6;
      const ch = DECK_Y / courses;
      for (let c = 0; c < courses; c++) {
        for (const face of ['river', 'front', 'back'] as const) {
          const length = face === 'river' ? BANK_D : BANK_W;
          let s = -length / 2 + (c % 2) * 0.012;
          while (s < length / 2 - 0.004) {
            const len = Math.min(length / 2 - s, 0.026 + rand() * 0.018);
            const g = new BoxGeometry(face === 'river' ? 0.02 : len * 0.95, ch * 0.92, face === 'river' ? len * 0.95 : 0.02);
            const cx = face === 'river' ? side * (SPAN + 0.01) : side * (SPAN + BANK_W / 2) + s + len / 2;
            const cz = face === 'river' ? s + len / 2 : (face === 'front' ? 1 : -1) * (BANK_D / 2 - 0.01);
            g.translate(cx, c * ch + ch / 2, cz);
            blocks.push(g);
            s += len;
          }
        }
      }
      // Fill and a road of packed earth on top, leading to the edge.
      const fill = new BoxGeometry(BANK_W - 0.02, DECK_Y - 0.004, BANK_D - 0.03);
      fill.translate(side * (SPAN + BANK_W / 2 + 0.005), (DECK_Y - 0.004) / 2, 0);
      blocks.push(fill);
    }
    const banks = new Mesh(mergeGeometries(blocks)!, stone());
    banks.name = 'Abutments';
    this.group.add(banks);
    for (const side of [-1, 1]) {
      const road = new Mesh(new BoxGeometry(BANK_W - 0.004, 0.004, HALF_W * 2 + 0.02), hardwood());
      road.position.set(side * (SPAN + BANK_W / 2), DECK_Y + 0.002, 0);
      this.group.add(road);
      const top = new Mesh(new BoxGeometry(BANK_W, 0.003, BANK_D), new MeshStandardMaterial({ color: 0x5a4a36, roughness: 1 }));
      top.position.set(side * (SPAN + BANK_W / 2), DECK_Y - 0.0005, 0);
      this.group.add(top);
    }
    // The river running between them.
    // A body of water a few centimetres deep, so it drowns the meadow grass.
    const river = new Mesh(new BoxGeometry(SPAN * 2 + 0.01, RIVER_Y, 0.5), new MeshStandardMaterial({ color: 0x3aa6c4, emissive: 0x0e5a78, emissiveIntensity: 0.2, roughness: 0.08, metalness: 0.1 }));
    river.position.set(0, RIVER_Y / 2, 0);
    this.group.add(river);
  }

  private buildCart(): void {
    const body = mergeGeometries([
      new BoxGeometry(0.05, 0.003, 0.034).translate(0, 0, 0),
      new BoxGeometry(0.05, 0.022, 0.003).translate(0, 0.011, 0.0155),
      new BoxGeometry(0.05, 0.022, 0.003).translate(0, 0.011, -0.0155),
      new BoxGeometry(0.003, 0.022, 0.034).translate(0.0235, 0.011, 0),
      new BoxGeometry(0.003, 0.022, 0.034).translate(-0.0235, 0.011, 0),
    ])!;
    this.cart.add(new Mesh(body, timber()));
    for (const x of [-0.016, 0.016]) {
      for (const z of [-0.02, 0.02]) {
        const wheel = new Mesh(new CylinderGeometry(WHEEL_R, WHEEL_R, 0.004, 14).rotateX(Math.PI / 2), iron());
        wheel.position.set(x, -0.002, z);
        // Turned every frame: keep them out of the static merge.
        wheel.userData.keep = true;
        this.wheels.push(wheel);
        this.cart.add(wheel);
      }
    }
    // A heap of ore, glinting.
    const lumps: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const g = new DodecahedronGeometry(0.006 + Math.random() * 0.004, 0);
      g.translate((Math.random() - 0.5) * 0.036, 0.016 + Math.random() * 0.01, (Math.random() - 0.5) * 0.022);
      lumps.push(g);
    }
    this.cart.add(new Mesh(mergeGeometries(lumps)!, new MeshStandardMaterial({ color: 0x5b4f48, metalness: 0.4, roughness: 0.55, flatShading: true })));
    this.group.add(this.cart);
  }

  // =================================================================== Dev

  /**
   * Dev: lay down a known design: a Warren truss that holds the first cart,
   * squares that fold, or the squares X-braced into a Pratt truss, which
   * carries even the ore cart.
   */
  private devDesign(kind: 'warren' | 'square' | 'braced'): void {
    if (this.mode !== 'build') return;
    this.members.length = 0;
    this.history.length = 0;
    this.joints.length = 4;
    const add = (x: number, y: number) => {
      this.joints.push({ x, y, pinned: false });
      return this.joints.length - 1;
    };
    const L = 0;
    const R = 2;
    if (kind === 'warren') {
      // A deck truss: road joints every 7.5 cm, a lower chord between the
      // banks' low anchors, and diagonals zigzagging under the road.
      const d1 = add(-0.075, DECK_Y);
      const d2 = add(0, DECK_Y);
      const d3 = add(0.075, DECK_Y);
      const b1 = add(-0.1125, LOW_Y);
      const b2 = add(-0.0375, LOW_Y);
      const b3 = add(0.0375, LOW_Y);
      const b4 = add(0.1125, LOW_Y);
      const lowL = 1;
      const lowR = 3;
      const pairs: Array<[number, number]> = [
        [L, d1], [d1, d2], [d2, d3], [d3, R],
        [lowL, b1], [b1, b2], [b2, b3], [b3, b4], [b4, lowR],
        [L, b1], [b1, d1], [d1, b2], [b2, d2], [d2, b3], [b3, d3], [d3, b4], [b4, R],
      ];
      for (const [a, b] of pairs) this.members.push({ a, b });
    } else {
      const d1 = add(-0.075, DECK_Y);
      const d2 = add(0, DECK_Y);
      const d3 = add(0.075, DECK_Y);
      const b1 = add(-0.075, LOW_Y);
      const b2 = add(0, LOW_Y);
      const b3 = add(0.075, LOW_Y);
      const pairs: Array<[number, number]> = [
        [L, d1], [d1, d2], [d2, d3], [d3, R],
        [1, b1], [b1, b2], [b2, b3], [b3, 3],
        [d1, b1], [d2, b2], [d3, b3],
      ];
      // Braced: crossed diagonals in every panel turn each square into triangles.
      if (kind === 'braced') pairs.push([L, b1], [d1, b2], [b2, d3], [b3, R], [1, d1], [b1, d2], [d2, b3], [3, d3]);
      for (const [a, b] of pairs) this.members.push({ a, b });
    }
    for (const member of this.members) this.history.push({ member, joint: -1 });
  }
}

