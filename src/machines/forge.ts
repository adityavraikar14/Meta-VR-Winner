import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playClang, playCrackle, playHiss, playIgnite, playTink, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { play } from '../progress.js';
import { stage } from '../stage-state.js';
import { crystals } from '../world/themes.js';
import { BURNING, fireTarget, FORGE_MIN, glow, heatName, ROOM, stepHeat, WORKABLE } from './heat.js';
import { band, halo, hardwood, iron, stone, timber } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * The smithy. Every step is the real craft, run on real heat:
 *
 * - The Lantern Stone lights the charcoal. Left alone the fire smoulders at
 *   about 650 °C; pumping the bellows pushes air (oxygen) in and it climbs
 *   towards 1350 °C. Pump too hard for too long and steel burns.
 * - Iron in the coals heats towards the fire's temperature and glows the
 *   colour Planck's law gives it; out of the fire it radiates its heat away
 *   (∝ T⁴) and the glow fades through cherry to black.
 * - The hammer only moves iron at forging heat (orange to yellow, ~900–1260 °C).
 *   Cherry red barely moves; colder rings off and risks cracking.
 * - Six good blows draw the bar into an axe head: shorter, a flared bit, a
 *   thin edge, about the same volume of steel.
 * - Steel hardens only if quenched from above its critical temperature
 *   (~780 °C, cherry red); quenched colder it stays soft.
 */

/** Stage-local layout, heights above the floor. */
const HEARTH = new Vector3(-0.15, 0, -0.2);
const HEARTH_W = 0.22;
const HEARTH_D = 0.16;
const HEARTH_H = 0.095;
const POT_R = 0.055;
const COAL_TOP = HEARTH_H + 0.012;
const BELLOWS_AT = new Vector3(-0.275, 0.07, -0.2);
const BELLOWS_L = 0.17;
const BELLOWS_W = 0.09;
const BELLOWS_OPEN = 0.3;
const ANVIL = new Vector3(0.13, 0, 0.02);
const STUMP_H = 0.055;
const FACE_Y = STUMP_H + 0.05;
const FACE_HALF = new Vector3(0.04, 0, 0.017);
const TROUGH = new Vector3(0.34, 0, -0.13);
const TROUGH_SIZE = new Vector3(0.13, 0.05, 0.075);
const WATER_Y = 0.041;
const RACK = new Vector3(0.02, 0, -0.16);
const RACK_Y = 0.052;
const STONE_AT = new Vector3(-0.07, 0, 0.13);
const HAMMER_AT = new Vector3(0.26, 0, 0.1);

const BAR_L = 0.09;
const BAR_T = 0.012;
/** Hardening: quenched from at least this hot, steel turns hard (martensite). */
const HARDEN = 780;
const BLOWS = 6;
const TONGS = 0.05;
const GRAB_REACH = 0.04;

type Place = 'start' | 'held' | 'falling' | 'fire' | 'anvil' | 'water' | 'ground';
type Step = 'light' | 'bellows' | 'heat' | 'heating' | 'forge' | 'quench' | 'done';

interface Item {
  group: Group;
  place: Place;
  hand: number;
  velocity: Vector3;
  /** Where on the item a pinch takes hold, item-local. */
  grip: Vector3;
}

export class Forge {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private step: Step = 'light';
  private stepTime = 0;
  private lit = false;
  private coal = ROOM;
  private air = 0;
  private barHeat = ROOM;
  private shaped = 0;
  private shapedShown = 0;
  private hardened = false;
  private note = '';
  private noteTime = 0;

  private readonly coalMaterials: MeshStandardMaterial[] = [];
  private readonly flames: Sprite[] = [];
  private readonly fireLight = new PointLight(0xff8a3a, 0, 0.9, 2);
  private readonly sparks = new ParticlePool({ count: 160, additive: true, soft: false });
  private readonly steam = new ParticlePool({ count: 90, additive: false, soft: true });
  private readonly bellows: Bellows;
  private readonly chartPointer = new Group();

  private readonly stoneItem: Item;
  private readonly bar: Item;
  private readonly hammer: Item;
  private readonly barMesh: Mesh;
  private readonly barMaterial: MeshStandardMaterial;
  private readonly tongs = new Group();
  private readonly handle = new Group();

  private hammerFace = new Vector3();
  private hammerFacePrev = new Vector3();
  private strikeReady = true;
  private crackleIn = 0;
  private ouchIn = 0;
  private finishTime = -1;
  /** For the Inventor's Journal: the hottest the bar got, blows on it, and the heat it was quenched from. */
  private hottest = 0;
  private blows = 0;
  private quenchedFrom = 0;
  private readonly glowColor = new Color();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly quat = new Quaternion();

  constructor(private readonly floor: number) {
    this.group.name = 'Forge';
    const f = floor;

    this.buildHearth(f);
    this.bellows = new Bellows();
    this.bellows.group.position.set(BELLOWS_AT.x, f + BELLOWS_AT.y, BELLOWS_AT.z);
    this.group.add(this.bellows.group);
    this.buildAnvil(f);
    this.buildTrough(f);
    this.buildRack(f);
    this.buildChart(f);

    // ---- The Lantern Stone, waiting on a little cairn.
    const cairn = new Mesh(new CylinderGeometry(0.022, 0.03, 0.035, 7), stone());
    cairn.position.set(STONE_AT.x, f + 0.0175, STONE_AT.z);
    this.group.add(cairn);
    const gem = new Group();
    gem.add(crystals(0.016, 5, 13, 0xff9a3a));
    const gemGlow = halo(0.08, 0xffa040);
    gemGlow.position.y = 0.012;
    gem.add(gemGlow);
    gem.position.set(STONE_AT.x, f + 0.035, STONE_AT.z);
    this.group.add(gem);
    this.stoneItem = { group: gem, place: 'start', hand: -1, velocity: new Vector3(), grip: new Vector3(0, 0.012, 0) };

    // ---- The iron bar: square stock that the hammer draws into an axe head.
    // Mill-scaled iron: a warm grey that stands out from the anvil's black.
    this.barMaterial = new MeshStandardMaterial({ color: 0x6a625a, metalness: 0.5, roughness: 0.7, emissive: 0x000000 });
    this.barMesh = new Mesh(barGeometry(), this.barMaterial);
    this.barMesh.morphTargetInfluences = [0];
    this.barMesh.userData.keep = true;
    const barGroup = new Group();
    barGroup.add(this.barMesh);
    barGroup.position.set(RACK.x, f + RACK_Y, RACK.z);
    this.group.add(barGroup);
    this.bar = { group: barGroup, place: 'start', hand: -1, velocity: new Vector3(), grip: new Vector3(-BAR_L / 2, 0, 0) };
    // A hickory handle, fitted once the head is hardened.
    const shaft = new Mesh(new CylinderGeometry(0.0045, 0.0055, 0.13, 10), hardwood());
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(-0.024, 0, -0.05);
    this.handle.add(shaft);
    this.handle.visible = false;
    barGroup.add(this.handle);

    // ---- Tongs: shown in the hand that holds the bar.
    const jaw = new BoxGeometry(TONGS + 0.035, 0.0025, 0.003);
    jaw.translate(-(TONGS + 0.035) / 2 + 0.012, 0, 0);
    for (const side of [-1, 1]) {
      const arm = new Mesh(jaw, iron());
      arm.position.y = side * 0.0035;
      arm.rotation.z = side * 0.05;
      this.tongs.add(arm);
    }
    this.tongs.visible = false;
    this.group.add(this.tongs);

    // ---- The hammer: hickory handle, square face, cross peen.
    const hammer = new Group();
    const grip = new Mesh(new CylinderGeometry(0.0042, 0.0052, 0.1, 10), hardwood());
    grip.position.y = 0.05;
    hammer.add(grip);
    const head = new Mesh(mergeGeometries([
      new BoxGeometry(0.026, 0.013, 0.013).translate(0.004, 0, 0),
      new BoxGeometry(0.012, 0.009, 0.013).translate(-0.014, 0, 0),
    ])!, iron());
    head.position.y = 0.1;
    hammer.add(head);
    const face = new Mesh(new BoxGeometry(0.0015, 0.013, 0.013), new MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.3 }));
    face.position.set(0.0175, 0.1, 0);
    hammer.add(face);
    hammer.position.set(HAMMER_AT.x, f + 0.007, HAMMER_AT.z);
    hammer.rotation.set(0, 0.6, Math.PI / 2);
    this.group.add(hammer);
    this.hammer = { group: hammer, place: 'start', hand: -1, velocity: new Vector3(), grip: new Vector3(0, 0.025, 0) };

    // ---- Fire: flames, a warm light over everything, sparks and steam.
    const flameTexture = flameCanvas();
    for (let i = 0; i < 7; i++) {
      const flame = new Sprite(new SpriteMaterial({ map: flameTexture, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      flame.center.set(0.5, 0.05);
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : POT_R * 0.45;
      flame.position.set(HEARTH.x + Math.cos(a) * r, f + COAL_TOP - 0.004, HEARTH.z + Math.sin(a) * r);
      flame.visible = false;
      this.flames.push(flame);
      this.group.add(flame);
    }
    this.fireLight.position.set(HEARTH.x, f + COAL_TOP + 0.05, HEARTH.z);
    this.group.add(this.fireLight);
    this.group.add(this.sparks.points, this.steam.points);

    devInfo.forge = () => this.state;
    devActions.f = () => this.devNext();
    this.setStep('light');
  }

  /** Dev: do the next thing a smith would, without hands. */
  private devNext(): void {
    const bar = this.bar.place;
    if (!this.lit) {
      this.stoneItem.group.position.set(HEARTH.x, this.floor + COAL_TOP + 0.004, HEARTH.z);
      this.stoneItem.place = 'fire';
      this.ignite();
    } else if (this.shaped >= 1 && this.barHeat >= HARDEN && bar !== 'water') {
      this.quench();
    } else if (this.coal < 1000) {
      this.air = 1.1;
      this.bellows.angle = 0.05;
    } else if (bar === 'fire' && this.barHeat < 1000) {
      this.air = 1.1;
    } else if (bar !== 'fire' && this.barHeat < FORGE_MIN) {
      this.rest(this.bar, 'fire', HEARTH.x + 0.01, COAL_TOP + 0.002, HEARTH.z, 0.4);
    } else if (bar !== 'anvil' && this.shaped < 1) {
      this.rest(this.bar, 'anvil', ANVIL.x - 0.005, FACE_Y + BAR_T / 2, ANVIL.z, 0);
    } else if (bar === 'anvil') {
      // A smith gets three or four blows in per heat.
      this.hammerFace.copy(this.bar.group.position);
      for (let i = 0; i < 3 && this.barHeat >= FORGE_MIN && this.shaped < 1; i++) this.blow(true, 1);
    }
  }

  /** Your smithing, for the Inventor's Journal. */
  journal(): string[] {
    return [
      `Hottest the iron got: ${Math.round(this.hottest)} °C · ${this.blows} hammer blows`,
      `Quenched from ${Math.round(this.quenchedFrom)} °C: hard steel`,
      this.mistakes ? `${this.mistakes} slip${this.mistakes > 1 ? 's' : ''}: a blow too hot or too cold` : 'Not one blow wasted',
    ];
  }

  get state(): string {
    const face = this.hammer.place === 'held' ? ` face=${this.hammerFace.toArray().map((n) => n.toFixed(3)).join(',')}` : '';
    return `${this.step} coal=${Math.round(this.coal)} air=${this.air.toFixed(2)} bar=${Math.round(this.barHeat)}@${this.bar.place} shaped=${this.shaped.toFixed(2)} hard=${this.hardened} hammer=${this.hammer.place}${face}`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[]): void {
    // Hands only work the smithy once the level is under way.
    if (!stage.playing) hands = [];
    this.stepTime += dt;
    this.noteTime -= dt;
    this.handleGrabs(hands);
    this.moveHeld(hands);
    this.fall(this.stoneItem, dt);
    this.fall(this.bar, dt);
    this.fall(this.hammer, dt);

    // Bellows: hands push the top board down; a full stroke feeds the fire.
    const flow = this.bellows.update(dt, hands);
    if (this.lit) {
      this.air += flow * dt * 1.4;
      if (flow > 0.7) this.puffSparks(flow);
    }
    this.air -= this.air * dt * 0.5;
    if (this.bellows.whoosh) playWhoosh(Math.min(1, this.bellows.stroke / BELLOWS_OPEN));

    // The fire and the iron.
    const target = this.lit ? fireTarget(this.air) : ROOM;
    this.coal += (target - this.coal) * Math.min(1, dt / 2.5);
    const where = this.bar.place;
    if (where === 'fire') this.barHeat = stepHeat(this.barHeat, dt, this.coal, 1);
    else if (where === 'water') this.barHeat = stepHeat(this.barHeat, dt, ROOM, 3);
    // The anvil draws some heat out through the small contact patch: a few blows per heat.
    else if (where === 'anvil') this.barHeat = stepHeat(this.barHeat, dt, ROOM, 0.1);
    else this.barHeat = stepHeat(this.barHeat, dt, ROOM, 0);
    this.hottest = Math.max(this.hottest, this.barHeat);
    if (where === 'water' && this.barHeat > 110 && Math.random() < dt * (this.barHeat / 60)) this.puffSteam(1);

    this.strike(dt);
    this.touchHot(hands, dt);
    this.render(dt);
    this.advance();
    this.sparks.update(dt);
    this.steam.update(dt);
  }

  // ================================================================= Story

  private setStep(step: Step): void {
    this.step = step;
    this.stepTime = 0;
  }

  /** Move the job along and say what to do next. */
  private advance(): void {
    const bar = this.bar.place;
    const name = heatName(this.barHeat);
    const t = Math.round(this.barHeat);
    let text = '';
    switch (this.step) {
      case 'light':
        text = 'The forge is cold. Pinch the lantern shard and drop it into the hearth';
        if (this.lit) this.setStep('bellows');
        break;
      case 'bellows':
        text = this.coal < 900
          ? `Pump the bellows: push the top board down, again and again · fire ${Math.round(this.coal)} °C`
          : `Hot fire! Keep pumping · ${Math.round(this.coal)} °C`;
        if (this.coal > 1000) this.setStep('heat');
        break;
      case 'heat':
        text = 'Pinch the iron bar with the tongs and lay it in the coals';
        if (bar === 'fire') this.setStep('heating');
        break;
      case 'heating':
        if (bar !== 'fire') text = this.barHeat >= FORGE_MIN
          ? `${cap(name)} · ${t} °C: forging heat! Lay it on the anvil`
          : `Only ${name} (${t} °C). Back in the fire until it glows orange`;
        else if (this.coal < 950) text = `The fire is cooling (${Math.round(this.coal)} °C): pump the bellows!`;
        else text = this.barHeat >= FORGE_MIN
          ? `${cap(name)} · ${t} °C: forging heat! Take it to the anvil`
          : `Heating… ${name} · ${t} °C. Forge at orange to yellow`;
        if (bar === 'anvil') this.setStep('forge');
        break;
      case 'forge': {
        const blows = Math.min(BLOWS, Math.floor(this.shaped * BLOWS + 1e-6));
        if (bar === 'fire') text = `Reheating · ${name} · ${t} °C`;
        else if (bar !== 'anvil') text = 'Lay the hot bar on the anvil';
        else if (this.barHeat < WORKABLE) text = `${cap(name)} (${t} °C): too cold to work. Back in the fire!`;
        else if (this.hammer.place !== 'held') text = `Pick up the hammer with your other hand and strike · ${blows}/${BLOWS}`;
        else text = `Strike! ${cap(name)} · ${t} °C · blows ${blows}/${BLOWS}`;
        if (this.shaped >= 1) this.setStep('quench');
        break;
      }
      case 'quench':
        if (bar === 'water') {
          text = this.hardened ? 'Hardened!' : `Too cold to harden (${t} °C). Steel hardens only from above ${HARDEN} °C: heat it to cherry red`;
        } else {
          text = this.barHeat >= HARDEN
            ? `An axe head! ${cap(name)} · ${t} °C: plunge it in the water to harden it`
            : `An axe head! Reheat it to cherry red (${HARDEN} °C), then quench it in the water`;
        }
        if (this.hardened) {
          this.setStep('done');
          this.finishTime = 0;
        }
        break;
      case 'done':
        text = 'You forged an axe! Hard steel, a keen edge.';
        break;
    }
    if (this.noteTime > 0) text = this.note;
    this.caption = text;
  }

  private say(note: string, seconds = 2.6): void {
    this.note = note;
    this.noteTime = seconds;
  }

  // =============================================================== Grabbing

  private items(): Item[] {
    return [this.stoneItem, this.bar, this.hammer];
  }

  private handleGrabs(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const held = this.items().find((item) => item.place === 'held' && item.hand === h);
      if (held && (hand.pinchEnded || !hand.tracked)) this.release(held, hand);
      if (!hand.pinchStarted || this.step === 'done') return;
      const pinch = this.group.worldToLocal(this.tmp.copy(hand.pinch));
      let best: Item | null = null;
      let bestDistance = GRAB_REACH;
      for (const item of this.items()) {
        if (item.place === 'held') continue;
        if (item === this.stoneItem && this.lit) continue;
        // Tongs reach the bar from a little way off.
        const d = this.gripPoint(item, this.tmp2).distanceTo(pinch) - (item === this.bar ? 0.02 : 0);
        if (d < bestDistance) {
          best = item;
          bestDistance = d;
        }
      }
      if (best) {
        best.place = 'held';
        best.hand = h;
        best.velocity.set(0, 0, 0);
        playClang(0.9, 0.012);
      }
    });
  }

  private gripPoint(item: Item, out: Vector3): Vector3 {
    item.group.updateMatrix();
    return out.copy(item.grip).applyMatrix4(item.group.matrix);
  }

  /** Held things follow the pinch: the bar at the end of the tongs, the hammer by its handle. */
  private moveHeld(hands: readonly HandState[]): void {
    this.tongs.visible = false;
    for (const item of this.items()) {
      if (item.place !== 'held') continue;
      const hand = hands[item.hand];
      const pinch = this.group.worldToLocal(this.tmp.copy(hand.pinch));
      const wrist = this.group.worldToLocal(this.tmp2.copy(hand.wrist));
      this.fwd.subVectors(pinch, wrist).normalize();
      if (item === this.hammer) {
        // Handle along the hand; the face looks the way the palm does.
        this.up.copy(hand.palmNormal).transformDirection(this.group.matrixWorld.clone().invert());
        this.up.addScaledVector(this.fwd, -this.up.dot(this.fwd)).normalize();
        orient(item.group, this.up, this.fwd);
        item.group.position.copy(pinch).addScaledVector(this.fwd, -0.025);
      } else if (item === this.bar) {
        // The tongs' jaws grip the bar's end; it lies along the hand, kept level.
        this.fwd.y *= 0.4;
        this.fwd.normalize();
        orient(item.group, this.fwd, this.up.set(0, 1, 0));
        const end = this.tmp2.copy(pinch).addScaledVector(this.fwd, TONGS);
        item.group.position.copy(end).addScaledVector(this.fwd, BAR_L / 2);
        this.tongs.visible = true;
        this.tongs.position.copy(end);
        this.tongs.quaternion.copy(item.group.quaternion);
      } else {
        item.group.position.copy(pinch);
        item.group.position.y -= 0.012;
      }
    }
  }

  private release(item: Item, hand: HandState): void {
    item.hand = -1;
    item.place = 'falling';
    // A flick throws it: the hand's velocity, turned into stage space.
    item.velocity.copy(hand.pinchVelocity).clampLength(0, 1.5).applyQuaternion(this.group.getWorldQuaternion(this.quat).invert());
    // Dropped straight onto a spot it belongs: it settles there.
    this.settle(item, true);
  }

  /** Gravity until it lands somewhere: the coals, the anvil, the water or the ground. */
  private fall(item: Item, dt: number): void {
    if (item.place !== 'falling') return;
    item.velocity.y -= 9.8 * dt;
    item.group.position.addScaledVector(item.velocity, dt);
    this.settle(item, false);
  }

  private settle(item: Item, dropped: boolean): void {
    const p = item.group.position;
    const f = this.floor;
    const nearPot = Math.hypot(p.x - HEARTH.x, p.z - HEARTH.z) < POT_R + 0.025;
    const onAnvil = Math.abs(p.x - ANVIL.x) < FACE_HALF.x + 0.02 && Math.abs(p.z - ANVIL.z) < FACE_HALF.z + 0.025;
    const inTrough = Math.abs(p.x - TROUGH.x) < TROUGH_SIZE.x / 2 && Math.abs(p.z - TROUGH.z) < TROUGH_SIZE.z / 2;
    const above = (y: number) => p.y >= f + y - 0.01 && (dropped || p.y <= f + y + 0.01);

    if (item === this.stoneItem && nearPot && above(COAL_TOP)) {
      p.set(HEARTH.x, f + COAL_TOP + 0.004, HEARTH.z);
      item.place = 'fire';
      this.ignite();
      return;
    }
    if (item === this.bar) {
      if (nearPot && above(COAL_TOP)) return this.rest(item, 'fire', HEARTH.x + 0.01, COAL_TOP + 0.002, HEARTH.z, 0.4);
      if (onAnvil && above(FACE_Y)) return this.rest(item, 'anvil', ANVIL.x - 0.005, FACE_Y + BAR_T / 2, ANVIL.z, 0);
      if (inTrough && p.y <= f + TROUGH_SIZE.y + 0.03) return this.quench();
    }
    if (item === this.hammer && onAnvil && above(FACE_Y)) {
      p.y = f + FACE_Y + 0.007;
      item.place = 'ground';
      return;
    }
    if (!dropped && p.y <= f + 0.006) {
      p.y = f + 0.006;
      item.place = 'ground';
      item.velocity.set(0, 0, 0);
      // Whatever lands flat lies down.
      if (item === this.hammer) item.group.rotation.set(0, item.group.rotation.y, Math.PI / 2);
      if (item === this.bar) item.group.rotation.set(0, item.group.rotation.y, 0);
    }
  }

  private rest(item: Item, place: Place, x: number, y: number, z: number, turn: number): void {
    item.place = place;
    item.velocity.set(0, 0, 0);
    item.group.position.set(x, this.floor + y, z);
    item.group.rotation.set(0, turn, 0);
    if (place === 'anvil') playClang(0.5, 0.02);
  }

  // ================================================================== Fire

  private ignite(): void {
    if (this.lit) return;
    this.lit = true;
    this.coal = 500;
    this.air = 0.4;
    playIgnite();
    this.stoneItem.group.scale.setScalar(0.7);
    for (let i = 0; i < 30; i++) this.puffSparks(1.5);
  }

  private puffSparks(strength: number): void {
    const f = this.floor;
    for (let i = 0; i < Math.ceil(strength * 2); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * POT_R * 0.7;
      this.tmp.set(HEARTH.x + Math.cos(a) * r, f + COAL_TOP + 0.005, HEARTH.z + Math.sin(a) * r);
      this.tmp2.set((Math.random() - 0.5) * 0.08, 0.15 + Math.random() * 0.25, (Math.random() - 0.5) * 0.08);
      this.sparks.emit(this.tmp, this.tmp2, { life: 0.6 + Math.random() * 0.8, gravity: -0.05, drag: 1.2, size: [0.006, 0.002], from: 0xffd27a, to: 0xff4010 });
    }
  }

  private puffSteam(amount: number): void {
    const p = this.bar.place === 'water' || this.finishTime < 0 ? this.bar.group.position : TROUGH;
    for (let i = 0; i < amount; i++) {
      this.tmp.set(p.x + (Math.random() - 0.5) * 0.06, this.floor + WATER_Y + 0.004, p.z + (Math.random() - 0.5) * 0.04);
      this.tmp2.set((Math.random() - 0.5) * 0.03, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.03);
      this.steam.emit(this.tmp, this.tmp2, { life: 1.4 + Math.random(), gravity: -0.04, drag: 1.5, size: [0.015, 0.07], from: 0xf4f4f4, to: 0xd8dde2, alpha: 0.55 });
    }
  }

  // ================================================================ Forging

  private strike(dt: number): void {
    if (this.hammer.place !== 'held') return;
    this.hammerFacePrev.copy(this.hammerFace);
    this.hammer.group.updateMatrix();
    this.hammerFace.set(0.019, 0.1, 0).applyMatrix4(this.hammer.group.matrix);
    const face = this.hammerFace;
    const speed = (this.hammerFacePrev.y - face.y) / Math.max(dt, 1e-3);
    const onBar = this.bar.place === 'anvil' &&
      Math.abs(face.x - this.bar.group.position.x) < BAR_L / 2 + 0.006 &&
      Math.abs(face.z - this.bar.group.position.z) < 0.02;
    const onFace = Math.abs(face.x - ANVIL.x) < FACE_HALF.x + 0.01 && Math.abs(face.z - ANVIL.z) < FACE_HALF.z + 0.01;
    const top = this.floor + FACE_Y + (onBar ? BAR_T * (1 - this.shaped * 0.2) : 0);
    if (!onBar && !onFace) {
      this.strikeReady = true;
      return;
    }
    if (face.y > top + 0.015) this.strikeReady = true;
    if (face.y > top) return;
    // The hammer cannot pass through the work: hold the head on it.
    this.hammer.group.position.y += top - face.y;
    if (!this.strikeReady || speed < 0.3) return;
    this.strikeReady = false;
    this.blow(onBar, Math.min(2, speed));
  }

  private blow(onBar: boolean, speed: number): void {
    const at = this.hammerFace;
    if (!onBar) {
      playTink(0.03);
      return;
    }
    const t = this.barHeat;
    this.blows++;
    this.barHeat -= 6;
    glow(t, this.glowColor);
    const hot = this.glowColor.getHex();
    if (t >= BURNING) {
      playClang(1, 0.06);
      this.mistakes++;
      this.shaped = Math.max(0, this.shaped - 0.04);
      for (let i = 0; i < 40; i++) this.sparkAt(at, 0.6, 0xfffbe8);
      this.say('Burning! It was white hot: sparks of steel fly off. Do not let it sit in a roaring fire');
      return;
    }
    if (t >= FORGE_MIN) {
      playClang(1, 0.05 + speed * 0.02);
      // Six sixths can sum to 0.999…; the last blow finishes it.
      this.shaped = this.shaped + 1 / BLOWS > 0.999 ? 1 : this.shaped + 1 / BLOWS;
      for (let i = 0; i < 14; i++) this.sparkAt(at, 0.35, hot);
      return;
    }
    if (t >= WORKABLE) {
      playClang(0.5, 0.05);
      this.shaped = this.shaped + 1 / (BLOWS * 3) > 0.999 ? 1 : this.shaped + 1 / (BLOWS * 3);
      for (let i = 0; i < 5; i++) this.sparkAt(at, 0.25, hot);
      this.say(`Cherry red: it barely moves. Hotter is easier`, 1.8);
      return;
    }
    playTink();
    this.mistakes++;
    this.say('Too cold! Cold iron just rings, and may crack. Back in the fire');
  }

  private sparkAt(at: Vector3, speed: number, color: number): void {
    const a = Math.random() * Math.PI * 2;
    this.tmp2.set(Math.cos(a) * speed, (0.2 + Math.random() * 0.6) * speed, Math.sin(a) * speed).multiplyScalar(0.5 + Math.random());
    this.sparks.emit(at, this.tmp2, { life: 0.25 + Math.random() * 0.35, gravity: 3, drag: 0.6, size: [0.005, 0.0015], from: color, to: 0x501000 });
  }

  /** Bare fingers on hot iron. */
  private touchHot(hands: readonly HandState[], dt: number): void {
    this.ouchIn -= dt;
    if (this.barHeat < 120 || this.bar.place === 'held' || this.ouchIn > 0) return;
    const centre = this.bar.group.position;
    for (const hand of hands) {
      if (!hand.tracked) continue;
      for (const tip of hand.tips) {
        const local = this.group.worldToLocal(this.tmp.copy(tip));
        if (Math.abs(local.x - centre.x) < BAR_L / 2 && Math.abs(local.y - centre.y) < 0.012 && Math.abs(local.z - centre.z) < 0.012) {
          this.ouchIn = 2.5;
          this.mistakes++;
          playHiss(0.04, 0.3);
          this.say(`Ouch! ${Math.round(this.barHeat)} °C iron. Pinch it to use the tongs`);
          return;
        }
      }
    }
  }

  /** Hot steel in water: the heat goes into boiling it, in a cloud of steam. */
  private boilOff(dt: number): void {
    if (this.barHeat <= 90) return;
    const before = this.barHeat;
    this.barHeat = Math.max(60, this.barHeat - this.barHeat * dt * 2.2);
    const steam = Math.min(4, Math.ceil((before - this.barHeat) / 20));
    this.puffSteam(steam);
  }

  private quench(): void {
    const item = this.bar;
    item.place = 'water';
    item.velocity.set(0, 0, 0);
    item.group.position.set(TROUGH.x, this.floor + WATER_Y - 0.01, TROUGH.z);
    item.group.rotation.set(0, 0, 0);
    if (this.barHeat > 150) {
      playHiss(0.05 + 0.06 * Math.min(1, this.barHeat / 1000), 0.8 + this.barHeat / 600);
      this.puffSteam(Math.round(this.barHeat / 25));
    }
    if (this.shaped >= 1 && this.barHeat >= HARDEN) {
      this.hardened = true;
      this.quenchedFrom = this.barHeat;
    }
  }

  // ================================================================ Drawing

  private render(dt: number): void {
    const f = this.floor;
    // Coals glow their temperature; the cooler outer ring less.
    const coalBright = glow(this.coal, this.glowColor);
    this.coalMaterials.forEach((m, i) => {
      m.emissive.copy(this.glowColor);
      m.emissiveIntensity = coalBright * (i === 0 ? 2.2 : 0.9);
    });
    const fire = this.lit ? Math.min(1, (this.coal - 500) / 700) : 0;
    this.fireLight.intensity = fire * (0.12 + this.air * 0.12) * (0.9 + Math.random() * 0.2);
    this.fireLight.color.copy(this.glowColor);
    this.flames.forEach((flame, i) => {
      flame.visible = fire > 0.05;
      const flicker = 0.75 + 0.25 * Math.sin(performance.now() * 0.013 + i * 2.1) + Math.random() * 0.1;
      const h = (0.025 + 0.05 * Math.min(1.3, this.air)) * fire * flicker;
      flame.scale.set(0.026 * (0.8 + fire * 0.4), h, 1);
    });
    if (this.lit) {
      this.crackleIn -= dt;
      if (this.crackleIn <= 0) {
        this.crackleIn = 0.15 + Math.random() * 0.6;
        playCrackle(0.008 + 0.02 * fire);
        if (Math.random() < 0.4) this.puffSparks(0.5);
      }
    }

    // The bar: its glow, and its shape eased towards the blows so far.
    const bright = glow(this.barHeat, this.glowColor);
    this.barMaterial.emissive.copy(this.glowColor);
    this.barMaterial.emissiveIntensity = bright * 2.4;
    this.shapedShown += (this.shaped - this.shapedShown) * Math.min(1, dt * 10);
    this.barMesh.morphTargetInfluences![0] = this.shapedShown;
    if (this.hardened) {
      this.barMaterial.color.setHex(0x6f747b);
      this.barMaterial.metalness = 0.85;
      this.barMaterial.roughness = 0.35;
    }

    // The chart's pointer rides along to the bar's heat.
    this.chartPointer.position.x = chartX(this.barHeat);
    this.chartPointer.visible = this.barHeat > 450;

    // Finale: the handle slides home and the axe lifts up, turning in the firelight.
    if (this.finishTime >= 0) {
      this.finishTime += dt;
      this.boilOff(dt);
      const k = Math.min(1, this.finishTime / 2);
      this.handle.visible = true;
      this.bar.place = 'start';
      const g = this.bar.group;
      g.position.set(TROUGH.x - 0.08 * k, f + WATER_Y + 0.12 * easeOut(k), TROUGH.z + 0.06 * k);
      g.rotation.set(-Math.PI / 2 * k, this.finishTime * 1.6, 0, 'YXZ');
      if (this.finishTime > 2.4 && !this.done) {
        this.done = true;
        if (!play.items.includes('axe')) play.items.push('axe');
        playIgnite();
      }
    }
  }

  // ================================================================ Building

  private buildHearth(f: number): void {
    const blocks: BufferGeometry[] = [];
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    // Courses of rough stone round the hearth's sides, a slab top, a fire-back behind.
    const courses = 4;
    const ch = HEARTH_H / courses;
    for (let c = 0; c < courses; c++) {
      const y = c * ch;
      const row = (length: number, along: 'x' | 'z', fixed: number) => {
        let s = -length / 2 + (c % 2) * 0.015;
        while (s < length / 2 - 0.004) {
          const len = Math.min(length / 2 - s, 0.03 + rand() * 0.02);
          const g = new BoxGeometry(along === 'x' ? len * 0.96 : 0.022, ch * 0.93, along === 'x' ? 0.022 : len * 0.96);
          g.translate(
            HEARTH.x + (along === 'x' ? s + len / 2 : fixed),
            f + y + ch / 2,
            HEARTH.z + (along === 'x' ? fixed : s + len / 2),
          );
          blocks.push(g);
          s += len;
        }
      };
      row(HEARTH_W, 'x', HEARTH_D / 2 - 0.011);
      row(HEARTH_W, 'x', -HEARTH_D / 2 + 0.011);
      row(HEARTH_D - 0.044, 'z', HEARTH_W / 2 - 0.011);
      row(HEARTH_D - 0.044, 'z', -HEARTH_W / 2 + 0.011);
    }
    // Fire-back: a taller wall behind the fire to hold the colour chart.
    for (let c = 0; c < 4; c++) {
      let s = -HEARTH_W / 2 + (c % 2) * 0.014;
      while (s < HEARTH_W / 2 - 0.004) {
        const len = Math.min(HEARTH_W / 2 - s, 0.028 + rand() * 0.02);
        const g = new BoxGeometry(len * 0.95, 0.022, 0.026);
        g.translate(HEARTH.x + s + len / 2, f + HEARTH_H + 0.011 + c * 0.023, HEARTH.z - HEARTH_D / 2 - 0.004);
        blocks.push(g);
        s += len;
      }
    }
    const walls = new Mesh(mergeGeometries(blocks)!, stone());
    walls.name = 'HearthStones';
    this.group.add(walls);
    // Top slab with the firepot hollowed in it.
    const top = new Shape();
    top.moveTo(-HEARTH_W / 2, -HEARTH_D / 2);
    top.lineTo(HEARTH_W / 2, -HEARTH_D / 2);
    top.lineTo(HEARTH_W / 2, HEARTH_D / 2);
    top.lineTo(-HEARTH_W / 2, HEARTH_D / 2);
    const pot = new Shape();
    pot.absarc(0, 0, POT_R, 0, Math.PI * 2, true);
    top.holes.push(pot);
    const slab = new ExtrudeGeometry(top, { depth: 0.012, bevelEnabled: false, curveSegments: 24 });
    slab.rotateX(-Math.PI / 2);
    const slabMesh = new Mesh(slab, stone());
    slabMesh.position.set(HEARTH.x, f + HEARTH_H - 0.012, HEARTH.z);
    this.group.add(slabMesh);
    const potWall = new Mesh(new CylinderGeometry(POT_R, POT_R * 0.8, 0.03, 24, 1, true), new MeshStandardMaterial({ color: 0x1c1410, roughness: 1, side: 2 }));
    potWall.position.set(HEARTH.x, f + HEARTH_H - 0.015, HEARTH.z);
    this.group.add(potWall);
    // Inside the walls: rubble fill, hidden; the pot's floor carries the coals.
    const fill = new Mesh(new BoxGeometry(HEARTH_W - 0.04, HEARTH_H - 0.03, HEARTH_D - 0.04), stone());
    fill.position.set(HEARTH.x, f + (HEARTH_H - 0.03) / 2, HEARTH.z);
    this.group.add(fill);

    // Charcoal: lumps heaped in the pot, hot ones in the middle.
    for (const ring of [0, 1]) {
      const lumps: BufferGeometry[] = [];
      const n = ring === 0 ? 26 : 34;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const r = ring === 0 ? Math.sqrt(rand()) * POT_R * 0.55 : POT_R * (0.55 + rand() * 0.42);
        const size = 0.0055 + rand() * 0.006;
        const g = new DodecahedronGeometry(size, 0);
        g.scale(1, 0.7, 1.2);
        g.rotateY(rand() * 6);
        g.rotateX(rand() * 6);
        const mound = 0.012 * (1 - (r / POT_R) ** 2);
        g.translate(Math.cos(a) * r, COAL_TOP - 0.012 + mound + rand() * 0.004, Math.sin(a) * r);
        lumps.push(g);
      }
      const material = new MeshStandardMaterial({ color: 0x151110, roughness: 0.95, flatShading: true, emissive: 0x000000 });
      this.coalMaterials.push(material);
      const coals = new Mesh(mergeGeometries(lumps)!, material);
      coals.position.set(HEARTH.x, f, HEARTH.z);
      coals.userData.keep = true;
      this.group.add(coals);
    }
  }

  private buildAnvil(f: number): void {
    // A stump of oak, end grain up, bound with iron.
    const stump = new Mesh(new CylinderGeometry(0.042, 0.048, STUMP_H, 14), timber());
    stump.position.set(ANVIL.x, f + STUMP_H / 2, ANVIL.z);
    this.group.add(stump);
    const top = new Mesh(new CylinderGeometry(0.042, 0.042, 0.002, 14), hardwood());
    top.position.set(ANVIL.x, f + STUMP_H + 0.001, ANVIL.z);
    this.group.add(top);
    const hoop = band(0.045, 0.006);
    hoop.position.set(ANVIL.x, f + STUMP_H * 0.75, ANVIL.z);
    this.group.add(hoop);

    // London-pattern anvil: feet, waist, face with a heel and a horn.
    const y0 = STUMP_H;
    const parts = [
      new BoxGeometry(0.07, 0.014, 0.042).translate(0, y0 + 0.007, 0),
      new BoxGeometry(0.05, 0.004, 0.03).translate(0, y0 + 0.016, 0),
      new BoxGeometry(0.04, 0.02, 0.022).translate(0, y0 + 0.028, 0),
      new BoxGeometry(0.06, 0.004, 0.028).translate(0, y0 + 0.04, 0),
      new BoxGeometry(FACE_HALF.x * 2, 0.008, FACE_HALF.z * 2).translate(0, y0 + 0.046, 0),
      new BoxGeometry(0.018, 0.007, 0.024).translate(-FACE_HALF.x - 0.008, y0 + 0.0465, 0),
      new ConeGeometry(0.0095, 0.045, 14).rotateZ(-Math.PI / 2 - 0.12).translate(FACE_HALF.x + 0.02, y0 + 0.044, 0),
    ];
    const body = new Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, new MeshStandardMaterial({ color: 0x2b2b2d, metalness: 0.75, roughness: 0.5 }));
    body.position.set(ANVIL.x, f, ANVIL.z);
    this.group.add(body);
    // The face is polished bright by years of work; a hardy hole near the heel.
    const face = new Mesh(new BoxGeometry(FACE_HALF.x * 2 - 0.002, 0.0012, FACE_HALF.z * 2 - 0.002), new MeshStandardMaterial({ color: 0x9a9ca0, metalness: 0.95, roughness: 0.22 }));
    face.position.set(ANVIL.x, f + FACE_Y + 0.0006, ANVIL.z);
    this.group.add(face);
    const hardy = new Mesh(new BoxGeometry(0.006, 0.0014, 0.006), new MeshBasicMaterial({ color: 0x050505 }));
    hardy.position.set(ANVIL.x - FACE_HALF.x + 0.008, f + FACE_Y + 0.0008, ANVIL.z);
    this.group.add(hardy);
  }

  private buildTrough(f: number): void {
    const { x: w, y: h, z: d } = TROUGH_SIZE;
    const t = 0.006;
    const planks = [
      new BoxGeometry(w, t, d).translate(0, t / 2, 0),
      new BoxGeometry(w, h, t).translate(0, h / 2, d / 2 - t / 2),
      new BoxGeometry(w, h, t).translate(0, h / 2, -d / 2 + t / 2),
      new BoxGeometry(t, h, d).translate(w / 2 - t / 2, h / 2, 0),
      new BoxGeometry(t, h, d).translate(-w / 2 + t / 2, h / 2, 0),
    ];
    const box = new Mesh(mergeGeometries(planks)!, timber());
    box.position.set(TROUGH.x, f, TROUGH.z);
    this.group.add(box);
    for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) {
      const hoop = new Mesh(new BoxGeometry(0.004, h + 0.002, d + 0.003), iron());
      hoop.position.set(TROUGH.x + x, f + h / 2, TROUGH.z);
      this.group.add(hoop);
    }
    const water = new Mesh(new PlaneGeometry(w - t * 2, d - t * 2), new MeshStandardMaterial({ color: 0x1d2e33, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(TROUGH.x, f + WATER_Y, TROUGH.z);
    this.group.add(water);
  }

  private buildRack(f: number): void {
    for (const dx of [-0.03, 0.03]) {
      const post = new Mesh(new BoxGeometry(0.008, RACK_Y, 0.03), timber());
      post.position.set(RACK.x + dx, f + RACK_Y / 2 - 0.006, RACK.z);
      this.group.add(post);
    }
  }

  /** The smith's colour chart: swatches painted with the very glow the physics gives. */
  private buildChart(f: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#14213d';
    g.fillRect(0, 0, 512, 128);
    const color = new Color();
    for (let t = 450; t <= 1400; t += 5) {
      const b = glow(t, color);
      const x = ((t - 450) / 950) * 472 + 20;
      const k = Math.min(1, 0.12 + b);
      color.multiplyScalar(k);
      g.fillStyle = `#${color.getHexString()}`;
      g.fillRect(x, 40, 5, 44);
    }
    g.fillStyle = '#ffffff';
    g.font = `700 17px ${FONT}`;
    g.textAlign = 'center';
    const label = (t: number, text: string) => g.fillText(text, ((t - 450) / 950) * 472 + 20, 110);
    label(600, 'too cold');
    label(1080, 'FORGE');
    label(1360, 'burns');
    g.font = `600 15px ${FONT}`;
    for (const t of [600, 800, 1000, 1200, 1400]) g.fillText(`${t}°`, ((t - 450) / 950) * 472 + 20, 30);
    // Brackets marking the working band.
    g.strokeStyle = '#ffc928';
    g.lineWidth = 3;
    const x0 = ((FORGE_MIN - 450) / 950) * 472 + 20;
    const x1 = ((1260 - 450) / 950) * 472 + 20;
    g.strokeRect(x0, 37, x1 - x0, 50);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const board = new Mesh(new PlaneGeometry(CHART_W, CHART_W / 4), new MeshBasicMaterial({ map: texture }));
    const chart = new Group();
    chart.position.set(HEARTH.x, f + HEARTH_H + 0.05, HEARTH.z - HEARTH_D / 2 + 0.0105);
    chart.add(board);
    const frame = new Mesh(new BoxGeometry(CHART_W + 0.008, CHART_W / 4 + 0.008, 0.004), timber());
    frame.position.z = -0.0025;
    chart.add(frame);
    const pointer = new Mesh(new ConeGeometry(0.005, 0.01, 3), new MeshStandardMaterial({ color: 0xe8c070, metalness: 0.9, roughness: 0.3, emissive: 0x3a2a00 }));
    pointer.rotation.x = Math.PI;
    pointer.position.set(0, CHART_W / 8 + 0.006, 0.003);
    this.chartPointer.add(pointer);
    chart.add(this.chartPointer);
    this.group.add(chart);
  }
}

const CHART_W = 0.2;

function chartX(celsius: number): number {
  const t = Math.min(1400, Math.max(450, celsius));
  return (((t - 450) / 950) * 472 + 20) / 512 * CHART_W - CHART_W / 2;
}

function cap(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

function easeOut(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** Turn a group so its +X runs along `x` and its +Y as close to `y` as it can. */
function orient(group: Group, x: Vector3, y: Vector3): void {
  const ax = x.clone().normalize();
  const az = new Vector3().crossVectors(ax, y).normalize();
  if (az.lengthSq() < 1e-6) az.set(0, 0, 1);
  const ay = new Vector3().crossVectors(az, ax).normalize();
  const m = group.matrix.makeBasis(ax, ay, az);
  group.quaternion.setFromRotationMatrix(m);
}

/**
 * Square bar stock with a morph target for the finished axe head. The bar's
 * x runs from the eye end (−) to the bit (+). Drawing it out shortens it a
 * little, flares the bit tall and thins it to an edge, keeping roughly the
 * same volume of steel.
 */
function barGeometry(): BufferGeometry {
  const g = new BoxGeometry(BAR_L, BAR_T, BAR_T, 16, 4, 4);
  const p = g.attributes.position as BufferAttribute;
  const target = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / BAR_L + 0.5;
    const v = p.getY(i) / BAR_T;
    const w = p.getZ(i) / BAR_T;
    const flare = smooth(0.3, 1, u);
    const length = 0.068;
    const height = 0.013 + 0.032 * flare;
    const thick = 0.016 - 0.0135 * smooth(0.25, 1, u);
    // Hammer blows thin it top to bottom and spread it sideways, as on a real
    // anvil; the bit spreads more to one side into a beard.
    target[i * 3] = (u - 0.5) * length;
    target[i * 3 + 1] = v * thick;
    target[i * 3 + 2] = w * height - 0.007 * flare;
  }
  const shaped = g.clone();
  shaped.setAttribute('position', new Float32BufferAttribute(target, 3));
  shaped.computeVertexNormals();
  g.morphAttributes.position = [shaped.attributes.position];
  g.morphAttributes.normal = [shaped.attributes.normal];
  return g;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function flameCanvas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,240,190,0.95)');
  grad.addColorStop(0.3, 'rgba(255,170,60,0.8)');
  grad.addColorStop(0.7, 'rgba(230,70,20,0.35)');
  grad.addColorStop(1, 'rgba(120,20,0,0)');
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

// ================================================================== Bellows

/**
 * Smith's bellows: two pear-shaped boards hinged at the nozzle and a leather
 * skin between them. Press the top board down and air is forced out through
 * the nozzle into the fire; a weight lifts it again, drawing air in through
 * the flap valve in the bottom board. Air out = how fast the volume shrinks.
 */
class Bellows {
  readonly group = new Group();
  /** Angle of the top board: 0 shut, BELLOWS_OPEN at rest. */
  angle = BELLOWS_OPEN;
  /** True on the frame a stroke starts. */
  whoosh = false;
  /** Depth of the stroke in progress, radians. */
  stroke = 0;
  private readonly lid = new Group();
  private readonly skin: Mesh;
  private readonly outline: Array<[number, number]> = [];
  private readonly rings = 6;
  private pushing = false;
  private readonly local = new Vector3();

  constructor() {
    this.group.name = 'Bellows';
    // Outline: narrow at the nozzle (x = 0), widest two-thirds back, round at the end.
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const half = (BELLOWS_W / 2) * (0.25 + 0.75 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5)) * (t > 0.85 ? Math.cos(((t - 0.85) / 0.15) * Math.PI * 0.42) : 1);
      this.outline.push([-t * BELLOWS_L, half]);
    }
    const shape = new Shape();
    shape.moveTo(this.outline[0][0], this.outline[0][1]);
    for (const [x, h] of this.outline) shape.lineTo(x, h);
    for (let i = this.outline.length - 1; i >= 0; i--) shape.lineTo(this.outline[i][0], -this.outline[i][1]);
    const board = new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
    board.rotateX(Math.PI / 2);
    const bottom = new Mesh(board, timber());
    bottom.position.y = 0;
    this.group.add(bottom);
    const top = new Mesh(board, timber());
    top.position.y = 0.006;
    this.lid.add(top);
    // A handle out the back of the top board.
    const handle = new Mesh(new BoxGeometry(0.05, 0.007, 0.012), hardwood());
    handle.position.set(-BELLOWS_L - 0.02, 0.009, 0);
    this.lid.add(handle);
    this.group.add(this.lid);

    // Nozzle: an iron tuyere pointing into the hearth's side.
    const nozzle = new Mesh(new ConeGeometry(0.009, 0.06, 10), iron());
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.set(0.025, 0.001, 0);
    this.group.add(nozzle);

    // Leather: rings between the boards' outlines, updated as the lid moves.
    const loop = this.loop();
    const count = this.rings * loop.length;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    const index: number[] = [];
    for (let r = 0; r < this.rings - 1; r++) {
      for (let i = 0; i < loop.length; i++) {
        const a = r * loop.length + i;
        const b = r * loop.length + ((i + 1) % loop.length);
        const c = a + loop.length;
        const d = b + loop.length;
        index.push(a, b, c, b, d, c);
      }
    }
    geometry.setIndex(index);
    this.skin = new Mesh(geometry, new MeshStandardMaterial({ color: 0x3a2618, roughness: 0.85, side: 2 }));
    this.skin.userData.keep = true;
    this.skin.frustumCulled = false;
    this.group.add(this.skin);

    // Stand under it.
    for (const x of [-0.03, -BELLOWS_L + 0.03]) {
      const leg = new Mesh(new BoxGeometry(0.01, BELLOWS_AT.y, 0.05), timber());
      leg.position.set(x, -BELLOWS_AT.y / 2, 0);
      this.group.add(leg);
    }
    this.pose();
  }

  /** The outline as a closed loop of (x, z) points. */
  private loop(): Array<[number, number]> {
    return [...this.outline.map(([x, h]) => [x, h] as [number, number]), ...[...this.outline].reverse().map(([x, h]) => [x, -h] as [number, number])];
  }

  /** Returns the air flow pushed out this frame (radians of lid per second). */
  update(dt: number, hands: readonly HandState[]): number {
    const before = this.angle;
    // The weight lifts the lid back up.
    this.angle += (BELLOWS_OPEN - this.angle) * Math.min(1, dt * 1.8);
    // Any fingertip or palm on the lid pushes it down to its own height.
    let pressed = false;
    for (const hand of hands) {
      if (!hand.tracked) continue;
      for (const point of [...hand.tips, hand.palm]) {
        const p = this.group.worldToLocal(this.local.copy(point));
        if (p.x > -0.03 || p.x < -BELLOWS_L - 0.05) continue;
        const half = BELLOWS_W / 2 + 0.012;
        if (Math.abs(p.z) > half || p.y < -0.01) continue;
        const surface = Math.sin(this.angle) * -p.x + 0.012;
        if (p.y > surface + 0.012) continue;
        const want = Math.max(0, Math.atan2(Math.max(0, p.y - 0.012), -p.x));
        if (want < this.angle) {
          this.angle = want;
          pressed = true;
        }
      }
    }
    const flow = Math.max(0, before - this.angle) / Math.max(dt, 1e-3);
    this.whoosh = false;
    if (flow > 0.5 && !this.pushing) {
      this.pushing = true;
      this.whoosh = true;
      this.stroke = before;
    }
    if (!pressed || flow < 0.05) this.pushing = this.pushing && pressed;
    this.pose();
    return flow;
  }

  private pose(): void {
    this.lid.rotation.z = -this.angle;
    const loop = this.loop();
    const position = this.skin.geometry.attributes.position as BufferAttribute;
    const open = this.angle / BELLOWS_OPEN;
    for (let r = 0; r < this.rings; r++) {
      const s = r / (this.rings - 1);
      // Pleats: alternate rings bulge out, more when the bellows are full.
      const bulge = Math.sin(s * Math.PI) * (r % 2 === 0 ? 0.004 : 0.011) * open;
      loop.forEach(([x, z], i) => {
        const yTop = Math.sin(this.angle) * -x + 0.006;
        const xTop = x * Math.cos(this.angle);
        const px = x + (xTop - x) * s;
        const py = yTop * s + 0.003;
        const out = Math.sign(z) || 1;
        position.setXYZ(r * loop.length + i, px, py, z + out * bulge);
      });
    }
    position.needsUpdate = true;
    this.skin.geometry.computeVertexNormals();
  }
}
