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
  bird, deer, dragon, ease, ellipse, fox, GROUND, grass, H, hand, INK, lantern, star, W,
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
    line: 'This is the Lantern: a machine that turns light into shadow, and shadow into things that move.',
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
    line: 'For a thousand years its light held the Shadow Dragon inside the paper.',
    seconds: 4.5,
    sound: playPrompt,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t * 1.4) * 0.08, 1);
      ctx.globalAlpha = 0.3 + 0.35 * ease(k * 2);
      dragon(ctx, W / 2 + 120, GROUND, 1.1, 0);
      ctx.globalAlpha = 1;
      grass(ctx);
    },
  },
  {
    line: 'Tonight it broke free, and the Great Lantern shattered into sparks.',
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
    line: 'Light cannot rest on paper. A spark can only stand on shadow.',
    seconds: 5,
    sound: playTinkle,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t) * 0.03, 0.25);
      grass(ctx);
      const hx = W / 2 + 60;
      const hy = H + 60 - ease(k * 2) * 220;
      hand(ctx, hx, hy, 1.4, 0);
      // A spark drifts down and settles on the shadow of the middle fingertip.
      const tipY = hy - 232 - 14;
      const sy = Math.min(-20 + ease(k * 1.4) * 400, tipY);
      ctx.save();
      ctx.shadowColor = 'rgba(255, 214, 130, 0.95)';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff3c4';
      star(ctx, hx + 14, sy, 15, t * 2);
      ctx.restore();
    },
  },
  {
    line: 'Your hands cast the only shadows left. Catch the sparks, rebuild the light, end the dragon.',
    seconds: 5.5,
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
