import { type Diagram, JOURNAL } from './journal.js';
import { play } from './progress.js';
import { PUZZLES, WORLDS } from './world/puzzles.js';

/**
 * The Inventor's Journal drawn as an open notebook on a 1024 × 512 canvas:
 * a leather cover, two cream pages with a shadow down the spine. The left
 * page carries a sketch in sepia ink (each line drawn twice with a slight
 * wobble, like a pen), the right page the science, its formula, and your
 * own numbers from the run in blue ink. Pages not yet earned are faint,
 * sealed with wax.
 */

const W = 1024;
const H = 512;
const SEPIA = '#3b2a1a';
const BLUE = '#1f3f86';
const RED = '#b0302a';
const GOLD = '#c98a1c';

let seed = 1;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

/** A pen line: two passes with a slight wobble. */
function pen(g: CanvasRenderingContext2D, pts: Array<[number, number]>, width = 2.6, color = SEPIA, close = false): void {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = pass === 0 ? width : width * 0.55;
    const a = g.globalAlpha;
    if (pass === 1) g.globalAlpha = a * 0.55;
    g.beginPath();
    const all = close ? [...pts, pts[0]] : pts;
    all.forEach(([x, y], i) => {
      const jx = (rand() - 0.5) * 1.6;
      const jy = (rand() - 0.5) * 1.6;
      if (i === 0) g.moveTo(x + jx, y + jy);
      else {
        const [px, py] = all[i - 1];
        g.quadraticCurveTo((px + x) / 2 + (rand() - 0.5) * 2, (py + y) / 2 + (rand() - 0.5) * 2, x + jx, y + jy);
      }
    });
    g.stroke();
    g.globalAlpha = a;
  }
}

function ring(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, width = 2.4, color = SEPIA, from = 0, to = Math.PI * 2): void {
  const pts: Array<[number, number]> = [];
  const n = Math.max(8, Math.round(r * Math.abs(to - from) * 0.25));
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pen(g, pts, width, color);
}

function arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color = SEPIA, width = 2.6): void {
  pen(g, [[x0, y0], [x1, y1]], width, color);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const s = 11;
  pen(g, [[x1 - Math.cos(a - 0.45) * s, y1 - Math.sin(a - 0.45) * s], [x1, y1], [x1 - Math.cos(a + 0.45) * s, y1 - Math.sin(a + 0.45) * s]], width, color);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 20, color = SEPIA, align: CanvasTextAlign = 'center', italic = true): void {
  g.fillStyle = color;
  g.font = `${italic ? 'italic ' : ''}600 ${size}px Georgia, serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

function wash(g: CanvasRenderingContext2D, pts: Array<[number, number]>, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fill();
}

// ============================================================== Diagrams

/** The sketches live in the box x 40–490, y 70–400. */
const DRAW: Record<Diagram, (g: CanvasRenderingContext2D) => void> = {
  optics(g) {
    const lx = 90;
    const ly = 235;
    const hx = 210;
    const sx = 450;
    const k = (sx - lx) / (hx - lx);
    // The cone of shadow behind the hand.
    wash(g, [[hx, ly - 26], [sx, ly - 26 * k], [sx, ly + 26 * k], [hx, ly + 26]], 'rgba(60, 40, 20, 0.16)');
    pen(g, [[lx, ly], [sx, ly - 26 * k]], 1.6, GOLD);
    pen(g, [[lx, ly], [sx, ly + 26 * k]], 1.6, GOLD);
    for (const a of [-0.55, -0.35, 0.35, 0.55]) pen(g, [[lx, ly], [lx + Math.cos(a) * 60, ly + Math.sin(a) * 60]], 1.4, GOLD);
    // The lantern, the hand, the screen.
    pen(g, [[lx - 16, ly - 22], [lx + 16, ly - 22], [lx + 16, ly + 22], [lx - 16, ly + 22]], 2.6, SEPIA, true);
    wash(g, [[lx - 6, ly + 8], [lx, ly - 10], [lx + 6, ly + 8]], 'rgba(240, 150, 30, 0.8)');
    pen(g, [[hx, ly - 26], [hx + 6, ly - 10], [hx + 8, ly + 6], [hx, ly + 26], [hx - 8, ly + 6], [hx - 6, ly - 10]], 2.8, SEPIA, true);
    pen(g, [[sx, 80], [sx, 390]], 3.4, SEPIA);
    pen(g, [[sx + 4, ly - 26 * k], [sx + 4, ly + 26 * k]], 7, 'rgba(40, 25, 10, 0.75)');
    label(g, 'lantern', lx, ly + 44, 18);
    label(g, 'hand', hx, ly + 46, 18);
    label(g, 'shadow', sx - 46, ly + 26 * k + 22, 18);
    // d and D.
    pen(g, [[lx, 360], [hx, 360]], 1.8, BLUE);
    label(g, 'd', (lx + hx) / 2, 346, 22, BLUE);
    pen(g, [[lx, 390], [sx, 390]], 1.8, BLUE);
    label(g, 'D', (lx + sx) / 2, 376, 22, BLUE);
  },

  ramp(g) {
    pen(g, [[50, 360], [480, 360]], 2.6);
    pen(g, [[330, 360], [330, 190], [480, 190]], 3);
    wash(g, [[90, 360], [330, 190], [330, 360]], 'rgba(30, 30, 60, 0.18)');
    pen(g, [[90, 360], [330, 190]], 3.2, BLUE);
    // Little steps up the ramp: many small climbs.
    for (let i = 1; i < 6; i++) {
      const x = 90 + i * 40;
      const y = 360 - i * 28.3;
      pen(g, [[x - 40, y + 28.3], [x - 40, y], [x, y]], 1.4, 'rgba(59, 42, 26, 0.6)');
    }
    // A friend walking up.
    const fx = 190;
    const fy = 289;
    ring(g, fx, fy - 30, 9, 2.2);
    pen(g, [[fx, fy - 21], [fx, fy - 2], [fx - 8, fy + 10]], 2.2);
    pen(g, [[fx, fy - 2], [fx + 9, fy + 6]], 2.2);
    label(g, 'height', 352, 275, 18, SEPIA, 'left');
    pen(g, [[345, 195], [345, 355]], 1.4, BLUE);
    label(g, 'length of the ramp', 200, 210, 18, BLUE);
    label(g, 'one big step', 405, 160, 18);
    label(g, '= many small ones', 200, 390, 18);
  },

  scaling(g) {
    // Two cubes: size 1 and size 2, with the muscle's cross-section shaded.
    const cube = (x: number, y: number, s: number) => {
      const d = s * 0.4;
      wash(g, [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], 'rgba(201, 138, 28, 0.25)');
      pen(g, [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], 2.6, SEPIA, true);
      pen(g, [[x, y], [x + d, y - d], [x + s + d, y - d], [x + s, y]], 2.2);
      pen(g, [[x + s + d, y - d], [x + s + d, y + s - d], [x + s, y + s]], 2.2);
    };
    cube(80, 230, 70);
    cube(250, 160, 140);
    label(g, 'size 1', 115, 330, 20);
    label(g, 'size 2', 320, 330, 20);
    label(g, 'strength ×1', 115, 362, 18, BLUE);
    label(g, 'weight ×1', 115, 386, 18, RED);
    label(g, 'strength ×4  (area)', 320, 362, 18, BLUE);
    label(g, 'weight ×8  (volume)', 320, 386, 18, RED);
    label(g, 'the face is the muscle’s cross-section', 265, 95, 17);
  },

  pendulum(g) {
    const leg = (x: number, len: number, swing: number, tag: string) => {
      const top = 110;
      pen(g, [[x - 30, top], [x + 30, top]], 3);
      ring(g, x, top, len, 1.4, 'rgba(31, 63, 134, 0.6)', Math.PI / 2 - swing, Math.PI / 2 + swing);
      for (const s of [-swing, 0, swing]) {
        const bx = x + Math.sin(s) * len;
        const by = top + Math.cos(s) * len;
        g.globalAlpha *= s === 0 ? 1 : 0.4;
        pen(g, [[x, top], [bx, by]], 2.6);
        ring(g, bx, by, 9, 2.4);
        g.globalAlpha /= s === 0 ? 1 : 0.4;
      }
      label(g, tag, x, top + len + 40, 19);
    };
    leg(150, 110, 0.5, 'short leg: quick swing');
    leg(360, 210, 0.3, 'long leg: slow swing');
    label(g, 'swing time ∝ √length', 265, 80, 20, BLUE);
  },

  gears(g) {
    const cx = 210;
    const cy = 230;
    const R = 120;
    ring(g, cx, cy, R, 3);
    ring(g, cx, cy, R - 18, 1.6);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      pen(g, [[cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx + Math.cos(a) * (R + 11), cy + Math.sin(a) * (R + 11)]], 2.4);
    }
    ring(g, cx, cy, 10, 3);
    // The lantern pinion: two discs and nine staves, meshing at the right.
    const px = cx + R + 40;
    const r = 30;
    ring(g, px, cy, r + 6, 2.4);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ring(g, px + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 2, SEPIA);
    }
    // The drum, rope and bucket.
    pen(g, [[px - 14, cy + 40], [px + 14, cy + 40], [px + 14, cy + 70], [px - 14, cy + 70]], 2.4, SEPIA, true);
    pen(g, [[px + 14, cy + 60], [px + 60, cy + 60], [px + 60, cy + 120]], 1.8, '#8a6a3a');
    pen(g, [[px + 46, cy + 120], [px + 74, cy + 120], [px + 70, cy + 148], [px + 50, cy + 148]], 2.4, SEPIA, true);
    // The horse's sweep and the way it walks.
    pen(g, [[cx, cy], [cx - 120, cy + 120]], 3.2, '#7a4a20');
    ring(g, cx, cy, 170, 1.6, BLUE, 1.9, 2.6);
    arrow(g, cx + Math.cos(2.6) * 170, cy + Math.sin(2.6) * 170, cx + Math.cos(2.75) * 168, cy + Math.sin(2.75) * 168, BLUE);
    label(g, '36 cogs', cx, cy - R - 32, 19);
    label(g, '9 staves', px + 8, cy - r - 24, 19);
    label(g, '4× faster', px + 22, cy + 55, 17, BLUE, 'left');
    label(g, 'the horse walks round', cx - 30, cy + 172, 17, BLUE);
  },

  work(g) {
    // Same work, two ways: a big force over a short way, or a small force over a long way.
    const base = 350;
    pen(g, [[60, base], [480, base]], 2.6);
    pen(g, [[60, base], [60, 90]], 2.6);
    label(g, 'force', 52, 80, 18, SEPIA, 'right');
    label(g, 'distance', 470, base + 24, 18, SEPIA, 'right');
    wash(g, [[80, base], [80, 120], [180, 120], [180, base]], 'rgba(176, 48, 42, 0.22)');
    pen(g, [[80, base], [80, 120], [180, 120], [180, base]], 2.4, RED);
    wash(g, [[200, base], [200, 260], [470, 260], [470, base]], 'rgba(31, 63, 134, 0.2)');
    pen(g, [[200, base], [200, 260], [470, 260], [470, base]], 2.4, BLUE);
    label(g, 'big horse', 130, 235, 18, RED);
    label(g, 'short walk', 130, 260, 16, RED);
    label(g, 'small horse, more gearing:', 335, 290, 16, BLUE);
    label(g, 'a long walk', 335, 314, 16, BLUE);
    label(g, 'same area = same work', 330, 150, 20);
  },

  truss(g) {
    // A square racks over; a triangle holds.
    pen(g, [[70, 200], [170, 200], [170, 100], [70, 100]], 2.8, SEPIA, true);
    g.setLineDash([6, 6]);
    pen(g, [[70, 200], [170, 200], [210, 110], [110, 110]], 1.8, RED, true);
    g.setLineDash([]);
    label(g, 'a square folds', 130, 228, 18, RED);
    pen(g, [[300, 200], [420, 200], [360, 100]], 2.8, SEPIA, true);
    label(g, 'a triangle holds', 360, 228, 18, BLUE);
    // A truss bridge: the top squeezed, the bottom stretched.
    const y0 = 300;
    const y1 = 350;
    const xs = [80, 160, 240, 320, 400, 480];
    pen(g, [[xs[0], y0], [xs[5], y0]], 3, RED);
    pen(g, [[xs[0], y1], [xs[5], y1]], 3, BLUE);
    for (let i = 0; i < xs.length - 1; i++) pen(g, [[xs[i], i % 2 ? y0 : y1], [xs[i + 1], i % 2 ? y1 : y0]], 2.2);
    arrow(g, 200, y0 - 14, 240, y0 - 14, RED, 2);
    arrow(g, 360, y0 - 14, 320, y0 - 14, RED, 2);
    label(g, 'compression', 280, y0 - 32, 16, RED);
    arrow(g, 240, y1 + 14, 200, y1 + 14, BLUE, 2);
    arrow(g, 320, y1 + 14, 360, y1 + 14, BLUE, 2);
    label(g, 'tension', 280, y1 + 30, 16, BLUE);
  },

  buckling(g) {
    const column = (x: number, top: number, bottom: number, bow: number) => {
      pen(g, [[x - 26, top - 6], [x + 26, top - 6]], 3);
      pen(g, [[x - 26, bottom + 6], [x + 26, bottom + 6]], 3);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([x + Math.sin(t * Math.PI) * bow, top + (bottom - top) * t]);
      }
      g.setLineDash([5, 6]);
      pen(g, pts, 2, RED);
      g.setLineDash([]);
      pen(g, [[x, top], [x, bottom]], 4);
      arrow(g, x, top - 60, x, top - 10, SEPIA, 2.8);
      label(g, 'P', x + 16, top - 44, 22, SEPIA, 'left');
    };
    column(140, 130, 370, 34);
    column(360, 250, 370, 8);
    label(g, 'long strut: bows', 140, 395, 17, RED);
    label(g, 'half as long', 360, 395, 17, BLUE);
    label(g, '4× the load', 360, 160, 20, BLUE);
    label(g, 'L', 112, 250, 22, SEPIA);
    label(g, 'L/2', 330, 310, 20, SEPIA);
  },

  heat(g) {
    // A colour strip from the Draper point to white heat, with the forge's marks.
    const x0 = 60;
    const x1 = 470;
    const y = 170;
    const t0 = 400;
    const t1 = 1400;
    const at = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0);
    const strip = g.createLinearGradient(x0, 0, x1, 0);
    for (const [t, c] of [[400, '#1a0d08'], [525, '#3a0c06'], [650, '#8a1a0a'], [800, '#c8301a'], [950, '#e8641c'], [1100, '#f4a838'], [1250, '#fbe08a'], [1400, '#fffbe8']] as const) {
      strip.addColorStop((t - t0) / (t1 - t0), c);
    }
    g.fillStyle = strip;
    g.fillRect(x0, y, x1 - x0, 60);
    pen(g, [[x0, y], [x1, y], [x1, y + 60], [x0, y + 60]], 2.4, SEPIA, true);
    const mark = (t: number, text: string, row: number, color = SEPIA) => {
      pen(g, [[at(t), y + 60], [at(t), y + 72 + row * 30]], 1.6, color);
      label(g, text, at(t), y + 86 + row * 30, 16, color);
    };
    mark(525, '525° first glow', 0);
    mark(760, '760° shape it', 1, BLUE);
    mark(1000, 'cherry → orange', 0);
    mark(1330, '1330° burns', 1, RED);
    label(g, 'hammer between 760 and 1260 °C', 265, 120, 18, BLUE);
    label(g, 'quench from above 780 °C → hard steel', 265, 360, 18, SEPIA);
  },

  arrhenius(g) {
    // The pot's own two rates against temperature, from the game's constants.
    const x0 = 80;
    const x1 = 470;
    const y0 = 360;
    const y1 = 100;
    pen(g, [[x0, y1 - 10], [x0, y0], [x1 + 10, y0]], 2.6);
    const temps: number[] = [];
    for (let c = 40; c <= 100; c += 2.5) temps.push(c);
    const steep = (c: number) => 0.075 * Math.exp(4000 * (1 / 363 - 1 / (c + 273.15)));
    const spoil = (c: number) => 0.03 * Math.exp(15000 * (1 / 373 - 1 / (c + 273.15)));
    const top = Math.max(steep(100), spoil(100));
    const px = (c: number) => x0 + ((c - 40) / 60) * (x1 - x0);
    const py = (r: number) => y0 - (r / top) * (y0 - y1);
    wash(g, [[px(85), y0], [px(85), y1], [px(95), y1], [px(95), y0]], 'rgba(60, 160, 80, 0.18)');
    label(g, 'simmer', px(90), y1 - 14, 17, '#2f7a3a');
    pen(g, temps.map((c) => [px(c), py(steep(c))]), 3, BLUE);
    pen(g, temps.map((c) => [px(c), py(spoil(c))]), 3, RED);
    label(g, 'steeping', px(62), py(steep(62)) - 20, 18, BLUE);
    label(g, 'spoiling', px(97) - 30, py(spoil(97)) + 8, 18, RED, 'right');
    for (const c of [40, 60, 80, 100]) label(g, `${c}°`, px(c), y0 + 20, 16);
    label(g, 'rate', x0 - 12, y1 + 6, 17, SEPIA, 'right');
  },

  balloon(g) {
    const cx = 250;
    // The paper lantern: a rounded envelope, open at the bottom over a flame.
    const env: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * (0.62 + (1.76 * i) / 24);
      env.push([cx + Math.cos(a) * 95, 210 + Math.sin(a) * 120]);
    }
    wash(g, env, 'rgba(240, 180, 90, 0.28)');
    pen(g, env, 2.8);
    wash(g, [[cx - 8, 330], [cx, 305], [cx + 8, 330]], 'rgba(240, 120, 30, 0.85)');
    // Thin hot air inside, crowded cold air outside.
    seed = 11;
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 70;
      g.fillStyle = RED;
      g.beginPath();
      g.arc(cx + Math.cos(a) * r, 220 + Math.sin(a) * r * 0.85, 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 60; i++) {
      const x = 60 + rand() * 420;
      const y = 80 + rand() * 300;
      if (Math.hypot((x - cx) / 105, (y - 210) / 130) < 1) continue;
      g.fillStyle = BLUE;
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    arrow(g, cx + 140, 260, cx + 140, 140, GOLD, 3.2);
    label(g, 'lift', cx + 156, 200, 19, GOLD, 'left');
    arrow(g, cx - 140, 160, cx - 140, 270, SEPIA, 3.2);
    label(g, 'weight', cx - 156, 220, 19, SEPIA, 'right');
    label(g, 'hot, thin air', cx, 138, 17, RED);
    label(g, 'cold, dense air', 110, 380, 17, BLUE);
  },

  reflection(g) {
    // A tilted palm, its normal, and a fireball bouncing off it.
    const mx = 260;
    const my = 280;
    const tilt = -0.25;
    const ux = Math.cos(tilt);
    const uy = Math.sin(tilt);
    pen(g, [[mx - ux * 150, my - uy * 150], [mx + ux * 150, my + uy * 150]], 5, '#8a6a3a');
    g.setLineDash([6, 6]);
    pen(g, [[mx, my], [mx + uy * 150, my - ux * 150]], 1.8, SEPIA);
    g.setLineDash([]);
    label(g, 'n', mx + uy * 160, my - ux * 160 - 6, 22);
    const nx = uy;
    const ny = -ux;
    const vx = 0.85;
    const vy = 0.53;
    const d = vx * nx + vy * ny;
    const rx = vx - 2 * d * nx;
    const ry = vy - 2 * d * ny;
    arrow(g, mx - vx * 170, my - vy * 170, mx - vx * 8, my - vy * 8, RED, 3);
    arrow(g, mx, my, mx + rx * 170, my + ry * 170, GOLD, 3);
    label(g, 'v (fire in)', mx - vx * 175 - 6, my - vy * 175 - 14, 18, RED);
    label(g, "v′ (bounced)", mx + rx * 175 + 10, my + ry * 175 - 14, 18, GOLD);
    label(g, 'your palm', mx + ux * 120, my + uy * 120 + 26, 18, '#8a6a3a');
    label(g, 'same angle in and out', 265, 390, 18, BLUE);
  },

  pins(g) {
    // A cutaway lock: housing above, plug below, four stacks crossing the red shear line.
    const top = 100;
    const shear = 250;
    const bottom = 330;
    wash(g, [[60, shear], [470, shear], [470, bottom], [60, bottom]], 'rgba(201, 138, 28, 0.22)');
    pen(g, [[60, top], [470, top], [470, bottom], [60, bottom]], 2.6, SEPIA, true);
    g.setLineDash([8, 6]);
    pen(g, [[50, shear], [480, shear]], 2.4, RED);
    g.setLineDash([]);
    label(g, 'shear line', 400, shear - 14, 16, RED);
    label(g, 'housing', 112, top + 22, 16);
    label(g, 'plug (turns)', 125, bottom - 18, 16);
    const keys = [44, 62, 36, 54];
    [130, 215, 300, 385].forEach((x, i) => {
      const set = i === 1;
      const kTop = set ? shear : shear + 12;
      // Key pin (brass, pointed), driver (steel), spring above.
      const kBottom = kTop + keys[i];
      wash(g, [[x - 13, kTop], [x + 13, kTop], [x + 13, kBottom], [x, kBottom + 12], [x - 13, kBottom]], 'rgba(201, 150, 40, 0.75)');
      pen(g, [[x - 13, kTop], [x + 13, kTop], [x + 13, kBottom], [x, kBottom + 12], [x - 13, kBottom]], 2, SEPIA, true);
      const dBottom = set ? shear - 2 : kTop;
      wash(g, [[x - 13, dBottom - 42], [x + 13, dBottom - 42], [x + 13, dBottom], [x - 13, dBottom]], 'rgba(150, 160, 175, 0.8)');
      pen(g, [[x - 13, dBottom - 42], [x + 13, dBottom - 42], [x + 13, dBottom], [x - 13, dBottom]], 2, SEPIA, true);
      const spring: Array<[number, number]> = [];
      for (let y = top; y <= dBottom - 42; y += 6) spring.push([x + (((y - top) / 6) % 2 ? 10 : -10), y]);
      pen(g, spring, 1.6, '#6a7280');
      label(g, String(i + 1), x, top - 14, 16, SEPIA, 'center', false);
    });
    label(g, 'set: its gap is on the line', 215, 372, 16, BLUE);
    arrow(g, 300, 395, 300, 352, BLUE, 2);
    label(g, 'lift from below', 360, 398, 16, BLUE, 'left');
  },

  projectile(g) {
    // A throw from your hand to the witch, falling under gravity on the way.
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push([90 + t * 340, 300 - 260 * t + 230 * t * t]);
    }
    g.setLineDash([4, 7]);
    pen(g, pts, 2.2, BLUE);
    g.setLineDash([]);
    ring(g, 90, 300, 14, 2.6);
    label(g, 'your hand', 90, 336, 17);
    arrow(g, 90, 300, 160, 230, RED, 3);
    label(g, 'v', 106, 252, 22, RED);
    // The target: a hooded figure.
    pen(g, [[430, 300], [418, 250], [430, 230], [442, 250], [430, 300]], 2.6);
    pen(g, [[412, 340], [430, 300], [448, 340]], 2.6);
    pen(g, [[410, 232], [450, 232]], 2.6);
    pen(g, [[418, 232], [436, 196], [442, 232]], 2.6);
    arrow(g, 280, 150, 280, 210, SEPIA, 2.6);
    label(g, 'g', 296, 182, 22, SEPIA, 'left');
    label(g, 'E = ½ m v²', 265, 100, 24, BLUE);
    label(g, '2× speed → 4× energy', 265, 380, 18);
  },

  slingshot(g) {
    // A forked slingshot, its bands drawn back by x, and the stone's arc away.
    const forkX = 150;
    pen(g, [[forkX, 340], [forkX, 270]], 5);
    pen(g, [[forkX, 270], [forkX - 34, 200]], 5);
    pen(g, [[forkX, 270], [forkX + 34, 200]], 5);
    label(g, 'fork', forkX + 56, 316, 16);
    // Bands from the prongs back to the pouch, pulled down-left.
    const pouch: [number, number] = [70, 250];
    pen(g, [[forkX - 34, 200], pouch], 2, RED);
    pen(g, [[forkX + 34, 200], pouch], 2, RED);
    wash(g, [[pouch[0] - 12, pouch[1] - 10], [pouch[0] + 8, pouch[1] - 12], [pouch[0] + 8, pouch[1] + 12], [pouch[0] - 12, pouch[1] + 10]], 'rgba(120, 80, 40, 0.6)');
    ring(g, pouch[0] - 2, pouch[1], 7, 2.2);
    // The pull, x, measured from rest (between the prongs) back to the pouch.
    g.setLineDash([5, 6]);
    pen(g, [[forkX, 200], [pouch[0], pouch[1]]], 1.6, BLUE);
    g.setLineDash([]);
    label(g, 'x', 100, 210, 22, BLUE);
    // The stone's flight: launched up and right, bending down under gravity.
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      pts.push([forkX + 10 + t * 300, 196 - 150 * t + 170 * t * t]);
    }
    g.setLineDash([4, 7]);
    pen(g, pts, 2.2, BLUE);
    g.setLineDash([]);
    arrow(g, forkX + 10, 196, forkX + 70, 150, RED, 3);
    label(g, 'v', forkX + 52, 132, 22, RED);
    arrow(g, 380, 110, 380, 160, SEPIA, 2.6);
    label(g, 'g', 396, 136, 22, SEPIA, 'left');
    // Energy bars: x and 2x.
    wash(g, [[300, 300], [330, 300], [330, 340], [300, 340]], 'rgba(176, 48, 42, 0.45)');
    wash(g, [[360, 220], [390, 220], [390, 340], [360, 340]], 'rgba(176, 48, 42, 0.7)');
    pen(g, [[290, 340], [400, 340]], 2);
    label(g, 'x', 315, 360, 18, BLUE);
    label(g, '2x', 375, 360, 18, BLUE);
    label(g, 'E', 315, 288, 18);
    label(g, '4E', 375, 208, 18);
    label(g, '½ k x² → ½ m v²', 250, 92, 24, BLUE);
  },
};

// ================================================================== Page

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function paper(g: CanvasRenderingContext2D, x: number, w: number, spineLeft: boolean): void {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  const edge = 'rgba(214, 190, 150, 1)';
  const cream = '#f6ead2';
  grad.addColorStop(spineLeft ? 0 : 1, edge);
  grad.addColorStop(spineLeft ? 0.08 : 0.92, cream);
  grad.addColorStop(spineLeft ? 1 : 0, '#efe0c2');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(x, 20, w, H - 40, 8);
  g.fill();
}

/** Paint journal page `index` (of JOURNAL) as an open notebook. */
export function drawJournal(canvas: HTMLCanvasElement, index: number): void {
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const page = JOURNAL[index];
  const lines = play.journal[page.id];
  const earned = lines !== undefined;
  const level = page.id === 'duel' || page.title ? null : PUZZLES.find((p) => p.id === page.id);
  const title = page.title ?? level?.title ?? 'Ink Duel';
  const chapter = page.chapter ?? (level ? `Chapter ${level.world + 1} · ${WORLDS[level.world].name}` : 'Side game');
  seed = 7 + index * 131;

  // The leather cover, then the two pages and the spine's shadow.
  g.fillStyle = '#5a3418';
  g.beginPath();
  g.roundRect(4, 6, W - 8, H - 12, 22);
  g.fill();
  g.strokeStyle = '#c99a4c';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(10, 12, W - 20, H - 24, 18);
  g.stroke();
  paper(g, 24, W / 2 - 28, false);
  paper(g, W / 2 + 4, W / 2 - 28, true);
  const spine = g.createLinearGradient(W / 2 - 30, 0, W / 2 + 30, 0);
  spine.addColorStop(0, 'rgba(90, 60, 30, 0)');
  spine.addColorStop(0.5, 'rgba(90, 60, 30, 0.35)');
  spine.addColorStop(1, 'rgba(90, 60, 30, 0)');
  g.fillStyle = spine;
  g.fillRect(W / 2 - 30, 20, 60, H - 40);
  // Faint ruled lines on the right page.
  g.strokeStyle = 'rgba(120, 150, 190, 0.18)';
  g.lineWidth = 1;
  for (let y = 120; y < H - 40; y += 27) {
    g.beginPath();
    g.moveTo(W / 2 + 24, y);
    g.lineTo(W - 40, y);
    g.stroke();
  }
  // A red ribbon down from the top of the spine.
  wash(g, [[W / 2 + 10, 14], [W / 2 + 26, 14], [W / 2 + 26, 150], [W / 2 + 18, 140], [W / 2 + 10, 150]], '#a8282a');

  // Left page: the sketch and its caption.
  label(g, 'INVENTOR’S JOURNAL', 52, 46, 15, '#8a6a4a', 'left', false);
  label(g, `${index + 1} / ${JOURNAL.length}`, W / 2 - 44, 46, 15, '#8a6a4a', 'right', false);
  g.save();
  g.globalAlpha = earned ? 1 : 0.18;
  DRAW[page.diagram](g);
  g.restore();
  label(g, title, W / 4, 432, 24, SEPIA, 'center', false);
  label(g, chapter, W / 4, 462, 16, '#8a6a4a');

  // Right page: the science.
  const rx = W / 2 + 40;
  const rw = W / 2 - 84;
  const stars = play.stars[page.id] ?? 0;
  if (stars > 0) label(g, '★'.repeat(stars) + '☆'.repeat(3 - stars), W - 48, 46, 22, GOLD, 'right', false);
  g.fillStyle = SEPIA;
  g.font = '700 30px Georgia, serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(page.topic, rx, 84, rw);
  // The formula, boxed like a fair copy.
  g.font = 'italic 600 24px Georgia, serif';
  const fw = Math.min(rw, g.measureText(page.formula).width + 36);
  g.fillStyle = 'rgba(201, 138, 28, 0.14)';
  g.beginPath();
  g.roundRect(rx, 108, fw, 42, 8);
  g.fill();
  g.strokeStyle = 'rgba(150, 100, 30, 0.6)';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#5a3418';
  g.fillText(page.formula, rx + 18, 130, rw - 36);
  // The explanation.
  g.font = '19px Georgia, serif';
  g.fillStyle = earned ? '#2e2216' : 'rgba(46, 34, 22, 0.4)';
  wrap(g, page.body, rw).slice(0, 6).forEach((line, i) => g.fillText(line, rx, 176 + i * 27));

  // Your run, in blue ink; or the wax seal on a page not yet earned.
  const by = 344;
  if (earned) {
    g.fillStyle = 'rgba(31, 63, 134, 0.07)';
    g.beginPath();
    g.roundRect(rx - 10, by, rw + 20, 130, 10);
    g.fill();
    label(g, 'YOUR RUN', rx, by + 20, 15, '#5a6a8a', 'left', false);
    g.font = 'italic 19px Georgia, serif';
    g.fillStyle = BLUE;
    (lines.length ? lines : ['Cleared: the page is yours']).slice(0, 3).forEach((line, i) => g.fillText(line, rx, by + 50 + i * 27, rw));
  } else {
    const sx = W - 140;
    const sy = by + 60;
    const seal = g.createRadialGradient(sx - 10, sy - 10, 4, sx, sy, 46);
    seal.addColorStop(0, '#d8463a');
    seal.addColorStop(1, '#8a1a18');
    g.fillStyle = seal;
    g.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 44 + (i % 2 ? 4 : 0);
      g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    label(g, '?', sx, sy + 2, 40, '#f6d0b0', 'center', false);
    g.textAlign = 'left';
    g.font = 'italic 19px Georgia, serif';
    g.fillStyle = '#5a3418';
    wrap(g, `Clear ${title} to fill this page with your own numbers.`, rw - 180).forEach((line, i) => g.fillText(line, rx, by + 34 + i * 27));
  }
}
