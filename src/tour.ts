import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { FONT } from './ui-theme.js';

/**
 * Quick Tour: the best of Shadowplay in about ten minutes, one stop after
 * another, for anyone short of time (a judge, a friend). Each stop moves on
 * only when it is finished or when Skip is pushed: never on a timer, so no
 * one is cut off mid-play. Fights are shorter on the tour, and the story's
 * saved place is left alone.
 */
export interface TourStop {
  /** A level id, or 'intro' (the film), 'pets' or 'training' (side games). */
  id: string;
  name: string;
  /** Has no end of its own (play as long as you like): Skip moves on. */
  open?: boolean;
}

export const TOUR: TourStop[] = [
  { id: 'intro', name: 'The story' },
  { id: 'pets', name: 'Shadows come alive', open: true },
  { id: 'run-bridge', name: 'A spark on your shadow' },
  { id: 'shadow-slingshot', name: 'The Shadow Slingshot' },
  { id: 'training', name: 'Shadow weapons', open: true },
  { id: 'fight-rook', name: 'Captain Rook' },
  { id: 'shadow-dragon', name: 'The Shadow Dragon' },
];

/** A small badge above the screen: which stop and its name (no clock: take your time). */
export class TourBadge {
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  readonly mesh: Mesh;
  private key = '';

  constructor(parent: Object3D) {
    this.canvas.width = 1024;
    this.canvas.height = 144;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.56, 0.079), new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 30;
    // Centred just above the screen, under the caption: big enough to read at a glance.
    this.mesh.position.set(0, 0.395, 0.03);
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  show(step: number, name: string, open: boolean): void {
    this.mesh.visible = true;
    const key = `${step}|${open}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 1024, 144);
    g.fillStyle = 'rgba(20, 33, 61, 0.95)';
    g.beginPath();
    g.roundRect(4, 4, 1016, 136, 30);
    g.fill();
    g.strokeStyle = '#ffd84a';
    g.lineWidth = 6;
    g.stroke();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const head = `QUICK TOUR ${step + 1}/${TOUR.length}`;
    g.font = `900 50px ${FONT}`;
    g.fillStyle = '#ffd84a';
    g.fillText(head, 34, 56);
    const after = 34 + g.measureText(head).width + 26;
    g.fillStyle = '#ffffff';
    g.font = `800 50px ${FONT}`;
    g.fillText(name, after, 56, 1024 - after - 30);
    // How it moves on: no timer, it waits for you.
    g.fillStyle = '#c2d0ec';
    g.font = `700 30px ${FONT}`;
    g.fillText(open ? 'Play as long as you like · push Skip for the next stop' : 'Finish it to move on, or push Skip', 34, 112, 956);
    this.texture.needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.key = '';
  }
}
