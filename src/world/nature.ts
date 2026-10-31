import {
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from '@iwsdk/core';

/**
 * Photo-real scenery from Poly Haven (CC0): scanned plants and rocks, plus
 * PBR ground, wood, velvet and pebble textures. Everything loads in the
 * background; `nature.version` bumps when it arrives so the diorama can
 * swap its stand-ins for the real thing.
 */
const MODELS = {
  fern: 'gltf/nature/fern.glb',
  rocks: 'gltf/nature/rocks.glb',
  stump: 'gltf/nature/stump.glb',
  dandelion: 'gltf/nature/dandelion.glb',
  sorrel: 'gltf/nature/sorrel.glb',
  gazania: 'gltf/nature/gazania.glb',
  lantern: 'gltf/nature/lantern.glb',
  anthurium: 'gltf/nature/anthurium.glb',
  calathea: 'gltf/nature/calathea.glb',
  elephantEar: 'gltf/nature/elephant_ear.glb',
  periwinkle: 'gltf/nature/periwinkle.glb',
} as const;
export type NatureModel = keyof typeof MODELS;

const SURFACES = ['ground', 'wood', 'velvet', 'pebbles', 'soil'] as const;
export type Surface = (typeof SURFACES)[number];
const FALLBACK: Record<Surface, number> = {
  ground: 0x5e6a3c,
  wood: 0x3a2416,
  velvet: 0x5a0f14,
  pebbles: 0x8a8070,
  soil: 0x4a3524,
};

/**
 * Photo-scanned leaves with cut-out masks (ambientCG, CC0), for vines and
 * giant leaves. Each box is one leaf in the atlas: u0, v0, u1, v1.
 */
const ATLASES = {
  ivy: [
    [0.051, 0.676, 0.379, 0.984],
    [0.621, 0.688, 0.871, 0.945],
    [0.066, 0.324, 0.402, 0.629],
    [0.629, 0.363, 0.906, 0.605],
    [0.594, 0.023, 0.898, 0.309],
    [0.047, 0.016, 0.43, 0.305],
  ],
  leaf: [
    [0.051, 0.141, 0.457, 0.895],
    [0.547, 0.137, 0.953, 0.891],
  ],
} as const;
export type LeafAtlas = keyof typeof ATLASES;
export type LeafBox = readonly [number, number, number, number];
export function leafBoxes(atlas: LeafAtlas): readonly LeafBox[] {
  return ATLASES[atlas];
}

export const nature = { version: 0 };

const url = (file: string) => `${import.meta.env.BASE_URL}${file}`;
const textures = new Map<string, Texture>();
let loading: Promise<void> | null = null;

/** One asset to fetch, and what to do with it once it arrives. */
type Job = () => Promise<unknown>;

/** Tries each failed asset again a few times, waiting longer between rounds. */
const RETRY_DELAYS = [2000, 6000];

/**
 * Starts loading every scenery asset once; resolves when all have arrived,
 * or have failed even after retries (the world then keeps its stand-ins).
 */
export function preloadNature(): Promise<void> {
  if (loading) return loading;
  const jobs: Job[] = [];
  for (const [key, file] of Object.entries(MODELS)) jobs.push(() => AssetManager.loadGLTF(url(file), `nature-${key}`));
  for (const name of SURFACES) {
    for (const map of ['diff', 'nor', 'rough']) {
      const key = `${name}_${map}`;
      jobs.push(() =>
        AssetManager.loadTexture(url(`textures/${key}.jpg`), `tex-${key}`).then((texture) => {
          if (map === 'diff') texture.colorSpace = SRGBColorSpace;
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.anisotropy = 4;
          texture.needsUpdate = true;
          textures.set(key, texture);
        }),
      );
    }
  }
  for (const atlas of Object.keys(ATLASES)) {
    jobs.push(
      () =>
        AssetManager.loadTexture(url(`textures/${atlas}.png`), `tex-${atlas}`).then((texture) => {
          texture.colorSpace = SRGBColorSpace;
          textures.set(atlas, texture);
        }),
      () =>
        AssetManager.loadTexture(url(`textures/${atlas}_nor.jpg`), `tex-${atlas}-nor`).then((texture) => {
          textures.set(`${atlas}_nor`, texture);
        }),
    );
  }
  loading = runWithRetries(jobs).then(() => {
    for (const w of waiting.splice(0)) applyTextures(w.material, w.name, w.repeat, w.tint);
    for (const [atlas, material] of leafMaterials) fillLeaf(material, atlas);
    nature.version++;
  });
  return loading;
}

/** At most this many downloads and decodes at once, to spare the headset's memory. */
const PARALLEL = 3;

/** Runs every job, a few at a time, and reports how each one ended. */
async function settleAll(jobs: Job[]): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await jobs[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
  return results;
}

async function runWithRetries(jobs: Job[]): Promise<void> {
  let pending = jobs;
  for (let round = 0; pending.length > 0; round++) {
    const results = await settleAll(pending);
    const failed = pending.filter((_, i) => results[i].status === 'rejected');
    if (failed.length === 0 || round >= RETRY_DELAYS.length) {
      results.forEach((r) => r.status === 'rejected' && console.warn('Scenery asset failed', r.reason));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[round]));
    pending = failed;
  }
}

/**
 * A copy of one scanned piece (a named node, or the whole model), wrapped so
 * its origin is on the ground. Geometry and materials are shared with the
 * cache, so they are flagged for the diorama not to dispose.
 */
export function piece(model: NatureModel, node?: string): Object3D | null {
  const gltf = AssetManager.getGLTF(`nature-${model}`);
  if (!gltf) return null;
  let part: Object3D = gltf.scene;
  if (node) {
    const found = gltf.scene.getObjectByName(node);
    if (!found) return null;
    found.removeFromParent();
    found.position.set(0, 0, 0);
    part = found;
  }
  part.traverse((o) => {
    if ((o as Mesh).isMesh) o.userData.shared = true;
  });
  const holder = new Group();
  holder.name = node ?? model;
  holder.add(part);
  return holder;
}

/** Materials made before their textures arrived, to be filled in once they do. */
const waiting: Array<{ material: MeshStandardMaterial; name: Surface; repeat: [number, number]; tint: number }> = [];

/**
 * A tiling PBR material for one of the surfaces, repeated across its UVs.
 * Made before the textures load, it shows a plain matching colour and
 * picks up the textures when they arrive.
 */
export function surface(name: Surface, repeatX: number, repeatY = repeatX, tint = 0xffffff): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0 });
  if (!applyTextures(material, name, [repeatX, repeatY], tint)) {
    material.color.multiply(new Color(FALLBACK[name]));
    waiting.push({ material, name, repeat: [repeatX, repeatY], tint });
  }
  return material;
}

function applyTextures(material: MeshStandardMaterial, name: Surface, repeat: [number, number], tint: number): boolean {
  const take = (map: string) => {
    const texture = textures.get(`${name}_${map}`)?.clone();
    if (texture) {
      texture.repeat.set(repeat[0], repeat[1]);
      texture.needsUpdate = true;
    }
    return texture ?? null;
  };
  const map = take('diff');
  if (!map) return false;
  material.map = map;
  material.normalMap = take('nor');
  material.roughnessMap = take('rough');
  material.color.setHex(tint);
  material.needsUpdate = true;
  return true;
}

const leafMaterials = new Map<LeafAtlas, MeshStandardMaterial>();

/** Cut-out leaf material for an atlas: both faces lit, crisp edges from the mask. */
export function leafMaterial(atlas: LeafAtlas): MeshStandardMaterial {
  let material = leafMaterials.get(atlas);
  if (!material) {
    material = new MeshStandardMaterial({ color: 0x4f6b2c, side: DoubleSide, alphaTest: 0.5, roughness: 0.6, metalness: 0 });
    leafMaterials.set(atlas, material);
    fillLeaf(material, atlas);
  }
  return material;
}

function fillLeaf(material: MeshStandardMaterial, atlas: LeafAtlas): void {
  const map = textures.get(atlas);
  if (!map || material.map) return;
  material.map = map;
  material.normalMap = textures.get(`${atlas}_nor`) ?? null;
  material.color.setHex(0xffffff);
  material.needsUpdate = true;
}

// ---------------------------------------------------------------- Ground

export interface GroundSpec {
  /** Distance from the centre to the edge, by angle atan2(z, x). */
  edge: (angle: number) => number;
  /** Ground texture (forest floor by default) and how often it tiles per metre. */
  surface?: Surface;
  tiles?: number;
  /** A hollow filled with water: centre and radius on the stage. */
  pond?: { x: number; z: number; r: number };
  /** Multiplies the ground texture: cooler by the pond, greyer on the mountain. */
  tint?: number;
  /** Height of the rolling bumps, in metres. */
  relief?: number;
  /** Thickness of the slab of earth under the edge, in metres. */
  depth?: number;
}

export interface OutlineSpec {
  left: number;
  right: number;
  front: number;
  back: number;
  /** How ragged the edge is, in metres. */
  wobble: number;
  seed: number;
}

/** A natural, uneven outline: a rounded rectangle with a ragged, eroded edge. */
export function organicOutline(o: OutlineSpec): (angle: number) => number {
  return (a) => {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const ax = c >= 0 ? o.right : o.left;
    const az = sn >= 0 ? o.front : o.back;
    const n = 3.2;
    const r = 1 / ((Math.abs(c) / ax) ** n + (Math.abs(sn) / az) ** n) ** (1 / n);
    const k = o.seed;
    const ragged = Math.sin(3 * a + k) * 0.5 + Math.sin(7 * a + k * 2.3) * 0.3 + Math.sin(17 * a + k * 0.7) * 0.2;
    return r + ragged * o.wobble;
  };
}

/** Smooth deterministic bumps, so every visit looks the same. */
function bumps(x: number, z: number): number {
  return Math.sin(x * 37.1 + z * 11.3) * 0.5 + Math.sin(x * 13.7 - z * 29.9) * 0.3 + Math.sin(x * 71.3 + z * 53.1) * 0.2;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** True if a stage point lies on the ground, `margin` metres in from the edge. */
export function onGround(spec: GroundSpec, x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) < spec.edge(Math.atan2(z, x)) - margin;
}

/** Height of the ground at a stage point; it rolls over at the lip like a real bank of earth. */
export function groundHeight(spec: GroundSpec, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const e = spec.edge(Math.atan2(z, x));
  const inside = smooth(e, e - 0.035, r);
  let h = bumps(x, z) * (spec.relief ?? 0.0018) * inside - 0.006 * (1 - inside);
  if (spec.pond) {
    const d = Math.hypot(x - spec.pond.x, z - spec.pond.z) / spec.pond.r;
    // A shallow bowl with a soft bank.
    h -= 0.009 * smooth(1.25, 0.7, d);
  }
  return h;
}

/** The world's earth: rolling ground on a thick, eroded slab with an uneven outline. */
export function ground(spec: GroundSpec): Group {
  const group = new Group();
  group.name = 'Earth';
  const tiles = spec.tiles ?? 4;
  const geometry = new RingGeometry(0.001, 1, 200, 40);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as BufferAttribute;
  const uv = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const ux = position.getX(i);
    const uz = position.getZ(i);
    const e = spec.edge(Math.atan2(uz, ux));
    const x = ux * e;
    const z = uz * e;
    position.setXYZ(i, x, groundHeight(spec, x, z), z);
    uv.setXY(i, x, z);
  }
  geometry.computeVertexNormals();
  const top = new Mesh(geometry, surface(spec.surface ?? 'ground', tiles, tiles, spec.tint));
  top.name = 'Ground';
  group.add(top);
  group.add(earthSide(spec));
  return group;
}

/**
 * The cut face of the earth all round the edge: soil that bulges out a
 * little below the lip, then tucks under, with an uneven bottom.
 */
function earthSide(spec: GroundSpec): Mesh {
  const around = 240;
  const rows = 6;
  const depth = spec.depth ?? 0.045;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let perimeter = 0;
  let px = 0;
  let pz = 0;
  for (let i = 0; i <= around; i++) {
    const a = (i / around) * Math.PI * 2;
    const e = spec.edge(a);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const x0 = cx * e;
    const z0 = cz * e;
    if (i > 0) perimeter += Math.hypot(x0 - px, z0 - pz);
    px = x0;
    pz = z0;
    const bottom = depth * (0.75 + 0.25 * (Math.sin(a * 5 + 1) * 0.6 + Math.sin(a * 13) * 0.4));
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const bulge = Math.sin(t * Math.PI) * 0.006 - t * t * 0.02;
      const r = e + bulge;
      const y = groundHeight(spec, x0, z0) * (1 - t) - bottom * t;
      positions.push(cx * r, y, cz * r);
      uvs.push(perimeter * 6, -y * 6);
    }
  }
  for (let i = 0; i < around; i++) {
    for (let k = 0; k < rows; k++) {
      const a = i * (rows + 1) + k;
      const b = a + rows + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = surface('soil', 1, 1, 0xb8a898);
  material.side = DoubleSide;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'EarthSide';
  return mesh;
}

// ----------------------------------------------------------------- Grass

/** Shared clock for swaying grass, rippling water and drifting fireflies. */
export const clock = { value: 0 };

/** One blade: a tapered, slightly bent strip, 1 unit tall. Colour runs dark root → sunlit tip. */
function bladeGeometry(): BufferGeometry {
  const rows = 4;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const root = new Color(0x1c2e12);
  const tip = new Color(0x7d9a47);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const half = 0.5 * (1 - t) ** 0.8;
    const bend = t * t * 0.25;
    positions.push(-half, t, bend, half, t, bend);
    const c = root.clone().lerp(tip, t);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < rows) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

let bladeMaterial: MeshStandardMaterial | null = null;

/** Grass that bends in a light breeze: tips sway, roots stay put. */
function grassMaterial(): MeshStandardMaterial {
  if (bladeMaterial) return bladeMaterial;
  const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gust = sin(uTime * 1.3 + root.x * 23.0 + root.z * 17.0) + 0.5 * sin(uTime * 2.9 + root.x * 61.0);
        transformed.z += gust * 0.09 * position.y * position.y;
        transformed.x += gust * 0.04 * position.y * position.y;`,
      );
  };
  bladeMaterial = material;
  return material;
}

export interface GrassSpec {
  count: number;
  /** Ring to cover, around `center` (the stage centre by default). */
  inner: number;
  outer: number;
  center?: [number, number];
  /** Blade height range and width, in metres. */
  height: [number, number];
  width: number;
  /** Places to leave bare: centre x, z and radius. */
  avoid?: Array<[number, number, number]>;
  /** Thicker towards the rim, sparser in the middle where friends walk. */
  edgeBias?: number;
  ground: GroundSpec;
  seed?: number;
}

/** Thousands of blades in one draw call. */
export function grass(spec: GrassSpec): InstancedMesh {
  const mesh = new InstancedMesh(bladeGeometry(), grassMaterial(), spec.count);
  mesh.name = 'Grass';
  mesh.userData.shared = true;
  let seed = spec.seed ?? 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const axis = new Vector3();
  const tint = new Color();
  let n = 0;
  for (let tries = 0; n < spec.count && tries < spec.count * 12; tries++) {
    const bias = spec.edgeBias ?? 0;
    const r = spec.inner + (spec.outer - spec.inner) * Math.sqrt(rand()) ** (1 - bias * 0.6);
    const a = rand() * Math.PI * 2;
    const x = (spec.center?.[0] ?? 0) + Math.cos(a) * r;
    const z = (spec.center?.[1] ?? 0) + Math.sin(a) * r;
    if (!onGround(spec.ground, x, z, 0.008)) continue;
    if (spec.avoid?.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    // Clumps: skip some spots so the cover is patchy, as real grass is.
    if (bumps(x * 1.7 + 3, z * 1.7) < -0.35) continue;
    const h = spec.height[0] + (spec.height[1] - spec.height[0]) * rand();
    p.set(x, groundHeight(spec.ground, x, z) - 0.0005, z);
    axis.set(rand() - 0.5, 0, rand() - 0.5).normalize();
    q.setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2);
    q.multiply(new Quaternion().setFromAxisAngle(axis, (rand() - 0.5) * 0.5));
    s.set(spec.width * (0.7 + rand() * 0.6), h, spec.width);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    tint.setHSL(0.2 + rand() * 0.06, 0.35 + rand() * 0.2, 0.75 + rand() * 0.35);
    mesh.setColorAt(n, tint);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // The blades sway outside their rest bounds; the stage is always in view.
  mesh.frustumCulled = false;
  return mesh;
}

// ----------------------------------------------------------------- Water

let ripples: CanvasTexture | null = null;

/** A tileable normal map of overlapping ripples, drawn once. */
function rippleTexture(): CanvasTexture {
  if (ripples) return ripples;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const waves: Array<[number, number, number, number]> = [];
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    // Whole-number wave vectors keep the texture tileable.
    const kx = Math.round((rand() - 0.5) * 16);
    const ky = Math.round((rand() - 0.5) * 16);
    waves.push([kx, ky, rand() * Math.PI * 2, 1 / (1 + Math.hypot(kx, ky))]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, phase, amp] of waves) {
        const c = Math.cos(((kx * x + ky * y) / size) * Math.PI * 2 + phase) * amp;
        dx += c * kx;
        dy += c * ky;
      }
      const nx = -dx * 0.08;
      const ny = -dy * 0.08;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      image.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ripples = new CanvasTexture(canvas);
  ripples.wrapS = ripples.wrapT = RepeatWrapping;
  return ripples;
}

const waters: MeshStandardMaterial[] = [];

/** Still pond water: dark, glassy, reflecting the room, with slow drifting ripples. */
export function water(radius: number): Mesh {
  const normalMap = rippleTexture().clone();
  normalMap.repeat.set(3, 3);
  normalMap.needsUpdate = true;
  const material = new MeshStandardMaterial({
    color: 0x24423f,
    roughness: 0.03,
    metalness: 0,
    normalMap,
    envMapIntensity: 1.8,
    transparent: true,
    opacity: 0.9,
  });
  material.normalScale.set(0.3, 0.3);
  waters.push(material);
  const mesh = new Mesh(new CircleGeometry(radius, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'Water';
  return mesh;
}

/** Advance the breeze and the ripples. */
export function animateNature(dt: number): void {
  clock.value += dt;
  for (let i = waters.length - 1; i >= 0; i--) {
    const material = waters[i];
    if (!material.normalMap) {
      waters.splice(i, 1);
      continue;
    }
    material.normalMap.offset.x += dt * 0.012;
    material.normalMap.offset.y += dt * 0.007;
  }
}

/** Forget water materials that the diorama has thrown away. */
export function forgetWater(material: MeshStandardMaterial): void {
  const i = waters.indexOf(material);
  if (i >= 0) waters.splice(i, 1);
}
