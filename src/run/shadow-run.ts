import { FONT } from '../ui-theme.js';
import { sparkPace } from '../assist.js';
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
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
import { playAwaken, playClick, playClunk, playCollect, playHiss, playTink, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { PushButton } from '../push-button.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { HandShadows } from './hand-shadows.js';
import type { RunLevel } from './run-levels.js';
import { GATE_RADIUS, PAPER_BOUNDS, RunSim, THORN_RADIUS } from './run-sim.js';
import { ShardSet } from './shards.js';
import { cloudTexture, hashString, sceneryTexture } from './scenery.js';
import { Comic } from '../fight/comic.js';
import { pickSpark, SparkFace, type SparkMood } from './spark-face.js';
import { ADD_ORDER, currentSlot, DEMO, MAX_PIECES, nextSlot, resetWorkshop, saveWorkshop, shelfSpot } from './workshop.js';
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
/** Where a fallen spark's flash shows: just above where it drops out of sight. */
const LOST_FLASH_Y = -0.2;
/** After this many misses, the caption gives the level's hint. */
const HINT_AFTER = 2;

/** Layers just in front of the paper (it is z = 0 in its own space). */
const Z_COURSE = 0.0016;
const Z_GATE = 0.003;
const Z_SPARK = 0.0045;
/** The course floor's height on the paper, for the readout's HEIGHT (see run-levels.ts). */
const COURSE_FLOOR = -0.15;
/** Where the player's eyes are in paper space (see ShadowStageSystem), for facing buttons. */
const VIEWER = new Vector3(0, 0.12, 1.0);
/** The Drop button (build levels), right of the paper, within reach. */
const DROP_AT = new Vector3(0.42, -0.02, 0.6);
const RESET_AT = new Vector3(0.42, -0.15, 0.6);
const SLOT_AT = new Vector3(0.42, 0.11, 0.6);
/** The Workshop's Add and Undo: either end of the shelf of pieces, within easy reach. */
const ADD_AT = new Vector3(-0.29, -0.2, 0.64);
const UNDO_AT = new Vector3(0.29, -0.2, 0.64);

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

/**
 * Each chapter's course is made of its world: the same photographed earth,
 * pebbles and stone as the 3D scenery in front of the screen, with a living
 * top (grass, moss, embers, snow) where the spark rolls.
 */
interface CourseLook {
  /** The photographed surface that fills the ground (public/textures/<name>_diff.jpg). */
  fill: string;
  /** Flat colours used until the photograph has loaded: top, bottom. */
  flat: [string, string];
  /** The top band where the spark rolls: its body and its bright lip. */
  top: [string, string];
  /** Blades standing up from the top (grass, moss), or none. */
  tufts: string | null;
  outline: string;
}

const COURSE_LOOKS: CourseLook[] = [
  { fill: 'soil', flat: ['#b9783e', '#7a4a24'], top: ['#4cc23a', '#a6f05a'], tufts: '#3fae32', outline: '#4a2a14' }, // Light & Shadow: meadow earth and grass
  { fill: 'pebbles', flat: ['#c08a4e', '#83572e'], top: ['#3cbf6a', '#9cf0a8'], tufts: '#30a85a', outline: '#4a2e18' }, // Structures: riverbank and moss
  { fill: 'stone', flat: ['#d08a4e', '#94502a'], top: ['#ff9a2a', '#ffe07a'], tufts: null, outline: '#5a2a12' }, // Fire & Iron: canyon rock and embers
  { fill: 'stone', flat: ['#9aaac4', '#62708e'], top: ['#ffffff', '#e4f2ff'], tufts: null, outline: '#3a4664' }, // Hot Air: mountain rock and snow
  { fill: 'iron', flat: ['#8a5ab0', '#4e2e74'], top: ['#ffc83a', '#fff09a'], tufts: null, outline: '#2e1640' }, // The Dragon: violet stone and gold
];

const photos = new Map<string, Promise<HTMLImageElement | null>>();

/** A photographed surface, loaded once; null if it cannot be had. (Kept for the old look; unused.) */
export function photo(name: string): Promise<HTMLImageElement | null> {
  let wait = photos.get(name);
  if (!wait) {
    wait = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `${import.meta.env.BASE_URL}textures/${name}_diff.jpg`;
    });
    photos.set(name, wait);
  }
  return wait;
}

/** The course painted on its canvas: flat colours at first, the photograph once it is here. */
function paintCourse(canvas: HTMLCanvasElement, level: RunLevel, look: CourseLook, image: HTMLImageElement | null): void {
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const px = (x: number) => ((x + W / 2) / W) * canvas.width;
  const py = (y: number) => ((H / 2 - y) / H) * canvas.height;
  const all = new Path2D();
  for (const piece of level.terrain) {
    const path = new Path2D();
    piece.forEach(([x, y], i) => (i ? path.lineTo(px(x), py(y)) : path.moveTo(px(x), py(y))));
    path.closePath();
    all.addPath(path);
  }
  // The ground itself: the photograph, tiled about every 40 cm, darker with depth like a cut bank.
  g.save();
  g.clip(all);
  if (image) {
    const pattern = g.createPattern(image, 'repeat')!;
    pattern.setTransform(new DOMMatrix().scale(420 / image.width));
    g.fillStyle = pattern;
  } else {
    const flat = g.createLinearGradient(0, py(0.2), 0, py(-0.2));
    flat.addColorStop(0, look.flat[0]);
    flat.addColorStop(1, look.flat[1]);
    g.fillStyle = flat;
  }
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Cartoon pebbles and specks in the earth, the same every time (seeded by the level).
  let seed = hashString(level.id);
  const rand = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 140; i++) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const r = 3 + rand() * 9;
    g.fillStyle = rand() < 0.6 ? 'rgba(60, 30, 10, 0.22)' : 'rgba(255, 230, 190, 0.22)';
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const depth = g.createLinearGradient(0, py(0.25), 0, py(-0.2));
  depth.addColorStop(0, 'rgba(255,255,255,0.12)');
  depth.addColorStop(0.35, 'rgba(0,0,0,0)');
  depth.addColorStop(1, 'rgba(10,6,2,0.35)');
  g.fillStyle = depth;
  g.fillRect(0, 0, canvas.width, canvas.height);
  // The top surfaces: a thick living band and a bright lip, kept inside the ground
  // so the surface you see is exactly the surface the spark stands on.
  const tops: Array<[number, number, number, number]> = [];
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
      tops.push([px(x0), py(y0), px(x1), py(y1)]);
    }
  }
  g.lineCap = 'round';
  for (const [width, colour] of [[34, look.top[0]], [10, look.top[1]]] as const) {
    g.strokeStyle = colour;
    g.lineWidth = width;
    for (const [x0, y0, x1, y1] of tops) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
  // Scalloped drips along the underside of the grass band, the classic cartoon edge.
  g.fillStyle = look.top[0];
  for (const [x0, y0, x1, y1] of tops) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 7; d < length - 4; d += 15) {
      const k = d / length;
      g.beginPath();
      g.arc(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + 15, 8, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  // A chunky dark outline, like a cut-out sticker.
  g.strokeStyle = look.outline;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.stroke(all);
  // Blades standing a few millimetres proud of the top: the same blade every time (no flicker on repaint).
  if (look.tufts) {
    g.fillStyle = look.tufts;
    let n = 0;
    for (const [x0, y0, x1, y1] of tops) {
      const length = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 6; d < length - 4; d += 11) {
        const k = d / length;
        const x = x0 + (x1 - x0) * k;
        const y = y0 + (y1 - y0) * k;
        const tall = 5 + ((n * 7) % 5);
        const lean = ((n * 13) % 7) - 3;
        n++;
        g.beginPath();
        g.moveTo(x - 3, y + 1);
        g.lineTo(x + lean, y - tall);
        g.lineTo(x + 3, y + 1);
        g.closePath();
        g.fill();
      }
    }
  }
}

/** The course: the chapter's own ground, cut in section, with a living top edge. */
function courseTexture(level: RunLevel): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * H) / W);
  const look = COURSE_LOOKS[(level.world ?? 0) % COURSE_LOOKS.length];
  paintCourse(canvas, level, look, null);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The guide: a dashed outline where a shadow would solve the level (a hand
 * for hand levels, a shard's shadow for build levels), with a few words.
 * Shown from the start in the first two levels, and after two misses elsewhere.
 */
function guideTexture(level: RunLevel): CanvasTexture | null {
  const still = level.solution.filter((s) => !s.v);
  if (still.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * H) / W);
  const g = canvas.getContext('2d')!;
  const px = (x: number) => ((x + W / 2) / W) * canvas.width;
  const py = (y: number) => ((H / 2 - y) / H) * canvas.height;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  let labelled = false;
  for (const shape of still) {
    const path = new Path2D();
    let cx = 0;
    let cy = 0;
    if (shape.poly) {
      shape.poly.forEach(([x, y], i) => (i ? path.lineTo(px(x), py(y)) : path.moveTo(px(x), py(y))));
      path.closePath();
      for (const [x, y] of shape.poly) {
        cx += x / shape.poly.length;
        cy += y / shape.poly.length;
      }
    } else {
      // A capsule: the outline of a flat hand's shadow, a little fatter so it reads.
      const r = Math.max(shape.r, 0.012) * (canvas.width / W) * 1.4;
      const ax = px(shape.a[0]);
      const ay = py(shape.a[1]);
      const bx = px(shape.b[0]);
      const by = py(shape.b[1]);
      const angle = Math.atan2(by - ay, bx - ax);
      path.arc(ax, ay, r, angle + Math.PI / 2, angle - Math.PI / 2);
      path.arc(bx, by, r, angle - Math.PI / 2, angle + Math.PI / 2);
      path.closePath();
      cx = (shape.a[0] + shape.b[0]) / 2;
      cy = (shape.a[1] + shape.b[1]) / 2;
    }
    g.fillStyle = 'rgba(20, 33, 61, 0.16)';
    g.fill(path);
    g.setLineDash([14, 12]);
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(20, 33, 61, 0.85)';
    g.stroke(path);
    g.setLineDash([]);
    if (!labelled) {
      labelled = true;
      const text = shape.poly ? 'glass shadow here' : still.length > 1 ? 'a hand shadow on each' : 'your hand’s shadow here';
      g.font = `800 30px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const x = Math.min(canvas.width - 190, Math.max(190, px(cx)));
      const y = py(cy) + 62;
      g.lineWidth = 9;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.strokeText(text, x, y);
      g.fillStyle = '#14213d';
      g.fillText(text, x, y);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** An ink thorn: a black burr of spikes with a red-hot core. */
function thornTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const g = canvas.getContext('2d')!;
  const glow = g.createRadialGradient(48, 48, 0, 48, 48, 46);
  glow.addColorStop(0, 'rgba(255, 70, 40, 0.65)');
  glow.addColorStop(1, 'rgba(255, 40, 20, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = '#120a10';
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = i % 2 ? 13 : 30 + (i % 4) * 2;
    g.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#ff5a2a';
  g.beginPath();
  g.arc(48, 48, 6, 0, Math.PI * 2);
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function moteTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255, 210, 90, 0.75)');
  glow.addColorStop(1, 'rgba(255, 160, 40, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  // A chunky gold star: a white sticker edge, a dark-gold line, a glint.
  const star = () => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 9.5 : 21;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  star();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.stroke();
  const gold = g.createLinearGradient(0, 12, 0, 52);
  gold.addColorStop(0, '#ffe45a');
  gold.addColorStop(1, '#ffa412');
  g.fillStyle = gold;
  star();
  g.fill();
  g.strokeStyle = '#b8620a';
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(27, 24, 4, 2.2, -0.6, 0, Math.PI * 2);
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** What each power does, for the caption. */
const POWER_LINE = {
  none: '',
  magnet: 'it pulls motes in from 7.5 cm, three times the usual reach',
  revive: 'if it falls, it reignites once on the last ledge',
  foresight: 'the dots show its path for the next 0.6 s',
};

export class ShadowRun {
  readonly group = new Group();
  readonly sim: RunSim;
  caption = '';
  done = false;
  stars = 0;

  private paper = new Group();
  private shadows = new HandShadows();
  /** Who the spark is this time (see spark-face.ts): a face, a name and a power. */
  private face: SparkFace;
  private halo: Sprite;
  /** Seconds of joy left (a mote, the gate, a second chance), and since the spark was dropped. */
  private joy = 0;
  private sinceDrop = 0;
  /** Motes on their way into the spark: seconds left of the flight (0: not flying). */
  private moteFlight: number[] = [];
  /** The Prism's dotted path ahead. */
  private ahead: Mesh[] = [];
  private aheadAt: Array<[number, number]> = [];
  /** Ink thorns on the course. */
  private thorns: Sprite[] = [];
  /** The painted world: near clouds that drift, fireflies, and pop words. */
  private clouds: Array<{ mesh: Mesh; speed: number }> = [];
  private flies: Array<{ sprite: Sprite; x: number; y: number; phase: number }> = [];
  private readonly comic = new Comic(4);
  private readonly eye = new Vector3();
  /** The dashed "your shadow here" guide. */
  private guide: Mesh | null = null;
  private trail: Sprite[] = [];
  private trailAt: Array<[number, number]> = [];
  private bursts: Burst[] = [];
  private motes: Sprite[] = [];
  private gateGlow: Sprite;
  private gateRing: Mesh;
  private waitTime = 0;
  private lostTime = 0;
  private wonTime = 0;
  /** The live physics readout at the top of the screen, and how long since it was redrawn. */
  private readout: { canvas: HTMLCanvasElement; texture: CanvasTexture; mesh: Mesh; age: number } | null = null;
  /** Workshop: whether the star's and ring's shadows are on the screen, the reset button, the last time. */
  private startOk = true;
  private gateOk = true;
  private reset: PushButton | null = null;
  /** Workshop: switches between the three saved designs. */
  private slot: PushButton | null = null;
  private add: PushButton | null = null;
  private undo: PushButton | null = null;
  private addIndex = 0;
  private devAdd = false;
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
    // Who turns up: the Daily Light's spark is the same for everyone that day.
    const day = level.id === 'daily' ? Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')) : undefined;
    this.face = new SparkFace(pickSpark(level.id, day), 10);
    this.sim.power = this.face.info.power;

    // The painted world behind the course: opaque and drawn first, so hand shadows fall across it.
    const scenery = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ map: sceneryTexture(level.world ?? 0, level.id, 1024, H / W) }));
    scenery.position.z = 0.0008;
    scenery.renderOrder = 1;
    this.paper.add(scenery);
    const puff = cloudTexture();
    for (let i = 0; i < 3; i++) {
      const mesh = new Mesh(new PlaneGeometry(0.16, 0.08), new MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.92 }));
      mesh.position.set(-W / 2 + (i + 0.3) * (W / 3), H / 2 - 0.06 - (i % 2) * 0.05, 0.0011);
      mesh.scale.setScalar(0.8 + (i % 3) * 0.25);
      mesh.renderOrder = 1;
      this.paper.add(mesh);
      this.clouds.push({ mesh, speed: 0.006 + i * 0.003 });
    }
    const fly = glowTexture('rgba(255,255,220,1)', 'rgba(255,220,90,0.5)');
    for (let i = 0; i < 12; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map: fly, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
      sprite.scale.setScalar(0.012);
      sprite.renderOrder = 4;
      this.paper.add(sprite);
      this.flies.push({ sprite, x: (Math.random() - 0.5) * W * 0.95, y: -H / 2 + 0.03 + Math.random() * H * 0.45, phase: Math.random() * 10 });
    }
    this.paper.add(this.comic.group);

    const course = new Mesh(
      new PlaneGeometry(W, H),
      new MeshBasicMaterial({ map: courseTexture(level), transparent: true, depthWrite: false }),
    );
    course.position.z = Z_COURSE;
    course.renderOrder = 3;
    this.paper.add(course);

    this.gateRing = new Mesh(
      new RingGeometry(GATE_RADIUS * 0.76, GATE_RADIUS, 40),
      new MeshBasicMaterial({ color: 0xff9f1a, transparent: true, opacity: 1, depthWrite: false }),
    );
    this.gateRing.position.set(level.gate[0], level.gate[1], Z_GATE);
    this.gateRing.renderOrder = 4;
    this.paper.add(this.gateRing);
    this.gateGlow = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,240,200,0.9)', 'rgba(255,190,80,0.45)'), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.gateGlow.position.set(level.gate[0], level.gate[1], Z_GATE);
    this.gateGlow.scale.setScalar(GATE_RADIUS * 3.2);
    this.gateGlow.renderOrder = 4;
    this.paper.add(this.gateGlow);

    const guide = guideTexture(level);
    if (guide) {
      this.guide = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ map: guide, transparent: true, depthWrite: false, opacity: 0 }));
      this.guide.position.z = Z_COURSE + 0.0004;
      this.guide.renderOrder = 4;
      this.guide.visible = false;
      this.paper.add(this.guide);
    }

    const thorn = thornTexture();
    for (const [x, y] of level.thorns ?? []) {
      const sprite = new Sprite(new SpriteMaterial({ map: thorn, transparent: true, depthWrite: false }));
      sprite.position.set(x, y, Z_GATE);
      sprite.scale.setScalar(THORN_RADIUS * 3.4);
      sprite.renderOrder = 5;
      this.paper.add(sprite);
      this.thorns.push(sprite);
    }

    const mote = moteTexture();
    for (const [x, y] of level.motes) {
      const sprite = new Sprite(new SpriteMaterial({ map: mote, transparent: true, depthWrite: false }));
      sprite.position.set(x, y, Z_GATE);
      sprite.scale.setScalar(0.064);
      sprite.renderOrder = 5;
      this.paper.add(sprite);
      this.motes.push(sprite);
      this.moteFlight.push(0);
    }

    const [glowIn, glowOut] = this.face.info.glow;
    const trailTexture = glowTexture(glowIn, glowOut);
    for (let i = 0; i < TRAIL; i++) {
      const s = new Sprite(new SpriteMaterial({ map: trailTexture, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.renderOrder = 6;
      this.paper.add(s);
      this.trail.push(s);
    }
    // A soft glow behind it (it is a spark of light), and the spark itself in crisp shapes.
    this.halo = new Sprite(new SpriteMaterial({ map: glowTexture(glowIn, glowOut), transparent: true, depthWrite: false, opacity: 0.8 }));
    this.halo.scale.setScalar(SPARK_RADIUS * 5.5);
    this.halo.renderOrder = 7;
    this.paper.add(this.halo, this.face.group);
    // The Prism's path ahead: a row of dots, smaller with distance.
    if (this.sim.power === 'foresight') {
      const dot = new CircleGeometry(0.0042, 12);
      for (let i = 0; i < 8; i++) {
        const mesh = new Mesh(dot, new MeshBasicMaterial({ color: this.face.info.rim, transparent: true, depthWrite: false, opacity: 0.85 * (1 - i / 10) }));
        mesh.renderOrder = 8;
        mesh.visible = false;
        mesh.scale.setScalar(1 - i * 0.07);
        this.paper.add(mesh);
        this.ahead.push(mesh);
        this.aheadAt.push([0, 0]);
      }
    }

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
      this.slot = new PushButton(this.paper, `Slot ${currentSlot()}`);
      this.slot.setColor(0x7b5cff);
      this.slot.size = 0.6;
      this.slot.root.position.copy(SLOT_AT);
      this.add = new PushButton(this.paper, `+ ${ADD_ORDER[0].name}`);
      this.add.setColor(0x1fb35a);
      this.add.size = 0.6;
      this.add.root.position.copy(ADD_AT);
      this.undo = new PushButton(this.paper, 'Undo');
      this.undo.setColor(0xff8a1f);
      this.undo.size = 0.6;
      this.undo.root.position.copy(UNDO_AT);
    }

    this.buildReadout();

    devInfo.run = () => `${level.id} ${this.sim.state} t=${this.sim.time.toFixed(1)} spark=(${this.sim.spark.x.toFixed(2)},${this.sim.spark.y.toFixed(2)}) motes=${this.sim.motesTaken} retries=${this.sim.retries} hands=${this.shadows.capsules.length} scale=${this.shadows.stats.scale.map((s) => s.toFixed(2)).join('/')}`;
    devActions[']'] = () => {
      // The Workshop: build the demonstration course; elsewhere, a test shadow that solves the level.
      if (this.level.workshop) this.shards?.restore(DEMO);
      else this.devShadow = !this.devShadow;
    };
    devActions['['] = () => this.release();
    // Dev: J pushes the Workshop's Add.
    devActions.j = () => (this.devAdd = true);
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
    this.sinceDrop = 0;
    playWhoosh(0.25);
  }

  update(dt: number, hands: readonly HandState[] = []): void {
    this.time += dt;
    this.alignToPaper();
    // The course waits behind the level card: nothing shows through it.
    this.paper.visible = stage.playing || this.sim.state === 'won';
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
    if (this.slot && this.shards) {
      this.slot.root.lookAt(this.paper.localToWorld(this.v.copy(VIEWER)));
      this.slot.show(this.sim.state === 'ready' && stage.playing);
      if (this.slot.update(dt, this.tips, false)) {
        playClick();
        // Keep the design you leave, then bring up the next slot's.
        saveWorkshop(this.shards.layout());
        const { slot, shards } = nextSlot();
        this.shards.restore(shards);
        this.slot.setText(`Slot ${slot}`);
        stage.say = `Design ${slot} of 3. Each one is saved when you push Drop.`;
        this.lastTime = 0;
      }
    }
    if (this.add && this.undo && this.shards) {
      const shards = this.shards;
      const ready = this.sim.state === 'ready' && stage.playing;
      this.add.root.lookAt(this.paper.localToWorld(this.v.copy(VIEWER)));
      this.undo.root.lookAt(this.paper.localToWorld(this.v.copy(VIEWER)));
      this.add.show(ready);
      this.undo.show(ready);
      if (this.add.update(dt, this.tips, this.devAdd)) {
        this.devAdd = false;
        playClick();
        if (shards.shards.length >= MAX_PIECES) {
          stage.say = `That is ${MAX_PIECES} pieces: push Undo to take one away first.`;
        } else {
          const next = ADD_ORDER[this.addIndex % ADD_ORDER.length];
          shards.add(shelfSpot(next.kind, shards.shards.length));
          stage.say = `A new ${next.name.toLowerCase()} on the shelf: pinch it and hold it in the light.`;
          this.addIndex++;
          this.add.setText(`+ ${ADD_ORDER[this.addIndex % ADD_ORDER.length].name}`);
        }
      }
      if (this.undo.update(dt, this.tips, false)) {
        playClick();
        if (!shards.removeLast()) stage.say = 'Nothing left to take away.';
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
        playCollect(0.03);
        const [x, y] = this.level.motes[event.index];
        // It flies into the spark (from further off for the Lodestone, whose magnet pulled it).
        this.moteFlight[event.index] = 0.22;
        this.joy = 0.7;
        this.burst(x, y, 10, 0.5);
        this.comic.pop(['NICE!', 'WOW!', 'SUPER!'][Math.min(2, sim.motesTaken - 1)], this.v.set(x, y + 0.05, 0.02), '#ffd23a', 0.32, 0.9);
      } else if (event.type === 'revive') {
        // The Phoenix core's second chance: a flash where it fell, and it reignites on the ledge.
        playAwaken();
        this.joy = 1;
        this.burst(event.from[0], LOST_FLASH_Y, 14, 0.8);
        this.burst(sim.spark.x, sim.spark.y, 12, 0.5);
        this.trailAt.length = 0;
        stage.say = 'The Phoenix core reignites on the last ledge!';
      } else if (event.type === 'lost') {
        this.lostTime = 0;
        if (event.thorn !== undefined) {
          const [tx, ty] = this.level.thorns![event.thorn];
          this.burst(tx, ty, 16, 0.6);
          stage.say = 'Caught on an ink thorn! Keep the spark clear of them';
        }
        stage.cue = 'oops';
        // After a few misses Ada gives the level's hint; before that, a word of encouragement.
        stage.say = sim.retries + 1 >= HINT_AFTER ? this.level.hint : ['Close!', 'Again: you’ve got this.', 'Almost. Watch where it falls.'][sim.retries % 3];
        playHiss(0.03, 0.35);
      } else if (event.type === 'won') {
        this.wonTime = 0;
        this.joy = 2;
        this.stars = sim.stars();
        playAwaken();
        this.comic.pop(this.stars >= 3 ? 'PERFECT!' : this.stars === 2 ? 'GREAT!' : 'CLEARED!', this.v.set(this.level.gate[0], this.level.gate[1] + 0.08, 0.03), this.stars >= 3 ? '#ffd23a' : '#7fe0ff', 0.5, 1.4);
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
    this.updateReadout(dt, scale);
  }

  /**
   * The live physics readout, a small navy panel at the top of the screen:
   * the spark's speed (m/s), its height above the course floor (cm), and
   * your shadow's magnification D ÷ d. Redrawn five times a second.
   */
  private buildReadout(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 96;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(0.44, 0.066), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.95 }));
    mesh.position.set(0, 0.308, Z_SPARK + 0.001);
    mesh.renderOrder = 30;
    this.paper.add(mesh);
    this.readout = { canvas, texture, mesh, age: 1 };
  }

  private updateReadout(dt: number, scale: number): void {
    const r = this.readout;
    if (!r) return;
    r.age += dt;
    if (r.age < 0.2) return;
    r.age = 0;
    const { vx, vy, y } = this.sim.spark;
    const speed = this.sim.state === 'live' ? Math.hypot(vx, vy) : 0;
    const height = Math.max(0, (y - COURSE_FLOOR) * 100);
    const g = r.canvas.getContext('2d')!;
    g.clearRect(0, 0, r.canvas.width, r.canvas.height);
    g.fillStyle = 'rgba(20, 33, 61, 0.88)';
    g.beginPath();
    g.roundRect(4, 4, r.canvas.width - 8, r.canvas.height - 8, 44);
    g.fill();
    const cells: Array<[string, string]> = [
      ['SPEED', `${speed.toFixed(2)} m/s`],
      ['HEIGHT', `${height.toFixed(0)} cm`],
      ['SHADOW', scale > 0 ? `×${scale.toFixed(1)}` : '–'],
    ];
    cells.forEach(([name, value], i) => {
      const x = 113 + i * 207;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#9fb3d9';
      g.font = `800 19px ${FONT}`;
      g.fillText(name, x, 28);
      g.fillStyle = '#ffc928';
      g.font = `800 33px ${FONT}`;
      g.fillText(value, x, 64);
    });
    r.texture.needsUpdate = true;
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
    // Before the first drop, say who turned up and what they can do.
    const info = this.face.info;
    if (sim.state === 'ready' && sim.retries === 0 && info.power !== 'none' && this.time > 4) text = `This spark is a ${info.name}: ${POWER_LINE[info.power]}`;
    const motes = `${sim.motesTaken}/${this.level.motes.length} ✦`;
    this.caption = `${text}  ·  ${motes}`;
  }

  /** Spark, trail, gate and motes where the simulation says. */
  private place(dt = 0): void {
    // The painted world is alive: near clouds drift, fireflies wander and blink.
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > W / 2 + 0.1) c.mesh.position.x = -W / 2 - 0.1;
    }
    for (const f of this.flies) {
      const t = this.time * 0.6 + f.phase;
      f.sprite.position.set(f.x + Math.sin(t) * 0.03, f.y + Math.sin(t * 1.7) * 0.015, Z_COURSE + 0.0003);
      f.sprite.material.opacity = 0.25 + 0.55 * Math.max(0, Math.sin(t * 2.3));
    }
    if (dt > 0) this.comic.update(dt, this.paper.localToWorld(this.eye.copy(VIEWER)));
    const sim = this.sim;
    const { x, y } = sim.spark;
    const visible = sim.state !== 'lost';
    const waiting = sim.state === 'ready';
    const pulse = waiting ? 1 + 0.18 * Math.sin(this.time * 6) : 1;
    const shown = visible && sim.state !== 'won' && this.startOk;
    this.face.group.visible = this.halo.visible = shown;
    // Waiting, it bobs on the spot.
    const bob = waiting ? Math.abs(Math.sin(this.time * 3.2)) * 0.004 : 0;
    this.face.group.position.set(x, y + bob, Z_SPARK);
    this.halo.position.set(x, y + bob, Z_SPARK - 0.0005);
    this.halo.scale.setScalar(SPARK_RADIUS * 5.5 * pulse);
    // Its mood: joy at a mote or the gate, wide eyes in free fall. Waiting, it watches your shadow.
    this.joy = Math.max(0, this.joy - dt);
    this.sinceDrop += dt;
    const { vx, vy, airborne } = sim.spark;
    const mood: SparkMood = this.joy > 0 ? 'happy' : sim.state === 'live' && airborne > 0.2 && vy < -0.3 ? 'scared' : 'calm';
    let watch: [number, number] | null = null;
    let nearest = Infinity;
    for (const c of this.shadows.capsules) {
      const dx = (c.ax + c.bx) / 2 - x;
      const dy = (c.ay + c.by) / 2 - y;
      const d = dx * dx + dy * dy;
      if (d < nearest) {
        nearest = d;
        watch = [dx, dy];
      }
    }
    const tag = waiting ? 1 : Math.max(0, 1 - (this.sinceDrop - 1.2) / 0.6);
    this.face.update(dt, sim.state === 'live' ? vx : 0, sim.state === 'live' ? vy : 0, mood, watch, sim.state === 'live' || waiting ? Math.min(1, tag) : 0);
    // The Prism: the path ahead, from the same physics run forward on a copy.
    if (this.ahead.length) {
      const n = sim.state === 'live' && stage.playing ? sim.foresee(this.shadows.capsules, this.shards?.shadows ?? [], this.aheadAt) : 0;
      this.ahead.forEach((dot, i) => {
        dot.visible = i < n;
        if (i < n) dot.position.set(this.aheadAt[i][0], this.aheadAt[i][1], Z_SPARK - 0.0008);
      });
    }
    // The guide: from the start in the first two levels, after two misses elsewhere; it fades once the spark is moving.
    if (this.guide) {
      const early = this.level.id === 'run-bridge' || this.level.id === 'run-ramp';
      const want = stage.playing && (early || sim.retries >= HINT_AFTER) && (waiting || (sim.state === 'live' && this.sinceDrop < 1.2 && !this.level.build) || (this.level.build && sim.state !== 'won'));
      const material = this.guide.material as MeshBasicMaterial;
      material.opacity += ((want ? 0.75 + 0.2 * Math.sin(this.time * 4) : 0) - material.opacity) * Math.min(1, dt * 6);
      this.guide.visible = material.opacity > 0.02;
    }
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
    // Thorns turn slowly and pulse, so they read as alive and dangerous.
    this.thorns.forEach((t, i) => {
      t.material.rotation = this.time * 0.7 + i;
      t.scale.setScalar(THORN_RADIUS * (3.3 + 0.25 * Math.sin(this.time * 3 + i)));
    });
    // Motes bob gently; a collected one flies into the spark and is gone.
    this.motes.forEach((m, i) => {
      if (!m.visible) return;
      if (this.moteFlight[i] > 0) {
        this.moteFlight[i] -= dt;
        const k = Math.min(1, dt * 18);
        m.position.x += (x - m.position.x) * k;
        m.position.y += (y - m.position.y) * k;
        m.scale.setScalar(Math.max(0.006, m.scale.x * (1 - dt * 6)));
        m.material.rotation += dt * 14;
        if (this.moteFlight[i] <= 0) m.visible = false;
        return;
      }
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
