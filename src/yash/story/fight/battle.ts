import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { playBoom, playCharge, playClang, playFireball, playHiss } from '../audio.js';
import { sfx } from '../../sfx.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { ParticlePool } from '../machines/particles.js';
import { useItem } from '../bag.js';
import { play, saveProgress } from '../progress.js';
import { stage } from '../stage-state.js';
import { ArsenalPlayer } from './arsenal-player.js';
import { ShadowDragon } from './dragon.js';
import { Dragon3D, dragonLoad, Phoenix, preloadDragon } from './dragon3d.js';

/**
 * The last chapter: the Shadow Dragon guards the Great Lantern.
 *
 * In the Arsenal's copy of Shadowplay the player fights it with the
 * Arsenal (see arsenal-player.ts): hold an invisible ball to arm, then sign
 * for a sword, spear, power ball, wall, blaster, shield or slingshot. The
 * dragon fights as before: it breathes fire out of the screen at you, and
 * dives in close to bite. A shield or the wall stops its fire and its bite;
 * a sword or spear cuts fireballs out of the air.
 */

/** More hearts than with the light orb: an Arsenal fight takes more blows and more fire. */
const PLAYER_HEALTH = 5;
/**
 * On the Arsenal's damage scale (sword 2, power ball 3, spear 5, blaster 1;
 * half that on the body): a fight of a minute or so.
 */
const DRAGON_HEALTH = 30;
const FIRE_SPEED = 0.75;
const HEAD_RADIUS = 0.16;
const BREATH_TIME = 1.2;
/** Until then the dragon waits for its 3D model rather than showing a flat puppet. */
const PUPPET_AFTER = 25;
/** A dive: swoop in, hang there jaws open, then snap and pull back. */
const DIVE_IN = 1.1;
const DIVE_HOLD = 1.6;
const DIVE_OUT = 1.0;
/** A Sun Shard doubles blows at least this strong: the thrown ones. */
const SHARD_MIN = 3;
const FIRE_RADIUS = 0.03;
const UP_AXIS = new Vector3(0, 1, 0);

type Mode = 'intro' | 'fight' | 'lost' | 'won';

interface Fireball {
  sprite: Sprite;
  pos: Vector3;
  vel: Vector3;
  age: number;
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
  /** How the fight went, for the Inventor's Journal. */
  private readonly tally = { hits: 0, weak: 0, cut: 0, blocked: 0, bites: 0 };
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

  /** The Arsenal: the player's weapons. */
  private readonly player: ArsenalPlayer;
  /** Level, from the player towards the dragon, in this group's space. */
  private readonly forward = new Vector3(0, 0, -1);

  // The dragon's fire.
  private readonly fireballs: Fireball[] = [];
  private readonly fireMaterial: SpriteMaterial;
  private breathTime = 0;
  /** Seconds into a dive (0: hovering). */
  private diveTime = 0;
  private biteDone = false;
  private twin = false;
  private nextBreath = 3;

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

    this.fireMaterial = new SpriteMaterial({ map: radial('rgba(255,250,210,1)', 'rgba(255,110,20,0.85)'), blending: AdditiveBlending, transparent: true, depthWrite: false });

    const battle = this;
    this.player = new ArsenalPlayer(this.group, {
      weakPoints: () => this.weakPoints(),
      bodyRadius: () => this.dragon3d?.radius ?? 0.12,
      get fighting() {
        return battle.mode === 'fight';
      },
      hit: (amount, at, weak) => this.struck(amount, at, weak),
      fire: () => this.fireballs,
      cutFire: (point, radius) => this.cutFire(point, radius),
    });

    this.paper.add(this.hud);
    this.buildHud();

    devInfo.battle = () => this.state;
    devActions[';'] = () => this.breathe();
    devActions["'"] = () => {
      if (this.dragon3d && this.diveTime === 0) this.diveTime = 0.001;
    };
  }

  /** How you beat the dragon, for the Inventor's Journal. */
  journal(): string[] {
    const t = this.tally;
    return [
      `Won in ${Math.round(this.time)} s with ${this.health} of ${PLAYER_HEALTH} hearts left`,
      `${t.hits} blows from your Arsenal · ${t.weak} on the head or heart · ${t.cut} fireballs cut down`,
      `${t.blocked} fireballs blocked · ${t.bites} bites blocked`,
    ];
  }

  get state(): string {
    return `3d=${this.dragon3d ? 'on' : `${dragonLoad.dragon}`} phoenix=${dragonLoad.phoenix} ${this.mode} hp=${this.health} dragon=${this.dragonHealth.toFixed(1)} arsenal=${this.player.recognizer.phase}:${this.player.holding} hits=${this.tally.hits} fire=${this.fireballs.length}`;
  }

  // ================================================================ Update

  update(dt: number, _hands: readonly HandState[], head: Vector3): void {
    this.time += dt;
    this.modeTime += dt;
    this.noteTime -= dt;
    this.headWorld.copy(head);
    this.group.worldToLocal(this.head.copy(head));
    this.forward.copy(this.dragonHome).sub(this.head).setY(0);
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();

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
    // The flat puppet only stands in if the 3D dragon never arrives (a very slow connection).
    this.dragon.root.visible = shown && !this.dragon3d && this.time > PUPPET_AFTER;
    this.player.root.visible = shown;
    if (this.dragon3d) {
      this.dragon3d.root.visible = shown;
      this.dragon3d.update(dt, this.head);
    }
    if (!stage.playing && this.mode !== 'won') {
      // The intro (and its roar) waits for the story card to close.
      if (this.mode === 'intro') this.modeTime = 0;
      this.dragon.update(dt);
      return;
    }
    if (stage.command === 'drink') {
      stage.command = null;
      this.drink();
    }
    switch (this.mode) {
      case 'intro':
        if (!this.dragon3d && this.time < PUPPET_AFTER) {
          this.caption = 'Something huge stirs behind the screen…';
          this.modeTime = 0;
          break;
        }
        this.caption = 'The Shadow Dragon bursts out! It guards the Great Lantern';
        if (this.modeTime > 0.4 && this.modeTime - dt <= 0.4) sfx.roar();
        if (this.modeTime > 3.2) this.setMode('fight');
        break;
      case 'fight':
        this.dive(dt);
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
    this.player.update(dt, this.time, this.head, this.forward, this.group);
    this.flyFire(dt);
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
    let text = 'Hold an invisible ball to arm, then make a weapon sign';
    if (this.player.armed) {
      text = 'Armed! ✊ sword · ✊✊ spear · 🫴 power ball · 🙌 wall · 👉 blaster · ✋ shield · ✌️ slingshot';
    } else {
      switch (this.player.arsenal.held?.item) {
        case 'sword':
          text = 'Swing your sword through the head or the glowing heart';
          break;
        case 'spear':
          text = 'Thrust your spear, or throw it at the dragon';
          break;
        case 'ball':
          text = 'Throw the power ball at the head or the heart';
          break;
        case 'gun':
          text = 'Aim along your finger and drop your thumb to fire';
          break;
        case 'sling':
          text = 'Pinch the pouch with your other hand, pull back and let go';
          break;
        default:
          if (this.player.arsenal.shield) text = 'Your shield stops fire and bites. Arm again for a sword to go with it';
          else if (this.player.arsenal.wallLeft > 0) text = 'Your wall stops the fire. Arm again for a weapon';
      }
    }
    if (this.fireballs.length > 0 && !this.player.guarded) text = 'Fire! Raise a shield ✋ or a wall 🙌, or cut it down with your sword';
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
    this.player.reset();
    this.nextBreath = 3;
    this.diveTime = 0;
    this.biteDone = false;
    this.dragon3d?.root.position.copy(this.dragonHome);
    this.setMode('fight');
  }

  // ============================================================ The dragon

  /** Head and heart, in this group's space. */
  private weakPoints(): Vector3[] {
    if (this.dragon3d) return [this.dragon3d.headAt(new Vector3()), this.dragon3d.heartAt(new Vector3())];
    return [this.dragon.headAt(new Vector3()), this.dragon.heartAt(new Vector3())].map((p) =>
      this.group.worldToLocal(this.paper.localToWorld(p)),
    );
  }

  /** A blow from the Arsenal. */
  private struck(amount: number, at: Vector3, weak: boolean): void {
    if (this.mode !== 'fight') return;
    this.tally.hits++;
    if (weak) this.tally.weak++;
    this.burstAt(at, weak ? 30 : 16, weak ? 0xd8f0ff : 0xffc060);
    this.wound(amount, weak);
  }

  private wound(damage: number, weak: boolean): void {
    // A Sun Shard from your bag makes a thrown blow strike twice as hard.
    if (damage >= SHARD_MIN && useItem('shard')) {
      damage *= 2;
      this.burstAt(this.weakPoints()[1], 40, 0xfff2a0);
    }
    const before = this.dragonHealth;
    this.dragonHealth -= damage;
    this.dragon.flinch();
    this.dragon3d?.flinch();
    playBoom(0.06 + 0.01 * damage);
    sfx.dragonGrunt();
    if (this.dragonHealth <= 0.01) {
      this.setMode('won');
      sfx.dragonDeath();
      this.player.reset();
      for (const f of this.fireballs) this.group.remove(f.sprite);
      this.fireballs.length = 0;
      return;
    }
    const enraged = this.dragonHealth <= DRAGON_HEALTH / 2 && before > DRAGON_HEALTH / 2;
    if (enraged) {
      sfx.dragonRoar(1);
      this.flash('The dragon is enraged! Twin fireballs: keep your shield or wall up', 2.4);
    } else if (this.noteTime <= 0) {
      this.flash(weak ? 'A direct hit! The dragon reels' : 'It stings! Hit the head or heart for more', 1);
    }
    // No faster breath per blow: the Arsenal lands many small ones. It angers past half instead.
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
    if (this.diveTime > 0) return;
    this.nextBreath -= dt;
    if (this.nextBreath <= 0 && this.dragon3d && Math.random() < 0.4) {
      this.diveTime = 0.001;
      this.nextBreath = 3.5 + Math.random();
      sfx.roar();
      this.flash('It dives at you! Slash it with your sword, or block with a shield', 2);
    } else if (this.nextBreath <= 0) {
      this.breathTime = 0.001;
      sfx.dragonSnarl();
      // Angrier as it weakens.
      this.nextBreath = this.dragonHealth > DRAGON_HEALTH / 2 ? 4.2 + Math.random() : 2.8 + Math.random();
    }
  }

  // ============================================================= Dive

  /** Swoops in close, jaws open; snaps unless a shield or wall is up; pulls back. */
  private dive(dt: number): void {
    const dragon = this.dragon3d;
    if (!dragon || this.diveTime <= 0) return;
    this.diveTime += dt;
    const t = this.diveTime;
    const close = this.head.clone().lerp(this.dragonHome, 0.42);
    close.y = this.head.y - 0.38;
    let k: number;
    if (t < DIVE_IN) k = smooth01(t / DIVE_IN);
    else if (t < DIVE_IN + DIVE_HOLD) k = 1;
    else k = 1 - smooth01((t - DIVE_IN - DIVE_HOLD) / DIVE_OUT);
    dragon.root.position.lerpVectors(this.dragonHome, close, k);
    dragon.windup = t > DIVE_IN && t < DIVE_IN + DIVE_HOLD ? 0.5 : 0;
    if (!this.biteDone && t >= DIVE_IN + DIVE_HOLD - 0.15) {
      this.biteDone = true;
      if (this.player.guarded) {
        playClang(0.3, 0.06);
        this.tally.bites++;
        this.flash('Blocked! The bite glances off', 1.4);
      } else {
        playBoom(0.08);
        this.hurtPlayer(this.head.clone().add(new Vector3(0, -0.15, -0.15)));
      }
    }
    if (t >= DIVE_IN + DIVE_HOLD + DIVE_OUT) {
      this.diveTime = 0;
      this.biteDone = false;
      dragon.root.position.copy(this.dragonHome);
    }
  }

  /** Fire leaves the mouth, aimed at the player's head. */
  private breathe(): void {
    const pos = this.dragon3d
      ? this.dragon3d.mouthAt(new Vector3())
      : this.group.worldToLocal(this.paper.localToWorld(this.dragon.mouthAt(new Vector3())));
    const vel = this.head.clone().sub(pos);
    // Not too sharp a shot: a little off the eyes, so a shield can meet it.
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
    this.fireballs.push({ sprite, pos, vel, age: 0 });
    playFireball();
  }

  private flyFire(dt: number): void {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.age += dt;
      f.pos.addScaledVector(f.vel, dt);
      f.sprite.position.copy(f.pos);
      f.sprite.scale.setScalar(0.05 + 0.012 * Math.sin(f.age * 30));
      if (Math.random() < dt * 50) this.sparks.emit(f.pos, this.v.set((Math.random() - 0.5) * 0.05, 0.03, (Math.random() - 0.5) * 0.05), { life: 0.4, gravity: -0.1, size: [0.01, 0.002], from: 0xffc060, to: 0x601000 });

      let gone = f.age > 4;
      if (!gone && this.player.absorb(f.pos, FIRE_RADIUS)) {
        // A shield or the wall takes it.
        gone = true;
        this.tally.blocked++;
        playClang(0.2, 0.05);
        this.burstAt(f.pos, 18, 0xbfe4ff);
        this.flash('Blocked!', 0.8);
      } else if (!gone && f.pos.distanceTo(this.head) < HEAD_RADIUS) {
        gone = true;
        this.hurtPlayer(f.pos);
        // The last heart: hurtPlayer has already put out every fireball.
        if (this.mode !== 'fight') return;
      }
      if (gone) {
        this.group.remove(f.sprite);
        this.fireballs.splice(i, 1);
      }
    }
  }

  /** A sword, spear or power ball meets fire: the fireballs it touches go out. */
  private cutFire(point: Vector3, radius: number): number {
    let cut = 0;
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      if (f.pos.distanceTo(point) > radius + FIRE_RADIUS) continue;
      this.burstAt(f.pos, 16, 0xffd890);
      this.group.remove(f.sprite);
      this.fireballs.splice(i, 1);
      cut++;
    }
    if (cut > 0) {
      this.tally.cut += cut;
      playHiss(0.04, 0.3);
    }
    return cut;
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
      this.player.reset();
    } else {
      const potions = play.items.includes('potion');
      this.flash(potions
        ? 'Burned! Look at your palm and tap Drink to heal'
        : this.health === 1 ? 'Burned! One heart left: raise a shield or a wall' : 'Burned! Block the fire with a shield ✋ or a wall 🙌', 2.2);
    }
  }

  // ================================================================ Effects

  private burstAt(at: Vector3, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      this.w.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 0.4);
      this.sparks.emit(at, this.w, { life: 0.4 + Math.random() * 0.4, gravity: 1.5, drag: 1, size: [0.01, 0.002], from: color, to: 0x301000 });
    }
  }

  /** A burst on the screen at a paper-space point. */
  private burstOnPaper(onPaper: Vector3, count: number, color: number): void {
    const at = this.group.worldToLocal(this.paper.localToWorld(onPaper.clone()));
    this.burstAt(at, count, color);
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
  }

  private drawHud(dt: number): void {
    this.hearts.forEach((heart, i) => {
      const alive = i < this.health;
      (heart.material as MeshBasicMaterial).opacity = alive ? 0.95 : 0.18;
      heart.scale.setScalar(alive ? 1 + 0.08 * Math.sin(this.time * 4 + i) : 0.9);
    });
    const k = Math.max(0, this.dragonHealth / DRAGON_HEALTH);
    this.bar.scale.x += (Math.max(0.001, k) - this.bar.scale.x) * Math.min(1, dt * 6);
  }
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
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
