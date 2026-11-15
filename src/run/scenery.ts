import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';

/**
 * The painted world behind each Shadow Run course: a calm, painterly
 * landscape on the screen, one per chapter. Layer upon layer of land fades
 * into a soft, misty distance (atmospheric perspective: the further away,
 * the more of the sky's own colour it takes on), with quiet silhouettes
 * of the chapter's world: the jungle's tall old trees, the river's cliffs,
 * the mine's timber frames, the mountain's peaks, the dragon's castle.
 *
 * No cartoon sun, no clouds, nothing that glitters: still and peaceful,
 * like the light of the lantern you play by. The upper and middle screen
 * stay pale, so your hand's dark shadow and the spark always read.
 *
 * Painted once per level on a canvas; deterministic (seeded), so a level
 * looks the same every time you play it.
 */

type Ridge = 'hills' | 'peaks' | 'mesas';
type Feature = 'canopy' | 'cliffs' | 'river' | 'frames' | 'pines' | 'castle';

export interface Palette {
  /** Sky, top to horizon. */
  sky: [string, string, string];
  /** The soft glow low in the sky where the light comes from (x as a fraction of the width). */
  glow: { x: number; color: string };
  /** The nearest land's colour; further layers fade from it into the haze. */
  land: string;
  haze: string;
  ridge: Ridge;
  features: Feature[];
}

/** One painted world per chapter (the course's `world`). */
export const SCENERY: Palette[] = [
  // Light & Shadow: a misty jungle at first light, tall old trees standing in the haze.
  {
    sky: ['#d9e8e1', '#eaf0e4', '#f7efdc'],
    glow: { x: 0.3, color: 'rgba(255, 236, 196, 0.85)' },
    land: '#4f7a62',
    haze: '#e4ecdf',
    ridge: 'hills',
    features: ['canopy'],
  },
  // Structures: the river valley, still water between far cliffs.
  {
    sky: ['#d6e5ee', '#e8eff2', '#f4eee2'],
    glow: { x: 0.68, color: 'rgba(255, 238, 205, 0.8)' },
    land: '#4a6f7c',
    haze: '#e2ebee',
    ridge: 'mesas',
    features: ['cliffs', 'river', 'pines'],
  },
  // Fire & Iron: a warm canyon in amber haze, the mine's timber frames on the rim.
  {
    sky: ['#f0e2d0', '#f6e9d6', '#fbeed8'],
    glow: { x: 0.25, color: 'rgba(255, 214, 160, 0.85)' },
    land: '#8a5a44',
    haze: '#f2e2cf',
    ridge: 'mesas',
    features: ['frames'],
  },
  // Hot Air: high peaks, layer after layer of cool blue ridges.
  {
    sky: ['#dae4ef', '#e9eef4', '#f5f1ea'],
    glow: { x: 0.72, color: 'rgba(255, 240, 220, 0.8)' },
    land: '#55677f',
    haze: '#e3e9f1',
    ridge: 'peaks',
    features: ['pines'],
  },
  // The Dragon: a quiet dusk, rose and lavender, the castle on the far ridge.
  {
    sky: ['#ddd6ea', '#ece2ec', '#f6e8e2'],
    glow: { x: 0.5, color: 'rgba(255, 220, 205, 0.85)' },
    land: '#5d4d72',
    haze: '#eae1ec',
    ridge: 'peaks',
    features: ['castle', 'pines'],
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

/** Layers of land, back to front. */
const LAYERS = 5;

export function paintScenery(canvas: HTMLCanvasElement, look: Palette, seed: number): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const rand = seeded(seed);

  // Sky: three soft bands down to a warm horizon.
  const sky = g.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, look.sky[0]);
  sky.addColorStop(0.55, look.sky[1]);
  sky.addColorStop(1, look.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // Where the light comes from: a broad, soft glow low in the sky (no disc, no rays).
  const gx = w * look.glow.x;
  const gy = h * 0.58;
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, w * 0.5);
  glow.addColorStop(0, look.glow.color);
  glow.addColorStop(1, 'rgba(255, 240, 220, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  // Layers of land, far to near: each lower, darker and sharper; the far ones melt into the haze.
  for (let layer = 0; layer < LAYERS; layer++) {
    const near = layer / (LAYERS - 1);
    const colour = mix(look.haze, look.land, 0.16 + 0.84 * near ** 1.35);
    const base = h * (0.5 + layer * 0.085);
    const amp = h * (look.ridge === 'peaks' ? 0.17 - layer * 0.026 : 0.06 - layer * 0.007);
    const top = ridge(look.ridge, rand, w, base, amp);

    // Before this layer: things that stand behind it.
    if (layer === 1 && look.features.includes('castle')) castle(g, w * 0.7, top, h, colour);
    if (layer === 2 && look.features.includes('river')) river(g, w, h, base + h * 0.02, look);

    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(0, h);
    for (let i = 0; i < top.length; i++) g.lineTo(i * STEP, top[i]);
    g.lineTo(w, h);
    g.closePath();
    g.fill();

    // Silhouettes standing on this layer, in its own colour.
    if (look.features.includes('canopy') && layer >= 1 && layer <= 2) {
      const count = 2 + layer;
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.1 + rand() * 0.8) / count) * w;
        jungleTree(g, x, at(top, x), h * (0.17 - layer * 0.025) * (0.75 + rand() * 0.5), colour, rand);
      }
    }
    if (look.features.includes('pines') && layer >= 2 && layer <= 3) {
      for (let i = 0; i < 9; i++) {
        const x = rand() * w;
        pine(g, x, at(top, x), h * (0.06 - layer * 0.008) * (0.7 + rand() * 0.6), colour);
      }
    }
    if (look.features.includes('cliffs') && layer === 1) {
      cliff(g, w * (0.08 + rand() * 0.1), top, h, colour);
      cliff(g, w * (0.82 + rand() * 0.1), top, h, colour);
    }
    if (look.features.includes('frames') && layer === 2) {
      for (let i = 0; i < 2; i++) headframe(g, w * (0.16 + i * 0.62 + rand() * 0.06), top, h, colour);
    }

    // Mist settling in front of this layer: a soft band of haze, so each layer sits apart.
    if (layer < LAYERS - 1) {
      const mist = g.createLinearGradient(0, base - h * 0.04, 0, base + h * 0.12);
      mist.addColorStop(0, hexA(look.haze, 0));
      mist.addColorStop(0.5, hexA(look.haze, 0.32));
      mist.addColorStop(1, hexA(look.haze, 0));
      g.fillStyle = mist;
      g.fillRect(0, base - h * 0.04, w, h * 0.16);
    }
  }

  // A gentle vignette, so the frame holds the eye in the middle.
  const v = g.createRadialGradient(w / 2, h * 0.45, h * 0.35, w / 2, h * 0.45, w * 0.72);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(30, 30, 40, 0.16)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

/** A soft, wide band of drifting mist (for the slow mist in front of the painting). */
export function mistTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 66;
    const r = 70 + (i % 3) * 14;
    const puff = g.createRadialGradient(x, 64, 0, x, 64, r);
    puff.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = puff;
    g.fillRect(0, 0, 512, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// ------------------------------------------------------------------ Shapes

/** Ridge samples are this many pixels apart. */
const STEP = 4;

/** The top edge of one layer of land, as y per sample. */
function ridge(kind: Ridge, rand: () => number, w: number, base: number, amp: number): number[] {
  const n = Math.ceil(w / STEP) + 1;
  const out = new Array<number>(n);
  if (kind === 'peaks') {
    // Mountain ridges: a few peaks joined by sagging saddles, roughened with smaller teeth.
    const peaks = 3 + Math.floor(rand() * 3);
    const spots = Array.from({ length: peaks }, (_, i) => ({ x: ((i + 0.2 + rand() * 0.6) / peaks) * w, hgt: 0.5 + rand() * 0.5 }));
    const f = 9 + rand() * 6;
    const p = rand() * 6;
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      let best = 0;
      for (const s of spots) best = Math.max(best, s.hgt * Math.max(0, 1 - Math.abs(x - s.x) / (w / peaks) * 1.5));
      const teeth = 0.08 * Math.abs(Math.sin((x / w) * Math.PI * f + p));
      out[i] = base - amp * (best + teeth);
    }
    return out;
  }
  if (kind === 'mesas') {
    // Flat-topped rock with steep sides: a soft-clipped wave.
    const f1 = 1.2 + rand() * 1.2;
    const f2 = 3 + rand() * 2;
    const p1 = rand() * 6;
    const p2 = rand() * 6;
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      const wave = Math.sin((x / w) * Math.PI * f1 + p1) + 0.5 * Math.sin((x / w) * Math.PI * f2 + p2);
      const flat = Math.tanh(wave * 2.2);
      out[i] = base - amp * (0.4 + flat * 0.75);
    }
    return out;
  }
  // Rolling hills: a sum of gentle waves.
  const f1 = 1.2 + rand() * 1.3;
  const f2 = 2.6 + rand() * 2.6;
  const p1 = rand() * 6;
  const p2 = rand() * 6;
  for (let i = 0; i < n; i++) {
    const x = i * STEP;
    out[i] = base - amp * (Math.sin((x / w) * Math.PI * f1 + p1) + 0.4 * Math.sin((x / w) * Math.PI * f2 + p2));
  }
  return out;
}

/** The ridge's height at x. */
function at(top: number[], x: number): number {
  return top[Math.max(0, Math.min(top.length - 1, Math.round(x / STEP)))];
}

/** A tall rainforest tree: a slender trunk and a few wide, flat crowns, one tone. */
function jungleTree(g: CanvasRenderingContext2D, x: number, ground: number, height: number, colour: string, rand: () => number): void {
  g.fillStyle = colour;
  const trunk = Math.max(2, height * 0.035);
  g.beginPath();
  g.moveTo(x - trunk, ground + 4);
  g.lineTo(x - trunk * 0.5, ground - height);
  g.lineTo(x + trunk * 0.5, ground - height);
  g.lineTo(x + trunk, ground + 4);
  g.closePath();
  g.fill();
  // A broad, uneven crown of overlapping leaf masses, and a lower bough or two.
  const crown = (cx: number, cy: number, span: number) => {
    for (let i = 0; i < 5; i++) {
      const dx = (i / 4 - 0.5) * span * 1.4 + (rand() - 0.5) * span * 0.2;
      const r = span * (0.32 + rand() * 0.18) * (1 - Math.abs(i / 4 - 0.5) * 0.6);
      g.beginPath();
      g.ellipse(cx + dx, cy - r * 0.15 + (rand() - 0.5) * r * 0.3, r, r * 0.55, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  crown(x, ground - height, height * 0.42);
  if (rand() < 0.7) {
    const side = rand() < 0.5 ? -1 : 1;
    const by = ground - height * (0.6 + rand() * 0.15);
    g.lineWidth = Math.max(1.5, trunk * 0.7);
    g.strokeStyle = colour;
    g.beginPath();
    g.moveTo(x, by + height * 0.08);
    g.lineTo(x + side * height * 0.16, by);
    g.stroke();
    crown(x + side * height * 0.18, by, height * 0.2);
  }
}

/** A narrow pine. */
function pine(g: CanvasRenderingContext2D, x: number, ground: number, height: number, colour: string): void {
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(x, ground - height);
  g.lineTo(x + height * 0.22, ground + 2);
  g.lineTo(x - height * 0.22, ground + 2);
  g.closePath();
  g.fill();
}

/** A tall river cliff, rising from its layer. */
function cliff(g: CanvasRenderingContext2D, x: number, top: number[], h: number, colour: string): void {
  const ground = at(top, x);
  const height = h * 0.16;
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(x - h * 0.09, ground + 2);
  g.lineTo(x - h * 0.06, ground - height * 0.7);
  g.lineTo(x - h * 0.03, ground - height);
  g.lineTo(x + h * 0.05, ground - height * 0.95);
  g.lineTo(x + h * 0.08, ground - height * 0.4);
  g.lineTo(x + h * 0.1, ground + 2);
  g.closePath();
  g.fill();
}

/** Still water across the valley: a pale band with a few long, faint light lines. */
function river(g: CanvasRenderingContext2D, w: number, h: number, y: number, look: Palette): void {
  const band = g.createLinearGradient(0, y - h * 0.03, 0, y + h * 0.05);
  band.addColorStop(0, hexA(look.haze, 0.95));
  band.addColorStop(1, mix(look.haze, look.land, 0.25));
  g.fillStyle = band;
  g.fillRect(0, y - h * 0.03, w, h * 0.08);
  g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const ly = y - h * 0.015 + i * h * 0.012;
    const x0 = w * (0.1 + ((i * 37) % 50) / 100);
    g.beginPath();
    g.moveTo(x0, ly);
    g.lineTo(x0 + w * 0.18, ly);
    g.stroke();
  }
}

/** A mine's timber headframe: two legs, a cross beam and the wheel. */
function headframe(g: CanvasRenderingContext2D, x: number, top: number[], h: number, colour: string): void {
  const ground = at(top, x);
  const height = h * 0.14;
  g.strokeStyle = colour;
  g.lineWidth = Math.max(2, h * 0.006);
  g.beginPath();
  g.moveTo(x - height * 0.3, ground + 2);
  g.lineTo(x - height * 0.08, ground - height);
  g.lineTo(x + height * 0.08, ground - height);
  g.lineTo(x + height * 0.3, ground + 2);
  g.moveTo(x - height * 0.22, ground - height * 0.35);
  g.lineTo(x + height * 0.22, ground - height * 0.35);
  g.moveTo(x - height * 0.15, ground - height * 0.68);
  g.lineTo(x + height * 0.15, ground - height * 0.68);
  g.stroke();
  g.beginPath();
  g.arc(x, ground - height, height * 0.13, 0, Math.PI * 2);
  g.stroke();
}

/** A far castle on the ridge: towers and a keep, one flat tone. */
function castle(g: CanvasRenderingContext2D, x: number, top: number[], h: number, colour: string): void {
  const ground = at(top, x);
  const s = h * 0.1;
  g.fillStyle = colour;
  g.fillRect(x - s * 0.6, ground - s * 0.7, s * 1.2, s * 0.7 + 4);
  for (const [dx, tall] of [[-0.6, 1.15], [0.45, 1.3], [-0.1, 1.6]] as const) {
    g.fillRect(x + dx * s - s * 0.1, ground - s * tall, s * 0.22, s * tall);
    g.beginPath();
    g.moveTo(x + dx * s - s * 0.14, ground - s * tall);
    g.lineTo(x + dx * s + s * 0.01, ground - s * (tall + 0.25));
    g.lineTo(x + dx * s + s * 0.16, ground - s * tall);
    g.closePath();
    g.fill();
  }
}

// ------------------------------------------------------------------ Colour

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** a → b by k, as a CSS colour. */
function mix(a: string, b: string, k: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * k)}, ${Math.round(g1 + (g2 - g1) * k)}, ${Math.round(b1 + (b2 - b1) * k)})`;
}

function hexA(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
