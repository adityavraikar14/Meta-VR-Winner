import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { playAwaken, playPrompt, playRoar, playTinkle } from './audio.js';
import {
  book, corsair, dragon, ease, ellipse, GROUND, grass, H, hand, INK, inkFlood, lantern, musketeer, ronin, slingshot, star, sword, trance, W, witch,
} from './puppets.js';
import { lineSeconds, narrate, stopNarration } from './narrator.js';

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

export const SCENES: Scene[] = [
  {
    line: 'Long ago, the Great Lantern burned at the top of the world, and the Shadow Dragon guarded its light.',
    seconds: 7,
    sound: playTinkle,
    draw(ctx, t, k) {
      ctx.fillStyle = INK;
      SKY.forEach((s, i) => {
        ctx.globalAlpha = ease(k * 3 - i * 0.1) * (0.7 + 0.3 * Math.sin(t * 3 + i));
        star(ctx, s.x, s.y, s.r, 0);
      });
      ctx.globalAlpha = 1;
      lantern(ctx, W / 2 - 140, 80 + (1 - ease(k * 2)) * -160, 1.1, Math.sin(t * 1.4) * 0.08, ease(k * 2));
      ctx.globalAlpha = ease(k * 2 - 0.4);
      dragon(ctx, W / 2 + 170, GROUND, 1.1, 0);
      ctx.globalAlpha = 1;
      grass(ctx);
    },
  },
  {
    line: 'Then came Morwen, the Ink Witch. Out of the oldest history books she pulled three warlords, written in ink: Captain Rook the Corsair, Sergeant Vance the Musketeer, and Kai, the Ronin.',
    seconds: 12,
    sound: playPrompt,
    draw(ctx, t, k) {
      grass(ctx);
      witch(ctx, 170, GROUND, 1.25, Math.sin(t * 1.5) * 0.4);
      book(ctx, 600, GROUND - 8, 1.5, 0.5 + 0.5 * Math.sin(t * 2));
      // The three rise out of the book one after another.
      const rise = (i: number) => ease((k - 0.25 - i * 0.18) * 4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, GROUND - 14);
      ctx.clip();
      corsair(ctx, 470, GROUND - 14 + (1 - rise(0)) * 230, 1.05, Math.sin(t * 2) * 0.2);
      musketeer(ctx, 610, GROUND - 14 + (1 - rise(1)) * 230, 1.05, 0);
      ronin(ctx, 760, GROUND - 14 + (1 - rise(2)) * 230, 1.05, rise(2));
      ctx.restore();
    },
  },
  {
    line: 'Together they captured the dragon, and Morwen bewitched it with her ink. Now it obeys only her.',
    seconds: 8,
    sound: () => playRoar(0.1),
    draw(ctx, t, k) {
      grass(ctx);
      dragon(ctx, W / 2 + 60, GROUND, 1.2, 0);
      trance(ctx, W / 2 + 60, GROUND - 120, 190, t, 0.35 + 0.4 * ease(k * 2));
      witch(ctx, 150, GROUND, 1.1, Math.sin(t * 3) * 0.6);
      corsair(ctx, 860, GROUND, 0.9, 0);
      ronin(ctx, 960, GROUND, 0.9, 1);
    },
  },
  {
    line: 'Then she spilled her ink across the land. Whatever ink touches, she owns: every road, every door, every wall.',
    seconds: 9,
    sound: playPrompt,
    draw(ctx, t, k) {
      lantern(ctx, W - 160, 80, 0.8, Math.sin(t) * 0.05, 1 - ease(k * 1.4));
      grass(ctx);
      inkFlood(ctx, ease(k * 1.3), t);
      ctx.fillStyle = `rgba(11, 20, 48, ${0.5 * ease(k * 1.5 - 0.3)})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
  {
    line: 'But ink cannot stain a shadow. A shadow is only where light is not, so the witch can never hold it.',
    seconds: 8,
    sound: playTinkle,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 220, 80, 0.8, Math.sin(t * 1.4) * 0.05, 0.6);
      grass(ctx);
      inkFlood(ctx, 1, t);
      // A hand rises and its shadow parts the ink.
      hand(ctx, W / 2 + 60, H + 60 - ease(k * 2) * 230, 1.4, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ellipse(ctx, W / 2 + 60, GROUND + 20, ease(k * 2 - 0.4) * 180, 40);
      ctx.restore();
    },
  },
  {
    line: 'The last sparks of the Lantern have found you. In their light your shadows become real: a bridge, a ramp, a slingshot, a sword.',
    seconds: 10,
    sound: playAwaken,
    draw(ctx, t, k) {
      grass(ctx);
      const step = Math.min(3, Math.floor(k * 4));
      const pop = ease((k * 4 - step) * 3);
      ctx.save();
      ctx.shadowColor = 'rgba(255, 214, 130, 0.95)';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff3c4';
      star(ctx, 160 + k * 700, 120 + Math.sin(t * 3) * 20, 14, t * 2);
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.globalAlpha = pop;
      if (step === 0) ctx.fillRect(W / 2 - 200, GROUND - 120, 400, 26);
      if (step === 1) {
        ctx.beginPath();
        ctx.moveTo(W / 2 - 220, GROUND);
        ctx.lineTo(W / 2 + 220, GROUND - 160);
        ctx.lineTo(W / 2 + 220, GROUND);
        ctx.fill();
      }
      if (step === 2) slingshot(ctx, W / 2, GROUND, 1.6, 0.5 + 0.5 * Math.sin(t * 4));
      if (step === 3) sword(ctx, W / 2, GROUND - 30, 1.7, Math.sin(t * 3) * 0.3);
      ctx.globalAlpha = 1;
    },
  },
  {
    line: 'Every step of your escape wins back a piece of the Great Lantern. Beat her three captains for its three heart shards, relight it to break the dragon’s trance, and face the Ink Witch herself.',
    seconds: 9,
    sound: () => playRoar(0.06),
    draw(ctx, t, k) {
      grass(ctx);
      const show = (i: number) => ease((k - i * 0.2) * 4);
      ctx.globalAlpha = show(0);
      corsair(ctx, 130, GROUND, 0.85, Math.sin(t * 2) * 0.3);
      ctx.globalAlpha = show(1);
      musketeer(ctx, 300, GROUND, 0.85, 0.5 + 0.5 * Math.sin(t));
      ctx.globalAlpha = show(2);
      ronin(ctx, 470, GROUND, 0.85, 1);
      ctx.globalAlpha = show(3);
      dragon(ctx, 700, GROUND, 0.8, 0);
      trance(ctx, 700, GROUND - 80, 120, t, 0.4);
      ctx.globalAlpha = show(4);
      witch(ctx, 930, GROUND, 1, Math.sin(t * 2) * 0.5);
      ctx.globalAlpha = 1;
    },
  },
  {
    line: 'You can stop whenever you like: push the Home button beside the screen. Now, raise your hand into the light.',
    seconds: 8,
    sound: playAwaken,
    draw(ctx, t, k) {
      lantern(ctx, W / 2 - 60, 80, 0.8, Math.sin(t * 1.4) * 0.08, ease(k * 3));
      grass(ctx);
      hand(ctx, W / 2 + 40, H + 60 - ease(k * 2) * 220, 1.4, Math.sin(t * 5) * 0.18 * ease(k * 2 - 1));
    },
  },
];

// Each scene lasts at least as long as its line takes to say.
for (const scene of SCENES) scene.seconds = Math.max(scene.seconds, lineSeconds(scene.line) + 1);

/**
 * The opening shadow-puppet show, told by a narrator and shown in the
 * caption bar: the Lantern and its dragon; Morwen the Ink Witch and the three
 * warlords she pulled out of history books; the dragon bewitched; the land
 * drowned in ink; why a shadow is the one thing ink cannot hold; shadows made
 * real; the road ahead; and how to stop (the Home button).
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
    if (this.playing) stopNarration();
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
    narrate(`intro-${this.scene + 1}`, SCENES[this.scene].line);
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
