import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';

import { TEAM_NAME } from './intro.js';
import { FONT } from './ui-theme.js';

/**
 * The studio's ident, once, as the headset view opens: four small lanterns
 * light one after another over the team's name, then it all fades away. A
 * single still picture with a smooth fade (no flicker, nothing moving fast),
 * hung in front of you where you first look.
 */
const FADE_IN = 0.9;
const HOLD = 2.6;
const FADE_OUT = 0.9;
const DISTANCE = 1.3;

export class StudioIdent {
  private readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private time = -1;
  private done = false;
  private lit = -1;
  private readonly forward = new Vector3();
  private readonly turn = new Quaternion();

  constructor(parent: Object3D) {
    this.canvas.width = 1600;
    this.canvas.height = 800;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(1.0, 0.5), this.material);
    this.mesh.name = 'StudioIdent';
    this.mesh.renderOrder = 60;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.paint(0);
  }

  /** True while it is showing (the game waits behind it). */
  get showing(): boolean {
    return this.time >= 0 && !this.done;
  }

  /** Each frame: `inHeadset` once the headset view is up; the eye's world position and turn. */
  update(dt: number, inHeadset: boolean, eye: Vector3, eyeTurn: Quaternion): void {
    if (this.done || !inHeadset) return;
    if (this.time < 0) {
      // Hang it where you first look, level, at eye height.
      this.time = 0;
      this.forward.set(0, 0, -1).applyQuaternion(eyeTurn).setY(0);
      if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
      this.forward.normalize();
      this.mesh.position.copy(eye).addScaledVector(this.forward, DISTANCE);
      this.turn.setFromAxisAngle(this.forward.set(0, 1, 0), Math.atan2(eye.x - this.mesh.position.x, eye.z - this.mesh.position.z));
      this.mesh.quaternion.copy(this.turn);
      this.mesh.visible = true;
    }
    this.time += dt;
    const t = this.time;
    const opacity = t < FADE_IN ? t / FADE_IN : t < FADE_IN + HOLD ? 1 : 1 - (t - FADE_IN - HOLD) / FADE_OUT;
    const k = Math.max(0, Math.min(1, opacity));
    this.material.opacity = k * k * (3 - 2 * k);
    // The four lanterns light one by one while it holds (a few repaints in all).
    const lit = Math.max(0, Math.min(4, Math.floor((t - FADE_IN * 0.5) / 0.45) + 1));
    if (lit !== this.lit) this.paint(lit);
    if (t >= FADE_IN + HOLD + FADE_OUT) {
      this.done = true;
      this.mesh.visible = false;
      this.texture.dispose();
    }
  }

  private paint(lit: number): void {
    this.lit = lit;
    const g = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    // A soft dark oval behind, so it reads over any room.
    const back = g.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.48);
    back.addColorStop(0, 'rgba(10, 12, 26, 0.92)');
    back.addColorStop(0.7, 'rgba(10, 12, 26, 0.75)');
    back.addColorStop(1, 'rgba(10, 12, 26, 0)');
    g.fillStyle = back;
    g.fillRect(0, 0, w, h);
    // Four lanterns in a row.
    for (let i = 0; i < 4; i++) {
      const x = w / 2 + (i - 1.5) * 150;
      const y = 260;
      const on = i < lit;
      if (on) {
        const glow = g.createRadialGradient(x, y, 6, x, y, 90);
        glow.addColorStop(0, 'rgba(255, 214, 130, 0.85)');
        glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
        g.fillStyle = glow;
        g.fillRect(x - 90, y - 90, 180, 180);
      }
      g.strokeStyle = on ? '#ffd27a' : '#5d6488';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x, y - 78);
      g.lineTo(x, y - 52);
      g.stroke();
      g.fillStyle = on ? '#ffe7b0' : '#2a3050';
      g.beginPath();
      g.roundRect(x - 30, y - 52, 60, 92, 14);
      g.fill();
      g.stroke();
      g.fillStyle = on ? '#ffb347' : '#3a4166';
      g.beginPath();
      g.ellipse(x, y - 4, 12, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = on ? '#ffd27a' : '#5d6488';
      g.fillRect(x - 38, y + 40, 76, 10);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff3d6';
    g.font = `900 104px ${FONT}`;
    // Letter-spaced, like a studio's name.
    const name = TEAM_NAME.toUpperCase().split('').join(' ');
    g.fillText(name, w / 2, 470);
    g.fillStyle = '#c9b48a';
    g.font = `600 44px ${FONT}`;
    g.fillText('presents', w / 2, 560);
    this.texture.needsUpdate = true;
  }
}
