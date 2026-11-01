import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The Shadow Dragon: a jointed shadow puppet cut from black card, in the
 * style of Lotte Reiniger's silhouette films, filling the screen. Every
 * part is a flat silhouette on its own pivot: body, neck, head, hinged
 * jaw, two bat wings with finger bones and thin membranes, legs, tail.
 * An ember burns in its chest and its eye; those are where it can be hurt.
 * Units are paper metres; +x right, +y up, the puppet sits just in front.
 */

/** A tapered ribbon along a smooth centreline, as a closed outline. */
export function ribbon(points: Array<[number, number]>, widths: number[], samples = 28): Shape {
  const curve = new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x, y, 0)));
  const left: Vector2[] = [];
  const right: Vector2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const d = curve.getTangentAt(t);
    const f = t * (widths.length - 1);
    const k = Math.min(widths.length - 2, Math.floor(f));
    const w = widths[k] + (widths[k + 1] - widths[k]) * (f - k);
    left.push(new Vector2(p.x - d.y * w, p.y + d.x * w));
    right.push(new Vector2(p.x + d.y * w, p.y - d.x * w));
  }
  const shape = new Shape(left);
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y);
  shape.closePath();
  return shape;
}

/** A row of spikes standing up along a centreline (dorsal ridge, teeth). */
export function spikes(points: Array<[number, number]>, count: number, height: number, side: 1 | -1, lean = 0.3): Shape[] {
  const curve = new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x, y, 0)));
  const out: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = curve.getPointAt(t);
    const d = curve.getTangentAt(t);
    const n = new Vector2(-d.y * side, d.x * side);
    const h = height * (0.6 + 0.4 * Math.sin(t * Math.PI));
    const base = (0.6 / count) * curve.getLength();
    const s = new Shape();
    s.moveTo(p.x - d.x * base, p.y - d.y * base);
    s.lineTo(p.x + n.x * h + d.x * h * lean, p.y + n.y * h + d.y * h * lean);
    s.lineTo(p.x + d.x * base * 0.6, p.y + d.y * base * 0.6);
    s.closePath();
    out.push(s);
  }
  return out;
}

export function silhouette(shapes: Shape[], material: MeshBasicMaterial, z: number, order: number): Mesh {
  const geometry = mergeGeometries(shapes.map((s) => new ShapeGeometry(s, 10)))!;
  const mesh = new Mesh(geometry, material);
  mesh.position.z = z;
  mesh.renderOrder = order;
  return mesh;
}

export function glowTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class ShadowDragon {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly neck = new Group();
  private readonly head = new Group();
  private readonly jaw = new Group();
  private readonly tail = new Group();
  private readonly nearWing = new Group();
  private readonly farWing = new Group();
  private readonly frontLeg = new Group();
  private readonly backLeg = new Group();
  private readonly heart: Mesh;
  private readonly eye: Mesh;
  private readonly breath: Mesh;
  private readonly ink: MeshBasicMaterial;
  private readonly membrane: MeshBasicMaterial;
  private readonly farInk: MeshBasicMaterial;
  private readonly heartMaterial: MeshBasicMaterial;
  private readonly eyeMaterial: MeshBasicMaterial;
  private readonly breathMaterial: MeshBasicMaterial;
  private time = 0;
  /** 0 → 1 as it draws breath; the jaw opens and the throat glows. */
  windup = 0;
  /** Seconds left of a flinch after being hit. */
  private hurt = 0;
  /** 0 → 1 as it is undone by light at the end. */
  defeat = 0;

  constructor() {
    this.root.name = 'ShadowDragon';
    this.ink = new MeshBasicMaterial({ color: 0x0b0806, transparent: true, opacity: 0.94, depthWrite: false });
    this.membrane = new MeshBasicMaterial({ color: 0x0b0806, transparent: true, opacity: 0.72, depthWrite: false });
    this.farInk = new MeshBasicMaterial({ color: 0x1a1512, transparent: true, opacity: 0.55, depthWrite: false });

    // ---- Body, with a ridge of spikes along the back.
    this.body.position.set(0.05, -0.1, 0);
    const spine: Array<[number, number]> = [[-0.15, 0.0], [-0.05, -0.01], [0.08, -0.005], [0.19, 0.0]];
    this.body.add(silhouette([ribbon(spine, [0.05, 0.075, 0.07, 0.045]), ...spikes([[-0.13, 0.055], [-0.02, 0.07], [0.1, 0.062], [0.18, 0.04]], 7, 0.03, 1, 0.5)], this.ink, 0.004, 3));

    // ---- Legs: a front leg and a heavier back leg, three talons each.
    this.frontLeg.position.set(-0.08, -0.04, 0);
    this.frontLeg.add(silhouette([
      ribbon([[0, 0], [-0.025, -0.08], [0.0, -0.15], [-0.01, -0.16]], [0.028, 0.016, 0.012, 0.01]),
      ...[-1, 0, 1].map((i) => ribbon([[-0.01, -0.158], [-0.03 + i * 0.012, -0.168], [-0.045 + i * 0.014, -0.162]], [0.005, 0.003, 0.0005], 8)),
    ], this.ink, 0.0035, 2));
    this.body.add(this.frontLeg);
    this.backLeg.position.set(0.12, -0.03, 0);
    this.backLeg.add(silhouette([
      ribbon([[0, 0], [0.035, -0.07], [-0.01, -0.13], [0.01, -0.185]], [0.045, 0.022, 0.012, 0.01]),
      ...[-1, 0, 1].map((i) => ribbon([[0.01, -0.183], [-0.015 + i * 0.012, -0.193], [-0.03 + i * 0.014, -0.188]], [0.005, 0.003, 0.0005], 8)),
    ], this.ink, 0.0035, 2));
    this.body.add(this.backLeg);

    // ---- Tail: a long S that ends in a spade.
    this.tail.position.set(0.18, 0.0, 0);
    const tailLine: Array<[number, number]> = [[0, 0], [0.07, -0.03], [0.13, -0.08], [0.19, -0.07], [0.24, -0.1]];
    const spade = new Shape();
    spade.moveTo(0.235, -0.095);
    spade.lineTo(0.26, -0.08);
    spade.lineTo(0.285, -0.115);
    spade.lineTo(0.25, -0.125);
    spade.closePath();
    this.tail.add(silhouette([ribbon(tailLine, [0.032, 0.022, 0.014, 0.008, 0.004]), spade, ...spikes(tailLine.map(([x, y]) => [x, y + 0.012] as [number, number]), 6, 0.016, 1, 0.6)], this.ink, 0.003, 2));
    this.body.add(this.tail);

    // ---- Neck rising to the head, ridged along its back.
    this.neck.position.set(-0.14, 0.02, 0);
    const neckLine: Array<[number, number]> = [[0, 0], [-0.05, 0.06], [-0.08, 0.13], [-0.1, 0.19]];
    this.neck.add(silhouette([ribbon(neckLine, [0.042, 0.033, 0.027, 0.021]), ...spikes(neckLine.map(([x, y]) => [x + 0.018, y + 0.008] as [number, number]), 5, 0.022, -1, 0.5)], this.ink, 0.005, 4));
    this.body.add(this.neck);

    // ---- Head: brow, snout, swept horns, teeth; the jaw hinges below.
    this.head.position.set(-0.1, 0.19, 0);
    const skull = new Shape();
    skull.moveTo(0.025, 0.012);
    skull.bezierCurveTo(0.01, 0.035, -0.04, 0.034, -0.06, 0.02);
    skull.bezierCurveTo(-0.085, 0.012, -0.11, 0.008, -0.125, -0.002);
    skull.lineTo(-0.128, -0.012);
    skull.bezierCurveTo(-0.1, -0.016, -0.05, -0.014, 0.0, -0.016);
    skull.bezierCurveTo(0.02, -0.018, 0.03, -0.004, 0.025, 0.012);
    const horns = [
      ribbon([[0.0, 0.026], [0.035, 0.05], [0.078, 0.066]], [0.008, 0.005, 0.0006], 14),
      ribbon([[-0.012, 0.028], [0.015, 0.045], [0.05, 0.05]], [0.006, 0.004, 0.0006], 14),
    ];
    const upperTeeth = Array.from({ length: 6 }, (_, i) => {
      const x = -0.112 + i * 0.016;
      const s = new Shape();
      s.moveTo(x, -0.013);
      s.lineTo(x + 0.004, -0.024);
      s.lineTo(x + 0.008, -0.014);
      s.closePath();
      return s;
    });
    this.head.add(silhouette([skull, ...horns, ...upperTeeth], this.ink, 0.006, 5));
    this.jaw.position.set(0.0, -0.014, 0);
    const jawShape = new Shape();
    jawShape.moveTo(0.004, 0.002);
    jawShape.lineTo(-0.1, -0.002);
    jawShape.lineTo(-0.106, -0.01);
    jawShape.bezierCurveTo(-0.07, -0.018, -0.03, -0.02, 0.006, -0.012);
    jawShape.closePath();
    const lowerTeeth = Array.from({ length: 5 }, (_, i) => {
      const x = -0.095 + i * 0.017;
      const s = new Shape();
      s.moveTo(x, -0.001);
      s.lineTo(x + 0.004, 0.009);
      s.lineTo(x + 0.008, -0.001);
      s.closePath();
      return s;
    });
    this.jaw.add(silhouette([jawShape, ...lowerTeeth], this.ink, 0.0058, 5));
    this.head.add(this.jaw);
    // The eye: a slit of ember.
    this.eyeMaterial = new MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false });
    const eyeShape = new Shape();
    eyeShape.moveTo(-0.052, 0.012);
    eyeShape.quadraticCurveTo(-0.04, 0.019, -0.028, 0.013);
    eyeShape.quadraticCurveTo(-0.04, 0.009, -0.052, 0.012);
    this.eye = new Mesh(new ShapeGeometry(eyeShape, 8), this.eyeMaterial);
    this.eye.position.z = 0.0065;
    this.eye.renderOrder = 6;
    this.head.add(this.eye);
    // Fire gathering in the throat.
    this.breathMaterial = new MeshBasicMaterial({ map: glowTexture('rgba(255,250,210,1)', 'rgba(255,120,30,0.7)'), transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.breath = new Mesh(new PlaneGeometry(0.16, 0.16), this.breathMaterial);
    this.breath.position.set(-0.115, -0.018, 0.007);
    this.breath.renderOrder = 7;
    this.head.add(this.breath);
    this.neck.add(this.head);

    // ---- Wings: arm and four long fingers, membrane scalloped between them.
    for (const [wing, material, bones, z, order, scale] of [
      [this.farWing, this.farInk, this.farInk, 0.001, 1, 0.86],
      [this.nearWing, this.membrane, this.ink, 0.007, 7, 1],
    ] as const) {
      const wrist: [number, number] = [0.11, 0.19];
      const tips: Array<[number, number]> = [[0.36, 0.25], [0.37, 0.1], [0.3, -0.02], [0.18, -0.07]];
      const web = new Shape();
      web.moveTo(0, 0);
      web.quadraticCurveTo(0.03, 0.12, wrist[0], wrist[1]);
      web.lineTo(tips[0][0], tips[0][1]);
      for (let i = 1; i < tips.length; i++) {
        const a = tips[i - 1];
        const b = tips[i];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        web.quadraticCurveTo(mx + (wrist[0] - mx) * 0.32, my + (wrist[1] - my) * 0.32, b[0], b[1]);
      }
      web.quadraticCurveTo(0.15, -0.04, 0.12, -0.08);
      web.lineTo(0.02, -0.02);
      web.closePath();
      wing.add(silhouette([web], material, z, order));
      const boneShapes = [
        ribbon([[0, 0], [0.03, 0.11], wrist], [0.009, 0.007, 0.006], 14),
        ...tips.map((tip) => ribbon([wrist, [(wrist[0] + tip[0]) / 2, (wrist[1] + tip[1]) / 2 + 0.015], tip], [0.005, 0.003, 0.0008], 14)),
        ribbon([wrist, [0.1, 0.215], [0.085, 0.225]], [0.004, 0.003, 0.0005], 8),
      ];
      wing.add(silhouette(boneShapes, bones, z + 0.0004, order));
      wing.scale.setScalar(scale);
    }
    this.farWing.position.set(0.02, 0.06, 0);
    this.nearWing.position.set(-0.02, 0.05, 0);
    this.body.add(this.farWing, this.nearWing);

    // ---- The ember heart, glowing through the chest.
    this.heartMaterial = new MeshBasicMaterial({ map: glowTexture('rgba(255,240,180,1)', 'rgba(255,90,20,0.75)'), transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.heart = new Mesh(new PlaneGeometry(0.09, 0.09), this.heartMaterial);
    this.heart.position.set(-0.07, -0.01, 0.0065);
    this.heart.renderOrder = 6;
    this.body.add(this.heart);

    this.root.add(this.body);
  }

  /** Paper-space centre of the head and of the heart, for hits. */
  headAt(out: Vector3): Vector3 {
    return this.paperPoint(this.head, -0.05, 0.004, out);
  }

  heartAt(out: Vector3): Vector3 {
    return this.paperPoint(this.body, -0.07, -0.01, out);
  }

  /** Where fire leaves the mouth, in the root's parent space. */
  mouthAt(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(-0.115, -0.018, 0.01);
    this.head.localToWorld(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  private paperPoint(part: Group, x: number, y: number, out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(x, y, 0);
    part.localToWorld(out);
    return this.root.worldToLocal(out);
  }

  /** A blow lands: it flinches, the ember flares white. */
  flinch(): void {
    this.hurt = 0.8;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.hurt = Math.max(0, this.hurt - dt);
    const h = this.hurt / 0.8;

    // Breathing, swaying, wings beating slowly; drawing breath pulls the head back.
    const breathe = Math.sin(t * 2.2);
    this.body.scale.set(1, 1 + 0.015 * breathe, 1);
    this.body.position.x = 0.05 + h * 0.03 * Math.sin(t * 40) + 0.03 * this.defeat;
    this.body.rotation.z = -0.08 * h + 0.25 * this.defeat;
    this.neck.rotation.z = 0.05 * Math.sin(t * 0.9) - 0.12 * this.windup + 0.18 * h;
    this.head.rotation.z = 0.06 * Math.sin(t * 1.3 + 1) + 0.1 * this.windup - 0.15 * h;
    this.jaw.rotation.z = 0.04 + 0.42 * this.windup + 0.5 * h + 0.03 * Math.max(0, breathe);
    const flap = Math.sin(t * 2.6);
    this.nearWing.rotation.z = 0.12 * flap - 0.15 * this.defeat;
    this.nearWing.scale.y = 1 + 0.08 * flap;
    this.farWing.rotation.z = 0.1 * Math.sin(t * 2.6 - 0.4);
    this.tail.rotation.z = 0.06 * Math.sin(t * 1.1);
    this.frontLeg.rotation.z = 0.04 * Math.sin(t * 0.7);

    // The ember: a slow pulse, white-hot when struck.
    const pulse = 0.75 + 0.25 * Math.sin(t * 3.1);
    this.heartMaterial.opacity = (pulse + h) * (1 - this.defeat);
    this.heart.scale.setScalar(1 + 0.6 * h + 0.3 * this.windup);
    this.eyeMaterial.color.setRGB(1, 0.62 + 0.38 * h, 0.25 + 0.75 * h);
    this.breath.visible = this.windup > 0.02;
    this.breathMaterial.opacity = this.windup;
    this.breath.scale.setScalar(0.3 + this.windup * 0.9);

    // At the end the shadow thins away into the light.
    const fade = 1 - this.defeat;
    this.ink.opacity = 0.94 * fade;
    this.membrane.opacity = 0.72 * fade;
    this.farInk.opacity = 0.55 * fade;
    this.eyeMaterial.opacity = fade;
  }
}
