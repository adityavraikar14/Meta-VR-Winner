import { CanvasTexture, Group, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

import { PAPER_HEIGHT, PAPER_WIDTH, stage } from './stage-state.js';
import { FONT } from './ui-theme.js';

/**
 * Move the screen (and the whole world on it) to suit how you sit. Push Adjust
 * (beside the screen, under Home), then pinch anywhere in the air and drag:
 * the screen follows your hand, twice as far as the hand goes, and keeps
 * turning to face you. Let go for a moment and it stays there. The distance
 * and height are remembered for next time, and Recenter keeps them.
 */

/** How the screen sits in front of you: metres ahead of the eyes, and below them. */
export interface Seat {
  distance: number;
  drop: number;
}

export const DEFAULT_SEAT: Seat = { distance: 1.0, drop: 0.12 };
/** Never so close that the buttons (in front of the screen) reach your face. */
const DISTANCE: [number, number] = [0.65, 1.6];
const DROP: [number, number] = [-0.3, 0.6];
const KEY = 'shadowplay.seat';

/** The screen moves this many times as far as the pinching hand. */
const GAIN = 1.5;
/** Pinch closes under this thumb-to-index gap and opens over the second. */
const PINCH: [number, number] = [0.022, 0.045];
/** Moving ends by itself this long after you let go (or if you never pinch). */
const DONE_AFTER = 8;
const IDLE_LIMIT = 40;

const THUMB_TIP = 4;
const INDEX_TIP = 9;

export function loadSeat(): Seat {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Seat> | null;
    if (raw && Number.isFinite(raw.distance) && Number.isFinite(raw.drop)) return clampSeat({ distance: raw.distance!, drop: raw.drop! });
  } catch {
    // No storage: the default seat.
  }
  return { ...DEFAULT_SEAT };
}

function saveSeat(seat: Seat): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seat));
  } catch {
    // Not saved; it still holds for this visit.
  }
}

function clampSeat(seat: Seat): Seat {
  return {
    distance: Math.min(DISTANCE[1], Math.max(DISTANCE[0], seat.distance)),
    drop: Math.min(DROP[1], Math.max(DROP[0], seat.drop)),
  };
}

export class ScreenMover {
  /** A gold frame round the screen while it can be moved. */
  private readonly frame = new Group();
  private readonly frameMaterial = new MeshBasicMaterial({ color: 0xffd84a, transparent: true, depthTest: false, depthWrite: false });
  private readonly pinched = [false, false];
  private readonly last = [new Vector3(), new Vector3()];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly step = new Vector3();
  private readonly ahead = new Vector3();
  private time = 0;
  private sinceDrag = 0;
  private dragged = false;
  /** How to do it, in the middle of the screen while adjusting (faint while you drag). */
  private readonly cardMaterial: MeshBasicMaterial;

  constructor(
    private readonly paper: Group,
    private readonly player: Object3D,
    /** Called when a move ends, with the new seat (distance and height from the eyes). */
    private readonly onSettled: (seat: Seat) => void,
  ) {
    const t = 0.008;
    const w = PAPER_WIDTH + 0.03;
    const h = PAPER_HEIGHT + 0.03;
    for (const [x, y, sx, sy] of [
      [0, h / 2, w + t, t],
      [0, -h / 2, w + t, t],
      [w / 2, 0, t, h],
      [-w / 2, 0, t, h],
    ]) {
      const bar = new Mesh(new PlaneGeometry(sx, sy), this.frameMaterial);
      bar.position.set(x, y, 0.006);
      bar.renderOrder = 29;
      this.frame.add(bar);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 700;
    drawCard(canvas);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.cardMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const card = new Mesh(new PlaneGeometry(0.66, 0.33), this.cardMaterial);
    card.position.set(0, 0.02, 0.12);
    card.renderOrder = 31;
    this.frame.add(card);
    this.frame.visible = false;
    this.frame.name = 'MoveFrame';
    paper.add(this.frame);
  }

  get moving(): boolean {
    return stage.moving;
  }

  start(): void {
    stage.moving = true;
    this.time = 0;
    this.sinceDrag = 0;
    this.dragged = false;
    this.pinched[0] = this.pinched[1] = false;
    this.frame.visible = true;
  }

  finish(head: Vector3): void {
    if (!stage.moving) return;
    stage.moving = false;
    this.frame.visible = false;
    this.onSettled(this.seatFrom(head));
  }

  /** Each frame while moving: `head` is the eye in world space. */
  update(dt: number, head: Vector3): void {
    if (!stage.moving) return;
    this.time += dt;
    this.frameMaterial.opacity = 0.55 + 0.35 * Math.sin(this.time * 4) ** 2;
    let dragging = false;
    for (let i = 0; i < 2; i++) {
      if (!stage.tracked[i]) {
        this.pinched[i] = false;
        continue;
      }
      const j = stage.joints[i];
      this.player.localToWorld(this.a.set(j[THUMB_TIP * 3], j[THUMB_TIP * 3 + 1], j[THUMB_TIP * 3 + 2]));
      this.player.localToWorld(this.b.set(j[INDEX_TIP * 3], j[INDEX_TIP * 3 + 1], j[INDEX_TIP * 3 + 2]));
      const gap = this.a.distanceTo(this.b);
      const at = this.a.add(this.b).multiplyScalar(0.5);
      if (!this.pinched[i]) {
        if (gap < PINCH[0]) {
          this.pinched[i] = true;
          this.last[i].copy(at);
        }
        continue;
      }
      if (gap > PINCH[1]) {
        this.pinched[i] = false;
        continue;
      }
      // One hand at a time moves it (the first one pinching).
      if (!dragging) {
        this.step.subVectors(at, this.last[i]).multiplyScalar(GAIN);
        this.drag(this.step, head);
        dragging = true;
      }
      this.last[i].copy(at);
    }
    if (dragging) {
      this.dragged = true;
      this.sinceDrag = 0;
    } else this.sinceDrag += dt;
    const faint = this.pinched[0] || this.pinched[1] ? 0.25 : 1;
    this.cardMaterial.opacity += (faint - this.cardMaterial.opacity) * Math.min(1, dt * 8);
    stage.moveCaption = this.caption();
    if ((this.dragged && this.sinceDrag > DONE_AFTER) || (!this.dragged && this.time > IDLE_LIMIT)) this.finish(head);
  }

  /** What to say on the caption while moving. */
  caption(): string {
    if (this.pinched[0] || this.pinched[1]) return 'Moving the screen… let go when it feels right';
    return this.dragged
      ? 'Pinch and drag again to fine-tune, or push Done'
      : 'Pinch your thumb and index finger anywhere in the air, then drag';
  }

  private drag(by: Vector3, head: Vector3): void {
    const p = this.paper.position;
    p.add(by);
    // Keep it in a comfortable range in front of you.
    this.ahead.subVectors(p, head).setY(0);
    let flat = this.ahead.length();
    if (flat < 1e-3) {
      this.ahead.set(0, 0, -1);
      flat = 1e-3;
    }
    const want = Math.min(DISTANCE[1], Math.max(DISTANCE[0], flat));
    if (want !== flat) {
      this.ahead.multiplyScalar(want / flat);
      p.x = head.x + this.ahead.x;
      p.z = head.z + this.ahead.z;
    }
    const before = p.y - by.y;
    p.y = Math.min(head.y - DROP[0], Math.max(head.y - DROP[1], p.y));
    // The world on the table comes along up or down with the screen.
    if (stage.tableHeight !== null) stage.tableHeight += p.y - before;
    this.paper.rotation.set(0, Math.atan2(-this.ahead.x, -this.ahead.z), 0);
    this.paper.updateMatrixWorld(true);
  }

  private seatFrom(head: Vector3): Seat {
    const p = this.paper.position;
    const seat = clampSeat({ distance: Math.hypot(p.x - head.x, p.z - head.z), drop: head.y - p.y });
    saveSeat(seat);
    return seat;
  }
}

/** The steps, big and plain: pinch, drag, Done. */
function drawCard(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  g.fillStyle = 'rgba(16, 26, 48, 0.92)';
  g.beginPath();
  g.roundRect(8, 8, w - 16, h - 16, 48);
  g.fill();
  g.strokeStyle = '#ffd84a';
  g.lineWidth = 8;
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd84a';
  g.font = `900 78px ${FONT}`;
  g.fillText('Adjust the screen', w / 2, 100);
  const steps = [
    'Pinch thumb and index finger, anywhere in the air',
    'Drag: closer, further, up or down. The screen follows',
    'Let go, then push Done (beside the screen)',
  ];
  g.textAlign = 'left';
  steps.forEach((text, i) => {
    const y = 250 + i * 140;
    g.fillStyle = '#ffd84a';
    g.beginPath();
    g.arc(110, y, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#10203a';
    g.font = `900 52px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(String(i + 1), 110, y + 2);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = `800 50px ${FONT}`;
    g.fillText(text, 180, y, w - 220);
  });
}
