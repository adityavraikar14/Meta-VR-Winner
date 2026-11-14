import { FONT } from '../ui-theme.js';
import { ARMS, POSES, type ShadowShape, SHAPES } from './shadow-arms.js';
import type { Sketch } from './sketch.js';

/**
 * Pictures for learning the shadow weapons: a hand diagram for each shape
 * (drawn from which fingers are straight), an icon for each drawing, and the
 * whole chart that Hint shows in a fight.
 */

const INK = '#1a1230';

function capsule(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number): void {
  g.lineCap = 'round';
  g.lineWidth = r * 2;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/**
 * A right hand seen from the back, palm away from you, fingers up: straight
 * fingers drawn long, curled ones as knuckles. `s` is about the palm's width.
 */
export function drawHand(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, shape: ShadowShape | null, color = '#ffffff'): void {
  const pose = shape ? POSES[shape] : ([0.6, 0.6, 0.6, 0.6, 0.6] as const);
  g.save();
  g.strokeStyle = g.fillStyle = color;
  // Palm and wrist.
  const pw = s;
  const ph = s * 0.9;
  const top = cy - ph * 0.15;
  g.beginPath();
  g.roundRect(cx - pw / 2, top, pw, ph, s * 0.22);
  g.fill();
  g.fillRect(cx - pw * 0.32, top + ph - 2, pw * 0.64, s * 0.32);
  // Fingers: index on the left (a right hand from the back), pinky on the right.
  const fr = s * 0.105;
  const lengths = [0.95, 1.05, 0.98, 0.8];
  [pose[1], pose[2], pose[3], pose[4]].forEach((ext, i) => {
    const x = cx - pw / 2 + fr + 2 + i * ((pw - 2 * fr - 4) / 3);
    const straight = ext > 0.6;
    const len = straight ? s * lengths[i] : s * 0.16;
    capsule(g, x, top + fr, x, top + fr - len, fr);
  });
  // Thumb: out to the left, or folded across the palm.
  const thumbOut = pose[0] > 0.6;
  if (thumbOut) capsule(g, cx - pw / 2 + fr, top + ph * 0.55, cx - pw / 2 - s * 0.42, top + ph * 0.1, fr * 1.1);
  else {
    g.strokeStyle = shade(color);
    capsule(g, cx - pw / 2 + fr * 1.2, top + ph * 0.5, cx + pw * 0.05, top + ph * 0.28, fr * 1.05);
  }
  g.restore();
}

function shade(color: string): string {
  return color === '#ffffff' ? '#c9d4ec' : 'rgba(0,0,0,0.25)';
}

/** An icon of a drawing that becomes a weapon, as a glowing line. */
export function drawSketch(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, sketch: Sketch, color = '#9fe8ff'): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = Math.max(3, s * 0.07);
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  const r = s / 2;
  switch (sketch) {
    case 'circle':
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      break;
    case 'star':
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const k = i % 2 ? 0.4 : 0.95;
        g.lineTo(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k);
      }
      break;
    case 'triangle':
      g.moveTo(cx, cy - r * 0.9);
      g.lineTo(cx + r * 0.85, cy + r * 0.7);
      g.lineTo(cx - r * 0.85, cy + r * 0.7);
      g.closePath();
      break;
    case 'sword':
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.16, cy - r * 0.7);
      g.lineTo(cx + r * 0.16, cy + r);
      g.lineTo(cx - r * 0.16, cy + r);
      g.lineTo(cx - r * 0.16, cy - r * 0.7);
      g.closePath();
      break;
    case 'zigzag':
      g.moveTo(cx - r * 0.5, cy - r);
      g.lineTo(cx + r * 0.4, cy - r * 0.45);
      g.lineTo(cx - r * 0.4, cy);
      g.lineTo(cx + r * 0.4, cy + r * 0.45);
      g.lineTo(cx - r * 0.3, cy + r);
      break;
    case 'spiral':
      for (let i = 0; i < 70; i++) {
        const a = i * 0.28;
        const rr = r * (0.08 + i * 0.0125);
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      break;
    case 'box':
      g.rect(cx - r * 0.8, cy - r * 0.65, r * 1.6, r * 1.3);
      break;
  }
  g.stroke();
  g.restore();
}

/** Which weapon each drawing becomes (in the story's fights). */
export const DRAWN_WEAPON: Record<Sketch, ShadowShape> = { sword: 'blade', star: 'vee', triangle: 'point', circle: 'fist', zigzag: 'horns', spiral: 'shaka', box: 'palm' };
export const SKETCH_ORDER: Sketch[] = ['sword', 'circle', 'triangle', 'star', 'zigzag', 'spiral', 'box'];

/** Short names for each hand shape, for the chart. */
export const SHAPE_LABEL: Record<ShadowShape, string> = {
  fist: 'Fist',
  blade: 'Flat hand',
  palm: 'Open palm',
  point: 'One finger',
  vee: 'Peace sign',
  three: 'Three fingers',
  horns: 'Horns',
  shaka: 'Thumb + pinky',
  ell: 'L shape',
  thumb: 'Thumbs-up',
};

/** What to do with each weapon, in a few words. */
export const SHAPE_USE: Record<ShadowShape, string> = {
  fist: 'punch to throw',
  blade: 'swing to slash',
  palm: 'face them: blocks ink',
  point: 'punch: fast spear',
  vee: 'punch: two stars',
  three: 'punch: three slashes',
  horns: 'punch: bolt from above',
  shaka: 'punch: curves in',
  ell: 'punch: fastest',
  thumb: 'punch: heaviest',
};

/**
 * The whole chart, on a canvas already set up at layout size w × h (about
 * 1024 × 512): ten hand shapes in two rows, then the seven drawings.
 */
export function drawArmsChart(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(20, 33, 61, 0.96)';
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 12, 22);
  g.fill();
  g.strokeStyle = '#ffd84a';
  g.lineWidth = 4;
  g.stroke();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#ffd84a';
  g.font = `900 22px ${FONT}`;
  g.fillText('SHADOW WEAPONS', 26, 32);
  const after = 26 + g.measureText('SHADOW WEAPONS').width + 22;
  g.fillStyle = '#c9d4ec';
  g.font = `700 15px ${FONT}`;
  g.fillText('Hold a hand shape a moment: the weapon forms. Punch towards them to throw it.', after, 32, w - after - 24);

  const cellW = (w - 40) / 5;
  const rowH = 158;
  SHAPES.forEach((shape, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 20 + col * cellW + cellW / 2;
    const y = 58 + row * rowH;
    const spec = ARMS[shape];
    const color = `#${spec.color.toString(16).padStart(6, '0')}`;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.roundRect(x - cellW / 2 + 5, y, cellW - 10, rowH - 8, 14);
    g.fill();
    drawHand(g, x, y + 62, 38, shape, color);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `800 16px ${FONT}`;
    g.fillText(SHAPE_LABEL[shape], x, y + 112, cellW - 16);
    g.fillStyle = color;
    g.font = `900 15px ${FONT}`;
    g.fillText(spec.name, x, y + 130, cellW - 16);
    g.fillStyle = '#9fb3d9';
    g.font = `600 13px ${FONT}`;
    g.fillText(SHAPE_USE[shape], x, y + 146, cellW - 16);
  });

  // The drawings.
  const y = 58 + rowH * 2 + 8;
  g.textAlign = 'left';
  g.fillStyle = '#9fe8ff';
  g.font = `900 16px ${FONT}`;
  g.fillText('OR DRAW ONE:', 26, y + 30);
  const each = (w - 170) / SKETCH_ORDER.length;
  SKETCH_ORDER.forEach((sketch, i) => {
    const x = 160 + i * each + each / 2;
    drawSketch(g, x, y + 22, 34, sketch);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `700 13px ${FONT}`;
    g.fillText(ARMS[DRAWN_WEAPON[sketch]].name, x, y + 56, each - 6);
  });
}
