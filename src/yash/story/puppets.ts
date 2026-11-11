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

/** A fox at a trot, facing right: pointed ears and snout, a long brush of a tail. */
export function fox(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, stride = 0): void {
  ctx.fillStyle = INK;
  // Body, slung low.
  ellipse(ctx, x, y - 40 * s, 40 * s, 14 * s, -0.04);
  // The brush: thick, curving down and out behind.
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, y - 48 * s);
  ctx.bezierCurveTo(x - 70 * s, y - 56 * s, x - 100 * s, y - 40 * s, x - 112 * s, y - 22 * s);
  ctx.bezierCurveTo(x - 90 * s, y - 26 * s, x - 62 * s, y - 28 * s, x - 34 * s, y - 34 * s);
  ctx.fill();
  // Neck and head with a long snout.
  ctx.beginPath();
  ctx.moveTo(x + 26 * s, y - 50 * s);
  ctx.lineTo(x + 46 * s, y - 70 * s);
  ctx.lineTo(x + 60 * s, y - 70 * s);
  ctx.lineTo(x + 88 * s, y - 58 * s);
  ctx.lineTo(x + 60 * s, y - 52 * s);
  ctx.lineTo(x + 36 * s, y - 34 * s);
  ctx.closePath();
  ctx.fill();
  // Ears.
  for (const [bx, tip] of [[46, 50], [56, 61]]) {
    ctx.beginPath();
    ctx.moveTo(x + bx * s, y - 68 * s);
    ctx.lineTo(x + tip * s, y - 92 * s);
    ctx.lineTo(x + (bx + 10) * s, y - 68 * s);
    ctx.fill();
  }
  // Slender legs, swinging.
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  for (const [lx, phase] of [[-26, 0], [-18, Math.PI], [24, Math.PI], [32, 0]]) {
    const swing = Math.sin(stride + phase) * 10 * s;
    ctx.beginPath();
    ctx.moveTo(x + lx * s, y - 36 * s);
    ctx.lineTo(x + lx * s + swing, y - 2 * s);
    ctx.stroke();
  }
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

/**
 * Morwen the Ink Witch, facing right: a long coat, a pointed hat, and a wand
 * arm that lifts as `raise` goes 0 → 1 (its tip then sits at x + 46s, y − 190s).
 */
export function witch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, raise: number): void {
  ctx.fillStyle = INK;
  // Coat, flaring to the hem.
  ctx.beginPath();
  ctx.moveTo(x - 16 * s, y - 132 * s);
  ctx.lineTo(x + 16 * s, y - 132 * s);
  ctx.lineTo(x + 46 * s, y);
  ctx.lineTo(x - 50 * s, y);
  ctx.fill();
  // Head, with a hooked nose.
  ellipse(ctx, x + 2 * s, y - 148 * s, 15 * s, 17 * s);
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y - 154 * s);
  ctx.lineTo(x + 30 * s, y - 144 * s);
  ctx.lineTo(x + 14 * s, y - 142 * s);
  ctx.fill();
  // Hat: a wide brim and a crooked cone.
  ellipse(ctx, x + 2 * s, y - 162 * s, 36 * s, 6 * s);
  ctx.beginPath();
  ctx.moveTo(x - 17 * s, y - 163 * s);
  ctx.quadraticCurveTo(x - 6 * s, y - 214 * s, x - 26 * s, y - 236 * s);
  ctx.quadraticCurveTo(x + 10 * s, y - 214 * s, x + 20 * s, y - 163 * s);
  ctx.fill();
  // Arm and wand: hanging down, lifting to point the spell.
  const sx = x + 10 * s;
  const sy = y - 124 * s;
  const len = Math.hypot(36, 66);
  const ax = 0.35 + (36 / len - 0.35) * raise;
  const ay = 1 + (-66 / len - 1) * raise;
  const dx = ax * 40 * s;
  const dy = ay * 40 * s;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 11 * s;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + dx, sy + dy);
  ctx.stroke();
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(sx + dx, sy + dy);
  ctx.lineTo(sx + dx * 1.9, sy + dy * 1.9);
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
