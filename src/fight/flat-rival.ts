import { CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Shape, type Vector3 } from '@iwsdk/core';
import { ribbon, silhouette } from './dragon.js';

// ==================================================================== Rival

/**
 * The Rival: a tall shadow puppeteer in a long coat and a wide-brimmed hat
 * with a plume, a giant quill in hand. Draws on the screen, flinches when
 * hit (the hat jumps), raises an ink shield, topples when beaten.
 */
export class FlatRival {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly arm = new Group();
  private readonly hat = new Group();
  private readonly shield: Mesh;
  private readonly shieldMaterial: MeshBasicMaterial;
  private readonly stroke: Mesh;
  private readonly ink: MeshBasicMaterial;
  private time = 0;
  private hurt = 0;
  private shieldTime = 0;
  /** Seconds into drawing a shape (0 = not drawing). */
  drawing = 0;
  /** 0 → 1 as it topples, beaten. */
  fall = 0;

  constructor() {
    this.ink = new MeshBasicMaterial({ color: 0x0b0806, transparent: true, opacity: 0.94, depthWrite: false });
    // Feet on the screen's visible ground line, whatever hill is in front.
    this.root.position.set(0.24, -0.17, 0);
    this.body.position.set(0, 0, 0);
    // Legs, long coat flaring to the knees, shoulders, head.
    const coat = new Shape();
    coat.moveTo(-0.05, 0.08);
    coat.lineTo(-0.035, 0.26);
    coat.quadraticCurveTo(0, 0.285, 0.035, 0.26);
    coat.lineTo(0.06, 0.08);
    coat.quadraticCurveTo(0.0, 0.06, -0.05, 0.08);
    const legs = [ribbon([[-0.02, 0.09], [-0.025, 0.04], [-0.03, 0.0]], [0.012, 0.01, 0.009]), ribbon([[0.02, 0.09], [0.022, 0.04], [0.028, 0.0]], [0.012, 0.01, 0.009])];
    const boots = [ribbon([[-0.032, 0.004], [-0.05, 0.002]], [0.008, 0.006]), ribbon([[0.026, 0.004], [0.045, 0.002]], [0.008, 0.006])];
    const neck = ribbon([[0, 0.27], [0, 0.29]], [0.008, 0.007]);
    const head = new Shape();
    head.absellipse(-0.002, 0.305, 0.017, 0.021, 0, Math.PI * 2, false, 0);
    const nose = new Shape();
    nose.moveTo(-0.015, 0.31);
    nose.lineTo(-0.028, 0.3);
    nose.lineTo(-0.016, 0.296);
    nose.closePath();
    const cape = ribbon([[0.03, 0.26], [0.06, 0.2], [0.075, 0.12], [0.085, 0.09]], [0.012, 0.016, 0.014, 0.008]);
    this.body.add(silhouette([coat, ...legs, ...boots, neck, head, nose, cape], this.ink, 0.004, 3));
    // Hat: wide brim and a crown with a plume.
    const brim = ribbon([[-0.045, 0.322], [0, 0.327], [0.045, 0.322]], [0.004, 0.005, 0.004]);
    const crown = new Shape();
    crown.moveTo(-0.022, 0.324);
    crown.lineTo(-0.018, 0.355);
    crown.quadraticCurveTo(0.0, 0.362, 0.018, 0.355);
    crown.lineTo(0.022, 0.324);
    crown.closePath();
    const plume = ribbon([[0.015, 0.35], [0.04, 0.37], [0.07, 0.36], [0.085, 0.34]], [0.006, 0.008, 0.006, 0.001]);
    this.hat.add(silhouette([brim, crown, plume], this.ink, 0.0045, 4));
    this.body.add(this.hat);
    // The drawing arm with its giant quill, pivoting at the shoulder.
    this.arm.position.set(-0.03, 0.25, 0);
    const sleeve = ribbon([[0, 0], [-0.04, -0.03], [-0.07, 0.0]], [0.011, 0.009, 0.007]);
    const quill = ribbon([[-0.07, 0.0], [-0.1, 0.05], [-0.12, 0.1]], [0.0015, 0.008, 0.003]);
    const nib = ribbon([[-0.072, 0.002], [-0.065, -0.015]], [0.002, 0.0005]);
    this.arm.add(silhouette([sleeve, quill, nib], this.ink, 0.005, 5));
    this.body.add(this.arm);
    this.root.add(this.body);

    // The stroke it is drawing, and its round ink shield.
    this.stroke = new Mesh(new PlaneGeometry(1, 0.008), this.ink);
    this.stroke.position.z = 0.006;
    this.stroke.visible = false;
    this.root.add(this.stroke);
    this.shieldMaterial = new MeshBasicMaterial({ color: 0x1a1428, transparent: true, opacity: 0, depthWrite: false });
    this.shield = new Mesh(new CircleGeometry(0.11, 32), this.shieldMaterial);
    this.shield.position.set(-0.05, 0.2, 0.007);
    this.shield.renderOrder = 6;
    this.root.add(this.shield);
  }

  /** Paper-space point at the quill's nib. */
  quillAt(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(-0.066, -0.012, 0);
    this.arm.localToWorld(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  bodyAt(out: Vector3): Vector3 {
    return out.set(this.root.position.x, this.root.position.y + 0.2, 0);
  }

  /** Does a paper-space point land on the Rival? */
  hit(at: Vector3): boolean {
    const x = at.x - this.root.position.x;
    const y = at.y - this.root.position.y;
    return x > -0.075 && x < 0.1 && y > 0 && y < 0.38;
  }

  shielded(at: Vector3): boolean {
    if (this.shieldTime <= 0) return false;
    const dx = at.x - (this.root.position.x + this.shield.position.x);
    const dy = at.y - (this.root.position.y + this.shield.position.y);
    return Math.hypot(dx, dy) < 0.13;
  }

  raiseShield(seconds: number): void {
    this.shieldTime = seconds;
  }

  flinch(): void {
    this.hurt = 0.7;
  }

  update(dt: number): void {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    const h = this.hurt / 0.7;
    this.body.rotation.z = 0.02 * Math.sin(this.time * 1.4) - 0.12 * h - 1.4 * this.fall;
    this.body.position.x = 0.04 * this.fall;
    // The hat jumps off its head when struck.
    this.hat.position.y = 0.04 * Math.sin(Math.min(1, h * 1.2) * Math.PI);
    this.hat.rotation.z = 0.5 * h;
    // Drawing: the quill sweeps back and forth and an ink line grows.
    const drawing = this.drawing > 0;
    this.arm.rotation.z = drawing ? 0.4 * Math.sin(this.drawing * 12) + 0.3 : 0.1 * Math.sin(this.time * 2) - 0.2 * h;
    this.stroke.visible = drawing;
    if (drawing) {
      const k = Math.min(1, this.drawing / 1.2);
      this.stroke.scale.x = 0.12 * k;
      this.stroke.position.set(-0.15 + 0.06 * k, 0.22 + 0.02 * Math.sin(this.drawing * 12), 0.006);
    }
    this.shieldMaterial.opacity += ((this.shieldTime > 0 ? 0.55 : 0) - this.shieldMaterial.opacity) * Math.min(1, dt * 6);
    this.shield.visible = this.shieldMaterial.opacity > 0.01;
  }
}

