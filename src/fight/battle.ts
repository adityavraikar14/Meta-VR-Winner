import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playBoom, playCharge, playClang, playFireball, playHiss, playRoar, playSign, playThrow } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import type { Extension } from '../hand-pose.js';
import { ParticlePool } from '../machines/particles.js';
import { useItem } from '../bag.js';
import { play, saveProgress } from '../progress.js';
import { stage } from '../stage-state.js';
import { ShadowDragon } from './dragon.js';
import { Dragon3D, dragonLoad, Phoenix, preloadDragon } from './dragon3d.js';

/**
 * The last chapter: the Shadow Dragon guards the Great Lantern.
 *
 * Gather light with hand signs: three shapes in turn, each held a moment.
 * Light gathers in front of your palm; throw it. The throw is measured the
 * way good VR throwing is: positions are kept for the last half second, the
 * newest ~40 ms are skipped (tracking lags behind a fast hand), and the
 * release velocity is fitted over the 100 ms before that, so a throw never
 * dead-drops. The orb flies ballistically, nudged a little toward the head
 * or the ember heart, and hits where it meets the screen.
 *
 * The dragon breathes fire out of the screen at you. An open palm facing
 * the fire is a mirror of light: the fireball reflects off it at the angle
 * it came in (v' = v − 2(v·n)n), so a well-angled palm sends it back.
 */

type SignName = 'fist' | 'open' | 'point' | 'two' | 'horns';
const SIGNS: Record<SignName, { label: string; fingers: [number, number, number, number] }> = {
  fist: { label: 'FIST', fingers: [0, 0, 0, 0] },
  open: { label: 'PALM', fingers: [1, 1, 1, 1] },
  point: { label: 'POINT', fingers: [1, 0, 0, 0] },
  two: { label: 'TWO', fingers: [1, 1, 0, 0] },
  horns: { label: 'HORNS', fingers: [1, 0, 0, 1] },
};
const SIGN_NAMES = Object.keys(SIGNS) as SignName[];
const SIGN_HOLD = 0.3;

const PLAYER_HEALTH = 3;
const DRAGON_HEALTH = 4;
const FIRE_SPEED = 0.75;
const HEAD_RADIUS = 0.16;
const SHIELD_REACH = 0.1;
const BREATH_TIME = 1.2;
const UP_AXIS = new Vector3(0, 1, 0);

type Mode = 'intro' | 'fight' | 'lost' | 'won';

interface Fireball {
  sprite: Sprite;
  pos: Vector3;
  vel: Vector3;
  reflected: boolean;
  age: number;
}

interface Sample {
  t: number;
  p: Vector3;
}

export class DragonBattle {
  readonly group = new Group();
  caption = '';
  done = false;
  /** Hits taken: a perfect fight takes none. */
  mistakes = 0;

  private mode: Mode = 'intro';
  private modeTime = 0;
  private time = 0;
  private health = PLAYER_HEALTH;
  private dragonHealth = DRAGON_HEALTH;
  private readonly paper = new Group();
  private readonly dragon = new ShadowDragon();
  /** The 3D dragon, once its model has loaded; until then the shadow puppet stands in. */
  private dragon3d: Dragon3D | null = null;
  private phoenix: Phoenix | null = null;
  /** Where the dragon hovers: out in front of the screen, below its middle. */
  private readonly dragonHome = new Vector3();
  private readonly phoenixFrom = new Vector3();
  private readonly sparks = new ParticlePool({ count: 220, additive: true, soft: false });
  private readonly glow = new ParticlePool({ count: 60, additive: true, soft: true });

  // Signs and the orb.
  private sequence: SignName[] = [];
  private signStep = 0;
  private signHeld = 0;
  private signHand = 1;
  private readonly signIcons: Array<{ mesh: Mesh; material: MeshBasicMaterial }> = [];
  private orbHand = -1;
  private orbCharge = 0;
  private readonly orb = new Group();
  private readonly orbCore: Sprite;
  private readonly orbRing: Mesh;
  private flying: { pos: Vector3; vel: Vector3 } | null = null;
  private readonly history: [Sample[], Sample[]] = [[], []];

  // The dragon's fire.
  private readonly fireballs: Fireball[] = [];
  private readonly fireMaterial: SpriteMaterial;
  private breathTime = 0;
  private twin = false;
  private nextBreath = 3;
  private readonly shields: Mesh[] = [];

  // HUD on the screen.
  private readonly hud = new Group();
  private readonly hearts: Mesh[] = [];
  private bar!: Mesh;
  private note = '';
  private noteTime = 0;

  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly head = new Vector3();
  private readonly headWorld = new Vector3();

  constructor(root: Group) {
    this.group.name = 'DragonBattle';
    // Paper space inside the stage: the screen's own frame.
    root.updateWorldMatrix(true, false);
    const toPaper = new Matrix4().copy(root.matrixWorld).invert().multiply(stage.paper!.matrixWorld);
    toPaper.decompose(this.paper.position, this.paper.quaternion, this.paper.scale);
    this.paper.add(this.dragon.root);
    // Reaching the fight early (or on a slow connection): fetch the dragon now.
    void preloadDragon();
    const normal = new Vector3(0, 0, 1).applyQuaternion(this.paper.quaternion);
    this.dragonHome.copy(this.paper.position).addScaledVector(normal, 0.24);
    this.dragonHome.y -= 0.26;
    this.group.add(this.paper, this.sparks.points, this.glow.points);

    // Orb of light: a white-hot core and a turning ring.
    this.orbCore = new Sprite(new SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(140,200,255,0.8)'), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.orb.add(this.orbCore);
    this.orbRing = new Mesh(new RingGeometry(0.03, 0.034, 32), new MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: 2 }));
    this.orb.add(this.orbRing);
    this.orb.visible = false;
    this.group.add(this.orb);

    this.fireMaterial = new SpriteMaterial({ map: radial('rgba(255,250,210,1)', 'rgba(255,110,20,0.85)'), blending: AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 2; i++) {
      const shield = new Mesh(new RingGeometry(0.0, 0.075, 6), new MeshBasicMaterial({ color: 0xa8dcff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: 2 }));
      shield.visible = false;
      this.shields.push(shield);
      this.group.add(shield);
    }

    this.paper.add(this.hud);
    this.buildHud();
    this.newSequence();

    devInfo.battle = () => this.state;
    devActions['['] = () => {
      this.signStep = 3;
      this.gather(1);
    };
    devActions[']'] = () => this.devThrow();
    devActions[';'] = () => this.breathe();
  }

  get state(): string {
    return `3d=${this.dragon3d ? 'on' : `${dragonLoad.dragon}`} phoenix=${dragonLoad.phoenix} ${this.mode} hp=${this.health} dragon=${this.dragonHealth.toFixed(1)} sign=${this.signStep}/${this.sequence.join(',')} orb=${this.orbHand >= 0 ? this.orbCharge.toFixed(2) : this.flying ? 'flying' : '-'} fire=${this.fireballs.length}`;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[], head: Vector3): void {
    this.time += dt;
    this.modeTime += dt;
    this.noteTime -= dt;
    this.headWorld.copy(head);
    this.group.worldToLocal(this.head.copy(head));
    this.record(hands);

    // Behind the menu or the story card the dragon only breathes and waits.
    this.hud.visible = stage.playing || this.mode === 'won';
    stage.music = this.mode === 'won' ? 'victory' : stage.playing ? 'battle' : null;
    if (!this.dragon3d) {
      this.dragon3d = Dragon3D.create();
      if (this.dragon3d) {
        this.dragon3d.root.position.copy(this.dragonHome);
        this.group.add(this.dragon3d.root);
      }
    }
    const shown = stage.playing || this.mode === 'won';
    this.dragon.root.visible = shown && !this.dragon3d;
    if (this.dragon3d) {
      this.dragon3d.root.visible = shown;
      this.dragon3d.update(dt, this.head);
    }
    if (!stage.playing && this.mode !== 'won') {
      this.dragon.update(dt);
      return;
    }
    if (stage.command === 'drink') {
      stage.command = null;
      this.drink();
    }
    switch (this.mode) {
      case 'intro':
        this.caption = 'The Shadow Dragon guards the Great Lantern!';
        if (this.modeTime > 0.4 && this.modeTime - dt <= 0.4) playRoar();
        if (this.modeTime > 3.2) this.setMode('fight');
        break;
      case 'fight':
        this.signs(dt, hands);
        this.charge(dt, hands);
        this.dragonTurn(dt);
        this.say();
        break;
      case 'lost':
        this.caption = 'The fire overwhelms you… Rise and try again!';
        if (this.modeTime > 3.5) this.restart();
        break;
      case 'won':
        this.dragon.defeat = Math.min(1, this.modeTime / 2.5);
        if (this.dragon3d) {
          this.dragon3d.defeat = Math.min(1, this.modeTime / 2.2);
          // From the ashes, the Great Lantern's spirit: the phoenix.
          if (!this.phoenix && this.modeTime > 1.2) {
            this.phoenix = Phoenix.create();
            if (this.phoenix) {
              this.dragon3d.heartAt(this.phoenixFrom);
              this.group.add(this.phoenix.root);
            }
          }
          this.phoenix?.update(dt, this.phoenixFrom, this.head);
        }
        this.caption = 'Light breaks the shadow! The Great Lantern is free.';
        if (Math.random() < dt * 30) this.burstOnPaper(this.v.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.4) * 0.5, 0.01), 4, 0xfff2c0);
        if (this.modeTime > 3.4) this.done = true;
        break;
    }
    this.flyOrb(dt);
    this.flyFire(dt, hands);
    this.dragon.update(dt);
    this.drawHud(dt);
    this.sparks.update(dt);
    this.glow.update(dt);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private say(): void {
    let text: string;
    if (this.orbHand >= 0) text = this.orbCharge < 1 ? 'Light gathers in your hand…' : 'Throw it! Aim for the head or the ember heart';
    else if (this.flying) text = 'Fly true…';
    else {
      const sign = SIGNS[this.sequence[this.signStep]];
      text = `Make the signs to gather light · ${this.signStep + 1}/3: ${sign.label}`;
    }
    if (this.fireballs.some((f) => !f.reflected) && this.time > 0) text = 'Fire! Raise an open palm to shield. Angle it to bounce the fire back';
    if (this.noteTime > 0) text = this.note;
    this.caption = text;
  }

  private flash(text: string, seconds = 1.6): void {
    this.note = text;
    this.noteTime = seconds;
  }

  private restart(): void {
    this.health = PLAYER_HEALTH;
    this.dragonHealth = DRAGON_HEALTH;
    for (const f of this.fireballs) this.group.remove(f.sprite);
    this.fireballs.length = 0;
    this.flying = null;
    this.orbHand = -1;
    this.orb.visible = false;
    this.newSequence();
    this.nextBreath = 3;
    this.setMode('fight');
  }

  // ================================================================= Signs

  private newSequence(): void {
    const seq: SignName[] = [];
    while (seq.length < 3) {
      const pick = SIGN_NAMES[Math.floor(Math.random() * SIGN_NAMES.length)];
      if (pick !== seq[seq.length - 1]) seq.push(pick);
    }
    this.sequence = seq;
    this.signStep = 0;
    this.signHeld = 0;
    this.signIcons.forEach((icon, i) => {
      const material = icon.material;
      material.map?.dispose();
      material.map = signTexture(SIGNS[seq[i]]);
      material.needsUpdate = true;
    });
  }

  private signs(dt: number, hands: readonly HandState[]): void {
    if (this.orbHand >= 0 || this.flying || this.signStep >= 3) return;
    const want = SIGNS[this.sequence[this.signStep]].fingers;
    let made = -1;
    hands.forEach((hand, h) => {
      if (hand.tracked && matches(hand.ext, want)) made = made < 0 || h === this.signHand ? h : made;
    });
    this.signHeld = made >= 0 ? this.signHeld + dt : Math.max(0, this.signHeld - dt * 2);
    if (made >= 0 && this.signHeld >= SIGN_HOLD) {
      this.signHand = made;
      playSign(this.signStep);
      this.burstAtHand(hands[made], 10, 0xbfe4ff);
      this.signStep++;
      this.signHeld = 0;
      if (this.signStep >= 3) this.gather(made);
    }
  }

  private gather(hand: number): void {
    this.orbHand = hand;
    this.orbCharge = 0;
    this.orb.visible = true;
    playCharge();
  }

  private charge(dt: number, hands: readonly HandState[]): void {
    const h = this.orbHand;
    if (h < 0) return;
    const hand = hands[h];
    if (!hand.tracked) return;
    this.orbCharge = Math.min(1, this.orbCharge + dt / 1.2);
    // The orb rides just off the palm.
    this.group.worldToLocal(this.v.copy(hand.palm).addScaledVector(hand.palmNormal, 0.055));
    this.orb.position.copy(this.v);
    if (Math.random() < dt * 25) this.glow.emit(this.v, this.w.set((Math.random() - 0.5) * 0.06, 0.04, (Math.random() - 0.5) * 0.06), { life: 0.5, size: [0.02, 0.005], from: 0xd8f0ff, alpha: 0.6 });
    if (this.orbCharge < 0.6) return;
    // A throw: the hand moving fast towards the screen.
    const velocity = this.throwVelocity(h, this.w);
    if (!velocity) return;
    const toScreen = this.paperNormal(this.v).negate();
    const speed = velocity.length();
    if (speed > 1.0 && velocity.dot(toScreen) > 0.55 * speed) this.release(velocity);
  }

  /** Release velocity, fitted from the tracked path 140 to 40 ms ago (stage space). */
  private throwVelocity(h: number, out: Vector3): Vector3 | null {
    const samples = this.history[h];
    const now = this.time;
    const window = samples.filter((s) => s.t <= now - 0.04 && s.t >= now - 0.14);
    if (window.length < 3) return null;
    // Least-squares slope of position against time, per axis.
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
    out.copy(stp).multiplyScalar(n).addScaledVector(sp, -st).divideScalar(denom);
    return out;
  }

  private release(handVelocity: Vector3): void {
    // Magic adds to the arm: the light leaves faster than the hand.
    const vel = handVelocity.clone().multiplyScalar(1.8);
    const speed = Math.min(4, Math.max(1.6, vel.length()));
    vel.setLength(speed);
    this.flying = { pos: this.orb.position.clone(), vel };
    this.orbHand = -1;
    playThrow();
  }

  private record(hands: readonly HandState[]): void {
    hands.forEach((hand, h) => {
      const list = this.history[h];
      if (!hand.tracked) {
        list.length = 0;
        return;
      }
      list.push({ t: this.time, p: this.group.worldToLocal(hand.palm.clone()) });
      while (list.length && list[0].t < this.time - 0.5) list.shift();
    });
  }

  // =================================================================== Orb

  private flyOrb(dt: number): void {
    const flying = this.flying;
    this.orbRing.rotation.z += dt * 3;
    if (!flying) {
      const s = 0.04 + 0.06 * this.orbCharge;
      this.orbCore.scale.setScalar(s * (0.9 + 0.1 * Math.sin(this.time * 20)));
      this.orbRing.scale.setScalar(0.6 + this.orbCharge);
      this.orbRing.lookAt(this.headWorld);
      return;
    }
    // Light falls a little, and bends towards the dragon's weak points.
    flying.vel.y -= 1.2 * dt;
    const target = this.nearestWeakPoint(flying.pos, flying.vel, this.v);
    if (target) {
      const want = target.sub(flying.pos).normalize().multiplyScalar(flying.vel.length());
      flying.vel.lerp(want, Math.min(1, dt * 2.5));
    }
    flying.pos.addScaledVector(flying.vel, dt);
    this.orb.position.copy(flying.pos);
    if (Math.random() < dt * 60) this.sparks.emit(flying.pos, this.w.set(0, 0, 0), { life: 0.35, size: [0.012, 0.002], from: 0xd8f0ff, to: 0x3060ff });
    const onPaper = this.paper.worldToLocal(this.group.localToWorld(this.w.copy(flying.pos)));
    const hit3d = this.dragon3d ? this.hit3d(flying.pos, 1) : false;
    if (hit3d || onPaper.z <= 0.012) {
      if (!hit3d) this.strike(onPaper, 1, 0xd8f0ff);
      this.flying = null;
      this.orb.visible = false;
      this.newSequence();
    } else if (flying.pos.y < -0.5 || onPaper.z > 2) {
      this.flying = null;
      this.orb.visible = false;
      this.newSequence();
    }
  }

  /** The head or heart the orb is heading closest towards, if within ~15°. */
  private nearestWeakPoint(pos: Vector3, vel: Vector3, out: Vector3): Vector3 | null {
    const dir = vel.clone().normalize();
    let best: Vector3 | null = null;
    let bestAngle = 0.27;
    for (const local of this.weakPoints()) {
      const angle = dir.angleTo(local.clone().sub(pos));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = out.copy(local);
      }
    }
    return best;
  }

  /** Head and heart, in this group's space. */
  private weakPoints(): Vector3[] {
    if (this.dragon3d) return [this.dragon3d.headAt(new Vector3()), this.dragon3d.heartAt(new Vector3())];
    return [this.dragon.headAt(new Vector3()), this.dragon.heartAt(new Vector3())].map((p) =>
      this.group.worldToLocal(this.paper.localToWorld(p)),
    );
  }

  /** Light or reflected fire meeting the 3D dragon: true if it struck (and is used up). */
  private hit3d(pos: Vector3, power: number): boolean {
    const dragon = this.dragon3d!;
    const [head, heart] = this.weakPoints();
    const weak = pos.distanceTo(head) < 0.09 || pos.distanceTo(heart) < 0.1;
    const body = pos.distanceTo(heart) < dragon.radius;
    if (!weak && !body) return false;
    this.burstAt(pos, 30, power >= 1 ? 0xd8f0ff : 0xffc060);
    if (this.mode === 'fight') this.wound(weak ? power : power * 0.4);
    return true;
  }

  /** Light (or a reflected fireball) reaches the screen: does it hit the dragon? */
  private strike(onPaper: Vector3, power: number, color: number): void {
    const headP = this.dragon.headAt(new Vector3());
    const heartP = this.dragon.heartAt(new Vector3());
    const dHead = Math.hypot(onPaper.x - headP.x, onPaper.y - headP.y);
    const dHeart = Math.hypot(onPaper.x - heartP.x, onPaper.y - heartP.y);
    const onBody = onPaper.x > -0.34 && onPaper.x < 0.4 && onPaper.y > -0.3 && onPaper.y < 0.28;
    this.burstOnPaper(this.v.set(onPaper.x, onPaper.y, 0.012), 26, color);
    if (this.mode !== 'fight') return;
    let damage = 0;
    if (dHead < 0.075 || dHeart < 0.08) damage = power;
    else if (onBody) damage = power * 0.4;
    if (damage === 0) {
      this.flash('Missed! Aim for the head or the glowing heart');
      return;
    }
    this.wound(damage);
  }

  private wound(damage: number): void {
    // A Sun Shard from your bag makes a full blow of light strike twice as hard.
    if (damage >= 1 && useItem('shard')) {
      damage *= 2;
      this.burstAt(this.weakPoints()[1], 40, 0xfff2a0);
    }
    this.dragonHealth -= damage;
    this.dragon.flinch();
    this.dragon3d?.flinch();
    playBoom(0.08 + 0.05 * damage);
    if (this.dragonHealth <= 0.01) {
      this.setMode('won');
      playRoar(0.14);
      for (const f of this.fireballs) this.group.remove(f.sprite);
      this.fireballs.length = 0;
      return;
    }
    playRoar(0.06);
    const enraged = this.dragonHealth <= DRAGON_HEALTH / 2 && this.dragonHealth + damage > DRAGON_HEALTH / 2;
    this.flash(enraged
      ? 'The dragon is enraged! Twin fireballs: shield with both palms'
      : damage >= 1 ? 'A direct hit! The dragon reels' : 'It stings! Hit the head or heart for more');
    // Wounded, it breathes faster.
    this.nextBreath = Math.min(this.nextBreath, 1.5);
  }

  // =========================================================== Dragon fire

  private dragonTurn(dt: number): void {
    if (this.breathTime > 0) {
      this.breathTime += dt;
      this.dragon.windup = Math.min(1, this.breathTime / BREATH_TIME);
      if (this.dragon3d) this.dragon3d.windup = this.dragon.windup;
      if (this.breathTime >= BREATH_TIME) {
        this.breathTime = 0;
        this.dragon.windup = 0;
        if (this.dragon3d) this.dragon3d.windup = 0;
        this.breathe();
      }
      return;
    }
    this.dragon.windup = Math.max(0, this.dragon.windup - dt * 3);
    if (this.dragon3d) this.dragon3d.windup = this.dragon.windup;
    this.nextBreath -= dt;
    if (this.nextBreath <= 0) {
      this.breathTime = 0.001;
      // Angrier as it weakens.
      this.nextBreath = this.dragonHealth > DRAGON_HEALTH / 2 ? 4.2 + Math.random() : 2.8 + Math.random();
    }
  }

  /** Fire leaves the mouth, aimed at the player's head. */
  private breathe(): void {
    const pos = this.dragon3d
      ? this.dragon3d.mouthAt(new Vector3())
      : this.group.worldToLocal(this.paper.localToWorld(this.dragon.mouthAt(new Vector3())));
    const vel = this.head.clone().sub(pos);
    // Not too sharp a shot: a little off the eyes, so a palm can meet it.
    vel.x += (Math.random() - 0.5) * 0.08;
    vel.y -= 0.03;
    vel.setLength(FIRE_SPEED);
    // Wounded past half, it breathes twin fireballs, a little apart and faster.
    if (this.dragonHealth <= DRAGON_HEALTH / 2 && !this.twin) {
      this.twin = true;
      this.launch(pos.clone(), vel.clone().applyAxisAngle(UP_AXIS, 0.12).multiplyScalar(1.12));
      vel.applyAxisAngle(UP_AXIS, -0.12).multiplyScalar(1.12);
    }
    this.twin = false;
    this.launch(pos, vel);
  }

  private launch(pos: Vector3, vel: Vector3): void {
    const sprite = new Sprite(this.fireMaterial);
    sprite.scale.setScalar(0.06);
    sprite.position.copy(pos);
    this.group.add(sprite);
    this.fireballs.push({ sprite, pos, vel, reflected: false, age: 0 });
    playFireball();
  }

  private flyFire(dt: number, hands: readonly HandState[]): void {
    // Shields: an open palm, glowing while fire is in the air.
    const fireInAir = this.fireballs.some((f) => !f.reflected);
    hands.forEach((hand, h) => {
      const shield = this.shields[h];
      const open = hand.tracked && matches(hand.ext, [1, 1, 1, 1], 0.4);
      shield.visible = open && fireInAir;
      if (!shield.visible) return;
      this.group.worldToLocal(this.v.copy(hand.palm).addScaledVector(hand.palmNormal, 0.03));
      shield.position.copy(this.v);
      shield.lookAt(this.w.copy(hand.palm).addScaledVector(hand.palmNormal, 1));
      (shield.material as MeshBasicMaterial).opacity = 0.25 + 0.1 * Math.sin(this.time * 12);
    });

    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.age += dt;
      f.pos.addScaledVector(f.vel, dt);
      f.sprite.position.copy(f.pos);
      f.sprite.scale.setScalar(0.05 + 0.012 * Math.sin(f.age * 30));
      if (Math.random() < dt * 50) this.sparks.emit(f.pos, this.v.set((Math.random() - 0.5) * 0.05, 0.03, (Math.random() - 0.5) * 0.05), { life: 0.4, gravity: -0.1, size: [0.01, 0.002], from: 0xffc060, to: 0x601000 });

      let gone = f.age > 4;
      if (!f.reflected) {
        // Meets a palm: reflects like light off a mirror.
        hands.forEach((hand, h) => {
          if (gone || f.reflected || !this.shields[h].visible) return;
          const palm = this.group.worldToLocal(this.v.copy(hand.palm));
          if (palm.distanceTo(f.pos) > SHIELD_REACH) return;
          const n = this.w.copy(hand.palmNormal).transformDirection(this.group.matrixWorld.clone().invert());
          if (n.dot(f.vel) > -0.1 * f.vel.length()) return;
          f.vel.addScaledVector(n, -2 * f.vel.dot(n)).multiplyScalar(1.25);
          f.reflected = true;
          playClang(0.2, 0.05);
          this.burstAt(f.pos, 18, 0xbfe4ff);
          this.flash('Deflected!', 1);
        });
        if (!f.reflected && f.pos.distanceTo(this.head) < HEAD_RADIUS) {
          gone = true;
          this.hurtPlayer(f.pos);
        }
      } else if (this.dragon3d) {
        if (this.hit3d(f.pos, 0.5)) gone = true;
      } else {
        const onPaper = this.paper.worldToLocal(this.group.localToWorld(this.v.copy(f.pos)));
        if (onPaper.z <= 0.012) {
          gone = true;
          this.strike(onPaper, 0.5, 0xffc060);
        }
      }
      if (gone) {
        this.group.remove(f.sprite);
        this.fireballs.splice(i, 1);
      }
    }
  }

  /** A healing draught from the wrist: one heart back, if any were lost. */
  private drink(): void {
    const i = play.items.indexOf('potion');
    if (i < 0) return;
    if (this.health >= PLAYER_HEALTH) {
      this.flash('You are at full strength: save it for later', 1.6);
      return;
    }
    play.items.splice(i, 1);
    saveProgress();
    this.health++;
    playCharge();
    this.burstAt(this.v.copy(this.head).add(this.w.set(0, -0.15, -0.1)), 24, 0x9fd060);
    this.flash('A healing draught! One heart back', 1.6);
  }

  private hurtPlayer(at: Vector3): void {
    if (useItem('ward')) {
      // The Iron Ward from your bag takes the blow.
      playClang(0.3, 0.06);
      this.burstAt(at, 26, 0xc8d0dc);
      this.flash('Your Iron Ward takes the blow!', 1.6);
      return;
    }
    this.health--;
    this.mistakes++;
    playBoom(0.12);
    playHiss(0.05, 0.6);
    this.burstAt(at, 30, 0xff8030);
    if (this.health <= 0) {
      this.setMode('lost');
      for (const f of this.fireballs) this.group.remove(f.sprite);
      this.fireballs.length = 0;
      this.orbHand = -1;
      this.orb.visible = false;
    } else {
      const potions = play.items.includes('potion');
      this.flash(potions
        ? 'Burned! Look at your palm and tap Drink to heal'
        : this.health === 1 ? 'Burned! One heart left: shield with an open palm' : 'Burned! Shield with an open palm', 2.2);
    }
  }

  // ================================================================ Effects

  private burstAt(at: Vector3, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      this.w.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 0.4);
      this.sparks.emit(at, this.w, { life: 0.4 + Math.random() * 0.4, gravity: 1.5, drag: 1, size: [0.01, 0.002], from: color, to: 0x301000 });
    }
  }

  private burstAtHand(hand: HandState, count: number, color: number): void {
    this.burstAt(this.group.worldToLocal(this.v.copy(hand.palm)), count, color);
  }

  /** A burst on the screen at a paper-space point. */
  private burstOnPaper(onPaper: Vector3, count: number, color: number): void {
    const at = this.group.worldToLocal(this.paper.localToWorld(onPaper.clone()));
    this.burstAt(at, count, color);
  }

  private paperNormal(out: Vector3): Vector3 {
    return out.set(0, 0, 1).transformDirection(this.paper.matrix);
  }

  // =================================================================== HUD

  private buildHud(): void {
    // Hearts, top left of the screen.
    const heart = new Shape();
    heart.moveTo(0, -0.012);
    heart.bezierCurveTo(-0.02, 0.0, -0.016, 0.016, 0, 0.008);
    heart.bezierCurveTo(0.016, 0.016, 0.02, 0.0, 0, -0.012);
    for (let i = 0; i < PLAYER_HEALTH; i++) {
      const mesh = new Mesh(new ShapeGeometry(heart, 12), new MeshBasicMaterial({ color: 0xd8342c, transparent: true, depthWrite: false }));
      mesh.position.set(-0.45 + i * 0.04, 0.31, 0.012);
      mesh.renderOrder = 9;
      this.hearts.push(mesh);
      this.hud.add(mesh);
    }
    // The dragon's strength, top centre.
    const frame = new Mesh(new BoxGeometry(0.3, 0.022, 0.001), new MeshBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0.8, depthWrite: false }));
    frame.position.set(0, 0.315, 0.011);
    frame.renderOrder = 8;
    this.hud.add(frame);
    this.bar = new Mesh(new BoxGeometry(0.29, 0.014, 0.001).translate(0.145, 0, 0), new MeshBasicMaterial({ color: 0xe0602a, transparent: true, depthWrite: false }));
    this.bar.position.set(-0.145, 0.315, 0.0125);
    this.bar.renderOrder = 9;
    this.hud.add(this.bar);
    // Sign cards along the bottom.
    for (let i = 0; i < 3; i++) {
      const material = new MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new Mesh(new PlaneGeometry(0.085, 0.105), material);
      // Bottom left, under the dragon's head and clear of the ground line.
      mesh.position.set(-0.415 + i * 0.095, -0.12, 0.012);
      mesh.renderOrder = 9;
      this.signIcons.push({ mesh, material });
      this.hud.add(mesh);
    }
  }

  private drawHud(dt: number): void {
    this.hearts.forEach((heart, i) => {
      const alive = i < this.health;
      (heart.material as MeshBasicMaterial).opacity = alive ? 0.95 : 0.18;
      heart.scale.setScalar(alive ? 1 + 0.08 * Math.sin(this.time * 4 + i) : 0.9);
    });
    const k = Math.max(0, this.dragonHealth / DRAGON_HEALTH);
    this.bar.scale.x += (Math.max(0.001, k) - this.bar.scale.x) * Math.min(1, dt * 6);
    const showSigns = this.mode === 'fight' && this.orbHand < 0 && !this.flying;
    this.signIcons.forEach((icon, i) => {
      icon.mesh.visible = showSigns;
      const current = i === this.signStep;
      icon.material.opacity = i < this.signStep ? 0.45 : current ? 1 : 0.6;
      const pulse = current ? 1 + 0.06 * Math.sin(this.time * 6) + 0.25 * Math.min(1, this.signHeld / SIGN_HOLD) : 1;
      icon.mesh.scale.setScalar(pulse);
    });
  }

  // =================================================================== Dev

  private devThrow(): void {
    if (this.orbHand < 0) this.gather(1);
    this.orbCharge = 1;
    const target = this.weakPoints()[0];
    this.orb.position.copy(this.head).add(new Vector3(0.1, -0.25, -0.3));
    this.release(target.sub(this.orb.position).setLength(2.2).divideScalar(1.8));
  }
}

function matches(ext: Extension, want: readonly number[], slack = 0.45): boolean {
  const fingers = [ext.index, ext.middle, ext.ring, ext.pinky];
  return fingers.every((value, i) => Math.abs(value - want[i]) < slack);
}

function radial(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A card showing a hand sign as four finger bars (tall = straight) and its name. */
function signTexture(sign: { label: string; fingers: readonly number[] }): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(40,26,16,0.85)';
  g.beginPath();
  g.roundRect(4, 4, 120, 152, 14);
  g.fill();
  g.strokeStyle = '#e8c070';
  g.lineWidth = 4;
  g.stroke();
  // Palm and four fingers.
  g.fillStyle = '#f3e4c8';
  g.beginPath();
  g.roundRect(30, 72, 68, 44, 12);
  g.fill();
  sign.fingers.forEach((up, i) => {
    const x = 32 + i * 17;
    const h = up ? 52 : 14;
    g.beginPath();
    g.roundRect(x, 76 - h, 13, h + 8, 6);
    g.fill();
  });
  g.fillStyle = '#e8c070';
  g.font = 'bold 22px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(sign.label, 64, 145);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
