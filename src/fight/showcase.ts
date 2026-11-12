import { Group, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { stage } from '../stage-state.js';
import { preloadRival, Rival3D } from './rival3d.js';
import { RIVALS } from './rivals.js';

/**
 * The roster's stand: while you browse the duel's rivals in the menu, the
 * one on the card stands beside the screen in 3D, turns to face you and
 * shows off, so you pick a fighter by looking at them, not by reading a list.
 */
export class RivalShowcase {
  readonly group = new Group();
  private index = -1;
  private foe: Rival3D | null = null;
  private age = 0;
  private readonly spot = new Vector3();
  private readonly head = new Vector3();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly m = new Matrix4();

  constructor(
    private readonly stageRoot: Group,
    private readonly floor: number,
  ) {
    this.group.name = 'RivalShowcase';
    stageRoot.add(this.group);
  }

  /** `head` is the viewer in world space. */
  update(dt: number, head: Vector3): void {
    const want = stage.previewRival;
    if (want === null) {
      if (this.index >= 0) this.clear();
      return;
    }
    if (want !== this.index) {
      this.clear();
      this.index = want;
      // The neighbours too, so stepping through the roster never waits.
      for (const d of [0, 1, -1]) void preloadRival(RIVALS[(want + d + RIVALS.length) % RIVALS.length]);
    }
    const spec = RIVALS[this.index];
    if (!this.foe) {
      this.foe = Rival3D.create(spec);
      if (!this.foe) return;
      // Beside the screen, a step out from it.
      this.stageRoot.updateWorldMatrix(true, false);
      this.m.copy(this.stageRoot.matrixWorld).invert().multiply(stage.paper!.matrixWorld);
      this.m.decompose(this.spot, this.q, this.v);
      const out = this.v.set(0, 0, 1).applyQuaternion(this.q).setY(0).normalize();
      const side = new Vector3(1, 0, 0).applyQuaternion(this.q).setY(0).normalize();
      this.spot.addScaledVector(out, 0.2).addScaledVector(side, 0.55);
      this.spot.y = this.floor;
      this.foe.root.position.copy(this.spot);
      this.foe.root.rotation.y = Math.atan2(out.x, out.z);
      this.foe.root.traverse((o) => {
        o.userData.keep = true;
      });
      if (this.foe.has('taunt') && spec.ability !== 'ward') this.foe.play('taunt');
      this.group.add(this.foe.root);
      this.age = 0;
    }
    this.age += dt;
    // They pop in, a little too big, then settle.
    const t = Math.min(1, this.age / 0.3);
    this.foe.root.scale.setScalar(0.5 + 0.5 * (1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)));
    this.stageRoot.worldToLocal(this.head.copy(head));
    this.foe.update(dt, this.head);
  }

  private clear(): void {
    this.index = -1;
    if (this.foe) {
      this.foe.dispose();
      this.foe = null;
    }
  }
}
