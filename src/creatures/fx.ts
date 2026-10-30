import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  NormalBlending,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';

type Kind = 'sparkle' | 'heart';

interface Particle {
  sprite: Sprite;
  material: SpriteMaterial;
  velocity: Vector3;
  age: number;
  life: number;
  size: number;
  kind: Kind;
}

const POOL_SIZE = 64;

function sparkleTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,214,120,0.9)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // Four-point star flare.
  ctx.fillStyle = 'rgba(255,255,230,0.9)';
  ctx.beginPath();
  ctx.moveTo(32, 2); ctx.lineTo(35, 29); ctx.lineTo(62, 32); ctx.lineTo(35, 35);
  ctx.lineTo(32, 62); ctx.lineTo(29, 35); ctx.lineTo(2, 32); ctx.lineTo(29, 29);
  ctx.closePath();
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function heartTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff5f8f';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 54);
  ctx.bezierCurveTo(4, 36, 6, 10, 22, 10);
  ctx.bezierCurveTo(28, 10, 32, 16, 32, 20);
  ctx.bezierCurveTo(32, 16, 36, 10, 42, 10);
  ctx.bezierCurveTo(58, 10, 60, 36, 32, 54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Pooled sparkle and heart sprites in world space. */
export class Effects {
  readonly root = new Group();
  private particles: Particle[] = [];
  private next = 0;

  constructor() {
    this.root.name = 'Effects';
    const sparkle = sparkleTexture();
    const heart = heartTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new SpriteMaterial({ map: sparkle, transparent: true, depthWrite: false });
      const sprite = new Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.root.add(sprite);
      this.particles.push({
        sprite,
        material,
        velocity: new Vector3(),
        age: 0,
        life: 1,
        size: 0.01,
        kind: 'sparkle',
      });
    }
    this.textures = { sparkle, heart };
  }

  private textures: Record<Kind, CanvasTexture>;

  private spawn(kind: Kind, at: Vector3, life: number, size: number): Particle {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    p.kind = kind;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.material.map = this.textures[kind];
    p.material.blending = kind === 'sparkle' ? AdditiveBlending : NormalBlending;
    p.material.needsUpdate = true;
    p.sprite.position.copy(at);
    p.sprite.visible = true;
    return p;
  }

  /** A burst of golden sparkles flying outward. */
  burst(at: Vector3, count: number, speed = 0.35): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn('sparkle', at, 0.5 + Math.random() * 0.5, 0.008 + Math.random() * 0.012);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta),
        Math.abs(Math.cos(phi)) * 0.8 + 0.2,
        Math.sin(phi) * Math.sin(theta),
      ).multiplyScalar(speed * (0.4 + Math.random() * 0.6));
    }
  }

  /** One heart drifting upward with a little sway. */
  heart(at: Vector3): void {
    const p = this.spawn('heart', at, 1.3, 0.016 + Math.random() * 0.006);
    p.velocity.set((Math.random() - 0.5) * 0.04, 0.09, (Math.random() - 0.5) * 0.04);
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
      if (p.kind === 'sparkle') {
        p.velocity.multiplyScalar(1 - 2.5 * dt);
        p.velocity.y -= 0.15 * dt;
      } else {
        p.velocity.x += Math.sin(p.age * 6) * 0.02 * dt;
      }
      p.sprite.position.addScaledVector(p.velocity, dt);
      // Pop in, then fade out.
      const grow = Math.min(1, k * 8);
      p.sprite.scale.setScalar(p.size * grow * (p.kind === 'heart' ? 1 + k * 0.4 : 1 - k * 0.5));
      p.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
  }
}
