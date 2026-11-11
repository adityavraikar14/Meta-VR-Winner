import { FONT, shade } from '../ui-theme.js';
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
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

/** Each resource's icon on its token. */
const ICONS: Record<Resource, string> = { wood: '🪵', stone: '🪨', iron: '⛓️', herb: '🌿', crystal: '💎', ember: '🔥' };

/**
 * A collectible token: a glossy disc in the resource's colour with a white rim
 * and its icon, standing upright and turning slowly, with a soft ring of
 * light beneath. Clean and readable at a glance, like a game's coin.
 */
function model(resource: Resource): Group {
  const g = new Group();
  const color = RESOURCES[resource].color;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const fill = ctx.createLinearGradient(0, 0, 0, 128);
  fill.addColorStop(0, shade(color, 0.3));
  fill.addColorStop(1, shade(color, -0.15));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `64px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ICONS[resource], 64, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const face = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide });
  const coin = new Mesh(new CircleGeometry(0.017, 40), face);
  coin.position.y = 0.024;
  g.add(coin);
  // The coin's edge: a thin glossy band, so it reads as a solid token from the side.
  const edge = new Mesh(
    new CylinderGeometry(0.0172, 0.0172, 0.004, 40, 1, true),
    new MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.3, emissive: color, emissiveIntensity: 0.25, side: DoubleSide }),
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.024;
  g.add(edge);
  // A soft ring of light on the mat marks it as something to pick up.
  const ring = new Mesh(new RingGeometry(0.014, 0.022, 32), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
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
