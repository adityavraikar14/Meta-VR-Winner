import {
  CanvasTexture,
  CircleGeometry,
  createSystem,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { playTransform, setPurr } from '../audio.js';
import { devInfo } from '../dev-tools.js';
import { flattenGroups, mergeStatic } from '../merge.js';
import { play } from '../progress.js';
import { stage } from '../stage-state.js';
import { Diorama } from '../world/diorama.js';
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
/** One friend on the stage at a time: calling another sends the last one home. */
const MAX_CREATURES = 1;
/** Display scale per kind, so big creatures do not crowd the stage. */
const SCALES: Record<string, number> = { dragon: 0.95, deer: 1.05, dog: 1.15 };

const MODELS: Record<string, () => CreatureRig> = {
  rabbit: createRabbit,
  bird: createBird,
  snail: createSnail,
  deer: createDeer,
  dog: createDog,
  butterfly: createButterfly,
  dragon: createDragon,
};

interface Living {
  creature: Creature;
  blob: Mesh;
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

    const built = buildStage();
    mergeStatic(built.root);
    this.stageRoot = built.root;
    this.stageRoot.position.copy(STAGE_OFFSET);
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
    this.diorama = new Diorama(this.stageRoot, built.floor, STAGE_HEIGHT, this.fx);

    const round = (v: Vector3) => v.toArray().map((n) => Number(n.toFixed(3)));
    devInfo.creatures = () =>
      this.creatures.map(({ creature }) => ({
        state: creature.state,
        doing: creature.behavior,
        task: creature.taskLabel,
        energy: Number(creature.brain.energy.toFixed(2)),
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
      for (const living of this.creatures) {
        living.attempt = false;
        living.creature.cancelTask();
      }
      this.diorama.load();
    }
    this.diorama.update(dt);
    this.ground.blockers = this.diorama.blockers;

    while (stage.spawns.length > 0) {
      const request = stage.spawns.shift()!;
      this.spawn(request.kind, request.x, request.y, request.attempt ?? false);
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
        blob.scale.setScalar(0.045 * creature.scale * (0.6 + 0.4 * fade));
      }
    }
    setPurr(purr);
    this.fx.update(dt);
  }

  private spawn(kind: string, x: number, y: number, attempt: boolean): void {
    const make = MODELS[kind] ?? createRabbit;
    // A new shadow replaces the friend already out, so the stage stays one-on-one.
    const twin = this.creatures.findIndex((living) => living.creature.rig.kind === kind);
    if (twin >= 0) this.remove(twin);
    else if (this.creatures.length >= MAX_CREATURES) this.remove(0);
    const paper = stage.paper!;
    const rig = make();
    flattenGroups(rig.root, animatedParts(rig));
    mergeStatic(rig.root);
    const creature = new Creature(rig, this.fx, SCALES[kind] ?? 1.25);
    this.world.createTransformEntity(rig.root);
    const blob = new Mesh(this.blobGeometry, this.blobMaterial);
    blob.name = 'CreatureContactShadow';
    blob.renderOrder = 1;
    this.world.createTransformEntity(blob);

    // Start on the paper surface where the shadow creature stood, slightly
    // lowered so its feet sit at the bottom of the shadow.
    paper.updateWorldMatrix(true, false);
    this.spawnPoint.set(x, y - rig.height * 0.4, 0.01).applyMatrix4(paper.matrixWorld);
    paper.getWorldQuaternion(this.paperRotation);
    creature.emergeFrom(this.spawnPoint, this.paperRotation);
    this.creatures.push({ creature, blob, attempt });
    this.ground.creatures = this.creatures.map((living) => living.creature);
    playTransform();
  }

  /** A creature vanishes in a puff of sparkles. */
  private remove(index: number): void {
    const [gone] = this.creatures.splice(index, 1);
    this.fx.burst(gone.creature.position, 16, 0.3);
    gone.creature.rig.root.removeFromParent();
    gone.blob.removeFromParent();
    disposeRig(gone.creature.rig);
    this.ground.creatures = this.creatures.map((living) => living.creature);
  }

  /** A free spot on the stage, away from the creatures already there. */
  private pickLanding(self: Creature): Vector3 {
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

/** A round wooden stage with a warm glowing rim. Origin at its base. */
/** Every part of a rig that animation moves, scales or hides. */
function animatedParts(rig: CreatureRig): Set<Object3D> {
  return new Set<Object3D>([
    rig.root, rig.body, rig.head, rig.eyes, rig.happyEyes, rig.tail,
    ...rig.ears, ...rig.wings, ...rig.feet,
    ...Object.values(rig.extras ?? {}),
  ]);
}

function buildStage(): { root: Group; floor: MeshStandardMaterial } {
  const root = new Group();
  root.name = 'CreatureStage';
  const wood = new MeshStandardMaterial({ color: 0x8b5a33, roughness: 0.65, metalness: 0 });
  const top = new MeshStandardMaterial({ color: 0xf2dcb8, roughness: 0.9 });
  const base = new Mesh(
    new CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS * 0.94, STAGE_HEIGHT, 48),
    wood,
  );
  base.name = 'StageBase';
  base.position.y = STAGE_HEIGHT / 2;
  root.add(base);
  const felt = new Mesh(new CircleGeometry(STAGE_RADIUS * 0.9, 48), top);
  felt.name = 'StageTop';
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = STAGE_HEIGHT + 0.0005;
  root.add(felt);
  const rim = new Mesh(
    new TorusGeometry(STAGE_RADIUS * 0.99, 0.0035, 8, 64),
    new MeshBasicMaterial({ color: 0xffc46b }),
  );
  rim.name = 'StageGlow';
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = STAGE_HEIGHT;
  root.add(rim);
  return { root, floor: top };
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
