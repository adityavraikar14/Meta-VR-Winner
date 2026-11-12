import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FONT } from '../ui-theme.js';
import { SPARK_RADIUS } from './spark-physics.js';

/**
 * The spark is somebody. Four sparks escaped the Great Lantern, and which one
 * you guide is the luck of the draw:
 *
 *   Lumi   the first spark: no trick, just bright.
 *   Mags   a magnet: motes within reach fly to her.
 *   Ember  a phoenix: once per drop, a fall puts him back on the last ledge.
 *   Iris   sees ahead: a dotted line shows where the next half second takes her.
 *
 * Each is drawn in crisp shapes (no glow sprite): a round body with a rim
 * and a highlight, marks on the rim that turn as it rolls (ω = v ÷ r, so you
 * can see it roll without slipping), and two eyes that look where it is
 * going, widen in free fall, squeeze shut with joy at a mote, and blink.
 */

export type SparkKind = 'lumi' | 'mags' | 'ember' | 'iris';
export type SparkPower = 'none' | 'magnet' | 'revive' | 'foresight';
export type SparkMood = 'calm' | 'happy' | 'scared';

export interface SparkInfo {
  kind: SparkKind;
  name: string;
  power: SparkPower;
  /** A few words for the name tag. */
  does: string;
  body: number;
  rim: number;
  /** The glow around it and its trail, as CSS colours (inner, outer). */
  glow: [string, string];
}

export const SPARKS: Record<SparkKind, SparkInfo> = {
  lumi: { kind: 'lumi', name: 'Lumi', power: 'none', does: 'the first spark', body: 0xffd23a, rim: 0xe08a00, glow: ['rgba(255,240,180,0.9)', 'rgba(255,190,60,0.4)'] },
  mags: { kind: 'mags', name: 'Mags', power: 'magnet', does: 'pulls motes in', body: 0xc4a0ff, rim: 0x6a3fd8, glow: ['rgba(235,220,255,0.9)', 'rgba(150,100,255,0.4)'] },
  ember: { kind: 'ember', name: 'Ember', power: 'revive', does: 'one second chance', body: 0xff8a4a, rim: 0xd43a10, glow: ['rgba(255,225,190,0.9)', 'rgba(255,110,40,0.4)'] },
  iris: { kind: 'iris', name: 'Iris', power: 'foresight', does: 'sees her path', body: 0x6adcff, rim: 0x1687c8, glow: ['rgba(215,245,255,0.9)', 'rgba(70,180,255,0.4)'] },
};

const ORDER: SparkKind[] = ['lumi', 'mags', 'ember', 'iris'];
let last: SparkKind | null = null;

/**
 * Who shows up for a level. The first two levels are always Lumi, so the
 * basics are learnt without a trick; after that it is random, never the
 * same spark twice running. `seed` (the Daily Light's date) fixes the pick.
 */
export function pickSpark(levelId: string, seed?: number): SparkKind {
  if (levelId === 'run-bridge' || levelId === 'run-ramp') return (last = 'lumi');
  if (seed !== undefined) return ORDER[Math.abs(Math.floor(seed)) % ORDER.length];
  const pool = ORDER.filter((k) => k !== last);
  last = pool[Math.floor(Math.random() * pool.length)];
  return last;
}

/** A sphere's shading on a disc: a bright spot upper left, the body colour, a darker limb. */
function ballTexture(body: number, rim: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const shade = g.createRadialGradient(46, 42, 4, 64, 64, 66);
  shade.addColorStop(0, '#ffffff');
  shade.addColorStop(0.22, hex(body));
  shade.addColorStop(0.78, hex(body));
  shade.addColorStop(1, hex(rim));
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Drawn a little larger than the physics radius, so the face reads at arm's length. */
const R = SPARK_RADIUS * 1.2;

export class SparkFace {
  readonly group = new Group();
  readonly info: SparkInfo;
  private readonly roll = new Group();
  private readonly eyes: Mesh[] = [];
  private readonly pupils: Mesh[] = [];
  private readonly mouth: Mesh;
  private readonly tag: Mesh;
  private readonly tagMaterial: MeshBasicMaterial;
  private blink = 2;
  private blinking = 0;
  private lookX = 0;
  private lookY = 0;
  private wide = 1;
  private squint = 0;
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
    // The body: a ball of light, shaded like a sphere lit from the upper left, with a crisp dark rim.
    add(new Mesh(new CircleGeometry(R, 48), flat(info.rim)));
    const ball = new MeshBasicMaterial({ map: ballTexture(info.body, info.rim), transparent: true, depthWrite: false });
    add(new Mesh(new CircleGeometry(R * 0.9, 48), ball));
    // Marks on the rim that turn with the roll.
    this.group.add(this.roll);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const mark = add(new Mesh(new CircleGeometry(R * 0.085, 12), flat(0xffffff)), this.roll);
      (mark.material as MeshBasicMaterial).opacity = 0.55;
      mark.position.set(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7, 0);
    }
    // A highlight, top left: it is a ball of light, and it is glossy.
    const shine = add(new Mesh(new CircleGeometry(R * 0.2, 16), flat(0xffffff)));
    (shine.material as MeshBasicMaterial).opacity = 0.75;
    shine.position.set(-R * 0.42, R * 0.48, 0);
    for (const side of [-1, 1]) {
      const eye = add(new Mesh(new CircleGeometry(R * 0.3, 20), flat(0xffffff)));
      eye.position.set(side * R * 0.34, R * 0.1, 0);
      this.eyes.push(eye);
      const pupil = add(new Mesh(new CircleGeometry(R * 0.16, 16), flat(0x14213d)));
      this.pupils.push(pupil);
    }
    this.mouth = add(new Mesh(new CircleGeometry(R * 0.2, 16, Math.PI, Math.PI), flat(0x14213d)));
    this.mouth.position.set(0, -R * 0.34, 0);

    // The name tag: who this is and what they do.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    const label = info.power === 'none' ? info.name : `${info.name} · ${info.does}`;
    g.font = `800 44px ${FONT}`;
    const wide = Math.min(492, g.measureText(label).width + 56);
    g.fillStyle = `#${info.rim.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.roundRect(256 - wide / 2, 10, wide, 76, 38);
    g.fill();
    g.fillStyle = '#ffffff';
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
    this.tag.position.set(0, R + 0.026, 0);
  }

  /**
   * `vx, vy` the spark's velocity; `lookAt` an offset to something worth
   * watching while it waits (your hand's shadow), or null; `tag` 0–1 how
   * visible the name tag is.
   */
  update(dt: number, vx: number, vy: number, mood: SparkMood, lookAt: [number, number] | null, tag: number): void {
    this.time += dt;
    // Rolling without slipping: the rim turns at v ÷ r (clockwise when moving right).
    this.roll.rotation.z -= (vx / SPARK_RADIUS) * dt;

    // Where to look: along the velocity when moving, at your shadow when waiting, else a slow wander.
    const speed = Math.hypot(vx, vy);
    let tx = Math.sin(this.time * 0.7) * 0.4;
    let ty = Math.sin(this.time * 0.43) * 0.2;
    if (speed > 0.08) {
      tx = vx / speed;
      ty = vy / speed;
    } else if (lookAt) {
      const d = Math.hypot(lookAt[0], lookAt[1]) || 1;
      tx = lookAt[0] / d;
      ty = lookAt[1] / d;
    }
    const k = Math.min(1, dt * 10);
    this.lookX += (tx - this.lookX) * k;
    this.lookY += (ty - this.lookY) * k;

    // Blink every few seconds; joy squeezes the eyes shut, a fall opens them wide.
    this.blink -= dt;
    if (this.blink <= 0) {
      this.blink = 1.8 + Math.random() * 3;
      this.blinking = 0.12;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    this.wide += ((mood === 'scared' ? 1.3 : 1) - this.wide) * k;
    this.squint += ((mood === 'happy' ? 1 : 0) - this.squint) * k;
    const open = this.blinking > 0 ? 0.12 : 1 - 0.72 * this.squint;
    this.eyes.forEach((eye, i) => {
      eye.scale.set(this.wide, this.wide * open, 1);
      const pupil = this.pupils[i];
      const shrink = mood === 'scared' ? 0.7 : 1;
      pupil.scale.set(shrink, shrink * open, 1);
      pupil.position.set(eye.position.x + this.lookX * R * 0.11, eye.position.y + this.lookY * R * 0.11 * open, 0);
    });
    // The mouth: a smile, a bigger one when happy, a round "o" in free fall.
    if (mood === 'scared') {
      this.mouth.rotation.z = 0;
      this.mouth.scale.set(0.7, 1.5, 1);
    } else {
      this.mouth.rotation.z = 0;
      this.mouth.scale.set(1 + 0.5 * this.squint, 1 + 0.4 * this.squint, 1);
    }
    // A little hop of joy.
    this.group.scale.setScalar(1 + 0.12 * this.squint * Math.abs(Math.sin(this.time * 12)));
    this.tagMaterial.opacity = tag;
    this.tag.visible = tag > 0.02;
  }
}
