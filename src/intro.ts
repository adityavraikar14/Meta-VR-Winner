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
  book, corsair, dragon, ease, ellipse, glow, GROUND, grass, H, hand, hooded, INK, inkFlood, lantern, mage, slingshot, star, sword, trance, W, witch,
} from './puppets.js';
import { lineSeconds, narrate, stopNarration } from './narrator.js';
import { FONT, lines } from './ui-theme.js';

/** Redraws per second; the show is soft and slow, so this is plenty. */
const FPS = 30;

/** The picture is drawn at twice its layout size, so the subtitles stay sharp. */
const SCALE = 2;

/** The film's size in the room: wide, like a cinema screen over the stage. */
const SCREEN_WIDTH = 1.56;
const SCREEN_HEIGHT = SCREEN_WIDTH / 2;

/** The subtitle band along the bottom of the picture. */
const BAND = 104;

/** Each scene's backlight: the colour of the paper lit from behind. */
type Tint = [string, string];
const GOLD: Tint = ['#fff1c8', '#e0a050'];
const VIOLET: Tint = ['#f1dcff', '#8a5ab8'];
const TEAL: Tint = ['#d8f4f0', '#4a8a96'];
const DUSK: Tint = ['#ffe0c0', '#c0604a'];
const DAWN: Tint = ['#fff6d8', '#f0a040'];

interface Scene {
  line: string;
  seconds: number;
  tint: Tint;
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

/** The road of the escape, left to right, for the map scene. */
const ROAD: Array<[number, number]> = [
  [110, 360],
  [290, 300],
  [470, 340],
  [650, 260],
  [880, 300],
];

export const SCENES: Scene[] = [
  {
    line: 'Come closer, and I will tell you how the light went out.',
    seconds: 6,
    tint: GOLD,
    sound: playTinkle,
    draw(ctx, t, k) {
      lantern(ctx, W / 2, 40, 1.15, Math.sin(t * 1.2) * 0.06, 0.4 + 0.6 * ease(k * 2));
      ctx.save();
      ctx.globalAlpha = ease(k * 2.5 - 0.2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 92px ${FONT}`;
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(255, 210, 120, 0.55)';
      ctx.strokeText('SHADOWPLAY', W / 2, 300);
      ctx.fillStyle = INK;
      ctx.fillText('SHADOWPLAY', W / 2, 300);
      ctx.font = `700 34px ${FONT}`;
      ctx.fillStyle = '#5a3412';
      ctx.fillText('Escape the Lantern', W / 2, 366);
      ctx.restore();
      grass(ctx);
    },
  },
  {
    line: 'Long ago, the Great Lantern burned at the top of the world, and the Shadow Dragon guarded its light.',
    seconds: 7,
    tint: GOLD,
    sound: playTinkle,
    draw(ctx, t, k) {
      ctx.fillStyle = INK;
      SKY.forEach((s, i) => {
        ctx.globalAlpha = ease(k * 3 - i * 0.1) * (0.5 + 0.3 * Math.sin(t * 3 + i));
        star(ctx, s.x, s.y, s.r * 0.7, 0);
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
    line: 'Then came Morwen, the Ink Witch. From the oldest storybooks she pulled three captains of ink: Rook the Corsair, Thorne the Ember Mage, and Sable the Hooded Blade.',
    seconds: 12,
    tint: VIOLET,
    sound: playPrompt,
    draw(ctx, t, k) {
      grass(ctx);
      witch(ctx, 170, GROUND, 1.25, Math.sin(t * 1.5) * 0.4);
      glow(ctx, 600, GROUND - 40, 160 * ease(k * 3), 0.6);
      book(ctx, 600, GROUND - 8, 1.5, 0.5 + 0.5 * Math.sin(t * 2));
      // The three rise out of the book one after another.
      const rise = (i: number) => ease((k - 0.25 - i * 0.18) * 4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, GROUND - 14);
      ctx.clip();
      corsair(ctx, 470, GROUND - 14 + (1 - rise(0)) * 230, 1.05, Math.sin(t * 2) * 0.2);
      mage(ctx, 620, GROUND - 14 + (1 - rise(1)) * 240, 1.05, rise(1), t);
      hooded(ctx, 790, GROUND - 14 + (1 - rise(2)) * 240, 1.05, rise(2), t);
      ctx.restore();
    },
  },
  {
    line: 'Together they captured the dragon, and Morwen bewitched it with her ink. Now it obeys only her.',
    seconds: 8,
    tint: VIOLET,
    sound: () => playRoar(0.1),
    draw(ctx, t, k) {
      grass(ctx);
      dragon(ctx, W / 2 + 60, GROUND, 1.2, 0);
      trance(ctx, W / 2 + 60, GROUND - 120, 190, t, 0.35 + 0.4 * ease(k * 2));
      witch(ctx, 150, GROUND, 1.1, Math.sin(t * 3) * 0.6);
      corsair(ctx, 840, GROUND, 0.85, 0);
      hooded(ctx, 950, GROUND, 0.85, 1, t);
    },
  },
  {
    line: 'She smashed the Great Lantern into pieces and spilled her ink across the land. Whatever ink touches, she owns.',
    seconds: 9,
    tint: TEAL,
    sound: playPrompt,
    draw(ctx, t, k) {
      // The Lantern bursts, and its pieces scatter over the land.
      const burst = ease(k * 2.2);
      if (burst < 0.98) lantern(ctx, W / 2, 60, 0.9, 0, 1 - burst);
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI * 0.95 + (i / 11) * Math.PI * 0.9;
        const d = burst * (180 + (i % 4) * 70);
        const x = W / 2 + Math.cos(a) * d * 1.6;
        const y = 150 - Math.sin(a) * d * 0.4 + burst * burst * 240;
        ctx.save();
        ctx.globalAlpha = 1 - ease(k * 1.6 - 0.6) * 0.6;
        ctx.fillStyle = '#ffd27a';
        star(ctx, x, Math.min(y, GROUND - 10), 9, t * 3 + i);
        ctx.restore();
      }
      grass(ctx);
      inkFlood(ctx, ease(k * 1.3 - 0.2), t);
      ctx.fillStyle = `rgba(11, 20, 48, ${0.45 * ease(k * 1.5 - 0.4)})`;
      ctx.fillRect(0, 0, W, H);
    },
  },
  {
    line: 'But ink cannot stain a shadow. A shadow is only where light is not, so the witch can never hold it.',
    seconds: 8,
    tint: TEAL,
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
    tint: DAWN,
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
    line: 'Every step of your escape wins back a piece of the Great Lantern. Beat her three captains for its three heart shards, relight it to free the dragon, and face the Ink Witch herself.',
    seconds: 12,
    tint: DUSK,
    sound: () => playRoar(0.06),
    draw(ctx, t, k) {
      grass(ctx);
      // The road, drawn on as it is told: jungle, river, mine, pass, the dragon's peak.
      const reach = ease(k * 1.25) * (ROAD.length - 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(11, 20, 48, 0.55)';
      ctx.lineWidth = 6;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ROAD.forEach(([x, y], i) => {
        if (i > Math.ceil(reach)) return;
        const f = Math.min(1, reach - (i - 1));
        if (i === 0) ctx.moveTo(x, y);
        else {
          const [px, py] = ROAD[i - 1];
          ctx.lineTo(px + (x - px) * Math.max(0, f), py + (y - py) * Math.max(0, f));
        }
      });
      ctx.stroke();
      ctx.restore();
      const show = (i: number) => ease((reach - i + 0.6) * 2);
      const at = (i: number) => ROAD[i];
      ctx.globalAlpha = show(0);
      lantern(ctx, at(0)[0], at(0)[1] - 150, 0.55, Math.sin(t * 2) * 0.1, 1);
      ctx.globalAlpha = show(1);
      corsair(ctx, at(1)[0], at(1)[1], 0.6, Math.sin(t * 2) * 0.3);
      ctx.globalAlpha = show(2);
      mage(ctx, at(2)[0], at(2)[1], 0.6, 1, t);
      ctx.globalAlpha = show(3);
      hooded(ctx, at(3)[0], at(3)[1], 0.6, 1, t);
      ctx.globalAlpha = show(4);
      dragon(ctx, at(4)[0] - 40, at(4)[1], 0.55, 0);
      trance(ctx, at(4)[0] - 40, at(4)[1] - 60, 80, t, 0.4);
      witch(ctx, at(4)[0] + 90, at(4)[1], 0.6, Math.sin(t * 2) * 0.5);
      // A heart shard glows over each captain as they are named.
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = show(i) * (0.7 + 0.3 * Math.sin(t * 4 + i));
        ctx.fillStyle = '#ffcf5a';
        star(ctx, at(i)[0], at(i)[1] - 160, 12, t + i);
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    line: 'You can stop whenever you like: push the Home button beside the screen. Now, raise your hand into the light.',
    seconds: 8,
    tint: GOLD,
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

/** Paper fibres, made once: the backlit screen of a shadow theatre. */
let fibres: HTMLCanvasElement | null = null;
function paperFibres(): HTMLCanvasElement {
  if (fibres) return fibres;
  fibres = document.createElement('canvas');
  fibres.width = 256;
  fibres.height = 128;
  const g = fibres.getContext('2d')!;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(120, 80, 30, ${0.03 + rand() * 0.05})`;
    g.lineWidth = 0.6 + rand();
    const x = rand() * 256;
    const y = rand() * 128;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + rand() * 20 - 10, y + rand() * 6 - 3, x + rand() * 30 - 15, y + rand() * 8 - 4);
    g.stroke();
  }
  return fibres;
}

/**
 * The opening shadow-puppet film, told by an old storyteller and shown on a
 * wide screen over the stage, with large subtitles inside the picture: the
 * title; the Lantern and its dragon; Morwen and the three captains she
 * pulled out of storybooks; the dragon bewitched; the Lantern smashed and the
 * land drowned in ink; why a shadow is the one thing ink cannot hold;
 * shadows made real; the road ahead, captain by captain; and how to stop.
 */
export class IntroShow {
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  readonly mesh: Mesh;
  private material: MeshBasicMaterial;
  private scene = -1;
  private sceneTime = 0;
  private time = 0;
  private sinceDraw = 1;
  private playing = false;

  constructor(parent: Object3D) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W * SCALE;
    this.canvas.height = H * SCALE;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    // Drawn over the stage's props, like a film screen lowered in front of them.
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), this.material);
    this.mesh.name = 'IntroShow';
    this.mesh.position.set(0, 0.1, 0.09);
    this.mesh.renderOrder = 25;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  get active(): boolean {
    return this.playing || this.material.opacity > 0.01;
  }

  start(): void {
    this.playing = true;
    this.scene = -1;
    this.time = 0;
    this.next();
  }

  /** Dev: straight on to the next scene. */
  skipScene(): void {
    if (this.playing && this.scene < SCENES.length - 1) this.next();
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
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const k = this.sceneTime / scene.seconds;
    this.backdrop(ctx, scene.tint, k);
    // The scene, inside the picture above the subtitles, with a slow push in.
    const top = H - BAND;
    // The scene's ground line sits just above the subtitles; the floor runs edge to edge.
    const fit = 0.92 * (1 + 0.04 * k);
    const floor = top - 18;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, top);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(0, floor, W, top - floor);
    ctx.translate(W / 2, floor);
    ctx.scale(fit, fit);
    ctx.translate(-W / 2, -GROUND);
    scene.draw(ctx, this.time, k);
    ctx.restore();
    this.dust(ctx, top);
    this.vignette(ctx, top);
    this.subtitle(ctx, scene.line, k);
    // Scenes fade through dark, like a turning page.
    const edge = Math.min(1, this.sceneTime / 0.45, (scene.seconds - this.sceneTime) / 0.45);
    if (edge < 1) {
      ctx.fillStyle = `rgba(8, 10, 22, ${1 - Math.max(0, edge)})`;
      ctx.fillRect(0, 0, W, top);
    }
    this.frame(ctx);
    this.texture.needsUpdate = true;
  }

  /** The screen lit from behind: bright in the middle, warm at the edges, with paper fibres. */
  private backdrop(ctx: CanvasRenderingContext2D, tint: Tint, k: number): void {
    const light = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.45, W * 0.62);
    light.addColorStop(0, tint[0]);
    light.addColorStop(0.55, tint[0]);
    light.addColorStop(1, tint[1]);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    // The lamp behind the screen flickers a little.
    ctx.fillStyle = `rgba(255, 220, 150, ${0.06 + 0.04 * Math.sin(this.time * 7 + k)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.9;
    const pattern = ctx.createPattern(paperFibres(), 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  /** Dust drifting through the light. */
  private dust(ctx: CanvasRenderingContext2D, top: number): void {
    for (let i = 0; i < 26; i++) {
      const x = (i * 157 + this.time * (8 + (i % 5) * 4)) % W;
      const y = (i * 89 + Math.sin(this.time * 0.6 + i) * 24 + 40) % (top - 20);
      ctx.fillStyle = `rgba(255, 244, 210, ${0.25 + 0.2 * Math.sin(this.time * 2 + i)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private vignette(ctx: CanvasRenderingContext2D, top: number): void {
    const v = ctx.createRadialGradient(W / 2, top / 2, top * 0.45, W / 2, top / 2, W * 0.62);
    v.addColorStop(0, 'rgba(20, 10, 0, 0)');
    v.addColorStop(1, 'rgba(20, 10, 0, 0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, top);
  }

  /** Large white subtitles on a dark band: up to two lines, as big as fits. */
  private subtitle(ctx: CanvasRenderingContext2D, text: string, k: number): void {
    const y0 = H - BAND;
    ctx.fillStyle = '#0d1326';
    ctx.fillRect(0, y0, W, BAND);
    ctx.fillStyle = '#ffc928';
    ctx.fillRect(W * 0.38, y0, W * 0.24 * Math.min(1, k * 1.05), 4);
    // Two lines as large as fit; a long line drops to three, smaller.
    let px = 34;
    let rows: string[] = [];
    for (; px >= 22; px -= 2) {
      ctx.font = `700 ${px}px ${FONT}`;
      rows = lines(ctx, text, W - 70);
      if (rows.length <= 2 || (rows.length === 3 && px <= 26)) break;
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shown = rows.slice(0, 3);
    const step = px * (shown.length > 2 ? 1.12 : 1.22);
    const mid = y0 + BAND / 2 + 3;
    shown.forEach((row, i) => ctx.fillText(row, W / 2, mid - ((shown.length - 1) * step) / 2 + i * step));
  }

  /** A thin gold frame and rounded corners around the whole film. */
  private frame(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 22);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffc928';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(3, 3, W - 6, H - 6, 20);
    ctx.stroke();
  }
}
