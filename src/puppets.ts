/**
 * Shadow-puppet silhouettes drawn with canvas paths, shared by the intro show
 * and the shadow world on the paper. Feet sit at (x, y); sizes scale with s.
 */

export const INK = '#160c06';
/** Canvas size the intro draws at; grass() spans this width. */
export const W = 1024;
export const H = 512;
export const GROUND = 440;

/** 0..1 eased in and out. */
export function ease(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = spin + (i * Math.PI) / 5 - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255, 214, 130, ${0.85 * alpha})`);
  g.addColorStop(0.4, `rgba(255, 170, 70, ${0.35 * alpha})`);
  g.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, swing: number, lit: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  if (lit > 0) glow(ctx, 0, 60 * s, 190 * s, lit);
  ctx.fillStyle = INK;
  ctx.fillRect(-2 * s, -60 * s, 4 * s, 60 * s);
  ctx.beginPath();
  ctx.arc(0, -66 * s, 9 * s, 0, Math.PI * 2);
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-26 * s, 18 * s);
  ctx.lineTo(-14 * s, 0);
  ctx.lineTo(14 * s, 0);
  ctx.lineTo(26 * s, 18 * s);
  ctx.fill();
  ctx.fillRect(-24 * s, 18 * s, 48 * s, 72 * s);
  ctx.fillRect(-30 * s, 88 * s, 60 * s, 10 * s);
  // Light shining through the glass panes.
  ctx.fillStyle = `rgba(255, 210, 120, ${lit})`;
  ctx.fillRect(-16 * s, 26 * s, 13 * s, 54 * s);
  ctx.fillRect(3 * s, 26 * s, 13 * s, 54 * s);
  ctx.restore();
}

export function rabbit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ear = 0): void {
  ctx.fillStyle = INK;
  ellipse(ctx, x, y - 34 * s, 44 * s, 32 * s);
  ellipse(ctx, x + 38 * s, y - 66 * s, 22 * s, 20 * s);
  ellipse(ctx, x + 30 * s, y - 108 * s, 7 * s, 30 * s, -0.25 + ear);
  ellipse(ctx, x + 46 * s, y - 106 * s, 7 * s, 28 * s, 0.15 + ear);
  ellipse(ctx, x - 44 * s, y - 40 * s, 11 * s, 11 * s);
  ellipse(ctx, x + 22 * s, y - 6 * s, 16 * s, 7 * s);
  ellipse(ctx, x - 20 * s, y - 6 * s, 18 * s, 8 * s);
}

export function bird(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number): void {
  ctx.fillStyle = INK;
  ellipse(ctx, x, y, 26 * s, 13 * s);
  ellipse(ctx, x + 24 * s, y - 8 * s, 11 * s, 10 * s);
  ctx.beginPath();
  ctx.moveTo(x + 33 * s, y - 10 * s);
  ctx.lineTo(x + 46 * s, y - 6 * s);
  ctx.lineTo(x + 33 * s, y - 3 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 22 * s, y);
  ctx.lineTo(x - 42 * s, y - 8 * s);
  ctx.lineTo(x - 36 * s, y + 8 * s);
  ctx.fill();
  const lift = Math.sin(flap) * 34 * s;
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y - 4 * s);
  ctx.quadraticCurveTo(x - 4 * s, y - 20 * s - lift, x - 18 * s, y - 10 * s - lift * 1.4);
  ctx.lineTo(x + 10 * s, y - 4 * s);
  ctx.fill();
}

export function deer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = INK;
  ellipse(ctx, x, y - 70 * s, 50 * s, 24 * s);
  for (const lx of [-34, -20, 22, 36]) ctx.fillRect(x + lx * s, y - 60 * s, 7 * s, 60 * s);
  ctx.beginPath();
  ctx.moveTo(x + 30 * s, y - 84 * s);
  ctx.lineTo(x + 52 * s, y - 132 * s);
  ctx.lineTo(x + 66 * s, y - 124 * s);
  ctx.lineTo(x + 50 * s, y - 72 * s);
  ctx.fill();
  ellipse(ctx, x + 68 * s, y - 136 * s, 20 * s, 11 * s, 0.3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 58 * s, y - 146 * s);
  ctx.lineTo(x + 48 * s, y - 180 * s);
  ctx.moveTo(x + 52 * s, y - 166 * s);
  ctx.lineTo(x + 36 * s, y - 176 * s);
  ctx.moveTo(x + 66 * s, y - 146 * s);
  ctx.lineTo(x + 74 * s, y - 182 * s);
  ctx.moveTo(x + 71 * s, y - 166 * s);
  ctx.lineTo(x + 86 * s, y - 174 * s);
  ctx.stroke();
}

export function dragon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sneeze: number): void {
  ctx.fillStyle = INK;
  ellipse(ctx, x, y - 70 * s, 80 * s, 46 * s);
  // Tail sweeping out behind.
  ctx.beginPath();
  ctx.moveTo(x + 70 * s, y - 60 * s);
  ctx.quadraticCurveTo(x + 160 * s, y - 20 * s, x + 190 * s, y - 80 * s);
  ctx.lineTo(x + 176 * s, y - 60 * s);
  ctx.quadraticCurveTo(x + 150 * s, y - 40 * s, x + 66 * s, y - 40 * s);
  ctx.fill();
  // Wing.
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y - 100 * s);
  ctx.lineTo(x + 40 * s, y - 190 * s);
  ctx.lineTo(x + 60 * s, y - 120 * s);
  ctx.lineTo(x + 90 * s, y - 160 * s);
  ctx.lineTo(x + 70 * s, y - 96 * s);
  ctx.fill();
  // Neck and head, rearing back before the sneeze.
  const rear = sneeze * 0.35;
  ctx.save();
  ctx.translate(x - 50 * s, y - 90 * s);
  ctx.rotate(-rear);
  ctx.fillRect(-14 * s, -70 * s, 30 * s, 80 * s);
  ellipse(ctx, -24 * s, -82 * s, 40 * s, 24 * s);
  ctx.beginPath();
  ctx.moveTo(-10 * s, -100 * s);
  ctx.lineTo(4 * s, -128 * s);
  ctx.lineTo(10 * s, -98 * s);
  ctx.fill();
  ctx.restore();
  for (const lx of [-50, -20, 30, 54]) ctx.fillRect(x + lx * s, y - 34 * s, 16 * s, 34 * s);
}

export function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, wave: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(wave);
  ctx.fillStyle = INK;
  ellipse(ctx, 0, -40 * s, 46 * s, 56 * s);
  const fingers: Array<[number, number, number]> = [[-34, 70, -0.18], [-13, 92, -0.06], [10, 96, 0.04], [31, 82, 0.15]];
  for (const [fx, len, rot] of fingers) {
    ctx.save();
    ctx.translate(fx * s, -70 * s);
    ctx.rotate(rot);
    ellipse(ctx, 0, -len * 0.5 * s, 10 * s, len * 0.5 * s);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(-42 * s, -30 * s);
  ctx.rotate(-0.9);
  ellipse(ctx, 0, -30 * s, 11 * s, 32 * s);
  ctx.restore();
  ctx.fillRect(-30 * s, 0, 60 * s, 90 * s);
  ctx.restore();
}

export function grass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, GROUND, W, H - GROUND);
  for (let x = 0; x < W; x += 18) {
    const h = 10 + ((x * 37) % 13);
    ctx.beginPath();
    ctx.moveTo(x, GROUND + 1);
    ctx.lineTo(x + 6, GROUND - h);
    ctx.lineTo(x + 12, GROUND + 1);
    ctx.fill();
  }
}
