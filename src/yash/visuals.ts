/**
 * Meshes and small effects for the Arsenal level. Everything is unlit
 * (MeshBasicMaterial plus additive glow shells): no real-time lights, cheap on Quest.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
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

/** Bottom edge at the origin, facing +Z. */
export function makeWall(): Group {
  const wall = new Group();
  wall.name = 'LightWall';
  const box = new BoxGeometry(WALL_WIDTH, WALL_HEIGHT, 0.02);
  const panel = new Mesh(box, glow(0x59c8ff, 0.22));
  const edges = new LineSegments(
    new EdgesGeometry(box),
    new LineBasicMaterial({ color: 0xaee9ff, transparent: true, opacity: 0.9 }),
  );
  const bars = new Group();
  const barMaterial = glow(0x9fe8ff, 0.25);
  for (let i = 1; i < 4; i++) {
    const bar = new Mesh(new PlaneGeometry(WALL_WIDTH, 0.012), barMaterial);
    bar.position.y = (i / 4 - 0.5) * WALL_HEIGHT;
    bars.add(bar);
  }
  const body = new Group();
  body.add(panel, edges, bars);
  body.position.y = WALL_HEIGHT / 2;
  wall.add(body);
  return wall;
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
    const width = Math.min(1024, Math.max(256, Math.ceil(g.measureText(text).width + 64)));
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
