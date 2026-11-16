import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Vector3 } from '@iwsdk/core';

import { playClick, playCollect } from '../audio.js';
import { PushButton } from '../push-button.js';
import { layout } from '../ui-theme.js';
import { FONT } from '../ui-theme.js';
import { DRAWN_WEAPON, drawHand, drawSketch, SHAPE_LABEL, SKETCH_ORDER } from './arms-art.js';
import { ARMS, type ShadowShape, SHAPES } from './shadow-arms.js';
import type { GhostLesson } from './coach-ghost.js';
import type { Sketch } from './sketch.js';

/**
 * The Training Arena's coach: one lesson per weapon, in order, with live
 * guidance. The panel shows the shape to make beside the shape your hand
 * is making now, a ring that fills while you hold it, and three ticks:
 * make it, it forms, use it. A lesson passes when you have used the weapon
 * on your sparring partner (or blocked their ink, for the shield), and the
 * next one starts. Back and Next step through the lessons at will.
 */
export interface Lesson {
  title: string;
  /** A hand shape to make, or a drawing to draw. */
  shape?: ShadowShape;
  sketch?: Sketch;
  /** Draw anything at all: it comes alive. */
  free?: boolean;
  /** What to do with it once it forms. */
  use: string;
  /** Pass by hitting them, by blocking their ink, or by bringing a drawing to life (times). */
  goal: 'hit' | 'block' | 'alive';
  times: number;
}

const LESSONS: Lesson[] = [
  ...SHAPES.map((shape): Lesson => ({
    title: ARMS[shape].name,
    shape,
    use: shape === 'palm' ? 'Hold it up in the light, palm towards Vance: block his ink twice' : 'Hold it up in the light (its shadow on the screen), then punch towards Vance',
    goal: shape === 'palm' ? 'block' : 'hit',
    times: shape === 'palm' ? 2 : 1,
  })),
  ...SKETCH_ORDER.map((sketch): Lesson => {
    const shape = DRAWN_WEAPON[sketch];
    return {
      title: `Draw: ${ARMS[shape].name}`,
      sketch,
      use: shape === 'palm' ? 'It moves with your hand: block his ink once' : shape === 'blade' ? 'Swing your hand fast to slash' : 'Punch towards Vance to throw it',
      goal: shape === 'palm' ? 'block' : 'hit',
      times: 1,
    };
  }),
  { title: 'Draw anything: it comes alive', free: true, use: 'Any shape or line (not a circle, triangle or box) comes alive and fights for you', goal: 'alive', times: 1 },
];

export class Trainer {
  readonly root = new Group();
  index = 0;
  /** Every lesson passed at least once. */
  finished = false;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly back: PushButton;
  private readonly next: PushButton;
  private made = false;
  private formed = false;
  private count = 0;
  private passed = 0;
  private readonly cleared = new Set<number>();
  private seen: ShadowShape | null = null;
  private progress = 0;
  private redraw = 0;
  private key = '';

  /** The lessons this session teaches (all of them, or the Quick Tour's few). */
  private readonly list: Lesson[];

  constructor(parent: Group) {
    // Every lesson, in the Training Arena and on the Quick Tour alike (Skip moves on whenever you like).
    this.list = LESSONS;
    // The lesson above, a strip along the bottom for Back and Next (inside the card, not hanging below it).
    this.canvas.width = 2048;
    this.canvas.height = 1624;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    // Big enough to read at arm's length in the headset (it was 44 × 30 cm).
    // Always in front of the grass, but drawn before its Back and Next buttons (orders 15–20), so they show on it.
    const panel = new Mesh(new PlaneGeometry(0.53, 0.42), new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    panel.renderOrder = 14;
    this.root.add(panel);
    this.back = new PushButton(this.root, 'Back');
    this.next = new PushButton(this.root, 'Next');
    for (const [button, x] of [[this.back, -0.19], [this.next, 0.19]] as const) {
      button.size = 0.9;
      button.root.position.set(x, -0.165, 0.01);
      button.show(true);
    }
    // Small and to your right, so your sparring partner and your hands stay in view.
    this.root.scale.setScalar(0.58);
    parent.add(this.root);
  }

  get lesson(): Lesson {
    return this.list[this.index];
  }

  /** A lesson just passed: the well-done moment. */
  get celebrating(): boolean {
    return this.passed > 0;
  }

  /** What the ghost hands show for this lesson. */
  get ghost(): GhostLesson {
    const l = this.lesson;
    if (l.shape === 'fist' || l.shape === 'point' || l.shape === 'palm') return l.shape;
    if (l.sketch === 'circle' || l.sketch === 'triangle' || l.sketch === 'box') return l.sketch;
    return 'free';
  }

  /** A sign lesson (drawing lessons switch the signs off, so a hand drawing never makes one). */
  get signs(): boolean {
    return !!this.lesson.shape;
  }

  /** Does this lesson want them to throw at you (to block)? */
  get wantsIncoming(): boolean {
    return this.lesson.goal === 'block' && this.formed;
  }

  /** The line under the screen. */
  get caption(): string {
    if (this.passed > 0) return this.finished ? 'Training complete! Every weapon learned' : `Well done! Next: ${this.list[this.index + 1]?.title ?? 'free practice'}`;
    const l = this.lesson;
    if (l.free) return 'Pinch and draw anything in the air (a squiggle, a line, a star), then let go: it comes alive';
    if (!this.formed) return l.shape ? `Copy the ghost hand on your left: ${SHAPE_LABEL[l.shape].toLowerCase()}, up in the light` : `Copy the ghost hand: pinch and draw ${l.sketch === 'sword' ? 'a long blade' : `a ${l.sketch}`} in the air, then let go`;
    return l.use;
  }

  // Events from the fight.
  formedShape(shape: ShadowShape): void {
    if (this.lesson.shape === shape) this.formed = this.made = true;
  }
  drew(sketch: Sketch): void {
    if (this.lesson.sketch === sketch) this.formed = this.made = true;
  }
  hit(shape: ShadowShape): void {
    const l = this.lesson;
    if (l.goal === 'hit' && this.formed && (l.shape === shape || (l.sketch && DRAWN_WEAPON[l.sketch] === shape))) this.score();
  }
  blocked(): void {
    if (this.lesson.goal === 'block' && this.formed) this.score();
  }
  alive(): void {
    if (this.lesson.goal === 'alive') {
      this.formed = this.made = true;
      this.score();
    }
  }

  private score(): void {
    this.count++;
    if (this.count >= this.lesson.times && this.passed <= 0) {
      this.passed = 1.8;
      this.cleared.add(this.index);
      playCollect();
      if (this.cleared.size >= this.list.length) this.finished = true;
    }
  }

  private go(index: number): void {
    this.index = (index + this.list.length) % this.list.length;
    this.made = this.formed = false;
    this.count = 0;
    this.passed = 0;
  }

  /** `seen`: the shape the hand is making now; `progress`: 0…1 of holding it. */
  update(dt: number, tips: readonly Vector3[], seen: ShadowShape | null, progress: number, eye: Vector3): void {
    this.root.lookAt(eye);
    this.seen = seen;
    this.progress = progress;
    if (this.lesson.shape && seen === this.lesson.shape) this.made = true;
    if (this.passed > 0) {
      this.passed -= dt;
      if (this.passed <= 0) this.go(this.index + 1);
    }
    if (this.back.update(dt, tips, false)) {
      playClick();
      this.go(this.index - 1);
    }
    if (this.next.update(dt, tips, false)) {
      playClick();
      this.go(this.index + 1);
    }
    this.redraw -= dt;
    const key = `${this.index}|${seen}|${Math.round(progress * 10)}|${this.made}|${this.formed}|${this.count}|${this.passed > 0}`;
    if (key !== this.key && this.redraw <= 0) {
      this.key = key;
      this.redraw = 0.08;
      this.paint();
    }
  }

  private paint(): void {
    const { g, w, h } = layout(this.canvas);
    const l = this.lesson;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20, 33, 61, 0.95)';
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, 26);
    g.fill();
    g.strokeStyle = this.passed > 0 ? '#49d17d' : '#ffd84a';
    g.lineWidth = 5;
    g.stroke();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#ffd84a';
    g.font = `900 26px ${FONT}`;
    g.fillText(`TRAINING · ${this.index + 1} / ${this.list.length}`, 28, 40);
    g.fillStyle = '#ffffff';
    g.font = `900 40px ${FONT}`;
    g.fillText(l.title, 28, 84, w - 56);

    // Left: the shape to make (or the drawing to draw). Right: what your hand is doing now.
    const spec = l.free ? { name: 'A living drawing', color: 0xffc928 } : ARMS[l.shape ?? DRAWN_WEAPON[l.sketch!]];
    const color = `#${spec.color.toString(16).padStart(6, '0')}`;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.roundRect(28, 116, 300, 300, 18);
    g.fill();
    g.beginPath();
    g.roundRect(w - 328, 116, 300, 300, 18);
    g.fill();
    g.fillStyle = '#9fb3d9';
    g.font = `800 22px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(l.shape ? 'MAKE THIS SHAPE' : 'DRAW THIS', 178, 140);
    g.fillText('YOUR HAND NOW', w - 178, 140);
    if (l.shape) drawHand(g, 178, 268, 80, l.shape, color);
    else if (l.sketch) drawSketch(g, 178, 268, 170, l.sketch, color);
    else {
      // Any squiggle at all.
      g.strokeStyle = color;
      g.lineWidth = 12;
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const x = 178 - 110 + 220 * t;
        const y = 268 + 50 * Math.sin(t * Math.PI * 3);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.font = `800 27px ${FONT}`;
    g.fillText(l.shape ? SHAPE_LABEL[l.shape] : `then let go`, 178, 396);

    const right = l.shape ? this.seen === l.shape : this.formed;
    const mine = this.seen;
    if (mine) drawHand(g, w - 178, 268, 80, mine, right ? '#49d17d' : '#ffffff');
    else {
      g.fillStyle = '#6f7fa3';
      g.font = `700 24px ${FONT}`;
      g.fillText('no shape yet', w - 178, 280);
    }
    g.fillStyle = right ? '#49d17d' : '#ffffff';
    g.font = `800 27px ${FONT}`;
    g.fillText(mine ? `${SHAPE_LABEL[mine]}${right ? '  ✓' : ''}` : '', w - 178, 396);
    // The ring that fills as the shape is held.
    if (l.shape && this.progress > 0 && !this.formed) {
      g.strokeStyle = '#ffd84a';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(w - 178, 262, 104, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.progress));
      g.stroke();
    }

    // The middle: an arrow, and the weapon it becomes.
    g.fillStyle = color;
    g.font = `900 64px ${FONT}`;
    g.fillText('→', w / 2, 220);
    g.font = `900 32px ${FONT}`;
    g.fillText(spec.name, w / 2, 280, 330);
    g.fillStyle = '#c2d0ec';
    g.font = `700 22px ${FONT}`;
    g.fillText(l.free ? 'comes alive and fights' : 'forms in your hand', w / 2, 316, 330);

    // The three steps, ticked as you go.
    const steps = [
      l.shape ? `Make the shape: ${SHAPE_LABEL[l.shape].toLowerCase()}, up in the light` : `Pinch and draw it in the air, then let go`,
      l.shape ? 'Hold it still a moment: the weapon forms in your hand' : l.free ? 'It puffs up and comes alive' : 'The drawing turns into the weapon, in that hand',
      `${l.use}${l.times > 1 ? ` (${Math.min(this.count, l.times)}/${l.times})` : ''}`,
    ];
    const done = [this.made || this.formed, this.formed, this.count >= l.times];
    steps.forEach((step, i) => {
      const y = 462 + i * 64;
      g.fillStyle = done[i] ? '#49d17d' : 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(52, y, 23, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = done[i] ? '#14213d' : '#ffffff';
      g.font = `900 26px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(done[i] ? '✓' : String(i + 1), 52, y + 1);
      g.textAlign = 'left';
      g.fillStyle = done[i] ? '#b8f5cf' : '#ffffff';
      g.font = `700 30px ${FONT}`;
      g.fillText(step, 90, y, w - 114);
    });
    if (this.passed > 0) {
      g.fillStyle = '#49d17d';
      g.font = `900 30px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(this.finished ? 'TRAINING COMPLETE!' : 'WELL DONE!', w / 2, 740);
    } else {
      g.fillStyle = '#9fb3d9';
      g.font = `700 24px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('Watch the ghost hand on your left  ·  Done? Push Skip to move on', w / 2, 740);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.texture.dispose();
  }
}
