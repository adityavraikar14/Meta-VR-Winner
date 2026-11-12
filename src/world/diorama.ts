import { Confetti } from './confetti.js';
import { Mentor } from '../creatures/mentor.js';
import { Box3, Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { stage, PAPER_HEIGHT, PAPER_WIDTH } from '../stage-state.js';
import { animateNature, forgetWater, grassTouch, nature } from './nature.js';
import { playAwaken, playUnfold, setAmbience, tickAmbience } from '../audio.js';
import type { Beast } from '../creatures/beast.js';
import type { HandState } from '../creatures/hand-input.js';
import { Pickups } from './pickups.js';
import type { Creature } from '../creatures/creature.js';
import type { Effects } from '../creatures/fx.js';
import { mergeStatic } from '../merge.js';
import { play } from '../progress.js';
import { type Kit, puzzleAt, PUZZLES, type PuzzleScene, WORLDS } from './puzzles.js';

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
  /** The screen's frame, in paper space. */
  private readonly screen = new Group();
  /** Life-size plants around the player, floor at y = 0. */
  private readonly room = new Group();
  private readonly paperAt = new Vector3();
  /** Showing a chapter's world while browsing: the level's props are put away. */
  private previewing = false;
  /** Seconds since the world started growing (Infinity: fully grown). */
  private growTime = Infinity;
  private growFrom = new Vector3();
  /** Seconds since this level's props began to unfold, like a pop-up book page (Infinity: settled). */
  private unfoldTime = Infinity;
  private readonly props = new Group();
  private worldIndex = -1;
  /** Scenery asset version the current decoration was built with. */
  private decorVersion = -1;
  private scene: PuzzleScene | null = null;
  private pickups: Pickups | null = null;
  private tweens: Tween[] = [];
  private spinners: Array<{ object: Object3D; speed: number }> = [];
  private attempting = false;
  /** World-space footprints of the current puzzle's props. */
  blockers: Array<{ center: Vector3; radius: number }> = [];
  /** Ada, the Lantern's engineer, standing on the table. */
  private mentor!: Mentor;
  /** Celebration on every clear. */
  private confetti!: Confetti;
  private readonly kit: Kit;

  constructor(
    private readonly stageRoot: Group,
    private readonly floor: number,
    fx: Effects,
  ) {
    this.decor.name = 'WorldScenery';
    this.props.name = 'PuzzleProps';
    this.screen.name = 'ScreenFrame';
    this.mentor = new Mentor(stageRoot);
    this.confetti = new Confetti(stageRoot, floor);
    this.room.name = 'RoomJungle';
    stageRoot.add(this.decor, this.props);
    stage.paper!.add(this.screen, this.room);
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
  /** Rebuild everything for the current puzzle, e.g. after the earth moved to the table. */
  relayout(): void {
    this.worldIndex = -1;
    this.load();
  }

  /** Show or hide the whole world (it stays hidden until the table is found). */
  setHidden(hidden: boolean): void {
    for (const group of [this.decor, this.screen, this.room]) group.visible = !hidden;
    this.props.visible = !hidden && !this.previewing && !stage.titleMenu;
    // In the Arena the world stays around you on the floor; the table and screen step aside.
    if (stage.arena) this.room.visible = true;
  }

  /**
   * The jungle grows: the earth spreads out from where the hand lay, the
   * screen's poles rise, and the room's plants unfurl, nearest first.
   */
  grow(fromWorld: Vector3 | null): void {
    this.growTime = 0;
    if (fromWorld) this.stageRoot.worldToLocal(this.growFrom.copy(fromWorld)).setY(0);
    else this.growFrom.set(0, 0, 0);
    this.applyGrowth();
  }

  private applyGrowth(): void {
    const t = this.growTime;
    const spread = backOut(clamp01(t / 1.6));
    this.decor.scale.setScalar(Math.max(0.001, spread));
    this.decor.position.set(this.growFrom.x * (1 - spread), 0, this.growFrom.z * (1 - spread));
    this.props.scale.copy(this.decor.scale);
    this.props.position.copy(this.decor.position);
    this.screen.scale.set(1, Math.max(0.001, easeOut(clamp01((t - 0.5) / 1.2))), 1);
    for (const plant of this.room.children) {
      // Vines and fireflies are built in place around the origin: they appear rather than grow.
      if (plant.position.lengthSq() === 0) {
        plant.visible = t > 1.4;
        continue;
      }
      const base = (plant.userData.baseScale as Vector3 | undefined) ?? plant.scale.clone();
      plant.userData.baseScale = base;
      const delay = 0.4 + Math.hypot(plant.position.x, plant.position.z - 1) * 0.35;
      const k = Math.max(0.001, backOut(clamp01((t - delay) / 1.3)));
      plant.scale.copy(base).multiplyScalar(k);
    }
  }

  /** The world of the level in play (the last world in free play). */
  private levelWorld(): number {
    const puzzle = puzzleAt(play.puzzleIndex);
    return puzzle ? puzzle.world : WORLDS.length - 1;
  }

  load(): void {
    const puzzle = puzzleAt(play.puzzleIndex);
    const world = stage.previewWorld ?? this.levelWorld();
    if (world !== this.worldIndex) this.decorate(world);
    clear(this.props);
    this.tweens = [];
    this.spinners = [];
    this.attempting = false;
    this.blockers = [];
    stage.task = null;
    stage.runNotes = null;
    stage.journalPage = null;
    stage.music = null;
    // Build at full size (scenes measure the stage as they are made), then unfold.
    if (this.growTime >= 4) this.props.scale.set(1, 1, 1);
    this.stageRoot.updateWorldMatrix(true, true);
    this.scene = puzzle ? puzzle.build(this.props, this.kit) : null;
    if (puzzle && this.growTime >= 4) {
      this.unfoldTime = 0;
      playUnfold();
    }
    mergeStatic(this.props);
    this.placeMentor();
    // Resources to gather, around the edges of the story's levels.
    this.pickups = null;
    if (puzzle && puzzle.id !== 'duel') {
      const spot = new Vector3();
      const blocked = (x: number, z: number) => {
        this.stageRoot.localToWorld(spot.set(x, this.floor, z));
        return this.blockers.some((b) => b.center.distanceTo(spot) < b.radius + 0.04);
      };
      this.pickups = new Pickups(world, this.floor, blocked);
      this.props.add(this.pickups.group);
    }
  }

  /**
   * Ada stands beside the screen, in the spot with the most room: each
   * candidate's distance to the nearest prop's actual bounding box (and to
   * the machines' keep-clear circles), the largest wins.
   */
  private placeMentor(): void {
    // The back half of the board only: never between you and the screen.
    const spots: Array<[number, number]> = [
      [-0.47, -0.3], [0.47, -0.3], [-0.52, -0.05], [0.52, -0.05], [-0.56, -0.46], [0.56, -0.46],
    ];
    this.props.updateMatrixWorld(true);
    // Each prop's box; groups spanning the whole stage (a scene's root) say nothing about where there is room.
    const boxes = this.props.children
      .filter((c) => c.visible)
      .map((c) => new Box3().setFromObject(c))
      .filter((box) => box.isEmpty() || box.max.x - box.min.x < 0.6 || box.max.z - box.min.z < 0.6);
    const at = new Vector3();
    let best = spots[0];
    let bestRoom = -Infinity;
    for (const spot of spots) {
      this.stageRoot.localToWorld(at.set(spot[0], this.floor + 0.08, spot[1]));
      let room = Infinity;
      for (const box of boxes) if (!box.isEmpty()) room = Math.min(room, box.distanceToPoint(at));
      for (const b of this.blockers) room = Math.min(room, b.center.distanceTo(at) - b.radius);
      // A small preference for the earlier (nearer the screen) spots.
      room -= spots.indexOf(spot) * 0.004;
      if (room > bestRoom) {
        bestRoom = room;
        best = spot;
      }
    }
    this.mentor.place(best[0], this.floor, best[1]);
  }

  private decorate(world: number): void {
    this.worldIndex = world;
    setAmbience(WORLDS[world].ambience);
    this.decorVersion = nature.version;
    clear(this.decor);
    clear(this.screen);
    clear(this.room);
    WORLDS[world].decorate({
      stage: this.decor,
      floor: this.floor,
      screen: this.screen,
      screenWidth: PAPER_WIDTH,
      screenHeight: PAPER_HEIGHT,
      screenGround: this.stageRoot.position.y + this.floor,
      room: this.room,
    });
    mergeStatic(this.decor);
    // Each room plant and frame part is its own group (they grow in one by one),
    // so merging only joins meshes inside a group: fewer draw calls, same growth.
    mergeStatic(this.screen);
    mergeStatic(this.room);
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
    const attempt = this.scene.attempt(kind, 'size' in creature ? creature.size : 1);
    creature.perform(attempt.steps, () => {
      // A solved puzzle stays closed until the next one loads.
      this.attempting = attempt.solved;
      if (attempt.solved) onSolved();
      play.outcome = { kind, solved: attempt.solved, line: attempt.line };
    });
  }

  update(dt: number, hands: readonly HandState[], head: Vector3): void {
    // Ada, the mentor: on the table with the world, out of the Arena; she answers the game's cues.
    // She steps aside for the fights (the dragon, the duel): the stage is theirs.
    this.mentor.update(dt, !stage.arena && !stage.fight && !stage.sceneryHidden && !this.previewing && this.growTime >= 1.2);
    if (stage.cue) {
      this.mentor.cue(stage.cue);
      stage.cue = null;
    }
    if (stage.say) {
      this.mentor.say(stage.say);
      stage.say = null;
    }
    if (stage.confetti) {
      stage.confetti = false;
      this.confetti.burst();
    }
    this.confetti.update(dt);
    if (this.growTime < 4) {
      this.growTime += dt;
      this.applyGrowth();
    } else if (this.unfoldTime < UNFOLD_TIME) {
      // A new level's props stand up from the ground, overshooting a little, like a pop-up page.
      this.unfoldTime += dt;
      const k = backOut(clamp01(this.unfoldTime / UNFOLD_TIME));
      this.props.scale.set(1, Math.max(0.001, k), 1);
    }
    // The photo-real scenery arrived: swap the stand-in for it.
    if (this.worldIndex >= 0 && nature.version !== this.decorVersion) this.decorate(this.worldIndex);
    // Browsing chapters: the room becomes each chapter's world as it is shown.
    const want = stage.previewWorld ?? this.levelWorld();
    this.previewing = want !== this.levelWorld();
    if (this.worldIndex >= 0 && want !== this.worldIndex) {
      this.decorate(want);
      this.grow(null);
    }
    animateNature(dt);
    // The grass parts around your fingertips.
    let t = 0;
    for (const hand of hands) {
      for (const tip of hand.tips) {
        const slot = grassTouch.value[t++];
        if (!slot) break;
        slot.set(tip.x, tip.y, tip.z, hand.tracked ? 1 : 0);
      }
    }
    tickAmbience(dt);
    // The room's plants stand on the real floor (y = 0), wherever the screen is.
    stage.paper!.getWorldPosition(this.paperAt);
    this.room.position.y = -this.paperAt.y;
    this.scene?.update?.(dt, hands, head);
    if (stage.playing) this.pickups?.update(dt, hands);
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

/** Seconds for a level's props to unfold. */
const UNFOLD_TIME = 0.75;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function easeOut(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** Overshoots a little and settles, like something springing up. */
function backOut(x: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

/**
 * Remove and free everything under a group. Materials shared by props are
 * freed once; scanned scenery and grass belong to caches and are kept.
 */
function clear(group: Group): void {
  const materials = new Set<Material>();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh.userData.shared) return;
    mesh.geometry.dispose();
    const m = mesh.material;
    for (const material of Array.isArray(m) ? m : [m]) materials.add(material);
  });
  materials.forEach((m) => {
    forgetWater(m as MeshStandardMaterial);
    m.dispose();
  });
  group.clear();
}
