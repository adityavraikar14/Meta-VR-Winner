/**
 * Slow projectiles a boss fires at the player: the sentinel's orbs and the
 * dragon's fireballs behave alike, so every defence works on both. The wall
 * absorbs them; the sword, spear, blaster and power ball destroy them.
 */
import { Group, Vector3 } from '@iwsdk/core';
import { sfx } from './sfx.js';
import type { Bursts } from './visuals.js';

/** A shot this close to the point it was aimed at hits the player. */
const PLAYER_RADIUS = 0.22;

interface Shot {
  object: Group;
  velocity: Vector3;
  target: Vector3;
  /** m/s² pulling it down; 0 flies straight. */
  gravity: number;
}

/**
 * How far along a ray a sphere is, or −1 if the ray misses it. The sphere
 * counts as `assist` metres wider per metre of distance (aim help).
 */
export function rayToSphere(
  origin: Vector3,
  direction: Vector3,
  center: Vector3,
  radius: number,
  assist: number,
): number {
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const dz = center.z - origin.z;
  const along = dx * direction.x + dy * direction.y + dz * direction.z;
  if (along <= 0) return -1;
  const miss = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
  return miss < radius + along * assist ? along : -1;
}

export class ShotVolley {
  private shots: Shot[] = [];
  private spare: Group[] = [];
  private tmp = new Vector3();

  constructor(
    private parent: Group,
    private bursts: Bursts,
    private make: () => Group,
    /** Hit radius of one shot. */
    readonly radius: number,
    /** Colour of the burst when a shot is destroyed. */
    private burstColor: number,
    private onHitPlayer: () => void,
    /** Per-frame life for each shot in flight: flicker, trails. */
    private onTick: ((object: Group, dt: number, velocity: Vector3) => void) | null = null,
  ) {}

  /** A shot flying straight at the target. */
  fire(from: Vector3, target: Vector3, speed: number): void {
    const velocity = target.clone().sub(from).normalize().multiplyScalar(speed);
    this.launch(from, target, velocity, 0);
  }

  /** A lobbed shot that arcs up and falls onto the target after `seconds`. */
  lob(from: Vector3, target: Vector3, seconds: number, gravity: number): void {
    // v = d/T + ½gT upwards, so it lands on the target after T.
    const velocity = target.clone().sub(from).divideScalar(seconds);
    velocity.y += 0.5 * gravity * seconds;
    this.launch(from, target, velocity, gravity);
  }

  private launch(from: Vector3, target: Vector3, velocity: Vector3, gravity: number): void {
    const object = this.spare.pop() ?? this.make();
    object.visible = true;
    object.position.copy(from);
    this.parent.add(object);
    this.shots.push({ object, velocity, target: target.clone(), gravity });
  }

  /** Destroys shots touching the sphere; returns how many. */
  cut(point: Vector3, radius: number): number {
    let cut = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      if (shot.object.position.distanceTo(point) < this.radius + radius) {
        this.bursts.spawn(shot.object.position, this.burstColor, 0.3);
        this.remove(i);
        cut++;
      }
    }
    return cut;
  }

  /** Calls `visit` with each shot's position. */
  forEach(visit: (position: Vector3) => void): void {
    for (const shot of this.shots) visit(shot.object.position);
  }

  update(dt: number, absorbs: (point: Vector3, radius: number) => boolean): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const p = shot.object.position;
      shot.velocity.y -= shot.gravity * dt;
      p.addScaledVector(shot.velocity, dt);
      shot.object.rotation.y += dt * 4;
      this.onTick?.(shot.object, dt, shot.velocity);
      if (absorbs(p, this.radius)) {
        this.bursts.spawn(p, 0x9fe8ff, 0.35);
        sfx.block();
        this.remove(i);
      } else if (p.distanceTo(shot.target) < PLAYER_RADIUS) {
        this.bursts.spawn(p, 0xff4030, 0.3);
        sfx.hurt();
        this.onHitPlayer();
        this.remove(i);
      } else if (this.tmp.copy(p).sub(shot.target).dot(shot.velocity) > 0.5) {
        // Flew past the player.
        this.remove(i);
      }
    }
  }

  clear(): void {
    for (let i = this.shots.length - 1; i >= 0; i--) this.remove(i);
  }

  private remove(index: number): void {
    const shot = this.shots[index];
    shot.object.visible = false;
    this.parent.remove(shot.object);
    this.spare.push(shot.object);
    this.shots.splice(index, 1);
  }
}
