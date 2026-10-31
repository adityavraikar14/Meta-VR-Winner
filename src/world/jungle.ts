import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { clock, type LeafAtlas, leafBoxes, leafMaterial } from './nature.js';

/**
 * Jungle pieces built in code around photo-scanned leaves: bamboo poles
 * lashed with rope, ivy that climbs and hangs, giant arching leaves, and
 * fireflies drifting through the room.
 */

let seedValue = 1;
function random(): number {
  seedValue = (seedValue * 16807) % 2147483647;
  return seedValue / 2147483647;
}
function seed(value: number): void {
  seedValue = Math.max(1, Math.floor(value * 9973) % 2147483646);
}

// ---------------------------------------------------------------- Bamboo

let bambooMap: CanvasTexture | null = null;

/** One bamboo segment: fibrous cane with a dark node ring at the bottom edge. */
function bambooTexture(): CanvasTexture {
  if (bambooMap) return bambooMap;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const body = ctx.createLinearGradient(0, 0, 64, 0);
  body.addColorStop(0, '#8d8a4a');
  body.addColorStop(0.5, '#b5aa62');
  body.addColorStop(1, '#8a8448');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 64, 256);
  seed(3);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '60,55,25' : '220,210,150'},${0.08 + random() * 0.12})`;
    ctx.fillRect(random() * 64, 0, 1 + random() * 1.5, 256);
  }
  // The node: a dark scar with a pale ridge above it.
  ctx.fillStyle = 'rgba(55,45,20,0.85)';
  ctx.fillRect(0, 244, 64, 8);
  ctx.fillStyle = 'rgba(225,215,160,0.6)';
  ctx.fillRect(0, 238, 64, 4);
  bambooMap = new CanvasTexture(canvas);
  bambooMap.colorSpace = SRGBColorSpace;
  bambooMap.wrapS = bambooMap.wrapT = RepeatWrapping;
  return bambooMap;
}

/** A bamboo cane along +Y from the origin, with a raised ring at each node. */
export function bamboo(length: number, radius: number, segment = 0.11): Group {
  const group = new Group();
  group.name = 'Bamboo';
  const map = bambooTexture().clone();
  const count = Math.max(1, Math.round(length / segment));
  map.repeat.set(1, count);
  map.needsUpdate = true;
  const material = new MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 });
  const cane = new Mesh(new CylinderGeometry(radius * 0.96, radius, length, 18, 1), material);
  cane.position.y = length / 2;
  group.add(cane);
  const ring = new TorusGeometry(radius * 1.0, radius * 0.12, 6, 18);
  ring.rotateX(Math.PI / 2);
  for (let i = 1; i < count; i++) {
    const node = new Mesh(ring, material);
    node.position.y = (i / count) * length - 0.006;
    group.add(node);
  }
  return group;
}

/** A few turns of rope wrapped round a pole or a joint. */
export function lashing(radius: number, turns = 4): Group {
  const group = new Group();
  group.name = 'Lashing';
  const material = new MeshStandardMaterial({ color: 0x6b5236, roughness: 0.95 });
  const coil = new TorusGeometry(radius * 1.12, radius * 0.16, 6, 20);
  coil.rotateX(Math.PI / 2);
  for (let i = 0; i < turns; i++) {
    const turn = new Mesh(coil, material);
    turn.position.y = (i - (turns - 1) / 2) * radius * 0.34;
    turn.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    group.add(turn);
  }
  return group;
}

/**
 * The shadow screen stretched between two bamboo poles planted in the earth,
 * a crossbar lashed across the top and cords tying the corners. Paper space.
 */
export function bambooFrame(width: number, height: number, groundY: number): Group {
  const group = new Group();
  group.name = 'BambooFrame';
  const r = 0.017;
  const poleX = width / 2 + 0.032;
  const top = height / 2 + 0.07;
  for (const side of [-1, 1]) {
    const pole = bamboo(top - groundY + 0.03, r);
    pole.position.set(side * poleX, groundY - 0.03, 0.01);
    group.add(pole);
    const tie = lashing(r);
    tie.position.set(side * poleX, height / 2 + 0.035, 0.01);
    group.add(tie);
    const tieLow = lashing(r, 3);
    tieLow.position.set(side * poleX, -height / 2 + 0.11, 0.01);
    group.add(tieLow);
    // Ivy climbing the pole.
    const climb: Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = t * Math.PI * 3.2 + (side > 0 ? 1 : 0);
      climb.push(new Vector3(side * poleX + Math.cos(a) * r * 1.3, groundY + t * (height * 0.8), 0.01 + Math.sin(a) * r * 1.3));
    }
    group.add(vine(climb, { leaves: 26, leafSize: 0.028, stem: 0.0016, seed: side + 3 }));
  }
  const bar = bamboo(poleX * 2 + 0.08, r * 0.85);
  bar.rotation.z = -Math.PI / 2;
  bar.position.set(-poleX - 0.04, height / 2 + 0.035, 0.03);
  group.add(bar);
  // Ivy trailing along the crossbar and spilling down at one end.
  const drape: Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = -poleX + t * poleX * 1.25;
    drape.push(new Vector3(x, height / 2 + 0.045 - Math.sin(t * Math.PI) * 0.012, 0.045 + Math.sin(t * 9) * 0.006));
  }
  drape.push(new Vector3(poleX * 0.3, height / 2 - 0.04, 0.05), new Vector3(poleX * 0.33, height / 2 - 0.1, 0.05));
  group.add(vine(drape, { leaves: 30, leafSize: 0.026, stem: 0.0015, seed: 11 }));

  // Cords from the screen's corners to the poles.
  const cord = new MeshStandardMaterial({ color: 0x7a6044, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const from = new Vector3(sx * width / 2, sy * height / 2, 0.004);
      const to = new Vector3(sx * poleX, sy * height / 2 + (sy > 0 ? 0.035 : 0.11) - sy * 0.0, 0.01);
      const length = from.distanceTo(to);
      const line = new Mesh(new CylinderGeometry(0.0016, 0.0016, length, 5), cord);
      line.position.copy(from).add(to).multiplyScalar(0.5);
      line.lookAt(to);
      line.rotateX(Math.PI / 2);
      group.add(line);
    }
  }
  return group;
}

// ----------------------------------------------------------------- Vines

export interface VineSpec {
  leaves: number;
  /** Leaf length, in metres. */
  leafSize: number;
  /** Stem radius. */
  stem: number;
  seed: number;
  atlas?: LeafAtlas;
  /** Leaves droop towards the ground (hanging vines) rather than fanning out. */
  droop?: number;
}

/** A stem along the points with photo-scanned leaves along it, all in two draw calls. */
export function vine(points: Vector3[], spec: VineSpec): Group {
  seed(spec.seed);
  const group = new Group();
  group.name = 'Vine';
  const curve = new CatmullRomCurve3(points);
  const stem = new Mesh(
    new TubeGeometry(curve, points.length * 6, spec.stem, 5, false),
    new MeshStandardMaterial({ color: 0x4b4a2a, roughness: 0.9 }),
  );
  group.add(stem);

  const atlas = spec.atlas ?? 'ivy';
  const boxes = leafBoxes(atlas);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  const across = new Vector3();
  const down = new Vector3(0, -1, 0);
  for (let i = 0; i < spec.leaves; i++) {
    const t = (i + 0.3 + random() * 0.4) / spec.leaves;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tangent);
    // Leaves sprout to alternating sides and turn their faces outward.
    side.set(random() - 0.5, random() - 0.5, random() - 0.5).cross(tangent).normalize();
    up.copy(side).addScaledVector(tangent, 0.35).addScaledVector(down, spec.droop ?? 0.25).normalize();
    across.crossVectors(up, tangent).normalize();
    const box = boxes[Math.floor(random() * boxes.length)];
    const size = spec.leafSize * (0.7 + random() * 0.55);
    const aspect = (box[2] - box[0]) / (box[3] - box[1]);
    const half = (size * aspect) / 2;
    const base = positions.length / 3;
    const corners: Array<[number, number, number, number]> = [
      [-half, 0, box[0], box[1]],
      [half, 0, box[2], box[1]],
      [half, size, box[2], box[3]],
      [-half, size, box[0], box[3]],
    ];
    for (const [x, y, u, v] of corners) {
      positions.push(p.x + across.x * x + up.x * y, p.y + across.y * x + up.y * y, p.z + across.z * x + up.z * y);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const leaves = new Mesh(geometry, leafMaterial(atlas));
  leaves.name = 'VineLeaves';
  leaves.userData.shared = true;
  group.add(leaves);
  return group;
}

// ----------------------------------------------------------- Giant leaves

/**
 * A banana-like clump: long leaves on arching stalks, each leaf bent along
 * its length and folded at the midrib, textured with a scanned leaf.
 */
export function giantLeafPlant(height: number, count: number, plantSeed: number): Group {
  seed(plantSeed);
  const group = new Group();
  group.name = 'GiantLeafPlant';
  const box = leafBoxes('leaf')[0];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stalks = new MeshStandardMaterial({ color: 0x5d6b33, roughness: 0.7 });
  const along = 10;
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI * 2 + random() * 0.6;
    const lean = 0.25 + random() * 0.35;
    const stalkLength = height * (0.35 + random() * 0.25);
    const dir = new Vector3(Math.sin(yaw) * Math.sin(lean), Math.cos(lean), Math.cos(yaw) * Math.sin(lean));
    const tip = dir.clone().multiplyScalar(stalkLength);
    const stalk = new Mesh(new CylinderGeometry(height * 0.006, height * 0.012, stalkLength, 6), stalks);
    stalk.position.copy(tip).multiplyScalar(0.5);
    stalk.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    group.add(stalk);

    // The blade continues outward from the stalk tip and arches over.
    const length = height * (0.55 + random() * 0.25);
    const width = length * 0.36;
    const out = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const sideways = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const rise = 0.9 - random() * 0.4;
    const base = positions.length / 3;
    for (let k = 0; k <= along; k++) {
      const t = k / along;
      // Up and out, then curling down: a parabola in the leaf's plane.
      const reach = t * length;
      const lift = Math.sin(t * Math.PI * 0.5) * rise * length * 0.5 - t * t * length * 0.55;
      const centre = tip.clone().addScaledVector(out, reach * 0.95).add(new Vector3(0, lift, 0));
      const fold = width * 0.12 * Math.sin(t * Math.PI);
      for (const s of [-1, 0, 1]) {
        const w = (width / 2) * Math.sin(Math.min(1, t * 1.15 + 0.05) * Math.PI) ** 0.6;
        const point = centre.clone().addScaledVector(sideways, s * w).add(new Vector3(0, s === 0 ? fold : 0, 0));
        positions.push(point.x, point.y, point.z);
        uvs.push(box[0] + ((s + 1) / 2) * (box[2] - box[0]), box[1] + t * (box[3] - box[1]));
      }
      if (k < along) {
        const r = base + k * 3;
        indices.push(r, r + 3, r + 1, r + 1, r + 3, r + 4, r + 1, r + 4, r + 2, r + 2, r + 4, r + 5);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const leaves = new Mesh(geometry, leafMaterial('leaf'));
  leaves.name = 'GiantLeaves';
  leaves.userData.shared = true;
  group.add(leaves);
  return group;
}

// -------------------------------------------------------------- Fireflies

let glow: CanvasTexture | null = null;

function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,200,1)');
  g.addColorStop(0.25, 'rgba(220,240,120,0.7)');
  g.addColorStop(1, 'rgba(160,200,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

/** Fireflies drifting and blinking through a box of space. */
export function fireflies(count: number, min: Vector3, max: Vector3, fireflySeed = 5): Points {
  seed(fireflySeed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = min.x + (max.x - min.x) * random();
    positions[i * 3 + 1] = min.y + (max.y - min.y) * random();
    positions[i * 3 + 2] = min.z + (max.z - min.z) * random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    map: glowTexture(),
    size: 0.03,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = position.x * 13.0 + position.z * 7.0 + position.y * 3.0;
        transformed += vec3(sin(uTime * 0.31 + k), sin(uTime * 0.47 + k * 1.3) * 0.6, cos(uTime * 0.27 + k * 0.7)) * 0.18;`,
      )
      .replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * max(0.0, sin(uTime * 1.3 + k * 2.1)) * (0.6 + 0.4 * sin(uTime * 9.0 + k));',
      );
  };
  const points = new Points(geometry, material);
  points.name = 'Fireflies';
  points.frustumCulled = false;
  return points;
}
