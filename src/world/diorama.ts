import { Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { playAwaken } from '../audio.js';
import type { Beast } from '../creatures/beast.js';
import type { Creature } from '../creatures/creature.js';
import type { Effects } from '../creatures/fx.js';
import { mergeStatic } from '../merge.js';
import { play } from '../progress.js';
import { type Kit, PUZZLES, type PuzzleScene, WORLDS } from './puzzles.js';

interface Tween {
  time: number;
  duration: number;
  fn: (k: number) => void;
}

/**
 * The storybook scene on the stage: world scenery plus the current
 * puzzle's props. Hands each newly made friend its attempt at the puzzle
 * and reports the outcome through `play.outcome`.
 */
export class Diorama {
  private readonly decor = new Group();
  private readonly props = new Group();
  private worldIndex = -1;
  private scene: PuzzleScene | null = null;
  private tweens: Tween[] = [];
  private spinners: Array<{ object: Object3D; speed: number }> = [];
  private attempting = false;
  /** World-space footprints of the current puzzle's props. */
  blockers: Array<{ center: Vector3; radius: number }> = [];
  private readonly kit: Kit;

  constructor(
    private readonly stageRoot: Group,
    private readonly floorMaterial: MeshStandardMaterial,
    floor: number,
    fx: Effects,
  ) {
    this.decor.name = 'WorldScenery';
    this.props.name = 'PuzzleProps';
    stageRoot.add(this.decor, this.props);
    this.kit = {
      floor,
      at: (x, y, z) => this.stageRoot.localToWorld(new Vector3(x, y, z)),
      where: (object) => object.getWorldPosition(new Vector3()),
      tween: (duration, fn) => this.tweens.push({ time: 0, duration, fn }),
      spin: (object, speed) => this.spinners.push({ object, speed }),
      fx,
      chime: playAwaken,
      block: (x, z, radius) =>
        this.blockers.push({ center: this.stageRoot.localToWorld(new Vector3(x, floor, z)), radius }),
    };
  }

  /** Rebuild for the puzzle at `play.puzzleIndex` (or free play at -1). */
  load(): void {
    const puzzle = PUZZLES[play.puzzleIndex];
    const world = puzzle ? puzzle.world : WORLDS.length - 1;
    if (world !== this.worldIndex) {
      this.worldIndex = world;
      clear(this.decor);
      WORLDS[world].decorate(this.decor);
      mergeStatic(this.decor);
      this.floorMaterial.color.setHex(WORLDS[world].floor);
    }
    clear(this.props);
    this.tweens = [];
    this.spinners = [];
    this.attempting = false;
    this.blockers = [];
    this.stageRoot.updateWorldMatrix(true, true);
    this.scene = puzzle ? puzzle.build(this.props, this.kit) : null;
    mergeStatic(this.props);
  }

  /** True while a puzzle is waiting for a friend to try it. */
  get open(): boolean {
    return this.scene !== null && !this.attempting;
  }

  /** World-space landing spot for a friend about to try the puzzle. */
  startSpot(out: Vector3): Vector3 {
    return this.stageRoot.localToWorld(out.copy(this.scene!.start));
  }

  /** Send a friend at the puzzle; the outcome arrives in `play.outcome`. */
  send(creature: Creature | Beast, onSolved: () => void): void {
    if (!this.scene) return;
    this.attempting = true;
    const kind = creature.kind;
    const attempt = this.scene.attempt(kind);
    creature.perform(attempt.steps, () => {
      // A solved puzzle stays closed until the next one loads.
      this.attempting = attempt.solved;
      if (attempt.solved) onSolved();
      play.outcome = { kind, solved: attempt.solved, line: attempt.line };
    });
  }

  update(dt: number): void {
    for (const spinner of this.spinners) spinner.object.rotation.y += spinner.speed * dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.time += dt;
      const k = Math.min(1, tween.time / tween.duration);
      tween.fn(k * k * (3 - 2 * k));
      if (k >= 1) this.tweens.splice(i, 1);
    }
  }
}

/** Remove and free everything under a group. Materials shared by props are freed once. */
function clear(group: Group): void {
  const materials = new Set<Material>();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const m = mesh.material;
    for (const material of Array.isArray(m) ? m : [m]) materials.add(material);
  });
  materials.forEach((m) => m.dispose());
  group.clear();
}
