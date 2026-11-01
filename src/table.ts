import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { createExtension, readExtension } from './hand-pose.js';

/**
 * Finds the player's real table from one gesture: a hand laid flat on it
 * and held still for a moment. No room scan needed, and it works the same
 * on any headset. The table's height is where the jungle will grow.
 */

/** Seconds the flat hand must stay still. */
const HOLD = 1.0;
/** How far the hand may drift while held, in metres. */
const STILL = 0.012;
/** The table must be this far below the eyes (seated: lap to chest height). */
const BELOW_EYES: [number, number] = [0.18, 0.85];
/** Joint centres sit this far above the skin touching the table. */
const SKIN = 0.009;

/** Knuckles and fingertips of index..pinky: the parts that rest on the table. */
const CONTACT = [6, 9, 11, 14, 16, 19, 21, 24];
const WRIST = 0;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const PINKY_KNUCKLE = 21;

export interface TableReading {
  /** 0..1 while a flat hand is held still; 1 means found. */
  progress: number;
  /** World height of the table top, once found. */
  height: number | null;
  /** World point under the palm, for the glow and for where the jungle grows from. */
  point: Vector3;
  /** A flat hand is in view but not yet still or level. */
  close: boolean;
}

export class TableFinder {
  readonly reading: TableReading = { progress: 0, height: null, point: new Vector3(), close: false };
  private readonly ring: Mesh;
  private held = 0;
  private anchor = new Vector3();
  private ext = createExtension();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private n = new Vector3();
  private p = new Vector3();

  constructor(private readonly parent: Object3D) {
    this.ring = new Mesh(
      new PlaneGeometry(0.22, 0.22),
      new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }),
    );
    this.ring.name = 'TableGlow';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    parent.add(this.ring);
  }

  reset(): void {
    this.held = 0;
    this.reading.progress = 0;
    this.reading.height = null;
    this.reading.close = false;
  }

  /**
   * Feed both hands (joints in player space) each frame. `toWorld` maps a
   * player-space point to world space; `eyes` is the head's world height.
   */
  update(dt: number, joints: readonly Float32Array[], tracked: readonly boolean[], toWorld: (v: Vector3) => Vector3, eyes: number): TableReading {
    const r = this.reading;
    if (r.height !== null) return r;
    let found = false;
    r.close = false;
    for (let h = 0; h < joints.length && !found; h++) {
      if (!tracked[h]) continue;
      const j = joints[h];
      readExtension(j, this.ext);
      const flat = this.ext.index > 0.7 && this.ext.middle > 0.7 && this.ext.ring > 0.6 && this.ext.pinky > 0.5;
      if (!flat) continue;
      // The palm's plane must be level: its normal close to vertical.
      const at = (i: number, out: Vector3) => toWorld(out.set(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]));
      at(WRIST, this.a);
      at(MIDDLE_KNUCKLE, this.b);
      at(INDEX_KNUCKLE, this.c);
      at(PINKY_KNUCKLE, this.p);
      const forward = this.b.sub(this.a);
      const across = this.c.sub(this.p);
      this.n.crossVectors(forward, across).normalize();
      if (Math.abs(this.n.y) < 0.85) continue;
      // The lowest resting joint is on the table.
      let low = Infinity;
      for (const i of CONTACT) low = Math.min(low, at(i, this.p).y);
      const below = eyes - low;
      if (below < BELOW_EYES[0] || below > BELOW_EYES[1]) continue;
      at(MIDDLE_KNUCKLE, this.p);
      this.p.y = low - SKIN;
      r.close = true;
      if (this.held > 0 && this.p.distanceTo(this.anchor) > STILL) {
        this.held = 0;
      }
      if (this.held === 0) this.anchor.copy(this.p);
      this.held += dt;
      r.point.copy(this.anchor);
      found = true;
    }
    if (!found) this.held = Math.max(0, this.held - dt * 3);
    r.progress = Math.min(1, this.held / HOLD);
    if (r.progress >= 1) r.height = r.point.y;
    this.showGlow(dt, found);
    return r;
  }

  /** A soft ring of light spreading under the palm as it is held. */
  private showGlow(dt: number, active: boolean): void {
    const material = this.ring.material as MeshBasicMaterial;
    const target = active ? 0.35 + this.reading.progress * 0.65 : 0;
    material.opacity += (target - material.opacity) * Math.min(1, dt * 8);
    this.ring.visible = material.opacity > 0.01;
    if (!this.ring.visible) return;
    this.ring.position.copy(this.reading.point);
    this.parent.worldToLocal(this.ring.position);
    this.ring.position.y += 0.002;
    this.ring.scale.setScalar(0.5 + this.reading.progress * 0.7);
  }

  /** Fade the glow away once the jungle has taken over. */
  hide(): void {
    this.ring.visible = false;
    (this.ring.material as MeshBasicMaterial).opacity = 0;
  }
}

let ring: CanvasTexture | null = null;

function ringTexture(): CanvasTexture {
  if (ring) return ring;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,230,160,0.0)');
  g.addColorStop(0.55, 'rgba(255,220,140,0.55)');
  g.addColorStop(0.7, 'rgba(190,255,150,0.8)');
  g.addColorStop(1, 'rgba(120,200,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ring = new CanvasTexture(canvas);
  ring.colorSpace = SRGBColorSpace;
  return ring;
}
