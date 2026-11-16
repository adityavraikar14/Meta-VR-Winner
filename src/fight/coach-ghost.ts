import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Vector3 } from '@iwsdk/core';

import { HandState } from '../yash/hands.js';
import { HandSkeleton, SimHands, type SimPose } from '../yash/sim-hands.js';
import { Label } from '../yash/visuals.js';

/**
 * The Training coach's ghost hands: a see-through hand beside yours that
 * shows each lesson. For a sign, it makes the shape, holds it, then punches
 * towards your sparring partner (the throw). For a drawing, it pinches and
 * traces the shape in the air, leaving a glowing line, then lets go.
 * Coordinates are the fight's stage space (the group this root is in).
 */
export type GhostLesson = 'fist' | 'point' | 'palm' | 'circle' | 'triangle' | 'box' | 'free';

const SIGN_POSE: Record<'fist' | 'point' | 'palm', SimPose> = { fist: 'sword', point: 'gun', palm: 'shield' };
const SIGN_WORDS: Record<'fist' | 'point' | 'palm', string> = { fist: 'a fist', point: 'one finger pointing', palm: 'an open palm' };
/** One showing: hold the sign, then the punch; or reach, trace, let go. */
const SIGN_CYCLE = 3.4;
const SIGN_PUNCH_AT = 1.8;
const DRAW_CYCLE = 3.6;
const TRAIL = 72;

export class CoachGhost {
  readonly root = new Group();
  private readonly sim = new SimHands();
  private readonly hands = { left: new HandState('left'), right: new HandState('right') };
  private readonly skeletons = { left: new HandSkeleton(0x9fe0ff), right: new HandSkeleton(0x9fe0ff) };
  private readonly label = new Label(0.026);
  private readonly trail: Line;
  private readonly trailPositions = new Float32Array(TRAIL * 3);
  private lesson: GhostLesson | null = null;
  private t = 0;
  private punched = false;
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly origin = new Vector3();
  private readonly at = new Vector3();
  private readonly centre = new Vector3();

  constructor() {
    this.root.name = 'CoachGhost';
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.trailPositions, 3));
    geometry.setDrawRange(0, 0);
    this.trail = new Line(geometry, new LineBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.95 }));
    this.trail.frustumCulled = false;
    this.root.add(this.skeletons.left.root, this.skeletons.right.root, this.trail, this.label.sprite);
    this.root.visible = false;
  }

  /** Each frame: what to show (null hides it), and where you are (stage space). */
  update(dt: number, time: number, lesson: GhostLesson | null, head: Vector3, forward: Vector3): void {
    if (lesson !== this.lesson) {
      this.lesson = lesson;
      this.t = 0;
      this.punched = false;
      this.sim.release();
      this.trail.geometry.setDrawRange(0, 0);
    }
    this.root.visible = lesson !== null;
    if (!lesson) return;
    this.t += dt;
    this.right.set(-forward.z, 0, forward.x);
    // To your left and a little forward, clear of your own hands and of the lesson card on the right.
    this.origin.copy(head).addScaledVector(this.right, -0.2).addScaledVector(this.up, 0.04);
    if (lesson === 'fist' || lesson === 'point' || lesson === 'palm') this.showSign(dt, time, lesson, forward);
    else this.showDrawing(time, lesson, head, forward);
  }

  private showSign(dt: number, time: number, sign: 'fist' | 'point' | 'palm', forward: Vector3): void {
    const k = this.t % SIGN_CYCLE;
    if (k < dt * 1.5) this.punched = false;
    const pose = SIGN_POSE[sign];
    if (this.sim.pose !== pose || !this.sim.active) this.sim.setPose(pose);
    // The shield is held, not thrown; the others are punched forward.
    if (sign !== 'palm' && k >= SIGN_PUNCH_AT && !this.punched) {
      this.punched = true;
      this.sim.startMove('push');
    }
    this.sim.apply(dt, time, this.origin, forward, this.hands);
    const side = sign === 'palm' ? 'left' : 'right';
    this.skeletons.left.root.visible = side === 'left';
    this.skeletons.right.root.visible = side === 'right';
    this.skeletons[side].update(this.hands[side]);
    this.trail.visible = false;
    const words = sign === 'palm'
      ? 'Open palm up in the light, facing him: a shield'
      : k < SIGN_PUNCH_AT ? `1. Make ${SIGN_WORDS[sign]}, up in the light` : '2. Punch towards him: it flies!';
    this.label.set(words, '#dff4ff', 'rgba(10, 24, 44, 0.85)');
    this.label.sprite.position.copy(this.hands[side].palm).addScaledVector(this.up, 0.11);
  }

  private showDrawing(time: number, shape: 'circle' | 'triangle' | 'box' | 'free', head: Vector3, forward: Vector3): void {
    const k = this.t % DRAW_CYCLE;
    this.centre.copy(head).addScaledVector(this.right, -0.16).addScaledVector(this.up, -0.12).addScaledVector(forward, 0.36);
    const size = 0.065;
    // Reach the start (0 to 0.4 s), trace (to 2.6 s), let go and show it (to the end).
    const trace = Math.max(0, Math.min(1, (k - 0.4) / 2.2));
    const pinching = k >= 0.3 && k < 2.65;
    pathPoint(shape, trace, this.at);
    this.at.set(this.at.x * size, this.at.y * size, 0);
    const point = this.toStage(this.at, forward, new Vector3());
    this.sim.pinchAt(this.hands.right, point, forward, pinching, time);
    this.skeletons.left.root.visible = false;
    this.skeletons.right.root.visible = true;
    this.skeletons.right.update(this.hands.right);
    // The glowing line, drawn as far as the trace has got.
    const n = Math.max(0, Math.min(TRAIL, Math.round(trace * (TRAIL - 1)) + 1));
    for (let i = 0; i < n; i++) {
      pathPoint(shape, i / (TRAIL - 1), this.at);
      this.at.set(this.at.x * size, this.at.y * size, 0);
      this.toStage(this.at, forward, point);
      this.trailPositions.set([point.x, point.y, point.z], i * 3);
    }
    this.trail.visible = k >= 0.4;
    this.trail.geometry.setDrawRange(0, n);
    (this.trail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    const words = k < 2.65
      ? `Pinch and draw ${shape === 'free' ? 'anything' : `a ${shape}`} in the air`
      : shape === 'free' ? 'Let go: it comes alive!' : 'Let go: it becomes your weapon!';
    this.label.set(words, '#dff4ff', 'rgba(10, 24, 44, 0.85)');
    this.label.sprite.position.copy(this.centre).addScaledVector(this.up, size + 0.06);
  }

  /** A point in the drawing's own plane (x right, y up, facing you) to stage space. */
  private toStage(p: Vector3, forward: Vector3, out: Vector3): Vector3 {
    return out.copy(this.centre).addScaledVector(this.right, p.x).addScaledVector(this.up, p.y).addScaledVector(forward, -p.z);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.trail.geometry.dispose();
  }
}

/** Where along a drawing (t from 0 to 1) the pen is, in units of the drawing's size. */
function pathPoint(shape: 'circle' | 'triangle' | 'box' | 'free', t: number, out: Vector3): Vector3 {
  if (shape === 'circle') {
    const a = Math.PI / 2 + t * Math.PI * 2;
    return out.set(Math.cos(a), Math.sin(a), 0);
  }
  if (shape === 'free') {
    // A wavy snake of a line, left to right.
    return out.set(-1.2 + 2.4 * t, 0.45 * Math.sin(t * Math.PI * 3), 0);
  }
  const corners = shape === 'triangle'
    ? [[0, 1], [0.95, -0.7], [-0.95, -0.7], [0, 1]]
    : [[-0.85, 0.85], [0.85, 0.85], [0.85, -0.85], [-0.85, -0.85], [-0.85, 0.85]];
  const segments = corners.length - 1;
  const s = Math.min(segments - 1e-6, t * segments);
  const i = Math.floor(s);
  const f = s - i;
  return out.set(corners[i][0] + (corners[i + 1][0] - corners[i][0]) * f, corners[i][1] + (corners[i + 1][1] - corners[i][1]) * f, 0);
}
