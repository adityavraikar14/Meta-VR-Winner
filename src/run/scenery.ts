import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';

/**
 * The painted world behind each Shadow Run course: a bright, cheerful
 * cartoon landscape on the screen (sky, sun, clouds, layered rolling hills,
 * trees and bushes), one per chapter, in the spirit of the best casual
 * physics games. The play area (the middle and top of the screen) stays
 * light and open sky, so your hand's dark shadow and the spark always read.
 *
 * Painted once per level on a canvas; deterministic (seeded), so a level
 * looks the same every time you play it.
 */

export interface Palette {
  sky: [string, string];
  /** Back to front: each layer of hills, and the light rim along its top. */
  hills: Array<[string, string]>;
  sun: 'sun' | 'low-sun' | 'moon' | null;
  clouds: number;
  /** Small things standing on the front hill. */
  props: Array<'blossom' | 'tree' | 'bush' | 'mushroom' | 'flower' | 'pine' | 'balloon' | 'windmill' | 'frame' | 'castle' | 'river' | 'stars' | 'snowcaps' | 'lantern'>;
}

/** One painted world per chapter (the course's `world`). */
export const SCENERY: Palette[] = [
  // Light & Shadow: a spring meadow.
  {
    sky: ['#4fc3ff', '#d2f3ff'],
    hills: [['#bfeaa0', '#dcf7c4'], ['#8fd863', '#b6ee88'], ['#5cbd3e', '#8ee05e']],
    sun: 'sun',
    clouds: 4,
    props: ['blossom', 'tree', 'bush', 'mushroom', 'flower'],
  },
  // Structures: the river valley, with a windmill on the far hill.
  {
    sky: ['#5ccaff', '#e0f7ff'],
    hills: [['#b4e6c0', '#d6f6dc'], ['#7fd08a', '#a9eab0'], ['#46ad62', '#79d58e']],
    sun: 'sun',
    clouds: 3,
    props: ['river', 'windmill', 'tree', 'bush', 'flower'],
  },
  // Fire & Iron: a warm canyon at golden hour, with the mine's timber frames.
  {
    sky: ['#ff9a4a', '#ffe3a6'],
    hills: [['#f6c28e', '#ffdcb4'], ['#e59a5c', '#f6b882'], ['#c4703c', '#e08e58']],
    sun: 'low-sun',
    clouds: 2,
    props: ['frame', 'lantern', 'bush'],
  },
  // Hot Air: high peaks, many clouds, balloons drifting.
  {
    sky: ['#6fd0ff', '#f2fcff'],
    hills: [['#d6e6f6', '#ffffff'], ['#a9c8e4', '#d8e8f6'], ['#7fa9cf', '#a9c8e4']],
    sun: 'sun',
    clouds: 6,
    props: ['snowcaps', 'balloon', 'pine'],
  },
  // The Dragon: a violet dusk, stars coming out, the castle on the hill.
  {
    sky: ['#5a3fb8', '#ffb0c8'],
    hills: [['#a88ad8', '#c8b0ec'], ['#7c5cbc', '#9c80d4'], ['#54398e', '#7458ae']],
    sun: 'moon',
    clouds: 2,
    props: ['stars', 'castle', 'pine', 'lantern'],
  },
];

/** A small seeded random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const OUTLINE = 'rgba(40, 30, 50, 0.55)';

/** The world's landscape on a new canvas texture, `width` px wide, the screen's shape. */
export function sceneryTexture(world: number, seed: string, width = 1024, aspect = 0.7): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * aspect);
  paintScenery(canvas, SCENERY[world % SCENERY.length], hashString(seed));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function paintScenery(canvas: HTMLCanvasElement, look: Palette, seed: number): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const rand = seeded(seed);

  // Sky.
  const sky = g.createLinearGradient(0, 0, 0, h * 0.85);
  sky.addColorStop(0, look.sky[0]);
  sky.addColorStop(1, look.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  if (look.props.includes('stars')) {
    for (let i = 0; i < 60; i++) {
      const x = rand() * w;
      const y = rand() * h * 0.45;
      const r = 0.8 + rand() * 1.8;
      g.fillStyle = `rgba(255, 250, 230, ${0.5 + rand() * 0.5})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // The sun (or moon), with soft rays.
  if (look.sun) {
    const low = look.sun === 'low-sun';
    const moon = look.sun === 'moon';
    const sx = w * (low ? 0.22 : 0.84);
    const sy = h * (low ? 0.42 : 0.17);
    const sr = w * (low ? 0.075 : 0.055);
    const halo = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4);
    halo.addColorStop(0, moon ? 'rgba(255, 240, 255, 0.55)' : 'rgba(255, 245, 190, 0.7)');
    halo.addColorStop(1, 'rgba(255, 245, 190, 0)');
    g.fillStyle = halo;
    g.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    if (!moon) {
      g.save();
      g.translate(sx, sy);
      g.fillStyle = 'rgba(255, 236, 140, 0.35)';
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath();
        g.moveTo(-sr * 0.18, sr * 1.15);
        g.lineTo(0, sr * 2.1);
        g.lineTo(sr * 0.18, sr * 1.15);
        g.fill();
      }
      g.restore();
    }
    const disc = g.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
    disc.addColorStop(0, moon ? '#fffaf0' : '#fffbe0');
    disc.addColorStop(1, moon ? '#f0dcf0' : low ? '#ffb43a' : '#ffd84a');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();
  }

  // Far clouds, painted (the near ones drift, see Clouds in shadow-run.ts).
  for (let i = 0; i < look.clouds; i++) {
    cloud(g, rand() * w, h * (0.08 + rand() * 0.25), w * (0.06 + rand() * 0.05), 0.75);
  }

  // Snow-capped peaks behind the hills.
  if (look.props.includes('snowcaps')) {
    for (let i = 0; i < 5; i++) {
      const cx = (i + 0.2 + rand() * 0.6) * (w / 5);
      const top = h * (0.28 + rand() * 0.12);
      const half = w * (0.12 + rand() * 0.06);
      const base = h * 0.75;
      g.fillStyle = '#9fbede';
      g.beginPath();
      g.moveTo(cx - half, base);
      g.lineTo(cx, top);
      g.lineTo(cx + half, base);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      const cap = (base - top) * 0.3;
      g.moveTo(cx, top);
      g.lineTo(cx + half * 0.3, top + cap);
      g.lineTo(cx + half * 0.12, top + cap * 0.8);
      g.lineTo(cx, top + cap * 1.05);
      g.lineTo(cx - half * 0.14, top + cap * 0.8);
      g.lineTo(cx - half * 0.3, top + cap);
      g.closePath();
      g.fill();
    }
  }

  // Rolling hills, back to front; each a sum of gentle waves, with a light rim along its top.
  const tops: Array<(x: number) => number> = [];
  look.hills.forEach(([body, rim], layer) => {
    const base = h * (0.56 + layer * 0.1);
    const amp = h * (0.05 - layer * 0.008);
    const f1 = 1.5 + rand() * 1.5;
    const f2 = 3 + rand() * 3;
    const p1 = rand() * 6;
    const p2 = rand() * 6;
    const top = (x: number) => base - amp * (Math.sin((x / w) * Math.PI * f1 + p1) + 0.45 * Math.sin((x / w) * Math.PI * f2 + p2));
    tops.push(top);
    // The river runs in front of the far hill, behind the near ones.
    if (layer === 1 && look.props.includes('river')) river(g, w, h, base - amp * 0.2);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, top(x));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = 6;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) (x ? g.lineTo(x, top(x) + 3) : g.moveTo(x, top(x) + 3));
    g.stroke();
    // A few soft dabs of lighter grass on the hill's face.
    g.fillStyle = rim;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 10; i++) {
      const x = rand() * w;
      g.beginPath();
      g.ellipse(x, top(x) + h * (0.03 + rand() * 0.08), w * 0.02, h * 0.008, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Things standing on this hill: far ones on the back hill, near ones on the front.
    if (layer === 0) {
      if (look.props.includes('windmill')) windmill(g, w * (0.12 + rand() * 0.1), top, h);
      if (look.props.includes('castle')) castle(g, w * 0.72, top, h);
    }
    if (layer === 1) {
      if (look.props.includes('frame')) {
        for (let i = 0; i < 2; i++) frame(g, w * (0.18 + i * 0.58 + rand() * 0.06), top, h);
      }
      if (look.props.includes('pine')) for (let i = 0; i < 6; i++) pine(g, rand() * w, top, h * (0.05 + rand() * 0.03));
    }
    if (layer === 2) {
      const count = 7;
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.15 + rand() * 0.7) / count) * w;
        const kind = look.props.filter((p) => ['blossom', 'tree', 'bush', 'mushroom', 'flower', 'lantern'].includes(p));
        if (!kind.length) break;
        const pick = kind[Math.floor(rand() * kind.length)];
        if (pick === 'blossom') tree(g, x, top(x), h * (0.1 + rand() * 0.04), '#ffb3d1', '#ff8ab8');
        else if (pick === 'tree') tree(g, x, top(x), h * (0.09 + rand() * 0.04), '#6ad04a', '#3fae3a');
        else if (pick === 'bush') bush(g, x, top(x), w * 0.03);
        else if (pick === 'mushroom') mushroom(g, x, top(x), h * 0.035);
        else if (pick === 'lantern') lantern(g, x, top(x), h * 0.06);
        else flowers(g, x, top(x), w * 0.03, rand);
      }
    }
  });

  if (look.props.includes('balloon')) {
    const colours = [['#ff5a5a', '#ffd23a'], ['#3ab0ff', '#ffffff'], ['#7a5cff', '#ffb0d0']];
    for (let i = 0; i < 3; i++) balloon(g, w * (0.15 + i * 0.32 + rand() * 0.08), h * (0.12 + rand() * 0.2), w * (0.022 + rand() * 0.012), colours[i]);
  }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  g.save();
  g.globalAlpha = alpha;
  const puffs: Array<[number, number, number]> = [[-1.1, 0.25, 0.6], [-0.4, -0.15, 0.85], [0.45, -0.05, 0.75], [1.1, 0.25, 0.55], [0, 0.3, 0.7]];
  g.fillStyle = '#d8e6f2';
  for (const [dx, dy, s] of puffs) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r + r * 0.12, s * r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  for (const [dx, dy, s] of puffs) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A drifting cloud on its own little canvas (for the near clouds that move). */
export function cloudTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  cloud(g, 128, 66, 46, 0.95);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function river(g: CanvasRenderingContext2D, w: number, h: number, y: number): void {
  const water = g.createLinearGradient(0, y - h * 0.03, 0, y + h * 0.05);
  water.addColorStop(0, '#7fd8ff');
  water.addColorStop(1, '#3aa6e6');
  g.fillStyle = water;
  g.fillRect(0, y - h * 0.03, w, h * 0.09);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 3;
  for (let x = 20; x < w; x += 90) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 30, y);
    g.stroke();
  }
}

function tree(g: CanvasRenderingContext2D, x: number, y: number, size: number, light: string, dark: string): void {
  g.fillStyle = '#8a5a34';
  g.strokeStyle = OUTLINE;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - size * 0.06, y + 4);
  g.lineTo(x - size * 0.04, y - size * 0.55);
  g.lineTo(x + size * 0.04, y - size * 0.55);
  g.lineTo(x + size * 0.06, y + 4);
  g.closePath();
  g.fill();
  g.stroke();
  const blobs: Array<[number, number, number]> = [[-0.32, -0.62, 0.3], [0.3, -0.64, 0.3], [0, -0.82, 0.36], [-0.12, -0.55, 0.28], [0.16, -0.52, 0.26]];
  g.fillStyle = dark;
  for (const [dx, dy, r] of blobs) {
    g.beginPath();
    g.arc(x + dx * size, y + dy * size + size * 0.04, r * size, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = light;
  for (const [dx, dy, r] of blobs) {
    g.beginPath();
    g.arc(x + dx * size - size * 0.03, y + dy * size - size * 0.02, r * size * 0.88, 0, Math.PI * 2);
    g.fill();
  }
}

function bush(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = '#2f9a3a';
  for (const dx of [-0.8, 0, 0.8]) {
    g.beginPath();
    g.arc(x + dx * r, y - r * 0.3, r * (dx ? 0.7 : 0.9), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#56c656';
  for (const dx of [-0.8, 0, 0.8]) {
    g.beginPath();
    g.arc(x + dx * r - r * 0.1, y - r * 0.42, r * (dx ? 0.5 : 0.68), 0, Math.PI * 2);
    g.fill();
  }
}

function mushroom(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = '#fff4e0';
  g.fillRect(x - s * 0.18, y - s * 0.7, s * 0.36, s * 0.75);
  g.fillStyle = '#e8402a';
  g.beginPath();
  g.ellipse(x, y - s * 0.7, s * 0.6, s * 0.42, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#ffffff';
  for (const [dx, dy] of [[-0.3, -0.85], [0.15, -0.95], [0.35, -0.78]]) {
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, s * 0.08, 0, Math.PI * 2);
    g.fill();
  }
}

function flowers(g: CanvasRenderingContext2D, x: number, y: number, spread: number, rand: () => number): void {
  const colours = ['#ff6fa8', '#ffd23a', '#ffffff', '#b07aff'];
  for (let i = 0; i < 5; i++) {
    const fx = x + (rand() - 0.5) * spread * 2;
    const fy = y - 4 - rand() * 6;
    g.strokeStyle = '#3f9a3a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(fx, y + 2);
    g.lineTo(fx, fy);
    g.stroke();
    g.fillStyle = colours[i % colours.length];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffb020';
    g.beginPath();
    g.arc(fx, fy, 2, 0, Math.PI * 2);
    g.fill();
  }
}

function pine(g: CanvasRenderingContext2D, x: number, top: (x: number) => number, s: number): void {
  const y = top(x) + 3;
  g.fillStyle = '#6b4a30';
  g.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.32);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i % 2 ? '#2f8a5a' : '#3aa06a';
    const ty = y - s * (0.25 + i * 0.32);
    const half = s * (0.42 - i * 0.1);
    g.beginPath();
    g.moveTo(x - half, ty);
    g.lineTo(x, ty - s * 0.5);
    g.lineTo(x + half, ty);
    g.closePath();
    g.fill();
  }
}

function windmill(g: CanvasRenderingContext2D, x: number, top: (x: number) => number, h: number): void {
  const y = top(x) + 4;
  const tall = h * 0.2;
  g.fillStyle = '#26314d';
  g.beginPath();
  g.moveTo(x - tall * 0.05, y);
  g.lineTo(x - tall * 0.015, y - tall);
  g.lineTo(x + tall * 0.015, y - tall);
  g.lineTo(x + tall * 0.05, y);
  g.closePath();
  g.fill();
  g.strokeStyle = '#26314d';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3 + 0.3;
    g.beginPath();
    g.moveTo(x, y - tall);
    g.lineTo(x + Math.cos(a) * tall * 0.6, y - tall + Math.sin(a) * tall * 0.6);
    g.stroke();
  }
  g.fillStyle = '#26314d';
  g.beginPath();
  g.arc(x, y - tall, 5, 0, Math.PI * 2);
  g.fill();
}

/** A timber mine frame, braced with a cross, like a cartoon scaffold. */
function frame(g: CanvasRenderingContext2D, x: number, top: (x: number) => number, h: number): void {
  const y = top(x) + 6;
  const tall = h * 0.16;
  const wide = tall * 0.9;
  const beam = (x0: number, y0: number, x1: number, y1: number) => {
    g.strokeStyle = '#5a3a20';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = '#b07a46';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  g.lineCap = 'round';
  beam(x - wide / 2, y, x - wide / 2, y - tall);
  beam(x + wide / 2, y, x + wide / 2, y - tall);
  beam(x - wide / 2 - 8, y - tall, x + wide / 2 + 8, y - tall);
  beam(x - wide / 2, y, x + wide / 2, y - tall);
  beam(x + wide / 2, y, x - wide / 2, y - tall);
  g.fillStyle = '#4a4a52';
  for (const [dx, dy] of [[-0.5, -1], [0.5, -1]]) {
    g.beginPath();
    g.arc(x + dx * wide, y + dy * tall, 3, 0, Math.PI * 2);
    g.fill();
  }
}

function lantern(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.strokeStyle = '#4a3020';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x, y + 2);
  g.lineTo(x, y - s);
  g.lineTo(x + s * 0.35, y - s);
  g.stroke();
  const glow = g.createRadialGradient(x + s * 0.35, y - s * 0.8, 1, x + s * 0.35, y - s * 0.8, s * 0.6);
  glow.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
  glow.addColorStop(1, 'rgba(255, 180, 60, 0)');
  g.fillStyle = glow;
  g.fillRect(x - s * 0.3, y - s * 1.45, s * 1.3, s * 1.3);
  g.fillStyle = '#ffcf5a';
  g.fillRect(x + s * 0.25, y - s * 0.92, s * 0.2, s * 0.25);
}

function castle(g: CanvasRenderingContext2D, x: number, top: (x: number) => number, h: number): void {
  const y = top(x) + 6;
  const s = h * 0.17;
  g.fillStyle = '#3a2a66';
  const block = (cx: number, width: number, tall: number) => {
    g.fillRect(cx - width / 2, y - tall, width, tall);
    for (let i = 0; i < 3; i++) g.fillRect(cx - width / 2 + (i * width) / 2.5, y - tall - width * 0.18, width / 5, width * 0.18);
  };
  block(x - s * 0.55, s * 0.3, s * 0.95);
  block(x, s * 0.6, s * 0.7);
  block(x + s * 0.55, s * 0.3, s * 1.1);
  g.fillStyle = '#ffd86a';
  for (const [dx, dy] of [[-0.55, -0.7], [0, -0.45], [0.55, -0.85], [0.1, -0.3]]) g.fillRect(x + dx * s - 3, y + dy * s, 6, 9);
}

function balloon(g: CanvasRenderingContext2D, x: number, y: number, r: number, [a, b]: string[]): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  for (let i = -3; i <= 3; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(x + i * r * 0.32 - r * 0.16, y - r, r * 0.32, r * 2);
  }
  g.restore();
  g.strokeStyle = 'rgba(60, 40, 30, 0.6)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - r * 0.5, y + r * 0.85);
  g.lineTo(x - r * 0.2, y + r * 1.5);
  g.moveTo(x + r * 0.5, y + r * 0.85);
  g.lineTo(x + r * 0.2, y + r * 1.5);
  g.stroke();
  g.fillStyle = '#9a6a3a';
  g.fillRect(x - r * 0.22, y + r * 1.45, r * 0.44, r * 0.3);
}
