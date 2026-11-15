import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FONT } from '../ui-theme.js';

/**
 * Your health in a boss fight: a bar with your life as a number, green when
 * you are well, amber, then red and pulsing when you are nearly done. It
 * drains smoothly on a hit and refills on a heal. Drawn on its own small
 * canvas, redrawn only when what it shows changes.
 */
export class LifeBar {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown = -1;
  private key = '';
  private time = 0;

  constructor(parent: Object3D, private readonly max: number, width = 0.26) {
    this.canvas.width = 512;
    this.canvas.height = 72;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(width, (width * 72) / 512),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.mesh.name = 'LifeBar';
    this.mesh.renderOrder = 9;
    parent.add(this.mesh);
  }

  /** Every frame: `life` is your health now (0 … max). */
  update(life: number, dt: number): void {
    this.time += dt;
    const target = Math.max(0, Math.min(this.max, life));
    if (this.shown < 0) this.shown = target;
    this.shown += (target - this.shown) * Math.min(1, dt * 7);
    if (Math.abs(target - this.shown) < 0.05) this.shown = target;
    // Nearly done: it pulses red.
    const pulse = this.shown / this.max < 0.3 && Math.floor(this.time * 3) % 2 === 0;
    const key = `${Math.round(this.shown * 2)}|${Math.ceil(target)}|${pulse}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(target, pulse);
  }

  private draw(target: number, pulse: boolean): void {
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    // The frame.
    g.fillStyle = 'rgba(14, 18, 34, 0.88)';
    g.beginPath();
    g.roundRect(2, 2, W - 4, H - 4, 20);
    g.fill();
    g.strokeStyle = '#ffd23a';
    g.lineWidth = 3;
    g.stroke();
    // YOU, on the left.
    g.font = `900 30px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText('YOU', 18, H / 2 + 1);
    // The bar.
    const x0 = 92;
    const x1 = W - 120;
    const k = this.shown / this.max;
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.roundRect(x0, 16, x1 - x0, H - 32, 10);
    g.fill();
    const colour = k > 0.55 ? '#3ee08a' : k > 0.3 ? '#ffc93a' : pulse ? '#ff8a7a' : '#ff4a3a';
    // What a hit just took shows white for a moment as the bar drains to it.
    if (k > target / this.max + 0.002) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect(x0, 16, Math.max(20, (x1 - x0) * k), H - 32, 10);
      g.fill();
    }
    const now = Math.min(k, target / this.max);
    if (now > 0.001) {
      g.fillStyle = colour;
      g.beginPath();
      g.roundRect(x0, 16, Math.max(20, (x1 - x0) * now), H - 32, 10);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x0 + 8, 20, Math.max(0, (x1 - x0) * now - 16), 6);
    }
    // The number.
    g.font = `900 30px ${FONT}`;
    g.textAlign = 'right';
    g.fillStyle = colour;
    g.fillText(`${Math.ceil(target)}`, W - 18, H / 2 + 1);
    g.textAlign = 'left';
    this.texture.needsUpdate = true;
  }
}
