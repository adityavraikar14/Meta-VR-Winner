import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playChirp, playTinkle } from '../audio.js';
import { add, RESOURCES, type Resource } from '../bag.js';
import type { HandState } from '../creatures/hand-input.js';
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

function model(resource: Resource): Group {
  const g = new Group();
  const color = RESOURCES[resource].color;
  switch (resource) {
    case 'wood': {
      // A short split log, end grain showing.
      const log = new Mesh(new CylinderGeometry(0.011, 0.012, 0.04, 9), new MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.9 }));
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.012;
      g.add(log);
      break;
    }
    case 'stone': {
      const s = new Mesh(new DodecahedronGeometry(0.014, 0), new MeshStandardMaterial({ color: 0xa8a29a, roughness: 0.85, flatShading: true }));
      s.scale.set(1.2, 0.8, 1);
      s.position.y = 0.011;
      g.add(s);
      break;
    }
    case 'iron': {
      const s = new Mesh(new DodecahedronGeometry(0.012, 0), new MeshStandardMaterial({ color: 0x6d7480, metalness: 0.8, roughness: 0.35, flatShading: true }));
      s.position.y = 0.01;
      g.add(s);
      const fleck = new Mesh(new DodecahedronGeometry(0.006, 0), new MeshStandardMaterial({ color: 0xb87333, metalness: 0.7, roughness: 0.4, flatShading: true }));
      fleck.position.set(0.008, 0.016, 0.004);
      g.add(fleck);
      break;
    }
    case 'herb': {
      const leaf = new MeshStandardMaterial({ color: 0x5f9e34, roughness: 0.7 });
      for (let i = 0; i < 5; i++) {
        const l = new Mesh(new IcosahedronGeometry(0.008, 0), leaf);
        const a = (i / 5) * Math.PI * 2;
        l.scale.set(0.45, 1.4, 0.2);
        l.position.set(Math.cos(a) * 0.006, 0.013, Math.sin(a) * 0.006);
        l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
        g.add(l);
      }
      break;
    }
    case 'crystal':
      g.add(crystals(0.022, 4, 41, color));
      break;
    case 'ember': {
      const e = new Mesh(new IcosahedronGeometry(0.01, 1), new MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff7a20, emissiveIntensity: 2.2, roughness: 0.8 }));
      e.position.y = 0.011;
      g.add(e);
      break;
    }
  }
  // A soft ring of light on the ground marks it as something to pick up.
  const ring = new Mesh(new RingGeometry(0.016, 0.024, 24), new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  ring.name = 'PickupRing';
  g.add(ring);
  g.traverse((o) => {
    o.userData.keep = true;
  });
  return g;
}

function labelSprite(text: string, color: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(40, 22, 10, 0.85)';
  ctx.beginPath();
  ctx.roundRect(8, 16, 240, 64, 32);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffe2a8';
  ctx.font = '700 36px Georgia, serif';
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
        node.group.position.y = node.base.y + 0.004 + Math.sin(this.time * 2 + node.base.x * 9) * 0.003;
        node.group.rotation.y += dt * 0.6;
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
