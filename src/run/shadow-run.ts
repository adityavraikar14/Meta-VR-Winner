import { sparkPace } from '../assist.js';
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playAwaken, playClick, playClunk, playHiss, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { PushButton } from '../push-button.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { HandShadows } from './hand-shadows.js';
import type { RunLevel } from './run-levels.js';
import { GATE_RADIUS, PAPER_BOUNDS, RunSim } from './run-sim.js';
import { ShardSet } from './shards.js';
import { DEMO, resetWorkshop, saveWorkshop } from './workshop.js';
import { capsule, poly, SPARK_RADIUS, TAG_HAND_LEFT, TAG_HAND_RIGHT, TAG_SHARD } from './spark-physics.js';

/**
 * A Shadow Run level on the paper screen: the spark, the cut-paper course,
 * the motes and the lantern gate, played with your hands' shadows (see
 * hand-shadows.ts for how a hand becomes solid shadow, and spark-physics.ts
 * for the collisions).
 *
 * Flow: the spark waits at the start, glowing, until a hand is in the light
 * (or a few seconds pass), then falls. Off the bottom of the screen it is
 * lost and comes back to the start (a retry). Through the gate: stars for
 * the gate, for all three motes, and for beating par time.
 */

const W = PAPER_BOUNDS.hw * 2;
const H = PAPER_BOUNDS.hh * 2;
/** The spark waits for a hand in the light; after this long it falls anyway. */
const WAIT = 12;
const RESPAWN = 0.7;
const WIN_HOLD = 1.3;
const TRAIL = 14;
const BURSTS = 28;
/** After this many misses, the caption gives the level's hint. */
const HINT_AFTER = 3;

/** Layers just in front of the paper (it is z = 0 in its own space). */
const Z_COURSE = 0.0016;
const Z_GATE = 0.003;
const Z_SPARK = 0.0045;
/** Where the player's eyes are in paper space (see ShadowStageSystem), for facing buttons. */
const VIEWER = new Vector3(0, 0.12, 1.0);
/** The Drop button (build levels), right of the paper, within reach. */
const DROP_AT = new Vector3(0.42, -0.02, 0.6);
const RESET_AT = new Vector3(0.42, -0.15, 0.6);

/** A marker's shadow counts only where it is on the visible part of the screen. */
function onScreen([x, y]: [number, number]): boolean {
  return Math.abs(x) < 0.47 && y > -0.12 && y < 0.33;
}

interface Burst {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

function glowTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The course: cut-paper ground in deep indigo with a lit top edge. */
function courseTexture(level: RunLevel): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * H) / W);
  const g = canvas.getContext('2d')!;
  const px = (x: number) => ((x + W / 2) / W) * canvas.width;
  const py = (y: number) => ((H / 2 - y) / H) * canvas.height;
  // Every piece filled first (they overlap at shared edges), then the outline once.
  const fill = g.createLinearGradient(0, 0, 0, canvas.height);
  fill.addColorStop(0, '#2c3170');
  fill.addColorStop(1, '#161936');
  g.fillStyle = fill;
  for (const piece of level.terrain) {
    g.beginPath();
    piece.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))));
    g.closePath();
    g.fill();
  }
  // The top surfaces, lit gold where the spark rolls.
  g.strokeStyle = 'rgba(255, 200, 110, 0.9)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (const piece of level.terrain) {
    for (let i = 0; i < piece.length; i++) {
      const [x0, y0] = piece[i];
      const [x1, y1] = piece[(i + 1) % piece.length];
      // Only edges facing up (their outward normal has a positive y): the ground's surface.
      const ex = x1 - x0;
      const ey = y1 - y0;
      const ny = -ex;
      if (ny <= 0 || Math.abs(y0 + PAPER_BOUNDS.hh) < 1e-3 && Math.abs(y1 + PAPER_BOUNDS.hh) < 1e-3) continue;
      if (Math.hypot(ex, ey) < 1e-4) continue;
      g.beginPath();
      g.moveTo(px(x0), py(y0));
      g.lineTo(px(x1), py(y1));
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function moteTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255, 236, 170, 0.9)');
  glow.addColorStop(1, 'rgba(255, 180, 60, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff6d6';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 7 : 20;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class ShadowRun {
  readonly group = new Group();
  readonly sim: RunSim;
  caption = '';
  done = false;
  stars = 0;

  private paper = new Group();
  private shadows = new HandShadows();
  private spark: Sprite;
  private halo: Sprite;
  private trail: Sprite[] = [];
  private trailAt: Array<[number, number]> = [];
  private bursts: Burst[] = [];
  private motes: Sprite[] = [];
  private gateGlow: Sprite;
  private gateRing: Mesh;
  private waitTime = 0;
  private lostTime = 0;
  private wonTime = 0;
  /** Workshop: whether the star's and ring's shadows are on the screen, the reset button, the last time. */
  private startOk = true;
  private gateOk = true;
  private reset: PushButton | null = null;
  private lastTime = 0;
  private time = 0;
  private bestScale = 0;
  /** Dev: a still test shadow bridging the level ("]" toggles it). */
  private devShadow = false;
  /** Build levels: the light shards, and the button that drops the spark. */
  private shards: ShardSet | null = null;
  private drop: PushButton | null = null;
  private tips: Vector3[] = [];
  private v = new Vector3();
  private m = new Matrix4();

  constructor(
    private root: Group,
    readonly level: RunLevel,
  ) {
    this.sim = new RunSim(level);
    this.group.add(this.paper);
    root.add(this.group);

    const course = new Mesh(
      new PlaneGeometry(W, H),
      new MeshBasicMaterial({ map: courseTexture(level), transparent: true, depthWrite: false }),
    );
    course.position.z = Z_COURSE;
    course.renderOrder = 3;
    this.paper.add(course);

    this.gateRing = new Mesh(
      new RingGeometry(GATE_RADIUS * 0.82, GATE_RADIUS, 40),
      new MeshBasicMaterial({ color: 0xffc95a, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.gateRing.position.set(level.gate[0], level.gate[1], Z_GATE);
    this.gateRing.renderOrder = 4;
    this.paper.add(this.gateRing);
    this.gateGlow = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,240,200,0.9)', 'rgba(255,190,80,0.45)'), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.gateGlow.position.set(level.gate[0], level.gate[1], Z_GATE);
    this.gateGlow.scale.setScalar(GATE_RADIUS * 3.2);
    this.gateGlow.renderOrder = 4;
    this.paper.add(this.gateGlow);

    const mote = moteTexture();
    for (const [x, y] of level.motes) {
      const sprite = new Sprite(new SpriteMaterial({ map: mote, transparent: true, depthWrite: false }));
      sprite.position.set(x, y, Z_GATE);
      sprite.scale.setScalar(0.048);
      sprite.renderOrder = 5;
      this.paper.add(sprite);
      this.motes.push(sprite);
    }

    const trailTexture = glowTexture('rgba(255,235,180,0.9)', 'rgba(255,170,60,0.35)');
    for (let i = 0; i < TRAIL; i++) {
      const s = new Sprite(new SpriteMaterial({ map: trailTexture, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.renderOrder = 6;
      this.paper.add(s);
      this.trail.push(s);
    }
    this.halo = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(200,240,255,0.95)', 'rgba(90,180,255,0.45)'), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.halo.scale.setScalar(SPARK_RADIUS * 9);
    this.halo.renderOrder = 7;
    this.spark = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(220,245,255,0.9)'), transparent: true, depthWrite: false }));
    this.spark.scale.setScalar(SPARK_RADIUS * 3);
    this.spark.renderOrder = 8;
    this.paper.add(this.halo, this.spark);

    const burstTexture = glowTexture('rgba(255,250,230,1)', 'rgba(255,200,90,0.6)');
    for (let i = 0; i < BURSTS; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map: burstTexture, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      sprite.visible = false;
      sprite.scale.setScalar(0.012);
      sprite.renderOrder = 7;
      this.paper.add(sprite);
      this.bursts.push({ sprite, vx: 0, vy: 0, life: 0 });
    }

    if (level.shards?.length) this.shards = new ShardSet(level.shards, this.paper);
    if (level.build) {
      this.drop = new PushButton(this.paper, 'Drop');
      this.drop.size = 0.75;
      this.drop.root.position.copy(DROP_AT);
    }
    if (level.workshop) {
      this.reset = new PushButton(this.paper, 'Reset');
      this.reset.size = 0.6;
      this.reset.root.position.copy(RESET_AT);
    }

    devInfo.run = () => `${level.id} ${this.sim.state} t=${this.sim.time.toFixed(1)} spark=(${this.sim.spark.x.toFixed(2)},${this.sim.spark.y.toFixed(2)}) motes=${this.sim.motesTaken} retries=${this.sim.retries} hands=${this.shadows.capsules.length} scale=${this.shadows.stats.scale.map((s) => s.toFixed(2)).join('/')}`;
    devActions[']'] = () => {
      // The Workshop: build the demonstration course; elsewhere, a test shadow that solves the level.
      if (this.level.workshop) this.shards?.restore(DEMO);
      else this.devShadow = !this.devShadow;
    };
    devActions['['] = () => this.release();
    this.place();
  }

  /** Keeps the paper group exactly on the paper (the stage can move to the table). */
  private alignToPaper(): void {
    const paper = stage.paper;
    if (!paper) return;
    this.root.updateWorldMatrix(true, false);
    this.m.copy(this.root.matrixWorld).invert().multiply(paper.matrixWorld);
    this.m.decompose(this.paper.position, this.paper.quaternion, this.paper.scale);
  }

  private release(): void {
    if (this.sim.state !== 'ready') return;
    this.sim.release();
    playWhoosh(0.25);
  }

  update(dt: number, hands: readonly HandState[] = []): void {
    this.time += dt;
    this.alignToPaper();
    this.shadows.update(dt);
    this.shards?.update(dt, hands);
    if (this.level.workshop) this.followMarkers();
    this.tips.length = 0;
    for (const hand of hands) if (hand.tracked) this.tips.push(hand.indexTip);
    if (this.drop) {
      this.drop.root.lookAt(this.paper.localToWorld(this.v.copy(VIEWER)));
      this.drop.show(this.sim.state === 'ready' && stage.playing);
      if (this.drop.update(dt, this.tips, false)) {
        playClick();
        if (this.level.workshop && (!this.startOk || !this.gateOk)) {
          playHiss(0.02, 0.2);
        } else {
          if (this.level.workshop && this.shards) saveWorkshop(this.shards.layout());
          this.release();
        }
      }
    }
    if (this.reset && this.shards) {
      this.reset.root.lookAt(this.paper.localToWorld(this.v.copy(VIEWER)));
      this.reset.show(this.sim.state === 'ready' && stage.playing);
      if (this.reset.update(dt, this.tips, false)) {
        playClick();
        this.shards.restore(resetWorkshop());
      }
    }
    const scale = Math.max(...this.shadows.stats.scale);
    if (scale > this.bestScale) this.bestScale = scale;

    const shapes = this.devShadow
      ? [...this.shadows.capsules, ...this.level.solution.filter((s) => !s.v).map((s) => capsule(s.a[0], s.a[1], s.b[0], s.b[1], s.r, TAG_HAND_RIGHT))]
      : this.shadows.capsules;
    const sim = this.sim;

    // Hand levels drop the spark when a hand is in the light; build levels wait for the Drop button.
    if (sim.state === 'ready' && stage.playing && !this.level.build) {
      this.waitTime += dt;
      if (this.shadows.capsules.length > 0 || this.devShadow || this.waitTime > WAIT) this.release();
    }
    const solids = this.devShadow && this.level.build
      ? this.level.solution.filter((s) => s.poly).map((s) => poly(s.poly!, TAG_SHARD))
      : this.shards?.shadows ?? [];
    // Relaxed (Settings): the spark's own time runs slower than real time.
    if (stage.playing || sim.state === 'won') sim.step(Math.min(dt, 1 / 30) * sparkPace(), shapes, solids);

    for (const event of sim.events) {
      if (event.type === 'bounce') {
        const hand = event.tag === TAG_HAND_LEFT || event.tag === TAG_HAND_RIGHT;
        if (event.speed > 0.15) {
          const v = Math.min(1, event.speed / 2);
          if (hand) playTink(0.03 + 0.05 * v);
          else playClunk(0.015 + 0.03 * v);
          this.burst(sim.spark.x, sim.spark.y - SPARK_RADIUS * 0.6, hand ? 5 : 3, 0.25 + v * 0.6);
        }
      } else if (event.type === 'mote') {
        playTinkle();
        const [x, y] = this.level.motes[event.index];
        this.motes[event.index].visible = false;
        this.burst(x, y, 10, 0.5);
      } else if (event.type === 'lost') {
        this.lostTime = 0;
        stage.cue = 'oops';
        playHiss(0.03, 0.35);
      } else if (event.type === 'won') {
        this.wonTime = 0;
        this.stars = sim.stars();
        playAwaken();
        this.burst(this.level.gate[0], this.level.gate[1], 20, 0.7);
      }
    }
    if (sim.state === 'lost') {
      this.lostTime += dt;
      if (this.lostTime > RESPAWN) {
        sim.reset();
        // Back at the start: it drops again as soon as a hand is in the light.
        this.waitTime = 0;
        this.trailAt.length = 0;
      }
    }
    if (sim.state === 'won') {
      this.wonTime += dt;
      if (this.wonTime > WIN_HOLD) {
        // The Workshop never ends: a success shows its time, and the spark waits for the next drop.
        if (this.level.workshop) {
          this.lastTime = sim.time;
          sim.reset(false);
          this.trailAt.length = 0;
        } else this.done = true;
      }
    }
    this.place(dt);
    this.updateCaption(scale);
  }

  /** Workshop: the star's shadow is the start, the ring's shadow the gate. */
  private followMarkers(): void {
    const shards = this.shards?.shards ?? [];
    const star = shards.find((s) => s.kind === 'star');
    const ring = shards.find((s) => s.kind === 'ring');
    if (!star || !ring) return;
    const start = star.shadowCentre();
    const gate = ring.shadowCentre();
    this.startOk = onScreen(start);
    this.gateOk = onScreen(gate);
    if (this.gateOk) this.level.gate = gate;
    if (this.startOk) {
      this.level.start = start;
      if (this.sim.state === 'ready') this.sim.spark.place(start[0], start[1]);
    }
  }

  private updateCaption(scale: number): void {
    const sim = this.sim;
    if (this.level.workshop) {
      if (sim.state === 'won') this.caption = `Through the gate in ${sim.time.toFixed(1)} s!`;
      else if (sim.state === 'live') this.caption = 'There it goes… catch it with your hands if it strays';
      else if (!this.startOk) this.caption = 'Hold the gold star in the light: its shadow is where the spark drops';
      else if (!this.gateOk) this.caption = 'Hold the gold ring in the light: its shadow is the gate';
      else this.caption = this.lastTime > 0
        ? `Last run: ${this.lastTime.toFixed(1)} s. Change your course and push Drop again`
        : this.level.ask;
      return;
    }
    if (sim.state === 'won') {
      this.caption = `Through the gate!  ${'★'.repeat(this.stars)}${'☆'.repeat(3 - this.stars)}  ·  ${sim.time.toFixed(1)} s`;
      return;
    }
    let text = sim.retries >= HINT_AFTER ? this.level.hint : this.level.ask;
    if (this.level.build) {
      if (sim.state === 'live') text = 'There it goes…';
    } else if (this.shadows.capsules.length === 0 && sim.state === 'live') text = 'Raise your hand into the lantern light';
    else if (this.level.showScale && scale > 0) text = `${text}  ·  your shadow ×${scale.toFixed(1)}`;
    const motes = `${sim.motesTaken}/${this.level.motes.length} ✦`;
    this.caption = `${text}  ·  ${motes}`;
  }

  /** Spark, trail, gate and motes where the simulation says. */
  private place(dt = 0): void {
    const sim = this.sim;
    const { x, y } = sim.spark;
    const visible = sim.state !== 'lost';
    const waiting = sim.state === 'ready';
    const pulse = waiting ? 1 + 0.18 * Math.sin(this.time * 6) : 1;
    this.spark.visible = this.halo.visible = visible && sim.state !== 'won' && this.startOk;
    this.spark.position.set(x, y, Z_SPARK);
    this.halo.position.set(x, y, Z_SPARK - 0.0005);
    this.halo.scale.setScalar(SPARK_RADIUS * 9 * pulse);
    // The trail: where the spark has been, fading.
    if (sim.state === 'live') {
      this.trailAt.unshift([x, y]);
      if (this.trailAt.length > TRAIL) this.trailAt.length = TRAIL;
    } else if (waiting) this.trailAt.length = 0;
    this.trail.forEach((s, i) => {
      const at = this.trailAt[i];
      s.visible = !!at && visible;
      if (!at) return;
      const k = 1 - i / TRAIL;
      s.position.set(at[0], at[1], Z_SPARK - 0.001);
      s.scale.setScalar(SPARK_RADIUS * (1.2 + 2.2 * k));
      (s.material as SpriteMaterial).opacity = 0.55 * k * k;
    });
    // Gate: a slow turn and a breathing glow; it flares when the spark is through.
    const flare = sim.state === 'won' ? Math.max(0, 1 - this.wonTime) : 0;
    this.gateRing.rotation.z = this.time * 0.6;
    // The gate follows its level (the Workshop's ring moves it).
    const [gx, gy] = this.level.gate;
    this.gateRing.position.set(gx, gy, Z_GATE);
    this.gateGlow.position.set(gx, gy, Z_GATE);
    this.gateRing.visible = this.gateGlow.visible = this.gateOk;
    this.gateGlow.scale.setScalar(GATE_RADIUS * (3 + 0.25 * Math.sin(this.time * 2.4) + 4 * flare));
    // Motes bob gently.
    this.motes.forEach((m, i) => {
      if (!m.visible) return;
      const [mx, my] = this.level.motes[i];
      m.position.set(mx, my + Math.sin(this.time * 2 + i) * 0.004, Z_GATE);
      m.material.rotation = this.time * 0.8 + i;
    });
    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy -= 0.8 * dt;
      b.sprite.position.x += b.vx * dt;
      b.sprite.position.y += b.vy * dt;
      (b.sprite.material as SpriteMaterial).opacity = Math.max(0, b.life / 0.5);
      b.sprite.visible = b.life > 0;
    }
  }

  private burst(x: number, y: number, count: number, speed: number): void {
    let made = 0;
    for (const b of this.bursts) {
      if (made >= count) break;
      if (b.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      b.vx = Math.cos(a) * v * 0.5;
      b.vy = Math.abs(Math.sin(a)) * v * 0.6;
      b.life = 0.35 + Math.random() * 0.2;
      b.sprite.position.set(x, y, Z_SPARK);
      b.sprite.visible = true;
      made++;
    }
  }

  /** Lines for this level's Journal page (the spark's science pages). */
  journal(): string[] {
    const sim = this.sim;
    return [
      `Through the gate in ${sim.time.toFixed(1)} s${sim.retries ? ` after ${sim.retries} miss${sim.retries > 1 ? 'es' : ''}` : ', first try'}`,
      `Motes ${sim.motesTaken} of ${sim.motes.length}`,
      this.bestScale > 0 ? `Your biggest shadow: ×${this.bestScale.toFixed(2)} your hand (D ÷ d)` : 'Your hand made the ground',
    ];
  }
}
