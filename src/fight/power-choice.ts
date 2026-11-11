import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playClick, playTinkle } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions } from '../dev-tools.js';

/**
 * Before the Shadow Dragon: choose how to fight it. Two stones float over
 * the stage, and you touch and hold one with a fingertip until its ring
 * fills. Light is the story's own magic (signs for an orb of light, a fist
 * for a sword of light, an open palm that mirrors fire back). The Arsenal is
 * Yash's: hold an invisible ball to arm, then sign for one of seven weapons.
 */

export type Power = 'light' | 'arsenal';

/** A fingertip this close to a stone's centre is touching it (stage space, metres). */
const TOUCH = 0.05;
/** Seconds of touch to choose, so a hand passing by doesn't. */
const HOLD = 0.6;
const STONE = 0.032;

interface Stone {
  power: Power;
  root: Group;
  gem: Mesh;
  ring: Mesh;
  ringMaterial: MeshBasicMaterial;
  held: number;
  home: Vector3;
}

const STONES: { power: Power; x: number; color: number; glow: string; title: string; sub: string }[] = [
  { power: 'light', x: -0.12, color: 0xbfe4ff, glow: 'rgba(170,220,255,0.9)', title: '✨ Light', sub: 'Signs · sword of light · mirror palm' },
  { power: 'arsenal', x: 0.12, color: 0xffb35a, glow: 'rgba(255,180,90,0.9)', title: '⚔️ The Arsenal', sub: 'Arm, then sign: seven weapons' },
];

export class PowerChoice {
  readonly group = new Group();
  caption = 'Choose your powers: touch and hold a stone';
  private stones: Stone[] = [];
  private time = 0;
  private picked: Power | null = null;
  private v = new Vector3();
  private headWorld = new Vector3();

  constructor(floor: number) {
    for (const spec of STONES) {
      const root = new Group();
      const home = new Vector3(spec.x, floor + 0.1, 0.2);
      root.position.copy(home);
      const geometry = spec.power === 'light' ? new IcosahedronGeometry(STONE, 0) : new OctahedronGeometry(STONE * 1.1, 0);
      const gem = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.1, flatShading: true }),
      );
      root.add(gem);
      const halo = new Sprite(new SpriteMaterial({ map: radial(spec.glow), blending: AdditiveBlending, transparent: true, depthWrite: false }));
      halo.scale.setScalar(STONE * 5);
      root.add(halo);
      const ringMaterial = new MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.9, depthWrite: false, side: 2 });
      const ring = new Mesh(new RingGeometry(STONE * 1.7, STONE * 2, 48, 1), ringMaterial);
      ring.renderOrder = 5;
      root.add(ring);
      const label = labelSprite(spec.title, spec.sub);
      label.position.set(0, -0.065, 0);
      root.add(label);
      this.group.add(root);
      this.stones.push({ power: spec.power, root, gem, ring, ringMaterial, held: 0, home });
    }
    devActions['['] = () => this.choose('light');
    devActions[']'] = () => this.choose('arsenal');
  }

  /** Returns the power once one is chosen. */
  update(dt: number, hands: readonly HandState[], head: Vector3): Power | null {
    this.time += dt;
    this.headWorld.copy(head);
    for (const stone of this.stones) {
      // A slow bob and turn, so they read as alive and touchable.
      stone.root.position.copy(stone.home).setY(stone.home.y + Math.sin(this.time * 1.6 + stone.home.x * 20) * 0.006);
      stone.gem.rotation.y += dt * 0.8;
      stone.gem.rotation.x = Math.sin(this.time * 0.7) * 0.3;
      const touching = hands.some((hand) => hand.tracked && hand.tips.some((tip) => this.near(tip, stone)));
      stone.held = touching ? stone.held + dt : Math.max(0, stone.held - dt * 2);
      const k = Math.min(1, stone.held / HOLD);
      stone.ring.geometry.setDrawRange(0, Math.round(48 * k) * 6);
      stone.ring.rotation.z = Math.PI / 2;
      stone.ring.lookAt(this.headWorld);
      stone.root.scale.setScalar(1 + k * 0.25);
      (stone.gem.material as MeshStandardMaterial).emissiveIntensity = 0.8 + k * 1.2;
      if (touching && stone.held < dt * 1.5) playClick();
      if (k >= 1) this.choose(stone.power);
    }
    return this.picked;
  }

  private near(tip: Vector3, stone: Stone): boolean {
    this.group.worldToLocal(this.v.copy(tip));
    return this.v.distanceTo(stone.root.position) < TOUCH;
  }

  private choose(power: Power): void {
    if (this.picked) return;
    this.picked = power;
    playTinkle();
  }

  dispose(): void {
    delete devActions['['];
    delete devActions[']'];
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as MeshBasicMaterial | undefined;
      material?.map?.dispose();
      material?.dispose();
    });
  }
}

function radial(color: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A small parchment-and-gold plaque under a stone. */
function labelSprite(title: string, sub: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 176;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(40, 22, 10, 0.9)';
  g.strokeStyle = '#d9a96a';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(6, 6, 500, 164, 28);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#ffe2a0';
  g.font = 'bold 58px Georgia, "Segoe UI Emoji", serif';
  g.fillText(title, 256, 78);
  g.fillStyle = '#f3e6c8';
  g.font = '30px Georgia, serif';
  g.fillText(sub, 256, 134);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.17, 0.17 * (176 / 512), 1);
  return sprite;
}
