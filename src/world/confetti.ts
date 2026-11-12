import { Color, DoubleSide, type Group, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from '@iwsdk/core';

/**
 * A burst of confetti over the table when a level is cleared: 160 paper
 * squares in the game's colours, thrown up from the middle of the board,
 * falling under gravity with air drag and tumbling as they go. One
 * instanced mesh, so it costs one draw call.
 */

const COUNT = 160;
const LIFE = 2.6;
const GRAVITY = 1.6;
/** Air drag per second: paper flutters down slowly. */
const DRAG = 2.2;
const COLOURS = [0xffc928, 0x2f7dff, 0xff4d42, 0x1fb35a, 0x7b5cff, 0x11b5a4, 0xffffff];

export class Confetti {
  private mesh: InstancedMesh;
  private pos = new Float32Array(COUNT * 3);
  private vel = new Float32Array(COUNT * 3);
  private spin = new Float32Array(COUNT * 3);
  private angle = new Float32Array(COUNT * 3);
  private age = LIFE;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3(1, 1, 1);
  private axis = new Vector3();

  constructor(
    parent: Group,
    /** The table's surface height in the parent's space. */
    private floor: number,
  ) {
    this.mesh = new InstancedMesh(new PlaneGeometry(0.012, 0.008), new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }), COUNT);
    this.mesh.name = 'Confetti';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    const colour = new Color();
    for (let i = 0; i < COUNT; i++) this.mesh.setColorAt(i, colour.setHex(COLOURS[i % COLOURS.length]));
    parent.add(this.mesh);
  }

  burst(): void {
    this.age = 0;
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.12;
      this.pos.set([Math.cos(a) * r, this.floor + 0.04 + Math.random() * 0.05, -0.15 + Math.sin(a) * r * 0.6], i * 3);
      const out = 0.25 + Math.random() * 0.55;
      this.vel.set([Math.cos(a) * out, 1.1 + Math.random() * 0.9, Math.sin(a) * out * 0.7], i * 3);
      this.spin.set([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], i * 3);
      this.angle.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    }
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.age >= LIFE) {
      this.mesh.visible = false;
      return;
    }
    this.age += dt;
    const k = Math.exp(-DRAG * dt);
    const fade = Math.min(1, (LIFE - this.age) / 0.5);
    this.s.setScalar(Math.max(0.001, fade));
    for (let i = 0; i < COUNT; i++) {
      const o = i * 3;
      this.vel[o] *= k;
      this.vel[o + 1] = this.vel[o + 1] * k - GRAVITY * dt;
      this.vel[o + 2] *= k;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(this.floor + 0.002, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] += this.vel[o + 2] * dt;
      for (let j = 0; j < 3; j++) this.angle[o + j] += this.spin[o + j] * dt;
      this.axis.set(Math.sin(this.angle[o]), Math.cos(this.angle[o + 1]), Math.sin(this.angle[o + 2])).normalize();
      this.q.setFromAxisAngle(this.axis, this.angle[o] + this.angle[o + 2]);
      this.p.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
