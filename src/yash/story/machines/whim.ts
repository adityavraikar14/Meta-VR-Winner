import { Group, type Material, Mesh, MeshStandardMaterial, RingGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { playClunk, playCreak, playDrip, playPawl } from '../audio.js';
import type { Harness, HarnessPose } from '../creatures/creature.js';
import { devInfo } from '../dev-tools.js';
import { surface } from '../world/nature.js';
import { crystals } from '../world/themes.js';
import {
  band,
  beam,
  bearing,
  bucket,
  bucketWater,
  crownWheel,
  Dial,
  GEAR_PITCH,
  halo,
  hemp,
  iron,
  lanternPinion,
  octShaft,
  pitchRadius,
  ratchetWheel,
  RopeSpan,
  stone,
  wellHead,
  windingDrum,
  WoundRope,
} from './parts.js';

/**
 * A horse whim over an old well, the way mines and farms wound up heavy
 * loads before engines. The horse walks a circle pushing a sweep arm fixed to
 * a tall upright shaft. At the top a wooden crown wheel (36 cogs) drives a
 * lantern pinion (9 staves) at right angles, so the winding drum turns four
 * times for each lap. Rope from the drum runs over a sheave above the well and
 * down to the bucket. An iron ratchet with a gravity pawl clicks on every
 * tooth and stops the load running back when the horse rests.
 *
 * Everything is driven by one number, the upright shaft's angle; the pinion,
 * drum, rope, sheave and bucket follow it exactly through the gear ratio.
 * Whether the horse can move it is real statics: the horse's pull (growing
 * with the square of its size, like muscle cross-section) against the
 * bucket's weight brought back through the drum, gears and sweep.
 */

const COGS = 36;
const STAVES = 9;
/** Drum turns per lap of the horse. */
const RATIO = COGS / STAVES;
const WHEEL_R = pitchRadius(COGS);
const PINION_R = pitchRadius(STAVES);

/** Heights above the floor. */
const WHEEL_Y = 0.285;
const PINION_Y = WHEEL_Y - GEAR_PITCH * 0.52 - PINION_R;
const TOP_Y = 0.345;
const ARM_Y = 0.07;

/** The horse's path round the upright shaft. */
const WALK_R = 0.15;
const DRUM_R = 0.011;
const ROPE_R = 0.0016;
const COIL_PITCH = ROPE_R * 2.15;
/** Turns left on the drum even with the bucket at the bottom, as millwrights did. */
const DEAD_TURNS = 1.5;
const RATCHET_TEETH = 16;
const SHEAVE_R = 0.02;
/** The well's pulley sits low, so its frame hides little of the screen behind it. */
const SHEAVE_Y = 0.15;
const WELL_INNER = 0.05;
const WELL_OUTER = 0.068;
const WELL_HEIGHT = 0.05;
/** How far below the rim the bucket hangs, and how much rope brings it out. */
const DEPTH = 0.26;
const LIFT = DEPTH + 0.07;
/** Rope stretch and gear backlash taken up before anything moves, in shaft radians. */
const GIVE = 0.05;
/** Nose to tail of a size-1 horse. */
const HORSE_LENGTH = 0.17;
/** Normal walking pace of a size-1 horse. */
const PACE = 0.075;
/** Where the pawl's tip touches the ratchet, measured round the lay shaft from +X. */
const PAWL_AT = 1.736;
/** Rest angle of the sweep arm: the horse starts at the front, facing left. */
const ARM_REST = -Math.PI / 2 + 0.75;

type Phase = 'rest' | 'pull' | 'stuck' | 'done';

export class HorseWhim implements Harness {
  readonly group = new Group();
  /** Pull needed, as the size of horse that can just do it. */
  readonly need: number;

  private readonly turnstile = new Group();
  private readonly shaft = new Group();
  private readonly pawl = new Group();
  private readonly sheave = new Group();
  private readonly load: Group;
  private readonly stoneGroup = new Group();
  private readonly loadTints: Array<{ material: MeshStandardMaterial; color: number }> = [];
  private readonly wound: WoundRope;
  private readonly span = new RopeSpan(ROPE_R);
  private readonly fall = new RopeSpan(ROPE_R);
  private readonly traces = [new RopeSpan(ROPE_R * 0.7), new RopeSpan(ROPE_R * 0.7)];
  private readonly dial = new Dial(0.026, 'PULL');

  /** Upright shaft angle; the horse walks it negative. */
  private angle = 0;
  /** Where the pawl last caught, in shaft radians. */
  private caught = 0;
  private lastTooth = 0;
  private phase: Phase = 'rest';
  private phaseTime = 0;
  private effort = 0;
  private speed = 0;
  private ratio = 0;
  private size = 1;
  private harnessed = false;
  private sinceDrive = 0;
  private creakIn = 0;
  private dripIn = 0;
  private stoneFree = false;

  private readonly drumAt: Vector3;
  private readonly sheaveAt: Vector3;
  /** Where the rope from the drum first touches the sheave. */
  private readonly touch = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();

  constructor(
    private readonly floor: number,
    /** Stage-local foot of the upright shaft (y ignored). */
    private readonly center: Vector3,
    /** Stage-local centre of the well; its z is set to line up with the drum. */
    private well: Vector3,
    need: number,
  ) {
    this.need = need;
    this.group.name = 'HorseWhim';
    const f = floor;
    const c = new Vector3(center.x, f, center.z);

    // ---- Worn earth where the horse has walked a thousand laps.
    const track = new Mesh(
      new RingGeometry(WALK_R - 0.035, WALK_R + 0.035, 48, 1),
      surface('soil', 2, 2, 0x9c8a74),
    );
    track.rotation.x = -Math.PI / 2;
    // Lifted clear of the ground's little bumps.
    track.position.set(c.x, f + 0.0045, c.z);
    track.name = 'WornTrack';
    this.group.add(track);

    // ---- Frame: an A-frame at each end, legs raking fore and aft, a cap beam
    // across carrying the shaft's top bearing, and a tie halfway up each A.
    const postX = 0.22;
    const spread = 0.11;
    for (const side of [-1, 1]) {
      const x = c.x + side * postX;
      const apex = new Vector3(x, f + TOP_Y + 0.012, c.z);
      for (const end of [-1, 1]) {
        const foot = new Vector3(x, f, c.z + end * spread);
        this.group.add(beam(foot, apex, 0.014));
        const pad = new Mesh(new RingGeometry(0, 0.016, 7), stone());
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(foot.x, f + 0.002, foot.z);
        this.group.add(pad);
      }
      this.group.add(beam(new Vector3(x, f + 0.13, c.z - spread * 0.62), new Vector3(x, f + 0.13, c.z + spread * 0.62), 0.008));
      const cleat = band(0.012, 0.012);
      cleat.position.copy(apex);
      this.group.add(cleat);
    }
    this.group.add(beam(new Vector3(c.x - postX - 0.02, f + TOP_Y + 0.02, c.z), new Vector3(c.x + postX + 0.02, f + TOP_Y + 0.02, c.z), 0.02, 0.024));
    const top = bearing(0.016);
    top.position.set(c.x, f + TOP_Y, c.z);
    this.group.add(top);
    const foot = bearing(0.02);
    foot.position.set(c.x, f + 0.008, c.z);
    this.group.add(foot);

    // ---- The turning part: upright shaft, crown wheel and sweep arm.
    this.turnstile.position.copy(c);
    this.turnstile.name = 'Turnstile';
    this.turnstile.add(octShaft(TOP_Y, 0.0105));
    for (const y of [0.04, ARM_Y, 0.2, WHEEL_Y - 0.012]) {
      const b = band(0.0105);
      b.position.y = y;
      this.turnstile.add(b);
    }
    const wheel = crownWheel(COGS, 0.0105);
    wheel.position.y = WHEEL_Y;
    this.turnstile.add(wheel);
    const arm = new Group();
    arm.rotation.y = ARM_REST;
    arm.add(beam(new Vector3(0, ARM_Y, 0), new Vector3(WALK_R, ARM_Y, 0), 0.011, 0.013));
    // A raking strut stiffens the sweep against the pull.
    arm.add(beam(new Vector3(0.006, ARM_Y + 0.07, 0), new Vector3(WALK_R * 0.55, ARM_Y + 0.004, 0), 0.007));
    const tree = beam(new Vector3(WALK_R - 0.004, ARM_Y, -0.032), new Vector3(WALK_R - 0.004, ARM_Y, 0.032), 0.006);
    arm.add(tree);
    for (const side of [-1, 1]) {
      const hook = band(0.003, 0.004);
      hook.position.set(WALK_R - 0.004, ARM_Y, side * 0.03);
      arm.add(hook);
    }
    this.turnstile.add(arm);
    this.group.add(this.turnstile);

    // ---- Lay shaft: pinion, drum and ratchet, running back from the wheel.
    this.shaft.position.set(c.x, f + PINION_Y, c.z - WHEEL_R);
    this.shaft.name = 'LayShaft';
    const shaftLength = 0.3;
    const rod = octShaft(shaftLength + 0.01, 0.0065);
    rod.rotation.x = -Math.PI / 2;
    rod.position.z = 0.012;
    this.shaft.add(rod);
    const pinion = lanternPinion(STAVES, GEAR_PITCH * 1.3, 0.0065);
    // A gap between staves faces up at angle 0, where a cog sits.
    pinion.rotation.z = Math.PI / 2 + Math.PI / STAVES;
    const pinionHolder = new Group();
    pinionHolder.add(pinion);
    this.shaft.add(pinionHolder);
    const drumZ = -0.235;
    const drumLength = 0.05;
    const drum = windingDrum(DRUM_R, drumLength, 0.024);
    drum.position.z = drumZ;
    this.shaft.add(drum);
    const ratchetZ = -0.272;
    const ratchet = ratchetWheel(RATCHET_TEETH, 0.019, 0.0045, 0.005);
    ratchet.position.z = ratchetZ;
    // A tooth's foot sits under the pawl's tip at rest.
    ratchet.rotation.z = PAWL_AT;
    this.shaft.add(ratchet);
    const turns = Math.ceil(DEAD_TURNS + LIFT / (Math.PI * 2 * (DRUM_R + ROPE_R)) + 1);
    this.wound = new WoundRope(DRUM_R + ROPE_R, turns, COIL_PITCH, ROPE_R);
    this.wound.mesh.position.z = drumZ + drumLength / 2 - ROPE_R * 2;
    // Fixed to the drum, turned so the last coil leaves from the top.
    this.wound.mesh.rotation.z = Math.PI / 2 - DEAD_TURNS * Math.PI * 2;
    this.shaft.add(this.wound.mesh);
    this.group.add(this.shaft);

    // Trestles carry the lay shaft clear of the horse's path.
    for (const z of [-0.15, -0.29]) {
      const at = new Vector3(c.x, f, this.shaft.position.z + z);
      for (const side of [-1, 1]) {
        this.group.add(beam(new Vector3(at.x + side * 0.05, f, at.z), new Vector3(at.x + side * 0.008, f + PINION_Y - 0.008, at.z), 0.009));
      }
      this.group.add(beam(new Vector3(at.x - 0.032, f + PINION_Y * 0.4, at.z), new Vector3(at.x + 0.032, f + PINION_Y * 0.4, at.z), 0.007));
      const b = bearing(0.013);
      b.position.set(at.x, f + PINION_Y - 0.009, at.z);
      this.group.add(b);
    }

    // The pawl hangs from a bracket on the end trestle and rides the ratchet.
    const pawlPivot = new Vector3(c.x - 0.026, f + PINION_Y + 0.024, this.shaft.position.z + ratchetZ);
    this.group.add(beam(new Vector3(pawlPivot.x, f, pawlPivot.z - 0.008), new Vector3(pawlPivot.x, pawlPivot.y + 0.004, pawlPivot.z - 0.008), 0.006));
    this.pawl.position.copy(pawlPivot);
    const pawlBar = beam(new Vector3(0, 0, 0), new Vector3(0.023, -0.005, 0), 0.0035, 0.004);
    pawlBar.material = iron();
    this.pawl.add(pawlBar);
    const pin = band(0.0022, 0.012);
    pin.rotation.x = Math.PI / 2;
    this.pawl.add(pin);
    this.group.add(this.pawl);

    // ---- Well head, frame and sheave, in line with the middle of the drum's wind.
    this.drumAt = new Vector3(c.x, f + PINION_Y, this.shaft.position.z + this.wound.mesh.position.z);
    const ropeY = f + PINION_Y + DRUM_R + ROPE_R;
    const leaveZ = this.drumAt.z + this.wound.leaveZ((DEAD_TURNS + LIFT / (Math.PI * 2 * (DRUM_R + ROPE_R)) / 2) * Math.PI * 2);
    const w = new Vector3(well.x, f, leaveZ);
    this.well = w;
    const head = wellHead(WELL_INNER, WELL_OUTER, WELL_HEIGHT);
    head.position.copy(w);
    this.group.add(head);
    this.sheaveAt = new Vector3(w.x + SHEAVE_R, f + SHEAVE_Y, leaveZ);
    // The rope comes down from the drum at a slant: it meets the sheave at the
    // tangent point, wraps over, and leaves straight down the well.
    const dx = this.drumAt.x - this.sheaveAt.x;
    const dy = ropeY - this.sheaveAt.y;
    const meet = Math.atan2(dy, dx) + Math.acos(SHEAVE_R / Math.hypot(dx, dy));
    this.touch.set(this.sheaveAt.x + SHEAVE_R * Math.cos(meet), this.sheaveAt.y + SHEAVE_R * Math.sin(meet), leaveZ);
    const lap = new Mesh(new TorusGeometry(SHEAVE_R, ROPE_R, 5, 16, Math.PI - meet), hemp());
    lap.rotation.z = meet;
    lap.position.copy(this.sheaveAt);
    lap.userData.keep = true;
    this.group.add(lap);
    for (const side of [-1, 1]) {
      const z = this.sheaveAt.z + side * 0.058;
      this.group.add(beam(new Vector3(this.sheaveAt.x, f + WELL_HEIGHT, z), new Vector3(this.sheaveAt.x, this.sheaveAt.y + 0.03, z), 0.011));
    }
    this.group.add(beam(
      new Vector3(this.sheaveAt.x, this.sheaveAt.y + 0.036, this.sheaveAt.z - 0.07),
      new Vector3(this.sheaveAt.x, this.sheaveAt.y + 0.036, this.sheaveAt.z + 0.07),
      0.013,
    ));
    const axle = octShaft(0.118, 0.0025, iron());
    axle.rotation.x = Math.PI / 2;
    axle.position.set(this.sheaveAt.x, this.sheaveAt.y, this.sheaveAt.z - 0.059);
    this.group.add(axle);
    this.sheave.position.copy(this.sheaveAt);
    const wheelOfSheave = windingDrum(SHEAVE_R - 0.003, 0.008, SHEAVE_R + 0.002);
    this.sheave.add(wheelOfSheave);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const spoke = beam(new Vector3(-SHEAVE_R * 0.8, 0, 0), new Vector3(SHEAVE_R * 0.8, 0, 0), 0.0025);
      const holder = new Group();
      holder.add(spoke);
      holder.rotation.z = a;
      this.sheave.add(holder);
    }
    this.group.add(this.sheave);

    // ---- Bucket with water and the lantern stone.
    const pail = bucket(0.02, 0.03);
    this.load = pail.group;
    this.loadTints.push(...pail.tint);
    pail.contents.add(bucketWater(0.019));
    const gem = crystals(0.016, 5, 13, 0xff9a3a);
    gem.position.y = -0.006;
    this.stoneGroup.add(gem);
    const glow = halo(0.07, 0xffa040);
    glow.position.y = 0.01;
    this.stoneGroup.add(glow);
    pail.contents.add(this.stoneGroup);
    this.group.add(this.load);

    for (const span of [this.span, this.fall, ...this.traces]) this.group.add(span.mesh);

    // ---- A pull gauge on the left A-frame's tie, turned towards the player.
    this.dial.group.position.set(c.x - postX, f + 0.165, c.z + spread * 0.38);
    this.group.add(this.dial.group);

    this.pose();
    devInfo.whim = () => this.state;
  }

  /** Rope wound in so far, metres. */
  get lifted(): number {
    return -this.angle * RATIO * (DRUM_R + ROPE_R);
  }

  get done(): boolean {
    return this.lifted >= LIFT - 1e-4;
  }

  get state(): string {
    return `${this.phase} lift=${this.lifted.toFixed(3)} pull=${this.ratio.toFixed(2)} size=${this.size.toFixed(2)}`;
  }

  /** Your horse against the load, for the Inventor's Journal. */
  journal(): string[] {
    const strength = this.size * this.size;
    const need = this.need * this.need;
    const drumTurns = this.lifted / (DRUM_R + ROPE_R) / (Math.PI * 2);
    return [
      `Your horse: ${this.size.toFixed(2)}× size, so ${strength.toFixed(2)}× the strength`,
      `The bucket needed ${need.toFixed(2)}×: ${Math.max(0, Math.round((strength / need - 1) * 100))}% strength to spare`,
      `${(drumTurns / RATIO).toFixed(1)} laps of the horse wound the drum ${drumTurns.toFixed(1)} turns`,
    ];
  }

  /** Stage-local spot where a horse of this size is hitched, and the way it faces. */
  harnessSpot(size: number): { at: Vector3; ahead: Vector3 } {
    const a = this.horseAngle(size);
    const at = new Vector3(this.center.x + WALK_R * Math.cos(a), this.floor, this.center.z - WALK_R * Math.sin(a));
    const ahead = new Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.12).add(at);
    return { at, ahead };
  }

  /** The horse walks ahead of the sweep with its rump just clear of it. */
  private horseAngle(size: number): number {
    const lead = HORSE_LENGTH * size * 0.5 + 0.014;
    return this.angle + ARM_REST - lead / WALK_R;
  }

  drive(dt: number, size: number, pose: HarnessPose): boolean {
    this.size = size;
    this.sinceDrive = 0;
    if (!this.harnessed) {
      this.harnessed = true;
      this.setPhase(this.done ? 'done' : 'pull');
      this.effort = 0;
      this.speed = 0;
    }
    this.phaseTime += dt;
    // Pull at the sweep needed to hold the full bucket, and what this horse has.
    const strength = size * size;
    const need = this.need * this.need;

    switch (this.phase) {
      case 'pull': {
        this.effort = Math.min(1, this.effort + dt / 0.7);
        this.ratio = (strength * this.effort) / need;
        if (this.ratio >= 1) {
          // Faster the more strength it has to spare, never beyond its walk.
          const pace = PACE * Math.sqrt(size);
          const want = pace * Math.min(1, Math.max(0.3, 0.3 + 1.6 * (this.ratio - 1)));
          this.speed += (want - this.speed) * Math.min(1, dt * 2.5);
          this.angle -= (this.speed * dt) / WALK_R;
        } else {
          // Not enough: only the rope's stretch and the gears' slack give a little.
          const target = this.caught - GIVE * this.ratio;
          this.angle += (target - this.angle) * Math.min(1, dt * 4);
          this.speed = 0;
          if (this.effort >= 1 && this.phaseTime > 3.2) this.setPhase('stuck');
        }
        if (this.done) {
          this.angle = -LIFT / (RATIO * (DRUM_R + ROPE_R));
          this.setPhase('done');
        }
        break;
      }
      case 'stuck': {
        // It gives up; the load runs back until the pawl drops into a tooth.
        this.effort = Math.max(0, this.effort - dt / 0.5);
        this.ratio = (strength * this.effort) / need;
        const was = this.angle;
        this.angle += (this.caught - this.angle) * Math.min(1, dt * 12);
        if (was < this.caught - 0.004 && this.angle >= this.caught - 0.004) playClunk();
        if (this.phaseTime > 1.1) return this.unhitch();
        break;
      }
      case 'done':
        this.speed *= Math.max(0, 1 - dt * 4);
        this.effort = Math.max(0, this.effort - dt);
        this.ratio = (strength * this.effort * 0.3) / need;
        if (this.phaseTime > 1.2) return this.unhitch();
        break;
      case 'rest':
        break;
    }

    this.sound(dt);
    this.pose();
    this.horsePose(size, pose);
    return true;
  }

  private unhitch(): boolean {
    this.harnessed = false;
    this.effort = 0;
    this.speed = 0;
    this.ratio = 0;
    if (this.phase !== 'done') this.setPhase('rest');
    for (const trace of this.traces) trace.mesh.visible = false;
    return false;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Per frame, harnessed or not: the dial, drips, and letting go if the horse vanished. */
  update(dt: number): void {
    this.sinceDrive += dt;
    if (this.harnessed && this.sinceDrive > 0.25) {
      this.unhitch();
      this.angle = this.caught;
      playClunk(0.04);
    }
    this.dial.update(dt, this.ratio);
    const bucketY = this.bucketTop() - 0.051;
    if (bucketY > this.floor + 0.01 && !this.stoneFree) {
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = 0.25 + Math.random() * 0.5;
        playDrip(0.01 + Math.random() * 0.015);
      }
    }
    if (!this.harnessed) this.pose();
  }

  private sound(dt: number): void {
    // The pawl clicks over each tooth as the drum winds.
    const toothAngle = (Math.PI * 2) / RATCHET_TEETH;
    const tooth = Math.floor((-this.angle * RATIO) / toothAngle);
    if (tooth > this.lastTooth) {
      playPawl(0.02 + 0.015 * Math.min(1, 1 / Math.max(0.5, this.ratio)));
      this.caught = -(tooth * toothAngle) / RATIO;
    }
    this.lastTooth = tooth;
    // Timber groans under load.
    const working = this.phase === 'pull' && this.effort > 0.3;
    this.creakIn -= dt * (working ? 1 : 0) * (0.6 + this.speed * 12);
    if (this.creakIn <= 0) {
      this.creakIn = 0.5 + Math.random() * 0.9;
      playCreak(Math.min(1, 1 / Math.max(0.6, this.ratio)));
    }
  }

  /** Pose every part from the shaft angle. */
  private pose(): void {
    this.turnstile.rotation.y = this.angle;
    const drum = this.angle * RATIO;
    this.shaft.rotation.z = drum;
    // Wound rope: dead turns plus everything wound in; the last coil leaves at the top.
    const wrap = DEAD_TURNS * Math.PI * 2 - drum;
    this.wound.wound(wrap);
    // The pawl rides up each tooth's slope and drops off its face.
    const toothAngle = (Math.PI * 2) / RATCHET_TEETH;
    const rise = ((-drum % toothAngle) + toothAngle) % toothAngle / toothAngle;
    this.pawl.rotation.z = -0.21 + rise * 0.19;
    this.sheave.rotation.z = -this.lifted / SHEAVE_R;

    // Rope: drum top → sheave top, over, then straight down to the bucket.
    const leave = this.tmp.set(this.drumAt.x, this.drumAt.y + DRUM_R + ROPE_R, this.drumAt.z + this.wound.leaveZ(wrap));
    this.span.set(leave, this.touch);
    const drop = this.tmp.set(this.sheaveAt.x - SHEAVE_R, this.sheaveAt.y, this.sheaveAt.z);
    const top = this.bucketTop();
    const end = this.tmp2.set(this.well.x, top, this.sheaveAt.z);
    this.fall.set(end, drop);
    this.load.position.copy(end);
    // A gentle swing as it comes up.
    this.load.rotation.z = Math.sin(this.lifted * 40) * 0.04;

    // Deep in the well the bucket is lost in the dark; it brightens as it nears the light.
    const bottom = top - 0.051;
    const light = smooth(this.floor - 0.01, this.floor + 0.07, bottom);
    for (const { material, color } of this.loadTints) {
      material.color.setHex(color).multiplyScalar(0.05 + 0.95 * light);
    }
    this.load.visible = bottom > this.floor - 0.12;
    this.stoneGroup.visible = this.load.visible;
  }

  /** Height of the bucket's bail, stage-local. */
  private bucketTop(): number {
    return this.floor - DEPTH + 0.052 + this.lifted;
  }

  /** Put the harnessed horse on its circle and the traces from the sweep to its collar. */
  private horsePose(size: number, out: HarnessPose): void {
    const a = this.horseAngle(size);
    const local = this.tmp3.set(this.center.x + WALK_R * Math.cos(a), this.floor, this.center.z - WALK_R * Math.sin(a));
    const forward = this.tmp.set(Math.sin(a), 0, Math.cos(a));
    const side = this.tmp2.set(forward.z, 0, -forward.x);

    // Traces from the swingletree ends to each side of the collar.
    const arm = this.angle + ARM_REST;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const r = WALK_R - 0.004;
      const tree = new Vector3(
        this.center.x + r * Math.cos(arm) + s * 0.03 * Math.sin(arm),
        this.floor + ARM_Y,
        this.center.z - r * Math.sin(arm) + s * 0.03 * Math.cos(arm),
      );
      const collar = local.clone()
        .addScaledVector(forward, HORSE_LENGTH * size * 0.3)
        .addScaledVector(side, s * 0.017 * size)
        .setY(this.floor + 0.15 * size * 0.58);
      this.traces[i].set(tree, collar);
    }

    // The beast lives in world space.
    this.group.localToWorld(out.position.copy(local));
    const ahead = this.group.localToWorld(local.add(forward));
    ahead.sub(out.position);
    out.yaw = Math.atan2(ahead.x, ahead.z);
    out.speed = this.speed;
    out.strain = this.phase === 'pull'
      ? (this.ratio < 1 ? Math.min(1, this.effort * 1.2) : Math.min(1, 1 / this.ratio))
      : 0;
  }

  /** The lantern stone rises out of the bucket, hangs a moment, and flies to `to` (stage-local). */
  freeStone(tween: (seconds: number, fn: (k: number) => void) => void, to: Vector3, landed: () => void): void {
    this.stoneFree = true;
    const from = this.stoneGroup.getWorldPosition(new Vector3());
    this.group.worldToLocal(from);
    this.group.attach(this.stoneGroup);
    const lift = from.clone().setY(from.y + 0.12);
    let arrived = false;
    // Tweens are eased; spread the three beats over one linear run.
    tween(2.6, (e) => {
      const k = Math.min(1, e);
      if (k < 0.45) {
        this.stoneGroup.position.lerpVectors(from, lift, smooth(0, 0.45, k));
      } else if (k > 0.6) {
        const t = smooth(0.6, 1, k);
        this.stoneGroup.position.lerpVectors(lift, to, t);
        this.stoneGroup.scale.setScalar(1 + t * 0.6);
      }
      this.stoneGroup.rotation.y = k * 9;
      if (k >= 1 && !arrived) {
        arrived = true;
        this.stoneGroup.visible = false;
        landed();
      }
    });
  }

  dispose(): void {
    for (const { material } of this.loadTints) (material as Material).dispose();
  }
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Stage-local blockers for the whim: the horse circle and the well. */
export function whimFootprint(center: Vector3, well: Vector3): Array<[number, number, number]> {
  return [
    [center.x, center.z, WALK_R + 0.06],
    [well.x, well.z, WELL_OUTER + 0.02],
    [center.x, center.z - 0.3, 0.06],
  ];
}

