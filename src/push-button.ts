import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';

const BASE_RADIUS = 0.046;
const BASE_DEPTH = 0.016;
const CAP_RADIUS = 0.035;
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

const IDLE = new Color(0xffb84a);
const LIT = new Color(0xffe08a);

/**
 * A chunky round button you push with a fingertip. The cap follows the
 * finger down, clicks near the bottom of its travel and springs back up,
 * so it feels like a real switch rather than a hover target.
 */
export class PushButton {
  readonly root = new Group();
  private cap: Mesh;
  private capMaterial: MeshStandardMaterial;
  private label: Mesh;
  private labelCanvas: HTMLCanvasElement;
  private labelTexture: CanvasTexture;
  private travel = 0;
  private armed = true;
  private appear = 0;
  private shown = false;
  private time = 0;
  private local = new Vector3();

  constructor(parent: Object3D, text: string) {
    this.root.name = 'PushButton';
    this.root.visible = false;

    const base = new Mesh(
      new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.08, BASE_DEPTH, 40),
      new MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.8 }),
    );
    base.rotation.x = Math.PI / 2;
    base.position.z = BASE_DEPTH / 2;
    this.root.add(base);

    this.capMaterial = new MeshStandardMaterial({
      color: 0xf2a33a,
      roughness: 0.45,
      emissive: IDLE.clone(),
      emissiveIntensity: 0.35,
    });
    this.cap = new Mesh(new CylinderGeometry(CAP_RADIUS * 0.92, CAP_RADIUS, CAP_DEPTH, 40), this.capMaterial);
    this.cap.rotation.x = Math.PI / 2;
    this.root.add(this.cap);

    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 160;
    this.labelTexture = new CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = SRGBColorSpace;
    this.label = new Mesh(
      new PlaneGeometry(0.15, 0.047),
      new MeshBasicMaterial({ map: this.labelTexture, transparent: true, depthWrite: false }),
    );
    this.label.position.set(0, BASE_RADIUS + 0.034, 0.004);
    this.root.add(this.label);
    this.setText(text);
    this.placeCap();
    parent.add(this.root);
  }

  setText(text: string): void {
    const canvas = this.labelCanvas;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(40, 22, 10, 0.86)';
    const r = 70;
    ctx.beginPath();
    ctx.moveTo(r, 6);
    ctx.arcTo(canvas.width - 6, 6, canvas.width - 6, canvas.height - 6, r);
    ctx.arcTo(canvas.width - 6, canvas.height - 6, 6, canvas.height - 6, r);
    ctx.arcTo(6, canvas.height - 6, 6, 6, r);
    ctx.arcTo(6, 6, canvas.width - 6, 6, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe2a8';
    ctx.font = '700 84px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4, canvas.width - 60);
    this.labelTexture.needsUpdate = true;
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
   * returns true on the frame it clicks.
   */
  update(dt: number, tips: readonly Vector3[]): boolean {
    this.time += dt;
    this.appear += ((this.shown ? 1 : 0) - this.appear) * Math.min(1, dt * 6);
    this.root.visible = this.appear > 0.02;
    if (!this.root.visible) return false;
    const pop = this.shown ? 1 + Math.max(0, 1 - this.appear) * 0.3 : this.appear;
    this.root.scale.setScalar(Math.max(0.001, pop));

    let push = 0;
    let near = Infinity;
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
    this.capMaterial.emissive.copy(IDLE).lerp(LIT, glow);
    this.capMaterial.emissiveIntensity = 0.25 + 0.2 * breathe + 0.45 * glow;

    let clicked = false;
    if (this.shown && this.armed && this.travel >= CLICK_AT) {
      this.armed = false;
      clicked = true;
    } else if (!this.armed && this.travel <= REARM_AT) {
      this.armed = true;
    }
    return clicked;
  }

  private placeCap(): void {
    this.cap.position.z = CAP_REST - CAP_DEPTH / 2 - this.travel;
  }
}
