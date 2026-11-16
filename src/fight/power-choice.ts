import { FONT } from '../ui-theme.js';
import { stage } from '../stage-state.js';
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
 * Before the Shadow Dragon: choose how to fight it. A card over the stage
 * says what each choice means; two stones float under it, and you touch and
 * hold one with a fingertip until its ring fills. Shadow is the story's own
 * magic, the powers learned in Training (hand shadows and drawings become
 * weapons). The Arsenal is the Arena's: one hand sign, one weapon.
 * Nothing starts until you choose.
 */

export type Power = 'light' | 'arsenal';

/** A fingertip this close to a stone's centre is touching it (stage space, metres). */
const TOUCH = 0.05;
/** Seconds of touch to choose, so a hand passing by doesn't. */
const HOLD = 0.8;
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
  { power: 'light', x: -0.14, color: 0xbfe4ff, glow: 'rgba(170,220,255,0.9)', title: '🌑 Shadow', sub: 'Your Training powers' },
  { power: 'arsenal', x: 0.14, color: 0xffb35a, glow: 'rgba(255,180,90,0.9)', title: '⚔️ Arsenal', sub: 'The Arena’s hand signs' },
];

export class PowerChoice {
  readonly group = new Group();
  caption = 'How will you fight the dragon? Touch and hold a stone to choose';
  private stones: Stone[] = [];
  private time = 0;
  private picked: Power | null = null;
  private v = new Vector3();
  private headWorld = new Vector3();

  constructor(floor: number) {
    this.group.visible = false;
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
    // What the two choices mean, big, over the stones.
    const card = explainCard();
    card.position.set(0, floor + 0.25, 0.17);
    this.group.add(card);
    devActions['['] = () => this.choose('light');
    devActions[']'] = () => this.choose('arsenal');
  }

  /** Returns the power once one is chosen. */
  update(dt: number, hands: readonly HandState[], head: Vector3): Power | null {
    this.time += dt;
    this.headWorld.copy(head);
    // Only once the level is under way: never on the title page or behind the intro film.
    this.group.visible = stage.playing;
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
  g.fillStyle = 'rgba(20, 33, 61, 0.92)';
  g.strokeStyle = '#ffc928';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(6, 6, 500, 164, 28);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `700 58px ${FONT}, "Segoe UI Emoji"`;
  g.fillText(title, 256, 78);
  g.fillStyle = '#cfdcf3';
  g.font = `600 30px ${FONT}`;
  g.fillText(sub, 256, 134);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.17, 0.17 * (176 / 512), 1);
  return sprite;
}

/** The card over the stones: the question, and what each answer gives you. */
function explainCard(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 560;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(16, 26, 48, 0.94)';
  g.strokeStyle = '#ffc928';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(8, 8, 1384, 544, 40);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#ffd84a';
  g.font = `900 64px ${FONT}`;
  g.fillText('How will you fight the dragon?', 700, 86);
  const column = (x: number, color: string, title: string, lines: string[]) => {
    g.fillStyle = color;
    g.font = `900 54px ${FONT}, "Segoe UI Emoji"`;
    g.fillText(title, x, 186);
    g.fillStyle = '#ffffff';
    g.font = `700 36px ${FONT}, "Segoe UI Emoji"`;
    lines.forEach((line, i) => g.fillText(line, x, 254 + i * 52, 620));
  };
  column(360, '#bfe4ff', '🌑 SHADOW', ['What you learned in Training:', '✊ fist = Shadow Ball', '☝ finger = Spear  ·  ✋ palm = Shield', '✏️ draw a circle, triangle or box']);
  column(1040, '#ffb35a', '⚔️ ARSENAL', ['The Arena’s weapons, one sign each:', '✊ sword  ·  🫴 ball  ·  ✋ shield', '🙌 two palms = wall', '👉 blaster  ·  ✌️ slingshot']);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(700, 140);
  g.lineTo(700, 440);
  g.stroke();
  g.fillStyle = '#ffd84a';
  g.font = `800 40px ${FONT}`;
  g.fillText('Touch and hold a stone below to choose', 700, 510);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 12;
  sprite.scale.set(0.5, 0.2, 1);
  return sprite;
}
