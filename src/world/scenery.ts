import { BufferAttribute, Group, Mesh, RingGeometry, Vector3 } from '@iwsdk/core';
import { bambooFrame, fireflies, giantLeafPlant, vine } from './jungle.js';
import { crystals, driftwoodFrame, mineFrame } from './themes.js';
import {
  ground,
  type GroundSpec,
  groundHeight,
  grass,
  type NatureModel,
  organicOutline,
  piece,
  surface,
  water,
} from './nature.js';

/**
 * The worlds, built into your room. Each has three layers:
 * - a slab of real earth with a ragged edge, where friends play (stage space);
 * - the frame the shadow screen hangs in (paper space);
 * - life-size plants on your floor around you (room space, floor at y = 0).
 * Scenery on the slab keeps to the wings and stays low at the back, so the
 * screen and the middle, where friends play, stay clear.
 */
export interface SceneryRoots {
  /** Stage space; the earth's surface is at `floor`. */
  stage: Group;
  floor: number;
  /** Paper space, origin at the screen's centre. */
  screen: Group;
  screenWidth: number;
  screenHeight: number;
  /** Height of the earth's surface in paper space, where the screen's poles stand. */
  screenGround: number;
  /** Room space around the player: floor at y = 0, the player near (0, 0, 1). */
  room: Group;
}

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

function placeAll(root: Group, spec: GroundSpec | null, items: Placement[]): void {
  for (const item of items) {
    const object = piece(item.model, item.node);
    if (!object) continue;
    const y = spec ? groundHeight(spec, item.x, item.z) : 0;
    object.position.set(item.x, y - (item.sink ?? 0.001), item.z);
    object.rotation.y = item.turn ?? 0;
    object.scale.setScalar(item.scale);
    root.add(object);
  }
}

/** A base group at floor height holding the earth and everything on it. */
function base(roots: SceneryRoots, spec: GroundSpec): Group {
  const group = new Group();
  group.name = 'Earth';
  group.position.y = roots.floor;
  group.add(ground(spec));
  roots.stage.add(group);
  return group;
}

/**
 * The slab's outline: wide enough for the screen's poles to stand in it at
 * the back, reaching forward to just in front of the player.
 */
const SLAB = { left: 0.62, right: 0.62, front: 0.28, back: 0.62 };

const SORREL = 'abcdefghijk'.split('').map((c) => `shrub_sorrel_01_${c}`);

/** A loose clump of wood sorrel stems around a point. */
function sorrelClump(x: number, z: number, count: number, seed: number, scale = 1): Placement[] {
  const items: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const a = seed * 2.4 + i * 2.1;
    const r = 0.008 + ((i * 7 + seed) % 5) * 0.005;
    items.push({
      model: 'sorrel',
      node: SORREL[(seed + i * 3) % SORREL.length],
      x: x + Math.cos(a) * r,
      z: z + Math.sin(a) * r,
      scale: scale * (0.85 + ((i + seed) % 3) * 0.12),
      turn: a,
    });
  }
  return items;
}

/** A hanging vine dropping from above: room space, from `top` down `length` metres. */
function hangingVine(x: number, z: number, top: number, length: number, seed: number): Group {
  const points: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    points.push(new Vector3(x + Math.sin(t * 4 + seed) * 0.05, top - t * length, z + Math.cos(t * 3 + seed) * 0.05));
  }
  return vine(points, { leaves: Math.round(length * 40), leafSize: 0.07, stem: 0.004, seed, droop: 0.6 });
}

// ---------------------------------------------------------------- Jungle

export function decorateJungle(roots: SceneryRoots): void {
  const spec: GroundSpec = {
    edge: organicOutline({ ...SLAB, wobble: 0.025, seed: 1.3 }),
    tint: 0xbfcaa8,
    tiles: 3.5,
    relief: 0.0022,
    depth: 0.05,
  };
  const g = base(roots, spec);
  g.add(grass({
    count: 10000, inner: 0.02, outer: 0.7, height: [0.01, 0.034], width: 0.0028,
    edgeBias: 0.5, ground: spec, seed: 3,
  }));

  // Wings: big tropical plants frame the play space on both sides.
  placeAll(g, spec, [
    { model: 'elephantEar', x: -0.47, z: -0.3, scale: 0.34, turn: 0.4 },
    { model: 'anthurium', node: 'anthurium_botany_01_b', x: -0.43, z: 0.02, scale: 0.32, turn: 2.2 },
    { model: 'calathea', node: 'calathea_orbifolia_01_a', x: -0.49, z: 0.17, scale: 0.3, turn: 1.0 },
    { model: 'fern', node: 'fern_02_b', x: -0.33, z: -0.4, scale: 0.2, turn: 0.3 },
    { model: 'anthurium', node: 'anthurium_botany_01_b', x: 0.46, z: -0.3, scale: 0.33, turn: 4.0 },
    { model: 'calathea', node: 'calathea_orbifolia_01_b', x: 0.42, z: 0.08, scale: 0.36, turn: 2.6 },
    { model: 'elephantEar', x: 0.53, z: -0.04, scale: 0.27, turn: 3.3 },
    { model: 'fern', node: 'fern_02_c', x: 0.35, z: 0.19, scale: 0.17, turn: 1.4 },
    { model: 'anthurium', node: 'anthurium_botany_04_d', x: -0.36, z: -0.18, scale: 0.3, turn: 5.1 },
    { model: 'anthurium', node: 'anthurium_botany_05_e', x: 0.34, z: -0.12, scale: 0.34, turn: 0.9 },
    { model: 'calathea', node: 'calathea_orbifolia_01_c', x: 0.54, z: 0.2, scale: 0.3, turn: 4.4 },
    { model: 'fern', node: 'fern_02_d', x: -0.55, z: -0.12, scale: 0.18, turn: 2.8 },
    { model: 'fern', node: 'fern_02_a', x: 0.56, z: -0.24, scale: 0.17, turn: 1.9 },
    { model: 'periwinkle', node: 'periwinkle_plant_03_LOD0', x: -0.35, z: 0.12, scale: 0.4, turn: 3.0 },
    { model: 'periwinkle', node: 'periwinkle_plant_05_LOD0', x: 0.31, z: 0.05, scale: 0.42, turn: 4.0 },
    // Low cover at the back, under the screen.
    { model: 'fern', node: 'fern_02_a', x: -0.18, z: -0.42, scale: 0.12, turn: 2.0 },
    { model: 'fern', node: 'fern_02_d', x: 0.2, z: -0.44, scale: 0.12, turn: 0.6 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: 0.3, z: -0.4, scale: 0.035, turn: 1.2, sink: 0.008 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -0.29, z: 0.22, scale: 0.022, turn: 2.2, sink: 0.005 },
    { model: 'stump', x: -0.05, z: -0.45, scale: 0.06, turn: 0.6, sink: 0.004 },
    // Flowers along the front edge.
    { model: 'periwinkle', node: 'periwinkle_plant_03_LOD0', x: -0.2, z: 0.2, scale: 0.35, turn: 0.4 },
    { model: 'periwinkle', node: 'periwinkle_plant_05_LOD0', x: 0.22, z: 0.21, scale: 0.4, turn: 2.1 },
    { model: 'periwinkle', node: 'periwinkle_plant_06_LOD0', x: 0.05, z: 0.24, scale: 0.4, turn: 1.0 },
    ...sorrelClump(-0.1, 0.22, 5, 1),
    ...sorrelClump(0.3, -0.18, 5, 4),
  ]);
  for (const [x, z, h, s] of [[-0.56, -0.48, 0.34, 2], [0.57, -0.46, 0.3, 7]] as const) {
    const plant = giantLeafPlant(h, 7, s);
    plant.position.set(x, groundHeight(spec, x, z), z);
    g.add(plant);
  }

  roots.screen.add(bambooFrame(roots.screenWidth, roots.screenHeight, roots.screenGround));
  junglePlantsInRoom(roots.room);
}

/**
 * Life-size jungle on your floor: big leaves flank the screen and stand
 * beside and behind you, vines hang from above, fireflies drift about.
 * The view straight ahead to the screen stays open.
 */
function junglePlantsInRoom(room: Group): void {
  placeAll(room, null, [
    { model: 'anthurium', node: 'anthurium_botany_01_b', x: -0.95, z: -0.25, scale: 2.4, turn: 0.5 },
    { model: 'elephantEar', x: -1.3, z: 0.35, scale: 1.8, turn: 1.2 },
    { model: 'anthurium', node: 'anthurium_botany_04_d', x: -1.05, z: 1.15, scale: 2.4, turn: 2.0 },
    { model: 'fern', node: 'fern_02_b', x: -0.85, z: 1.85, scale: 2.0, turn: 0.8 },
    { model: 'elephantEar', x: 1.1, z: 0.05, scale: 2.0, turn: 4.2 },
    { model: 'calathea', node: 'calathea_orbifolia_01_a', x: 1.35, z: 0.75, scale: 2.0, turn: 2.9 },
    { model: 'calathea', node: 'calathea_orbifolia_01_b', x: 1.0, z: 1.35, scale: 2.4, turn: 0.4 },
    { model: 'fern', node: 'fern_02_c', x: 0.9, z: 1.95, scale: 2.0, turn: 3.0 },
    { model: 'elephantEar', x: 0.3, z: 2.25, scale: 1.8, turn: 5.0 },
  ]);
  for (const [x, z, h, s] of [[-0.75, -0.6, 1.8, 3], [0.85, -0.5, 2.0, 5], [-0.45, 2.3, 1.6, 9]] as const) {
    const plant = giantLeafPlant(h, 8, s);
    plant.position.set(x, 0, z);
    room.add(plant);
  }
  room.add(hangingVine(-0.68, 0.15, 2.4, 0.9, 1));
  room.add(hangingVine(0.72, 0.3, 2.4, 1.05, 2));
  room.add(hangingVine(-0.95, 1.35, 2.4, 0.8, 3));
  room.add(hangingVine(0.88, 1.55, 2.4, 0.95, 4));
  room.add(hangingVine(0.15, 1.95, 2.4, 0.7, 5));
  room.add(fireflies(70, new Vector3(-1.5, 0.5, -0.8), new Vector3(1.5, 2.1, 2.3)));
}

// ----------------------------------------------------------------- River

/** The pool sits in the left wing, clear of the puzzles in the middle. */
const POND = { x: -0.38, z: -0.1, r: 0.13 };

/** Flat ground for scattering life-size reeds over the room's floor. */
const FLOOR: GroundSpec = { edge: () => 4, relief: 0 };

export function decorateRiver(roots: SceneryRoots): void {
  const spec: GroundSpec = {
    edge: organicOutline({ ...SLAB, wobble: 0.03, seed: 4.1 }),
    pond: POND,
    tint: 0xd5ded8,
    tiles: 3.5,
  };
  const g = base(roots, spec);

  const pool = water(POND.r * 1.08);
  pool.position.set(POND.x, -0.0045, POND.z);
  g.add(pool);
  g.add(pebbleBank(spec));

  g.add(grass({
    count: 9000, inner: 0.02, outer: 0.7, height: [0.01, 0.03], width: 0.0026,
    edgeBias: 0.5, ground: spec, seed: 8,
    // The pond, and the horse whim's trodden circle and well (see WHIM_AT, WELL_AT).
    avoid: [[POND.x, POND.z, POND.r * 1.25], [0.34, -0.06, 0.19], [-0.06, -0.356, 0.075]],
  }));
  // Reeds crowd the far bank.
  g.add(grass({
    count: 700, inner: POND.r * 1.1, outer: POND.r * 1.6, center: [POND.x, POND.z], height: [0.04, 0.09],
    width: 0.003, ground: spec, seed: 21, avoid: [[POND.x + 0.06, POND.z + 0.12, 0.1]],
  }));
  placeAll(g, spec, [
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: POND.x + 0.13, z: POND.z + 0.05, scale: 0.022, turn: 0.8, sink: 0.006 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: POND.x - 0.03, z: POND.z + 0.14, scale: 0.018, turn: 2.6, sink: 0.005 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: 0.52, z: -0.36, scale: 0.03, turn: 1.6, sink: 0.007 },
    { model: 'fern', node: 'fern_02_b', x: 0.46, z: -0.25, scale: 0.2, turn: 2.4 },
    { model: 'fern', node: 'fern_02_d', x: 0.47, z: 0.1, scale: 0.15, turn: 0.7 },
    { model: 'calathea', node: 'calathea_orbifolia_01_c', x: 0.36, z: 0.18, scale: 0.3, turn: 1.0 },
    { model: 'calathea', node: 'calathea_orbifolia_01_b', x: -0.5, z: 0.15, scale: 0.28, turn: 3.1 },
    { model: 'gazania', node: 'flower_gazania_d_LOD0', x: 0.25, z: 0.2, scale: 0.42, turn: 1.0 },
    { model: 'dandelion', node: 'dandelion_01_c_LOD0', x: -0.25, z: 0.21, scale: 0.45, turn: 3.0 },
    ...sorrelClump(-0.12, 0.23, 6, 2),
    ...sorrelClump(0.55, -0.32, 5, 5),
  ]);
  roots.screen.add(driftwoodFrame(roots.screenWidth, roots.screenHeight, roots.screenGround));
  riverbankInRoom(roots.room);
}

/** Tall reeds and smooth river stones on your floor, and pale moonlit fireflies. */
function riverbankInRoom(room: Group): void {
  const clumps = [[-1.1, 0.35, 160, 1], [1.2, 0.2, 180, 2], [-0.95, 1.6, 140, 3], [1.0, 1.75, 150, 4], [-0.7, -0.55, 120, 5], [0.75, -0.6, 130, 6]] as const;
  for (const [x, z, n, s] of clumps) {
    room.add(grass({ count: n, inner: 0, outer: 0.28, center: [x, z], height: [0.45, 1.15], width: 0.018, ground: FLOOR, seed: s }));
  }
  placeAll(room, null, [
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: -0.8, z: 0.75, scale: 0.18, turn: 0.4, sink: 0.05 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: 0.85, z: 0.95, scale: 0.2, turn: 2.0, sink: 0.05 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -1.3, z: 1.1, scale: 0.15, turn: 1.0, sink: 0.04 },
    { model: 'fern', node: 'fern_02_b', x: 1.35, z: 0.9, scale: 1.8, turn: 3.0 },
    { model: 'calathea', node: 'calathea_orbifolia_01_a', x: -1.35, z: -0.1, scale: 2.0, turn: 0.6 },
  ]);
  room.add(fireflies(50, new Vector3(-1.5, 0.4, -0.8), new Vector3(1.5, 1.9, 2.3), { color: '170,210,255', seed: 8 }));
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

// -------------------------------------------------------------- Mountain

export function decorateMountain(roots: SceneryRoots): void {
  const spec: GroundSpec = {
    edge: organicOutline({ ...SLAB, wobble: 0.045, seed: 7.7 }),
    surface: 'pebbles',
    tint: 0xa8a29c,
    relief: 0.004,
    tiles: 7,
    depth: 0.07,
  };
  const g = base(roots, spec);
  g.add(grass({
    count: 1800, inner: 0.05, outer: 0.7, height: [0.006, 0.016], width: 0.002,
    edgeBias: 0.9, ground: spec, seed: 13,
  }));
  placeAll(g, spec, [
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: -0.45, z: -0.3, scale: 0.08, turn: 0.4, sink: 0.02 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: 0.45, z: -0.28, scale: 0.07, turn: 2.0, sink: 0.018 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: 0.47, z: 0.12, scale: 0.045, turn: 1.1, sink: 0.01 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -0.46, z: 0.14, scale: 0.04, turn: 3.6, sink: 0.008 },
    { model: 'fern', node: 'fern_02_a', x: -0.15, z: -0.44, scale: 0.12, turn: 0.2 },
    { model: 'dandelion', node: 'dandelion_01_d_LOD0', x: 0.15, z: -0.42, scale: 0.45, turn: 1.0 },
  ]);
  const clusters = [[-0.36, -0.2, 0.13, 8, 1], [0.37, -0.18, 0.11, 7, 2], [0.34, 0.2, 0.07, 6, 3], [-0.32, 0.19, 0.06, 5, 4], [-0.5, -0.05, 0.08, 6, 10], [0.52, 0.0, 0.07, 5, 11]] as const;
  for (const [x, z, size, n, s] of clusters) {
    const cluster = crystals(size, n, s);
    cluster.position.set(x, groundHeight(spec, x, z) - 0.004, z);
    g.add(cluster);
  }
  roots.screen.add(mineFrame(roots.screenWidth, roots.screenHeight, roots.screenGround));
  mountainInRoom(roots.room);
}

/** Boulders on your floor, crystal clusters glowing among them, embers rising. */
/**
 * The old mine: the mountain's gravel and timbered entrance, its crystals
 * pushed out to the edges to leave the floor clear for the smithy, embers
 * drifting up as if from a forge.
 */
export function decorateMine(roots: SceneryRoots): void {
  const spec: GroundSpec = {
    edge: organicOutline({ ...SLAB, wobble: 0.04, seed: 5.3 }),
    surface: 'pebbles',
    tint: 0x9c968f,
    relief: 0.003,
    tiles: 7,
    depth: 0.07,
  };
  const g = base(roots, spec);
  g.add(grass({
    count: 1200, inner: 0.05, outer: 0.7, height: [0.006, 0.014], width: 0.002,
    edgeBias: 0.95, ground: spec, seed: 17,
  }));
  placeAll(g, spec, [
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: -0.53, z: -0.4, scale: 0.07, turn: 0.4, sink: 0.02 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: 0.53, z: -0.34, scale: 0.06, turn: 2.0, sink: 0.018 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: 0.52, z: 0.17, scale: 0.04, turn: 1.1, sink: 0.01 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -0.52, z: 0.16, scale: 0.04, turn: 3.6, sink: 0.008 },
    { model: 'fern', node: 'fern_02_a', x: 0.15, z: -0.45, scale: 0.1, turn: 0.2 },
  ]);
  const clusters = [[-0.56, -0.12, 0.09, 7, 21], [0.57, -0.1, 0.08, 6, 22], [-0.42, 0.24, 0.05, 5, 23], [0.45, 0.25, 0.05, 5, 24]] as const;
  for (const [x, z, size, n, s] of clusters) {
    const cluster = crystals(size, n, s, 0xff9b5a);
    cluster.position.set(x, groundHeight(spec, x, z) - 0.004, z);
    g.add(cluster);
  }
  roots.screen.add(mineFrame(roots.screenWidth, roots.screenHeight, roots.screenGround));
  mountainInRoom(roots.room);
}

function mountainInRoom(room: Group): void {
  placeAll(room, null, [
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: -1.15, z: 0.2, scale: 0.42, turn: 0.4, sink: 0.12 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: 1.25, z: 0.4, scale: 0.4, turn: 2.0, sink: 0.12 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: -1.0, z: 1.6, scale: 0.3, turn: 1.1, sink: 0.08 },
    { model: 'rocks', node: 'rock_moss_set_01_rock03', x: 1.05, z: 1.7, scale: 0.28, turn: 3.6, sink: 0.08 },
    { model: 'rocks', node: 'rock_moss_set_01_rock02', x: -0.8, z: -0.7, scale: 0.35, turn: 5.0, sink: 0.1 },
    { model: 'rocks', node: 'rock_moss_set_01_rock06', x: 0.85, z: -0.65, scale: 0.33, turn: 0.8, sink: 0.09 },
  ]);
  const clusters = [[-0.75, 0.55, 0.45, 9, 5], [0.8, 0.75, 0.38, 8, 6], [-0.6, 1.9, 0.3, 6, 7], [0.55, -0.4, 0.5, 9, 8], [1.3, 1.2, 0.25, 5, 9]] as const;
  for (const [x, z, size, n, s] of clusters) {
    const cluster = crystals(size, n, s);
    cluster.position.set(x, 0, z);
    room.add(cluster);
  }
  room.add(fireflies(60, new Vector3(-1.2, 0.2, -0.6), new Vector3(1.2, 2.2, 2.0), { color: '255,140,50', rise: true, size: 0.022, seed: 3 }));
}
