import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { playBoom, playInk, playSplat, playThrow } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { ParticlePool } from '../machines/particles.js';
import { stage } from '../stage-state.js';
import { ribbon, silhouette } from './dragon.js';

/**
 * Ink Duel: a casual fight against a computer shadow-puppeteer.
 *
 * Pinch and draw in the air: your stroke of light-ink hangs there, a solid
 * thing whose mass is the ink you used. Grab it and throw it at the Rival
 * on the screen. It flies under real gravity, and the hit does damage by
 * its kinetic energy, ½mv²: a big drawing hits hard but is heavy to throw;
 * a small one flies fast. Drawings left hanging in the air are shields that
 * stop the Rival's ink. The Rival draws on the screen with a giant quill
 * and flings its shapes back at you. First to run out loses.
 */

const PLAYER_HEARTS = 5;
const RIVAL_HEALTH = 100;
const INK_DENSITY = 0.5;
const MAX_INK = 0.6;
const STEP = 0.007;
const HANG_TIME = 9;
const GRAVITY = 9.8;
const GRAB_REACH = 0.035;
/** Damage per joule of kinetic energy. */
const DAMAGE_PER_JOULE = 40;

type Mode = 'ready' | 'fight' | 'won' | 'lost';
type InkState = 'drawing' | 'hanging' | 'held' | 'flying' | 'gone';

interface Ink {
  mesh: Mesh;
  /** Points relative to the object's position. */
  points: Vector3[];
  pos: Vector3;
  vel: Vector3;
  spin: number;
  mass: number;
  state: InkState;
  age: number;
  hand: number;
  grabOffset: Vector3;
  rival: boolean;
}

interface Sample {
  t: number;
  p: Vector3;
}

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

  private mode: Mode = 'ready';
  private modeTime = 0;
  private time = 0;
  private hearts = PLAYER_HEARTS;
  private rivalHealth = RIVAL_HEALTH;
  private readonly paper = new Group();
  private readonly rival: Rival;
  private readonly inks: Ink[] = [];
  private readonly drawing: Array<Ink | null> = [null, null];
  private readonly history: [Sample[], Sample[]] = [[], []];
  private readonly light: MeshStandardMaterial;
  private readonly dark: MeshStandardMaterial;
  private readonly splashes = new ParticlePool({ count: 200, additive: false, soft: true });
  private readonly sparks = new ParticlePool({ count: 120, additive: true, soft: false });
  private readonly splats: Mesh[] = [];
  private readonly splatMaterial: MeshBasicMaterial;
  private readonly heartMeshes: Mesh[] = [];
  private readonly bar: Mesh;
  private readonly score: { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture; time: number };
  private nextRival = 3;
  private note = '';
  private noteTime = 0;
  private readonly head = new Vector3();
  private readonly v = new Vector3();
  private readonly w = new Vector3();

  constructor(root: Group) {
    this.group.name = 'InkDuel';
    root.updateWorldMatrix(true, false);
    const toPaper = new Matrix4().copy(root.matrixWorld).invert().multiply(stage.paper!.matrixWorld);
    toPaper.decompose(this.paper.position, this.paper.quaternion, this.paper.scale);
    this.group.add(this.paper, this.splashes.points, this.sparks.points);
    this.rival = new Rival();
    this.paper.add(this.rival.root);

    this.light = new MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 0.9, roughness: 0.3 });
    this.dark = new MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.25, metalness: 0.3 });
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
    this.paper.add(frame);
    this.bar = new Mesh(new BoxGeometry(0.25, 0.014, 0.001).translate(0.125, 0, 0), new MeshBasicMaterial({ color: 0x302838, transparent: true, depthWrite: false }));
    this.bar.position.set(0.175, 0.315, 0.0125);
    this.bar.renderOrder = 9;
    this.paper.add(this.bar);
    // The number that pops up on a hit, with the energy behind it.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(0.16, 0.08), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.renderOrder = 10;
    mesh.visible = false;
    this.paper.add(mesh);
    this.score = { mesh, canvas, texture, time: 0 };

    devInfo.duel = () => this.state;
    devActions['['] = () => this.devDraw();
    devActions[']'] = () => this.devThrow();
    devActions[';'] = () => this.rivalAttack();
  }

  get state(): string {
    return `${this.mode} hearts=${this.hearts} rival=${Math.round(this.rivalHealth)} inks=${this.inks.map((i) => i.state[0]).join('')}`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[], head: Vector3): void {
    this.time += dt;
    this.modeTime += dt;
    this.noteTime -= dt;
    this.group.worldToLocal(this.head.copy(head));
    if (!stage.playing && this.mode !== 'won' && this.mode !== 'lost') {
      this.rival.update(dt);
      return;
    }
    this.record(hands);
    switch (this.mode) {
      case 'ready':
        this.caption = 'Ink Duel! Pinch and draw in the air, then grab your drawing and throw it';
        if (this.modeTime > 3) this.setMode('fight');
        this.draw(hands);
        break;
      case 'fight':
        this.draw(hands);
        this.grab(hands);
        this.rivalTurn(dt);
        this.say();
        break;
      case 'won':
        this.caption = 'You win the duel! Your ink flew true.';
        this.rival.fall = Math.min(1, this.modeTime / 1.2);
        if (this.modeTime > 3.5) this.done = true;
        break;
      case 'lost':
        this.caption = 'Splat! The Rival wins this one. Rematch from the menu!';
        if (this.modeTime > 3.5) this.done = true;
        break;
    }
    this.fly(dt);
    this.rival.update(dt);
    this.drawHud(dt);
    this.splashes.update(dt);
    this.sparks.update(dt);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private say(): void {
    const hanging = this.inks.some((i) => !i.rival && i.state === 'hanging');
    const held = this.inks.some((i) => i.state === 'held');
    let text = hanging ? 'Pinch your drawing to grab it, then throw it at the Rival' : 'Pinch and draw a shape in the air';
    if (held) text = 'Throw! Big drawings hit harder, small ones fly faster';
    if (this.rival.drawing > 0) text = 'The Rival is drawing… leave a drawing hanging in the air as a shield!';
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
      if (hand.pinchStarted && !current && !this.nearInk(p)) {
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
    const ink: Ink = { mesh, points: [], pos: at.clone(), vel: new Vector3(), spin: 0, mass: 0, state: 'drawing', age: 0, hand: -1, grabOffset: new Vector3(), rival };
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

  private remove(ink: Ink): void {
    ink.state = 'gone';
    this.group.remove(ink.mesh);
    ink.mesh.geometry.dispose();
    this.inks.splice(this.inks.indexOf(ink), 1);
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
      if (!hand.pinchStarted || this.drawing[h]) return;
      const ink = this.nearInk(p);
      if (ink && ink.state === 'hanging') {
        ink.state = 'held';
        ink.hand = h;
        ink.grabOffset.copy(ink.pos).sub(p);
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
      ink.pos.addScaledVector(ink.vel, dt);
      ink.mesh.position.copy(ink.pos);
      ink.mesh.rotateZ(ink.spin * dt);
      if (Math.random() < dt * 40) this.sparks.emit(ink.pos, this.v.set(0, 0, 0), { life: 0.3, size: [0.008, 0.002], from: ink.rival ? 0x6a5a80 : 0xbfe4ff });

      if (ink.rival) {
        // Blocked by a drawing hanging in the air?
        const shield = this.inks.find((s) => !s.rival && s.state === 'hanging' && s.points.some((q) => this.w.copy(q).add(s.pos).distanceTo(ink.pos) < 0.03));
        if (shield) {
          this.splashAt(ink.pos, 0x14101a);
          playSplat(0.06);
          this.flash('Blocked!', 1);
          this.remove(ink);
          shield.age = Math.max(shield.age, HANG_TIME - 1.5);
          continue;
        }
        if (ink.pos.distanceTo(this.head) < 0.17) {
          this.splashAt(ink.pos, 0x14101a);
          playSplat(0.1);
          this.hearts--;
          this.mistakes++;
          this.flash(this.hearts > 1 ? 'Splat! Right in the face' : 'Splat! One heart left');
          this.remove(ink);
          if (this.hearts <= 0) this.end(false);
          continue;
        }
        if (ink.age > 3.5) this.remove(ink);
        continue;
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

  private hitScreen(ink: Ink, at: Vector3): void {
    const speed = ink.vel.length();
    const energy = 0.5 * ink.mass * speed * speed;
    this.splat(at);
    playSplat(0.08);
    if (this.mode !== 'fight') return;
    if (this.rival.shielded(at)) {
      this.flash('Blocked by the Rival’s shield!', 1.2);
      return;
    }
    if (!this.rival.hit(at)) {
      this.flash('Missed! Throw higher: ink falls on the way', 1.4);
      return;
    }
    const damage = Math.round(Math.min(40, Math.max(5, energy * DAMAGE_PER_JOULE)));
    this.rivalHealth -= damage;
    this.rival.flinch();
    playBoom(0.06 + damage * 0.002);
    this.showScore(at, damage, energy, ink.mass, speed);
    if (this.rivalHealth <= 0) this.end(true);
  }

  private end(won: boolean): void {
    this.won = won;
    this.setMode(won ? 'won' : 'lost');
    for (const ink of [...this.inks]) if (ink.rival) this.remove(ink);
  }

  // ================================================================= Rival

  private rivalTurn(dt: number): void {
    this.nextRival -= dt;
    if (this.nextRival <= 0 && this.rival.drawing === 0) {
      if (Math.random() < 0.25 && this.rivalHealth < RIVAL_HEALTH * 0.7) {
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
        this.rivalAttack();
      }
    }
  }

  /** The Rival's drawing leaves the screen and arcs at the player's face. */
  private rivalAttack(): void {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const start = this.group.worldToLocal(this.paper.localToWorld(this.rival.quillAt(new Vector3())));
    const ink = this.newInk(true, start);
    ink.points = shape.map(([x, y]) => new Vector3(x * 1.4, y * 1.4, 0));
    ink.mass = this.inkLength(ink) * INK_DENSITY;
    this.rebuild(ink);
    // Aim to reach the head in T seconds under gravity: v = d/T + ½gT upward.
    const T = 1.35;
    ink.vel.copy(this.head).sub(start).divideScalar(T);
    ink.vel.x += (Math.random() - 0.5) * 0.15;
    ink.vel.y += 0.5 * GRAVITY * T;
    ink.spin = (Math.random() - 0.5) * 5;
    ink.state = 'flying';
    playThrow();
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

  private showScore(at: Vector3, damage: number, energy: number, mass: number, speed: number): void {
    const { canvas, texture, mesh } = this.score;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    g.textAlign = 'center';
    g.font = 'bold 64px Georgia, serif';
    g.fillStyle = '#1a6fd0';
    g.fillText(`${damage}!`, 128, 64);
    g.font = '22px Georgia, serif';
    g.fillStyle = '#2a2030';
    g.fillText(`½mv² = ½·${(mass * 1000).toFixed(0)}g·${speed.toFixed(1)}² = ${energy.toFixed(2)} J`, 128, 104);
    texture.needsUpdate = true;
    mesh.position.set(at.x, at.y + 0.06, 0.013);
    mesh.visible = true;
    this.score.time = 1.8;
    this.flash(damage >= 25 ? 'Huge hit!' : 'Hit!', 1.2);
  }

  private drawHud(dt: number): void {
    this.heartMeshes.forEach((heart, i) => {
      (heart.material as MeshBasicMaterial).opacity = i < this.hearts ? 0.95 : 0.15;
    });
    const k = Math.max(0, this.rivalHealth / RIVAL_HEALTH);
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

  private devThrow(): void {
    const ink = this.inks.find((i) => !i.rival && i.state === 'hanging');
    if (!ink) return;
    const target = this.group.worldToLocal(this.paper.localToWorld(this.rival.bodyAt(new Vector3())));
    const T = 0.45;
    ink.vel.copy(target).sub(ink.pos).divideScalar(T);
    ink.vel.y += 0.5 * GRAVITY * T;
    ink.state = 'flying';
    ink.age = 0;
    playThrow();
  }
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

// ==================================================================== Rival

/**
 * The Rival: a tall shadow puppeteer in a long coat and a wide-brimmed hat
 * with a plume, a giant quill in hand. Draws on the screen, flinches when
 * hit (the hat jumps), raises an ink shield, topples when beaten.
 */
class Rival {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly arm = new Group();
  private readonly hat = new Group();
  private readonly shield: Mesh;
  private readonly shieldMaterial: MeshBasicMaterial;
  private readonly stroke: Mesh;
  private readonly ink: MeshBasicMaterial;
  private time = 0;
  private hurt = 0;
  private shieldTime = 0;
  /** Seconds into drawing a shape (0 = not drawing). */
  drawing = 0;
  /** 0 → 1 as it topples, beaten. */
  fall = 0;

  constructor() {
    this.ink = new MeshBasicMaterial({ color: 0x0b0806, transparent: true, opacity: 0.94, depthWrite: false });
    // Feet on the screen's visible ground line, whatever hill is in front.
    this.root.position.set(0.24, -0.17, 0);
    this.body.position.set(0, 0, 0);
    // Legs, long coat flaring to the knees, shoulders, head.
    const coat = new Shape();
    coat.moveTo(-0.05, 0.08);
    coat.lineTo(-0.035, 0.26);
    coat.quadraticCurveTo(0, 0.285, 0.035, 0.26);
    coat.lineTo(0.06, 0.08);
    coat.quadraticCurveTo(0.0, 0.06, -0.05, 0.08);
    const legs = [ribbon([[-0.02, 0.09], [-0.025, 0.04], [-0.03, 0.0]], [0.012, 0.01, 0.009]), ribbon([[0.02, 0.09], [0.022, 0.04], [0.028, 0.0]], [0.012, 0.01, 0.009])];
    const boots = [ribbon([[-0.032, 0.004], [-0.05, 0.002]], [0.008, 0.006]), ribbon([[0.026, 0.004], [0.045, 0.002]], [0.008, 0.006])];
    const neck = ribbon([[0, 0.27], [0, 0.29]], [0.008, 0.007]);
    const head = new Shape();
    head.absellipse(-0.002, 0.305, 0.017, 0.021, 0, Math.PI * 2, false, 0);
    const nose = new Shape();
    nose.moveTo(-0.015, 0.31);
    nose.lineTo(-0.028, 0.3);
    nose.lineTo(-0.016, 0.296);
    nose.closePath();
    const cape = ribbon([[0.03, 0.26], [0.06, 0.2], [0.075, 0.12], [0.085, 0.09]], [0.012, 0.016, 0.014, 0.008]);
    this.body.add(silhouette([coat, ...legs, ...boots, neck, head, nose, cape], this.ink, 0.004, 3));
    // Hat: wide brim and a crown with a plume.
    const brim = ribbon([[-0.045, 0.322], [0, 0.327], [0.045, 0.322]], [0.004, 0.005, 0.004]);
    const crown = new Shape();
    crown.moveTo(-0.022, 0.324);
    crown.lineTo(-0.018, 0.355);
    crown.quadraticCurveTo(0.0, 0.362, 0.018, 0.355);
    crown.lineTo(0.022, 0.324);
    crown.closePath();
    const plume = ribbon([[0.015, 0.35], [0.04, 0.37], [0.07, 0.36], [0.085, 0.34]], [0.006, 0.008, 0.006, 0.001]);
    this.hat.add(silhouette([brim, crown, plume], this.ink, 0.0045, 4));
    this.body.add(this.hat);
    // The drawing arm with its giant quill, pivoting at the shoulder.
    this.arm.position.set(-0.03, 0.25, 0);
    const sleeve = ribbon([[0, 0], [-0.04, -0.03], [-0.07, 0.0]], [0.011, 0.009, 0.007]);
    const quill = ribbon([[-0.07, 0.0], [-0.1, 0.05], [-0.12, 0.1]], [0.0015, 0.008, 0.003]);
    const nib = ribbon([[-0.072, 0.002], [-0.065, -0.015]], [0.002, 0.0005]);
    this.arm.add(silhouette([sleeve, quill, nib], this.ink, 0.005, 5));
    this.body.add(this.arm);
    this.root.add(this.body);

    // The stroke it is drawing, and its round ink shield.
    this.stroke = new Mesh(new PlaneGeometry(1, 0.008), this.ink);
    this.stroke.position.z = 0.006;
    this.stroke.visible = false;
    this.root.add(this.stroke);
    this.shieldMaterial = new MeshBasicMaterial({ color: 0x1a1428, transparent: true, opacity: 0, depthWrite: false });
    this.shield = new Mesh(new CircleGeometry(0.11, 32), this.shieldMaterial);
    this.shield.position.set(-0.05, 0.2, 0.007);
    this.shield.renderOrder = 6;
    this.root.add(this.shield);
  }

  /** Paper-space point at the quill's nib. */
  quillAt(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(-0.066, -0.012, 0);
    this.arm.localToWorld(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  bodyAt(out: Vector3): Vector3 {
    return out.set(this.root.position.x, this.root.position.y + 0.2, 0);
  }

  /** Does a paper-space point land on the Rival? */
  hit(at: Vector3): boolean {
    const x = at.x - this.root.position.x;
    const y = at.y - this.root.position.y;
    return x > -0.075 && x < 0.1 && y > 0 && y < 0.38;
  }

  shielded(at: Vector3): boolean {
    if (this.shieldTime <= 0) return false;
    const dx = at.x - (this.root.position.x + this.shield.position.x);
    const dy = at.y - (this.root.position.y + this.shield.position.y);
    return Math.hypot(dx, dy) < 0.13;
  }

  raiseShield(seconds: number): void {
    this.shieldTime = seconds;
  }

  flinch(): void {
    this.hurt = 0.7;
  }

  update(dt: number): void {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    const h = this.hurt / 0.7;
    this.body.rotation.z = 0.02 * Math.sin(this.time * 1.4) - 0.12 * h - 1.4 * this.fall;
    this.body.position.x = 0.04 * this.fall;
    // The hat jumps off its head when struck.
    this.hat.position.y = 0.04 * Math.sin(Math.min(1, h * 1.2) * Math.PI);
    this.hat.rotation.z = 0.5 * h;
    // Drawing: the quill sweeps back and forth and an ink line grows.
    const drawing = this.drawing > 0;
    this.arm.rotation.z = drawing ? 0.4 * Math.sin(this.drawing * 12) + 0.3 : 0.1 * Math.sin(this.time * 2) - 0.2 * h;
    this.stroke.visible = drawing;
    if (drawing) {
      const k = Math.min(1, this.drawing / 1.2);
      this.stroke.scale.x = 0.12 * k;
      this.stroke.position.set(-0.15 + 0.06 * k, 0.22 + 0.02 * Math.sin(this.drawing * 12), 0.006);
    }
    this.shieldMaterial.opacity += ((this.shieldTime > 0 ? 0.55 : 0) - this.shieldMaterial.opacity) * Math.min(1, dt * 6);
    this.shield.visible = this.shieldMaterial.opacity > 0.01;
  }
}

