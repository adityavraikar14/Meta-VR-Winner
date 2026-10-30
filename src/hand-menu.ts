import {
  CanvasTexture,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { playClick, playMenuOpen } from './audio.js';
import { devInfo } from './dev-tools.js';
import { createExtension, readExtension } from './hand-pose.js';
import { type MenuCommand, stage } from './stage-state.js';

const WRIST = 0;
const INDEX_KNUCKLE = 6;
const MIDDLE_KNUCKLE = 11;
const PINKY_KNUCKLE = 21;
const INDEX_TIP = 9;

/** Palm must face the eyes this squarely (cosine) to count as "looking at it". */
const FACING = 0.7;
const OPEN_HOLD = 0.35;
const CLOSE_DELAY = 0.6;
/** Menu floats this far above the palm, nudged towards the eyes. */
const ABOVE_PALM = 0.13;
const TOWARDS_EYES = 0.03;

const BUTTON_GAP = 0.062;
const BUTTON_RADIUS = 0.024;
const BUTTON_WIDTH = 0.054;
const BUTTON_HEIGHT = (BUTTON_WIDTH * 170) / 128;
/** Circle centre sits this far above the middle of the button card. */
const CIRCLE_OFFSET = ((85 - 64) / 170) * BUTTON_HEIGHT;
/** A fingertip this close behind the button face presses it. */
const PRESS_DEPTH = 0.008;
const HOVER_DEPTH = 0.05;
const REARM_DEPTH = 0.02;

const BUTTONS: Array<{ command: MenuCommand; label: string }> = [
  { command: 'recenter', label: 'Recenter' },
  { command: 'restart', label: 'Restart' },
  { command: 'skip', label: 'Skip' },
];

interface Button {
  command: MenuCommand;
  mesh: Mesh;
  material: MeshBasicMaterial;
  x: number;
}

/**
 * Look at your palm to open a small menu above it; poke a button with the
 * other hand's index finger. Recenter moves the paper in front of you,
 * Restart replays the level, Skip moves on.
 */
export class HandMenuSystem extends createSystem({}) {
  private root = new Group();
  private buttons: Button[] = [];
  /** Hand holding the menu, or -1 when closed. */
  private owner = -1;
  private holdTime = [0, 0];
  private awayTime = 0;
  private appear = 0;
  private armed = false;
  private closing = 0;
  /** After a press, the palm must turn away before the menu can open again. */
  private spent = false;

  private extension = createExtension();
  private palm = new Vector3();
  private normal = new Vector3();
  private head = new Vector3();
  private toHead = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private tip = new Vector3();
  private goal = new Vector3();

  init(): void {
    this.root.name = 'HandMenu';
    this.root.visible = false;
    BUTTONS.forEach(({ command, label }, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 170;
      drawButton(canvas, command, label);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const mesh = new Mesh(new PlaneGeometry(BUTTON_WIDTH, BUTTON_HEIGHT), material);
      mesh.renderOrder = 10;
      const x = (i - (BUTTONS.length - 1) / 2) * BUTTON_GAP;
      mesh.position.set(x, -CIRCLE_OFFSET, 0);
      this.root.add(mesh);
      this.buttons.push({ command, mesh, material, x });
    });
    this.player.add(this.root);

    devInfo.menu = () => ({
      owner: this.owner,
      tip: this.tip.toArray().map((n) => Number(n.toFixed(3))),
      facing: [0, 1].map((hand) => {
        if (!stage.tracked[hand]) return null;
        this.palmOf(hand);
        this.toHead.subVectors(this.head, this.palm);
        const d = this.toHead.length();
        return [Number(this.normal.dot(this.toHead.divideScalar(d)).toFixed(2)), Number(d.toFixed(2))];
      }),
    });
  }

  update(delta: number): void {
    if (this.visibilityState.peek() !== VisibilityState.Visible) {
      this.owner = -1;
      stage.menuOpen = false;
      this.root.visible = false;
      return;
    }
    const dt = Math.min(delta, 0.1);
    this.player.head.getWorldPosition(this.head);
    this.player.worldToLocal(this.head);

    const facing = [this.facesEyes(0), this.facesEyes(1)];
    for (let i = 0; i < 2; i++) {
      // Both palms up together is part of a two-hand shape, not a menu request.
      const asking = facing[i] && !facing[1 - i];
      this.holdTime[i] = asking ? this.holdTime[i] + dt : 0;
    }

    if (this.spent && !facing[0] && !facing[1]) this.spent = false;
    if (this.owner < 0) {
      const hand = this.spent ? -1 : this.holdTime.findIndex((t) => t >= OPEN_HOLD);
      if (hand >= 0) this.open(hand);
    } else {
      this.awayTime = facing[this.owner] ? 0 : this.awayTime + dt;
      if (this.closing > 0) {
        this.closing -= dt;
        if (this.closing <= 0) this.owner = -1;
      } else if (this.awayTime > CLOSE_DELAY) {
        this.owner = -1;
      }
    }

    stage.menuOpen = this.owner >= 0;
    if (!this.animate(dt) || this.owner < 0) return;
    this.place(dt);
    this.poke(dt);
  }

  /** Grows in while open and shrinks away when closed; false once hidden. */
  private animate(dt: number): boolean {
    const target = this.owner >= 0 ? 1 : 0;
    this.appear += (target - this.appear) * Math.min(1, dt * 12);
    this.root.visible = this.appear > 0.02;
    if (!this.root.visible) return false;
    this.root.scale.setScalar(0.6 + 0.4 * this.appear);
    for (const button of this.buttons) button.material.opacity = this.appear;
    return true;
  }

  private open(hand: number): void {
    this.owner = hand;
    this.awayTime = 0;
    this.closing = 0;
    this.armed = false;
    this.holdTime.fill(0);
    this.placeGoal();
    this.root.position.copy(this.goal);
    playMenuOpen();
  }

  /** Whether this hand is open with its palm turned towards the eyes. */
  private facesEyes(hand: number): boolean {
    if (!stage.tracked[hand]) return false;
    const joints = stage.joints[hand];
    const ext = readExtension(joints, this.extension);
    if (ext.index < 0.55 || ext.middle < 0.55 || ext.ring < 0.55) return false;
    this.palmOf(hand);
    this.toHead.subVectors(this.head, this.palm);
    const distance = this.toHead.length();
    if (distance > 0.65) return false;
    return this.normal.dot(this.toHead.divideScalar(distance)) > FACING;
  }

  /** Palm centre and the unit vector out of the palm, in player space. */
  private palmOf(hand: number): void {
    const j = stage.joints[hand];
    const read = (index: number, out: Vector3) => out.set(j[index * 3], j[index * 3 + 1], j[index * 3 + 2]);
    read(WRIST, this.palm);
    read(INDEX_KNUCKLE, this.a).sub(this.palm);
    read(PINKY_KNUCKLE, this.b).sub(this.palm);
    // Points out of the palm for a right hand; flip for the left.
    this.normal.crossVectors(this.a, this.b).normalize();
    if (hand === 0) this.normal.negate();
    read(MIDDLE_KNUCKLE, this.a);
    this.palm.add(this.a).multiplyScalar(0.5);
  }

  private placeGoal(): void {
    this.palmOf(this.owner);
    this.toHead.subVectors(this.head, this.palm).normalize();
    this.goal.copy(this.palm).addScaledVector(this.toHead, TOWARDS_EYES);
    this.goal.y += ABOVE_PALM;
  }

  /** Follows the hand smoothly and turns to face the eyes. */
  private place(dt: number): void {
    if (this.closing <= 0) this.placeGoal();
    this.root.position.lerp(this.goal, Math.min(1, dt * 14));
    this.a.copy(this.head);
    this.a.y = this.root.position.y;
    this.root.lookAt(this.player.localToWorld(this.a));
  }

  /** The other hand's index fingertip presses a button by pushing through it. */
  private poke(dt: number): void {
    const other = 1 - this.owner;
    let hovered = -1;
    let depth = Infinity;
    if (stage.tracked[other] && this.closing <= 0) {
      this.root.updateMatrixWorld();
      const j = stage.joints[other];
      this.tip.set(j[INDEX_TIP * 3], j[INDEX_TIP * 3 + 1], j[INDEX_TIP * 3 + 2]);
      this.root.worldToLocal(this.player.localToWorld(this.tip));
      depth = this.tip.z;
      this.buttons.forEach((button, i) => {
        const dx = this.tip.x - button.x;
        if (Math.abs(dx) < BUTTON_GAP / 2 && Math.abs(this.tip.y) < BUTTON_RADIUS * 1.4) hovered = i;
      });
    }
    if (hovered < 0 || depth > REARM_DEPTH) this.armed = true;
    // The menu stays put while a finger is near it, so pressing cannot close it.
    if (hovered >= 0 && depth < HOVER_DEPTH) this.awayTime = 0;

    this.buttons.forEach((button, i) => {
      const near = i === hovered && depth < HOVER_DEPTH;
      const pushed = near && depth < PRESS_DEPTH;
      const s = pushed ? 0.88 : near ? 1.12 : 1;
      const k = Math.min(1, dt * 18);
      button.mesh.scale.setScalar(button.mesh.scale.x + (s - button.mesh.scale.x) * k);
      button.mesh.position.z = pushed ? -0.004 : 0;
    });

    if (hovered >= 0 && depth < PRESS_DEPTH && this.armed) {
      this.armed = false;
      stage.command = this.buttons[hovered].command;
      playClick();
      this.closing = 0.35;
      this.spent = true;
    }
  }
}

/** A round wooden button with a cream icon and a label underneath. */
function drawButton(canvas: HTMLCanvasElement, command: MenuCommand, label: string): void {
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3b2414';
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffc34d';
  ctx.stroke();

  ctx.strokeStyle = '#ffe2a8';
  ctx.fillStyle = '#ffe2a8';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (command) {
    case 'recenter':
      // A target: ring with four ticks.
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(cx + dx * 27, cy + dy * 27);
        ctx.lineTo(cx + dx * 37, cy + dy * 37);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'restart': {
      // A circular arrow.
      ctx.arc(cx, cy, 24, -Math.PI * 0.35, Math.PI * 1.45);
      ctx.stroke();
      const ax = cx + Math.cos(-Math.PI * 0.35) * 24;
      const ay = cy + Math.sin(-Math.PI * 0.35) * 24;
      ctx.beginPath();
      ctx.moveTo(ax + 14, ay - 2);
      ctx.lineTo(ax - 4, ay - 14);
      ctx.lineTo(ax - 3, ay + 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'skip':
      // Two triangles and a bar.
      ctx.moveTo(cx - 26, cy - 18);
      ctx.lineTo(cx - 6, cy);
      ctx.lineTo(cx - 26, cy + 18);
      ctx.closePath();
      ctx.moveTo(cx - 6, cy - 18);
      ctx.lineTo(cx + 14, cy);
      ctx.lineTo(cx - 6, cy + 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx + 17, cy - 18, 7, 36);
      break;
  }

  ctx.fillStyle = 'rgba(40, 22, 10, 0.85)';
  ctx.beginPath();
  ctx.roundRect(4, 128, 120, 38, 14);
  ctx.fill();
  ctx.fillStyle = '#ffe2a8';
  ctx.font = '700 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, 148, 112);
}
