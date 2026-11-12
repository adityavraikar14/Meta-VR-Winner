import { FONT } from './ui-theme.js';
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playBoing, playChirp, playClick, playInk, playSqueak } from './audio.js';
import { ellipse, INK, rabbit, star } from './puppets.js';
import { MASK_HEIGHT, MASK_WIDTH, PAPER_HEIGHT, PAPER_WIDTH, stage } from './stage-state.js';

/** One mask cell in metres (the mask covers the paper exactly). */
const CELL = PAPER_WIDTH / MASK_WIDTH;

/** Body box in cells: half width and height, feet at (x, y). */
const HALF_W = 1.8;
const HEIGHT = 4.6;
/** Gravity in cells/s² (about 1.1 m/s² on the paper: a slow, readable fall). */
const GRAVITY = 90;
const WALK = 6;
const HOP_SPEED = 26;
const HOP_REACH = 6;
const STEP_UP = 2;
/** It steps down this far without fuss; deeper drops count as a gap. */
const MAX_DROP = 4;
/** Ledges up to this high are hopped onto (apex is HOP_SPEED² / 2g ≈ 3.75 cells). */
const HOP_UP = 3.4;
const SUBSTEPS = 3;

/** Pinch hysteresis (thumb-to-index tip distance, metres) and release debounce. */
const PINCH_START = 0.02;
const PINCH_END = 0.035;
const RELEASE_DELAY = 0.075;
/** A new point every this many metres of hand travel. */
const INK_SPACING = 0.006;
/** Half-thickness of a drawn line, in cells. */
const INK_RADIUS = 0.9;
const MAX_INK_POINTS = 900;

/**
 * A shadow-world level: paper-cut cliffs and where the little friend starts
 * and wants to go, all in mask cells (row 0 is the bottom of the paper).
 */
export interface WalkLevel {
  /** Solid columns x0..x1-1, filled from the bottom of the paper up to row `top`. */
  cliffs: Array<[x0: number, x1: number, top: number]>;
  start: [number, number];
  goal: [number, number];
  /** How many shadow-ink lines the player may draw at once (none if absent). */
  ink?: number;
}

interface Stroke {
  /** Paper-space points of the thread in the air. */
  air: Vector3[];
  /** Where each point's shadow lands, in cells. */
  cells: Array<[number, number]>;
}

type Mood = 'walk' | 'edge' | 'wall' | 'hop' | 'fall' | 'cheer' | 'gone';

/**
 * The flat world on the paper. Hand shadows (from the mask) and paper-cut
 * cliffs are solid ground for a tiny shadow friend who walks, hops gaps it
 * can manage, waits nervously at the ones it can't, and rides on your hand.
 */
export class ShadowWorld {
  private root = new Group();
  private terrain = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  private terrainCanvas: HTMLCanvasElement;
  private terrainTexture: CanvasTexture;
  private terrainMaterial: MeshBasicMaterial;
  private critter: Mesh;
  private goalStar: Mesh;
  private bubble: Mesh;
  private bubbleCanvas: HTMLCanvasElement;
  private bubbleTexture: CanvasTexture;
  private bubbleText = '';

  private level: WalkLevel | null = null;
  private drawn = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  private strokes: Stroke[] = [];
  private drawing: Array<Stroke | null> = [null, null];
  private releaseTime = [0, 0];
  private inkMesh: InstancedMesh;
  private inkDirty = false;
  /** Seconds since the last pen stroke ended; the air thread fades after it. */
  private sinceInk = 99;
  private mat = new Matrix4();
  private appear = 0;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private dir = 1;
  private grounded = false;
  private moodTime = 0;
  private walkPhase = 0;
  private squash = 0;
  private respawn = 0;
  private time = 0;
  /**
   * A shadow that swallowed the friend whole: until it is clear of hand
   * shadows again, only the paper-cut ground is solid for it.
   */
  private phasing = false;

  mood: Mood = 'gone';
  /** Times the friend fell off the paper this level. */
  falls = 0;
  reached = false;

  constructor(parent: Object3D) {
    this.root.name = 'ShadowWorld';
    this.root.visible = false;
    this.root.position.z = 0.0035;

    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = 640;
    this.terrainCanvas.height = Math.round((640 * MASK_HEIGHT) / MASK_WIDTH);
    this.terrainTexture = new CanvasTexture(this.terrainCanvas);
    this.terrainTexture.colorSpace = SRGBColorSpace;
    this.terrainMaterial = new MeshBasicMaterial({ map: this.terrainTexture, transparent: true, depthWrite: false });
    const terrain = new Mesh(new PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT), this.terrainMaterial);
    terrain.renderOrder = 3;
    this.root.add(terrain);

    this.critter = spriteMesh(drawCritter(), 0.1);
    this.critter.renderOrder = 4;
    this.root.add(this.critter);

    this.goalStar = spriteMesh(drawGoal(), 0.06, false);
    this.goalStar.renderOrder = 4;
    this.root.add(this.goalStar);

    this.inkMesh = new InstancedMesh(
      new SphereGeometry(1, 8, 6),
      new MeshBasicMaterial({ color: 0x2a1608 }),
      MAX_INK_POINTS,
    );
    this.inkMesh.name = 'ShadowInk';
    this.inkMesh.count = 0;
    this.inkMesh.frustumCulled = false;
    (this.inkMesh.material as MeshBasicMaterial).transparent = true;
    this.root.add(this.inkMesh);

    this.bubbleCanvas = document.createElement('canvas');
    this.bubbleCanvas.width = 64;
    this.bubbleCanvas.height = 64;
    this.bubbleTexture = new CanvasTexture(this.bubbleCanvas);
    this.bubbleTexture.colorSpace = SRGBColorSpace;
    this.bubble = new Mesh(
      new PlaneGeometry(0.03, 0.03),
      new MeshBasicMaterial({ map: this.bubbleTexture, transparent: true, depthWrite: false }),
    );
    this.bubble.renderOrder = 5;
    this.root.add(this.bubble);
    parent.add(this.root);
  }

  /** Builds a level's cliffs and drops the friend in at the start; null clears the world. */
  load(level: WalkLevel | null): void {
    this.level = level;
    this.terrain.fill(0);
    this.strokes = [];
    this.drawing = [null, null];
    this.rebuildInk();
    if (!level) return;
    for (const [x0, x1, top] of level.cliffs) {
      for (let cx = x0; cx < x1; cx++) {
        for (let cy = 0; cy < top; cy++) this.terrain[cy * MASK_WIDTH + cx] = 1;
      }
    }
    this.drawTerrain();
    this.falls = 0;
    this.reached = false;
    this.spawn();
  }

  /** Lines drawn so far this level. */
  get inkUsed(): number {
    return this.strokes.length;
  }

  /** First and last cell of the newest line, for tests. */
  get lastLine(): number[] {
    const cells = this.strokes[this.strokes.length - 1]?.cells;
    if (!cells?.length) return [];
    const [a, b] = [cells[0], cells[cells.length - 1]];
    return [a[0], a[1], b[0], b[1]].map((n) => Math.round(n));
  }

  /** Whether the current level lets the player draw. */
  get canDraw(): boolean {
    return (this.level?.ink ?? 0) > 0;
  }

  /**
   * Feeds one hand's pinch: `gap` is the thumb-to-index tip distance and
   * `point` the pinch in paper space. A pinch pulls a thread of shadow ink
   * through the air; its shadow on the paper is solid ground.
   */
  drawInput(hand: number, tracked: boolean, gap: number, point: Vector3, dt: number): void {
    const level = this.level;
    if (!level?.ink) return;
    let stroke = this.drawing[hand];
    if (!tracked || gap > PINCH_END) {
      this.releaseTime[hand] += dt;
      if (stroke && this.releaseTime[hand] >= RELEASE_DELAY) this.endStroke(hand);
      return;
    }
    this.releaseTime[hand] = 0;
    if (!stroke) {
      if (gap > PINCH_START) return;
      stroke = { air: [], cells: [] };
      this.drawing[hand] = stroke;
      this.strokes.push(stroke);
      // Out of ink: the oldest line fades away.
      if (this.strokes.length > level.ink) {
        this.strokes.shift();
        this.rebuildInk();
      }
    }
    const last = stroke.air[stroke.air.length - 1];
    if (last && last.distanceTo(point) < INK_SPACING) return;
    const cell = shadowCell(point);
    if (!cell) return;
    stroke.air.push(point.clone());
    stroke.cells.push(cell);
    const n = stroke.cells.length;
    this.stampSegment(n > 1 ? stroke.cells[n - 2] : cell, cell);
    if (n % 4 === 1) playInk();
    this.inkDirty = true;
  }

  private endStroke(hand: number): void {
    const stroke = this.drawing[hand]!;
    this.drawing[hand] = null;
    if (stroke.air.length < 3) {
      // A tap, not a line.
      this.strokes.splice(this.strokes.indexOf(stroke), 1);
      this.rebuildInk();
      return;
    }
    playClick();
  }

  /** Marks the cells under a line segment as solid. */
  private stampSegment(a: [number, number], b: [number, number]): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
    const r = Math.ceil(INK_RADIUS);
    for (let i = 0; i <= steps; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / steps;
      const y = a[1] + ((b[1] - a[1]) * i) / steps;
      for (let cy = Math.floor(y) - r; cy <= Math.floor(y) + r; cy++) {
        for (let cx = Math.floor(x) - r; cx <= Math.floor(x) + r; cx++) {
          if (cx < 0 || cy < 0 || cx >= MASK_WIDTH || cy >= MASK_HEIGHT) continue;
          if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= INK_RADIUS + 0.35) this.drawn[cy * MASK_WIDTH + cx] = 1;
        }
      }
    }
  }

  private rebuildInk(): void {
    this.drawn.fill(0);
    for (const stroke of this.strokes) {
      stroke.cells.forEach((cell, i) => this.stampSegment(i > 0 ? stroke.cells[i - 1] : cell, cell));
    }
    this.inkDirty = true;
  }

  get active(): boolean {
    return this.level !== null;
  }

  /** Paper-local position of the friend, for captions or effects. */
  get position(): [number, number] {
    return [toPaperX(this.x), toPaperY(this.y)];
  }

  update(dt: number): void {
    const shown = this.level !== null;
    this.appear += ((shown ? 1 : 0) - this.appear) * Math.min(1, dt * 4);
    this.root.visible = this.appear > 0.01;
    this.terrainMaterial.opacity = this.appear;
    if (!shown) return;
    this.time += dt;
    this.moodTime += dt;
    if (this.inkDirty) {
      this.inkDirty = false;
      this.drawTerrain();
      this.placeInk();
    }
    // The thread in the air is only feedback while drawing; the shadow is what stays.
    this.sinceInk = this.drawing[0] || this.drawing[1] ? 0 : this.sinceInk + dt;
    const thread = Math.max(0, 1 - Math.max(0, this.sinceInk - 0.4) / 0.6);
    (this.inkMesh.material as MeshBasicMaterial).opacity = thread;
    this.inkMesh.visible = thread > 0.01;

    if (this.mood === 'gone') {
      this.respawn -= dt;
      if (this.respawn <= 0) this.spawn();
      this.critter.visible = false;
      this.bubble.visible = false;
      this.drawGoalStar(dt);
      return;
    }

    const h = Math.min(dt, 1 / 20) / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) this.step(h);
    if (this.y < -HEIGHT) {
      this.falls++;
      this.setMood('gone');
      this.respawn = 0.9;
      playSqueak();
    }
    this.drawCritter(dt);
    this.drawGoalStar(dt);
  }

  // ------------------------------------------------------------- Physics

  private step(h: number): void {
    const level = this.level!;
    // A shadow moving up into the friend lifts it (riding your hand); one
    // that swallows it whole leaves it standing in front of the shadow.
    // Re-checked every step, so ink drawn through its feet becomes a ramp it stands on.
    this.phasing = false;
    if (!this.boxFree(this.x, this.y)) {
      let lifted = false;
      for (let k = 0.25; k <= 5; k += 0.25) {
        if (this.boxFree(this.x, this.y + k)) {
          this.y += k;
          this.vy = Math.max(this.vy, 0);
          lifted = true;
          break;
        }
      }
      if (!lifted) this.phasing = true;
    }

    this.grounded = this.vy <= 0 && !this.boxFree(this.x, this.y - 0.08);
    if (this.grounded && !this.reached) this.think(level);
    if (this.reached) this.vx = 0;

    // Horizontal move, stepping up small bumps.
    if (this.vx !== 0) {
      const nx = this.x + this.vx * h;
      if (this.boxFree(nx, this.y)) {
        this.x = nx;
      } else if (this.grounded && this.boxFree(nx, this.y + 1)) {
        this.x = nx;
        this.y += 1;
      } else if (this.grounded && this.boxFree(nx, this.y + STEP_UP)) {
        this.x = nx;
        this.y += STEP_UP;
      } else {
        this.vx = 0;
      }
    }

    // Vertical move with landing.
    if (!this.grounded || this.vy > 0) {
      const wasFalling = this.vy < -8;
      this.vy -= GRAVITY * h;
      const ny = this.y + this.vy * h;
      if (this.boxFree(this.x, ny)) {
        this.y = ny;
      } else if (this.vy < 0) {
        let top = Math.floor(ny) + 1;
        while (!this.boxFree(this.x, top) && top < this.y + 3) top++;
        this.y = top;
        if (wasFalling) {
          this.squash = Math.min(1, -this.vy / 30);
          playBoing();
        }
        this.vy = 0;
        if (this.mood === 'hop' || this.mood === 'fall') this.setMood('walk');
      } else {
        this.vy = 0;
      }
    } else {
      this.vy = 0;
    }
    if (!this.grounded && this.vy < -4 && this.mood !== 'hop') this.setMood('fall');
  }

  /** On the ground: walk towards the goal, hop small gaps, wait at big ones. */
  private think(level: WalkLevel): void {
    const [gx, gy] = level.goal;
    if (Math.abs(this.x - gx) < 2 && Math.abs(this.y - gy) < 3) {
      this.reached = true;
      this.setMood('cheer');
      playChirp();
      return;
    }
    this.dir = gx >= this.x ? 1 : -1;
    const ahead = Math.floor(this.x + this.dir * (HALF_W + 0.6));
    if (this.wallAt(ahead)) {
      // A low ledge (a knuckle, a raised finger): hop up onto it.
      const ledge = this.ledgeTop(ahead);
      if (ledge !== null && ledge - this.y <= HOP_UP) {
        this.vx = this.dir * WALK * 0.8;
        this.vy = HOP_SPEED;
        this.grounded = false;
        this.setMood('hop');
        return;
      }
      this.vx = 0;
      this.setMood('wall');
      return;
    }
    if (this.surfaceAt(ahead) !== null) {
      this.vx = this.dir * WALK;
      this.setMood('walk');
      return;
    }
    // A gap: hop it if there is ground within reach, otherwise wait for help.
    for (let k = 2; k <= HOP_REACH; k++) {
      const col = Math.floor(this.x + this.dir * (HALF_W + k));
      const top = this.surfaceAt(col);
      if (top !== null && top <= this.y + 1.5 && !this.wallAt(col)) {
        this.vx = this.dir * (k + HALF_W) / ((2 * HOP_SPEED) / GRAVITY);
        this.vy = HOP_SPEED;
        this.grounded = false;
        this.setMood('hop');
        return;
      }
    }
    this.vx = 0;
    this.setMood('edge');
  }

  /** Top of the solid ground in a column, within a step up or a safe drop. */
  private surfaceAt(col: number): number | null {
    const base = Math.floor(this.y);
    for (let r = base + STEP_UP - 1; r >= base - MAX_DROP; r--) {
      if (this.solid(col, r)) return r + 1;
    }
    return null;
  }

  /** Top of an obstacle in a column, if there is headroom above it. */
  private ledgeTop(col: number): number | null {
    const base = Math.floor(this.y);
    for (let r = base; r <= base + Math.ceil(HOP_UP); r++) {
      if (!this.solid(col, r) && !this.solid(col, r + 1) && !this.solid(col, r + 2)) return r;
    }
    return null;
  }

  private wallAt(col: number): boolean {
    const base = Math.floor(this.y);
    for (let r = base + STEP_UP; r < base + HEIGHT; r++) if (this.solid(col, r)) return true;
    return false;
  }

  private boxFree(x: number, y: number): boolean {
    const x0 = Math.floor(x - HALF_W);
    const x1 = Math.floor(x + HALF_W - 1e-3);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + HEIGHT - 1e-3);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) if (this.solid(cx, cy)) return false;
    }
    return true;
  }

  private solid(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= MASK_WIDTH) return true; // The frame is a wall.
    if (cy < 0 || cy >= MASK_HEIGHT) return false;
    const i = cy * MASK_WIDTH + cx;
    if (this.terrain[i]) return true;
    if (this.phasing) return false;
    if (this.drawn[i]) return true;
    if (stage.handCount === 0) return false;
    const o = i * 4;
    const m = stage.mask;
    return m[o] > 127 || m[o + 1] > 127 || m[o + 2] > 127;
  }

  private spawn(): void {
    const [sx, sy] = this.level!.start;
    this.x = sx;
    this.y = sy + 4;
    this.vx = 0;
    this.vy = 0;
    this.dir = 1;
    this.phasing = false;
    this.setMood('fall');
    playBoing();
  }

  private setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodTime = 0;
  }

  // ------------------------------------------------------------- Drawing

  private drawCritter(dt: number): void {
    const c = this.critter;
    c.visible = true;
    this.squash = Math.max(0, this.squash - dt * 4);
    let bob = 0;
    let tilt = 0;
    let sx = 1;
    let sy = 1;
    let bubble = '';
    switch (this.mood) {
      case 'walk': {
        // Rabbits hop as they walk.
        this.walkPhase += dt * 7;
        const hop = Math.abs(Math.sin(this.walkPhase));
        bob = hop * 0.7;
        sy = 0.92 + hop * 0.14;
        break;
      }
      case 'edge': {
        // Peers over the edge, windmills, then looks back at you for help.
        const t = this.moodTime;
        tilt = t < 1.2 ? -0.25 * Math.min(1, t * 3) + Math.sin(t * 18) * 0.06 : Math.sin(t * 2) * 0.05;
        if (t > 1.2 && Math.floor(t / 1.6) % 2 === 1) sx = -1;
        bubble = t > 0.8 ? (t > 6 ? '…' : '?') : '!';
        break;
      }
      case 'wall':
        bob = Math.abs(Math.sin(this.moodTime * 9)) * 0.2;
        bubble = '?';
        break;
      case 'hop':
        sy = 1.15;
        sx = 0.9;
        tilt = this.vy > 0 ? 0.15 : -0.1;
        break;
      case 'fall':
        sy = 1.2;
        sx = 0.85;
        bubble = this.moodTime > 0.3 ? '!' : '';
        break;
      case 'cheer': {
        const jump = Math.abs(Math.sin(this.moodTime * 6));
        bob = jump * 2;
        sy = 0.9 + jump * 0.2;
        bubble = '♥';
        break;
      }
    }
    sy *= 1 - this.squash * 0.35;
    sx *= 1 + this.squash * 0.3;
    c.position.set(toPaperX(this.x), toPaperY(this.y + bob), 0.001);
    c.scale.set(sx * this.dir, sy, 1);
    c.rotation.z = tilt * this.dir;
    this.setBubble(bubble);
    this.bubble.visible = bubble !== '';
    this.bubble.position.set(toPaperX(this.x + this.dir * 1.5), toPaperY(this.y + bob + HEIGHT + 3), 0.002);
  }

  private drawGoalStar(dt: number): void {
    const [gx, gy] = this.level!.goal;
    const g = this.goalStar;
    g.position.set(toPaperX(gx), toPaperY(gy + 3.5) + Math.sin(this.time * 2) * 0.004, 0.001);
    g.rotation.z += dt * (this.reached ? 6 : 0.6);
    g.scale.setScalar(this.reached ? 1 + Math.min(0.6, this.moodTime) : 1);
  }

  private setBubble(text: string): void {
    if (text === this.bubbleText) return;
    this.bubbleText = text;
    const ctx = this.bubbleCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    if (!text) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ellipse(ctx, 32, 28, 26, 22);
    ctx.beginPath();
    ctx.moveTo(18, 44);
    ctx.lineTo(12, 60);
    ctx.lineTo(30, 48);
    ctx.fill();
    ctx.fillStyle = text === '♥' ? '#e0457a' : INK;
    ctx.font = `700 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 30);
    this.bubbleTexture.needsUpdate = true;
  }

  /** The thread in the air: a string of small ink beads. */
  private placeInk(): void {
    let n = 0;
    const z = this.root.position.z;
    for (const stroke of this.strokes) {
      for (const p of stroke.air) {
        if (n >= MAX_INK_POINTS) break;
        this.mat.makeScale(0.0035, 0.0035, 0.0035).setPosition(p.x, p.y, p.z - z);
        this.inkMesh.setMatrixAt(n++, this.mat);
      }
    }
    this.inkMesh.count = n;
    this.inkMesh.instanceMatrix.needsUpdate = true;
  }

  /** Paper-cut cliffs (ink silhouettes with grass tufts) and drawn ink lines. */
  private drawTerrain(): void {
    const level = this.level;
    if (!level) return;
    const canvas = this.terrainCanvas;
    const ctx = canvas.getContext('2d')!;
    const px = canvas.width / MASK_WIDTH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;
    for (const [x0, x1, top] of level.cliffs) {
      const left = x0 * px;
      const right = x1 * px;
      const y = canvas.height - top * px;
      ctx.beginPath();
      ctx.moveTo(left, canvas.height);
      ctx.lineTo(left, y + (x0 === 0 ? 0 : 4));
      // A gently wavy top edge so it reads as torn paper, not a box.
      for (let x = left; x <= right; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.11) * 1.5);
      ctx.lineTo(right, y + (x1 === MASK_WIDTH ? 0 : 4));
      ctx.lineTo(right, canvas.height);
      ctx.closePath();
      ctx.fill();
      for (let x = left + 3; x < right - 3; x += 9) {
        const h = 4 + ((x * 13) % 7);
        ctx.beginPath();
        ctx.moveTo(x - 3, y + 1);
        ctx.lineTo(x, y - h);
        ctx.lineTo(x + 3, y + 1);
        ctx.fill();
      }
    }
    // Ink lines: the shadows of the threads drawn in the air.
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = INK_RADIUS * 2 * px;
    for (const stroke of this.strokes) {
      if (stroke.cells.length === 0) continue;
      ctx.beginPath();
      stroke.cells.forEach(([cx, cy], i) => {
        const x = cx * px;
        const y = canvas.height - cy * px;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (stroke.cells.length === 1) ctx.lineTo(stroke.cells[0][0] * px + 0.1, canvas.height - stroke.cells[0][1] * px);
      ctx.stroke();
    }
    this.terrainTexture.needsUpdate = true;
  }
}

/** Where a point in the air casts its shadow on the paper, in cells (null if off the paper). */
function shadowCell(p: Vector3): [number, number] | null {
  const [lx, ly, lz] = stage.lantern;
  if (p.z <= 0.005 || p.z >= lz - 0.02) return null;
  const t = lz / (lz - p.z);
  const x = lx + (p.x - lx) * t;
  const y = ly + (p.y - ly) * t;
  const cx = (x / PAPER_WIDTH + 0.5) * MASK_WIDTH;
  const cy = (y / PAPER_HEIGHT + 0.5) * MASK_HEIGHT;
  if (cx < 0 || cy < 0 || cx >= MASK_WIDTH || cy >= MASK_HEIGHT) return null;
  return [cx, cy];
}

function toPaperX(cx: number): number {
  return (cx / MASK_WIDTH - 0.5) * PAPER_WIDTH;
}

function toPaperY(cy: number): number {
  return (cy / MASK_HEIGHT - 0.5) * PAPER_HEIGHT;
}

/** A square sprite whose pivot sits at the bottom centre (its feet), or its middle. */
function spriteMesh(canvas: HTMLCanvasElement, size: number, feet = true): Mesh {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const geometry = new PlaneGeometry(size, size);
  if (feet) geometry.translate(0, size / 2 - size * 0.04, 0);
  return new Mesh(geometry, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
}

/** The shadow rabbit, with a warm rim so it still reads on top of a hand's shadow. */
function drawCritter(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.shadowColor = 'rgba(255, 210, 120, 1)';
  ctx.shadowBlur = 7;
  rabbit(ctx, 58, 124, 0.78);
  ctx.shadowBlur = 0;
  rabbit(ctx, 58, 124, 0.78);
  // A bright eye, so it has a face even as a shadow.
  ctx.fillStyle = '#ffe2a8';
  ellipse(ctx, 92, 72, 3.5, 3.5);
  return canvas;
}

function drawGoal(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
  g.addColorStop(0, 'rgba(255, 230, 150, 0.9)');
  g.addColorStop(1, 'rgba(255, 190, 80, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#ffcf4a';
  star(ctx, 48, 50, 26, 0);
  return canvas;
}
