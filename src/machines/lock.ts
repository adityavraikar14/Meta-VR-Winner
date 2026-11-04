import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  CatmullRomCurve3,
} from '@iwsdk/core';
import { playClang, playClunk, playCreak, playPawl, playTink, playTinkle } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { devActions, devInfo } from '../dev-tools.js';
import { stage } from '../stage-state.js';
import { brass, hardwood, iron } from './parts.js';

/**
 * The Dragon's Gate: an old pin-tumbler lock, built as a clear teaching
 * model so every pin shows, opened the way a locksmith does it.
 *
 * Each of the four stacks is a brass key pin and a steel driver pin, pushed
 * down by a spring. The brass plug can only turn when every gap between key
 * and driver sits at the shear line, the seam between plug and housing. No
 * lock is made perfectly: the pin holes are a hair out of line, so under a
 * gentle twist only one stack binds at a time, always in the same order.
 *
 * Your left fingertip presses the tension lever: too light and nothing
 * binds, too hard and the binding pin jams. Your right fingertip lifts the
 * pins from the slot below. A free pin bounces back; the binding one is
 * stiff. Lift it slowly to the shear line and hold: it sets with a click,
 * the plug turns a hair, and the next pin binds. Push it past and it
 * oversets: ease off the lever and everything drops back to start again.
 */

const AT = new Vector3(0, 0, 0.1);
const PLUG_Y = 0.115;
const PLUG_R = 0.024;
const SHEAR = PLUG_Y + PLUG_R;
const PIN_R = 0.0055;
const PIN_X = [-0.075, -0.025, 0.025, 0.075];
/** Key pin lengths: the cuts of the long-lost key. */
const KEY_L = [0.017, 0.023, 0.014, 0.02];
const DRIVER_L = 0.018;
/** Key pins hang this far into the slot when nothing lifts them. */
const REST_Y = PLUG_Y - 0.012;
const CHAMBER_TOP = PLUG_Y + 0.082;
const MAX_LIFT = 0.034;
/** The fingertip's own thickness, from its tracked centre to the skin. */
const FINGER_R = 0.008;
/** Set when the gap sits this close to the shear line, held for a moment. */
const SET_BELOW = 0.0025;
const OVERSET_ABOVE = 0.003;
const SET_HOLD = 0.1;
/** A binding pin is stiff: it rises no faster than this, metres per second. */
const BIND_SPEED = 0.02;
/** Tension: too light below MIN, jammed above JAM. */
const TENSION_MIN = 0.2;
const TENSION_JAM = 0.85;
/** How far the lever's pad goes down at full tension. */
const TENSION_TRAVEL = 0.014;
const PAD = new Vector3(-0.19, PLUG_Y - 0.01, 0.02);
/** Released tension for this long drops every set pin. */
const RESET_AFTER = 0.35;
/** Seconds of no progress before the binding pin glows to help. */
const HINT_AFTER = 25;
/** Low-pass time constant for fingertip heights: steadies tracking jitter. */
const SMOOTH = 0.05;

type PinState = 'free' | 'set' | 'overset';

interface Stack {
  key: Mesh;
  driver: Mesh;
  spring: Mesh;
  keyMaterial: MeshStandardMaterial;
  driverMaterial: MeshStandardMaterial;
  /** How far the key pin's bottom is lifted above rest. */
  lift: number;
  state: PinState;
  /** Seconds the gap has sat in the set window. */
  inWindow: number;
}

export class PinLock {
  readonly group = new Group();
  caption = '';
  done = false;
  mistakes = 0;

  private readonly stacks: Stack[] = [];
  private readonly plug = new Group();
  private readonly lever = new Group();
  private readonly bolt: Mesh;
  private readonly gate: Group[] = [];
  private readonly needle = new Group();
  /** The order the stacks bind in: set by the lock's own small faults. */
  private readonly order: number[];
  private setCount = 0;
  private tension = 0;
  private sinceTension = 0;
  private devTension = -1;
  private readonly fingerY = PIN_X.map(() => REST_Y);
  private time = 0;
  private stuckFor = 0;
  private openTime = -1;
  private note = '';
  private noteTime = 0;
  private creakIn = 0;
  /** For the Inventor's Journal. */
  private oversets = 0;
  private tensionTime = 0;
  private sweetTime = 0;
  private readonly v = new Vector3();

  constructor(private readonly floor: number) {
    this.group.name = 'PinLock';
    const f = floor;
    this.order = [2, 0, 3, 1];

    // A wooden stand and two cheeks holding the lock up where both hands reach.
    const base = new Mesh(new BoxGeometry(0.34, 0.02, 0.1), hardwood());
    base.position.set(AT.x - 0.02, f + 0.01, AT.z);
    this.group.add(base);
    for (const x of [-0.115, 0.115]) {
      const cheek = new Mesh(new BoxGeometry(0.012, PLUG_Y - 0.03, 0.07), hardwood());
      cheek.position.set(AT.x + x, f + 0.02 + (PLUG_Y - 0.03) / 2, AT.z);
      this.group.add(cheek);
    }

    // The clear housing, edged so its shape reads, with the shear line marked in red.
    const housingGeo = new BoxGeometry(0.22, CHAMBER_TOP - PLUG_Y + 0.035, 0.05);
    const housing = new Mesh(housingGeo, new MeshStandardMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0, depthWrite: false }));
    housing.position.set(AT.x, f + (PLUG_Y - 0.035 + CHAMBER_TOP) / 2, AT.z);
    housing.renderOrder = 5;
    housing.userData.keep = true;
    this.group.add(housing);
    const edges = new LineSegments(new EdgesGeometry(housingGeo), new LineBasicMaterial({ color: 0xa8d0f0, transparent: true, opacity: 0.7 }));
    edges.position.copy(housing.position);
    this.group.add(edges);
    const shear = new Mesh(new BoxGeometry(0.222, 0.0011, 0.001), new MeshBasicMaterial({ color: 0xe8402a }));
    shear.position.set(AT.x, f + SHEAR, AT.z + 0.0256);
    this.group.add(shear);
    const shearLabel = labelPlane('shear line', '#e8402a', 0.012);
    shearLabel.position.set(AT.x + 0.136, f + SHEAR, AT.z + 0.026);
    this.group.add(shearLabel);

    // The brass plug, its keyway slot facing you, and the pin chambers' numbers.
    // Cut away down the middle, as teaching locks are, so the pins inside show.
    const plug = new Mesh(new CylinderGeometry(PLUG_R, PLUG_R, 0.23, 28, 1, false, Math.PI / 2, Math.PI), brass());
    plug.rotation.z = Math.PI / 2;
    this.plug.add(plug);
    const face = new Mesh(new PlaneGeometry(0.23, PLUG_R * 2), new MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.7, roughness: 0.45 }));
    face.position.z = -0.001;
    this.plug.add(face);
    const slot = new Mesh(new PlaneGeometry(0.23, 0.016), new MeshStandardMaterial({ color: 0x1a120a, roughness: 0.9 }));
    slot.position.set(0, -0.012, -0.0005);
    this.plug.add(slot);
    this.plug.position.set(AT.x, f + PLUG_Y, AT.z);
    this.plug.userData.keep = true;
    this.group.add(this.plug);
    PIN_X.forEach((x, i) => {
      const number = labelPlane(String(i + 1), '#3a2a14', 0.016);
      number.position.set(AT.x + x, f + CHAMBER_TOP + 0.012, AT.z + 0.0256);
      this.group.add(number);
    });

    // The pin stacks: brass key pins, steel drivers, springs.
    const steel = () => new MeshStandardMaterial({ color: 0xdfe4ec, metalness: 0.75, roughness: 0.25, emissive: new Color(0x000000) });
    PIN_X.forEach((x, i) => {
      const keyMaterial = brass().clone();
      keyMaterial.emissive = new Color(0x000000);
      const key = new Mesh(new CylinderGeometry(PIN_R, PIN_R, KEY_L[i], 16), keyMaterial);
      // Key pins have rounded, pointed tips where the key's cuts would ride.
      const tip = new Mesh(new CylinderGeometry(PIN_R, PIN_R * 0.3, 0.004, 16), keyMaterial);
      tip.position.y = -KEY_L[i] / 2 - 0.002;
      key.add(tip);
      const driverMaterial = steel();
      const driver = new Mesh(new CylinderGeometry(PIN_R, PIN_R, DRIVER_L, 16), driverMaterial);
      const spring = new Mesh(helix(PIN_R * 0.85, 1, 9), new MeshStandardMaterial({ color: 0x9aa2ae, metalness: 0.8, roughness: 0.35 }));
      for (const m of [key, driver, spring]) {
        m.position.x = AT.x + x;
        m.position.z = AT.z;
        m.userData.keep = true;
        this.group.add(m);
      }
      this.stacks.push({ key, driver, spring, keyMaterial, driverMaterial, lift: 0, state: 'free', inWindow: 0 });
    });

    // The tension lever: an L of steel from the keyway's end, a round pad to press.
    const arm = new Mesh(new BoxGeometry(0.075, 0.004, 0.008), iron());
    arm.position.set(-0.035, 0, 0);
    this.lever.add(arm);
    const pad = new Mesh(new CylinderGeometry(0.014, 0.014, 0.005, 20), new MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.6, metalness: 0.4 }));
    pad.position.set(-0.07, 0.003, 0);
    this.lever.add(pad);
    this.lever.position.set(AT.x - 0.12, f + PAD.y, AT.z + PAD.z);
    this.lever.userData.keep = true;
    this.group.add(this.lever);

    // A tension gauge above the lever: grey too light, green just right, red jammed.
    const gauge = new Mesh(new PlaneGeometry(0.07, 0.07), new MeshBasicMaterial({ map: gaugeFace(), transparent: true }));
    gauge.position.set(AT.x - 0.19, f + PLUG_Y + 0.07, AT.z + 0.02);
    this.group.add(gauge);
    const pointer = new Mesh(new BoxGeometry(0.0025, 0.026, 0.001), new MeshBasicMaterial({ color: 0x1a120a }));
    pointer.position.y = 0.013;
    this.needle.add(pointer);
    this.needle.position.set(gauge.position.x, gauge.position.y - 0.008, gauge.position.z + 0.001);
    this.needle.userData.keep = true;
    this.group.add(this.needle);

    // The bolt the plug's cam throws, and the iron gate it holds shut.
    this.bolt = new Mesh(new BoxGeometry(0.06, 0.012, 0.012), iron());
    this.bolt.position.set(AT.x + 0.14, f + PLUG_Y, AT.z - 0.02);
    this.bolt.userData.keep = true;
    this.group.add(this.bolt);
    for (const side of [-1, 1]) {
      const leaf = new Group();
      for (let b = 0; b < 5; b++) {
        const bar = new Mesh(new CylinderGeometry(0.004, 0.004, 0.26, 8), iron());
        bar.position.set(side * (0.03 + b * 0.04), 0.13, 0);
        leaf.add(bar);
        const spike = new Mesh(new CylinderGeometry(0, 0.007, 0.02, 8), iron());
        spike.position.set(side * (0.03 + b * 0.04), 0.27, 0);
        leaf.add(spike);
      }
      for (const y of [0.05, 0.2]) {
        const rail = new Mesh(new BoxGeometry(0.19, 0.008, 0.008), iron());
        rail.position.set(side * 0.11, y, 0);
        leaf.add(rail);
      }
      leaf.position.set(AT.x + side * 0.21, f, AT.z - 0.24);
      leaf.userData.keep = true;
      this.gate.push(leaf);
      this.group.add(leaf);
    }
    this.layout();

    devInfo.lock = () => this.state;
    devActions['['] = () => {
      this.devTension = this.devTension > 0 ? -1 : 0.5;
    };
    devActions[']'] = () => this.devSet();
    devActions[';'] = () => this.devOverset();
    devActions["'"] = () => {
      this.devTension = 0;
    };
  }

  get state(): string {
    return `tension=${this.tension.toFixed(2)} set=${this.setCount}/4 binding=${this.binding() + 1} pins=${this.stacks.map((s) => `${s.state[0]}${(s.lift * 1000).toFixed(0)}`).join(',')} oversets=${this.oversets} open=${this.openTime >= 0}`;
  }

  /** Your lockpicking, for the Inventor's Journal. */
  journal(): string[] {
    const sweet = this.tensionTime > 0 ? Math.round((this.sweetTime / this.tensionTime) * 100) : 0;
    return [
      `The pins bound in the order ${this.order.map((i) => i + 1).join(' → ')}`,
      `Your tension sat in the sweet spot ${sweet}% of the time`,
      this.oversets ? `${this.oversets} overset${this.oversets > 1 ? 's' : ''}: lifted past the shear line` : 'Not one overset: a locksmith’s touch',
    ];
  }

  /** The stack that binds now, or -1 when all are set. */
  private binding(): number {
    return this.setCount < this.order.length ? this.order[this.setCount] : -1;
  }

  // ================================================================ Update

  update(dt: number, hands: readonly HandState[]): void {
    if (!stage.playing) hands = [];
    this.time += dt;
    this.noteTime -= dt;
    if (this.openTime >= 0) {
      this.open(dt);
      return;
    }
    const pressing = this.readTension(dt, hands);
    this.readFingers(dt, hands, pressing);
    this.movePins(dt);
    this.layout();
    this.caption = this.noteTime > 0 ? this.note : this.prompt();
  }

  /** Tension from the fingertip pressing the lever's pad down. Returns that hand (or -1). */
  private readTension(dt: number, hands: readonly HandState[]): number {
    let want = 0;
    let pressing = -1;
    hands.forEach((hand, h) => {
      if (!hand.tracked) return;
      const tip = this.group.worldToLocal(this.v.copy(hand.indexTip));
      const padX = AT.x - 0.19;
      if (Math.abs(tip.x - padX) > 0.03 || Math.abs(tip.z - (AT.z + PAD.z)) > 0.035) return;
      const padTop = this.floor + PAD.y + 0.006;
      const depth = padTop - (tip.y - FINGER_R);
      if (depth < -0.01) return;
      pressing = h;
      want = Math.max(want, Math.min(1.3, Math.max(0, depth / TENSION_TRAVEL)));
    });
    if (this.devTension >= 0) want = this.devTension;
    this.tension += (want - this.tension) * Math.min(1, dt / SMOOTH);
    if (this.tension > 0.05) {
      this.tensionTime += dt;
      if (this.tension >= TENSION_MIN && this.tension <= TENSION_JAM) this.sweetTime += dt;
    }
    // Let go of the lever and the plug springs back: every set pin drops.
    this.sinceTension = this.tension < TENSION_MIN * 0.6 ? this.sinceTension + dt : 0;
    if (this.sinceTension > RESET_AFTER && this.stacks.some((s) => s.state !== 'free')) this.reset();
    return pressing;
  }

  /** The picking fingertip's height under each pin, low-passed against tracking jitter. */
  private readFingers(dt: number, hands: readonly HandState[], pressing: number): void {
    const want = this.stacks.map(() => REST_Y);
    hands.forEach((hand, h) => {
      if (!hand.tracked || h === pressing) return;
      const tip = this.group.worldToLocal(this.v.copy(hand.indexTip));
      if (tip.z < AT.z - 0.02 || tip.z > AT.z + 0.06) return;
      const y = tip.y - this.floor + FINGER_R;
      if (y < PLUG_Y - 0.04 || y > SHEAR + 0.02) return;
      PIN_X.forEach((x, i) => {
        if (Math.abs(tip.x - (AT.x + x)) < 0.012) want[i] = Math.max(want[i], y);
      });
    });
    const k = Math.min(1, dt / SMOOTH);
    want.forEach((y, i) => {
      // Rising follows smoothly; dropping away (finger gone) is immediate.
      this.fingerY[i] = y <= REST_Y ? REST_Y : this.fingerY[i] + (y - this.fingerY[i]) * k;
    });
  }

  private movePins(dt: number): void {
    const binding = this.binding();
    const bound = this.tension >= TENSION_MIN;
    let progress = false;
    this.stacks.forEach((s, i) => {
      const target = Math.min(MAX_LIFT, Math.max(0, this.fingerY[i] - REST_Y));
      if (s.state === 'overset') return;
      if (s.state === 'set') {
        // Its driver rests on the plug's ledge; the key pin below moves freely.
        s.lift = target;
        return;
      }
      if (i === binding && bound) {
        if (this.tension > TENSION_JAM) return;
        // Pinched at the shear line: stiff going up, slow to fall.
        const step = target > s.lift ? Math.min(target - s.lift, BIND_SPEED * dt) : Math.max(target - s.lift, -0.08 * dt);
        s.lift += step;
        if (step > 0.0001) {
          this.creakIn -= dt;
          if (this.creakIn <= 0) {
            this.creakIn = 0.25;
            playCreak(0.15);
          }
        }
        const gap = REST_Y + KEY_L[i] + s.lift;
        if (gap > SHEAR + OVERSET_ABOVE) {
          s.state = 'overset';
          this.oversets++;
          this.mistakes++;
          playClang(0.25, 0.05);
          this.flash('Overset! The key pin went past the shear line. Ease off the lever to start again', 3);
          return;
        }
        s.inWindow = gap >= SHEAR - SET_BELOW ? s.inWindow + dt : 0;
        if (s.inWindow >= SET_HOLD) {
          s.state = 'set';
          this.setCount++;
          progress = true;
          playTink(0.07);
          playPawl(0.05);
          this.flash(this.setCount < 4 ? `Click! Pin ${i + 1} is set: ${this.setCount} of 4. Find the next stiff one` : 'Click! The last pin is set…', 2);
          if (this.setCount === 4) this.openTime = 0;
        }
        return;
      }
      // A free pin rides your finger and springs straight back.
      s.lift = target;
    });
    this.stuckFor = progress ? 0 : this.stuckFor + dt;
  }

  private reset(): void {
    for (const s of this.stacks) {
      s.state = 'free';
      s.lift = 0;
      s.inWindow = 0;
    }
    this.setCount = 0;
    this.devTension = -1;
    for (let i = 0; i < 4; i++) setTimeout(() => playTink(0.02), i * 60);
    this.flash('The plug springs back and every pin drops. Press the lever gently and start again', 2.5);
  }

  /** Pins, springs, plug and lever where the state puts them. */
  private layout(): void {
    const f = this.floor;
    const binding = this.binding();
    const hint = this.stuckFor > HINT_AFTER ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0.25;
    this.stacks.forEach((s, i) => {
      const keyBottom = REST_Y + s.lift;
      s.key.position.y = f + keyBottom + KEY_L[i] / 2;
      const driverBottom = s.state === 'set' ? SHEAR + 0.0004 : s.state === 'overset' ? keyBottom + KEY_L[i] : keyBottom + KEY_L[i];
      s.driver.position.y = f + driverBottom + DRIVER_L / 2;
      const springBottom = driverBottom + DRIVER_L;
      const length = Math.max(0.006, CHAMBER_TOP - springBottom);
      s.spring.position.y = f + springBottom;
      s.spring.scale.y = length;
      // Set: a green glow on the driver. Binding: amber on the key pin, brighter when you need a hint.
      s.driverMaterial.emissive.setHex(s.state === 'set' ? 0x2a8a3a : 0x000000);
      const amber = i === binding && this.tension >= TENSION_MIN ? hint : 0;
      s.keyMaterial.emissive.setRGB(s.state === 'overset' ? 0.6 : amber * 0.6, s.state === 'overset' ? 0.05 : amber * 0.35, 0);
    });
    // The plug turns a hair with each set pin; the lever dips with your tension.
    this.plug.rotation.x = -this.setCount * 0.025;
    this.lever.rotation.z = Math.min(1.2, this.tension) * 0.14;
    this.needle.rotation.z = Math.PI * 0.75 - Math.min(1.3, this.tension) / 1.3 * Math.PI * 1.5;
  }

  /** All four set: the plug turns, the cam throws the bolt, the gate swings open. */
  private open(dt: number): void {
    const t0 = this.openTime;
    this.openTime += dt;
    const t = this.openTime;
    const turn = Math.min(1, t / 1.2);
    this.plug.rotation.x = -0.1 - turn * Math.PI / 2;
    this.lever.rotation.x = -turn * Math.PI / 2;
    this.bolt.position.x = AT.x + 0.14 - Math.min(1, Math.max(0, (t - 0.8) / 0.6)) * 0.05;
    if (t0 < 0.8 && t >= 0.8) playClunk(0.08);
    const swing = Math.min(1, Math.max(0, (t - 1.4) / 1.6));
    this.gate[0].rotation.y = swing * 1.3;
    this.gate[1].rotation.y = -swing * 1.3;
    if (t0 < 1.4 && t >= 1.4) playTinkle();
    this.caption = 'The plug turns! The bolt slides back and the Dragon’s Gate swings open.';
    if (t > 3.6) this.done = true;
  }

  private prompt(): string {
    const binding = this.binding();
    if (this.stacks.some((s) => s.state === 'overset')) return 'A pin is overset: lift your finger off the lever to reset the lock';
    if (this.tension < TENSION_MIN) {
      return this.setCount > 0 ? 'Keep a little pressure on the lever, or the set pins will drop!' : 'Press the round lever pad down gently with your left fingertip';
    }
    if (this.tension > TENSION_JAM) return 'Too hard! The binding pin is jammed solid. Ease off the lever a little';
    const lifting = this.stacks.some((s) => s.lift > 0.003);
    const stiff = binding >= 0 && this.stacks[binding].lift > 0.003;
    if (stiff) return `Pin ${binding + 1} is binding: it is stiff. Lift it slowly to the red shear line and hold`;
    if (lifting) return 'That pin springs back freely: it is not binding. Try the others';
    if (this.stuckFor > HINT_AFTER) return `Good tension. The glowing pin is the one binding: lift it from below`;
    return 'Good tension! Now lift each pin from the slot below with your right fingertip: find the stiff one';
  }

  private flash(text: string, seconds: number): void {
    this.note = text;
    this.noteTime = seconds;
  }

  // =================================================================== Dev

  /** Dev: the binding pin goes straight to the shear line and sets. */
  private devSet(): void {
    const i = this.binding();
    if (i < 0) return;
    if (this.devTension < 0) this.devTension = 0.5;
    this.tension = 0.5;
    const s = this.stacks[i];
    s.lift = SHEAR - REST_Y - KEY_L[i];
    s.inWindow = SET_HOLD;
    s.state = 'set';
    this.setCount++;
    playTink(0.07);
    if (this.setCount === 4) this.openTime = 0;
  }

  private devOverset(): void {
    const i = this.binding();
    if (i < 0) return;
    const s = this.stacks[i];
    s.lift = SHEAR - REST_Y - KEY_L[i] + 0.005;
    s.state = 'overset';
    this.oversets++;
    this.mistakes++;
    playClang(0.25, 0.05);
  }
}

/** A coil spring one unit tall (scaled to its gap), as a thin steel tube. */
function helix(radius: number, height: number, turns: number): TubeGeometry {
  const points: Vector3[] = [];
  const n = turns * 12;
  for (let i = 0; i <= n; i++) {
    const a = (i / 12) * Math.PI * 2;
    points.push(new Vector3(Math.cos(a) * radius, (i / n) * height, Math.sin(a) * radius));
  }
  return new TubeGeometry(new CatmullRomCurve3(points), n * 2, 0.0007, 5, false);
}

function labelPlane(text: string, color: string, height: number): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.font = 'italic 600 40px Georgia, serif';
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new Mesh(new PlaneGeometry(height * 4, height), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
}

/** The tension gauge's card: grey too light, green the sweet spot, red jammed. */
function gaugeFace(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#efe6d2';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8a6a3a';
  g.lineWidth = 6;
  g.stroke();
  const cx = 128;
  const cy = 156;
  // The needle sweeps from -135° (none) to +135° (full) about straight up.
  const at = (k: number) => -Math.PI / 2 - Math.PI * 0.75 + (k / 1.3) * Math.PI * 1.5;
  const band = (from: number, to: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = 22;
    g.beginPath();
    g.arc(cx, cy, 84, at(from), at(to));
    g.stroke();
  };
  band(0, TENSION_MIN, '#9a9490');
  band(TENSION_MIN, TENSION_JAM, '#3f8d44');
  band(TENSION_JAM, 1.3, '#c0392b');
  g.fillStyle = '#2b2118';
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('TENSION', cx, 226);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

