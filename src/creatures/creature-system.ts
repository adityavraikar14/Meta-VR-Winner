import {
  CanvasTexture,
  CircleGeometry,
  createSystem,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Entity,
  type Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { playTransform, setPurr } from '../audio.js';
import { devInfo } from '../dev-tools.js';
import { preloadDragon } from '../fight/dragon3d.js';
import { preloadRival } from '../fight/rival3d.js';
import { currentRival } from '../fight/rivals.js';
import { flattenGroups, mergeStatic } from '../merge.js';
import { play } from '../progress.js';
import { stage } from '../stage-state.js';
import { Diorama } from '../world/diorama.js';
import { preloadNature } from '../world/nature.js';
import { Beast, createBeast, preloadBeasts } from './beast.js';
import { Creature, type Ground } from './creature.js';
import { Effects } from './fx.js';
import { HandInput } from './hand-input.js';
import { createBird } from './bird-model.js';
import { createButterfly } from './butterfly-model.js';
import { createDeer } from './deer-model.js';
import { createDog } from './dog-model.js';
import { createDragon } from './dragon-model.js';
import { createRabbit } from './rabbit-model.js';
import { createSnail } from './snail-model.js';
import { disposeRig, type CreatureRig } from './rig.js';

const STAGE_RADIUS = 0.25;
const STAGE_HEIGHT = 0.016;
/**
 * Stage position in paper space: about half a metre ahead and a third of a
 * metre below the eyes, so it sits in the lower part of the view without
 * looking down, and within easy reach of a seated player.
 */
const STAGE_OFFSET = new Vector3(0, -0.22, 0.5);
/** How far the earth may move from its default height to sit on a real table. */
const TABLE_RANGE: [number, number] = [-0.5, -0.1];
/** One friend on the stage at a time: calling another sends the last one home. */
const MAX_CREATURES = 1;
/** Display scale per kind, so big creatures do not crowd the stage. */
const SCALES: Record<string, number> = { dragon: 0.95, stag: 1.05, horse: 1.15 };

/** Plush pets; the horse and stag use these only until their glTF models load. */
const MODELS: Record<string, () => CreatureRig> = {
  rabbit: createRabbit,
  bird: createBird,
  snail: createSnail,
  stag: createDeer,
  horse: createDog,
  butterfly: createButterfly,
  dragon: createDragon,
};

/** A friend on the stage: a plush pet or a rigged animal. */
type Friend = Creature | Beast;

interface Living {
  creature: Friend;
  blob: Mesh;
  /** ECS entities that keep the creature and its blob in the scene. */
  entities: Entity[];
  /** Made to try the puzzle on stage. */
  attempt: boolean;
}

/**
 * Turns matched shadows into 3D creatures that live on a small stage in
 * front of the player, and feeds them hand input every frame.
 */
export class CreatureSystem extends createSystem({}) {
  private stageRoot!: Group;
  private fx!: Effects;
  private handInput!: HandInput;
  private creatures: Living[] = [];
  private blobGeometry!: CircleGeometry;
  private blobMaterial!: MeshBasicMaterial;
  private ground: Ground = {
    center: new Vector3(),
    radius: STAGE_RADIUS,
    viewer: new Vector3(),
    creatures: [],
    blockers: [],
  };
  private spawnPoint = new Vector3();
  private paperRotation = new Quaternion();
  private landing = new Vector3();
  private diorama!: Diorama;
  private puzzleVersion = -1;

  init(): void {
    const paper = stage.paper;
    if (!paper) throw new Error('ShadowStageSystem must be registered first');

    // The dragon, phoenix and witch are big and only needed later: fetch them after the scenery.
    void preloadNature().finally(() => preloadDragon().finally(() => preloadRival(currentRival())));
    this.stageRoot = buildStage();
    this.stageRoot.position.copy(STAGE_OFFSET);
    stage.worldRoot = this.stageRoot;
    paper.add(this.stageRoot);

    // Soft warm key light from above and in front, so plush forms read in
    // passthrough instead of looking flat under ambient light alone.
    const key = new DirectionalLight(0xfff0dc, 1.6);
    key.name = 'CreatureKeyLight';
    key.position.set(0.3, 0.8, 0.6);
    key.target = this.stageRoot;
    this.stageRoot.add(key);

    this.fx = new Effects();
    this.world.createTransformEntity(this.fx.root);
    this.handInput = new HandInput();
    devInfo.hands = () => this.handInput.hands.map((h) => ({
      tracked: h.tracked,
      pinching: h.pinching,
      gap: Number(h.pinchGap.toFixed(3)),
      pinch: h.pinch.toArray().map((n) => Number(n.toFixed(3))),
      index: h.tips[0].toArray().map((n) => Number(n.toFixed(3))),
    }));
    this.diorama = new Diorama(this.stageRoot, STAGE_HEIGHT, this.fx);
    preloadBeasts();

    const round = (v: Vector3) => v.toArray().map((n) => Number(n.toFixed(3)));
    devInfo.creatures = () =>
      this.creatures.map(({ creature }) => ({
        kind: creature.kind,
        state: creature.state,
        doing: creature instanceof Beast ? `${creature.mood} ${creature.clip}` : creature.behavior,
        task: creature.taskLabel,
        at: round(creature.position),
        happy: Number(creature.happiness.toFixed(2)),
        petting: creature.petting,
      }));
    devInfo.rightHand = () => {
      const hand = this.handInput.hands[1];
      return hand.tracked
        ? { tip: round(hand.indexTip), pinch: round(hand.pinch), pinching: hand.pinching, gap: Number(hand.pinchGap.toFixed(3)), palmUp: Number(hand.palmNormal.y.toFixed(2)) }
        : null;
    };

    this.blobGeometry = new CircleGeometry(1, 24);
    this.blobGeometry.rotateX(-Math.PI / 2);
    this.blobMaterial = new MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
  }

  update(delta: number, time: number): void {
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      setPurr(0);
      return;
    }
    const dt = Math.min(delta, 0.05);
    this.handInput.update(dt);

    this.stageRoot.updateWorldMatrix(true, false);
    this.ground.center.set(0, STAGE_HEIGHT, 0).applyMatrix4(this.stageRoot.matrixWorld);
    this.player.head.getWorldPosition(this.ground.viewer);
    if (this.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.camera.getWorldPosition(this.ground.viewer);
    }

    if (play.puzzleVersion !== this.puzzleVersion) {
      this.puzzleVersion = play.puzzleVersion;
      // Every level starts with a clear stage; friends come when you call them.
      while (this.creatures.length > 0) this.remove(0);
      this.diorama.load();
    }
    this.followTable();
    this.diorama.setHidden(stage.sceneryHidden);
    if (stage.grow) {
      this.diorama.grow(stage.grow.from);
      stage.grow = null;
    }
    this.diorama.update(dt, this.handInput.hands, this.ground.viewer);
    this.ground.blockers = this.diorama.blockers;

    while (stage.spawns.length > 0) {
      const request = stage.spawns.shift()!;
      this.spawn(request.kind, request.x, request.y, request.attempt ?? false, request.size ?? 1);
    }

    let purr = 0;
    for (const living of this.creatures) {
      const { creature, blob } = living;
      const wasEmerging = !creature.emerged;
      creature.update(dt, time, this.ground, this.handInput.hands);
      if (wasEmerging && creature.emerged) {
        if (living.attempt && this.diorama.open) {
          this.diorama.send(creature, () => this.creatures.forEach((c) => c.creature.cheer()));
          creature.landAt(this.diorama.startSpot(this.landing));
        } else {
          creature.landAt(this.pickLanding(creature));
        }
      }
      if (creature.petting || creature.state === 'onPalm') {
        purr = Math.max(purr, creature.happiness);
      }

      // Contact shadow on the stage, fading as the creature rises.
      const lift = creature.position.y - this.ground.center.y;
      const onStage = creature.emerged && lift > -0.01 && lift < 0.4;
      blob.visible = onStage;
      if (onStage) {
        blob.position.set(creature.position.x, this.ground.center.y + 0.001, creature.position.z);
        const fade = Math.max(0, 1 - lift / 0.3);
        const size = creature instanceof Beast ? creature.footprint : 0.045 * creature.scale;
        blob.scale.setScalar(size * (0.6 + 0.4 * fade));
      }
    }
    setPurr(purr);
    this.fx.update(dt);
  }

  /**
   * Keep the earth's surface on the player's real table: the screen stays at
   * eye height, the earth (and the screen's poles) move down or up to the table.
   */
  private followTable(): void {
    let y = STAGE_OFFSET.y;
    if (stage.tableHeight !== null) {
      stage.paper!.getWorldPosition(this.landing);
      y = stage.tableHeight - this.landing.y - STAGE_HEIGHT;
      y = Math.min(TABLE_RANGE[1], Math.max(TABLE_RANGE[0], y));
    }
    if (Math.abs(this.stageRoot.position.y - y) < 0.002) return;
    this.stageRoot.position.y = y;
    this.stageRoot.updateMatrixWorld(true);
    while (this.creatures.length > 0) this.remove(0);
    this.diorama.relayout();
  }

  private spawn(kind: string, x: number, y: number, attempt: boolean, size: number): void {
    // A new shadow replaces the friend already out, so the stage stays one-on-one.
    const twin = this.creatures.findIndex((living) => living.creature.kind === kind);
    if (twin >= 0) this.remove(twin);
    else if (this.creatures.length >= MAX_CREATURES) this.remove(0);
    const paper = stage.paper!;
    const creature = createBeast(kind, this.fx, size) ?? this.createPet(kind);
    const body = this.world.createTransformEntity(creature.root);
    const blob = new Mesh(this.blobGeometry, this.blobMaterial);
    blob.name = 'CreatureContactShadow';
    blob.renderOrder = 1;
    const shadow = this.world.createTransformEntity(blob);

    // Start on the paper surface where the shadow creature stood, slightly
    // lowered so its feet sit at the bottom of the shadow.
    paper.updateWorldMatrix(true, false);
    this.spawnPoint.set(x, y - creature.height * 0.4, 0.01).applyMatrix4(paper.matrixWorld);
    paper.getWorldQuaternion(this.paperRotation);
    creature.emergeFrom(this.spawnPoint, this.paperRotation);
    this.creatures.push({ creature, blob, entities: [body, shadow], attempt });
    this.syncGround();
    playTransform();
  }

  private createPet(kind: string): Creature {
    const rig = (MODELS[kind] ?? createRabbit)();
    flattenGroups(rig.root, animatedParts(rig));
    mergeStatic(rig.root);
    return new Creature(rig, this.fx, SCALES[kind] ?? 1.25);
  }

  /** Plush pets look for each other on the stage; beasts keep to themselves. */
  private syncGround(): void {
    this.ground.creatures = this.creatures
      .map((living) => living.creature)
      .filter((friend): friend is Creature => friend instanceof Creature);
  }

  /** A creature vanishes in a puff of sparkles. */
  private remove(index: number): void {
    const [gone] = this.creatures.splice(index, 1);
    this.fx.burst(gone.creature.position, 16, 0.3);
    // Detaching the Object3D alone is not enough: the entity keeps it in the scene.
    for (const entity of gone.entities) entity.dispose({ disposeResources: false });
    gone.blob.removeFromParent();
    if (gone.creature instanceof Beast) {
      gone.creature.dispose();
    } else {
      gone.creature.rig.root.removeFromParent();
      disposeRig(gone.creature.rig);
    }
    this.syncGround();
  }

  /** A free spot on the stage, away from the creatures already there. */
  private pickLanding(self: Friend): Vector3 {
    let best = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * STAGE_RADIUS * 0.6;
      const x = this.ground.center.x + Math.cos(angle) * r;
      const z = this.ground.center.z + Math.sin(angle) * r;
      let nearest = Infinity;
      for (const { creature } of this.creatures) {
        if (creature === self) continue;
        nearest = Math.min(nearest, Math.hypot(creature.position.x - x, creature.position.z - z));
      }
      if (nearest > best) {
        best = nearest;
        this.landing.set(x, this.ground.center.y, z);
      }
    }
    return this.landing;
  }
}

/** Every part of a rig that animation moves, scales or hides. */
function animatedParts(rig: CreatureRig): Set<Object3D> {
  return new Set<Object3D>([
    rig.root, rig.body, rig.head, rig.eyes, rig.happyEyes, rig.tail,
    ...rig.ears, ...rig.wings, ...rig.feet,
    ...Object.values(rig.extras ?? {}),
  ]);
}

/** Where the world's earth and its friends sit, in front of the screen. */
function buildStage(): Group {
  const root = new Group();
  root.name = 'CreatureStage';
  return root;
}

function blobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40, 20, 8, 0.9)');
  g.addColorStop(1, 'rgba(40, 20, 8, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
