import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  NormalBlending,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';

/**
 * A pool of simple physical particles in one draw call: each has a velocity,
 * gravity or buoyancy, drag, a colour that can change as it cools, and a
 * size that can grow (steam) or shrink (sparks).
 */
export interface ParticleSpec {
  count: number;
  additive: boolean;
  /** Soft round puff (steam, smoke) or a hot pin-point (sparks). */
  soft: boolean;
}

interface Particle {
  age: number;
  life: number;
  velocity: Vector3;
  gravity: number;
  drag: number;
  size0: number;
  size1: number;
  /** Colour at birth and at death, RGB 0..1. */
  c0: [number, number, number];
  c1: [number, number, number];
  alpha: number;
}

function dotTexture(soft: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class ParticlePool {
  readonly points: Points;
  private readonly particles: Particle[] = [];
  private readonly position: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly size: BufferAttribute;
  private next = 0;
  private live = 0;

  constructor(private readonly spec: ParticleSpec) {
    const geometry = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(spec.count * 3), 3);
    this.color = new BufferAttribute(new Float32Array(spec.count * 4), 4);
    this.size = new BufferAttribute(new Float32Array(spec.count), 1);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('color', this.color);
    geometry.setAttribute('pSize', this.size);
    const material = new PointsMaterial({
      map: dotTexture(spec.soft),
      size: 1,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: spec.additive ? AdditiveBlending : NormalBlending,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float pSize;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
    };
    material.customProgramCacheKey = () => 'particle-pool';
    this.points = new Points(geometry, material);
    this.points.name = spec.soft ? 'Steam' : 'Sparks';
    this.points.frustumCulled = false;
    this.points.userData.keep = true;
    for (let i = 0; i < spec.count; i++) {
      this.particles.push({
        age: 1,
        life: 0,
        velocity: new Vector3(),
        gravity: 0,
        drag: 0,
        size0: 0,
        size1: 0,
        c0: [1, 1, 1],
        c1: [1, 1, 1],
        alpha: 1,
      });
    }
  }

  /** Emit one particle at `at` (in the pool's parent space). */
  emit(
    at: Vector3,
    velocity: Vector3,
    o: { life: number; gravity?: number; drag?: number; size: [number, number]; from: number; to?: number; alpha?: number },
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.spec.count;
    const p = this.particles[i];
    p.age = 0;
    p.life = o.life;
    p.velocity.copy(velocity);
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.size0 = o.size[0];
    p.size1 = o.size[1];
    p.c0 = hex(o.from);
    p.c1 = hex(o.to ?? o.from);
    p.alpha = o.alpha ?? 1;
    this.position.setXYZ(i, at.x, at.y, at.z);
    this.live = this.spec.count;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let alive = 0;
    const pos = this.position.array as Float32Array;
    const col = this.color.array as Float32Array;
    const siz = this.size.array as Float32Array;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.age >= p.life) {
        siz[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      pos[i * 3] += p.velocity.x * dt;
      pos[i * 3 + 1] += p.velocity.y * dt;
      pos[i * 3 + 2] += p.velocity.z * dt;
      for (let c = 0; c < 3; c++) col[i * 4 + c] = p.c0[c] + (p.c1[c] - p.c0[c]) * k;
      // Fade in fast, out slowly.
      col[i * 4 + 3] = p.alpha * Math.min(1, k * 8) * (1 - k) ** 1.5;
      siz[i] = p.size0 + (p.size1 - p.size0) * k;
    }
    if (alive === 0) this.live = 0;
    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
    this.size.needsUpdate = true;
  }
}

function hex(value: number): [number, number, number] {
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
