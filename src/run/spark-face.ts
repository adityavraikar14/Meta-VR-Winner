import { AdditiveBlending, CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FONT } from '../ui-theme.js';
import { SPARK_RADIUS } from './spark-physics.js';

/**
 * The spark: a shard of the Great Lantern's light. Four kinds escaped it, and
 * which one you guide is the luck of the draw:
 *
 *   Ember core    plain light, no trick.
 *   Lodestone     magnetic: motes within 7.5 cm are pulled in.
 *   Phoenix core  once per drop, a fall puts it back on the last ledge.
 *   Prism         a dotted line shows where its next 0.6 s will take it.
 *
 * Drawn as a lit sphere with a white-hot core and a ring of six facets just
 * outside it. The facets turn with the roll at ω = v ÷ r (so you see it roll
 * without slipping, not slide); a mote or the gate makes the core flare, and
 * a long fall makes it flicker.
 */

export type SparkKind = 'ember' | 'lodestone' | 'phoenix' | 'prism';
export type SparkPower = 'none' | 'magnet' | 'revive' | 'foresight';
/** How it is doing: steady, flaring (a mote, the gate), or falling. */
export type SparkMood = 'calm' | 'happy' | 'scared';

export interface SparkInfo {
  kind: SparkKind;
  name: string;
  power: SparkPower;
  /** A few words for the tag. */
  does: string;
  body: number;
  rim: number;
  /** The glow around it and its trail, as CSS colours (inner, outer). */
  glow: [string, string];
}

export const SPARKS: Record<SparkKind, SparkInfo> = {
  ember: { kind: 'ember', name: 'Ember core', power: 'none', does: 'plain light', body: 0xffc23a, rim: 0xc86a00, glow: ['rgba(255,240,180,0.9)', 'rgba(255,190,60,0.4)'] },
  lodestone: { kind: 'lodestone', name: 'Lodestone', power: 'magnet', does: 'pulls motes in', body: 0xa98cff, rim: 0x4a2fb8, glow: ['rgba(235,220,255,0.9)', 'rgba(150,100,255,0.4)'] },
  phoenix: { kind: 'phoenix', name: 'Phoenix core', power: 'revive', does: 'one second chance', body: 0xff7a3a, rim: 0xb02a08, glow: ['rgba(255,225,190,0.9)', 'rgba(255,110,40,0.4)'] },
  prism: { kind: 'prism', name: 'Prism', power: 'foresight', does: 'shows its path', body: 0x5ad0ff, rim: 0x0f6aa8, glow: ['rgba(215,245,255,0.9)', 'rgba(70,180,255,0.4)'] },
};

const ORDER: SparkKind[] = ['ember', 'lodestone', 'phoenix', 'prism'];
let last: SparkKind | null = null;

/**
 * Which spark a level gets. The first two levels are always the plain Ember
 * core, so the basics are learnt without a trick; after that it is random,
 * never the same twice running. `seed` (the Daily Light's date) fixes it.
 */
export function pickSpark(levelId: string, seed?: number): SparkKind {
  if (levelId === 'run-bridge' || levelId === 'run-ramp') return (last = 'ember');
  if (seed !== undefined) return ORDER[Math.abs(Math.floor(seed)) % ORDER.length];
  const pool = ORDER.filter((k) => k !== last);
  last = pool[Math.floor(Math.random() * pool.length)];
  return last;
}

/** A lit sphere on a disc: a white-hot core, the body colour, a darker limb. */
function ballTexture(body: number, rim: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const shade = g.createRadialGradient(56, 54, 2, 64, 64, 66);
  shade.addColorStop(0, '#ffffff');
  shade.addColorStop(0.3, '#ffffff');
  shade.addColorStop(0.5, hex(body));
  shade.addColorStop(0.85, hex(body));
  shade.addColorStop(1, hex(rim));
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Drawn a little larger than the physics radius, so it reads at arm's length. */
const R = SPARK_RADIUS * 1.15;

export class SparkFace {
  readonly group = new Group();
  readonly info: SparkInfo;
  /** The ring of facets, turning with the roll. */
  private readonly roll = new Group();
  private readonly flare: Mesh;
  private readonly flareMaterial: MeshBasicMaterial;
  private readonly tag: Mesh;
  private readonly tagMaterial: MeshBasicMaterial;
  private heat = 0;
  private time = 0;

  constructor(kind: SparkKind, order: number) {
    const info = SPARKS[kind];
    this.info = info;
    let layer = order;
    const flat = (color: number) => new MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const add = (mesh: Mesh, parent: Group = this.group) => {
      mesh.renderOrder = layer++;
      parent.add(mesh);
      return mesh;
    };
    // A soft flare behind it that swells when it collects light.
    this.flareMaterial = new MeshBasicMaterial({ color: info.body, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    this.flare = add(new Mesh(new CircleGeometry(R * 2.2, 40), this.flareMaterial));
    add(new Mesh(new CircleGeometry(R, 48), flat(info.rim)));
    const ball = new MeshBasicMaterial({ map: ballTexture(info.body, info.rim), transparent: true, depthWrite: false });
    add(new Mesh(new CircleGeometry(R * 0.9, 48), ball));
    // Six facets on a ring just outside the body: the roll made visible.
    this.group.add(this.roll);
    const facet = new CircleGeometry(R * 0.16, 3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mark = add(new Mesh(facet, flat(i % 2 ? info.rim : 0xffffff)), this.roll);
      mark.position.set(Math.cos(a) * R * 1.32, Math.sin(a) * R * 1.32, 0);
      mark.rotation.z = a;
    }
    const ring = add(new Mesh(new RingGeometry(R * 1.22, R * 1.28, 48), flat(info.rim)), this.roll);
    (ring.material as MeshBasicMaterial).opacity = 0.6;

    // The tag: which spark this is and what it does.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    const label = info.power === 'none' ? info.name : `${info.name} · ${info.does}`;
    g.font = `800 44px ${FONT}`;
    const wide = Math.min(492, g.measureText(label).width + 56);
    g.fillStyle = 'rgba(20, 33, 61, 0.9)';
    g.beginPath();
    g.roundRect(256 - wide / 2, 10, wide, 76, 38);
    g.fill();
    g.fillStyle = `#${info.body.toString(16).padStart(6, '0')}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 44;
    while (px > 24 && g.measureText(label).width > wide - 40) {
      px -= 2;
      g.font = `800 ${px}px ${FONT}`;
    }
    g.fillText(label, 256, 50);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.tagMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    this.tag = add(new Mesh(new PlaneGeometry(0.16, 0.03), this.tagMaterial));
    this.tag.position.set(0, R + 0.03, 0);
  }

  /**
   * `vx, vy` the spark's velocity; `mood` flares or flickers the core;
   * `tag` 0–1 how visible the tag is. (`_lookAt` is unused: it has no eyes.)
   */
  update(dt: number, vx: number, _vy: number, mood: SparkMood, _lookAt: [number, number] | null, tag: number): void {
    this.time += dt;
    // Rolling without slipping: the facets turn at v ÷ r (clockwise when moving right).
    this.roll.rotation.z -= (vx / SPARK_RADIUS) * dt;
    // A flare when it collects light; a flicker while it falls.
    this.heat += ((mood === 'happy' ? 1 : 0) - this.heat) * Math.min(1, dt * (mood === 'happy' ? 14 : 3));
    const flicker = mood === 'scared' ? 0.75 + 0.25 * Math.sin(this.time * 40) : 1;
    this.flareMaterial.opacity = 0.18 + 0.5 * this.heat;
    this.flare.scale.setScalar(1 + 0.6 * this.heat);
    this.group.scale.setScalar((1 + 0.15 * this.heat) * flicker);
    this.tagMaterial.opacity = tag;
    this.tag.visible = tag > 0.02;
  }
}
