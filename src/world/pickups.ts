import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { playChirp, playTinkle } from '../audio.js';
import { add, RESOURCES, type Resource } from '../bag.js';
import type { HandState } from '../creatures/hand-input.js';
import { type NatureModel, piece, surface } from './nature.js';
import { crystals } from './themes.js';

/**
 * Resources lying about the worlds, glowing softly: touch one with a
 * fingertip (or pinch it) and it pops into your bag. Each world has its own:
 * wood and herbs in the jungle, stone and herbs by the river, iron and
 * crystal in the mine, crystal and embers on the mountain.
 */

const WORLD_RESOURCES: Resource[][] = [
  ['wood', 'herb', 'wood'],
  ['stone', 'herb', 'herb'],
  ['iron', 'crystal', 'iron'],
  ['crystal', 'ember', 'ember'],
];

/** Stage-local spots near the slab's edges, clear of the middle where the puzzles are. */
const SPOTS: Array<[number, number]> = [
  [-0.44, 0.17], [0.46, 0.15], [-0.22, 0.21], [0.24, 0.22], [-0.53, -0.12], [0.54, -0.18],
];

const TOUCH = 0.03;
const PINCH = 0.045;

interface Node {
  resource: Resource;
  group: Group;
  base: Vector3;
  taken: number;
  label: Sprite | null;
}

/** Scales an object so its largest side is `size` metres and stands it on y = 0. */
function fit(object: Object3D, size: number): Object3D {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  if (span > 0) object.scale.multiplyScalar(size / span);
  object.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(object);
  object.position.y -= fitted.min.y;
  return object;
}

/** A scanned piece from the scenery set, if it has loaded. */
function scanned(model: NatureModel, node: string, size: number): Object3D | null {
  const object = piece(model, node);
  if (!object) return null;
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return fit(object, size);
}

/**
 * Each resource as the real thing, about 3 cm across, sitting on the ground:
 * a tied bundle of bark-covered logs, a scanned mossy stone, a lump of iron
 * ore (dark metal, rust in the cracks), a sprig of real herb, a cluster of
 * crystal, and a glowing coal. A soft pulse of light on the ground beneath
 * marks it as something to pick up.
 */
function model(resource: Resource): Group {
  const g = new Group();
  const color = RESOURCES[resource].color;
  switch (resource) {
    case 'wood': {
      const bark = surface('bark', 0.3, 0.6);
      const ends = new MeshStandardMaterial({ color: 0xd2a676, roughness: 0.85 });
      for (const [x, y] of [[-0.0085, 0.008], [0.0085, 0.008], [0, 0.022]] as const) {
        const log = new Mesh(new CylinderGeometry(0.0082, 0.0088, 0.042, 12), [bark, ends, ends]);
        log.rotation.z = Math.PI / 2;
        log.position.set(0, y, x);
        log.castShadow = true;
        g.add(log);
      }
      // A rope tie around the bundle.
      const tie = new Mesh(new TorusGeometry(0.0165, 0.0018, 6, 20), new MeshStandardMaterial({ color: 0xb8925a, roughness: 0.9 }));
      tie.rotation.y = Math.PI / 2;
      tie.position.y = 0.0135;
      tie.scale.set(1, 0.9, 1.05);
      g.add(tie);
      break;
    }
    case 'stone': {
      const rock = scanned('rocks', 'rock_moss_set_01_rock02', 0.032);
      if (rock) g.add(rock);
      else {
        const s = new Mesh(new DodecahedronGeometry(0.014, 1), surface('stone', 0.4));
        s.scale.set(1.2, 0.8, 1);
        s.position.y = 0.011;
        g.add(s);
      }
      break;
    }
    case 'iron': {
      // Ore: a dark, faceted metallic lump with rusty patches.
      const ore = new Mesh(new DodecahedronGeometry(0.0135, 0), new MeshStandardMaterial({ color: 0x4a4f58, metalness: 0.85, roughness: 0.38, flatShading: true }));
      ore.scale.set(1.15, 0.85, 1);
      ore.position.y = 0.011;
      ore.rotation.set(0.4, 0.8, 0.2);
      ore.castShadow = true;
      g.add(ore);
      const rust = new MeshStandardMaterial({ color: 0xa4521e, roughness: 0.9, flatShading: true });
      for (const [x, y, z, r] of [[0.009, 0.017, 0.004, 0.005], [-0.007, 0.013, -0.008, 0.004], [0.002, 0.021, -0.006, 0.0035]] as const) {
        const fleck = new Mesh(new DodecahedronGeometry(r, 0), rust);
        fleck.position.set(x, y, z);
        g.add(fleck);
      }
      break;
    }
    case 'herb': {
      const sprig = scanned('sorrel', 'shrub_sorrel_01_c', 0.04) ?? scanned('fern', 'fern_02_a', 0.04);
      if (sprig) g.add(sprig);
      else {
        const leaf = new MeshStandardMaterial({ color: 0x5f9e34, roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
          const l = new Mesh(new IcosahedronGeometry(0.008, 0), leaf);
          const a = (i / 5) * Math.PI * 2;
          l.scale.set(0.45, 1.4, 0.2);
          l.position.set(Math.cos(a) * 0.006, 0.013, Math.sin(a) * 0.006);
          l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
          g.add(l);
        }
      }
      break;
    }
    case 'crystal':
      g.add(crystals(0.026, 5, 41, color));
      break;
    case 'ember': {
      // A coal: black crust, glowing orange cracks, a warm halo.
      const coal = new Mesh(new DodecahedronGeometry(0.011, 1), new MeshStandardMaterial({ color: 0x241510, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.9, flatShading: true }));
      coal.position.y = 0.01;
      g.add(coal);
      const halo = new Sprite(new SpriteMaterial({ map: glow(), color: 0xff8a2a, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      halo.scale.setScalar(0.06);
      halo.position.y = 0.012;
      halo.raycast = () => {};
      g.add(halo);
      break;
    }
  }
  // A soft pulse of light on the ground marks it as something to pick up.
  const ring = new Mesh(new RingGeometry(0.018, 0.026, 32), new MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  ring.name = 'PickupRing';
  g.add(ring);
  g.traverse((o) => {
    o.userData.keep = true;
  });
  return g;
}

let glowMap: CanvasTexture | null = null;
function glow(): CanvasTexture {
  if (glowMap) return glowMap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowMap = new CanvasTexture(canvas);
  glowMap.colorSpace = SRGBColorSpace;
  return glowMap;
}

function labelSprite(text: string, color: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 33, 61, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 16, 240, 64, 32);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 49);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(0.08, 0.03, 1);
  sprite.renderOrder = 12;
  return sprite;
}

export class Pickups {
  readonly group = new Group();
  private nodes: Node[] = [];
  private time = 0;
  private readonly local = new Vector3();

  constructor(world: number, floor: number, blocked: (x: number, z: number) => boolean) {
    this.group.name = 'Pickups';
    const kinds = WORLD_RESOURCES[world] ?? WORLD_RESOURCES[0];
    let k = 0;
    for (const [x, z] of SPOTS) {
      if (k >= kinds.length) break;
      if (blocked(x, z)) continue;
      const resource = kinds[k++];
      const group = model(resource);
      group.position.set(x, floor, z);
      group.rotation.y = x * 7;
      this.group.add(group);
      this.nodes.push({ resource, group, base: new Vector3(x, floor, z), taken: -1, label: null });
    }
  }

  update(dt: number, hands: readonly HandState[]): void {
    this.time += dt;
    for (const node of this.nodes) {
      if (node.taken < 0) {
        // Idle: a gentle bob and turn.
        node.group.position.y = node.base.y + 0.001 + Math.max(0, Math.sin(this.time * 2 + node.base.x * 9)) * 0.002;
        const ring = node.group.getObjectByName('PickupRing') as Mesh | undefined;
        if (ring) (ring.material as MeshBasicMaterial).opacity = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 3 + node.base.x * 9));
        if (this.touched(node, hands)) this.take(node);
        continue;
      }
      // Taken: pop up, shrink away, the label rises and fades.
      node.taken += dt;
      const k = Math.min(1, node.taken / 0.6);
      node.group.position.y = node.base.y + 0.004 + k * 0.08;
      node.group.scale.setScalar(Math.max(0.001, 1 + 0.4 * Math.sin(k * Math.PI) - k));
      if (node.label) {
        node.label.position.set(node.base.x, node.base.y + 0.06 + node.taken * 0.05, node.base.z);
        (node.label.material as SpriteMaterial).opacity = Math.max(0, 1 - (node.taken - 0.8) / 0.8);
      }
      if (node.taken > 1.7) node.group.visible = false;
    }
  }

  private touched(node: Node, hands: readonly HandState[]): boolean {
    const centre = this.local.copy(node.group.position);
    centre.y += 0.012;
    this.group.localToWorld(centre);
    for (const hand of hands) {
      if (!hand.tracked) continue;
      if (hand.tips.some((tip) => tip.distanceTo(centre) < TOUCH)) return true;
      if (hand.pinchStarted && hand.pinch.distanceTo(centre) < PINCH) return true;
    }
    return false;
  }

  private take(node: Node): void {
    node.taken = 0;
    add(node.resource);
    const info = RESOURCES[node.resource];
    node.label = labelSprite(`+1 ${info.name}`, info.color);
    this.group.add(node.label);
    playTinkle();
    playChirp();
  }
}
