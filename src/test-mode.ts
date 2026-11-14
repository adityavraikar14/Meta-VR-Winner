import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { FONT } from './ui-theme.js';

/**
 * Test mode, for checking the published build on a headset with no laptop:
 * open the link with ?test on the end and a frame-rate meter sits in the
 * screen's top-right corner (now, and the worst second of the last five),
 * with the level you are in. Without ?test nothing of this exists.
 * Removed before the final submission.
 */
export const TEST_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

export class FpsMeter {
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private frames = 0;
  private clock = 0;
  /** Frames per second of each of the last five seconds. */
  private readonly seconds: number[] = [];

  constructor(parent: Object3D) {
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(0.2, 0.05), new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 30;
    mesh.position.set(0.39, 0.385, 0.03);
    parent.add(mesh);
  }

  /** Every frame: `delta` is the real frame time (seconds), `where` the level or phase. */
  tick(delta: number, where: string): void {
    this.frames++;
    this.clock += delta;
    if (this.clock < 1) return;
    const fps = this.frames / this.clock;
    this.frames = 0;
    this.clock = 0;
    this.seconds.push(fps);
    if (this.seconds.length > 5) this.seconds.shift();
    const worst = Math.min(...this.seconds);
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(10, 16, 30, 0.85)';
    g.beginPath();
    g.roundRect(4, 4, 504, 120, 18);
    g.fill();
    // Green at 60 and above (the competition's minimum), amber below, red under 45.
    const color = (v: number) => (v >= 59 ? '#49d17d' : v >= 45 ? '#ffc94a' : '#ff5a5a');
    g.textBaseline = 'middle';
    g.font = `900 46px ${FONT}`;
    g.fillStyle = color(fps);
    g.fillText(`${Math.round(fps)} fps`, 22, 44);
    g.font = `800 30px ${FONT}`;
    g.fillStyle = color(worst);
    g.fillText(`worst ${Math.round(worst)}`, 280, 44);
    g.font = `700 26px ${FONT}`;
    g.fillStyle = '#c9d4ec';
    g.fillText(where.slice(0, 32), 22, 96);
    this.texture.needsUpdate = true;
  }
}
