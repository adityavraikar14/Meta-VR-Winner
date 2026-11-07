/**
 * Meshes and small effects for the Arsenal level. Everything is unlit
 * (MeshBasicMaterial plus additive glow shells): no real-time lights, cheap on Quest.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';

/** Distance from the grip to the sword's tip, along the blade (+Y). */
export const SWORD_LENGTH = 0.8;
/** Distance from the grip to the spear's tip (+Y). */
export const SPEAR_TIP = 1.13;
export const BALL_RADIUS = 0.08;
export const WALL_WIDTH = 1.2;
export const WALL_HEIGHT = 1.1;
export const ORB_RADIUS = 0.08;
export const FOE_RADIUS = 0.22;

export function glow(color: number, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

/** Grip at the origin, blade along +Y. */
export function makeSword(): Group {
  const sword = new Group();
  sword.name = 'Sword';
  const handle = new Mesh(new CylinderGeometry(0.014, 0.016, 0.15, 10), new MeshBasicMaterial({ color: 0x3a2a1c }));
  handle.position.y = -0.06;
  const guard = new Mesh(new BoxGeometry(0.14, 0.022, 0.035), new MeshBasicMaterial({ color: 0xd8b25a }));
  guard.position.y = 0.025;
  const steel = new MeshBasicMaterial({ color: 0xdff6ff });
  const blade = new Mesh(new BoxGeometry(0.04, 0.68, 0.008), steel);
  blade.position.y = 0.4;
  const tip = new Mesh(new ConeGeometry(0.028, 0.06, 4), steel);
  tip.position.y = SWORD_LENGTH - 0.03;
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.2;
  const aura = new Mesh(new BoxGeometry(0.085, 0.76, 0.03), glow(0x66d9ff, 0.35));
  aura.position.y = 0.42;
  sword.add(handle, guard, blade, tip, aura);
  return sword;
}

/** Grip at the origin, point along +Y. */
export function makeSpear(): Group {
  const spear = new Group();
  spear.name = 'Spear';
  const shaft = new Mesh(new CylinderGeometry(0.012, 0.012, 1.5, 8), new MeshBasicMaterial({ color: 0x5b4330 }));
  shaft.position.y = 0.2;
  const binding = new Mesh(new TorusGeometry(0.016, 0.006, 6, 12), new MeshBasicMaterial({ color: 0xd8b25a }));
  binding.position.y = 0.95;
  binding.rotation.x = Math.PI / 2;
  const head = new Mesh(new ConeGeometry(0.035, 0.18, 6), new MeshBasicMaterial({ color: 0xe8fbff }));
  head.position.y = SPEAR_TIP - 0.09;
  const aura = new Mesh(new SphereGeometry(0.07, 12, 8), glow(0x7fe0ff, 0.4));
  aura.position.y = SPEAR_TIP - 0.1;
  aura.scale.set(0.8, 1.6, 0.8);
  spear.add(shaft, binding, head, aura);
  return spear;
}

export function makeBall(): Group {
  const ball = new Group();
  ball.name = 'PowerBall';
  const core = new Mesh(new SphereGeometry(0.045, 16, 12), new MeshBasicMaterial({ color: 0xffffff }));
  const shell = new Mesh(new SphereGeometry(0.075, 16, 12), glow(0x6fd6ff, 0.55));
  const halo = new Mesh(new SphereGeometry(0.11, 16, 12), glow(0x3a8cff, 0.2));
  ball.add(core, shell, halo);
  return ball;
}

export interface WallRig {
  root: Group;
  panelMaterial: MeshBasicMaterial;
  /** Health bar fill: scale x from 0 to 1. */
  barFill: Mesh;
  barMaterial: MeshBasicMaterial;
}

/** Muzzle at the origin, barrel back along −Y, so it can sit along the index finger. */
export function makeGun(): Group {
  const gun = new Group();
  gun.name = 'Blaster';
  const shell = new MeshBasicMaterial({ color: 0x2a3550 });
  const barrel = new Mesh(new CylinderGeometry(0.011, 0.014, 0.1, 10), shell);
  barrel.position.y = -0.05;
  const rails = new Mesh(new BoxGeometry(0.03, 0.08, 0.012), new MeshBasicMaterial({ color: 0x8fa6c8 }));
  rails.position.set(0, -0.06, 0.016);
  const core = new Mesh(new CylinderGeometry(0.008, 0.008, 0.07, 8), glow(0x7af0ff, 0.9));
  core.position.y = -0.055;
  const ring = new Mesh(new TorusGeometry(0.014, 0.004, 6, 16), new MeshBasicMaterial({ color: 0x7af0ff }));
  ring.rotation.x = Math.PI / 2;
  const muzzleGlow = new Mesh(new SphereGeometry(0.018, 10, 8), glow(0x7af0ff, 0.5));
  gun.add(barrel, rails, core, ring, muzzleGlow);
  return gun;
}

/** A crosshair sprite: ring with four ticks. Tint it with `material.color`. */
export function makeCrosshair(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 34, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    for (const [x0, y0, x1, y1] of [[64, 4, 64, 22], [64, 106, 64, 124], [4, 64, 22, 64], [106, 64, 124, 64]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 5, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 12;
  return sprite;
}

/** A thin beam along +Y with length 1; scale y to its length. */
export function makeBeam(radius: number, color: number, opacity: number): Mesh {
  const geometry = new CylinderGeometry(radius, radius, 1, 6);
  geometry.translate(0, 0.5, 0);
  const beam = new Mesh(geometry, glow(color, opacity));
  beam.frustumCulled = false;
  return beam;
}

/** Bottom edge at the origin, facing +Z, with a health bar along the top. */
export function makeWall(): WallRig {
  const wall = new Group();
  wall.name = 'LightWall';
  const box = new BoxGeometry(WALL_WIDTH, WALL_HEIGHT, 0.02);
  const panelMaterial = glow(0x59c8ff, 0.22);
  const panel = new Mesh(box, panelMaterial);
  const edges = new LineSegments(
    new EdgesGeometry(box),
    new LineBasicMaterial({ color: 0xaee9ff, transparent: true, opacity: 0.9 }),
  );
  const stripes = new Group();
  const stripeMaterial = glow(0x9fe8ff, 0.25);
  for (let i = 1; i < 4; i++) {
    const stripe = new Mesh(new PlaneGeometry(WALL_WIDTH, 0.012), stripeMaterial);
    stripe.position.y = (i / 4 - 0.5) * WALL_HEIGHT;
    stripes.add(stripe);
  }
  const body = new Group();
  body.add(panel, edges, stripes);
  body.position.y = WALL_HEIGHT / 2;

  // Health bar just above the top edge, on the player's side.
  const bar = new Group();
  bar.position.set(0, WALL_HEIGHT + 0.06, 0.02);
  const back = new Mesh(new PlaneGeometry(0.62, 0.05), new MeshBasicMaterial({ color: 0x0c1a2c }));
  const fillGeometry = new PlaneGeometry(0.6, 0.034);
  fillGeometry.translate(0.3, 0, 0);
  const barMaterial = new MeshBasicMaterial({ color: 0x5fe08a });
  const barFill = new Mesh(fillGeometry, barMaterial);
  barFill.position.set(-0.3, 0, 0.002);
  bar.add(back, barFill);
  wall.add(body, bar);
  return { root: wall, panelMaterial, barFill, barMaterial };
}

export interface FoeRig {
  root: Group;
  body: Mesh;
  bodyMaterial: MeshBasicMaterial;
  rings: Mesh[];
  barFill: Mesh;
}

/** A floating crystal sentinel. Faces +Z (the eye is on that side). */
export function makeFoe(): FoeRig {
  const root = new Group();
  root.name = 'TrainingSentinel';
  const bodyMaterial = new MeshBasicMaterial({ color: 0x4a2470 });
  const body = new Mesh(new IcosahedronGeometry(FOE_RADIUS, 0), bodyMaterial);
  const facets = new LineSegments(
    new EdgesGeometry(body.geometry),
    new LineBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.8 }),
  );
  body.add(facets);
  const eye = new Mesh(new SphereGeometry(0.05, 12, 8), new MeshBasicMaterial({ color: 0xffa040 }));
  eye.position.z = FOE_RADIUS * 0.85;
  const eyeGlow = new Mesh(new SphereGeometry(0.09, 12, 8), glow(0xff7a20, 0.4));
  eye.add(eyeGlow);
  const rings: Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const ring = new Mesh(new TorusGeometry(0.33 + i * 0.05, 0.01, 6, 48), glow(0xb070ff, 0.7));
    ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4);
    rings.push(ring);
    root.add(ring);
  }
  const bar = new Group();
  bar.position.y = FOE_RADIUS + 0.2;
  const back = new Mesh(new PlaneGeometry(0.42, 0.045), new MeshBasicMaterial({ color: 0x1d1028 }));
  const fillGeometry = new PlaneGeometry(0.4, 0.03);
  fillGeometry.translate(0.2, 0, 0);
  const barFill = new Mesh(fillGeometry, new MeshBasicMaterial({ color: 0xff5a7a }));
  barFill.position.set(-0.2, 0, 0.002);
  bar.add(back, barFill);
  root.add(body, eye, bar);
  return { root, body, bodyMaterial, rings, barFill };
}

export function makeOrb(): Group {
  const orb = new Group();
  orb.name = 'FoeOrb';
  const core = new Mesh(new SphereGeometry(0.035, 12, 8), new MeshBasicMaterial({ color: 0xfff0c0 }));
  const shell = new Mesh(new SphereGeometry(ORB_RADIUS, 12, 8), glow(0xff5a2a, 0.85));
  orb.add(core, shell);
  return orb;
}

/**
 * A soft, lumpy glow drawn from several overlapping radial gradients, so a
 * flame or a hex reads as a living, uneven thing rather than a perfect disc.
 */
function lumpyGlow(stops: Array<[number, string]>, lumps: number, seed: number): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lumps; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 18;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const r = 34 + rand() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A round soft dot, for sparks and smoke puffs. */
function softDot(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const textures: Record<string, CanvasTexture> = {};
function texture(name: string, make: () => CanvasTexture): CanvasTexture {
  return (textures[name] ??= make());
}

function glowSprite(map: CanvasTexture, size: number, additive = true): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending }),
  );
  sprite.scale.setScalar(size);
  sprite.userData.base = size;
  return sprite;
}

/**
 * The dragon's fireball: a white-hot heart inside layers of flickering,
 * uneven flame. Its trail (see fireTrails) does the rest.
 */
export function makeFireball(): Group {
  const ball = new Group();
  ball.name = 'Fireball';
  const halo = glowSprite(texture('fire-halo', () => lumpyGlow([[0, 'rgba(255,90,20,0.55)'], [0.6, 'rgba(200,30,0,0.25)'], [1, 'rgba(0,0,0,0)']], 5, 11)), 0.42);
  const flame = glowSprite(texture('fire-flame', () => lumpyGlow([[0, 'rgba(255,220,120,0.9)'], [0.45, 'rgba(255,120,20,0.6)'], [1, 'rgba(0,0,0,0)']], 7, 23)), 0.26);
  const core = glowSprite(texture('fire-core', () => softDot('rgba(255,255,235,1)', 'rgba(255,220,140,0.9)')), 0.11);
  ball.add(halo, flame, core);
  ball.userData.parts = { halo, flame, core, t: Math.random() * 10 };
  return ball;
}

/** Morwen's hex: sickly green witch-fire around a bright venom-green heart. */
export function makeInkShot(): Group {
  const hex = new Group();
  hex.name = 'Hex';
  const halo = glowSprite(texture('hex-halo', () => lumpyGlow([[0, 'rgba(90,255,80,0.45)'], [0.6, 'rgba(20,120,30,0.25)'], [1, 'rgba(0,0,0,0)']], 6, 31)), 0.4);
  const flame = glowSprite(texture('hex-flame', () => lumpyGlow([[0, 'rgba(200,255,120,0.85)'], [0.45, 'rgba(60,220,60,0.6)'], [1, 'rgba(0,0,0,0)']], 8, 47)), 0.24);
  const core = glowSprite(texture('hex-core', () => softDot('rgba(240,255,210,1)', 'rgba(150,255,90,0.9)')), 0.09);
  // A wisp of dark ink inside the glow, so it reads as a witch's brew, not a lamp.
  const ink = glowSprite(texture('hex-ink', () => lumpyGlow([[0, 'rgba(5,25,5,0.85)'], [0.5, 'rgba(10,40,10,0.4)'], [1, 'rgba(0,0,0,0)']], 4, 59)), 0.17, false);
  hex.add(halo, flame, ink, core);
  hex.userData.parts = { halo, flame, core, t: Math.random() * 10 };
  return hex;
}

/** Flicker and spin a fireball or hex (both are built from the same parts). */
export function flickerShot(object: Group, dt: number): void {
  const parts = object.userData.parts as { halo: Sprite; flame: Sprite; core: Sprite; t: number } | undefined;
  if (!parts) return;
  parts.t += dt;
  const t = parts.t;
  const k = 1 + 0.12 * Math.sin(t * 23) + 0.08 * Math.sin(t * 37 + 1.3);
  parts.flame.scale.setScalar(parts.flame.userData.base * k);
  parts.halo.scale.setScalar(parts.halo.userData.base * (1 + 0.06 * Math.sin(t * 13)));
  parts.flame.material.rotation += dt * 5;
  parts.halo.material.rotation -= dt * 2.5;
  parts.halo.material.opacity = 0.8 + 0.2 * Math.sin(t * 17);
  parts.core.material.opacity = 0.85 + 0.15 * Math.sin(t * 41);
}

interface Particle {
  sprite: Sprite;
  material: SpriteMaterial;
  velocity: Vector3;
  age: number;
  life: number;
  from: number;
  to: number;
}

/**
 * A pool of short-lived sprites streaming off a moving shot: embers or
 * sparks that shrink and fade, or smoke that swells and thins.
 */
export class Trail {
  private particles: Particle[] = [];
  private next = 0;
  private start = new Color();
  private end = new Color();

  constructor(
    parent: Object3D,
    count: number,
    map: CanvasTexture,
    start: number,
    end: number,
    private life: number,
    private size: [number, number],
    /** Upward drift, m/s: heat rises. */
    private rise: number,
    private jitter: number,
    additive: boolean,
    private opacity: number,
  ) {
    this.start.setHex(start);
    this.end.setHex(end);
    for (let i = 0; i < count; i++) {
      const material = new SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
      const sprite = new Sprite(material);
      sprite.visible = false;
      parent.add(sprite);
      this.particles.push({ sprite, material, velocity: new Vector3(), age: 0, life: 1, from: 0, to: 0 });
    }
  }

  /** Emits one particle at `at`, drifting a little back along `velocity`. */
  emit(at: Vector3, velocity: Vector3): void {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % this.particles.length;
    const j = this.jitter;
    p.sprite.position.set(at.x + (Math.random() - 0.5) * j, at.y + (Math.random() - 0.5) * j, at.z + (Math.random() - 0.5) * j);
    p.velocity.copy(velocity).multiplyScalar(-0.08);
    p.velocity.x += (Math.random() - 0.5) * 0.2;
    p.velocity.y += this.rise + (Math.random() - 0.5) * 0.2;
    p.velocity.z += (Math.random() - 0.5) * 0.2;
    p.age = 0;
    p.life = this.life * (0.7 + Math.random() * 0.6);
    p.from = this.size[0] * (0.8 + Math.random() * 0.4);
    p.to = this.size[1];
    p.material.rotation = Math.random() * Math.PI * 2;
    p.sprite.visible = true;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(p.from + (p.to - p.from) * k);
      p.material.color.copy(this.start).lerp(this.end, k);
      p.material.opacity = this.opacity * (1 - k);
    }
  }
}

function emberTexture(): CanvasTexture {
  return texture('ember', () => softDot('rgba(255,255,255,1)', 'rgba(255,255,255,0.6)'));
}

function smokeTexture(): CanvasTexture {
  return texture('smoke', () => lumpyGlow([[0, 'rgba(255,255,255,0.5)'], [0.6, 'rgba(255,255,255,0.2)'], [1, 'rgba(0,0,0,0)']], 4, 71));
}

/** Embers and smoke behind the dragon's fireballs. */
export function fireTrails(parent: Object3D): Trail[] {
  return [
    new Trail(parent, 90, emberTexture(), 0xffd070, 0xff2a00, 0.45, [0.09, 0.015], 0.25, 0.05, true, 1),
    new Trail(parent, 50, smokeTexture(), 0x5a4a40, 0x1a1614, 0.8, [0.08, 0.24], 0.35, 0.04, false, 0.45),
  ];
}

/** Green sparks and dark smoke behind Morwen's hexes. */
export function hexTrails(parent: Object3D): Trail[] {
  return [
    new Trail(parent, 90, emberTexture(), 0xd8ff8a, 0x1f9e2a, 0.4, [0.06, 0.01], 0.05, 0.08, true, 1),
    new Trail(parent, 50, smokeTexture(), 0x163a12, 0x050a05, 0.75, [0.07, 0.2], 0.12, 0.04, false, 0.55),
  ];
}

export const SHIELD_RADIUS = 0.2;

/** The shield: a round disc of light with a bright rim, facing +Z. */
export function makeShield(): { root: Group; disc: MeshBasicMaterial } {
  const root = new Group();
  root.name = 'Shield';
  const disc = glow(0x7fd8ff, 0.32);
  disc.side = DoubleSide;
  const face = new Mesh(new CircleGeometry(SHIELD_RADIUS, 40), disc);
  const rim = new Mesh(new TorusGeometry(SHIELD_RADIUS, 0.012, 8, 48), new MeshBasicMaterial({ color: 0xbff0ff }));
  const boss = new Mesh(new SphereGeometry(0.035, 12, 8), new MeshBasicMaterial({ color: 0xe6f8ff }));
  boss.scale.z = 0.4;
  const ring = new Mesh(new TorusGeometry(SHIELD_RADIUS * 0.55, 0.006, 6, 40), glow(0xbff0ff, 0.7));
  root.add(face, rim, ring, boss);
  return { root, disc };
}

export const STONE_RADIUS = 0.03;

/** A slingshot stone, with a faint glow so it can be followed in flight. */
export function makeStone(): Group {
  const stone = new Group();
  stone.name = 'Stone';
  const rock = new Mesh(new IcosahedronGeometry(STONE_RADIUS, 0), new MeshBasicMaterial({ color: 0x8a8378 }));
  const shine = new Mesh(new SphereGeometry(STONE_RADIUS * 1.8, 8, 6), glow(0xffd890, 0.25));
  rock.add(shine);
  stone.add(rock);
  return stone;
}

/** Slingshot frame, in its own space: grip at the origin, fork up +Y, arms spread along X. */
export const SLING_TIP_UP = 0.13;
export const SLING_TIP_SPREAD = 0.05;

export interface SlingRig {
  root: Group;
  /** The wooden Y frame, held in the hand. */
  frame: Group;
  bands: [Mesh, Mesh];
  pouch: Mesh;
  stone: Group;
  /** Dots showing where a shot would go, while drawing. */
  dots: Mesh[];
}

/** A wooden Y-shaped slingshot frame with a wrapped grip. */
function makeSlingFrame(): Group {
  const frame = new Group();
  frame.name = 'SlingFrame';
  const wood = new MeshBasicMaterial({ color: 0x7a4f2c });
  const grip = new Mesh(new CylinderGeometry(0.014, 0.016, 0.12, 10), wood);
  grip.position.y = -0.02;
  const wrap = new Mesh(new CylinderGeometry(0.0165, 0.0175, 0.07, 10), new MeshBasicMaterial({ color: 0x3a2618 }));
  wrap.position.y = -0.03;
  const knot = new Mesh(new SphereGeometry(0.017, 10, 8), wood);
  knot.position.y = 0.045;
  frame.add(grip, wrap, knot);
  // Two arms from the fork's knot out to the tips, where the bands are tied.
  const base = new Vector3(0, 0.045, 0);
  for (const side of [-1, 1]) {
    const tip = new Vector3(side * SLING_TIP_SPREAD, SLING_TIP_UP, 0);
    const along = tip.clone().sub(base);
    const arm = new Mesh(new CylinderGeometry(0.009, 0.012, along.length(), 8), wood);
    arm.position.copy(base).add(tip).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), along.normalize());
    const cap = new Mesh(new SphereGeometry(0.011, 8, 6), new MeshBasicMaterial({ color: 0xd8b25a }));
    cap.position.copy(tip);
    frame.add(arm, cap);
  }
  return frame;
}

/** The slingshot: a wooden frame, two bands of light, a pouch and the stone in it. */
export function makeSlingshot(): SlingRig {
  const root = new Group();
  root.name = 'Slingshot';
  const frame = makeSlingFrame();
  const bands: [Mesh, Mesh] = [makeBeam(0.004, 0xffc860, 0.95), makeBeam(0.004, 0xffc860, 0.95)];
  const pouch = new Mesh(new SphereGeometry(0.022, 10, 6), new MeshBasicMaterial({ color: 0x6b4426 }));
  pouch.scale.set(1.3, 0.7, 1);
  const stone = makeStone();
  const dotMaterial = glow(0xffe2a0, 0.6);
  const dotGeometry = new SphereGeometry(0.008, 6, 4);
  const dots: Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const dot = new Mesh(dotGeometry, dotMaterial);
    dot.visible = false;
    dots.push(dot);
  }
  root.add(frame, bands[0], bands[1], pouch, stone, ...dots);
  return { root, frame, bands, pouch, stone, dots };
}

const RING_SEGMENTS = 48;

/** A progress ring in the XY plane; fill it with setRing. */
export function makeRing(radius: number, color: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(radius, radius * 1.22, RING_SEGMENTS, 1),
    new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, depthTest: false }),
  );
  ring.renderOrder = 10;
  return ring;
}

/** Shows `progress` (0 → 1) of the ring, clockwise from the top. */
export function setRing(ring: Mesh, progress: number): void {
  ring.geometry.setDrawRange(0, Math.round(RING_SEGMENTS * Math.min(1, Math.max(0, progress))) * 6);
  ring.rotation.z = Math.PI / 2;
}

/** A camera-facing text sprite. Call `set` to change the text. */
export class Label {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private text = '';

  constructor(
    private height: number,
    private font = 'bold 56px system-ui, "Segoe UI Emoji", sans-serif',
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(
      new SpriteMaterial({ map: this.texture, transparent: true, depthTest: false }),
    );
    this.sprite.renderOrder = 11;
    this.sprite.scale.set(height * 4, height, 1);
  }

  set(text: string, color = '#ffffff', background = 'rgba(10, 14, 30, 0.72)'): void {
    if (text === this.text) return;
    this.text = text;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.font = this.font;
    const width = Math.min(2048, Math.max(256, Math.ceil(g.measureText(text).width + 64)));
    if (this.canvas.width !== width) {
      this.canvas.width = width;
      this.texture.dispose();
    }
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.fillStyle = background;
    g.beginPath();
    g.roundRect(0, 0, this.canvas.width, this.canvas.height, 40);
    g.fill();
    g.font = this.font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, this.canvas.width / 2, this.canvas.height / 2 + 4);
    this.texture.needsUpdate = true;
    this.resize(this.height);
  }

  /** Sets the on-screen height in metres, keeping the text's proportions. */
  resize(height: number): void {
    this.height = height;
    this.sprite.scale.set((height * this.canvas.width) / this.canvas.height, height, 1);
  }
}

/** A camera-facing multi-line text panel, for the in-headset debug readout. */
export class TextPanel {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private text = '';

  constructor(width: number, private lines = 14) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 28 * lines + 24;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthTest: false }));
    this.sprite.renderOrder = 13;
    this.sprite.scale.set(width, (width * this.canvas.height) / this.canvas.width, 1);
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.fillStyle = 'rgba(8, 14, 28, 0.82)';
    g.beginPath();
    g.roundRect(0, 0, this.canvas.width, this.canvas.height, 18);
    g.fill();
    g.font = '21px ui-monospace, Consolas, monospace';
    g.fillStyle = '#e6f3ff';
    g.textBaseline = 'top';
    text
      .split('\n')
      .slice(0, this.lines)
      .forEach((line, i) => g.fillText(line, 14, 12 + i * 28, this.canvas.width - 28));
    this.texture.needsUpdate = true;
  }
}

interface Burst {
  mesh: Mesh;
  material: MeshBasicMaterial;
  age: number;
  life: number;
  size: number;
}

/** A small pool of expanding, fading glow spheres for hits, blocks and pops. */
export class Bursts {
  private pool: Burst[] = [];
  private next = 0;

  constructor(parent: Object3D, count = 16) {
    const geometry = new SphereGeometry(1, 12, 8);
    for (let i = 0; i < count; i++) {
      const material = glow(0xffffff, 0);
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      parent.add(mesh);
      this.pool.push({ mesh, material, age: 0, life: 1, size: 0.1 });
    }
  }

  spawn(at: Vector3, color: number, size: number, life = 0.35): void {
    const burst = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    burst.mesh.position.copy(at);
    burst.material.color.setHex(color);
    burst.age = 0;
    burst.life = life;
    burst.size = size;
    burst.mesh.visible = true;
  }

  update(dt: number): void {
    for (const burst of this.pool) {
      if (!burst.mesh.visible) continue;
      burst.age += dt;
      const k = burst.age / burst.life;
      if (k >= 1) {
        burst.mesh.visible = false;
        continue;
      }
      burst.mesh.scale.setScalar(burst.size * (0.3 + k));
      burst.material.opacity = 0.9 * (1 - k);
    }
  }
}
