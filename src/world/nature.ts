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
} as const;
export type NatureModel = keyof typeof MODELS;

const SURFACES = ['ground', 'wood', 'velvet', 'pebbles'] as const;
export type Surface = (typeof SURFACES)[number];
const FALLBACK: Record<Surface, number> = { ground: 0x5e6a3c, wood: 0x3a2416, velvet: 0x5a0f14, pebbles: 0x8a8070 };

export const nature = { version: 0 };

const url = (file: string) => `${import.meta.env.BASE_URL}${file}`;
const textures = new Map<string, Texture>();
let loading: Promise<void> | null = null;

/** Starts loading every scenery asset once; resolves when all have arrived (or failed). */
export function preloadNature(): Promise<void> {
  if (loading) return loading;
  const jobs: Array<Promise<unknown>> = [];
  for (const [key, file] of Object.entries(MODELS)) jobs.push(AssetManager.loadGLTF(url(file), `nature-${key}`));
  for (const name of SURFACES) {
    for (const map of ['diff', 'nor', 'rough']) {
      const key = `${name}_${map}`;
      jobs.push(
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
  loading = Promise.allSettled(jobs).then((results) => {
    results.forEach((r) => r.status === 'rejected' && console.warn('Scenery asset failed', r.reason));
    for (const w of waiting.splice(0)) applyTextures(w.material, w.name, w.repeat, w.tint);
    nature.version++;
  });
  return loading;
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

// ---------------------------------------------------------------- Ground

export interface GroundSpec {
  radius: number;
  /** A hollow filled with water: centre and radius on the stage. */
  pond?: { x: number; z: number; r: number };
  /** Multiplies the ground texture: cooler by the pond, greyer on the mountain. */
  tint?: number;
  /** Height of the rolling bumps, in metres. */
  relief?: number;
}

/** Smooth deterministic bumps, so every visit looks the same. */
function bumps(x: number, z: number): number {
  return Math.sin(x * 37.1 + z * 11.3) * 0.5 + Math.sin(x * 13.7 - z * 29.9) * 0.3 + Math.sin(x * 71.3 + z * 53.1) * 0.2;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Height of the ground at a stage point; 0 at the rim, so the edge meets the plinth. */
export function groundHeight(spec: GroundSpec, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const edge = smooth(spec.radius, spec.radius * 0.88, r);
  let h = bumps(x, z) * (spec.relief ?? 0.0018) * edge;
  if (spec.pond) {
    const d = Math.hypot(x - spec.pond.x, z - spec.pond.z) / spec.pond.r;
    // A shallow bowl with a soft bank.
    h -= 0.009 * smooth(1.25, 0.7, d);
  }
  return h;
}

/** The diorama's earth: a gently rolling disc of forest floor (with a pond hollow). */
export function ground(spec: GroundSpec): Mesh {
  const geometry = new RingGeometry(0.002, spec.radius, 160, 36);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as BufferAttribute;
  const uv = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, groundHeight(spec, x, z));
    uv.setXY(i, x / (spec.radius * 2) + 0.5, z / (spec.radius * 2) + 0.5);
  }
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, surface('ground', 2.2, 2.2, spec.tint));
  mesh.name = 'Ground';
  return mesh;
}

// ----------------------------------------------------------------- Grass

/** Shared clock for swaying grass and rippling water. */
const clock = { value: 0 };

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
  for (let tries = 0; n < spec.count && tries < spec.count * 6; tries++) {
    const bias = spec.edgeBias ?? 0;
    const r = spec.inner + (spec.outer - spec.inner) * Math.sqrt(rand()) ** (1 - bias * 0.6);
    const a = rand() * Math.PI * 2;
    const x = (spec.center?.[0] ?? 0) + Math.cos(a) * r;
    const z = (spec.center?.[1] ?? 0) + Math.sin(a) * r;
    if (Math.hypot(x, z) > spec.ground.radius - 0.004) continue;
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
