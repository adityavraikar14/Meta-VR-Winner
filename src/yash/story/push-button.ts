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

const IDLE = new Color(0xffb84a);
const LIT = new Color(0xffe08a);

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
  private appear = 0;
  private shown = false;
  private time = 0;
  private local = new Vector3();

  constructor(parent: Object3D, text: string) {
    this.root.name = 'PushButton';
    this.root.visible = false;

    const base = new Mesh(
      new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.08, BASE_DEPTH, 48),
      new MeshStandardMaterial({ color: 0x6e4122, roughness: 0.8 }),
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

  setText(text: string): void {
    const canvas = this.faceCanvas;
    const ctx = canvas.getContext('2d')!;
    const c = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(c, c * 0.8, 10, c, c, c);
    glow.addColorStop(0, '#ffe7a6');
    glow.addColorStop(1, '#f4a43c');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a250c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${text.length > 5 ? 46 : 64}px Georgia, "Times New Roman", serif`;
    ctx.fillText(text, c, c + 4, canvas.width - 40);
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
    this.capMaterial.emissive.copy(IDLE).lerp(LIT, glow);
    this.capMaterial.emissiveIntensity = 0.25 + 0.2 * breathe + 0.45 * glow;

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
