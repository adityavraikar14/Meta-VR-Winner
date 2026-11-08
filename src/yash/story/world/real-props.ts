import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  LineCurve3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafBoxes, leafMaterial, surface } from './nature.js';
import { branch, crystals } from './themes.js';

/**
 * Natural replacements for the old toy props: bark and end grain instead of
 * plush, real leaves from the scanned atlas, glowing crystal instead of a
 * cartoon star. Same footprints as before, so the levels play the same.
 */

let seedValue = 3;
function random(): number {
  seedValue = (seedValue * 16807) % 2147483647;
  return (seedValue - 1) / 2147483646;
}

let endGrain: MeshStandardMaterial | null = null;

/** Sawn or broken end of a log: growth rings, darker heartwood, a few checks. */
function endGrainMaterial(): MeshStandardMaterial {
  if (endGrain) return endGrain;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#b48a5e';
  g.fillRect(0, 0, 128, 128);
  for (let r = 62; r > 2; r -= 3 + (r % 5)) {
    g.strokeStyle = r < 26 ? 'rgba(90,55,30,0.55)' : 'rgba(110,72,40,0.4)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(64 + Math.sin(r) * 1.5, 64, r, r * 0.97, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(50,30,15,0.7)';
  g.lineWidth = 1.5;
  for (const a of [0.4, 2.2, 4.1]) {
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20);
    g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    g.stroke();
  }
  // The bark ring round the edge.
  g.strokeStyle = '#3a2a1c';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 61, 0, Math.PI * 2);
  g.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  endGrain = new MeshStandardMaterial({ map: texture, roughness: 0.95 });
  return endGrain;
}

let barkMaterial: MeshStandardMaterial | null = null;
/** Scanned bark, tiled along a trunk's length. */
function bark(): MeshStandardMaterial {
  return (barkMaterial ??= surface('bark', 3, 2, 0xb0a698));
}

let mossMaterial: MeshStandardMaterial | null = null;
function moss(): MeshStandardMaterial {
  return (mossMaterial ??= new MeshStandardMaterial({ color: 0x55702c, roughness: 1, flatShading: true }));
}

/** Clumps of moss on a surface: squashed lumps, a little ragged. */
function mossClump(at: Vector3, size: number): Mesh {
  const g = new SphereGeometry(size, 7, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (random() - 0.5) * 0.4), p.getY(i) * 0.35, p.getZ(i) * (1 + (random() - 0.5) * 0.4));
  g.computeVertexNormals();
  const mesh = new Mesh(g, moss());
  mesh.position.copy(at);
  return mesh;
}

/** A fallen trunk lying along x: bark, broken ends showing their rings, a stub of a branch, moss. */
export function fallenLog(length: number, radius: number): Group {
  seedValue = 11;
  const g = new Group();
  g.name = 'FallenLog';
  const half = length / 2;
  const trunk = branch([
    new Vector3(-half, radius, 0),
    new Vector3(-half * 0.3, radius * 1.02, radius * 0.08),
    new Vector3(half * 0.4, radius * 0.97, -radius * 0.05),
    new Vector3(half, radius * 0.9, 0),
  ], radius, 0.15, bark());
  g.add(trunk);
  for (const [x, r, turn] of [[-half, radius, -1], [half, radius * 0.86, 1]] as const) {
    const cap = new Mesh(new RingGeometry(0, r * 1.02, 20), endGrainMaterial());
    cap.rotation.y = (turn * Math.PI) / 2;
    cap.position.set(x, x < 0 ? radius : radius * 0.9, 0);
    g.add(cap);
  }
  // A snapped-off branch and a smaller twig.
  g.add(branch([new Vector3(half * 0.2, radius * 1.6, 0), new Vector3(half * 0.32, radius * 2.6, radius * 0.4), new Vector3(half * 0.38, radius * 3.1, radius * 0.7)], radius * 0.28, 0.5, bark()));
  g.add(branch([new Vector3(-half * 0.45, radius * 1.4, -radius * 0.4), new Vector3(-half * 0.6, radius * 2.0, -radius * 1.2)], radius * 0.16, 0.6, bark()));
  for (let i = 0; i < 6; i++) {
    const x = (random() - 0.5) * length * 0.8;
    g.add(mossClump(new Vector3(x, radius * 1.85, (random() - 0.5) * radius * 0.8), radius * (0.35 + random() * 0.3)));
  }
  return g;
}

/** A shard of the Great Lantern: a little cluster of ember crystal and its glow. */
export function emberShard(size: number): { group: Group; glow: MeshBasicMaterial } {
  const g = new Group();
  g.name = 'EmberShard';
  const crystal = crystals(size, 5, 31, 0xff9a3a);
  g.add(crystal);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,220,150,0.9)');
  grad.addColorStop(0.4, 'rgba(255,140,50,0.35)');
  grad.addColorStop(1, 'rgba(255,100,20,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const glow = new MeshBasicMaterial({ map: texture, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const halo = new Mesh(new PlaneGeometry(size * 5, size * 5), glow);
  halo.position.y = size * 0.6;
  halo.userData.keep = true;
  g.add(halo);
  return { group: g, glow };
}

/**
 * Gnarled roots arching over a path that runs along x: three thick roots
 * from one side of the path to the other, rootlets trailing down.
 */
export function gnarledRoots(radius: number): Group {
  seedValue = 23;
  const g = new Group();
  g.name = 'Roots';
  for (const [x, lift, thick, lean] of [[-0.022, 1.05, 0.22, 0.4], [0.004, 1.22, 0.3, -0.25], [0.028, 0.95, 0.18, 0.5], [-0.004, 0.8, 0.13, -0.7]] as const) {
    const points: Vector3[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = Math.PI * t;
      // Knotted and uneven: a root grows towards water, not in a circle.
      const kink = Math.sin(t * 9 + x * 80) * radius * 0.08 + (random() - 0.5) * radius * 0.1;
      const sink = (t < 0.08 || t > 0.92) ? -radius * 0.08 : 0;
      points.push(new Vector3(
        x + kink + Math.sin(a) * lean * radius * 0.2,
        Math.max(0, Math.sin(a) * radius * lift + kink * 0.6) + sink,
        -Math.cos(a) * radius * (1.05 + (random() - 0.5) * 0.15),
      ));
    }
    g.add(branch(points, radius * thick * 0.5, 0.2, bark()));
  }
  // Rootlets hanging from the arch.
  for (let i = 0; i < 7; i++) {
    const z = (random() - 0.5) * radius * 1.4;
    const top = Math.sqrt(Math.max(0, 1 - (z / (radius * 1.05)) ** 2)) * radius * 1.05;
    const x = (random() - 0.5) * 0.04;
    g.add(branch([new Vector3(x, top, z), new Vector3(x + (random() - 0.5) * 0.02, top * 0.75, z + (random() - 0.5) * 0.02), new Vector3(x, top * 0.55, z)], radius * 0.03, 0.8, bark()));
  }
  for (const side of [-1, 1]) g.add(mossClump(new Vector3(0, 0.004, side * radius * 1.05), radius * 0.3));
  return g;
}

/** A hollow log along x, open at both ends: bark outside, dark rotten wood inside. */
export function hollowTrunk(length: number, radius: number): Group {
  const g = new Group();
  g.name = 'HollowLog';
  const path = new LineCurve3(new Vector3(-length / 2, radius, 0), new Vector3(length / 2, radius, 0));
  const outside = new Mesh(new TubeGeometry(path, 8, radius, 18, false), bark());
  g.add(outside);
  const inside = new Mesh(new TubeGeometry(path, 8, radius * 0.82, 18, false), new MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1, side: DoubleSide }));
  g.add(inside);
  for (const x of [-length / 2, length / 2]) {
    const rim = new Mesh(new RingGeometry(radius * 0.82, radius, 20), endGrainMaterial());
    rim.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    rim.position.set(x, radius, 0);
    g.add(rim);
  }
  seedValue = 41;
  for (let i = 0; i < 5; i++) g.add(mossClump(new Vector3((random() - 0.5) * length * 0.8, radius * 1.95, (random() - 0.5) * radius * 0.6), radius * 0.3));
  return g;
}

/** A cluster of leaves from the scanned atlas around a point. */
function leafCluster(at: Vector3, count: number, size: number): Mesh {
  const box = leafBoxes('leaf')[0];
  const quads: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const q = new PlaneGeometry(size * 0.6, size);
    const uv = q.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, box[0] + uv.getX(k) * (box[2] - box[0]), box[1] + uv.getY(k) * (box[3] - box[1]));
    q.translate(0, size / 2, 0);
    q.rotateX(-0.6 - random() * 0.9);
    q.rotateY(random() * Math.PI * 2);
    q.translate(at.x + (random() - 0.5) * size, at.y + (random() - 0.5) * size * 0.5, at.z + (random() - 0.5) * size);
    quads.push(q);
  }
  const mesh = new Mesh(mergeGeometries(quads)!, leafMaterial('leaf'));
  mesh.name = 'Leaves';
  return mesh;
}

/**
 * A young tree with a limb reaching out over the path; a cluster of berries
 * hangs at its tip. Returns the tip so a tall friend can reach it.
 */
export function leafyTree(height: number, reach: number): { group: Group; tip: { x: number; y: number; z: number } } {
  seedValue = 7;
  const g = new Group();
  g.name = 'Tree';
  const trunkTop = new Vector3(0.006, height, -0.004);
  g.add(branch([new Vector3(0, 0, 0), new Vector3(0.004, height * 0.4, 0.002), new Vector3(-0.003, height * 0.75, -0.002), trunkTop], 0.016, 0.6, bark()));
  // Root flare.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    g.add(branch([new Vector3(0, 0.02, 0), new Vector3(Math.cos(a) * 0.025, 0.004, Math.sin(a) * 0.025)], 0.008, 0.7));
  }
  const y = height * 0.62;
  const tip = new Vector3(0, y + Math.sin(0.15) * reach, reach);
  g.add(branch([new Vector3(0, y - 0.01, 0), new Vector3(0, y + 0.005, reach * 0.5), tip], 0.006, 0.6));
  for (const [x, yy, z] of [[0.05, height * 0.82, -0.02], [-0.045, height * 0.7, -0.03], [0.02, height * 0.95, 0.02]] as const) {
    g.add(branch([new Vector3(0, yy - 0.04, 0), new Vector3(x * 0.6, yy - 0.01, z * 0.6), new Vector3(x, yy, z)], 0.005, 0.6));
    g.add(leafCluster(new Vector3(x, yy + 0.005, z), 18, 0.03));
  }
  g.add(leafCluster(trunkTop, 26, 0.034));
  g.add(leafCluster(new Vector3(0, tip.y + 0.008, reach * 0.6), 10, 0.026));
  g.add(leafCluster(new Vector3(0, tip.y + 0.01, reach * 0.95), 8, 0.024));
  return { group: g, tip: { x: tip.x, y: tip.y, z: tip.z } };
}

/** Three woodland mushrooms with pale stems and fluted caps; the caps can glow. */
export function glowCaps(size: number, color: number): { group: Group; cap: MeshStandardMaterial } {
  seedValue = 17;
  const g = new Group();
  g.name = 'GlowCaps';
  const stemMaterial = new MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.85 });
  const cap = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.7), roughness: 0.55, emissive: color, emissiveIntensity: 0, side: DoubleSide });
  const gills = new MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.9, side: DoubleSide });
  for (const [x, z, s, lean] of [[0, 0, 1, 0.05], [0.018, 0.012, 0.7, -0.2], [-0.014, 0.014, 0.55, 0.25]] as const) {
    const h = size * s;
    const one = new Group();
    const stem = new Mesh(new LatheGeometry([new Vector2(h * 0.14, 0), new Vector2(h * 0.1, h * 0.4), new Vector2(h * 0.09, h * 0.8), new Vector2(0, h * 0.82)], 10), stemMaterial);
    one.add(stem);
    const dome = new Mesh(new LatheGeometry([new Vector2(h * 0.52, h * 0.8), new Vector2(h * 0.45, h * 0.94), new Vector2(h * 0.25, h * 1.08), new Vector2(0.0001, h * 1.12)], 18), cap);
    one.add(dome);
    const under = new Mesh(new CylinderGeometry(h * 0.52, h * 0.1, h * 0.04, 18, 1, true), gills);
    under.position.y = h * 0.8;
    one.add(under);
    one.position.set(x, 0, z);
    one.rotation.z = lean;
    g.add(one);
  }
  return { group: g, cap };
}
