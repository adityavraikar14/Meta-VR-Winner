import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { playCrackle, playIgnite, playTinkle, playWhoosh } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { hemp, iron, RopeSpan } from './parts.js';
import { ParticlePool } from './particles.js';

/**
 * The Sky Lantern: a paper hot-air balloon that must carry the Lantern Stone
 * up to the ledge where the mountain path begins.
 *
 * Real buoyancy (Archimedes): the envelope's air is lighter the hotter it is
 * (density ∝ 1/T, ideal gas), so lift = V·g·ρ_out·(1 − T_out/T_in). It rises
 * when lift beats the weight of paper, frame and load. Cup your hand under
 * the burner to shelter the flame and it burns hotter; take it away and the
 * air cools towards the room. Too hot and the paper scorches. A tether rope
 * pays out as it climbs; at the ledge's height the stone is delivered.
 */

const AT = new Vector3(0.05, 0, -0.05);
const LEDGE = new Vector3(-0.3, 0.3, -0.3);
/** Envelope volume (m³ at toy scale, but real proportions) and masses (kg). */
const VOLUME = 0.0011;
const RHO_AIR = 1.2;
const T_ROOM = 293;
const MASS_EMPTY = 0.00028;
const MASS_STONE = 0.00007;
const G = 9.8;
/** It lifts above ~400 K (with the stone aboard) and scorches above 440 K: a narrow, real window. */
const T_SCORCH = 440;
const T_FLAME = 470;
const CUP_REACH = 0.07;
const RISE = 0.3;

export class SkyLantern {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private tIn = T_ROOM;
  private height = 0;
  private velocity = 0;
  private lit = false;
  private cupped = 0;
  private devCup = false;
  private scorch = 0;
  private delivered = false;
  private finishIn = -1;
  /** The hottest the air inside got, for the Inventor's Journal. */
  private hottest = T_ROOM;
  private crackleIn = 0;
  private time = 0;
  private note = '';
  private noteTime = 0;

  private readonly balloon = new Group();
  private readonly paper: MeshStandardMaterial;
  private readonly flame: Mesh;
  private readonly glow: Mesh;
  private readonly stone: Mesh;
  private readonly tether = new RopeSpan(0.0012);
  private readonly smoke = new ParticlePool({ count: 60, additive: false, soft: true });
  private readonly v = new Vector3();

  constructor(private readonly floor: number) {
    this.group.name = 'SkyLantern';
    const f = floor;

    // The ledge it must reach: a rock shelf up behind, with a stone plinth.
    const ledge = new Mesh(new CylinderGeometry(0.08, 0.1, 0.03, 9), new MeshStandardMaterial({ color: 0x8c847a, roughness: 0.95, flatShading: true }));
    ledge.position.set(LEDGE.x, f + LEDGE.y, LEDGE.z);
    this.group.add(ledge);
    const pillar = new Mesh(new CylinderGeometry(0.035, 0.06, LEDGE.y, 9), new MeshStandardMaterial({ color: 0x7a7268, roughness: 1, flatShading: true }));
    pillar.position.set(LEDGE.x, f + LEDGE.y / 2, LEDGE.z);
    this.group.add(pillar);
    const marker = new Mesh(new TorusGeometry(0.03, 0.003, 6, 24), new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.7, blending: AdditiveBlending }));
    marker.rotation.x = Math.PI / 2;
    marker.position.set(LEDGE.x, f + LEDGE.y + 0.018, LEDGE.z);
    this.group.add(marker);

    // The lantern: a ribbed paper envelope, a bamboo ring, a wire burner basket.
    const profile: Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = 0.055 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62 + 0.25) * (1 - 0.15 * t);
      profile.push(new Vector2(Math.max(0.012, r), t * 0.13));
    }
    this.paper = new MeshStandardMaterial({ map: paperTexture(), color: 0xfff1d8, roughness: 0.9, side: 2, transparent: true, opacity: 0.93, emissive: new Color(0xffa040), emissiveIntensity: 0 });
    const envelope = new Mesh(new LatheGeometry(profile, 18), this.paper);
    envelope.position.y = 0.035;
    this.balloon.add(envelope);
    const ring = new Mesh(new TorusGeometry(0.03, 0.0018, 6, 24), new MeshStandardMaterial({ color: 0xc8a060, roughness: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.036;
    this.balloon.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const wire = new Mesh(new CylinderGeometry(0.0006, 0.0006, 0.04, 4), iron());
      wire.position.set(Math.cos(a) * 0.015, 0.018, Math.sin(a) * 0.015);
      wire.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      this.balloon.add(wire);
    }
    const basket = new Mesh(new CylinderGeometry(0.009, 0.007, 0.008, 10), iron());
    this.balloon.add(basket);
    this.flame = new Mesh(new PlaneGeometry(0.02, 0.035), new MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2 }));
    this.flame.position.y = 0.02;
    this.flame.visible = false;
    this.balloon.add(this.flame);
    this.glow = new Mesh(new PlaneGeometry(0.22, 0.22), new MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.glow.position.y = 0.09;
    this.glow.visible = false;
    this.balloon.add(this.glow);
    // The Lantern Stone hangs in a little net under the burner.
    this.stone = new Mesh(new CylinderGeometry(0.008, 0.006, 0.012, 6), new MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff7a20, emissiveIntensity: 1.8 }));
    this.stone.position.y = -0.016;
    this.balloon.add(this.stone);
    this.balloon.position.set(AT.x, f + 0.02, AT.z);
    for (const o of [envelope, this.flame, this.glow, this.stone]) o.userData.keep = true;
    this.group.add(this.balloon);

    // Tether peg and rope.
    const peg = new Mesh(new CylinderGeometry(0.004, 0.004, 0.03, 6), new MeshStandardMaterial({ color: 0x7a5232 }));
    peg.position.set(AT.x + 0.06, f + 0.015, AT.z + 0.04);
    this.group.add(peg);
    this.tether.mesh.material = hemp();
    this.group.add(this.tether.mesh, this.smoke.points);

    devInfo.sky = () => this.state;
    devActions['['] = () => this.light();
    // Dev: ] toggles a hand cupped under the flame (on until pressed again).
    devActions[']'] = () => {
      this.devCup = !this.devCup;
    };
    this.lit = false;
  }

  get state(): string {
    return `cup=${this.cupped > 0} T=${Math.round(this.tIn)}K lift=${(this.liftRatio() * 100).toFixed(0)}% h=${this.height.toFixed(3)} lit=${this.lit} scorch=${this.scorch.toFixed(2)} done=${this.done}`;
  }

  /** Your lantern's flight, for the Inventor's Journal. */
  journal(): string[] {
    const lift = this.liftRatio(this.hottest);
    return [
      `Air inside: ${Math.round(this.hottest)} K (${Math.round(this.hottest - 273)} °C) · outside ${T_ROOM} K`,
      `Lift: ${Math.round(lift * 100)}% of its weight · ${Math.round((1 - T_ROOM / this.hottest) * 100)}% of the air's weight gone`,
      this.scorch > 0.05 ? `Paper scorched ${Math.round(this.scorch * 100)}%: a little too hot` : 'No scorch marks: well judged',
    ];
  }

  /** Lift over weight: above 1 it rises. */
  private liftRatio(tIn = this.tIn): number {
    const lift = VOLUME * G * RHO_AIR * (1 - T_ROOM / tIn);
    const weight = (MASS_EMPTY + MASS_STONE) * G;
    return lift / weight;
  }

  private light(): void {
    if (this.lit) return;
    this.lit = true;
    this.flame.visible = true;
    this.glow.visible = true;
    playIgnite();
  }

  update(dt: number, hands: readonly HandState[]): void {
    if (!stage.playing) hands = [];
    this.time += dt;
    this.noteTime -= dt;
    const f = this.floor;
    const burner = this.group.localToWorld(this.v.copy(this.balloon.position));

    // A pinch at the burner lights it; a cupped hand just below shelters the flame.
    let cupping = false;
    for (const hand of hands) {
      if (!hand.tracked) continue;
      if (!this.lit && hand.pinchStarted && hand.pinch.distanceTo(burner) < 0.05) this.light();
      const below = burner.y - hand.palm.y;
      const near = Math.hypot(hand.palm.x - burner.x, hand.palm.z - burner.z);
      if (this.lit && below > 0.005 && below < CUP_REACH && near < 0.05 && hand.palmNormal.y > 0.4) cupping = true;
    }
    if (cupping || this.devCup) this.cupped = 0.3;
    this.cupped = Math.max(0, this.cupped - dt);

    // Heat: the flame warms the air inside; sheltered, it burns hotter. It always cools to the room.
    const sheltered = this.cupped > 0;
    const flameT = this.lit ? (sheltered ? T_FLAME : 360) : T_ROOM;
    this.tIn += ((flameT - this.tIn) / (sheltered ? 5 : 7)) * dt;
    this.hottest = Math.max(this.hottest, this.tIn);
    if (this.tIn > T_SCORCH) {
      this.scorch += dt * 0.35;
      if (this.noteTime <= 0) this.say('Too hot! The paper is scorching: take your hand away for a moment', 1.6);
      if (this.scorch >= 1) {
        this.mistakes++;
        this.scorch = 0;
        this.tIn = T_ROOM + 20;
        this.say('It scorched through! A fresh paper envelope… keep it warm, not too hot', 3);
      }
    } else {
      this.scorch = Math.max(0, this.scorch - dt * 0.1);
    }

    // Motion: buoyancy minus weight, with air drag; the ground and the ledge stop it.
    if (!this.delivered) {
      // Toy-scale: the same balance of forces, slowed so you can watch it climb.
      const net = (this.liftRatio() - 1) * G * 0.15;
      this.velocity += (net - this.velocity * 2.2) * dt;
      this.height = Math.max(0, Math.min(RISE, this.height + this.velocity * dt));
      if (this.height === 0 && this.velocity < 0) this.velocity = 0;
      const k = this.height / RISE;
      this.balloon.position.set(AT.x + (LEDGE.x - AT.x) * k * k, f + 0.02 + this.height + 0.02 * Math.sin(this.time * 1.3) * k, AT.z + (LEDGE.z - AT.z) * k * k);
      if (this.height >= RISE - 0.002) this.deliver();
    }
    this.balloon.rotation.y += dt * 0.25;

    // Look: the paper glows with the heat and darkens as it scorches.
    const warm = Math.max(0, Math.min(1, (this.tIn - T_ROOM) / (T_SCORCH - T_ROOM)));
    this.paper.emissiveIntensity = this.lit ? 0.25 + warm * 0.9 : 0;
    this.paper.color.setRGB(1, 0.95 - this.scorch * 0.5, 0.85 - this.scorch * 0.7);
    this.flame.scale.set(1, (sheltered ? 1.4 : 0.9) * (0.85 + Math.random() * 0.3), 1);
    this.flame.lookAt(this.group.worldToLocal(this.v.copy(stage.paper!.localToWorld(new Vector3(0, 0.12, 1)))));
    (this.glow.material as MeshBasicMaterial).opacity = 0.4 + warm * 0.5;
    if (this.lit) {
      this.crackleIn -= dt;
      if (this.crackleIn <= 0) {
        this.crackleIn = 0.4 + Math.random() * 0.8;
        playCrackle(0.008);
      }
      if (this.scorch > 0.2 && Math.random() < dt * 8) {
        this.smoke.emit(this.group.localToWorld(this.v.copy(this.balloon.position).setY(this.balloon.position.y + 0.12)).sub(this.group.getWorldPosition(new Vector3())), new Vector3(0, 0.05, 0), { life: 1.5, gravity: -0.02, size: [0.01, 0.04], from: 0x555555, alpha: 0.4 });
      }
    }
    this.tether.set(this.v.set(AT.x + 0.06, f + 0.03, AT.z + 0.04), this.balloon.position.clone().setY(this.balloon.position.y - 0.016));
    this.smoke.update(dt);

    if (this.finishIn > 0) {
      this.finishIn -= dt;
      if (this.finishIn <= 0) this.done = true;
    }
    this.caption = this.noteTime > 0 ? this.note : this.prompt();
  }

  private prompt(): string {
    const lift = Math.round(this.liftRatio() * 100);
    if (this.delivered) return 'The Lantern Stone reached the ledge! The mountain path is open.';
    if (!this.lit) return 'Pinch the little burner under the paper lantern to light it';
    if (this.liftRatio() < 1) return `Hot air is lighter: cup your palm under the flame to shelter it · lift ${lift}% of its weight`;
    return `Rising! Lift ${lift}% of its weight · keep it warm, but not too hot`;
  }

  private say(text: string, seconds: number): void {
    this.note = text;
    this.noteTime = seconds;
  }

  private deliver(): void {
    this.delivered = true;
    this.velocity = 0;
    this.stone.visible = false;
    playTinkle();
    playWhoosh(0.6);
    this.finishIn = 2.2;
  }
}

function paperTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff4dc';
  g.fillRect(0, 0, 128, 128);
  // Bamboo ribs and a painted band.
  g.strokeStyle = 'rgba(160, 110, 50, 0.55)';
  g.lineWidth = 2;
  for (let x = 0; x <= 128; x += 16) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  g.fillStyle = 'rgba(200, 60, 40, 0.75)';
  g.fillRect(0, 70, 128, 10);
  g.fillStyle = 'rgba(230, 160, 40, 0.8)';
  g.fillRect(0, 84, 128, 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function flameTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,240,190,1)');
  grad.addColorStop(0.4, 'rgba(255,150,40,0.85)');
  grad.addColorStop(1, 'rgba(160,30,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(16, 0);
  g.bezierCurveTo(28, 26, 32, 48, 16, 64);
  g.bezierCurveTo(0, 48, 4, 26, 16, 0);
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,210,140,0.7)');
  grad.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
