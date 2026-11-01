/**
 * The Arsenal level: hand signs summon a sword, a spear, a power ball or a
 * wall, and a training sentinel attacks so each one has something to do.
 *
 * Self-contained on purpose: nothing here imports from, or is imported by,
 * the shadow levels. Everything hangs under one root group under the player.
 */
import {
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { Anchor, Arsenal, WALL_HP } from './arsenal.js';
import { DebugCommand, mountDebugPanel } from './debug-panel.js';
import {
  ARM_HOLD,
  ARMED_WINDOW,
  classify,
  GestureEvent,
  GestureRecognizer,
  ITEM_HOLD,
  Item,
  isOpen,
  ITEMS,
  Reading,
  SIGN_LABELS,
} from './gestures.js';
import { HandState, JOINT_COUNT, Side, SIDES } from './hands.js';
import { MAX_HP, Opponent } from './opponent.js';
import { sfx } from './sfx.js';
import { HandSkeleton, SimHands } from './sim-hands.js';
import { WebcamHands } from './webcam-hands.js';
import { Bursts, Label, makeRing, setRing, TextPanel } from './visuals.js';

/** WebXR Hand Input batch query, missing from the bundled XRFrame types. */
interface XRHandFrame {
  fillPoses(spaces: XRSpace[], baseSpace: XRSpace, transforms: Float32Array): boolean;
}

/** Item icons float this far ahead of and below the eyes, this far apart. */
const ICON_DISTANCE = 0.55;
const ICON_DROP = 0.3;
const ICON_GAP = 0.15;
/** "Show your hands" appears after the hands are gone this long. */
const SHOW_HANDS_AFTER = 0.8;
/** A held item stays where a lost hand was last seen for this long, instead of jumping away. */
const KEEP_THROUGH_LOSS = 0.5;
/** The in-headset readout floats this far ahead, left and down from the eyes (inside a comfortable view). */
const READOUT_AHEAD = 0.8;
const READOUT_LEFT = 0.36;
const READOUT_DOWN = 0.05;
const READOUT_REFRESH = 0.2;
const HURT_TIME = 0.45;
const UP = new Vector3(0, 1, 0);

export class ArsenalLevelSystem extends createSystem({}) {
  private root!: Group;
  private hands: Record<Side, HandState> = {
    left: new HandState('left'),
    right: new HandState('right'),
  };
  private jointSpaces: Record<Side, XRJointSpace[] | null> = { left: null, right: null };
  private controllers: Record<Side, boolean> = { left: false, right: false };
  private poses = new Float32Array(JOINT_COUNT * 16);
  private recognizer = new GestureRecognizer();
  private reading: Reading = { sign: 'none', hand: null };
  private events: GestureEvent[] = [];
  private bursts!: Bursts;
  private opponent!: Opponent;
  private arsenal!: Arsenal;
  /** Stand-in hands for the test panel; real tracked hands always win. */
  private sim = new SimHands();
  /** Development only: real fingers from a webcam, ranked between tracked and simulated hands. */
  private webcam = new WebcamHands();
  private skeletons!: Record<Side, HandSkeleton>;

  private ring!: Mesh;
  private ringMaterial!: MeshBasicMaterial;
  private armedLabel!: Label;
  private handsLabel!: Label;
  private statusLabel!: Label;
  private icons!: Record<Item, Label>;
  private hurt!: Mesh;
  private hurtMaterial!: MeshBasicMaterial;
  private hurtLeft = 0;
  /** Development-only readout visible inside the headset, where the browser panel isn't. */
  private headsetReadout: TextPanel | null = null;
  private readoutOn = true;
  private readoutTimer = 0;

  private inXR = false;
  private placed = false;
  private noHandsFor = 0;
  private head = new Vector3();
  private headQuat = new Quaternion();
  private look = new Vector3();
  private forward = new Vector3(0, 0, -1);
  private right = new Vector3(1, 0, 0);
  private tmp = new Vector3();
  private tmpQuat = new Quaternion();

  init(): void {
    // This page replaces the template's floating welcome panel.
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel) panel.visible = false;

    this.root = new Group();
    this.root.name = 'ArsenalLevel';
    this.player.add(this.root);
    this.bursts = new Bursts(this.root);
    this.opponent = new Opponent(this.root, this.bursts, () => {
      this.hurtLeft = HURT_TIME;
    });
    this.arsenal = new Arsenal(this.root, this.bursts, this.opponent, this.anchorOf);
    this.skeletons = { left: new HandSkeleton(0xffd9b8), right: new HandSkeleton(0xffd9b8) };
    for (const side of SIDES) {
      this.skeletons[side].root.visible = false;
      this.root.add(this.skeletons[side].root);
    }
    this.buildHud();
    this.wireSplash();

    if (import.meta.env.DEV) {
      this.headsetReadout = new TextPanel(0.34, 15);
      this.root.add(this.headsetReadout.sprite);
      this.cleanupFuncs.push(
        mountDebugPanel({
          command: (command) => this.debug(command),
          readout: () => this.readout(),
          activePose: () => (this.sim.active ? this.sim.pose : null),
          webcam: this.webcam,
        }),
        () => this.webcam.stop(),
      );
    }
  }

  update(delta: number, time: number): void {
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(delta, 0.05);
    this.readHead();
    if (!this.placed && this.head.y > 0.3) {
      this.opponent.place(this.head, this.forward);
      this.placed = true;
    }
    this.readHands(dt, time);

    const anyHand = this.hands.left.tracked || this.hands.right.tracked;
    // Lost tracking pauses the sign timers instead of failing them.
    if (anyHand) {
      classify(this.hands.left, this.hands.right, this.forward, this.reading, this.recognizer.candidate);
      this.recognizer.update(dt, this.reading, this.events);
    } else {
      this.reading.sign = 'none';
      this.reading.hand = null;
    }
    this.handleEvents();

    this.arsenal.update(dt, this.forward, this.head);
    this.opponent.update(dt, time, this.head, (point, radius) => this.arsenal.absorb(point, radius));
    this.bursts.update(dt);
    this.updateHud(dt, anyHand);
  }

  /** Where a side's hand is: the tracked hand, else its controller, else a spot by the chest. */
  private anchorOf = (side: Side, out: Anchor): Anchor => {
    const hand = this.hands[side];
    out.hand = null;
    out.recent = null;
    if (hand.tracked || hand.lostFor < KEEP_THROUGH_LOSS) {
      out.position.copy(hand.palm);
      out.pointing.copy(hand.pointing);
      if (hand.tracked) out.hand = hand;
      else out.recent = hand;
      return out;
    }
    if (this.controllers[side]) {
      const grip = this.player.gripSpaces[side];
      grip.getWorldPosition(out.position);
      this.player.worldToLocal(out.position);
      out.pointing.set(0, 0, -1).applyQuaternion(grip.getWorldQuaternion(this.tmpQuat));
      return out;
    }
    const sign = side === 'right' ? 1 : -1;
    out.position.copy(this.head).addScaledVector(this.forward, 0.4).addScaledVector(this.right, 0.18 * sign);
    out.position.y -= 0.3;
    out.pointing.copy(this.look).addScaledVector(UP, 0.8).normalize();
    return out;
  };

  private readHead(): void {
    this.inXR = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    const viewer = this.inXR ? this.player.head : this.camera;
    viewer.getWorldPosition(this.head);
    this.player.worldToLocal(this.head);
    viewer.getWorldQuaternion(this.headQuat);
    this.look.set(0, 0, -1).applyQuaternion(this.headQuat);
    this.tmp.set(this.look.x, 0, this.look.z);
    if (this.tmp.lengthSq() > 1e-4) this.forward.copy(this.tmp.normalize());
    this.right.set(-this.forward.z, 0, this.forward.x);
  }

  private readHands(dt: number, time: number): void {
    const seen: Record<Side, boolean> = { left: false, right: false };
    this.controllers.left = false;
    this.controllers.right = false;
    const frame = this.xrFrame;
    const refSpace = this.renderer.xr.getReferenceSpace();
    if (this.inXR && frame && refSpace) {
      for (const source of frame.session.inputSources) {
        const side: Side | null =
          source.handedness === 'left' ? 'left' : source.handedness === 'right' ? 'right' : null;
        if (!side) continue;
        if (!source.hand) {
          if (source.gripSpace) this.controllers[side] = true;
          continue;
        }
        let spaces = this.jointSpaces[side];
        if (spaces === null || spaces.length !== JOINT_COUNT) {
          spaces = this.jointSpaces[side] = Array.from(source.hand.values());
        }
        if (!(frame as unknown as XRHandFrame).fillPoses(spaces, refSpace, this.poses)) continue;
        const hand = this.hands[side];
        for (let i = 0; i < JOINT_COUNT; i++) {
          hand.joints[i * 3] = this.poses[i * 16 + 12];
          hand.joints[i * 3 + 1] = this.poses[i * 16 + 13];
          hand.joints[i * 3 + 2] = this.poses[i * 16 + 14];
        }
        hand.tracked = true;
        hand.lostFor = 0;
        hand.update(time);
        seen[side] = true;
      }
    }
    // Headset-tracked hands win, then webcam hands, then simulated ones.
    let drawn = false;
    if (seen.left || seen.right) this.sim.release();
    else if (this.webcam.active) {
      this.webcam.apply(dt, time, this.head, this.forward, this.hands, seen);
      drawn = true;
    } else if (this.sim.active) {
      this.sim.apply(dt, time, this.head, this.forward, this.hands);
      seen.left = seen.right = true;
      drawn = true;
    }
    for (const side of SIDES) {
      const skeleton = this.skeletons[side];
      skeleton.root.visible = drawn && seen[side];
      if (skeleton.root.visible) skeleton.update(this.hands[side]);
      if (!seen[side]) {
        this.hands[side].lose(dt);
        this.jointSpaces[side] = null;
      }
    }
  }

  private handleEvents(): void {
    for (const event of this.events) {
      if (event.type === 'armed') {
        sfx.armed();
        this.bursts.spawn(this.ring.position, 0x9fe8ff, 0.25);
      } else if (event.type === 'fizzle') {
        sfx.fizzle();
      } else {
        this.arsenal.summon(event.item, event.hand, this.head, this.forward);
      }
    }
    this.events.length = 0;
  }

  private buildHud(): void {
    this.ring = makeRing(0.07, 0x9fe8ff);
    this.ringMaterial = this.ring.material as MeshBasicMaterial;
    this.ring.visible = false;
    this.armedLabel = new Label(0.05);
    this.armedLabel.set('Armed! Make a sign:', '#bff0ff');
    this.handsLabel = new Label(0.07);
    this.handsLabel.set('✋ Show your hands', '#ffe9b0');
    this.statusLabel = new Label(0.12);
    this.icons = {} as Record<Item, Label>;
    for (const item of ITEMS) {
      const label = new Label(0.05);
      label.set(SIGN_LABELS[item]);
      this.icons[item] = label;
      this.root.add(label.sprite);
    }
    this.hurtMaterial = new MeshBasicMaterial({
      color: 0xff2a2a,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.hurt = new Mesh(new PlaneGeometry(0.6, 0.4), this.hurtMaterial);
    this.hurt.renderOrder = 12;
    this.root.add(
      this.ring,
      this.armedLabel.sprite,
      this.handsLabel.sprite,
      this.statusLabel.sprite,
      this.hurt,
    );
  }

  private updateHud(dt: number, anyHand: boolean): void {
    const r = this.recognizer;
    const armed = r.phase === 'armed';

    // Ring: filling while arming, gold while summoning, draining while armed and waiting.
    const left = this.hands.left;
    const right = this.hands.right;
    if (left.tracked && right.tracked) this.ring.position.copy(left.palm).lerp(right.palm, 0.5);
    else if (right.tracked) this.ring.position.copy(right.palm);
    else if (left.tracked) this.ring.position.copy(left.palm);
    else this.ring.position.copy(this.head).addScaledVector(this.forward, 0.4).setY(this.head.y - 0.25);
    this.ring.quaternion.copy(this.headQuat);
    if (!armed && r.progress > 0) {
      this.ring.visible = true;
      this.ringMaterial.color.setHex(0x9fe8ff);
      setRing(this.ring, r.progress);
    } else if (armed) {
      this.ring.visible = true;
      const summoning = r.progress > 0;
      this.ringMaterial.color.setHex(summoning ? 0xffd27a : 0x5a8cc8);
      setRing(this.ring, summoning ? r.progress : r.armedLeft / ARMED_WINDOW);
    } else {
      this.ring.visible = false;
    }

    // Item menu while armed.
    const center = this.tmp.copy(this.head).addScaledVector(this.forward, ICON_DISTANCE);
    center.y = this.head.y - ICON_DROP;
    this.armedLabel.sprite.visible = armed;
    this.armedLabel.sprite.position.copy(center).setY(center.y + 0.08);
    ITEMS.forEach((item, i) => {
      const icon = this.icons[item];
      icon.sprite.visible = armed;
      icon.sprite.position.copy(center).addScaledVector(this.right, (i - (ITEMS.length - 1) / 2) * ICON_GAP);
      const active = armed && r.candidate === item;
      icon.sprite.material.opacity = active ? 1 : 0.75;
      icon.resize(active ? 0.055 : 0.042);
    });

    // "Show your hands" only matters in the headset with no controllers either.
    const handsGone = this.inXR && !anyHand && !this.controllers.left && !this.controllers.right;
    this.noHandsFor = handsGone ? this.noHandsFor + dt : 0;
    this.handsLabel.sprite.visible = this.noHandsFor > SHOW_HANDS_AFTER;
    this.handsLabel.sprite.position.copy(this.head).addScaledVector(this.look, 0.7);

    const o = this.opponent;
    this.statusLabel.set(
      o.alive ? `Sentinel ${o.hp}/${MAX_HP} · hits taken ${o.hitsTaken}` : `Defeated! (${o.defeats})`,
      o.alive ? '#ffffff' : '#ffe27a',
    );
    this.statusLabel.sprite.position.copy(o.center).setY(o.center.y + 0.7);

    const panel = this.headsetReadout;
    if (panel) {
      panel.sprite.visible = this.inXR && this.readoutOn;
      panel.sprite.position
        .copy(this.head)
        .addScaledVector(this.forward, READOUT_AHEAD)
        .addScaledVector(this.right, -READOUT_LEFT)
        .setY(this.head.y - READOUT_DOWN);
      this.readoutTimer -= dt;
      if (this.inXR && this.readoutTimer <= 0) {
        this.readoutTimer = READOUT_REFRESH;
        panel.set(this.readout());
      }
    }

    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.hurt.visible = this.hurtLeft > 0;
    this.hurtMaterial.opacity = (this.hurtLeft / HURT_TIME) * 0.2;
    this.hurt.position.copy(this.head).addScaledVector(this.look, 0.25);
    this.hurt.quaternion.copy(this.headQuat);
  }

  private wireSplash(): void {
    const splash = document.getElementById('splash');
    const button = document.getElementById('splash-play') as HTMLButtonElement | null;
    const note = document.getElementById('splash-note');
    if (!splash || !button) return;
    const noHeadset = () => {
      button.textContent = 'No headset found';
      if (note) {
        note.hidden = false;
        note.textContent = import.meta.env.DEV
          ? 'On this PC, open https://localhost:8081/yash.html to use the emulator, or open this page on your Quest.'
          : 'Open this page in the Meta Quest browser.';
      }
    };
    if (!this.world.xrEnabled || !navigator.xr) {
      noHeadset();
      return;
    }
    // A browser can have WebXR but no headset (e.g. desktop Chrome off localhost, where the emulator doesn't load).
    void navigator.xr
      .isSessionSupported('immersive-ar')
      .then((ar) => ar || navigator.xr!.isSessionSupported('immersive-vr'))
      .catch(() => false)
      .then((supported) => {
        if (!supported) noHeadset();
        else {
          button.disabled = false;
          button.textContent = 'Enter the Arsenal';
        }
      });
    const launch = () => {
      sfx.unlock();
      this.world.launchXR();
    };
    button.addEventListener('click', launch);
    this.cleanupFuncs.push(
      () => button.removeEventListener('click', launch),
      this.world.visibilityState.subscribe((state) => {
        // Put the sentinel in front of wherever the player is when the view changes.
        this.placed = false;
        if (state === VisibilityState.NonImmersive) splash.removeAttribute('data-hidden');
        else splash.setAttribute('data-hidden', '');
      }),
    );
  }

  private debug(command: DebugCommand): void {
    sfx.unlock();
    switch (command.type) {
      case 'pose':
        this.sim.setPose(command.pose);
        break;
      case 'move':
        // Webcam or headset hands: Push throws and Shoot fires directly instead of moving fake hands.
        if (!this.sim.active && this.arsenal.held && command.move === 'push') this.arsenal.throwHeld(this.look);
        else if (!this.sim.active && this.arsenal.held?.item === 'gun' && command.move === 'shoot') this.arsenal.fireGun();
        else this.sim.startMove(command.move);
        break;
      case 'recipe':
        this.recognizer.reset();
        this.sim.play([
          { pose: 'arm', seconds: ARM_HOLD },
          { pose: command.item, seconds: ITEM_HOLD },
        ]);
        break;
      case 'handsOff':
        this.sim.release();
        break;
      case 'clear':
        this.arsenal.clear();
        this.recognizer.reset();
        this.opponent.reset();
        break;
      case 'recenter':
        this.placed = false;
        break;
      case 'toggleReadout':
        this.readoutOn = !this.readoutOn;
        break;
      case 'webcam':
        if (command.cameraId) void this.webcam.start(command.cameraId);
        else if (this.webcam.on) this.webcam.stop();
        else void this.webcam.start();
        this.sim.release();
        break;
      case 'swapHands':
        this.webcam.swap = !this.webcam.swap;
        break;
    }
  }

  private readout(): string {
    const f = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2);
    const lines: string[] = [];
    const r = this.recognizer;
    lines.push(
      `view: ${this.inXR ? 'XR' : 'flat'} · hands: ${
        this.webcam.active
          ? `webcam (${this.webcam.visible()})`
          : this.sim.active
            ? `simulated (${this.sim.pose}${this.sim.move ? ', ' + this.sim.move : ''})`
            : 'headset/none'
      }`,
      `controllers L${this.controllers.left ? '✓' : '–'} R${this.controllers.right ? '✓' : '–'}`,
      `sign: ${this.reading.sign}${this.reading.hand ? ` (${this.reading.hand})` : ''}`,
      `phase: ${r.phase}${r.phase === 'armed' ? ` ${r.armedLeft.toFixed(1)}s` : ''} · hold ${Math.round(r.progress * 100)}%`,
    );
    for (const side of SIDES) {
      const h = this.hands[side];
      if (!h.tracked) {
        lines.push(`${side[0].toUpperCase()}: not tracked`);
        continue;
      }
      const fingers = Array.from(h.straight, (s) => f(s)).join('');
      lines.push(
        `${side[0].toUpperCase()}: fingers${fingers}`,
        `   palm up${f(h.normal.dot(UP))} fwd${f(h.normal.dot(this.forward))} speed ${h.velocity.length().toFixed(1)}`,
      );
    }
    const L = this.hands.left;
    const R = this.hands.right;
    if (L.tracked && R.tracked) {
      // Arm sign breakdown: each part must pass (see gestures.ts).
      this.tmp.copy(R.palm).sub(L.palm);
      const gap = this.tmp.length();
      this.tmp.divideScalar(gap || 1);
      const ok = (pass: boolean) => (pass ? '✓' : '✗');
      lines.push(
        `arm: open L${ok(isOpen(L))} R${ok(isOpen(R))} · gap ${gap.toFixed(2)}${ok(gap > 0.06 && gap < 0.45)}`,
        `     facing L${f(L.normal.dot(this.tmp))}${ok(L.normal.dot(this.tmp) > 0.4)} R${f(-R.normal.dot(this.tmp))}${ok(-R.normal.dot(this.tmp) > 0.4)} (need > 0.40)`,
      );
    }
    if (L.tracked || R.tracked) {
      const check = (h: HandState) => (h.tracked ? f(h.palmCheck()) : ' –');
      lines.push(`palm side check L${check(L)} R${check(R)} (≈+1 good, ≈−1 inside out)`);
    }
    if (this.webcam.active) {
      lines.push(`webcam: L/R ${this.webcam.swap ? 'swapped' : 'as labelled'}${this.webcam.autoSwaps ? ` (auto-fixed ${this.webcam.autoSwaps}×)` : ''}`);
    }
    const a = this.arsenal;
    lines.push(
      `held: ${a.held ? a.held.item : '–'} · flying ${a.projectiles.length} · shots ${a.shots} · wall ${a.wallLeft > 0 ? `${a.wallHp}/${WALL_HP} hp, ${a.wallLeft.toFixed(1)}s` : '–'}`,
      ...(a.held?.item === 'gun' && (L.tracked || R.tracked)
        ? [`trigger: thumb ${(this.hands[a.held.side].thumbDrop * 100).toFixed(1)} cm from fingers (fires < 3.0)`]
        : []),
      `sentinel ${this.opponent.hp}/${MAX_HP} · hits taken ${this.opponent.hitsTaken} · defeated ${this.opponent.defeats}`,
    );
    return lines.join('\n');
  }
}
