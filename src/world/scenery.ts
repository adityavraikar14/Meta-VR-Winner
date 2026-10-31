import { BufferAttribute, Group, Mesh, RingGeometry } from '@iwsdk/core';
import { ground, type GroundSpec, groundHeight, grass, type NatureModel, piece, surface, water } from './nature.js';

/**
 * The three worlds as photo-real miniatures: scanned ferns, flowers, rocks
 * and a stump on rolling forest floor, with grass that moves in a breeze.
 * Scenery keeps to the rim and the back so the paper and the middle of the
 * stage, where friends play, stay clear.
 */

/** Radius of the ground inside the plinth's brass ring. */
export const GROUND_RADIUS = 0.238;

interface Placement {
  model: NatureModel;
  node?: string;
  x: number;
  z: number;
  scale: number;
  turn?: number;
  /** Push down into the soil so scans with uneven bases don't float. */
  sink?: number;
}

function placeAll(root: Group, spec: GroundSpec, items: Placement[]): void {
  for (const item of items) {
    const object = piece(item.model, item.node);
    if (!object) continue;
    object.position.set(item.x, groundHeight(spec, item.x, item.z) - (item.sink ?? 0.001), item.z);
    object.rotation.y = item.turn ?? 0;
    object.scale.setScalar(item.scale);
    root.add(object);
  }
}

/** A base group at floor height holding the ground and everything on it. */
function base(root: Group, floor: number, spec: GroundSpec): Group {
  const group = new Group();
  group.name = 'Miniature';
  group.position.y = floor;
  group.add(ground(spec));
  root.add(group);
  return group;
}

const SORREL = 'abcdefghijk'.split('').map((c) => `shrub_sorrel_01_${c}`);

/** A loose clump of wood sorrel stems around a point. */
function sorrelClump(x: number, z: number, count: number, seed: number): Placement[] {
  const items: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const a = seed * 2.4 + i * 2.1;
    const r = 0.006 + ((i * 7 + seed) % 5) * 0.004;
    items.push({
      model: 'sorrel',
      node: SORREL[(seed + i * 3) % SORREL.length],
      x: x + Math.cos(a) * r,
      z: z + Math.sin(a) * r,
      scale: 0.85 + ((i + seed) % 3) * 0.12,
      turn: a,
    });
  }
  return items;
}

export function decorateForest(root: Group, floor: number): void {
  const spec: GroundSpec = { radius: GROUND_RADIUS };
  const g = base(root, floor, spec);
  g.add(grass({
    count: 4800, inner: 0.02, outer: GROUND_RADIUS, height: [0.008, 0.026], width: 0.0022,
    edgeBias: 0.8, ground: spec, seed: 3,
    avoid: [[-0.17, -0.13, 0.04]],
  }));
  placeAll(g, spec, [
    { model: 'stump', x: -0.17, z: -0.13, scale: 0.075, turn: 0.6, sink: 0.004 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: 0.19, z: -0.115, scale: 0.03, turn: 1.2, sink: 0.006 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -0.215, z: 0.07, scale: 0.02, turn: 2.2, sink: 0.004 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: 0.212, z: 0.065, scale: 0.016, turn: 0.4, sink: 0.003 },
    { model: 'fern', node: 'fern_02_b', x: -0.205, z: -0.04, scale: 0.154, turn: 0.3 },
    { model: 'fern', node: 'fern_02_c', x: 0.14, z: -0.175, scale: 0.14, turn: 2.0 },
    { model: 'fern', node: 'fern_02_a', x: 0.225, z: -0.02, scale: 0.126, turn: 4.0 },
    { model: 'fern', node: 'fern_02_d', x: -0.1, z: -0.2, scale: 0.126, turn: 1.0 },
    { model: 'gazania', node: 'flower_gazania_d_LOD0', x: 0.13, z: 0.175, scale: 0.448, turn: 0.5 },
    { model: 'gazania', node: 'flower_gazania_b_LOD0', x: -0.07, z: 0.205, scale: 0.42, turn: 2.5 },
    { model: 'gazania', node: 'flower_gazania_a_LOD0', x: 0.2, z: 0.115, scale: 0.392, turn: 1.4 },
    { model: 'dandelion', node: 'dandelion_01_c_LOD0', x: -0.2, z: 0.13, scale: 0.448, turn: 0.2 },
    { model: 'dandelion', node: 'dandelion_01_e_LOD0', x: 0.05, z: -0.215, scale: 0.42, turn: 1.9 },
    ...sorrelClump(-0.15, 0.17, 6, 1),
    ...sorrelClump(0.18, -0.06, 5, 4),
    ...sorrelClump(0.02, 0.22, 4, 7),
  ]);
}

/** Where the pond sits: back left, clear of the puzzles in the middle. */
const POND = { x: -0.12, z: -0.11, r: 0.068 };

export function decoratePond(root: Group, floor: number): void {
  const spec: GroundSpec = { radius: GROUND_RADIUS, pond: POND, tint: 0xe4ebe6 };
  const g = base(root, floor, spec);

  const pool = water(POND.r * 1.08);
  pool.position.set(POND.x, -0.0045, POND.z);
  g.add(pool);
  g.add(pebbleBank(spec));

  g.add(grass({
    count: 4000, inner: 0.02, outer: GROUND_RADIUS, height: [0.008, 0.024], width: 0.0022,
    edgeBias: 0.7, ground: spec, seed: 8,
    avoid: [[POND.x, POND.z, POND.r * 1.3]],
  }));
  // Reeds crowd the far bank.
  g.add(grass({
    count: 420, inner: POND.r * 1.1, outer: POND.r * 1.55, center: [POND.x, POND.z], height: [0.03, 0.06],
    width: 0.0026, ground: spec, seed: 21, avoid: [[POND.x + 0.03, POND.z + 0.08, 0.06]],
  }));
  placeAll(g, spec, [
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: POND.x + 0.07, z: POND.z + 0.03, scale: 0.014, turn: 0.8, sink: 0.004 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: POND.x - 0.05, z: POND.z + 0.065, scale: 0.012, turn: 2.6, sink: 0.004 },
    { model: 'fern', node: 'fern_02_b', x: 0.2, z: -0.09, scale: 0.154, turn: 2.4 },
    { model: 'fern', node: 'fern_02_d', x: 0.215, z: 0.04, scale: 0.112, turn: 0.7 },
    { model: 'gazania', node: 'flower_gazania_d_LOD0', x: 0.15, z: 0.16, scale: 0.42, turn: 1.0 },
    { model: 'dandelion', node: 'dandelion_01_c_LOD0', x: -0.21, z: 0.08, scale: 0.42, turn: 3.0 },
    ...sorrelClump(-0.17, 0.15, 6, 2),
    ...sorrelClump(0.1, -0.19, 5, 5),
  ]);
}

/** A ring of river pebbles lining the pond, following the dip of the bank. */
function pebbleBank(spec: GroundSpec): Mesh {
  const pond = spec.pond!;
  const geometry = new RingGeometry(pond.r * 0.9, pond.r * 1.22, 64, 3);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + pond.x;
    const z = position.getZ(i) + pond.z;
    position.setY(i, groundHeight(spec, x, z) + 0.0008);
  }
  geometry.computeVertexNormals();
  const material = surface('pebbles', 1.5, 1.5);
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  const mesh = new Mesh(geometry, material);
  mesh.position.set(pond.x, 0, pond.z);
  mesh.name = 'PebbleBank';
  return mesh;
}

export function decorateMountain(root: Group, floor: number): void {
  const spec: GroundSpec = { radius: GROUND_RADIUS, tint: 0xb9b2a8, relief: 0.004 };
  const g = base(root, floor, spec);
  g.add(grass({
    count: 1600, inner: 0.05, outer: GROUND_RADIUS, height: [0.006, 0.016], width: 0.002,
    edgeBias: 0.9, ground: spec, seed: 13,
  }));
  placeAll(g, spec, [
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: -0.18, z: -0.12, scale: 0.05, turn: 0.4, sink: 0.012 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: 0.17, z: -0.14, scale: 0.042, turn: 2.0, sink: 0.01 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: 0.215, z: 0.04, scale: 0.026, turn: 1.1, sink: 0.006 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -0.215, z: 0.06, scale: 0.022, turn: 3.6, sink: 0.005 },
    { model: 'fern', node: 'fern_02_a', x: -0.07, z: -0.21, scale: 0.112, turn: 0.2 },
    { model: 'dandelion', node: 'dandelion_01_d_LOD0', x: 0.06, z: -0.2, scale: 0.42, turn: 1.0 },
  ]);
}
