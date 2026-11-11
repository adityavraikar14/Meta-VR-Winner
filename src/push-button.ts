import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';

import { BUTTON, fitFont, labelColor, shade } from './ui-theme.js';

const BASE_RADIUS = 0.06;
const BASE_DEPTH = 0.016;
const CAP_RADIUS = 0.048;
const CAP_DEPTH = 0.018;
/** Cap face when nothing touches it, measured out from the back of the base. */
const CAP_REST = BASE_DEPTH + 0.014;
/** How far the cap travels before it bottoms out. */
const TRAVEL = 0.012;
/** The click happens this far down; it re-arms once the cap is nearly back up. */
const CLICK_AT = 0.0085;
const REARM_AT = 0.003;
/** Fingertip joints sit inside the finger pad by roughly this much. */
const FINGER_RADIUS = 0.008;
const SPRING = 18;

/** Default cap colour (a bright red); setColor changes it per button. */
const DEFAULT_COLOR = BUTTON.red;

/**
 * A chunky round button with its word printed on the cap. Push it with a
 * fingertip: the cap follows the finger down, clicks near the bottom of its
 * travel and springs back up. A ray click (mouse, controller or pinch)
 * presses it too.
 */
export class PushButton {
  readonly root = new Group();
  /** Overall size; the pop-in animation scales on top of it. */
  size = 1;
  private cap: Mesh;
  private capMaterial: MeshStandardMaterial;
  private face: Mesh;
  private faceCanvas: HTMLCanvasElement;
  private faceTexture: CanvasTexture;
  private travel = 0;
  private armed = true;
  private color: number = DEFAULT_COLOR;
  private text = '';
  /** A colour set with setColor wins over the label's own. */
  private pinned = false;
  /** The cap's own colour, and a lighter one it glows towards as a finger nears. */
  private idle = new Color(DEFAULT_COLOR);
  private lit = new Color(DEFAULT_COLOR).lerp(new Color(0xffffff), 0.45);
  private appear = 0;
  private shown = false;
  private time = 0;
  private local = new Vector3();

  constructor(parent: Object3D, text: string) {
    this.root.name = 'PushButton';
    this.root.visible = false;

    // A clean white base ring, like a toy's moulded plastic.
    const base = new Mesh(
      new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.08, BASE_DEPTH, 48),
      new MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.35 }),
    );
    base.rotation.x = Math.PI / 2;
    base.position.z = BASE_DEPTH / 2;
    this.root.add(base);

    this.capMaterial = new MeshStandardMaterial({
      color: DEFAULT_COLOR,
      roughness: 0.3,
      emissive: this.idle.clone(),
      emissiveIntensity: 0.25,
    });
    this.cap = new Mesh(new CylinderGeometry(CAP_RADIUS * 0.94, CAP_RADIUS, CAP_DEPTH, 48), this.capMaterial);
    this.cap.rotation.x = Math.PI / 2;
    this.root.add(this.cap);

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceTexture = new CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = SRGBColorSpace;
    this.face = new Mesh(
      new CircleGeometry(CAP_RADIUS * 0.92, 48),
      new MeshBasicMaterial({ map: this.faceTexture, transparent: true }),
    );
    this.root.add(this.face);
    this.setText(text);
    this.placeCap();
    parent.add(this.root);
  }

  /** The cap's colour (a hex number), instead of the one its label would get. */
  setColor(color: number): void {
    this.pinned = true;
    this.applyColor(color);
    this.paint();
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    if (!this.pinned) this.applyColor(labelColor(text));
    this.paint();
  }

  private applyColor(color: number): void {
    this.color = color;
    this.capMaterial.color.setHex(color);
    this.idle.setHex(color);
    this.lit.setHex(color).lerp(new Color(0xffffff), 0.45);
  }

  /** The face: the cap colour with a soft top highlight, the label in bold white capitals. */
  private paint(): void {
    const canvas = this.faceCanvas;
    const ctx = canvas.getContext('2d')!;
    const c = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fill = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fill.addColorStop(0, shade(this.color, 0.22));
    fill.addColorStop(0.55, shade(this.color, 0));
    fill.addColorStop(1, shade(this.color, -0.12));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
    const label = this.text.toUpperCase();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, label, 900, 66, canvas.width - 46);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillText(label, c, c + 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, c, c + 3);
    this.faceTexture.needsUpdate = true;
  }

  show(shown: boolean): void {
    this.shown = shown;
    if (shown) {
      this.armed = true;
      this.travel = 0;
    }
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /**
   * Moves the cap with any fingertip pushing on it (world positions) and
   * returns true on the frame it clicks. `rayClick` is a ray press that
   * landed on it this frame; the cap dips as if pushed.
   */
  update(dt: number, tips: readonly Vector3[], rayClick: boolean): boolean {
    this.time += dt;
    this.appear += ((this.shown ? 1 : 0) - this.appear) * Math.min(1, dt * 6);
    this.root.visible = this.appear > 0.02;
    if (!this.root.visible) return false;
    const pop = this.shown ? 1 + Math.max(0, 1 - this.appear) * 0.3 : this.appear;
    this.root.scale.setScalar(Math.max(0.001, pop) * this.size);

    let push = 0;
    let near = Infinity;
    if (rayClick) this.travel = TRAVEL;
    this.root.updateWorldMatrix(true, false);
    for (const tip of tips) {
      this.local.copy(tip);
      this.root.worldToLocal(this.local);
      const off = Math.hypot(this.local.x, this.local.y);
      const pad = this.local.z - FINGER_RADIUS;
      near = Math.min(near, Math.hypot(Math.max(0, off - CAP_RADIUS), Math.max(0, pad - CAP_REST)));
      // Only a finger over the cap and not already behind the base pushes it.
      if (off < CAP_RADIUS + FINGER_RADIUS && pad < CAP_REST && this.local.z > -0.01) {
        push = Math.max(push, Math.min(TRAVEL, CAP_REST - pad));
      }
    }

    // The finger drives the cap down directly; the spring only lifts it.
    this.travel = push >= this.travel ? push : this.travel + (push - this.travel) * Math.min(1, dt * SPRING);
    this.placeCap();

    const glow = Math.max(0, 1 - near / 0.08);
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 3);
    this.capMaterial.emissive.copy(this.idle).lerp(this.lit, glow);
    this.capMaterial.emissiveIntensity = 0.18 + 0.12 * breathe + 0.45 * glow;

    let clicked = false;
    if (this.shown && (rayClick || (this.armed && this.travel >= CLICK_AT))) {
      this.armed = false;
      clicked = true;
    } else if (!this.armed && this.travel <= REARM_AT) {
      this.armed = true;
    }
    return clicked;
  }

  private placeCap(): void {
    this.cap.position.z = CAP_REST - CAP_DEPTH / 2 - this.travel;
    this.face.position.z = CAP_REST - this.travel + 0.0005;
  }
}
