import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lashing, screenCords, vine } from './jungle.js';
import { piece, surface } from './nature.js';

/**
 * Screen frames and room pieces for the river and mountain worlds:
 * crooked driftwood tied with rope, a timber mine entrance with a hanging
 * lantern, and clusters of glowing crystal.
 */

let seedValue = 1;
function random(): number {
  seedValue = (seedValue * 16807) % 2147483647;
  return seedValue / 2147483647;
}

// ------------------------------------------------------------- Driftwood

/** A crooked, tapering branch through the points, in weathered grey wood. */
export function branch(points: Vector3[], radius: number, taper = 0.4, material?: MeshStandardMaterial): Mesh {
  const curve = new CatmullRomCurve3(points);
  const tubular = 28;
  const radial = 9;
  const geometry = new TubeGeometry(curve, tubular, radius, radial, false);
  const position = geometry.attributes.position as BufferAttribute;
  const centre = new Vector3();
  const v = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, centre);
    const k = 1 - taper * t;
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      v.fromBufferAttribute(position, index).sub(centre).multiplyScalar(k).add(centre);
      position.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material ?? surface('wood', 4, 1, 0xa39a90));
  mesh.name = 'Branch';
  return mesh;
}

/** The screen hung between two crooked driftwood branches, mossy and roped. Paper space. */
export function driftwoodFrame(width: number, height: number, groundY: number): Group {
  const group = new Group();
  group.name = 'DriftwoodFrame';
  const poleX = width / 2 + 0.04;
  const top = height / 2 + 0.1;
  for (const side of [-1, 1]) {
    const x = side * poleX;
    group.add(branch([
      new Vector3(x - side * 0.01, groundY - 0.03, 0.01),
      new Vector3(x + side * 0.012, groundY + (top - groundY) * 0.3, 0.02),
      new Vector3(x - side * 0.008, groundY + (top - groundY) * 0.65, 0.0),
      new Vector3(x + side * 0.015, top, 0.012),
    ], 0.02, 0.35));
    const tie = lashing(0.018);
    tie.position.set(x, height / 2 + 0.035, 0.012);
    group.add(tie);
  }
  group.add(branch([
    new Vector3(-poleX - 0.08, height / 2 + 0.05, 0.03),
    new Vector3(-poleX * 0.3, height / 2 + 0.03, 0.035),
    new Vector3(poleX * 0.4, height / 2 + 0.032, 0.03),
    new Vector3(poleX + 0.07, height / 2 + 0.046, 0.026),
  ], 0.015, 0.3));
  // Strands of moss hanging from the crossbar.
  for (const [x, length, s] of [[-0.42, 0.14, 21], [-0.12, 0.09, 22], [0.25, 0.16, 23], [0.47, 0.11, 24]] as const) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      points.push(new Vector3(x + Math.sin(t * 3 + s) * 0.01, height / 2 + 0.03 - t * length, 0.04));
    }
    group.add(vine(points, { leaves: Math.round(length * 120), leafSize: 0.018, stem: 0.0012, seed: s, droop: 0.8 }));
  }
  group.add(screenCords(width, height, poleX, height / 2 + 0.035, -height / 2 + 0.1));
  return group;
}

// ----------------------------------------------------------- Mine timber

/**
 * A timber mine entrance around the screen: two posts with braces, a heavy
 * lintel, and an old wooden lantern hanging from it, glowing. Paper space.
 */
export function mineFrame(width: number, height: number, groundY: number): Group {
  const group = new Group();
  group.name = 'MineFrame';
  const timber = surface('wood', 1, 1, 0xb7a796);
  const beam = (w: number, h: number, d: number, x: number, y: number, z: number, roll = 0) => {
    const geometry = new BoxGeometry(w, h, d);
    const uv = geometry.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, h) * 3, uv.getY(i) * Math.min(w, h) * 3);
    const mesh = new Mesh(geometry, timber);
    mesh.position.set(x, y, z);
    mesh.rotation.z = roll;
    group.add(mesh);
    return mesh;
  };
  const postX = width / 2 + 0.04;
  const top = height / 2 + 0.05;
  for (const side of [-1, 1]) {
    beam(0.05, top - groundY + 0.03, 0.05, side * postX, (top + groundY) / 2 - 0.015, 0.02);
    // A diagonal brace under the lintel.
    beam(0.026, 0.16, 0.03, side * (postX - 0.07), top - 0.06, 0.03, side * 0.75);
    const base = piece('rocks', 'rock_moss_set_01_rock03');
    if (base) {
      base.scale.setScalar(0.045);
      base.position.set(side * (postX + 0.02), groundY - 0.01, 0.03);
      base.rotation.y = side;
      group.add(base);
    }
  }
  beam(postX * 2 + 0.16, 0.06, 0.06, 0, top + 0.03, 0.025);

  const lantern = piece('lantern');
  if (lantern) {
    // Hung off the end of the lintel, clear of the paper. The scan's handle tops out at 0.52 m.
    const scale = 0.42;
    const x = -(postX + 0.055);
    const hang = top - 0.52 * scale - 0.012;
    lantern.scale.setScalar(scale);
    lantern.position.set(x, hang, 0.05);
    group.add(lantern);
    const chain = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.016, 5), new MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.5 }));
    chain.position.set(x, top - 0.006, 0.05);
    group.add(chain);
    // Its flame: a warm glow inside the glass.
    const glow = new Mesh(
      new PlaneGeometry(0.14, 0.14),
      new MeshBasicMaterial({ map: flameGlow(), transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    glow.position.set(x, hang + 0.17 * scale, 0.055);
    glow.renderOrder = 4;
    group.add(glow);
  }
  return group;
}

let flame: CanvasTexture | null = null;

function flameGlow(): CanvasTexture {
  if (flame) return flame;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 34, 0, 32, 34, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.2, 'rgba(255,190,90,0.8)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  flame = new CanvasTexture(canvas);
  flame.colorSpace = SRGBColorSpace;
  return flame;
}

// --------------------------------------------------------------- Crystals

const crystalMaterials = new Map<number, MeshStandardMaterial>();

/** Translucent crystal that glows from within. */
function crystalMaterial(color: number): MeshStandardMaterial {
  let material = crystalMaterials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
    });
    crystalMaterials.set(color, material);
  }
  return material;
}

/**
 * A cluster of six-sided crystals leaning out from a common root, `size`
 * metres tall at the biggest point. One mesh per cluster.
 */
export function crystals(size: number, count: number, seed: number, color = 0x9b7bff): Mesh {
  seedValue = Math.max(1, Math.floor(seed * 7919) % 2147483646);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const h = size * (0.35 + random() * 0.65) * (i === 0 ? 1.4 : 1);
    const r = h * (0.12 + random() * 0.06);
    const body = new CylinderGeometry(r, r * 1.05, h, 6);
    body.translate(0, h / 2, 0);
    const tip = new ConeGeometry(r, r * 2.2, 6);
    tip.translate(0, h + r * 1.1, 0);
    const prism = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
    prism.rotateZ((random() - 0.5) * 1.1);
    prism.rotateX((random() - 0.5) * 1.1);
    prism.rotateY(random() * Math.PI * 2);
    prism.translate((random() - 0.5) * size * 0.25, 0, (random() - 0.5) * size * 0.25);
    parts.push(prism);
  }
  const mesh = new Mesh(mergeGeometries(parts)!, crystalMaterial(color));
  mesh.geometry.computeVertexNormals();
  mesh.name = 'Crystals';
  return mesh;
}
