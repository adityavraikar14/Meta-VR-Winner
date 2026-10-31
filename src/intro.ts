import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { playAwaken, playChirp, playPrompt, playRawr, playTinkle } from './audio.js';

const W = 1024;
const H = 512;
const GROUND = 440;
const INK = '#160c06';
/** Redraws per second; the show is soft and slow, so this is plenty. */
const FPS = 30;

interface Scene {
  line: string;
  seconds: number;
  /** Plays when the scene starts. */
  sound?: () => void;
  draw(ctx: CanvasRenderingContext2D, t: number, k: number): void;
}

/** 0..1 eased in and out. */
function ease(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = spin + (i * Math.PI) / 5 - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255, 214, 130, ${0.85 * alpha})`);
  g.addColorStop(0.4, `rgba(255, 170, 70, ${0.35 * alpha})`);
  g.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, swing: number, lit: number): void {
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

function rabbit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ear = 0): void {
  ctx.fillStyle = INK;
  ellipse(ctx, x, y - 34 * s, 44 * s, 32 * s);
  ellipse(ctx, x + 38 * s, y - 66 * s, 22 * s, 20 * s);
  ellipse(ctx, x + 30 * s, y - 108 * s, 7 * s, 30 * s, -0.25 + ear);
  ellipse(ctx, x + 46 * s, y - 106 * s, 7 * s, 28 * s, 0.15 + ear);
  ellipse(ctx, x - 44 * s, y - 40 * s, 11 * s, 11 * s);
  ellipse(ctx, x + 22 * s, y - 6 * s, 16 * s, 7 * s);
  ellipse(ctx, x - 20 * s, y - 6 * s, 18 * s, 8 * s);
}

function bird(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number): void {
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

function deer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
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

function dragon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sneeze: number): void {
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

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, wave: number): void {
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

function grass(ctx: CanvasRenderingContext2D): void {
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

/** Fixed sky stars so every scene shares the same night. */
const SKY = Array.from({ length: 14 }, (_, i) => ({
  x: 80 + ((i * 263) % 880),
  y: 40 + ((i * 97) % 150),
  r: 11 + (i % 3) * 4,
}));

const SCENES: Scene[] = [
  {
    line: 'Once upon a time, a little lantern lit the storybook sky…',
    seconds: 5,
    sound: playTinkle,
    draw(ctx, t, k) {
      ctx.fillStyle = INK;
      SKY.forEach((s, i) => {
        ctx.globalAlpha = ease(k * 3 - i * 0.1) * (0.7 + 0.3 * Math.sin(t * 3 + i));
        star(ctx, s.x, s.y, s.r, 0);
      });
      ctx.globalAlpha = 1;
      lantern(ctx, W / 2, 120 + (1 - ease(k * 2)) * -160, 1.2, Math.sin(t * 1.4) * 0.08, ease(k * 2));
      grass(ctx);
    },
  },
  {
    line: 'In its warm light, shadows came alive as friends.',
    seconds: 5,
    sound: playChirp,
    draw(ctx, t, k) {
      lantern(ctx, W / 2, 80, 0.8, Math.sin(t * 1.4) * 0.08, 1);
      const hop = Math.abs(Math.sin(t * 4));
      rabbit(ctx, -80 + k * 560, GROUND - hop * 60, 0.9, hop * 0.2);
      bird(ctx, W + 60 - k * 700, 200 + Math.sin(t * 2) * 20, 1.1, t * 14);
      deer(ctx, 770, GROUND, 0.9);
      grass(ctx);
    },
  },
  {
    line: 'Then a sleepy dragon sneezed… AH-CHOO! The stars tumbled down!',
    seconds: 5.5,
    sound: playRawr,
    draw(ctx, t, k) {
      const blown = ease((k - 0.55) * 4);
      const swing = Math.sin(t * 1.4) * 0.08 + blown * Math.sin(t * 20) * 0.25 * (1 - blown);
      lantern(ctx, W / 2 - 60, 80, 0.8, swing, 1 - blown);
      ctx.fillStyle = INK;
      SKY.forEach((s, i) => {
        const fall = blown * (GROUND - s.y + 10) * Math.min(1, blown * (1 + (i % 4) * 0.3));
        star(ctx, s.x, s.y + fall, s.r, blown * (i + 1));
      });
      const enter = ease(k * 2.5);
      dragon(ctx, W + 140 - enter * 380, GROUND, 1, ease((k - 0.3) * 4) * (1 - blown));
      if (blown > 0 && blown < 1) {
        ctx.fillStyle = `rgba(255, 240, 220, ${0.6 * (1 - blown)})`;
        for (let i = 0; i < 6; i++) ellipse(ctx, 640 - blown * 220 - i * 30, 230 + Math.sin(i * 2) * 30, 30 + i * 8, 18 + i * 4);
      }
      grass(ctx);
    },
  },
  {
    line: 'Everything went dark, and the friends fell asleep in the paper.',
    seconds: 5,
    sound: playPrompt,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t) * 0.03, 0);
      ctx.globalAlpha = 1 - ease(k * 1.4) * 0.75;
      rabbit(ctx, 300, GROUND, 0.9, 0.5);
      deer(ctx, 640, GROUND, 0.9);
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.font = 'italic 700 40px Georgia, serif';
      for (let i = 0; i < 3; i++) {
        const z = (t * 0.6 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(z * Math.PI);
        ctx.fillText('z', 360 + z * 60 + i * 6, 300 - z * 120);
      }
      ctx.globalAlpha = 1;
      grass(ctx);
      ctx.fillStyle = `rgba(22, 12, 6, ${0.55 * ease(k * 2)})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
  {
    line: 'Only your hands can wake them. Will you help?',
    seconds: 5,
    sound: playAwaken,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t * 1.4) * 0.08, ease(k * 3));
      grass(ctx);
      hand(ctx, W / 2 + 40, H + 60 - ease(k * 2) * 220, 1.4, Math.sin(t * 5) * 0.18 * ease(k * 2 - 1));
      ctx.fillStyle = `rgba(22, 12, 6, ${0.55 * (1 - ease(k * 3))})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
];

/**
 * The opening shadow-puppet show: five short scenes drawn on the paper,
 * narrated in the caption bar, before the first chapter.
 */
export class IntroShow {
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private mesh: Mesh;
  private material: MeshBasicMaterial;
  private scene = -1;
  private sceneTime = 0;
  private time = 0;
  private sinceDraw = 1;
  private playing = false;

  constructor(parent: Object3D) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(0.92, 0.46), this.material);
    this.mesh.name = 'IntroShow';
    this.mesh.position.set(0, 0.06, 0.004);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  start(): void {
    this.playing = true;
    this.scene = -1;
    this.time = 0;
    this.next();
  }

  stop(): void {
    this.playing = false;
  }

  /** Advances the show; returns the narration line, or null once it has ended. */
  update(dt: number): string | null {
    const target = this.playing ? 1 : 0;
    this.material.opacity += (target - this.material.opacity) * Math.min(1, dt * 4);
    this.mesh.visible = this.material.opacity > 0.01;
    if (!this.playing) return null;
    this.time += dt;
    this.sceneTime += dt;
    const scene = SCENES[this.scene];
    if (this.sceneTime >= scene.seconds) {
      if (this.scene === SCENES.length - 1) {
        this.playing = false;
        return null;
      }
      this.next();
    }
    this.sinceDraw += dt;
    if (this.sinceDraw >= 1 / FPS) {
      this.sinceDraw = 0;
      this.draw();
    }
    return SCENES[this.scene].line;
  }

  private next(): void {
    this.scene++;
    this.sceneTime = 0;
    SCENES[this.scene].sound?.();
    this.draw();
  }

  private draw(): void {
    const scene = SCENES[this.scene];
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    // Each scene fades in and out like a turning page.
    const k = this.sceneTime / scene.seconds;
    ctx.save();
    ctx.globalAlpha = 1;
    scene.draw(ctx, this.time, k);
    ctx.restore();
    const edge = Math.min(1, this.sceneTime / 0.4, (scene.seconds - this.sceneTime) / 0.4);
    if (edge < 1) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - Math.max(0, edge)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.texture.needsUpdate = true;
  }
}
