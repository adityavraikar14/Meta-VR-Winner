import { CatmullRomCurve3, Mesh, MeshBasicMaterial, type Object3D, TubeGeometry, Vector3 } from '@iwsdk/core';

import type { HandState, Side } from '../yash/hands.js';
import { isClosedLoop } from './doodle.js';
import { recognise, type Sketch } from './sketch.js';

/**
 * Drawing in the air for the Arsenal (no shadows there): pinch thumb and
 * index and draw. Let go and, if the drawing is one of the shapes sketch.ts
 * knows (a sword, a spearhead, a ball, a zigzag, a spiral, a star, a box),
 * `onSketch` hears what it was, and from which hand. Anything else fades.
 * The line glows while you draw, flashes when it is recognised.
 */
const PINCH_ON = 0.022;
const PINCH_OFF = 0.045;
const STEP = 0.007;
const MAX_POINTS = 220;

interface Stroke {
  points: Vector3[];
  mesh: Mesh;
  fade: number;
  fading: boolean;
  built: number;
}

export class AirSketch {
  private readonly material = new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly drawing: Record<Side, Stroke | null> = { left: null, right: null };
  private readonly fading: Stroke[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  constructor(
    private readonly root: Object3D,
    private readonly onSketch: (sketch: Sketch, side: Side, at: Vector3) => void,
  ) {}

  /** `busy(side)`: that hand is doing something else (holding a weapon, signing): no drawing. */
  update(dt: number, hands: Record<Side, HandState>, busy: (side: Side) => boolean): void {
    for (const side of ['left', 'right'] as const) {
      const hand = hands[side];
      const stroke = this.drawing[side];
      if (!hand.tracked) {
        if (stroke) this.finish(side);
        continue;
      }
      const at = hand.joint(4, this.a).add(hand.joint(9, this.b)).multiplyScalar(0.5);
      if (!stroke) {
        if (hand.pinch < PINCH_ON && !busy(side)) {
          const mesh = new Mesh(undefined, this.material);
          mesh.userData.keep = true;
          mesh.frustumCulled = false;
          this.root.add(mesh);
          this.drawing[side] = { points: [at.clone()], mesh, fade: 1, fading: false, built: 0 };
        }
        continue;
      }
      if (hand.pinch > PINCH_OFF) {
        this.finish(side);
        continue;
      }
      const last = stroke.points[stroke.points.length - 1];
      if (at.distanceTo(last) >= STEP && stroke.points.length < MAX_POINTS) {
        stroke.points.push(at.clone());
        if (stroke.points.length - stroke.built >= 3) this.build(stroke);
      }
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const stroke = this.fading[i];
      stroke.fade -= dt / 0.6;
      (stroke.mesh.material as MeshBasicMaterial).opacity = Math.max(0, stroke.fade) * 0.9;
      if (stroke.fade <= 0) {
        stroke.mesh.removeFromParent();
        stroke.mesh.geometry?.dispose();
        (stroke.mesh.material as MeshBasicMaterial).dispose();
        this.fading.splice(i, 1);
      }
    }
  }

  /** Lets go of every line now (the fight ended, the level changed). */
  clear(): void {
    for (const side of ['left', 'right'] as const) {
      const stroke = this.drawing[side];
      if (stroke) {
        stroke.mesh.removeFromParent();
        stroke.mesh.geometry?.dispose();
      }
      this.drawing[side] = null;
    }
  }

  private build(stroke: Stroke): void {
    if (stroke.points.length < 2) return;
    stroke.mesh.geometry?.dispose();
    stroke.mesh.geometry = new TubeGeometry(new CatmullRomCurve3(stroke.points), Math.min(200, stroke.points.length * 2), 0.004, 6, false);
    stroke.built = stroke.points.length;
  }

  private finish(side: Side): void {
    const stroke = this.drawing[side];
    this.drawing[side] = null;
    if (!stroke) return;
    this.build(stroke);
    // Recognised: the line flashes gold before it fades; otherwise it just fades.
    const centre = new Vector3();
    for (const p of stroke.points) centre.add(p);
    centre.divideScalar(Math.max(1, stroke.points.length));
    const local = stroke.points.map((p) => p.clone().sub(centre));
    const sketch = stroke.points.length >= 8 ? recognise(local, isClosedLoop(local)) : null;
    stroke.mesh.material = this.material.clone();
    if (sketch) (stroke.mesh.material as MeshBasicMaterial).color.setHex(0xffd84a);
    this.fading.push(stroke);
    if (sketch) this.onSketch(sketch, side, centre);
  }
}
