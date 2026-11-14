import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { FONT } from './ui-theme.js';

/**
 * Quick Tour: the best of Shadowplay in about ten minutes, one stop after
 * another, for anyone short of time (a judge, a friend). Each stop moves on
 * when it is finished, when Skip is pushed, or when its time is up. Fights
 * are shorter on the tour, and the story's saved place is left alone.
 */
export interface TourStop {
  /** A level id, or 'intro' (the film), 'pets' or 'training' (side games). */
  id: string;
  name: string;
  /** Seconds before the tour moves on by itself. */
  limit: number;
}

export const TOUR: TourStop[] = [
  { id: 'intro', name: 'The story', limit: 95 },
  { id: 'pets', name: 'Shadows come alive', limit: 60 },
  { id: 'run-bridge', name: 'A spark on your shadow', limit: 75 },
  { id: 'shadow-slingshot', name: 'The Shadow Slingshot', limit: 75 },
  { id: 'training', name: 'Shadow weapons', limit: 100 },
  { id: 'fight-rook', name: 'Captain Rook', limit: 100 },
  { id: 'shadow-dragon', name: 'The Shadow Dragon', limit: 130 },
];

/** The Training Arena's lessons on the tour: the fist's Shadow Ball, then a drawn ball. */
export const TOUR_LESSONS = [0, 11];

/** A small badge above the screen: which stop, its name, and time left. */
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

  show(step: number, name: string, left: number, limit: number): void {
    this.mesh.visible = true;
    const key = `${step}|${Math.ceil(left)}`;
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
    g.fillText(head, 34, 62);
    const after = 34 + g.measureText(head).width + 26;
    g.fillStyle = '#ffffff';
    g.font = `800 50px ${FONT}`;
    g.fillText(name, after, 62, 1024 - after - 30);
    // Time left on this stop, as a bar along the bottom.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(34, 108, 956, 14);
    g.fillStyle = '#49d17d';
    g.fillRect(34, 108, 956 * Math.max(0, Math.min(1, left / limit)), 14);
    this.texture.needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.key = '';
  }
}
