import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { playAwaken, playChirp, playPrompt, playRoar, playTinkle } from './audio.js';
import {
  bird, deer, dragon, ease, ellipse, fox, GROUND, grass, H, hand, INK, lantern, star, W, witch,
} from './puppets.js';

/** Redraws per second; the show is soft and slow, so this is plenty. */
const FPS = 30;

interface Scene {
  line: string;
  seconds: number;
  /** Plays when the scene starts. */
  sound?: () => void;
  draw(ctx: CanvasRenderingContext2D, t: number, k: number): void;
}

/** Fixed sky stars so every scene shares the same night. */
const SKY = Array.from({ length: 14 }, (_, i) => ({
  x: 80 + ((i * 263) % 880),
  y: 40 + ((i * 97) % 150),
  r: 11 + (i % 3) * 4,
}));

const SCENES: Scene[] = [
  {
    line: 'You wake inside an old shadow theatre. One lantern burns; beyond it, only dark.',
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
    line: 'In its light, shadows wake and walk: a fox, a stag, a bird on the wing.',
    seconds: 5,
    sound: playChirp,
    draw(ctx, t, k) {
      lantern(ctx, W / 2, 80, 0.8, Math.sin(t * 1.4) * 0.08, 1);
      fox(ctx, -80 + k * 560, GROUND, 0.9, t * 9);
      bird(ctx, W + 60 - k * 700, 200 + Math.sin(t * 2) * 20, 1.1, t * 14);
      deer(ctx, 770, GROUND, 0.9);
      grass(ctx);
    },
  },
  {
    line: 'Then the Shadow Dragon came. One breath, and the Great Lantern\u2019s light was scattered.',
    seconds: 5.5,
    sound: () => playRoar(0.1),
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
    line: 'The dark closed in. The shadows sank into the paper, and the way out was sealed.',
    seconds: 5,
    sound: playPrompt,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t) * 0.03, 0);
      ctx.globalAlpha = 1 - ease(k * 1.4) * 0.75;
      fox(ctx, 300, GROUND, 0.9, 0);
      deer(ctx, 640, GROUND, 0.9);
      ctx.globalAlpha = 1;
      grass(ctx);
      ctx.fillStyle = `rgba(22, 12, 6, ${0.55 * ease(k * 2)})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
  {
    line: 'Only your hands can wake them, and light the way out.',
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

/** The guardian's eye, burning red under Morwen's spell (`k` 0 → 1), on `dragon(ctx, x, y, s, sneeze)`. */
function spellEye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, sneeze: number, k: number): void {
  if (k <= 0) return;
  // The eye sits on the head, which rears back about the neck's base as the dragon draws breath.
  const a = -sneeze * 0.35;
  const ex = x - 50 * s + (-32 * s) * Math.cos(a) - (-86 * s) * Math.sin(a);
  const ey = y - 90 * s + (-32 * s) * Math.sin(a) + (-86 * s) * Math.cos(a);
  ctx.save();
  ctx.globalAlpha = k;
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 22 * s);
  g.addColorStop(0, 'rgba(255, 60, 30, 1)');
  g.addColorStop(0.35, 'rgba(230, 20, 10, 0.75)');
  g.addColorStop(1, 'rgba(200, 0, 0, 0)');
  ctx.fillStyle = g;
  ellipse(ctx, ex, ey, 22 * s, 22 * s);
  ctx.restore();
}

/** Sparks of her spell, drifting from the witch's raised hand to the dragon. */
function spellTrail(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], t: number, k: number): void {
  if (k <= 0) return;
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const f = (i / 18 + t * 0.35) % 1;
    if (f > k) continue;
    const x = from[0] + (to[0] - from[0]) * f;
    const y = from[1] + (to[1] - from[1]) * f - Math.sin(f * Math.PI) * 70 + Math.sin(t * 6 + i) * 8;
    ctx.globalAlpha = 0.8 * (1 - f * 0.5);
    ctx.fillStyle = i % 3 === 0 ? '#c060ff' : '#6a20a8';
    star(ctx, x, y, 7 + (i % 3) * 3, t * 3 + i);
  }
  ctx.restore();
}

/**
 * The Judge's Demo's prologue: the guardian dragon, Morwen's spell on it,
 * and the light scattered. About 25 seconds.
 */
export const DEMO_SCENES: Scene[] = [
  SCENES[0],
  {
    line: 'Its shadows lived in peace, watched over by the Shadow Dragon, their guardian.',
    seconds: 5,
    sound: playChirp,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 120, 80, 0.8, Math.sin(t * 1.4) * 0.08, 1);
      fox(ctx, -60 + k * 380, GROUND, 0.8, t * 9);
      bird(ctx, 120 + k * 260, 210 + Math.sin(t * 2) * 16, 0.9, t * 14);
      dragon(ctx, 760, GROUND, 0.95, 0);
      grass(ctx);
    },
  },
  {
    line: 'Then Morwen the Ink Witch came, and cast her spell on the guardian.',
    seconds: 5.5,
    sound: playPrompt,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 120, 80, 0.8, Math.sin(t * 1.4) * 0.08, 1);
      const raise = ease((k - 0.25) * 3);
      witch(ctx, -80 + ease(k * 2.5) * 300, GROUND, 1, raise);
      dragon(ctx, 760, GROUND, 0.95, 0);
      spellTrail(ctx, [-80 + ease(k * 2.5) * 300 + 46, GROUND - 190], [760 - 82 * 0.95, GROUND - 176 * 0.95], t, ease((k - 0.35) * 2.5));
      spellEye(ctx, 760, GROUND, 0.95, 0, ease((k - 0.7) * 4));
      grass(ctx);
    },
  },
  {
    line: 'Bewitched, it scattered the Great Lantern’s light, and the shadows sank into the paper.',
    seconds: 5.5,
    sound: () => playRoar(0.1),
    draw(ctx, t, k) {
      const blown = ease((k - 0.35) * 4);
      const swing = Math.sin(t * 1.4) * 0.08 + blown * Math.sin(t * 20) * 0.25 * (1 - blown);
      lantern(ctx, W / 2 - 120, 80, 0.8, swing, 1 - blown);
      ctx.fillStyle = INK;
      SKY.forEach((s, i) => {
        const fall = blown * (GROUND - s.y + 10) * Math.min(1, blown * (1 + (i % 4) * 0.3));
        star(ctx, s.x, s.y + fall, s.r, blown * (i + 1));
      });
      const sneeze = ease((k - 0.1) * 4) * (1 - blown);
      dragon(ctx, 760, GROUND, 0.95, sneeze);
      spellEye(ctx, 760, GROUND, 0.95, sneeze, 1);
      if (blown > 0 && blown < 1) {
        ctx.fillStyle = `rgba(255, 240, 220, ${0.6 * (1 - blown)})`;
        for (let i = 0; i < 6; i++) ellipse(ctx, 640 - blown * 220 - i * 30, 230 + Math.sin(i * 2) * 30, 30 + i * 8, 18 + i * 4);
      }
      grass(ctx);
      ctx.fillStyle = `rgba(22, 12, 6, ${0.4 * ease((k - 0.6) * 3)})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
  {
    line: 'Only your hands can free the guardian, and stop her.',
    seconds: 5,
    sound: playAwaken,
    draw: SCENES[4].draw,
  },
];

/**
 * The opening shadow-puppet show: five short scenes drawn on the paper,
 * narrated in the caption bar, before the first chapter.
 */
export class IntroShow {
  private scenes = SCENES;
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

  /** Plays a show: the story's own prologue, or another (the Judge's Demo's). */
  start(scenes: Scene[] = SCENES): void {
    this.scenes = scenes;
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
    const scene = this.scenes[this.scene];
    if (this.sceneTime >= scene.seconds) {
      if (this.scene === this.scenes.length - 1) {
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
    return this.scenes[this.scene].line;
  }

  private next(): void {
    this.scene++;
    this.sceneTime = 0;
    this.scenes[this.scene].sound?.();
    this.draw();
  }

  private draw(): void {
    const scene = this.scenes[this.scene];
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
