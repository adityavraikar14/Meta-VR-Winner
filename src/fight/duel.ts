import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type InstancedMesh,
  type Object3D,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { playBoing, playBonk, playBoom, playCollect, playInk, playPop, playSplat, playThrow, playWhee, playWhoosh } from '../audio.js';
import { sfx } from '../yash/sfx.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { ParticlePool } from '../machines/particles.js';
import { stage } from '../stage-state.js';
import { Comic } from './comic.js';
import { Doodle, type DoodleWorld, isClosedLoop } from './doodle.js';
import { FlatRival } from './flat-rival.js';
import { disposeHerb, herbSprig } from './herb.js';
import { NamePlate, preloadRival, Rival3D, rivalLoadState } from './rival3d.js';
import { currentRival, recordWin, type RivalMove, type RivalSpec, type Shot } from './rivals.js';

/**
 * Ink Duel: a fight against a rival of your choice, six of them, who step
 * out of the screen and stand on the hill in front of it.
 *
 * Pinch and draw in the air. An open line is ink: it hangs there, a solid
 * thing whose mass is the ink you used. Grab it and throw it. It flies under
 * real gravity, and the hit does damage by its kinetic energy, ½mv²: a big
 * drawing hits hard but is heavy to throw; a small one flies fast. A hit on
 * the head counts half again. Drawings left hanging are shields.
 *
 * A closed shape comes alive: it puffs into a creature with your outline,
 * drops to the ground, hops at the rival and head-butts them. You can pick
 * it up and throw it too. The rival's ink can pop it.
 *
 * Each rival fights their own way (rivals.ts): a ward that stops throws, a
 * three-shot burst, a duck, a tumble, a hide that only real energy gets
 * through, a parry that sends your ink back. First to run out loses.
 */

const PLAYER_HEARTS = 5;
const INK_DENSITY = 0.5;
const MAX_INK = 0.6;
const STEP = 0.007;
const HANG_TIME = 9;
const GRAVITY = 9.8;
const GRAB_REACH = 0.035;
/** Damage per joule of kinetic energy. */
const DAMAGE_PER_JOULE = 40;
/** A hit on the head counts this much more. */
const HEAD_BONUS = 1.5;
/** How far in front of the screen the rival stands, metres. */
const RIVAL_OUT = 0.3;
/** Seconds to walk out of the screen, then a breath before the fight. */
const WALK_TIME = 2.6;
const READY_TIME = WALK_TIME + 1.8;
/** The flat puppet stands in only if the 3D rival never arrives. */
const FLAT_AFTER = 20;
/** Living drawings at once, and head-butts each gets before it pops. */
const MAX_DOODLES = 3;
const DOODLE_BONKS = 3;
/** After a hit you are safe for this long, so a volley of three costs one heart, not three. */
const GRACE = 0.9;
/** Rivals here are three times as tough as their card says: a real fight, not one lucky throw. */
const HEALTH_SCALE = 3;
/** No single hit can take more than this (a head hit can reach half again). */
const MAX_HIT = 22;
/** Seconds a rival is untouchable while powering up into a new phase. */
const PHASE_SHIELD = 2.2;
/** Seconds between their ultimate, in phase 2 and phase 3. */
const ULTIMATE_EVERY: [number, number] = [15, 10];
/** Your super: how much of the rival's health you must deal to fill it, and what each bolt does. */
const SUPER_FILL = 0.22;
const SUPER_BOLTS = 8;
const SUPER_DAMAGE = 9;
/** Healing herbs: seconds between them (while you are hurt), how long one lasts, how close a pinch must be. */
const HERB_EVERY: [number, number] = [14, 20];
const HERB_LIFE = 10;
const HERB_REACH = 0.06;
/** How far either side of the screen's middle the rival stands and moves (never in front of its middle). */
const SIDE_NEAR = 0.2;
const SIDE_FAR = 0.38;
/** Thick Hide: hits softer than this mostly bounce off. */
const ARMOR_THRESHOLD = 14;

type Mode = 'ready' | 'fight' | 'won' | 'lost';
type InkState = 'drawing' | 'hanging' | 'held' | 'flying' | 'gone';

interface Ink {
  mesh: Mesh;
  /** Points relative to the object's position. */
  points: Vector3[];
  pos: Vector3;
  vel: Vector3;
  /** A steady sideways push (a curveball), m/s². */
  accel: Vector3 | null;
  spin: number;
  mass: number;
  state: InkState;
  age: number;
  hand: number;
  grabOffset: Vector3;
  rival: boolean;
  /** How close to the player's head counts as a hit. */
  reach: number;
  /** The rival has seen this one coming (and dodged, or not). */
  seen: boolean;
  /** A bolt of your super: fixed damage, through any defence. */
  power?: number;
}

interface Sample {
  t: number;
  p: Vector3;
}

/** A shot still to come from a volley. */
interface Pending {
  delay: number;
  hand: Object3D;
  shot: Shot;
  flight?: number;
  curve?: number;
}

/** Each kind of shot: drawing size, seconds to reach you, spin, and how close counts. */
const SHOTS: Record<Shot, { size: number; flight: number; spin: number; reach: number; scatter: number }> = {
  arc: { size: 1.4, flight: 1.35, spin: 5, reach: 0.17, scatter: 0.15 },
  bolt: { size: 0.9, flight: 0.75, spin: 12, reach: 0.17, scatter: 0.15 },
  pellet: { size: 0.5, flight: 0.58, spin: 18, reach: 0.14, scatter: 0.06 },
  curve: { size: 1.0, flight: 1.15, spin: 9, reach: 0.17, scatter: 0.08 },
  heavy: { size: 2.1, flight: 1.5, spin: 3, reach: 0.2, scatter: 0.1 },
};

const SHAPES: Array<Array<[number, number]>> = [
  // Zigzag, spiral, star, arrow, a scribbled blob.
  [[-0.05, -0.02], [-0.03, 0.02], [-0.01, -0.02], [0.01, 0.02], [0.03, -0.02], [0.05, 0.02]],
  Array.from({ length: 14 }, (_, i) => [Math.cos(i * 0.9) * (0.01 + i * 0.003), Math.sin(i * 0.9) * (0.01 + i * 0.003)] as [number, number]),
  [[0, 0.04], [0.012, 0.012], [0.04, 0.01], [0.016, -0.008], [0.024, -0.04], [0, -0.02], [-0.024, -0.04], [-0.016, -0.008], [-0.04, 0.01], [-0.012, 0.012], [0, 0.04]],
  [[-0.05, 0], [0.04, 0], [0.02, 0.02], [0.05, 0], [0.02, -0.02], [0.04, 0]],
  [[-0.02, 0], [0.0, 0.03], [0.03, 0.01], [0.01, -0.02], [-0.03, -0.01], [-0.01, 0.025], [0.025, 0.0]],
];

export class InkDuel {
  readonly group = new Group();
  caption = '';
  done = false;
  won = false;
  mistakes = 0;

  /** Who you are fighting (picked on the roster). */
  readonly spec: RivalSpec = currentRival();
  private mode: Mode = 'ready';
  private modeTime = 0;
  private time = 0;
  private hearts = PLAYER_HEARTS;
  private readonly maxHealth = this.spec.health * HEALTH_SCALE;
  private rivalHealth = this.maxHealth;
  /** 1, 2, 3: each third of their health is a phase; each new one powers them up. */
  private phase = 1;
  private immune = 0;
  private ultimate = 0;
  /** Their ultimate's falling ink, still to come: when, and from where. */
  private readonly rain: Array<{ delay: number; from: Vector3 }> = [];
  /** Your super meter (0–1), and the two-hand pull that fires it. */
  private superMeter = 0;
  private superReady = false;
  private pullStart = -1;
  private readonly superBar: Mesh;
  private readonly superFrame: Mesh;
  /** A healing herb floating within reach, and when the next one grows. */
  private herb: { group: Group; at: Vector3; life: number } | null = null;
  private herbTimer = HERB_EVERY[0];
  private readonly paper = new Group();
  private readonly rival: FlatRival;
  private readonly inks: Ink[] = [];
  private readonly doodles: Doodle[] = [];
  private readonly drawing: Array<Ink | null> = [null, null];
  private readonly history: [Sample[], Sample[]] = [[], []];
  private readonly light: MeshStandardMaterial;
  private readonly dark: MeshStandardMaterial;
  private readonly splashes = new ParticlePool({ count: 240, additive: false, soft: true });
  private readonly sparks = new ParticlePool({ count: 140, additive: true, soft: false });
  private readonly comic = new Comic();
  private readonly splats: Mesh[] = [];
  private readonly splatMaterial: MeshBasicMaterial;
  private readonly heartMeshes: Mesh[] = [];
  private readonly frame: Mesh;
  private readonly bar: Mesh;
  private readonly score: { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture; time: number };
  /** A glowing nib at each pinch point: where your ink will come from. */
  private readonly nibs: Mesh[] = [];
  /** A ring of light that bursts from a big hit. */
  private readonly shock: Mesh;
  private shockTime = 1;
  private nextRival = 3;
  private justRolled = false;
  /** Seconds of safety left after the last hit on you. */
  private grace = 0;
  /** Dev: hits on you cost nothing. */
  private god = false;
  private readonly pending: Pending[] = [];
  private note = '';
  private noteTime = 0;
  /** The 3D rival, once their model has loaded. */
  private foe: Rival3D | null = null;
  /** For Morwen's laughs: the ward going up, and her first wound past 70%. */
  private wasWarded = false;
  private laughedHurt = false;
  /** The flat puppet stands in (the model never arrived). */
  private flat = false;
  private readonly plate: NamePlate;
  /** Where they stand: the centre spot, the way "sideways" runs, and how far along it they are. */
  private readonly rivalFrom = new Vector3();
  private readonly rivalSpot = new Vector3();
  private readonly side = new Vector3(1, 0, 0);
  private offset = 0;
  private emerged = false;
  private taunted = false;
  /** Ground heights already measured, by 2.5 cm cell. */
  private readonly groundCache = new Map<number, number>();
  private readonly doodleWorld: DoodleWorld;
  /** How the duel went, for the Inventor's Journal. */
  private readonly tally = { hits: 0, heads: 0, blocked: 0, bonks: 0, best: { energy: 0, mass: 0, speed: 0 } };
  private readonly head = new Vector3();
  private readonly headWorld = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly u = new Vector3();

  constructor(
    root: Group,
    private readonly floor: number,
  ) {
    this.group.name = 'InkDuel';
    root.updateWorldMatrix(true, false);
    const toPaper = new Matrix4().copy(root.matrixWorld).invert().multiply(stage.paper!.matrixWorld);
    toPaper.decompose(this.paper.position, this.paper.quaternion, this.paper.scale);
    this.group.add(this.paper, this.splashes.points, this.sparks.points, this.comic.group);
    this.rival = new FlatRival();
    this.rival.root.visible = false;
    this.paper.add(this.rival.root);
    void preloadRival(this.spec);
    this.plate = new NamePlate(this.spec.name, this.spec.accent);

    this.light = new MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 0.9, roughness: 0.3 });
    // Their ink: near black, glowing in their own colour so it shows against the room.
    this.dark = new MeshStandardMaterial({ color: this.spec.ink, emissive: this.spec.glow, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.3 });
    this.splatMaterial = new MeshBasicMaterial({ map: splatTexture(), transparent: true, depthWrite: false });

    // Hearts and the Rival's strength on the screen.
    const heart = new Shape();
    heart.moveTo(0, -0.012);
    heart.bezierCurveTo(-0.02, 0.0, -0.016, 0.016, 0, 0.008);
    heart.bezierCurveTo(0.016, 0.016, 0.02, 0.0, 0, -0.012);
    for (let i = 0; i < PLAYER_HEARTS; i++) {
      const mesh = new Mesh(new ShapeGeometry(heart, 12), new MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, depthWrite: false }));
      mesh.position.set(-0.45 + i * 0.038, 0.31, 0.012);
      mesh.renderOrder = 9;
      this.heartMeshes.push(mesh);
      this.paper.add(mesh);
    }
    const frame = new Mesh(new BoxGeometry(0.26, 0.022, 0.001), new MeshBasicMaterial({ color: 0x1a1218, transparent: true, opacity: 0.8, depthWrite: false }));
    frame.position.set(0.3, 0.315, 0.011);
    frame.renderOrder = 8;
    this.frame = frame;
    this.paper.add(frame);
    this.bar = new Mesh(new BoxGeometry(0.25, 0.014, 0.001).translate(0.125, 0, 0), new MeshBasicMaterial({ color: 0x302838, transparent: true, depthWrite: false }));
    this.bar.position.set(0.175, 0.315, 0.0125);
    this.bar.renderOrder = 9;
    this.paper.add(this.bar);
    // Your super meter, under your hearts: fills as you deal damage and block.
    this.superFrame = new Mesh(new BoxGeometry(0.19, 0.016, 0.001), new MeshBasicMaterial({ color: 0x14213d, transparent: true, opacity: 0.85, depthWrite: false }));
    this.superFrame.position.set(-0.375, 0.28, 0.011);
    this.superFrame.renderOrder = 8;
    this.paper.add(this.superFrame);
    this.superBar = new Mesh(new BoxGeometry(0.18, 0.009, 0.001).translate(0.09, 0, 0), new MeshBasicMaterial({ color: 0xffc928, transparent: true, depthWrite: false }));
    this.superBar.position.set(-0.465, 0.28, 0.0125);
    this.superBar.scale.x = 0.001;
    this.superBar.renderOrder = 9;
    this.paper.add(this.superBar);
    // The number that pops up on a hit, with the energy behind it.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(0.24, 0.12), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
    mesh.renderOrder = 10;
    mesh.visible = false;
    this.group.add(mesh);
    this.score = { mesh, canvas, texture, time: 0 };
    this.plate.mesh.visible = false;
    this.group.add(this.plate.mesh);

    // The nibs: a small glow at each pinch point, brighter while you draw.
    for (let i = 0; i < 2; i++) {
      const nib = new Mesh(new SphereGeometry(0.006, 12, 8), new MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
      nib.visible = false;
      nib.userData.keep = true;
      this.nibs.push(nib);
      this.group.add(nib);
    }
    this.shock = new Mesh(new RingGeometry(0.82, 1, 40), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.shock.visible = false;
    this.shock.renderOrder = 8;
    this.group.add(this.shock);

    this.side.set(1, 0, 0).applyQuaternion(this.paper.quaternion).setY(0).normalize();
    this.doodleWorld = { ground: (p) => this.groundFast(p), viewer: this.head, target: null, head: null, reach: this.spec.girth + 0.1 };

    devInfo.duel = () => this.state;
    devActions['['] = () => this.devDraw();
    devActions[']'] = () => this.devThrow();
    devActions[';'] = () => this.devRival('throw');
    devActions["'"] = () => this.devDoodle();
    devActions['/'] = () => this.devRival('skill');
    // Dev: . lands the winning blow, , takes your last heart.
    devActions['.'] = () => {
      this.rivalHealth = 0;
      this.end(true);
    };
    devActions[','] = () => {
      this.hearts = 0;
      this.end(false);
    };
    // Dev: ` fills your super and fires it; - grows a herb now; + jumps to the next phase (not #: Shift+3 is a hand pose).
    devActions['`'] = () => {
      this.superMeter = 1;
      this.fireSuper(this.v.copy(this.head).add(this.w.set(0, -0.15, -0.3)));
    };
    devActions['-'] = () => {
      this.herbTimer = 0;
      if (this.hearts >= PLAYER_HEARTS) this.hearts = PLAYER_HEARTS - 1;
    };
    devActions['+'] = () => {
      this.hurt(Math.max(1, this.rivalHealth - (this.phase === 1 ? (this.maxHealth * 2) / 3 : this.maxHealth / 3) + 1), null);
    };
    // Dev: = toggles god mode (their ink costs you nothing).
    devActions['='] = () => {
      this.god = !this.god;
    };
  }

  get state(): string {
    const who = this.foe
      ? `${this.spec.id}=${this.foe.moving}${this.foe.warded ? '+ward' : ''}${this.foe.parrying ? '+parry' : ''}${this.foe.ducking ? '+duck' : ''}`
      : this.flat ? 'flat' : `${this.spec.id}:${rivalLoadState(this.spec)}`;
    const doodles = this.doodles.map((d) => `${d.name}(${d.kind},${d.state},${d.bonks})`).join(',');
    return `${this.mode} ${who} hearts=${this.hearts} rival=${Math.round(this.rivalHealth)}/${this.maxHealth} phase=${this.phase} super=${Math.round(this.superMeter * 100)}%${this.herb ? ' herb' : ''} inks=${this.inks.map((i) => i.state[0]).join('')} doodles=[${doodles}]`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[], head: Vector3): void {
    this.time += dt;
    this.modeTime += dt;
    this.noteTime -= dt;
    this.grace -= dt;
    this.headWorld.copy(head);
    this.group.worldToLocal(this.head.copy(head));
    if (!this.foe && !this.flat) {
      this.foe = Rival3D.create(this.spec);
      if (this.foe) this.place(this.foe);
      else if (this.time > FLAT_AFTER) this.flat = true;
    }
    const foe = this.foe;
    const live = stage.playing || this.mode === 'won' || this.mode === 'lost';
    this.paper.visible = live;
    this.rival.root.visible = this.flat;
    this.frame.visible = this.bar.visible = this.flat;
    if (foe) foe.root.visible = live && foe.melt < 1;
    this.plate.mesh.visible = live && foe !== null && this.mode !== 'won' && this.emerged;
    for (const doodle of this.doodles) doodle.root.visible = live;
    if (!live) {
      // Behind the menu or the story card: the fight starts when play does.
      if (this.mode === 'ready') this.modeTime = 0;
      this.rival.update(dt);
      for (const nib of this.nibs) nib.visible = false;
      return;
    }
    this.record(hands);
    this.showNibs(hands);
    switch (this.mode) {
      case 'ready':
        if (!foe && !this.flat) {
          this.caption = 'Someone stirs behind the screen…';
          this.modeTime = 0;
          break;
        }
        if (foe) this.walkOut(foe);
        this.caption =
          foe && this.modeTime < WALK_TIME + 0.4
            ? this.spec.entrance
            : 'Pinch and draw in the air: a line is ink to throw, a closed shape comes alive!';
        if (this.modeTime > (foe ? READY_TIME : 3)) {
          this.setMode('fight');
          this.comic.pop('FIGHT!', this.front(), '#ff5a3a', 1.5, 1.2);
          sfx.armed();
          if (this.spec.id === 'morwen') sfx.witchAttackLaugh(0.3);
        }
        this.draw(hands);
        break;
      case 'fight':
        this.immune = Math.max(0, this.immune - dt);
        this.watchSuper(hands);
        this.draw(hands);
        this.grab(hands);
        this.tendHerb(dt, hands);
        this.rivalTurn(dt);
        this.rainDown(dt);
        this.say();
        break;
      case 'won':
        this.caption = foe ? `You win the duel! ${this.spec.name} melts back into ink.` : 'You win the duel! Your ink flew true.';
        this.rival.fall = Math.min(1, this.modeTime / 1.2);
        if (foe) {
          // They fall, then dissolve into a cloud of ink.
          foe.melt = Math.min(1, Math.max(0, (this.modeTime - 1.8) / 1.4));
          if (foe.melt > 0 && foe.melt < 1 && Math.random() < dt * 40) {
            foe.chestAt(this.v);
            this.v.x += (Math.random() - 0.5) * 0.1;
            this.v.y += (Math.random() - 0.6) * 0.2;
            this.splashes.emit(this.v, this.w.set(0, 0.15 + Math.random() * 0.2, 0), { life: 0.9, gravity: -0.3, drag: 0.5, size: [0.014, 0.03], from: this.spec.glow, alpha: 0.8 });
          }
        }
        if (this.modeTime > (foe ? 4.2 : 3.5)) this.done = true;
        break;
      case 'lost':
        this.caption = `Splat! ${foe ? this.spec.name : 'The Rival'} wins this one. Rematch from the menu!`;
        if (this.modeTime > 3.5) this.done = true;
        break;
    }
    this.fly(dt);
    this.runDoodles(dt, hands);
    this.rival.update(dt);
    if (foe) {
      const walking = this.mode === 'ready' && this.modeTime < WALK_TIME;
      foe.update(dt, this.mode === 'won' || walking ? null : this.head);
      this.plate.draw(this.rivalHealth / this.maxHealth);
      this.plate.mesh.position.copy(foe.root.position).setY(foe.root.position.y + this.spec.height + 0.07);
      this.plate.mesh.lookAt(this.headWorld);
      // A hand let go: the ink is on its way.
      if (foe.released) {
        const hand = foe.released;
        const by = foe.releasedBy ?? 'throw';
        foe.released = null;
        foe.releasedBy = null;
        if (this.mode === 'fight') this.onRelease(foe, hand, by);
      }
      // Morwen's ward of runes has formed: a ghostly, echoing laugh.
      if (foe.warded && !this.wasWarded && this.mode === 'fight') sfx.witchWardLaugh();
      this.wasWarded = foe.warded;
    }
    this.drawHud(dt);
    this.splashes.update(dt);
    this.sparks.update(dt);
    this.comic.update(dt, this.headWorld);
    if (this.shockTime < 1) {
      this.shockTime = Math.min(1, this.shockTime + dt / 0.3);
      const k = 1 - Math.pow(1 - this.shockTime, 3);
      this.shock.scale.setScalar(0.03 + 0.17 * k);
      (this.shock.material as MeshBasicMaterial).opacity = 0.9 * (1 - this.shockTime);
      this.shock.lookAt(this.headWorld);
      this.shock.visible = this.shockTime < 1;
    }
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  /** A point above the rival (or the middle of the screen), for the small words. */
  private above(extra: number): Vector3 {
    if (this.foe) return this.v.copy(this.foe.root.position).setY(this.foe.root.position.y + this.spec.height + extra);
    return this.v.copy(this.paper.position).setY(this.paper.position.y + 0.1);
  }

  /** A point in front of the rival's chest, towards you: where the big words (FIGHT!, K.O.!) land. */
  private front(): Vector3 {
    const from = this.foe ? this.foe.root.position : this.paper.position;
    const up = this.foe ? this.spec.height * 0.7 : 0.05;
    this.v.copy(this.head).sub(from).setY(0).normalize().multiplyScalar(0.14);
    return this.v.add(from).setY(from.y + up);
  }

  private showNibs(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const nib = this.nibs[h];
      if (!nib) return;
      const holding = this.inks.some((i) => i.state === 'held' && i.hand === h) || this.doodles.some((d) => d.hand === h);
      nib.visible = hand.tracked && !holding && (this.mode === 'ready' || this.mode === 'fight');
      if (!nib.visible) return;
      this.group.worldToLocal(nib.position.copy(hand.pinch));
      const pulse = 1 + 0.15 * Math.sin(this.time * 9 + h);
      nib.scale.setScalar(hand.pinching ? 1.7 * pulse : 0.9);
      (nib.material as MeshBasicMaterial).opacity = hand.pinching ? 0.95 : 0.4;
    });
  }

  // ================================================================= Rival

  /** They start just behind the screen, facing out, and walk through it onto the hill. */
  private place(foe: Rival3D): void {
    const out = this.v.set(0, 0, 1).applyQuaternion(this.paper.quaternion).setY(0).normalize();
    this.rivalSpot.copy(this.paper.position).addScaledVector(out, RIVAL_OUT);
    this.rivalFrom.copy(this.paper.position).addScaledVector(out, -0.1);
    const y = this.groundAt(this.rivalSpot);
    this.rivalSpot.y = y;
    this.rivalFrom.y = y;
    foe.root.position.copy(this.rivalFrom);
    foe.root.rotation.y = Math.atan2(out.x, out.z);
    foe.play('walk');
    this.group.add(foe.root);
  }

  private walkOut(foe: Rival3D): void {
    const k = Math.min(1, this.modeTime / WALK_TIME);
    // Out of the screen and to one side of it, so its middle stays clear.
    if (this.offset === 0) this.offset = SIDE_NEAR + 0.08;
    this.u.copy(this.rivalSpot).addScaledVector(this.side, this.offset * k);
    if (k < 1 || !this.taunted) foe.root.position.lerpVectors(this.rivalFrom, this.u, k);
    // Ink spatters off the screen as they step through it.
    const through = 0.1 / (0.1 + RIVAL_OUT);
    if (!this.emerged && k > through) {
      this.emerged = true;
      foe.chestAt(this.v);
      this.splashAt(this.v, this.spec.ink);
      playSplat(0.1);
    }
    if (k >= 1 && !this.taunted) {
      // Arrived: a flourish, then they settle.
      this.taunted = true;
      if (foe.has('taunt') && this.spec.ability !== 'ward') foe.play('taunt');
      else foe.play('idle');
      this.comic.pop(this.spec.name.toUpperCase(), this.front(), this.spec.accent, 1.3, 1.5);
    }
  }

  /**
   * The ground's height under a stage point: a ray down onto the world's
   * scenery (not the grass, not the duel's own things), nearest the floor.
   */
  private groundAt(p: Vector3): number {
    const stageRoot = this.group.parent?.parent;
    if (!stageRoot) return this.floor;
    const props = this.group.parent!;
    const from = stageRoot.localToWorld(this.w.set(p.x, this.floor + 0.25, p.z));
    const ray = new Raycaster(from.clone(), new Vector3(0, -1, 0), 0, 1);
    // The ground and the scenery on it, not the props or anyone standing on the table.
    const targets = stageRoot.children.filter((c) => c !== props && c.name !== 'Mentor' && c.name !== 'RivalShowcase');
    let best = this.floor;
    let found = false;
    for (const hit of ray.intersectObjects(targets, true)) {
      if ((hit.object as InstancedMesh).isInstancedMesh || !(hit.object as Mesh).isMesh) continue;
      const y = stageRoot.worldToLocal(hit.point.clone()).y;
      if (y > this.floor + 0.12) continue;
      if (!found || y > best) best = y;
      found = true;
    }
    return found ? best : this.floor;
  }

  /** The same, remembered per 2.5 cm cell: the doodles ask every frame. */
  private groundFast(p: Vector3): number {
    const key = Math.round(p.x * 40) * 4096 + Math.round(p.z * 40);
    let y = this.groundCache.get(key);
    if (y === undefined) {
      y = this.groundAt(p);
      this.groundCache.set(key, y);
    }
    return y;
  }

  private say(): void {
    const foe = this.foe;
    const who = foe ? this.spec.name : 'the Rival';
    const hanging = this.inks.some((i) => !i.rival && i.state === 'hanging');
    const held = this.inks.some((i) => i.state === 'held');
    const buddy = this.doodles.find((d) => d.state !== 'gone');
    let text = hanging ? `Pinch your drawing to grab it, then throw it at ${who}` : 'Draw a line to throw, or close a shape to bring it to life';
    if (buddy && !hanging) text = `${buddy.name} is closing on ${who}. Keep drawing, or pinch it and throw`;
    if (held) text = 'Throw! Big drawings hit harder, small ones fly faster';
    if (this.doodles.some((d) => d.state === 'held')) text = 'Throw it! It hits by ½mv², like everything else';
    if (this.rival.drawing > 0) text = 'The Rival is drawing… leave a drawing hanging in the air as a shield!';
    if (foe && (foe.moving === 'throw' || foe.moving === 'attack')) text = `${who} winds up… hang a drawing in the air as a shield!`;
    if (foe && foe.moving === 'skill' && this.spec.ability !== 'ward' && this.spec.ability !== 'parry') text = `${who}’s special is coming: shields up!`;
    if (foe?.warded) text = 'Her ward of runes is up: wait for it to fade, then throw!';
    if (this.superReady) text = 'SUPER READY: pinch with both hands, then pull them apart';
    if (this.immune > 0) text = `${this.spec.name} is powering up: get your drawings ready`;
    if (foe?.parrying) text = 'He is parrying: anything you throw now comes straight back';
    if (this.noteTime > 0) text = this.note;
    this.caption = text;
  }

  private flash(text: string, seconds = 1.6): void {
    this.note = text;
    this.noteTime = seconds;
  }

  // =============================================================== Drawing

  private draw(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const current = this.drawing[h];
      if (!hand.tracked) {
        if (current) this.finish(h);
        return;
      }
      const p = this.group.worldToLocal(this.v.copy(hand.pinch));
      if (hand.pinchStarted && !current && !this.nearInk(p) && !this.nearDoodle(p)) {
        const ink = this.newInk(false, p);
        ink.points.push(new Vector3());
        this.drawing[h] = ink;
      }
      if (current && hand.pinching) {
        const last = current.points[current.points.length - 1];
        const local = p.clone().sub(current.pos);
        if (local.distanceTo(last) >= STEP && this.inkLength(current) < MAX_INK) {
          current.points.push(local);
          if (current.points.length % 2 === 0) this.rebuild(current);
          if (current.points.length % 6 === 0) playInk();
        }
      }
      if (current && hand.pinchEnded) this.finish(h);
    });
  }

  private finish(h: number): void {
    const ink = this.drawing[h];
    this.drawing[h] = null;
    if (!ink) return;
    if (ink.points.length < 4) {
      this.remove(ink);
      return;
    }
    // Re-centre on the ink's middle so it turns about its centre of mass.
    const centre = new Vector3();
    for (const p of ink.points) centre.add(p);
    centre.divideScalar(ink.points.length);
    for (const p of ink.points) p.sub(centre);
    ink.pos.add(centre);
    // A closed shape comes alive.
    if (isClosedLoop(ink.points)) {
      if (this.doodles.length < MAX_DOODLES) {
        this.comeAlive(ink);
        return;
      }
      this.flash('Three living drawings is a crowd: this one stays ink', 1.8);
    }
    ink.mass = this.inkLength(ink) * INK_DENSITY;
    ink.state = 'hanging';
    ink.age = 0;
    this.rebuild(ink);
  }

  private newInk(rival: boolean, at: Vector3): Ink {
    const mesh = new Mesh(undefined, rival ? this.dark : this.light);
    mesh.userData.keep = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const ink: Ink = {
      mesh, points: [], pos: at.clone(), vel: new Vector3(), accel: null, spin: 0, mass: 0, state: 'drawing', age: 0, hand: -1,
      grabOffset: new Vector3(), rival, reach: 0.17, seen: false,
    };
    this.inks.push(ink);
    return ink;
  }

  private rebuild(ink: Ink): void {
    if (ink.points.length < 2) return;
    const curve = new CatmullRomCurve3(ink.points);
    ink.mesh.geometry.dispose();
    ink.mesh.geometry = new TubeGeometry(curve, Math.min(160, ink.points.length * 2), ink.rival ? 0.006 : 0.005, 6, false);
    ink.mesh.position.copy(ink.pos);
  }

  private inkLength(ink: Ink): number {
    let length = 0;
    for (let i = 1; i < ink.points.length; i++) length += ink.points[i].distanceTo(ink.points[i - 1]);
    return length;
  }

  private nearInk(p: Vector3): Ink | null {
    for (const ink of this.inks) {
      if (ink.rival || (ink.state !== 'hanging' && ink.state !== 'flying')) continue;
      for (const q of ink.points) {
        if (this.w.copy(q).applyQuaternion(ink.mesh.quaternion).add(ink.pos).distanceTo(p) < GRAB_REACH) return ink;
      }
    }
    return null;
  }

  private nearDoodle(p: Vector3): Doodle | null {
    for (const doodle of this.doodles) {
      if (doodle.loose && doodle.pos.distanceTo(p) < doodle.radius + 0.03) return doodle;
    }
    return null;
  }

  private remove(ink: Ink): void {
    ink.state = 'gone';
    this.group.remove(ink.mesh);
    ink.mesh.geometry.dispose();
    this.inks.splice(this.inks.indexOf(ink), 1);
  }

  // ====================================================== Living drawings

  /** The closed stroke puffs up into a creature with the same outline. */
  private comeAlive(ink: Ink): void {
    const doodle = new Doodle(ink.points, ink.pos, this.head);
    this.remove(ink);
    this.doodles.push(doodle);
    this.group.add(doodle.root);
    for (let i = 0; i < 18; i++) {
      this.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.25 + Math.random() * 0.3);
      this.sparks.emit(doodle.pos, this.v, { life: 0.45, size: [0.012, 0.002], from: doodle.color });
    }
    playBoom(0.05);
    this.comic.pop(doodle.name.toUpperCase(), this.v.copy(doodle.pos).setY(doodle.pos.y + doodle.radius + 0.07), hex(doodle.color), 0.8, 1.3);
    this.flash(`Your drawing rises: ${doodle.name} closes on ${this.foe ? this.spec.name : 'the Rival'}`, 2.2);
  }

  private runDoodles(dt: number, hands: readonly HandState[]): void {
    const foe = this.foe;
    const world = this.doodleWorld;
    const fighting = this.mode === 'fight' || this.mode === 'ready';
    if (foe && fighting) {
      world.target = foe.root.position;
      world.head = foe.headAt(this.u);
    } else if (this.flat && fighting) {
      // The flat puppet: go for the screen where it stands.
      world.target = this.group.worldToLocal(this.paper.localToWorld(this.rival.bodyAt(this.u)));
      world.target.y = this.floor;
      world.head = null;
    } else {
      world.target = null;
      world.head = null;
    }
    for (const doodle of [...this.doodles]) {
      if (doodle.state === 'held') {
        const hand = hands[doodle.hand];
        if (!hand || !hand.tracked || hand.pinchEnded || !hand.pinching) {
          const v = throwVelocity(this.history[doodle.hand], this.time, this.w);
          const arm = 0.6;
          if (v) v.multiplyScalar(1.7 * (arm / (arm + doodle.mass)));
          const thrown = v !== null && v.length() > 0.5;
          doodle.release(v);
          if (thrown) {
            playThrow();
            playWhee();
          }
        } else {
          doodle.carry(this.group.worldToLocal(this.v.copy(hand.pinch)), dt);
        }
      }
      const event = doodle.update(dt, world);
      if (event === 'land') {
        playBoing();
        for (let i = 0; i < 6; i++) {
          this.v.set(Math.random() - 0.5, 0.3 + Math.random() * 0.3, Math.random() - 0.5).multiplyScalar(0.4);
          this.splashes.emit(this.w.copy(doodle.pos).setY(doodle.pos.y - doodle.radius), this.v, { life: 0.35, gravity: 2, drag: 1, size: [0.008, 0.016], from: 0xe8e0d0, alpha: 0.5 });
        }
      } else if (event === 'leap') {
        playWhee(0.03);
      } else if (event === 'bonk' && foe && this.mode === 'fight') {
        this.bonk(foe, doodle);
      }
      if (doodle.state === 'gone') continue;
      // Thrown: it hits like ink, by its kinetic energy.
      if (doodle.state === 'thrown' && foe && this.mode === 'fight') this.doodleStrike(foe, doodle);
      if (doodle.state === 'thrown') {
        const onPaper = this.paper.worldToLocal(this.group.localToWorld(this.v.copy(doodle.pos)));
        if (onPaper.z <= 0.03 && Math.abs(onPaper.x) < 0.6) {
          // Off the screen with a boing.
          doodle.bounce(this.v.set(0, 0, -1).applyQuaternion(this.paper.quaternion).add(doodle.pos), 0.5);
          playBoing();
        }
      }
      if (doodle.pos.y < this.floor - 0.7 || doodle.pos.distanceTo(this.head) > 3) this.popDoodle(doodle, false);
    }
    // After the duel they have nothing left to do: off they pop, one by one.
    if ((this.mode === 'won' || this.mode === 'lost') && this.modeTime > 2.2 && this.doodles.length && Math.random() < dt * 2) {
      this.popDoodle(this.doodles[0], true);
    }
  }

  /** A head-butt landed. */
  private bonk(foe: Rival3D, doodle: Doodle): void {
    const at = foe.headAt(this.w).clone();
    if (foe.warded) {
      this.comic.pop('WARDED', at, '#8affb8', 0.8);
      playBoing();
      this.flash(`Her ward bounces ${doodle.name} right off`, 1.4);
      return;
    }
    if (foe.parrying) {
      this.comic.pop('SLICED!', at, this.spec.accent, 0.9);
      sfx.slice();
      this.flash(`${doodle.name} is cut down by the blade`, 1.8);
      this.popDoodle(doodle, true);
      return;
    }
    let damage = Math.round(Math.min(7, 3 + doodle.mass * 30) * (doodle.kind === 'spike' ? 1.5 : 1));
    if (this.spec.ability === 'armor' && damage < 8) damage = Math.max(1, Math.round(damage * 0.5));
    damage = this.hurt(damage, at);
    this.tally.bonks++;
    foe.flinch();
    playBonk();
    this.comic.pop(`SLAM −${damage}`, at.setY(at.y + 0.06), hex(doodle.color), 0.9);
    for (let i = 0; i < 10; i++) {
      this.v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.3);
      this.sparks.emit(at, this.v, { life: 0.35, size: [0.012, 0.002], from: doodle.color });
    }
    this.flash(BONK_LINES[this.tally.bonks % BONK_LINES.length].replace('%d', doodle.name).replace('%r', this.spec.name), 1.5);
    if (this.rivalHealth <= 0) {
      this.end(true);
      return;
    }
    if (doodle.bonks >= DOODLE_BONKS) {
      this.flash(`${doodle.name} is spent and breaks back into ink`, 1.8);
      this.popDoodle(doodle, true);
    }
  }

  /** A thrown doodle reaches the rival. */
  private doodleStrike(foe: Rival3D, doodle: Doodle): void {
    if (!doodle.loose && doodle.state !== 'thrown') return;
    this.react(foe, doodle.pos, doodle.vel, doodle);
    const onHead = doodle.pos.distanceTo(foe.headAt(this.w)) < 0.06 + doodle.radius * 0.5;
    if (!onHead && foe.distanceTo(doodle.pos, this.w) > this.spec.girth + doodle.radius * 0.5) return;
    const at = doodle.pos.clone();
    if (foe.warded || foe.parrying) {
      this.comic.pop('DENIED!', at, this.spec.accent, 0.9);
      playBoing();
      doodle.bounce(foe.root.position, 0.9);
      this.flash(foe.warded ? `The ward sends ${doodle.name} flying back` : `Parried! ${doodle.name} comes flying back`, 1.5);
      return;
    }
    const speed = doodle.vel.length();
    const energy = 0.5 * doodle.mass * speed * speed;
    let damage = Math.round(Math.min(MAX_HIT, Math.max(6, energy * DAMAGE_PER_JOULE)) * (onHead ? HEAD_BONUS : 1));
    damage = this.hurt(this.throughArmor(damage, at), at);
    this.count(energy, doodle.mass, speed, onHead);
    this.tally.bonks++;
    doodle.bonks++;
    foe.flinch();
    playBonk(0.16);
    playBoom(0.05 + damage * 0.002);
    this.impact(foe, at, damage, onHead, doodle.color);
    this.comic.pop('WHAM!', at.clone().setY(at.y + 0.1), hex(doodle.color), 1.1);
    this.showScore(at, damage, energy, doodle.mass, speed, onHead);
    doodle.bounce(foe.root.position, 0.5);
    if (this.rivalHealth <= 0) this.end(true);
    else if (doodle.bonks >= DOODLE_BONKS) this.popDoodle(doodle, true);
  }

  private popDoodle(doodle: Doodle, show: boolean): void {
    if (show) {
      this.splashAt(doodle.pos, doodle.color);
      playPop();
    }
    const i = this.doodles.indexOf(doodle);
    if (i >= 0) this.doodles.splice(i, 1);
    doodle.dispose();
  }

  // ============================================================ Grab, throw

  private grab(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const held = this.inks.find((i) => i.state === 'held' && i.hand === h);
      const p = this.group.worldToLocal(this.v.copy(hand.pinch));
      if (held) {
        held.pos.copy(p).add(held.grabOffset);
        held.mesh.position.copy(held.pos);
        if (hand.pinchEnded || !hand.tracked) this.release(held, h);
        return;
      }
      if (!hand.pinchStarted || this.drawing[h] || this.doodles.some((d) => d.hand === h)) return;
      const ink = this.nearInk(p);
      if (ink && ink.state === 'hanging') {
        ink.state = 'held';
        ink.hand = h;
        ink.grabOffset.copy(ink.pos).sub(p);
        return;
      }
      const doodle = this.nearDoodle(p);
      if (doodle) {
        doodle.hold(h);
      }
    });
  }

  private release(ink: Ink, h: number): void {
    const v = throwVelocity(this.history[h], this.time, this.w);
    if (!v || v.length() < 0.5) {
      ink.state = 'hanging';
      ink.age = 0;
      return;
    }
    // Heavy ink leaves the hand slower: the arm has to accelerate it too.
    const arm = 0.6;
    ink.vel.copy(v).multiplyScalar(1.7 * (arm / (arm + ink.mass)));
    ink.spin = (Math.random() - 0.5) * 6;
    ink.state = 'flying';
    ink.age = 0;
    playThrow();
  }

  private record(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const list = this.history[h];
      if (!hand.tracked) {
        list.length = 0;
        return;
      }
      list.push({ t: this.time, p: this.group.worldToLocal(hand.pinch.clone()) });
      while (list.length && list[0].t < this.time - 0.5) list.shift();
    });
  }

  // ================================================================ Flight

  private fly(dt: number): void {
    const foe = this.foe;
    for (const ink of [...this.inks]) {
      ink.age += dt;
      if (ink.state === 'hanging') {
        ink.mesh.position.set(ink.pos.x, ink.pos.y + Math.sin(this.time * 2 + ink.pos.x * 30) * 0.003, ink.pos.z);
        const fade = Math.max(0, Math.min(1, (HANG_TIME - ink.age) / 1.5));
        ink.mesh.scale.setScalar(Math.max(0.01, fade));
        if (ink.age > HANG_TIME) this.remove(ink);
        continue;
      }
      if (ink.state !== 'flying') continue;
      ink.vel.y -= GRAVITY * dt;
      if (ink.accel) ink.vel.addScaledVector(ink.accel, dt);
      ink.pos.addScaledVector(ink.vel, dt);
      ink.mesh.position.copy(ink.pos);
      ink.mesh.rotateZ(ink.spin * dt);
      if (Math.random() < dt * 40) this.sparks.emit(ink.pos, this.v.set(0, 0, 0), { life: 0.3, size: [0.008, 0.002], from: ink.rival ? this.spec.glow : 0xbfe4ff });

      if (ink.rival) {
        // Blocked by a drawing hanging in the air?
        const shield = this.inks.find((s) => !s.rival && s.state === 'hanging' && s.points.some((q) => this.w.copy(q).add(s.pos).distanceTo(ink.pos) < 0.03));
        if (shield) {
          this.splashAt(ink.pos, this.spec.ink);
          playSplat(0.06);
          this.comic.pop('BLOCKED!', ink.pos, '#7fd0ff', 0.7, 0.8);
          this.flash('Blocked!', 1);
          this.tally.blocked++;
          this.superMeter = Math.min(1, this.superMeter + 0.08);
          this.remove(ink);
          shield.age = Math.max(shield.age, HANG_TIME - 1.5);
          continue;
        }
        // A living drawing in the way takes the hit.
        const victim = this.doodles.find((d) => d.loose && d.pos.distanceTo(ink.pos) < d.radius + 0.025);
        if (victim) {
          this.comic.pop('DOWN', victim.pos, hex(this.spec.glow), 0.8);
          this.flash(FALLEN_LINES[Math.floor(Math.random() * FALLEN_LINES.length)].replace('%d', victim.name), 1.8);
          this.popDoodle(victim, true);
          this.remove(ink);
          continue;
        }
        if (ink.pos.distanceTo(this.head) < ink.reach) {
          this.splashAt(ink.pos, this.spec.ink);
          playSplat(0.1);
          this.remove(ink);
          // Still wiping the last one off: this one costs nothing.
          if (this.grace > 0 || this.god) continue;
          this.grace = GRACE;
          this.hearts--;
          this.mistakes++;
          this.flash(this.hearts > 1 ? 'Splat! Right in the face' : 'Splat! One heart left');
          if (this.hearts <= 0) this.end(false);
          continue;
        }
        if (ink.age > 3.5) this.remove(ink);
        continue;
      }
      if (foe && this.mode === 'fight') {
        this.react(foe, ink.pos, ink.vel, ink);
        const result = this.strike(foe, ink);
        if (result === 'hit') {
          this.remove(ink);
          continue;
        }
        if (result === 'returned') continue;
      }
      const onPaper = this.paper.worldToLocal(this.group.localToWorld(this.v.copy(ink.pos)));
      if (onPaper.z <= 0.015) {
        this.hitScreen(ink, onPaper);
        this.remove(ink);
      } else if (ink.pos.y < -0.6 || ink.age > 4) {
        this.remove(ink);
      }
    }
  }

  /**
   * They see something coming (once per throw, 70 cm out) and may answer it:
   * a roll aside, a duck, a parry. What, and how often, is their character.
   */
  private react(foe: Rival3D, pos: Vector3, vel: Vector3, thing: { seen?: boolean }): void {
    const marked = thing as { seen?: boolean };
    if (marked.seen) return;
    const to = foe.chestAt(this.w).sub(pos);
    if (to.length() > 0.7 || to.dot(vel) <= 0) return;
    marked.seen = true;
    if (foe.busy) return;
    const r = Math.random();
    switch (this.spec.ability) {
      case 'burst':
        if (r < 0.35) this.roll(foe, pos);
        break;
      case 'tumble':
        if (r < 0.55) this.roll(foe, pos);
        break;
      case 'duck':
        if (r < 0.65 && foe.has('dodge')) foe.play('dodge');
        break;
      case 'parry':
        if (r < 0.5) {
          foe.play('skill');
          sfx.slice();
        } else if (r < 0.65) this.roll(foe, pos);
        break;
    }
  }

  /** A roll to a new spot along the hill, away from what is coming. */
  private roll(foe: Rival3D, from: Vector3 | null): void {
    if (!foe.has('dodge')) return;
    let dir = Math.random() < 0.5 ? -1 : 1;
    if (from) {
      const lateral = this.v.copy(from).sub(foe.root.position).dot(this.side);
      dir = lateral > 0 ? -1 : 1;
    }
    let next = this.offset + dir * (0.13 + Math.random() * 0.06);
    // Never stop in front of the screen's middle: roll on across it, or back.
    if (Math.abs(next) < SIDE_NEAR) next = Math.sign(next || dir) * (SIDE_NEAR + 0.02);
    if (Math.abs(next) > SIDE_FAR) next = this.offset - dir * 0.14;
    this.offset = Math.max(-SIDE_FAR, Math.min(SIDE_FAR, next));
    const spot = this.v.copy(this.rivalSpot).addScaledVector(this.side, this.offset);
    spot.y = this.groundFast(spot);
    foe.play('dodge');
    foe.slide(spot, Math.max(0.45, foe.duration('dodge') * 0.8));
    playWhoosh(0.3);
  }

  /** Did a thrown drawing reach the rival: a ward, a blade, the head or the body? */
  private strike(foe: Rival3D, ink: Ink): 'miss' | 'hit' | 'returned' {
    if (ink.power) {
      if (foe.distanceTo(ink.pos, this.w) > this.spec.girth + 0.03) return 'miss';
      return this.superHit(foe, ink);
    }
    if (foe.warded && ink.pos.distanceTo(foe.wardAt(this.w)) < foe.wardRadius() + 0.02) {
      for (let i = 0; i < 16; i++) {
        this.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.4);
        this.sparks.emit(ink.pos, this.v, { life: 0.4, size: [0.012, 0.002], from: 0x8affb8 });
      }
      playSplat(0.05);
      this.flash('Her ward of runes stops it! Wait for it to fade', 1.4);
      return 'hit';
    }
    if (foe.parrying && ink.pos.distanceTo(foe.chestAt(this.w)) < 0.2) {
      this.sendBack(ink);
      return 'returned';
    }
    const onHead = ink.pos.distanceTo(foe.headAt(this.w)) < 0.06;
    if (!onHead && foe.distanceTo(ink.pos, this.w) > this.spec.girth) return 'miss';
    const speed = ink.vel.length();
    const energy = 0.5 * ink.mass * speed * speed;
    const base = Math.min(MAX_HIT, Math.max(5, energy * DAMAGE_PER_JOULE));
    if (ink.power) return this.superHit(foe, ink);
    const damage = this.hurt(this.throughArmor(Math.round(base * (onHead ? HEAD_BONUS : 1)), ink.pos), ink.pos);
    this.count(energy, ink.mass, speed, onHead);
    foe.flinch();
    this.splashAt(ink.pos, 0x4aa8ff);
    playBoom(0.06 + damage * 0.002);
    this.impact(foe, ink.pos, damage, onHead, 0x9fd8ff);
    // Morwen, wounded at last: her long, maniacal cackle, once.
    if (this.spec.id === 'morwen' && !this.laughedHurt && this.rivalHealth > 0 && this.rivalHealth < this.maxHealth * 0.7) {
      this.laughedHurt = true;
      sfx.witchCloseLaugh();
    }
    this.showScore(ink.pos, damage, energy, ink.mass, speed, onHead);
    if (this.rivalHealth <= 0) this.end(true);
    return 'hit';
  }

  /** Thick Hide: a soft hit mostly bounces off. Returns the damage that gets through. */
  private throughArmor(damage: number, at: Vector3): number {
    if (this.spec.ability !== 'armor' || damage >= ARMOR_THRESHOLD) return damage;
    this.comic.pop('CLANG!', at, '#b8c8e0', 0.8);
    sfx.block();
    this.flash('It bounces off his hide! Draw bigger, throw harder: ½mv²', 2);
    return Math.max(1, Math.round(damage * 0.3));
  }

  /** A big hit lands with weight: a few frozen frames, a ring of light, a word. */
  private impact(foe: Rival3D, at: Vector3, damage: number, head: boolean, color: number): void {
    if (damage < 22 && !head) return;
    foe.freeze = 0.09;
    this.shock.position.copy(at);
    (this.shock.material as MeshBasicMaterial).color.setHex(color);
    this.shockTime = 0;
    if (head) this.comic.pop('HEADSHOT!', this.u.copy(at).setY(at.y + 0.12), '#ff8a3a', 1);
    else if (damage >= 30) this.comic.pop('HUGE!', this.u.copy(at).setY(at.y + 0.12), '#ffd23a', 1);
  }

  /** Parried: your ink is theirs now, and it is coming back at your face. */
  private sendBack(ink: Ink): void {
    ink.rival = true;
    ink.mesh.material = this.dark;
    const T = 0.75;
    ink.vel.copy(this.head).sub(ink.pos).divideScalar(T);
    ink.vel.y += 0.5 * GRAVITY * T;
    ink.accel = null;
    ink.age = 0;
    ink.spin = 14;
    sfx.block();
    this.comic.pop('PARRY!', ink.pos, this.spec.accent, 1);
    this.flash('Parried! It is coming straight back: block it!', 1.6);
    for (let i = 0; i < 12; i++) {
      this.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.4);
      this.sparks.emit(ink.pos, this.v, { life: 0.35, size: [0.012, 0.002], from: this.spec.glow });
    }
  }

  private hitScreen(ink: Ink, at: Vector3): void {
    const speed = ink.vel.length();
    const energy = 0.5 * ink.mass * speed * speed;
    this.splat(at);
    playSplat(0.08);
    if (this.mode !== 'fight') return;
    if (this.foe) {
      this.flash(this.foe.ducking ? 'He ducked under it! Aim lower, at his chest' : this.foe.sliding ? 'Dodged! Throw again as they land' : 'Missed! Throw a little higher: ink falls on the way', 1.4);
      return;
    }
    if (this.rival.shielded(at)) {
      this.flash('Blocked by the Rival’s shield!', 1.2);
      return;
    }
    if (!this.rival.hit(at)) {
      this.flash('Missed! Throw higher: ink falls on the way', 1.4);
      return;
    }
    const damage = this.hurt(Math.round(Math.min(MAX_HIT, Math.max(5, energy * DAMAGE_PER_JOULE))), null);
    this.count(energy, ink.mass, speed, false);
    this.rival.flinch();
    playBoom(0.06 + damage * 0.002);
    this.showScore(this.group.worldToLocal(this.paper.localToWorld(at.clone())), damage, energy, ink.mass, speed, false);
    if (this.rivalHealth <= 0) this.end(true);
  }

  private count(energy: number, mass: number, speed: number, head: boolean): void {
    const t = this.tally;
    t.hits++;
    if (head) t.heads++;
    if (energy > t.best.energy) t.best = { energy, mass, speed };
  }

  // ========================================================= Phases, super

  /**
   * Every hit on the rival comes through here. A hit never carries past the
   * end of a phase: the last third of their health is always a fight of its
   * own. Crossing into a new phase powers them up. Damage you deal fills
   * your super meter. Returns the damage that landed.
   */
  private hurt(damage: number, at: Vector3 | null, fill = true): number {
    if (damage <= 0 || this.mode !== 'fight') return 0;
    if (this.immune > 0) {
      if (at) this.comic.pop('IMMUNE', at, '#b8c8e0', 0.7, 0.7);
      return 0;
    }
    const floor = this.phase === 1 ? (this.maxHealth * 2) / 3 : this.phase === 2 ? this.maxHealth / 3 : 0;
    const dealt = Math.min(damage, Math.max(1, Math.ceil(this.rivalHealth - floor)));
    this.rivalHealth -= dealt;
    if (fill) this.superMeter = Math.min(1, this.superMeter + dealt / (this.maxHealth * SUPER_FILL));
    if (this.rivalHealth > 0 && this.rivalHealth <= floor + 0.001) this.enterPhase(this.phase + 1);
    return dealt;
  }

  /** Into phase 2 or 3: a moment untouchable, a burst of ink, and everything they do gets worse. */
  private enterPhase(phase: number): void {
    this.phase = phase;
    this.immune = PHASE_SHIELD;
    this.ultimate = 4;
    this.nextRival = PHASE_SHIELD + 0.4;
    this.pending.length = 0;
    const foe = this.foe;
    if (foe) {
      foe.play('idle');
      foe.play(foe.has('taunt') && this.spec.ability !== 'ward' ? 'taunt' : 'skill');
      foe.freeze = 0.2;
      foe.chestAt(this.v);
      this.shock.position.copy(this.v);
      (this.shock.material as MeshBasicMaterial).color.setHex(this.spec.glow);
      this.shockTime = 0;
      for (let i = 0; i < 40; i++) {
        this.w.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * 0.5);
        this.splashes.emit(this.v, this.w, { life: 0.8, gravity: 1.5, drag: 0.9, size: [0.014, 0.026], from: this.spec.glow, alpha: 0.85 });
      }
    }
    sfx.telegraph();
    if (this.spec.id === 'morwen') sfx.witchCloseLaugh();
    this.comic.pop(phase === 2 ? 'PHASE 2' : 'FINAL PHASE', this.front(), this.spec.accent, 1.6, 1.8);
    this.flash(phase === 2 ? `${this.spec.name} powers up: faster, and an ultimate is coming` : `${this.spec.name} is desperate: everything at once. Finish it!`, 2.6);
  }

  /**
   * Their ultimate, Ink Storm (phase 2 and 3): after a warning, ink rains
   * down on you from above the hill, a few at a time, from different
   * heights and angles. Hanging drawings still block it.
   */
  private castUltimate(foe: Rival3D): void {
    const count = this.phase >= 3 ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const from = foe.chestAt(new Vector3());
      from.addScaledVector(this.side, (Math.random() - 0.5) * 0.7);
      from.y += 0.25 + Math.random() * 0.25;
      this.rain.push({ delay: 1.1 + i * (this.phase >= 3 ? 0.28 : 0.4), from });
    }
    foe.play('skill');
    sfx.telegraph();
    this.comic.pop('INK STORM', this.above(0.2), this.spec.accent, 1.2, 1.4);
    this.flash('Ink Storm incoming! Hang drawings above you as a roof', 2.2);
  }

  private rainDown(dt: number): void {
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const drop = this.rain[i];
      drop.delay -= dt;
      if (drop.delay > 0) continue;
      this.rain.splice(i, 1);
      this.shoot(drop.from, 'arc', { flight: 0.95 + Math.random() * 0.35 });
    }
  }

  /**
   * Your super, Lantern Burst. When the meter is full, pinch with both hands
   * and pull them apart: eight bolts of light leave the space between your
   * hands, fixed damage each, through any ward, parry or hide.
   */
  private watchSuper(hands: readonly HandState[]): void {
    if (this.superMeter >= 1 && !this.superReady) {
      this.superReady = true;
      this.comic.pop('SUPER READY', this.v.copy(this.head).add(this.w.set(0, -0.12, -0.35)), '#ffc928', 0.8, 1.4);
      sfx.armed();
    }
    const [a, b] = hands;
    const both = !!a && !!b && a.tracked && b.tracked && a.pinching && b.pinching;
    if (!this.superReady || !both) {
      this.pullStart = -1;
      return;
    }
    const gap = a.pinch.distanceTo(b.pinch);
    if (this.pullStart < 0) this.pullStart = gap;
    else if (gap - this.pullStart > 0.18) {
      this.group.worldToLocal(this.v.copy(a.pinch).add(b.pinch).multiplyScalar(0.5));
      this.fireSuper(this.v);
      this.pullStart = -1;
      // Those pinches made no drawings.
      for (let h = 0; h < 2; h++) {
        const ink = this.drawing[h];
        this.drawing[h] = null;
        if (ink) this.remove(ink);
      }
    }
  }

  private fireSuper(from: Vector3): void {
    const foe = this.foe;
    if (!foe || this.mode !== 'fight') return;
    this.superMeter = 0;
    this.superReady = false;
    const start = from.clone();
    for (let i = 0; i < SUPER_BOLTS; i++) {
      const ink = this.newInk(false, start);
      const a = (i / SUPER_BOLTS) * Math.PI * 2;
      ink.points = [new Vector3(-0.02, 0, 0), new Vector3(0, 0.012, 0), new Vector3(0.02, 0, 0), new Vector3(0, -0.012, 0), new Vector3(-0.02, 0, 0)];
      ink.mass = 0.02;
      ink.power = SUPER_DAMAGE;
      this.rebuild(ink);
      const T = 0.45 + i * 0.06;
      foe.chestAt(this.w);
      ink.vel.copy(this.w).sub(start).divideScalar(T);
      ink.vel.addScaledVector(this.side, Math.cos(a) * 0.5);
      ink.vel.y += 0.5 * GRAVITY * T + Math.sin(a) * 0.3;
      ink.accel = this.side.clone().multiplyScalar(-Math.cos(a) * 0.5 / T * 2);
      ink.spin = 14;
      ink.state = 'flying';
    }
    this.shock.position.copy(start);
    (this.shock.material as MeshBasicMaterial).color.setHex(0xffc928);
    this.shockTime = 0;
    playBoom(0.12);
    sfx.success();
    this.comic.pop('LANTERN BURST', this.v.copy(start).setY(start.y + 0.1), '#ffc928', 1.2, 1.4);
  }

  /** A bolt of your super lands. */
  private superHit(foe: Rival3D, ink: Ink): 'hit' {
    const damage = this.hurt(ink.power ?? 0, ink.pos, false);
    if (damage > 0) {
      foe.flinch();
      this.splashAt(ink.pos, 0xffc928);
      this.tally.hits++;
      if (this.rivalHealth <= 0) this.end(true);
    }
    return 'hit';
  }

  // ================================================================= Herbs

  /**
   * While you are hurt, a healing herb grows in the air within reach every
   * so often. Pinch it before it wilts: one heart back.
   */
  private tendHerb(dt: number, hands: readonly HandState[]): void {
    if (!this.herb) {
      if (this.hearts >= PLAYER_HEARTS) return;
      this.herbTimer -= dt;
      if (this.herbTimer > 0) return;
      this.herbTimer = HERB_EVERY[0] + Math.random() * (HERB_EVERY[1] - HERB_EVERY[0]);
      const towards = this.v.copy(this.paper.position).sub(this.head).setY(0).normalize();
      const at = this.head.clone().addScaledVector(towards, 0.3).addScaledVector(this.side, (Math.random() < 0.5 ? -1 : 1) * 0.17);
      at.y -= 0.22;
      const group = herbSprig();
      group.position.copy(at);
      this.group.add(group);
      this.herb = { group, at, life: HERB_LIFE };
      playCollect(0.025);
      this.flash('A healing herb! Pinch it for a heart back', 2.2);
      return;
    }
    const herb = this.herb;
    herb.life -= dt;
    const grow = Math.min(1, (HERB_LIFE - herb.life) / 0.4);
    const wilt = Math.min(1, herb.life / 1.2);
    herb.group.scale.setScalar(Math.max(0.01, grow * wilt));
    herb.group.position.y = herb.at.y + Math.sin(this.time * 2.2) * 0.008;
    herb.group.rotation.y += dt * 0.8;
    for (const hand of hands) {
      if (!hand.tracked || !hand.pinchStarted) continue;
      if (this.group.worldToLocal(this.w.copy(hand.pinch)).distanceTo(herb.group.position) > HERB_REACH) continue;
      this.hearts = Math.min(PLAYER_HEARTS, this.hearts + 1);
      for (let i = 0; i < 18; i++) {
        this.v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 0.25);
        this.sparks.emit(herb.group.position, this.v, { life: 0.6, size: [0.012, 0.002], from: 0x7be36a });
      }
      sfx.success();
      this.comic.pop('+1 ♥', herb.group.position, '#7be36a', 0.7, 1);
      this.flash('Healed: one heart back', 1.4);
      this.dropHerb();
      return;
    }
    if (herb.life <= 0) this.dropHerb();
  }

  private dropHerb(): void {
    if (!this.herb) return;
    disposeHerb(this.herb.group);
    this.herb = null;
  }

  /** Your best throws, for the Inventor's Journal (only a win fills the page). */
  journal(): string[] {
    if (!this.won) return [];
    const { hits, heads, blocked, bonks, best } = this.tally;
    return [
      `Beat ${this.spec.name} ${this.spec.title} · best throw ½ · ${(best.mass * 1000).toFixed(0)} g · (${best.speed.toFixed(1)} m/s)² = ${best.energy.toFixed(2)} J`,
      `${hits} hits, ${heads} on the head · ${this.hearts} of ${PLAYER_HEARTS} hearts left`,
      `${blocked} throws blocked by your hanging drawings · ${bonks} head-butts from drawings that came alive`,
    ];
  }

  private end(won: boolean): void {
    if (this.mode === 'won' || this.mode === 'lost') return;
    this.won = won;
    this.setMode(won ? 'won' : 'lost');
    this.pending.length = 0;
    this.rain.length = 0;
    this.dropHerb();
    for (const ink of [...this.inks]) if (ink.rival) this.remove(ink);
    const foe = this.foe;
    if (won) {
      recordWin(this.spec.id);
      stage.confetti = true;
      this.comic.pop('K.O.!', this.front(), '#ffd23a', 1.9, 2);
      sfx.defeated();
    }
    // Beaten, they fall; winning, they gloat.
    if (foe) {
      foe.freeze = won ? 0.25 : 0;
      foe.play(won ? 'death' : foe.has('taunt') ? 'taunt' : 'skill');
      if (this.spec.id === 'morwen') {
        if (won) sfx.witchShriek();
        else sfx.witchCloseLaugh();
      }
    }
  }

  // ============================================================ Their turn

  private rivalTurn(dt: number): void {
    const foe = this.foe;
    if (foe) {
      this.volley(dt, foe);
      this.foeTurn(dt, foe);
      return;
    }
    this.nextRival -= dt;
    if (this.nextRival <= 0 && this.rival.drawing === 0) {
      if (Math.random() < 0.25 && this.rivalHealth < this.maxHealth * 0.7) {
        this.rival.raiseShield(3);
        this.nextRival = 3.5;
      } else {
        this.rival.drawing = 0.001;
        this.nextRival = 4 + Math.random() * 1.5;
      }
    }
    if (this.rival.drawing > 0) {
      this.rival.drawing += dt;
      if (this.rival.drawing > 1.3) {
        this.rival.drawing = 0;
        this.shoot(this.group.worldToLocal(this.paper.localToWorld(this.rival.quillAt(new Vector3()))), 'arc');
      }
    }
  }

  /**
   * What they do next. Everyone throws and attacks in their own way; hurt
   * (under 70%), they speed up and use their special more. Vex also just
   * moves: she never stays where you last aimed.
   */
  private foeTurn(dt: number, foe: Rival3D): void {
    this.nextRival -= dt;
    this.ultimate -= dt;
    if (this.nextRival > 0 || foe.busy || this.immune > 0) return;
    const hurt = this.phase >= 2;
    const [fresh, pressed] = this.spec.pace;
    // Each phase is faster; no two waits are the same length.
    const pace = (hurt ? pressed : fresh) * (this.phase >= 3 ? 0.75 : 1) * (0.75 + Math.random() * 0.5);
    const r = Math.random();
    if (this.phase >= 2 && this.ultimate <= 0) {
      this.ultimate = ULTIMATE_EVERY[this.phase >= 3 ? 1 : 0] * (0.85 + Math.random() * 0.3);
      this.castUltimate(foe);
      this.nextRival = 3.4;
      return;
    }
    // Everyone moves: a walk to a new spot beside the screen, never in front of its middle.
    if (r < 0.28 && this.spec.ability !== 'tumble') {
      this.stroll(foe);
      return;
    }
    // Vex moves about, but never twice running: a roll is always followed by an attack.
    if (this.spec.ability === 'tumble' && r < 0.35 && !this.justRolled) {
      this.roll(foe, null);
      this.justRolled = true;
      this.nextRival = 0.4;
      return;
    }
    this.justRolled = false;
    // A parry is an answer, never an opening move; a ward only once she is hurt.
    const special = this.spec.ability === 'parry' ? 0 : this.spec.ability === 'ward' ? (hurt ? 0.25 : 0.1) : this.phase >= 3 ? 0.4 : hurt ? 0.3 : 0.16;
    const roll = Math.random();
    if (roll < special) {
      foe.play('skill');
      this.nextRival = pace + 0.9;
    } else if (roll < special + (hurt ? 0.4 : 0.3)) {
      foe.play('attack');
      this.nextRival = pace * 0.78;
    } else {
      foe.play('throw');
      this.nextRival = pace + Math.random();
    }
  }

  /** A walk (a run, when hurt) to a new spot on one side or the other. */
  private stroll(foe: Rival3D): void {
    const side = Math.random() < 0.6 ? -Math.sign(this.offset || 1) : Math.sign(this.offset || 1);
    this.offset = side * (SIDE_NEAR + Math.random() * (SIDE_FAR - SIDE_NEAR));
    const spot = this.v.copy(this.rivalSpot).addScaledVector(this.side, this.offset);
    spot.y = this.groundFast(spot);
    const seconds = foe.walkTo(spot, this.phase >= 2 ? 0.55 : 0.32);
    this.nextRival = seconds + 0.15;
  }

  /** A hand let go: what leaves it depends on the move and on who they are. */
  private onRelease(foe: Rival3D, hand: Object3D, by: RivalMove): void {
    const from = foe.handAt(hand, new Vector3());
    if (by === 'throw' || by === 'attack') {
      this.shoot(from, this.spec.shots[by]);
      this.voiceOf(by);
      return;
    }
    if (by !== 'skill') return;
    switch (this.spec.ability) {
      case 'burst':
        // Three pellets, a sixth of a second apart.
        this.shoot(from, 'pellet');
        this.pending.push({ delay: 0.17, hand, shot: 'pellet' }, { delay: 0.34, hand, shot: 'pellet' });
        this.comic.pop('BRRRT!', from, this.spec.accent, 0.7, 0.8);
        sfx.shoot();
        break;
      case 'duck':
        // A fan of three: the same aim, three different arcs, so they land one after another.
        this.shoot(from, 'bolt', { flight: 0.8 });
        this.shoot(from, 'arc', { flight: 1.1 });
        this.shoot(from, 'arc', { flight: 1.4 });
        sfx.slice();
        break;
      case 'tumble':
        // Two curveballs, bending in from either side.
        this.shoot(from, 'curve', { curve: 1 });
        this.shoot(from, 'curve', { curve: -1, flight: 1.4 });
        playWhoosh(0.6);
        break;
      case 'armor': {
        // The slam: the ground throws up a wave of heavy ink.
        const feet = this.v.copy(foe.root.position);
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          this.w.set(Math.cos(a) * (0.5 + Math.random() * 0.3), 0.25 + Math.random() * 0.5, Math.sin(a) * (0.5 + Math.random() * 0.3));
          this.splashes.emit(feet, this.w, { life: 0.6, gravity: 3, drag: 1.2, size: [0.014, 0.024], from: this.spec.glow, alpha: 0.8 });
        }
        this.comic.pop('SLAM!', this.above(0.15), this.spec.accent, 1.3);
        sfx.wallBreak();
        const chest = foe.chestAt(new Vector3());
        this.shoot(chest, 'heavy');
        this.pending.push({ delay: 0.3, hand, shot: 'heavy', flight: 1.3 }, { delay: 0.6, hand, shot: 'arc' });
        break;
      }
      default:
        break;
    }
  }

  private voiceOf(by: RivalMove): void {
    switch (this.spec.id) {
      case 'morwen':
        // She laughs after every throw, whether or not it hits.
        sfx.witchAttackLaugh();
        break;
      case 'vance':
        sfx.shoot();
        break;
      case 'rook':
      case 'kai':
        if (by === 'throw' && this.spec.id === 'rook') sfx.slice();
        else playThrow();
        break;
      case 'vex':
        playWhoosh(0.5);
        break;
      default:
        sfx.throw();
    }
  }

  /** The rest of a volley, each shot in its turn. */
  private volley(dt: number, foe: Rival3D): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const shot = this.pending[i];
      shot.delay -= dt;
      if (shot.delay > 0) continue;
      this.pending.splice(i, 1);
      this.shoot(foe.handAt(shot.hand, new Vector3()), shot.shot, { flight: shot.flight, curve: shot.curve });
      if (shot.shot === 'pellet') sfx.shoot();
      else playThrow();
    }
  }

  /**
   * Ink leaves the rival and flies at the player's face (or, now and then,
   * at a living drawing that is bothering them). Aimed to arrive in T
   * seconds under gravity: v = d/T + ½gT upward. A curveball also carries a
   * steady sideways push a, so it starts off-line by ½aT² and bends back in.
   */
  private shoot(start: Vector3, kind: Shot, options: { flight?: number; curve?: number } = {}): void {
    const shot = SHOTS[kind];
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const ink = this.newInk(true, start);
    ink.points = shape.map(([x, y]) => new Vector3(x * shot.size, y * shot.size, 0));
    ink.mass = this.inkLength(ink) * INK_DENSITY;
    ink.reach = shot.reach;
    this.rebuild(ink);
    const T = options.flight ?? shot.flight;
    const pest = kind !== 'pellet' && Math.random() < 0.3 ? this.doodles.find((d) => d.state === 'ground') : undefined;
    const target = pest ? pest.pos : this.head;
    ink.vel.copy(target).sub(start).divideScalar(T);
    if (!pest) ink.vel.addScaledVector(this.side, (Math.random() - 0.5) * shot.scatter);
    ink.vel.y += 0.5 * GRAVITY * T;
    if (kind === 'curve') {
      const a = (options.curve ?? (Math.random() < 0.5 ? -1 : 1)) * 3.4;
      ink.accel = this.side.clone().multiplyScalar(a);
      ink.vel.addScaledVector(ink.accel, -0.5 * T);
    }
    ink.spin = (Math.random() - 0.5) * shot.spin;
    ink.state = 'flying';
    if (kind !== 'pellet') playThrow();
  }

  // =============================================================== Effects

  private splashAt(at: Vector3, color: number): void {
    for (let i = 0; i < 24; i++) {
      this.w.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 0.4);
      this.splashes.emit(at, this.w, { life: 0.5 + Math.random() * 0.4, gravity: 3, drag: 0.8, size: [0.012, 0.02], from: color, alpha: 0.9 });
    }
  }

  /** Ink lands on the screen and stays there, a little blot. */
  private splat(at: Vector3): void {
    const mesh = new Mesh(new CircleGeometry(0.03 + Math.random() * 0.02, 12), this.splatMaterial);
    mesh.position.set(at.x, at.y, 0.0035 + this.splats.length * 0.0001);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.renderOrder = 3;
    this.paper.add(mesh);
    this.splats.push(mesh);
    if (this.splats.length > 12) {
      const old = this.splats.shift()!;
      this.paper.remove(old);
      old.geometry.dispose();
    }
  }

  /** The damage and the energy behind it, floating up from where it hit (group space). */
  private showScore(at: Vector3, damage: number, energy: number, mass: number, speed: number, head: boolean): void {
    const { canvas, texture, mesh } = this.score;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.font = `700 64px ${FONT}`;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.strokeText(`${damage}!`, 128, 64);
    g.fillStyle = head ? '#d0501a' : '#1a6fd0';
    g.fillText(`${damage}!`, 128, 64);
    g.font = `700 21px ${FONT}`;
    g.lineWidth = 5;
    const sum = `½mv² = ½·${(mass * 1000).toFixed(0)}g·${speed.toFixed(1)}² = ${energy.toFixed(2)} J`;
    g.strokeText(sum, 128, 104);
    g.fillStyle = '#2a2030';
    g.fillText(sum, 128, 104);
    texture.needsUpdate = true;
    // Above where it hit, and clear of the name plate.
    const above = this.foe ? this.foe.root.position.y + this.spec.height + 0.17 : at.y + 0.08;
    mesh.position.set(at.x, Math.max(at.y + 0.08, above), at.z);
    mesh.lookAt(this.headWorld);
    mesh.visible = true;
    this.score.time = 1.8;
    if (this.noteTime <= 0 || !this.note.includes('hide')) this.flash(head ? 'Right on the head! Half again the damage' : damage >= 25 ? 'Huge hit!' : 'Hit!', 1.2);
  }

  private drawHud(dt: number): void {
    this.heartMeshes.forEach((heart, i) => {
      (heart.material as MeshBasicMaterial).opacity = i < this.hearts ? 0.95 : 0.15;
    });
    this.superBar.scale.x += (Math.max(0.001, this.superMeter) - this.superBar.scale.x) * Math.min(1, dt * 8);
    const ready = this.superMeter >= 1;
    (this.superBar.material as MeshBasicMaterial).color.setHex(ready && Math.sin(this.time * 10) > 0 ? 0xffffff : 0xffc928);
    this.superBar.visible = this.superFrame.visible = this.mode === 'fight' || this.mode === 'ready';
    const k = Math.max(0, this.rivalHealth / this.maxHealth);
    this.bar.scale.x += (Math.max(0.001, k) - this.bar.scale.x) * Math.min(1, dt * 6);
    if (this.score.time > 0) {
      this.score.time -= dt;
      this.score.mesh.position.y += dt * 0.03;
      (this.score.mesh.material as MeshBasicMaterial).opacity = Math.min(1, this.score.time);
      if (this.score.time <= 0) this.score.mesh.visible = false;
    }
  }

  // =================================================================== Dev

  private devDraw(): void {
    const at = this.head.clone().add(new Vector3(0.05, -0.2, -0.35));
    const ink = this.newInk(false, at);
    ink.points = SHAPES[2].map(([x, y]) => new Vector3(x * 2, y * 2, 0));
    ink.mass = this.inkLength(ink) * INK_DENSITY;
    ink.state = 'hanging';
    this.rebuild(ink);
  }

  /** Dev: a closed shape drawn in front of you (a different one each time) comes alive. */
  private devDoodle(): void {
    if (this.doodles.length >= MAX_DOODLES) return;
    const at = this.head.clone().add(new Vector3(-0.1 + this.doodles.length * 0.12, -0.15, -0.4));
    const ink = this.newInk(false, at);
    const which = this.devShape++ % 4;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // A circle, a tall bean, a wide slab, a five-pointed star.
      const r = which === 3 ? 0.035 + 0.03 * Math.abs(Math.cos(a * 2.5)) ** 3 : 0.05;
      const sx = which === 1 ? 0.5 : which === 2 ? 1.5 : 1;
      const sy = which === 1 ? 1.4 : which === 2 ? 0.55 : 1;
      ink.points.push(new Vector3(Math.cos(a) * r * sx, Math.sin(a) * r * sy, 0));
    }
    this.comeAlive(ink);
  }

  private devShape = 0;

  /** Dev: the Rival acts now (winds up and throws, or uses their special). */
  private devRival(move: 'throw' | 'skill'): void {
    if (!this.foe) {
      this.shoot(this.group.worldToLocal(this.paper.localToWorld(this.rival.quillAt(new Vector3()))), 'arc');
      return;
    }
    // Forced, even mid-move: this is for testing each special on demand.
    this.foe.play('idle');
    this.foe.play(move);
  }

  private devThrow(): void {
    const ink = this.inks.find((i) => !i.rival && i.state === 'hanging');
    if (!ink) return;
    const target = this.foe ? this.foe.chestAt(new Vector3()) : this.group.worldToLocal(this.paper.localToWorld(this.rival.bodyAt(new Vector3())));
    const T = 0.45;
    ink.vel.copy(target).sub(ink.pos).divideScalar(T);
    ink.vel.y += 0.5 * GRAVITY * T;
    ink.state = 'flying';
    ink.age = 0;
    playThrow();
  }
}

/** What the caption says when a living drawing lands a head-butt (%d the doodle, %r the rival). */
const BONK_LINES = [
  '%d rams %r',
  '%d strikes, and %r staggers',
  '%r did not see %d coming',
  '%d hits low and hard',
  'Keep drawing: %d cannot hold %r alone',
];

/** And when the rival's ink gets one. */
const FALLEN_LINES = ['%d takes the hit for you', '%d is struck down. Draw another!', '%d breaks apart into ink', '%d falls, and buys you a moment'];

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Least-squares release velocity over 140–40 ms ago (skipping tracking lag). */
function throwVelocity(samples: Sample[], now: number, out: Vector3): Vector3 | null {
  const window = samples.filter((s) => s.t <= now - 0.04 && s.t >= now - 0.14);
  if (window.length < 3) return null;
  const n = window.length;
  let st = 0;
  let stt = 0;
  const sp = new Vector3();
  const stp = new Vector3();
  for (const s of window) {
    st += s.t;
    stt += s.t * s.t;
    sp.add(s.p);
    stp.addScaledVector(s.p, s.t);
  }
  const denom = n * stt - st * st;
  if (Math.abs(denom) < 1e-9) return null;
  return out.copy(stp).multiplyScalar(n).addScaledVector(sp, -st).divideScalar(denom);
}

function splatTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(30,60,120,0.85)';
  g.beginPath();
  g.arc(64, 64, 34, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    const r = 34 + Math.random() * 22;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 5 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
