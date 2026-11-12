import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Vector3 } from '@iwsdk/core';
import { FONT } from '../ui-theme.js';

/**
 * Impact words that pop in the air where something happens: SLAM,
 * PARRY!, K.O.! Each pops in with an overshoot, drifts up and fades. A small
 * pool of canvases, reused, so a busy fight allocates nothing.
 */

interface Pop {
  mesh: Mesh;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  time: number;
  life: number;
  size: number;
  tilt: number;
}

export class Comic {
  readonly group = new Group();
  private readonly pops: Pop[] = [];
  private next = 0;

  constructor(count = 5) {
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 160;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const mesh = new Mesh(new PlaneGeometry(0.32, 0.1), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
      mesh.renderOrder = 11;
      mesh.visible = false;
      mesh.userData.keep = true;
      this.group.add(mesh);
      this.pops.push({ mesh, canvas, texture, time: 0, life: 0, size: 1, tilt: 0 });
    }
  }

  /** `at` is in the group's parent space; `size` 1 is about 30 cm wide. */
  pop(text: string, at: Vector3, color = '#ffd23a', size = 1, life = 1.1): void {
    const pop = this.pops[this.next];
    this.next = (this.next + 1) % this.pops.length;
    const g = pop.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 160);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    let px = 104;
    g.font = `900 ${px}px ${FONT}`;
    const wide = g.measureText(text).width;
    if (wide > 470) {
      px = Math.floor((px * 470) / wide);
      g.font = `900 ${px}px ${FONT}`;
    }
    g.save();
    g.translate(256, 82);
    g.rotate(-0.06);
    g.lineWidth = 18;
    g.strokeStyle = '#16121c';
    g.strokeText(text, 0, 0);
    g.lineWidth = 7;
    g.strokeStyle = '#ffffff';
    g.strokeText(text, 0, 0);
    g.fillStyle = color;
    g.fillText(text, 0, 0);
    g.restore();
    pop.texture.needsUpdate = true;
    pop.mesh.position.copy(at);
    pop.tilt = (Math.random() - 0.5) * 0.3;
    pop.time = 0;
    pop.life = life;
    pop.size = size;
    pop.mesh.visible = true;
  }

  /** `face` is the viewer, in world space. */
  update(dt: number, face: Vector3): void {
    for (const pop of this.pops) {
      if (!pop.mesh.visible) continue;
      pop.time += dt;
      const k = pop.time / pop.life;
      if (k >= 1) {
        pop.mesh.visible = false;
        continue;
      }
      // In with an overshoot, then a slow drift up and a fade.
      const t = Math.min(1, pop.time / 0.16);
      const overshoot = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      pop.mesh.scale.setScalar(pop.size * Math.max(0.01, overshoot));
      pop.mesh.position.y += dt * 0.05;
      pop.mesh.lookAt(face);
      pop.mesh.rotateZ(pop.tilt);
      (pop.mesh.material as MeshBasicMaterial).opacity = Math.min(1, (1 - k) * 3);
    }
  }
}
