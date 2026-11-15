import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { HandState } from '../creatures/hand-input.js';
import { PushButton } from '../push-button.js';
import { BUTTON, FONT } from '../ui-theme.js';

/**
 * Lost a fight: a card floats up in front of you, "YOU LOSE", who beat you,
 * and a Play again button. Push it (or click it) and the fight starts over;
 * Home leaves as usual. No stars and no "Level cleared" for a loss.
 */
export class LoseCard {
  readonly root = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly again: PushButton;
  private readonly tips: Vector3[] = [];
  private readonly at = new Vector3();
  private readonly toward = new Vector3();
  private readonly centre = new Vector3();
  private time = 0;
  shown = false;

  constructor(parent: Group) {
    this.canvas.width = 1600;
    this.canvas.height = 760;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    const card = new Mesh(new PlaneGeometry(0.4, 0.19), new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    card.renderOrder = 40;
    this.root.add(card);
    this.again = new PushButton(this.root, 'Play again');
    this.again.size = 1;
    this.again.setColor(BUTTON.green);
    this.again.root.position.set(0, -0.15, 0.01);
    this.root.visible = false;
    parent.add(this.root);
  }

  /** Shows the card: "YOU LOSE" and a line under it (who won, what to try). */
  show(line: string, tip: string): void {
    this.shown = true;
    this.time = 0;
    this.root.visible = true;
    this.again.show(true);
    const g = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(2, 0, 0, 2, 0, 0);
    const W = w / 2;
    const H = h / 2;
    g.fillStyle = 'rgba(20, 24, 38, 0.96)';
    g.beginPath();
    g.roundRect(6, 6, W - 12, H - 12, 30);
    g.fill();
    g.strokeStyle = '#ff5a4a';
    g.lineWidth = 6;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff6a5a';
    g.font = `900 92px ${FONT}`;
    g.fillText('YOU LOSE', W / 2, 108);
    g.fillStyle = '#ffffff';
    g.font = `800 36px ${FONT}`;
    g.fillText(line, W / 2, 200, W - 60);
    g.fillStyle = '#c2d0ec';
    g.font = `700 28px ${FONT}`;
    g.fillText(tip, W / 2, 258, W - 60);
    g.fillStyle = '#ffd84a';
    g.font = `800 30px ${FONT}`;
    g.fillText('Play again?  Push the green button  ·  Home to leave', W / 2, 322, W - 60);
    this.texture.needsUpdate = true;
  }

  hide(): void {
    this.shown = false;
    this.root.visible = false;
    this.again.show(false);
  }

  /**
   * Keeps the card in front of you (half a metre ahead, a little low, facing you) and
   * watches the button. `head` is the eye in world space. True on the frame it is pushed.
   */
  update(dt: number, hands: readonly HandState[], head: Vector3): boolean {
    if (!this.shown) return false;
    this.time += dt;
    const parent = this.root.parent;
    if (parent) {
      parent.getWorldPosition(this.centre);
      this.toward.copy(this.centre).sub(head).setY(0);
      if (this.toward.lengthSq() < 1e-6) this.toward.set(0, 0, -1);
      this.toward.normalize();
      this.at.copy(head).addScaledVector(this.toward, 0.5);
      this.at.y -= 0.08 - 0.02 * Math.max(0, 1 - this.time * 3);
      parent.worldToLocal(this.at);
      this.root.position.copy(this.at);
      this.root.lookAt(head);
    }
    this.tips.length = 0;
    for (const hand of hands) if (hand.tracked) this.tips.push(hand.indexTip);
    // A moment before it can be pushed, so a hand still swinging from the fight doesn't hit it.
    return this.again.update(dt, this.tips, false) && this.time > 0.8;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.texture.dispose();
  }
}
