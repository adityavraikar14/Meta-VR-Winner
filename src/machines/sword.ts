import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusKnotGeometry,
  Vector3,
} from '@iwsdk/core';
import { playAwaken, playBoom, playClang, playSplat, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { Comic } from '../fight/comic.js';
import { stage } from '../stage-state.js';
import { ParticlePool } from './particles.js';

/**
 * The Shadow Blade: sword-defence training at the old shrine below Kai's pass.
 *
 * Hold your hand flat and edge-on, like a karate chop: on the screen its
 * shadow is a blade. Hold it still and the blade comes alive in your hand, a
 * black sword with a lantern-gold edge running on from your palm along your
 * fingers. Then the shrine's ink spirit tests you, one strike at a time, at
 * four guards (left, right, high, low); a ring shows where each will land.
 *
 *   1  Guard   four slow strikes, one to each guard: put the blade in the way.
 *   2  Speed   six faster ones, any guard.
 *   3  Parry   heavy strikes a block cannot stop: swing into them hard
 *              (blade tip faster than 1.2 m/s) and they fly back at the spirit.
 *   4  Dawn Cut  the blade fills with light: slash through three ink knots.
 *
 * The science: the tip of a blade moves much faster than the hand that turns
 * it, v = ω·r. Swing from the wrist and the tip does the work.
 */

const BLADE_LENGTH = 0.42;
const BLADE_WIDTH = 0.026;
/** The blade starts this far past the palm (the hilt is in your hand). */
const BLADE_START = 0.035;
/** The pose must be held this long; the blade then grows in over ALIVE_TIME. */
const SHAPE_HOLD = 0.8;
const ALIVE_TIME = 1.2;
/** Tip speeds, m/s: a parry, a cut, and a swing loud enough to hear. */
const PARRY_SPEED = 1.2;
const CUT_SPEED = 1.0;
const SWISH_SPEED = 1.6;
/** Guards around a point this far in front of the eyes and below them. */
const GUARD_AHEAD = 0.36;
const GUARD_BELOW = 0.2;
const GUARD_SIDE = 0.19;
const GUARD_HIGH = 0.12;
const GUARD_LOW = 0.15;
const TRAIL = 14;
const GOLD = new Color(0xffd27a);

type Guard = 'left' | 'right' | 'high' | 'low';
type Kind = 'bolt' | 'heavy' | 'knot';

interface Round {
  kind: Kind;
  need: number;
  /** Seconds from the screen to the guard, and the warning before launch. */
  travel: number;
  warn: number;
  /** A fixed order of guards (else random, never the same twice running). */
  order?: Guard[];
  intro: string;
}

const ROUNDS: Round[] = [
  { kind: 'bolt', need: 4, travel: 2.3, warn: 1.1, order: ['left', 'right', 'high', 'low'], intro: 'Guard! Hold your blade where the ring glows, across the strike’s path' },
  { kind: 'bolt', need: 6, travel: 1.4, warn: 0.7, intro: 'Faster now: six strikes, any guard' },
  { kind: 'heavy', need: 3, travel: 1.9, warn: 1.0, intro: 'Heavy strikes: a block will not stop them. Swing hard into each one to send it back' },
  { kind: 'knot', need: 3, travel: 0, warn: 0, order: ['left', 'high', 'right'], intro: 'Your blade is full of light: the Dawn Cut. Slash fast through each ink knot' },
];

interface Strike {
  kind: Kind;
  guard: Guard;
  from: Vector3;
  to: Vector3;
  /** Time since it was announced; it launches at `warn`. */
  time: number;
  warn: number;
  travel: number;
  state: 'warn' | 'fly' | 'blocked' | 'back' | 'gone';
  velocity: Vector3;
  mesh: Group;
  ring: Mesh;
  /** Time in its after-state (deflected, sent back). */
  after: number;
}

export class SwordTraining {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private phase: 'shape' | 'alive' | 'train' | 'won' = 'shape';
  private phaseTime = 0;
  private shapeTime = 0;
  private swordHand = -1;
  private lostTime = 0;
  private round = 0;
  private progress = 0;
  private gap = 0;
  private strike: Strike | null = null;
  private lastGuard: Guard | null = null;
  private orderIndex = 0;
  private finishIn = -1;
  private note = '';
  private noteTime = 0;
  private slowNoteTime = 0;

  private readonly blade = new Group();
  private readonly bladeMaterial: MeshStandardMaterial;
  private readonly edgeMaterial: MeshBasicMaterial;
  private readonly trail: Mesh;
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly samples: Array<{ mid: Vector3; tip: Vector3; speed: number }> = [];
  private readonly spirit = new Group();
  private readonly spiritGlow: MeshBasicMaterial;
  private readonly sparks = new ParticlePool({ count: 220, additive: true, soft: false });
  private readonly ink = new ParticlePool({ count: 160, additive: false, soft: true });
  private readonly comic = new Comic();

  /** Blade state, stage-local: where it starts and ends, which way it points, how fast the tip moves. */
  private readonly base = new Vector3();
  private readonly tip = new Vector3();
  private readonly lastTip = new Vector3();
  private readonly direction = new Vector3(0, 1, 0);
  private readonly normal = new Vector3(1, 0, 0);
  private tipSpeed = 0;
  private handSpeed = 0;
  private readonly lastPalm = new Vector3();
  private hasLast = false;
  private swishCooldown = 0;
  private length = 0;
  private charge = 0;

  private readonly head = new Vector3(0, 0.45, 0.6);
  private readonly source = new Vector3(0, 0.25, -0.5);
  private readonly tally = { blocks: 0, parries: 0, cuts: 0, hits: 0, bestTip: 0, handAtBest: 0 };

  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly u = new Vector3();
  private readonly q = new Quaternion();
  private readonly m = new Matrix4();

  constructor(private readonly floor: number) {
    this.group.name = 'SwordTraining';

    // ---- The blade: a slightly curved shadow-black blade, a gold edge glow, a round guard.
    const shape = new Shape();
    const w = BLADE_WIDTH / 2;
    shape.moveTo(-w, 0);
    shape.lineTo(-w * 0.9, BLADE_LENGTH * 0.86);
    shape.quadraticCurveTo(-w * 0.6, BLADE_LENGTH * 0.97, w * 0.5, BLADE_LENGTH);
    shape.quadraticCurveTo(w * 0.95, BLADE_LENGTH * 0.9, w, BLADE_LENGTH * 0.8);
    shape.lineTo(w, 0);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
    geometry.translate(0, 0, -0.002);
    this.bladeMaterial = new MeshStandardMaterial({ color: 0x07070d, roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0 });
    const body = new Mesh(geometry, this.bladeMaterial);
    this.edgeMaterial = new MeshBasicMaterial({ color: 0xffc75a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const edge = new Mesh(geometry, this.edgeMaterial);
    edge.scale.set(1.45, 1.03, 1.6);
    edge.position.y = -0.006;
    const guard = new Mesh(new CylinderGeometry(0.022, 0.022, 0.006, 20), new MeshStandardMaterial({ color: 0x1a1410, roughness: 0.5, metalness: 0.7 }));
    guard.position.y = -0.004;
    this.blade.add(edge, body, guard);
    this.blade.visible = false;

    // ---- The swing trail: a ribbon from mid-blade to tip over the last frames, bright only when fast.
    this.trailPositions = new Float32Array(TRAIL * 2 * 3);
    this.trailColors = new Float32Array(TRAIL * 2 * 3);
    const trail = new BufferGeometry();
    trail.setAttribute('position', new BufferAttribute(this.trailPositions, 3));
    trail.setAttribute('color', new BufferAttribute(this.trailColors, 3));
    const index: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    trail.setIndex(index);
    this.trail = new Mesh(trail, new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.trail.frustumCulled = false;
    for (let i = 0; i < TRAIL; i++) this.samples.push({ mid: new Vector3(), tip: new Vector3(), speed: 0 });

    // ---- The shrine's ink spirit: a dark, slowly turning knot of ink in front of the screen.
    const core = new Mesh(new IcosahedronGeometry(0.045, 1), new MeshStandardMaterial({ color: 0x0c0614, roughness: 0.4, metalness: 0.3, flatShading: true }));
    this.spiritGlow = new MeshBasicMaterial({ color: 0x8a4cff, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false });
    const halo = new Mesh(new SphereGeometry(0.075, 18, 12), this.spiritGlow);
    this.spirit.add(halo, core);

    for (const o of [this.blade, this.trail, this.spirit]) o.userData.keep = true;
    this.group.add(this.blade, this.trail, this.spirit, this.sparks.points, this.ink.points, this.comic.group);

    devInfo.sword = () => this.state;
    // Dev: [ brings the blade to life; ] answers the current strike perfectly.
    devActions['['] = () => {
      if (this.phase === 'shape') this.comeAlive(1);
    };
    devActions[']'] = () => this.devAnswer();
  }

  get state(): string {
    const s = this.strike;
    return `${this.phase} round=${this.round + 1} progress=${this.progress}/${ROUNDS[this.round]?.need ?? 0} strike=${s ? `${s.kind}:${s.guard}:${s.state}` : '-'} tip=${this.tipSpeed.toFixed(2)} hand=${this.swordHand} mistakes=${this.mistakes}`;
  }

  /** For the Inventor's Journal. */
  journal(): string[] {
    const t = this.tally;
    return [
      `${t.blocks} strikes blocked, ${t.parries} sent back, ${t.cuts} ink knots cut`,
      `Fastest blade tip ${t.bestTip.toFixed(1)} m/s, while your hand moved ${t.handAtBest.toFixed(1)} m/s`,
      'The tip outruns the hand: v = ω·r, so turning from the wrist makes the far end fly',
    ];
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[], headWorld: Vector3): void {
    if (!stage.playing) hands = [];
    this.phaseTime += dt;
    this.noteTime -= dt;
    this.slowNoteTime -= dt;
    this.swishCooldown -= dt;
    this.group.worldToLocal(this.head.copy(headWorld));
    if (stage.paper) {
      stage.paper.getWorldPosition(this.v);
      this.group.worldToLocal(this.source.copy(this.v));
      // Just in front of the screen, at eye-friendly height.
      this.u.subVectors(this.head, this.source).setY(0).normalize();
      this.source.addScaledVector(this.u, 0.06);
    }
    this.spirit.position.copy(this.source);
    this.spirit.rotation.y += dt * 0.8;
    this.spirit.rotation.x += dt * 0.5;
    this.spirit.visible = this.phase !== 'won' || this.phaseTime < 0.3;

    if (this.phase === 'shape') this.watchShape(dt, hands);
    else this.holdBlade(dt, hands);
    if (this.phase === 'alive') this.growBlade();
    if (this.phase === 'train') this.train(dt);
    this.animateStrike(dt);

    this.sparks.update(dt);
    this.ink.update(dt);
    this.comic.update(dt, this.head);
    if (this.finishIn > 0) {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.done = true;
    }
    this.caption = this.noteTime > 0 ? this.note : this.prompt();
  }

  /** A flat hand held edge-on: fingers straight, palm facing sideways. */
  private isBladePose(hand: HandState): boolean {
    const e = hand.ext;
    return hand.tracked && e.index > 0.7 && e.middle > 0.7 && e.ring > 0.65 && e.pinky > 0.55 && Math.abs(hand.palmNormal.y) < 0.6;
  }

  private watchShape(dt: number, hands: readonly HandState[]): void {
    const h = hands.findIndex((hand) => this.isBladePose(hand));
    this.shapeTime = h >= 0 ? this.shapeTime + dt : Math.max(0, this.shapeTime - dt * 2);
    if (h >= 0 && this.shapeTime >= SHAPE_HOLD) this.comeAlive(h);
  }

  private comeAlive(hand: number): void {
    this.swordHand = hand;
    this.phase = 'alive';
    this.phaseTime = 0;
    this.blade.visible = true;
    playAwaken();
  }

  private growBlade(): void {
    const k = Math.min(1, this.phaseTime / ALIVE_TIME);
    this.length = 1 - (1 - k) * (1 - k);
    if (k >= 1) {
      this.phase = 'train';
      this.phaseTime = 0;
      this.round = 0;
      this.progress = 0;
      this.gap = 2.2;
      this.say(`It came alive: a blade of shadow! ${ROUNDS[0].intro}`, 4.5);
    }
  }

  /** The blade follows the sword hand: from the palm, along the hand, its flat facing the palm. */
  private holdBlade(dt: number, hands: readonly HandState[]): void {
    let hand = hands[this.swordHand];
    if (!hand?.tracked) {
      this.lostTime += dt;
      // The other hand can take up the blade (make the pose with it).
      const other = hands.findIndex((h, i) => i !== this.swordHand && this.isBladePose(h));
      if (other >= 0 && this.lostTime > 0.6) {
        this.swordHand = other;
        hand = hands[other];
      }
    }
    if (!hand?.tracked) {
      this.blade.visible = false;
      this.trail.visible = false;
      this.hasLast = false;
      this.tipSpeed = 0;
      return;
    }
    this.lostTime = 0;
    this.blade.visible = true;
    this.trail.visible = true;

    const palm = this.group.worldToLocal(this.v.copy(hand.palm));
    const wrist = this.group.worldToLocal(this.w.copy(hand.wrist));
    const want = this.u.subVectors(palm, wrist);
    if (want.lengthSq() > 1e-6) {
      want.normalize();
      this.direction.lerp(want, 1 - Math.exp(-dt * 28)).normalize();
    }
    // The palm's normal, in stage-local space, made square to the blade.
    this.group.getWorldQuaternion(this.q).invert();
    const n = this.w.copy(hand.palmNormal).applyQuaternion(this.q);
    n.addScaledVector(this.direction, -n.dot(this.direction));
    if (n.lengthSq() > 1e-6) this.normal.lerp(n.normalize(), 1 - Math.exp(-dt * 20)).normalize();

    this.base.copy(palm).addScaledVector(this.direction, BLADE_START);
    const reach = BLADE_LENGTH * this.length;
    this.tip.copy(this.base).addScaledVector(this.direction, reach);
    const x = this.u.crossVectors(this.direction, this.normal).normalize();
    this.m.makeBasis(x, this.direction, this.normal);
    this.blade.quaternion.setFromRotationMatrix(this.m);
    this.blade.position.copy(this.base);
    this.blade.scale.set(1, Math.max(0.01, this.length), 1);
    const alive = this.length;
    this.bladeMaterial.opacity = Math.min(1, alive * 1.5);
    this.charge = Math.max(0, this.charge - dt * 0.6);
    const knots = this.phase === 'train' && ROUNDS[this.round]?.kind === 'knot';
    this.edgeMaterial.opacity = alive * (knots ? 0.75 + 0.2 * Math.sin(this.phaseTime * 8) : 0.22 + 0.5 * this.charge);
    this.edgeMaterial.color.setHex(knots ? 0xfff1b8 : 0xffc75a);

    // A tracking jump (the hand lost and found again) is not a swing: start the trail afresh.
    if (!this.hasLast || this.tip.distanceTo(this.lastTip) > 0.3) {
      for (const s of this.samples) {
        s.mid.lerpVectors(this.base, this.tip, 0.45);
        s.tip.copy(this.tip);
        s.speed = 0;
      }
      this.tipSpeed = this.handSpeed = 0;
      this.hasLast = false;
    }
    // Speeds: the tip, and the palm, for the Journal's v = ω·r.
    if (this.hasLast && dt > 0) {
      const tip = this.tip.distanceTo(this.lastTip) / dt;
      const handSpeed = palm.distanceTo(this.lastPalm) / dt;
      this.tipSpeed += (Math.min(tip, 8) - this.tipSpeed) * (1 - Math.exp(-dt * 30));
      this.handSpeed += (Math.min(handSpeed, 6) - this.handSpeed) * (1 - Math.exp(-dt * 30));
    }
    this.lastTip.copy(this.tip);
    this.lastPalm.copy(palm);
    this.hasLast = true;
    if (this.tipSpeed > SWISH_SPEED && this.swishCooldown <= 0 && this.length > 0.9) {
      playWhoosh(Math.min(1, this.tipSpeed / 4));
      this.swishCooldown = 0.35;
    }
    this.updateTrail();
  }

  private updateTrail(): void {
    const last = this.samples.pop()!;
    last.mid.lerpVectors(this.base, this.tip, 0.45);
    last.tip.copy(this.tip);
    last.speed = this.tipSpeed;
    this.samples.unshift(last);
    for (let i = 0; i < TRAIL; i++) {
      const s = this.samples[i];
      this.trailPositions.set([s.mid.x, s.mid.y, s.mid.z, s.tip.x, s.tip.y, s.tip.z], i * 6);
      const k = (1 - i / TRAIL) * Math.min(1, Math.max(0, (s.speed - 0.5) / 1.6));
      this.trailColors.set([GOLD.r * k * 0.3, GOLD.g * k * 0.3, GOLD.b * k * 0.3, GOLD.r * k, GOLD.g * k, GOLD.b * k], i * 6);
    }
    const g = this.trail.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  // ================================================================ Training

  private train(dt: number): void {
    const round = ROUNDS[this.round];
    if (!round) return;
    if (this.strike) return;
    this.gap -= dt;
    if (this.gap <= 0) this.announce(round);
  }

  private guardPoint(guard: Guard, out: Vector3): Vector3 {
    const ahead = this.u.subVectors(this.source, this.head).setY(0);
    if (ahead.lengthSq() < 1e-4) ahead.set(0, 0, -1);
    ahead.normalize();
    const right = this.w.set(-ahead.z, 0, ahead.x);
    out.copy(this.head).addScaledVector(ahead, GUARD_AHEAD);
    out.y -= GUARD_BELOW;
    if (guard === 'left') out.addScaledVector(right, -GUARD_SIDE);
    if (guard === 'right') out.addScaledVector(right, GUARD_SIDE);
    if (guard === 'high') out.y += GUARD_HIGH;
    if (guard === 'low') out.y -= GUARD_LOW;
    out.y = Math.max(out.y, this.floor + 0.08);
    return out;
  }

  private pickGuard(round: Round): Guard {
    if (round.order) return round.order[this.orderIndex % round.order.length];
    const all: Guard[] = ['left', 'right', 'high', 'low'];
    const options = all.filter((g) => g !== this.lastGuard);
    return options[Math.floor(Math.random() * options.length)];
  }

  /** The next strike: its landing ring glows, then it launches from the spirit. */
  private announce(round: Round): void {
    const guard = this.pickGuard(round);
    this.lastGuard = guard;
    const to = this.guardPoint(guard, new Vector3());
    const knot = round.kind === 'knot';
    const heavy = round.kind === 'heavy';
    const mesh = new Group();
    if (knot) {
      mesh.add(new Mesh(new TorusKnotGeometry(0.03, 0.009, 48, 8), new MeshStandardMaterial({ color: 0x0c0614, roughness: 0.35, metalness: 0.4 })));
      mesh.add(new Mesh(new SphereGeometry(0.05, 16, 10), new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false })));
      mesh.position.copy(to);
      mesh.scale.setScalar(0.01);
    } else {
      const r = heavy ? 0.034 : 0.022;
      mesh.add(new Mesh(new SphereGeometry(r, 16, 10), new MeshStandardMaterial({ color: 0x0c0614, roughness: 0.3, metalness: 0.3 })));
      mesh.add(new Mesh(new SphereGeometry(r * 1.8, 16, 10), new MeshBasicMaterial({ color: heavy ? 0xff6a2a : 0x9a5cff, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false })));
      mesh.position.copy(this.source);
      mesh.visible = false;
    }
    const ring = new Mesh(new RingGeometry(0.045, 0.058, 32), new MeshBasicMaterial({ color: knot ? 0xffd27a : heavy ? 0xff6a2a : 0xff4a6a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    ring.position.copy(to);
    ring.lookAt(this.head);
    for (const o of [mesh, ring]) o.userData.keep = true;
    this.group.add(mesh, ring);
    this.strike = {
      kind: round.kind,
      guard,
      from: this.source.clone(),
      to,
      time: 0,
      warn: round.warn,
      travel: round.travel,
      state: knot ? 'fly' : 'warn',
      velocity: new Vector3(),
      mesh,
      ring,
      after: 0,
    };
    if (!knot) playTink(0.025);
  }

  private animateStrike(dt: number): void {
    const s = this.strike;
    if (!s) return;
    s.time += dt;
    const ringMaterial = s.ring.material as MeshBasicMaterial;
    if (s.state === 'warn') {
      ringMaterial.opacity = 0.5 + 0.4 * Math.sin(s.time * 14);
      s.ring.scale.setScalar(1.6 - 0.6 * Math.min(1, s.time / s.warn));
      this.spiritGlow.opacity = 0.35 + 0.5 * Math.min(1, s.time / s.warn);
      if (s.time >= s.warn) {
        s.state = 'fly';
        s.time = 0;
        s.mesh.visible = true;
        this.spiritGlow.opacity = 0.35;
        playWhoosh(s.kind === 'heavy' ? 0.6 : 0.3);
      }
      return;
    }
    if (s.state === 'fly' && s.kind === 'knot') {
      // Knots hang at their guard, turning, until cut.
      ringMaterial.opacity = 0.35 + 0.25 * Math.sin(this.phaseTime * 5);
      s.mesh.scale.setScalar(Math.min(1, s.time * 3));
      s.mesh.rotation.y += dt * 2;
      s.mesh.rotation.x += dt * 1.3;
      if (this.touches(s.mesh.position, 0.045)) {
        if (this.tipSpeed >= CUT_SPEED) this.cut(s);
        else if (this.slowNoteTime <= 0) {
          this.say(`Faster! Slash through it (${this.tipSpeed.toFixed(1)} of ${CUT_SPEED.toFixed(1)} m/s at the tip)`, 1.8);
          this.slowNoteTime = 2;
        }
      }
      return;
    }
    if (s.state === 'fly') {
      ringMaterial.opacity = 0.75;
      // A few sub-steps so a fast swing cannot pass through a strike unseen.
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const k = Math.min(1.1, (s.time - dt + (dt * (i + 1)) / steps) / s.travel);
        s.mesh.position.lerpVectors(s.from, s.to, k);
        s.mesh.position.y += Math.sin(Math.min(1, k) * Math.PI) * 0.05;
        if (k > 0.2 && this.touches(s.mesh.position, s.kind === 'heavy' ? 0.04 : 0.028)) {
          this.contact(s);
          return;
        }
      }
      if (Math.random() < 0.6) this.ink.emit(s.mesh.position, new Vector3((Math.random() - 0.5) * 0.05, 0.02, (Math.random() - 0.5) * 0.05), { life: 0.35, size: [0.012, 0.002], from: 0x14081e, alpha: 0.7 });
      if (s.time / s.travel >= 1.1) this.hitPlayer(s);
      return;
    }
    if (s.state === 'blocked') {
      s.after += dt;
      s.velocity.y -= 4 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.scale.setScalar(Math.max(0.01, 1 - s.after / 0.7));
      ringMaterial.opacity = Math.max(0, 0.75 - s.after * 2);
      if (s.after > 0.7) this.clearStrike(0.6);
      return;
    }
    if (s.state === 'back') {
      // Sent back along its path to the spirit, faster than it came.
      s.after += dt;
      const k = Math.min(1, s.after / 0.45);
      s.mesh.position.lerpVectors(s.to, s.from, k);
      ringMaterial.opacity = Math.max(0, 0.75 - s.after * 3);
      if (k >= 1) {
        playBoom(0.07);
        this.burst(s.from, 40, 0xff9a3a, 0.5);
        this.comic.pop('BACK AT YOU!', this.v.copy(s.from).setY(s.from.y + 0.1), '#ff9a3a', 0.8, 1.2);
        this.clearStrike(1);
      }
    }
  }

  /** True if the blade passes within `radius` (plus its own half-width) of a point. */
  private touches(point: Vector3, radius: number): boolean {
    if (!this.blade.visible || this.length < 0.9) return false;
    return distanceToSegment(point, this.base, this.tip, this.v) < radius + BLADE_WIDTH * 0.6;
  }

  private contact(s: Strike): void {
    const at = s.mesh.position;
    const best = this.noteSpeed();
    if (s.kind === 'heavy' && this.tipSpeed >= PARRY_SPEED) {
      s.state = 'back';
      s.after = 0;
      this.tally.parries++;
      this.progress++;
      this.charge = 1;
      playClang(1, 0.1);
      this.burst(at, 34, 0xffd27a, 0.6);
      this.comic.pop('PARRY!', this.v.copy(at).setY(at.y + 0.07), '#ffd23a', 0.7, 1.1);
      this.say(`Parried at ${best.toFixed(1)} m/s!`, 1.6);
      this.advance();
      return;
    }
    // A block: it glances off the blade.
    s.state = 'blocked';
    s.after = 0;
    const off = this.v.subVectors(at, this.closest(at)).setLength(1).addScaledVector(this.direction, 0.3);
    s.velocity.copy(off).multiplyScalar(1.2).setY(off.y * 1.2 + 0.6);
    playClang(0.3, 0.08);
    this.burst(at, 22, 0xffd27a, 0.4);
    if (s.kind === 'heavy') {
      // Not enough: a heavy strike is only stopped by a swing into it.
      this.mistakes++;
      this.say(`Blocked, but it needs a swing: ${this.tipSpeed.toFixed(1)} m/s at the tip; ${PARRY_SPEED.toFixed(1)} sends it back`, 2.4);
      return;
    }
    this.tally.blocks++;
    this.progress++;
    this.charge = Math.min(1, this.charge + 0.5);
    this.comic.pop(['BLOCK!', 'GUARD!', 'CLANG!'][this.tally.blocks % 3], this.w.copy(at).setY(at.y + 0.07), '#ffd23a', 0.6, 0.9);
    this.advance();
  }

  private cut(s: Strike): void {
    const best = this.noteSpeed();
    s.state = 'gone';
    this.tally.cuts++;
    this.progress++;
    playWhoosh(0.9);
    playClang(0.6, 0.06);
    this.burst(s.mesh.position, 50, 0xfff1b8, 0.7);
    for (let i = 0; i < 24; i++) this.ink.emit(s.mesh.position, new Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.25, (Math.random() - 0.5) * 0.4), { life: 0.7, gravity: 1.5, size: [0.014, 0.003], from: 0x14081e, alpha: 0.8 });
    this.comic.pop(`CUT! ${best.toFixed(1)} m/s`, this.v.copy(s.mesh.position).setY(s.mesh.position.y + 0.08), '#fff1b8', 0.7, 1.2);
    this.clearStrike(0.7);
    this.advance();
  }

  private hitPlayer(s: Strike): void {
    this.mistakes++;
    this.tally.hits++;
    playSplat(0.08);
    for (let i = 0; i < 26; i++) this.ink.emit(s.to, new Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.3, (Math.random() - 0.5) * 0.5), { life: 0.6, gravity: 2, size: [0.016, 0.004], from: 0x14081e, alpha: 0.85 });
    const where = { left: 'left', right: 'right', high: 'high', low: 'low' }[s.guard];
    this.say(`Hit! That one came ${where}: hold your blade across the glowing ring`, 2.2);
    // The same guard comes again until it is blocked (advance() moves the order on).
    this.clearStrike(1.4);
  }

  /** One more done in this round; on to the next round, or the end. */
  private advance(): void {
    const round = ROUNDS[this.round];
    this.orderIndex++;
    if (this.progress < round.need) return;
    this.round++;
    this.progress = 0;
    this.orderIndex = 0;
    this.lastGuard = null;
    if (this.round >= ROUNDS.length) {
      this.phase = 'won';
      this.phaseTime = 0;
      this.finishIn = 2.8;
      playTinkle();
      this.burst(this.source, 70, 0xffd27a, 0.8);
      this.comic.pop('SHADOW BLADE!', this.v.copy(this.source).setY(this.source.y + 0.12), '#ffd23a', 1, 2);
      return;
    }
    this.say(ROUNDS[this.round].intro, 4);
    playAwaken();
  }

  private clearStrike(gap: number): void {
    const s = this.strike;
    if (!s) return;
    this.group.remove(s.mesh, s.ring);
    s.mesh.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshBasicMaterial).dispose();
      }
    });
    s.ring.geometry.dispose();
    (s.ring.material as MeshBasicMaterial).dispose();
    this.strike = null;
    const round = ROUNDS[this.round];
    this.gap = round && this.progress === 0 && this.round > 0 ? Math.max(gap, 3.2) : gap;
  }

  private closest(point: Vector3): Vector3 {
    const ab = this.u.subVectors(this.tip, this.base);
    const t = Math.max(0, Math.min(1, this.w.subVectors(point, this.base).dot(ab) / Math.max(1e-6, ab.lengthSq())));
    return new Vector3().copy(this.base).addScaledVector(ab, t);
  }

  /** Keeps the fastest tip (and the hand's speed then) for the Journal; returns the tip speed. */
  private noteSpeed(): number {
    if (this.tipSpeed > this.tally.bestTip) {
      this.tally.bestTip = this.tipSpeed;
      this.tally.handAtBest = this.handSpeed;
    }
    return this.tipSpeed;
  }

  private prompt(): string {
    if (this.phase === 'won') return 'You learned the Shadow Blade. Kai is waiting at the top of the pass.';
    if (this.phase === 'shape') {
      return this.shapeTime > 0.1
        ? 'Hold it still… the blade is coming alive'
        : 'Make a blade with your shadow: hold your hand flat, fingers together, edge-on like a karate chop';
    }
    if (this.phase === 'alive') return 'Your shadow is becoming a sword…';
    if (!this.blade.visible) return 'Raise your sword hand back into view';
    const round = ROUNDS[this.round];
    const s = this.strike;
    const count = `${this.progress} of ${round.need}`;
    if (round.kind === 'knot') return `Dawn Cut · slash through the ink knot · ${count}`;
    if (s?.state === 'warn') return `${s.guard.toUpperCase()}! Blade across the ring · ${count}`;
    if (round.kind === 'heavy') return `Heavy strike: swing into it, hard · ${count} sent back`;
    return `Block each strike · ${count}`;
  }

  private say(text: string, seconds: number): void {
    this.note = text;
    this.noteTime = seconds;
  }

  private burst(at: Vector3, count: number, color: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      this.sparks.emit(at, new Vector3(Math.cos(a) * r, u, Math.sin(a) * r).multiplyScalar(speed * (0.4 + Math.random() * 0.6)), { life: 0.35 + Math.random() * 0.35, gravity: 1.5, size: [0.007, 0.002], from: color, to: 0x402010 });
    }
  }

  /** Dev: the blade alive and the current strike answered perfectly. */
  private devAnswer(): void {
    if (this.phase === 'shape') this.comeAlive(1);
    if (this.phase === 'alive') {
      this.phaseTime = ALIVE_TIME;
      this.growBlade();
    }
    if (this.phase !== 'train') return;
    // A strike still glancing away or flying back: done with it now.
    if (this.strike && this.strike.state !== 'warn' && this.strike.state !== 'fly') this.clearStrike(0);
    if (!this.strike) this.announce(ROUNDS[this.round]);
    const s = this.strike!;
    if (s.state === 'warn') {
      s.state = 'fly';
      s.time = 0;
      s.mesh.visible = true;
    }
    if (s.state !== 'fly') return;
    if (s.kind !== 'knot') s.mesh.position.lerpVectors(s.from, s.to, 0.8);
    this.base.copy(s.mesh.position).addScaledVector(this.v.set(0, -1, 0), 0.1);
    this.tip.copy(s.mesh.position).addScaledVector(this.v.set(0, 1, 0), 0.1);
    this.tipSpeed = 2.4;
    if (s.kind === 'knot') this.cut(s);
    else this.contact(s);
  }
}

/** Distance from a point to the segment a–b. */
function distanceToSegment(p: Vector3, a: Vector3, b: Vector3, scratch: Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len = abx * abx + aby * aby + abz * abz;
  const t = len > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len)) : 0;
  scratch.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return scratch.distanceTo(p);
}
