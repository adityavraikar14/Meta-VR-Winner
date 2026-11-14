/**
 * Shadow-puppet silhouettes drawn with canvas paths, shared by the intro show
 * and the shadow world on the paper. Feet sit at (x, y); sizes scale with s.
 */

export const INK = '#0b1430';
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

// ------------------------------------------------------------------ The villains (shadow puppets)
// Each stands with its feet at (x, y) and is about 210·s pixels tall. No faces: silhouettes only.

/** A long cloak flaring from the shoulders to the ground. */
function cloak(ctx: CanvasRenderingContext2D, s: number, top: number, wide: number, sway: number): void {
  ctx.beginPath();
  ctx.moveTo(-16 * s, -top * s);
  ctx.quadraticCurveTo(-wide * 0.6 * s, -top * 0.5 * s, (-wide + sway) * s, 0);
  ctx.lineTo((wide + sway) * s, 0);
  ctx.quadraticCurveTo(wide * 0.6 * s, -top * 0.5 * s, 16 * s, -top * s);
  ctx.closePath();
  ctx.fill();
}

/** Morwen, the Ink Witch: a crooked pointed hat, a sweeping cloak, a staff dripping ink. */
export function witch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sway = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  cloak(ctx, s, 150, 58, sway * 20);
  ellipse(ctx, 0, -162 * s, 15 * s, 18 * s);
  // Hat: a wide brim and a tall crooked cone.
  ellipse(ctx, 0, -176 * s, 40 * s, 7 * s);
  ctx.beginPath();
  ctx.moveTo(-20 * s, -178 * s);
  ctx.quadraticCurveTo(-4 * s, -230 * s, 26 * s + sway * 8 * s, -248 * s);
  ctx.quadraticCurveTo(6 * s, -222 * s, 20 * s, -178 * s);
  ctx.closePath();
  ctx.fill();
  // Raised arm and the staff, ink dripping from its head.
  ctx.save();
  ctx.translate(30 * s, -130 * s);
  ctx.rotate(-0.5 + sway * 0.2);
  ctx.fillRect(0, -5 * s, 42 * s, 10 * s);
  ctx.restore();
  ctx.fillRect(58 * s, -228 * s, 6 * s, 228 * s);
  ellipse(ctx, 61 * s, -234 * s, 13 * s, 13 * s);
  for (let i = 0; i < 3; i++) ellipse(ctx, (56 + i * 6) * s, (-212 + i * 9 + ((sway * 40 + i * 13) % 12)) * s, 3 * s, 5 * s);
  ctx.restore();
}

/** Captain Rook, the Corsair: a tricorn hat, a long coat, a raised cutlass. */
export function corsair(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, swing = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  // Boots planted wide, then a knee-length frock coat, flared at the hem.
  ctx.beginPath();
  ctx.moveTo(-30 * s, 0);
  ctx.lineTo(-18 * s, -62 * s);
  ctx.lineTo(-6 * s, -62 * s);
  ctx.lineTo(-12 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30 * s, 0);
  ctx.lineTo(18 * s, -62 * s);
  ctx.lineTo(6 * s, -62 * s);
  ctx.lineTo(12 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-22 * s, -140 * s);
  ctx.lineTo(-38 * s, -54 * s);
  ctx.lineTo(38 * s, -54 * s);
  ctx.lineTo(22 * s, -140 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-26 * s, -100 * s, 52 * s, 8 * s);
  ellipse(ctx, 0, -152 * s, 15 * s, 17 * s);
  // Tricorn: three upturned points.
  ctx.beginPath();
  ctx.moveTo(-38 * s, -170 * s);
  ctx.lineTo(0, -192 * s);
  ctx.lineTo(38 * s, -170 * s);
  ctx.lineTo(0, -160 * s);
  ctx.closePath();
  ctx.fill();
  // The cutlass arm.
  ctx.save();
  ctx.translate(26 * s, -122 * s);
  ctx.rotate(-1.1 + swing);
  ctx.fillRect(0, -5 * s, 40 * s, 10 * s);
  ctx.translate(40 * s, 0);
  ctx.beginPath();
  ctx.moveTo(0, -4 * s);
  ctx.quadraticCurveTo(40 * s, -14 * s, 74 * s, 4 * s);
  ctx.lineTo(0, 5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** Thorne, the Ember Mage: a long robe and hood, a long beard, a tall staff crowned with fire (lit 0–1). */
export function mage(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, lit = 1, t = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  // A heavy robe to the ground, wider at the hem, with hanging sleeves.
  ctx.beginPath();
  ctx.moveTo(-40 * s, 0);
  ctx.lineTo(-24 * s, -138 * s);
  ctx.lineTo(24 * s, -138 * s);
  ctx.lineTo(40 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-22 * s, -132 * s);
  ctx.lineTo(-48 * s, -84 * s);
  ctx.lineTo(-30 * s, -78 * s);
  ctx.lineTo(-14 * s, -110 * s);
  ctx.closePath();
  ctx.fill();
  // Hooded head and a long, pointed beard.
  ellipse(ctx, 0, -152 * s, 15 * s, 17 * s);
  ctx.beginPath();
  ctx.moveTo(-20 * s, -146 * s);
  ctx.quadraticCurveTo(-18 * s, -182 * s, 6 * s, -196 * s);
  ctx.quadraticCurveTo(22 * s, -176 * s, 20 * s, -146 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10 * s, -142 * s);
  ctx.lineTo(0, -98 * s);
  ctx.lineTo(10 * s, -142 * s);
  ctx.closePath();
  ctx.fill();
  // The staff, held out to one side.
  ctx.fillRect(34 * s, -186 * s, 7 * s, 186 * s);
  ctx.beginPath();
  ctx.moveTo(22 * s, -126 * s);
  ctx.lineTo(38 * s, -124 * s);
  ctx.lineTo(38 * s, -112 * s);
  ctx.lineTo(18 * s, -114 * s);
  ctx.closePath();
  ctx.fill();
  // Its crown of fire.
  if (lit > 0) {
    ctx.save();
    ctx.globalAlpha *= lit;
    glow(ctx, 37 * s, -198 * s, 34 * s, 0.9);
    ctx.fillStyle = '#ff7a2a';
    ctx.beginPath();
    const f = Math.sin(t * 9) * 3 * s;
    ctx.moveTo(27 * s, -188 * s);
    ctx.quadraticCurveTo(26 * s + f, -208 * s, 37 * s, -226 * s - f);
    ctx.quadraticCurveTo(48 * s - f, -208 * s, 47 * s, -188 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Sable, the Hooded Blade: a deep pointed hood, a cloak caught by the wind, a slim sword drawn up as `draw` goes 0 to 1. */
export function hooded(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, draw = 1, t = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  // Legs in a fencer's stance.
  ctx.beginPath();
  ctx.moveTo(-28 * s, 0);
  ctx.lineTo(-10 * s, -72 * s);
  ctx.lineTo(2 * s, -72 * s);
  ctx.lineTo(-14 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(26 * s, 0);
  ctx.lineTo(4 * s, -72 * s);
  ctx.lineTo(16 * s, -72 * s);
  ctx.lineTo(38 * s, 0);
  ctx.closePath();
  ctx.fill();
  // Body, and a cloak streaming out behind.
  ctx.beginPath();
  ctx.moveTo(-18 * s, -70 * s);
  ctx.lineTo(-16 * s, -136 * s);
  ctx.lineTo(18 * s, -136 * s);
  ctx.lineTo(20 * s, -70 * s);
  ctx.closePath();
  ctx.fill();
  const wave = Math.sin(t * 2.4) * 8 * s;
  ctx.beginPath();
  ctx.moveTo(-14 * s, -138 * s);
  ctx.quadraticCurveTo(-60 * s, -110 * s + wave, -76 * s, -46 * s - wave);
  ctx.lineTo(-48 * s, -56 * s);
  ctx.quadraticCurveTo(-36 * s, -96 * s, -6 * s, -120 * s);
  ctx.closePath();
  ctx.fill();
  // The hood: a deep point that hides the face.
  ctx.beginPath();
  ctx.moveTo(-17 * s, -138 * s);
  ctx.quadraticCurveTo(-22 * s, -168 * s, -8 * s, -186 * s);
  ctx.lineTo(-24 * s, -196 * s);
  ctx.quadraticCurveTo(8 * s, -190 * s, 18 * s, -160 * s);
  ctx.lineTo(17 * s, -138 * s);
  ctx.closePath();
  ctx.fill();
  // The sword arm and a slim straight blade.
  ctx.save();
  ctx.translate(14 * s, -122 * s);
  ctx.rotate(0.9 - draw * 1.8);
  ctx.fillRect(0, -5 * s, 34 * s, 10 * s);
  ctx.fillRect(32 * s, -11 * s, 5 * s, 22 * s);
  ctx.beginPath();
  ctx.moveTo(37 * s, -3 * s);
  ctx.lineTo(132 * s, -1 * s);
  ctx.lineTo(140 * s, 0);
  ctx.lineTo(132 * s, 1 * s);
  ctx.lineTo(37 * s, 3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** An old history book, open, its pages lifting. */
export function book(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, open: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  ctx.fillRect(-110 * s, -14 * s, 220 * s, 14 * s);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -14 * s);
    ctx.quadraticCurveTo(side * 50 * s, (-30 - open * 18) * s, side * 106 * s, (-20 - open * 10) * s);
    ctx.lineTo(side * 106 * s, -10 * s);
    ctx.lineTo(0, -6 * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A slingshot: a forked branch, its band pulled back by `pull` (0..1). */
export function slingshot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, pull: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 16 * s;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -70 * s);
  ctx.lineTo(-34 * s, -130 * s);
  ctx.moveTo(0, -70 * s);
  ctx.lineTo(34 * s, -130 * s);
  ctx.stroke();
  ctx.lineWidth = 4 * s;
  const px = -pull * 60 * s;
  const py = -112 * s + pull * 40 * s;
  ctx.beginPath();
  ctx.moveTo(-34 * s, -130 * s);
  ctx.lineTo(px, py);
  ctx.lineTo(34 * s, -130 * s);
  ctx.stroke();
  ellipse(ctx, px, py, 10 * s, 10 * s);
  ctx.restore();
}

/** A sword, point up, as a shadow. */
export function sword(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = INK;
  ctx.fillRect(-5 * s, 0, 10 * s, 40 * s);
  ctx.fillRect(-26 * s, -6 * s, 52 * s, 10 * s);
  ctx.beginPath();
  ctx.moveTo(-8 * s, -6 * s);
  ctx.lineTo(0, -170 * s);
  ctx.lineTo(8 * s, -6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Ink spreading over the ground from the left; `k` is how far (0..1), with waves on its edge. */
export function inkFlood(ctx: CanvasRenderingContext2D, k: number, t: number): void {
  ctx.fillStyle = INK;
  const edge = k * (W + 120);
  ctx.beginPath();
  ctx.moveTo(0, GROUND - 6);
  for (let x = 0; x <= edge; x += 16) ctx.lineTo(x, GROUND - 14 - Math.sin(x * 0.03 + t * 3) * 8 - 30 * Math.max(0, 1 - (edge - x) / 140));
  ctx.lineTo(edge, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
}

/** Rings of a trance turning around a point (the bewitched dragon). */
export function trance(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha: number): void {
  ctx.save();
  ctx.strokeStyle = `rgba(122, 76, 220, ${alpha})`;
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const rr = ((r * (i + 1)) / 4 + t * 30) % r;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
