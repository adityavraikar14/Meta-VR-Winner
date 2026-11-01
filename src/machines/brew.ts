import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playCrackle, playDrip, playHiss, playIgnite, playPawl, playSplat } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { play, saveProgress } from '../progress.js';
import { stage } from '../stage-state.js';
import { glow } from './heat.js';
import { beam, iron, timber, wellHead } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * The healing draught, brewed the way herbalists did: herbs steeped in water
 * over a fire, the pot hung from an iron trammel whose notched bar sets its
 * height above the flames.
 *
 * Real heat and chemistry run it. The pot takes in radiant heat that falls
 * off with height, and loses heat to the air; at 100 °C the water boils and
 * the extra heat goes into evaporating it. The herbs' healing compounds
 * dissolve at a rate that rises with temperature (Arrhenius, Ea/R ≈ 4000 K)
 * but are also destroyed by heat, much faster when boiling (Ea/R ≈ 15000 K).
 * So a gentle simmer around 85–95 °C makes the strongest draught; boil it
 * hard and it weakens and boils away; keep it lukewarm and it takes ages.
 */

const PIT = new Vector3(0.0, 0, -0.14);
const POT_R = 0.045;
const POT_DEPTH = 0.05;
/** Trammel notches: the pot's bottom sits this high over the coals. */
const NOTCH = 0.01;
const LOW = 0.02;
const HIGH = 0.13;
const COALS_Y = 0.018;
const CRANE_Y = 0.24;
const RACK = new Vector3(-0.2, 0, 0.05);
const VIALS = new Vector3(0.2, 0, 0.05);
const READY = 0.72;
const HERBS = ['yarrow', 'comfrey', 'sage'] as const;
type Herb = (typeof HERBS)[number];

interface Pickable {
  group: Group;
  home: Vector3;
  hand: number;
  kind: Herb | 'ladle';
  used: boolean;
}

export class Brew {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  /** Pot bottom height over the coals. */
  private height = 0.08;
  private temperature = 18;
  private volume = 1;
  private potency = 0;
  private spoiled = 0;
  private herbs = new Set<Herb>();
  private ladleFull = false;
  private filled = 0;
  private time = 0;
  private note = '';
  private noteTime = 0;
  private dripIn = 0;
  private crackleIn = 0;
  private trammelHand = -1;
  private finishIn = -1;
  private trammelGrab = 0;

  private readonly pot = new Group();
  private readonly liquid: Mesh;
  private readonly liquidMaterial: MeshStandardMaterial;
  private readonly trammelBar = new Group();
  private readonly ring: Mesh;
  private readonly flames: Sprite[] = [];
  private readonly coalMaterial: MeshStandardMaterial;
  private readonly light = new PointLight(0xff9040, 0.15, 0.7, 2);
  private readonly bubbles = new ParticlePool({ count: 80, additive: false, soft: true });
  private readonly steam = new ParticlePool({ count: 90, additive: false, soft: true });
  private readonly items: Pickable[] = [];
  private readonly vials: Array<{ fill: Mesh; full: boolean }> = [];
  private readonly ladleBowl: Mesh;
  private readonly glowColor = new Color();
  private readonly v = new Vector3();
  private readonly w = new Vector3();

  constructor(private readonly floor: number) {
    const f = floor;
    this.group.name = 'Brew';

    // ---- Fire pit: a ring of stones, glowing coals, small flames.
    const ringOfStones = wellHead(0.05, 0.068, 0.022, 9);
    ringOfStones.position.set(PIT.x, f, PIT.z);
    this.group.add(ringOfStones);
    const lumps: BufferGeometry[] = [];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.045;
      const g = new DodecahedronGeometry(0.006 + Math.random() * 0.005, 0);
      g.translate(PIT.x + Math.cos(a) * r, f + 0.006 + Math.random() * 0.008, PIT.z + Math.sin(a) * r);
      lumps.push(g);
    }
    this.coalMaterial = new MeshStandardMaterial({ color: 0x161210, roughness: 0.95, flatShading: true });
    const coals = new Mesh(mergeGeometries(lumps)!, this.coalMaterial);
    coals.userData.keep = true;
    this.group.add(coals);
    const flameTexture = flame();
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(new SpriteMaterial({ map: flameTexture, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      s.center.set(0.5, 0.05);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(PIT.x + Math.cos(a) * (i ? 0.022 : 0), f + COALS_Y - 0.004, PIT.z + Math.sin(a) * (i ? 0.022 : 0));
      this.flames.push(s);
      this.group.add(s);
    }
    this.light.position.set(PIT.x, f + 0.06, PIT.z);
    this.group.add(this.light);

    // ---- Crane: an iron post beside the pit, an arm out over it, the trammel hanging.
    const postX = PIT.x + 0.1;
    const post = beam(new Vector3(postX, f, PIT.z), new Vector3(postX, f + CRANE_Y + 0.01, PIT.z), 0.007);
    post.material = iron();
    this.group.add(post);
    const arm = beam(new Vector3(postX + 0.004, f + CRANE_Y, PIT.z), new Vector3(PIT.x - 0.01, f + CRANE_Y, PIT.z), 0.006);
    arm.material = iron();
    this.group.add(arm);
    const brace = beam(new Vector3(postX, f + CRANE_Y - 0.06, PIT.z), new Vector3(PIT.x + 0.05, f + CRANE_Y, PIT.z), 0.004);
    brace.material = iron();
    this.group.add(brace);
    // The trammel: a notched bar that slides through a loop; the pot hangs from its hook.
    this.trammelBar.position.set(PIT.x, 0, PIT.z);
    const bar = new Mesh(new BoxGeometry(0.004, 0.16, 0.009), iron());
    bar.position.y = 0.08;
    this.trammelBar.add(bar);
    const teeth: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) teeth.push(new BoxGeometry(0.003, 0.003, 0.009).translate(-0.003, 0.012 + i * 0.011, 0));
    this.trammelBar.add(new Mesh(mergeGeometries(teeth)!, iron()));
    const hook = new Mesh(new TorusGeometry(0.008, 0.0018, 6, 14, Math.PI * 1.3), iron());
    hook.rotation.z = Math.PI * 0.85;
    hook.position.y = -0.006;
    this.trammelBar.add(hook);
    // The ring you lift it by.
    this.ring = new Mesh(new TorusGeometry(0.011, 0.0022, 8, 20), iron());
    this.ring.position.set(0.016, 0.03, 0);
    this.trammelBar.add(this.ring);
    this.group.add(this.trammelBar);
    const loop = new Mesh(new TorusGeometry(0.007, 0.0016, 6, 12), iron());
    loop.rotation.x = Math.PI / 2;
    loop.position.set(PIT.x, f + CRANE_Y - 0.006, PIT.z);
    this.group.add(loop);

    // ---- The cauldron: hammered copper, a rolled rim, a bail.
    const copper = new MeshStandardMaterial({ color: 0xb8683a, metalness: 0.85, roughness: 0.38 });
    const profile = [
      new Vector2(0.001, 0), new Vector2(POT_R * 0.55, 0.002), new Vector2(POT_R * 0.92, POT_DEPTH * 0.25),
      new Vector2(POT_R, POT_DEPTH * 0.6), new Vector2(POT_R * 0.95, POT_DEPTH), new Vector2(POT_R * 0.98, POT_DEPTH + 0.002),
    ];
    const shell = new Mesh(new LatheGeometry(profile, 28), copper);
    shell.material.side = DoubleSide;
    this.pot.add(shell);
    const rim = new Mesh(new TorusGeometry(POT_R * 0.97, 0.0022, 6, 28), copper);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = POT_DEPTH + 0.002;
    this.pot.add(rim);
    const bail = new Mesh(new TorusGeometry(POT_R * 1.02, 0.0013, 5, 24, Math.PI), iron());
    bail.position.y = POT_DEPTH;
    this.pot.add(bail);
    this.liquidMaterial = new MeshStandardMaterial({ color: 0x3a5866, roughness: 0.08, metalness: 0.1 });
    this.liquid = new Mesh(new CylinderGeometry(POT_R * 0.93, POT_R * 0.93, 0.001, 28), this.liquidMaterial);
    this.liquid.userData.keep = true;
    this.pot.add(this.liquid);
    this.group.add(this.pot);

    // ---- Herb rack and the herbs on it.
    const shelf = beam(new Vector3(RACK.x - 0.07, f + 0.03, RACK.z), new Vector3(RACK.x + 0.07, f + 0.03, RACK.z), 0.012, 0.04);
    this.group.add(shelf);
    for (const dx of [-0.06, 0.06]) this.group.add(beam(new Vector3(RACK.x + dx, f, RACK.z), new Vector3(RACK.x + dx, f + 0.03, RACK.z), 0.008));
    HERBS.forEach((kind, i) => {
      const bundle = herb(kind);
      const home = new Vector3(RACK.x - 0.045 + i * 0.045, f + 0.037, RACK.z);
      bundle.position.copy(home);
      this.group.add(bundle);
      this.items.push({ group: bundle, home, hand: -1, kind, used: false });
    });

    // ---- A wooden ladle hanging on the crane post, and two vials on a stand.
    const ladle = new Group();
    const handle = new Mesh(new CylinderGeometry(0.0025, 0.003, 0.09, 8), timber());
    handle.position.y = 0.045;
    ladle.add(handle);
    this.ladleBowl = new Mesh(new SphereGeometry(0.011, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), timber());
    this.ladleBowl.material = timber().clone();
    (this.ladleBowl.material as MeshStandardMaterial).side = DoubleSide;
    this.ladleBowl.position.y = 0.002;
    ladle.add(this.ladleBowl);
    const ladleHome = new Vector3(postX + 0.012, f + 0.12, PIT.z + 0.01);
    ladle.position.copy(ladleHome);
    this.group.add(ladle);
    this.items.push({ group: ladle, home: ladleHome, hand: -1, kind: 'ladle', used: false });
    const stand = beam(new Vector3(VIALS.x - 0.04, f + 0.012, VIALS.z), new Vector3(VIALS.x + 0.04, f + 0.012, VIALS.z), 0.024, 0.03);
    this.group.add(stand);
    const glass = new MeshStandardMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
    for (const dx of [-0.02, 0.02]) {
      const vial = new Group();
      vial.position.set(VIALS.x + dx, f + 0.024, VIALS.z);
      vial.add(new Mesh(new LatheGeometry([new Vector2(0.001, 0), new Vector2(0.011, 0.002), new Vector2(0.012, 0.03), new Vector2(0.005, 0.038), new Vector2(0.005, 0.048)], 16), glass));
      const cork = new Mesh(new CylinderGeometry(0.0048, 0.0042, 0.008, 10), new MeshStandardMaterial({ color: 0x9b7a52, roughness: 0.9 }));
      cork.position.y = 0.051;
      vial.add(cork);
      const fill = new Mesh(new CylinderGeometry(0.0105, 0.0105, 0.026, 14), new MeshStandardMaterial({ color: 0x8fb04a, emissive: 0x405a10, emissiveIntensity: 0.6, roughness: 0.2 }));
      fill.position.y = 0.015;
      fill.visible = false;
      fill.userData.keep = true;
      vial.add(fill);
      this.group.add(vial);
      this.vials.push({ fill, full: false });
    }

    this.group.add(this.bubbles.points, this.steam.points);
    devInfo.brew = () => this.state;
    devActions['['] = () => this.devHerbs();
    devActions[']'] = () => this.setHeight(this.height - NOTCH);
    devActions[';'] = () => this.setHeight(this.height + NOTCH);
    devActions["'"] = () => this.devLadle();
    devActions['/'] = () => {
      // Dev: skip the steeping.
      this.temperature = 88;
      this.potency = READY + 0.03;
    };
    this.place();
    playIgnite();
  }

  get state(): string {
    return `h=${this.height.toFixed(2)} T=${this.temperature.toFixed(0)} vol=${this.volume.toFixed(2)} potency=${this.potency.toFixed(2)} spoiled=${this.spoiled.toFixed(2)} herbs=${[...this.herbs].join('+')} vials=${this.filled}`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[]): void {
    if (!stage.playing) hands = [];
    this.time += dt;
    this.noteTime -= dt;
    if (this.finishIn > 0) {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.done = true;
    }
    this.trammel(hands);
    this.carry(hands);
    this.heat(dt);
    this.render(dt);
    this.say();
    this.bubbles.update(dt);
    this.steam.update(dt);
  }

  private say(): void {
    const t = Math.round(this.temperature);
    let text: string;
    if (this.filled >= 2) text = 'Two healing draughts! They hang on your wrist now.';
    else if (this.herbs.size < 3) {
      const missing = HERBS.filter((h) => !this.herbs.has(h));
      text = `Pinch the herbs and drop them in the pot: ${missing.map((h) => h[0].toUpperCase() + h.slice(1)).join(', ')} · ${t} °C`;
    } else if (this.potency >= READY) text = 'The draught is ready! Dip the ladle in, then pour it into the vials';
    else if (this.temperature >= 99.5) text = `Boiling hard! Heat breaks the healing oils: lift the pot higher · ${Math.round(this.potency * 100)}%`;
    else if (this.temperature < 70) text = `Barely warm (${t} °C): lower the pot towards the fire · ${Math.round(this.potency * 100)}%`;
    else text = `Simmering at ${t} °C · steeping ${Math.round(this.potency * 100)}%`;
    if (this.noteTime > 0) text = this.note;
    this.caption = text;
  }

  private flash(text: string, seconds = 2): void {
    this.note = text;
    this.noteTime = seconds;
  }

  // ============================================================ Physics

  private heat(dt: number): void {
    // Radiant heat falls off with height; the pot also cools into the air.
    const q = 680 / (1 + (this.height / 0.03) ** 2);
    const tau = 6;
    let dT = (q - (this.temperature - 18)) / tau;
    if (this.temperature >= 100 && dT > 0) {
      // Boiling: the extra heat goes into evaporating water.
      this.volume = Math.max(0, this.volume - dT * dt * 0.0008);
      dT = 0;
      this.temperature = 100;
    }
    this.temperature = Math.min(100, this.temperature + dT * dt);
    const kelvin = this.temperature + 273.15;
    if (this.herbs.size > 0) {
      // Extraction and breakdown, each with its own activation energy.
      const extract = 0.075 * Math.exp(4000 * (1 / 363 - 1 / kelvin)) * (this.herbs.size / 3);
      const breakdown = 0.03 * Math.exp(15000 * (1 / 373 - 1 / kelvin));
      const dc = extract * (1 - this.potency) - breakdown * this.potency;
      this.potency = Math.max(0, Math.min(1, this.potency + dc * dt));
      this.spoiled = Math.min(1, this.spoiled + breakdown * this.potency * dt * 0.5);
    }
    if (this.volume < 0.35) {
      this.mistakes++;
      this.flash('It boiled dry and burnt! Fresh water, new herbs: keep it to a simmer this time', 3);
      playHiss(0.06, 1);
      this.reset();
    }
  }

  private reset(): void {
    this.volume = 1;
    this.temperature = 30;
    this.potency = 0;
    this.spoiled = 0;
    this.herbs.clear();
    for (const item of this.items) {
      if (item.kind === 'ladle') continue;
      item.used = false;
      item.group.visible = true;
      item.group.position.copy(item.home);
    }
  }

  // ========================================================= Hands

  /** Pinch the trammel's ring and lift or lower: the bar clicks from notch to notch. */
  private trammel(hands: readonly HandState[]): void {
    const ringAt = this.ring.getWorldPosition(this.w);
    hands.forEach((hand, h) => {
      if (this.trammelHand === -1 && hand.pinchStarted && hand.pinch.distanceTo(ringAt) < 0.035) {
        this.trammelHand = h;
        this.trammelGrab = this.group.worldToLocal(this.v.copy(hand.pinch)).y - this.height;
      }
      if (this.trammelHand !== h) return;
      if (hand.pinchEnded || !hand.tracked) {
        this.trammelHand = -1;
        return;
      }
      const y = this.group.worldToLocal(this.v.copy(hand.pinch)).y - this.trammelGrab;
      const notched = Math.round((y - LOW) / NOTCH) * NOTCH + LOW;
      if (Math.abs(notched - this.height) > 1e-4) this.setHeight(notched);
    });
  }

  private setHeight(h: number): void {
    const next = Math.min(HIGH, Math.max(LOW, h));
    if (Math.abs(next - this.height) < 1e-4) return;
    this.height = next;
    playPawl(0.03);
    this.place();
  }

  /** Herbs and the ladle follow a pinch; let go over the pot and herbs drop in. */
  private carry(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const held = this.items.find((i) => i.hand === h);
      if (held) {
        const p = this.group.worldToLocal(this.v.copy(hand.pinch));
        held.group.position.copy(p).add(held.kind === 'ladle' ? this.w.set(0, -0.06, 0) : this.w.set(0, -0.01, 0));
        if (held.kind === 'ladle') this.useLadle(held);
        if (hand.pinchEnded || !hand.tracked) this.drop(held);
        return;
      }
      if (!hand.pinchStarted || h === this.trammelHand) return;
      const p = this.group.worldToLocal(this.v.copy(hand.pinch));
      let best: Pickable | null = null;
      let bestD = 0.035;
      for (const item of this.items) {
        if (item.used || item.hand >= 0) continue;
        const grip = item.kind === 'ladle' ? this.w.copy(item.group.position).add(new Vector3(0, 0.07, 0)) : item.group.position;
        const d = grip.distanceTo(p);
        if (d < bestD) {
          best = item;
          bestD = d;
        }
      }
      if (best) best.hand = h;
    });
  }

  private drop(item: Pickable): void {
    item.hand = -1;
    const p = item.group.position;
    const overPot = Math.hypot(p.x - PIT.x, p.z - PIT.z) < POT_R + 0.01 && p.y > this.floor + this.height;
    if (item.kind !== 'ladle' && overPot) {
      item.used = true;
      item.group.visible = false;
      this.herbs.add(item.kind);
      playSplat(0.04);
      this.splash();
      return;
    }
    item.group.position.copy(item.home);
  }

  private useLadle(ladle: Pickable): void {
    const bowl = ladle.group.position;
    const surface = this.floor + this.height + 0.004 + POT_DEPTH * 0.8 * this.volume;
    const inPot = Math.hypot(bowl.x - PIT.x, bowl.z - PIT.z) < POT_R * 0.8 && bowl.y < surface && bowl.y > this.floor + this.height;
    if (inPot && !this.ladleFull) {
      if (this.potency < READY || this.herbs.size < 3) {
        if (this.noteTime <= 0) this.flash('Not ready yet: let it steep longer', 1.4);
        return;
      }
      this.ladleFull = true;
      playDrip(0.03);
    }
    if (!this.ladleFull) return;
    // Over an empty vial: pour.
    for (let i = 0; i < this.vials.length; i++) {
      const vial = this.vials[i];
      if (vial.full) continue;
      const vx = VIALS.x + (i === 0 ? -0.02 : 0.02);
      if (Math.hypot(bowl.x - vx, bowl.z - VIALS.z) < 0.02 && bowl.y < this.floor + 0.11) {
        vial.full = true;
        vial.fill.visible = true;
        this.ladleFull = false;
        this.filled++;
        play.items.push('potion');
        saveProgress();
        playDrip(0.04);
        if (this.filled >= 2) this.finish();
        break;
      }
    }
  }

  private finish(): void {
    const strength = Math.round(this.potency * 100);
    this.flash(`Two draughts at ${strength}% strength. They will heal you in the dragon's fire.`, 3);
    this.finishIn = 2.5;
  }

  // ============================================================ Drawing

  private place(): void {
    // The pot hangs from the hook; the bar slides through the crane's loop.
    const hookY = this.floor + this.height + POT_DEPTH + 0.012;
    this.trammelBar.position.y = hookY;
    this.pot.position.set(PIT.x, this.floor + this.height, PIT.z);
  }

  private render(dt: number): void {
    const f = this.floor;
    const coal = 900 + 60 * Math.sin(this.time * 1.3);
    const bright = glow(coal, this.glowColor);
    this.coalMaterial.emissive.copy(this.glowColor);
    this.coalMaterial.emissiveIntensity = bright * 2;
    this.light.intensity = 0.12 + Math.random() * 0.03;
    this.flames.forEach((s, i) => {
      const flicker = 0.7 + 0.3 * Math.sin(this.time * 13 + i * 2.1) + Math.random() * 0.1;
      // Flames lick up to the pot's base and spread under it.
      const reach = Math.min(0.05, this.height - 0.004);
      s.scale.set(0.022, Math.max(0.01, reach) * flicker, 1);
    });
    this.crackleIn -= dt;
    if (this.crackleIn <= 0) {
      this.crackleIn = 0.2 + Math.random() * 0.6;
      playCrackle(0.012);
    }

    // The brew: water greying-blue to herbal green-gold as it steeps; brown as it spoils.
    const level = POT_DEPTH * 0.8 * this.volume;
    this.liquid.position.y = 0.004 + level;
    this.liquid.scale.setScalar(0.82 + 0.18 * (level / (POT_DEPTH * 0.8)));
    const c = this.liquidMaterial.color;
    c.setHex(0x3a5866).lerp(new Color(0x8fb04a), this.potency).lerp(new Color(0x5a3e22), this.spoiled * 0.8);
    this.liquidMaterial.emissive.copy(c).multiplyScalar(0.15 * this.potency);

    // Bubbles rise faster near the boil; steam thickens with heat.
    const simmer = Math.max(0, (this.temperature - 70) / 30);
    const surfaceY = f + this.height + this.liquid.position.y;
    if (Math.random() < dt * simmer * 30) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * POT_R * 0.75;
      this.v.set(PIT.x + Math.cos(a) * r, surfaceY + 0.001, PIT.z + Math.sin(a) * r);
      this.bubbles.emit(this.v, this.w.set(0, 0.01, 0), { life: 0.35, size: [0.004, 0.009], from: 0xe8f0e0, alpha: 0.7 });
    }
    if (Math.random() < dt * (this.temperature - 40) * 0.25) {
      this.v.set(PIT.x + (Math.random() - 0.5) * 0.05, surfaceY + 0.01, PIT.z + (Math.random() - 0.5) * 0.05);
      this.steam.emit(this.v, this.w.set((Math.random() - 0.5) * 0.02, 0.05 + simmer * 0.05, (Math.random() - 0.5) * 0.02), { life: 1.6, gravity: -0.03, drag: 1.2, size: [0.012, 0.05], from: 0xf2f2f2, alpha: 0.35 + 0.25 * simmer });
    }
    // The ladle drips while it is full.
    if (this.ladleFull) {
      (this.ladleBowl.material as MeshStandardMaterial).color.setHex(0x8fb04a);
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = 0.6;
        playDrip(0.008);
      }
    } else {
      (this.ladleBowl.material as MeshStandardMaterial).color.setHex(0xffffff);
    }
  }

  private splash(): void {
    for (let i = 0; i < 10; i++) {
      this.v.set(PIT.x + (Math.random() - 0.5) * 0.03, this.floor + this.height + this.liquid.position.y + 0.002, PIT.z + (Math.random() - 0.5) * 0.03);
      this.bubbles.emit(this.v, this.w.set((Math.random() - 0.5) * 0.15, 0.15 + Math.random() * 0.15, (Math.random() - 0.5) * 0.15), { life: 0.4, gravity: 2, size: [0.004, 0.003], from: 0xc8dccc, alpha: 0.8 });
    }
  }

  // =============================================================== Dev

  private devHerbs(): void {
    for (const item of this.items) {
      if (item.kind === 'ladle' || item.used) continue;
      item.used = true;
      item.group.visible = false;
      this.herbs.add(item.kind);
    }
    this.splash();
  }

  private devLadle(): void {
    if (this.potency < READY) return;
    for (const vial of this.vials) {
      if (vial.full) continue;
      vial.full = true;
      vial.fill.visible = true;
      this.filled++;
      play.items.push('potion');
      if (this.filled >= 2) this.finish();
      return;
    }
  }
}

/** A bundle of one herb, tied with twine: yarrow's white flower heads, comfrey's broad leaves, sage's grey-green. */
function herb(kind: Herb): Group {
  const g = new Group();
  const stalk = new MeshStandardMaterial({ color: 0x5b7a34, roughness: 0.9 });
  const twine = new Mesh(new TorusGeometry(0.004, 0.0012, 5, 10), new MeshStandardMaterial({ color: 0xb89a6a, roughness: 1 }));
  twine.rotation.x = Math.PI / 2;
  twine.position.y = 0.006;
  g.add(twine);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const stem = new Mesh(new CylinderGeometry(0.0008, 0.0008, 0.03, 4), stalk);
    stem.position.set(Math.cos(a) * 0.002, 0.015, Math.sin(a) * 0.002);
    stem.rotation.set(Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
    g.add(stem);
    const top = new Vector3(Math.cos(a) * 0.009, 0.03, Math.sin(a) * 0.009);
    if (kind === 'yarrow') {
      const head = new Mesh(new SphereGeometry(0.0045, 8, 5), new MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.9 }));
      head.scale.y = 0.45;
      head.position.copy(top);
      g.add(head);
    } else {
      const leaf = new Mesh(new SphereGeometry(kind === 'comfrey' ? 0.009 : 0.006, 8, 5), new MeshStandardMaterial({ color: kind === 'comfrey' ? 0x3f6e2a : 0x8a9a7a, roughness: 0.85, side: DoubleSide }));
      leaf.scale.set(0.35, 1, 0.12);
      leaf.position.copy(top);
      leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      g.add(leaf);
    }
  }
  return g;
}

function flame(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,240,190,0.95)');
  grad.addColorStop(0.35, 'rgba(255,160,50,0.8)');
  grad.addColorStop(1, 'rgba(160,30,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 0);
  g.bezierCurveTo(52, 50, 64, 90, 32, 128);
  g.bezierCurveTo(0, 90, 12, 50, 32, 0);
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
