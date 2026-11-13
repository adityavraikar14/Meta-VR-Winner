import { Group, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import { ShadowSlingshot } from '../machines/slingshot.js';
import { SwordTraining } from '../machines/sword.js';
import type { TaskStep } from '../creatures/creature.js';
import type { Effects } from '../creatures/fx.js';
import type { WalkLevel } from '../shadow-world.js';
import type { AmbienceKind, MusicTrack } from '../audio.js';
import type { HandState } from '../creatures/hand-input.js';
import { ArsenalDragonBattle } from '../fight/arsenal-battle.js';
import { DragonBattle } from '../fight/battle.js';
import { PowerChoice } from '../fight/power-choice.js';
import { dailyLevel, dateKey, noteDaily } from '../run/daily.js';
import { RUN_LEVELS, type RunLevel } from '../run/run-levels.js';
import { workshopLevel } from '../run/workshop.js';
import { ShadowRun } from '../run/shadow-run.js';
import { duelWith, InkDuel } from '../fight/duel.js';
import { currentRival, RIVALS } from '../fight/rivals.js';
import { Bridge } from '../machines/bridge.js';
import { SkyLantern } from '../machines/balloon.js';
import { Brew } from '../machines/brew.js';
import { Forge } from '../machines/forge.js';
import { PinLock } from '../machines/lock.js';
import { HorseWhim, whimFootprint } from '../machines/whim.js';
import { play } from '../progress.js';
import { stage } from '../stage-state.js';
import { decorateJungle, decorateMine, decorateMountain, decorateRiver, type SceneryRoots } from './scenery.js';
import { berries, goldStar } from './props.js';
import { emberShard, fallenLog as fallenTrunk, glowCaps, gnarledRoots, hollowTrunk, leafyTree } from './real-props.js';

/** Small enough to squeeze under roots and into logs. */
export const SMALL_FOX = 0.88;

/** Helpers a puzzle uses to stage its scene and script its solution. */
export interface Kit {
  /** Height of the stage floor, in stage-local space. */
  floor: number;
  /** Stage-local point to world space (a new vector). */
  at(x: number, y: number, z: number): Vector3;
  /** World position of a prop (a new vector). */
  where(object: Object3D): Vector3;
  /** Run `fn(k)` with k going 0 → 1 over `seconds`. */
  tween(seconds: number, fn: (k: number) => void): void;
  /** Spin a prop slowly until the puzzle is cleared. */
  spin(object: Object3D, speed: number): void;
  fx: Effects;
  chime(): void;
  /** Mark a round stage-local footprint that idle friends keep out of. */
  block(x: number, z: number, radius: number): void;
}

/** What a friend does when sent to the puzzle, and whether it works. */
export interface Attempt {
  steps: TaskStep[];
  solved: boolean;
  /** Caption after a failed attempt. */
  line?: string;
}

export interface PuzzleScene {
  /** Stage-local spot where a newly made friend lands. */
  start: Vector3;
  /** A friend of this kind and body size (1 = normal) tries the puzzle. */
  attempt(kind: string, size: number): Attempt;
  /** Machines that keep running between attempts, and hands-on work. `head` is the viewer's, world space. */
  update?(dt: number, hands: readonly HandState[], head: Vector3): void;
}

export interface Puzzle {
  id: string;
  /** Index into WORLDS. */
  world: number;
  title: string;
  /** One line of story on the paper before play starts. */
  story: string;
  /** The question on the paper while the player chooses. */
  ask: string;
  /** A new friend taught by this puzzle; its outline is shown big. */
  teach?: string;
  /** Just raise a hand to cast a shadow: the very first moment. */
  warmup?: boolean;
  /** A shadow-world level on the paper: help a tiny shadow friend across. */
  walk?: WalkLevel;
  /** The job needs a friend at least this big (1 = normal); its size is read out while matching. */
  needSize?: number;
  /** …or at most this big, to fit somewhere small. */
  maxSize?: number;
  /** Done with your own hands, not a friend: the scene reports progress in `stage.task`. */
  handsOn?: boolean;
  /** A fight (the dragon, a captain, Morwen): friends stay back and the music turns to battle. */
  fight?: boolean;
  /** Paints its own picture on the screen (the Shadow Run levels); others get their chapter's painting. */
  painted?: boolean;
  /** Caption once solved. */
  solved: string;
  /** What winning it gained you on the way to saving the dragon (the clear card's lead line). */
  gain?: string;
  build(root: Group, kit: Kit): PuzzleScene;
}

export interface World {
  name: string;
  /** What this chapter is for, in the story (the level cards' kicker). */
  goal: string;
  /** Caption while this world grows into the room. */
  grows: string;
  /** Builds the world: its earth on the stage, the screen's frame, and the plants in your room. */
  decorate(roots: SceneryRoots): void;
  /** Its background sound, and its music. */
  ambience: AmbienceKind;
  music: MusicTrack;
}

const NAMES: Record<string, string> = {
  fox: 'Fox',
  stag: 'Stag',
  horse: 'Horse',
  bird: 'Bird',
  butterfly: 'Butterfly',
  dragon: 'Dragon',
};

export function friendName(kind: string): string {
  return NAMES[kind] ?? kind;
}

function place(root: Group, object: Object3D, x: number, y: number, z: number, turn = 0, scale = 1): Object3D {
  object.position.set(x, y, z);
  object.rotation.y = turn;
  object.scale.setScalar(scale);
  root.add(object);
  return object;
}

// ---------------------------------------------------------------- Worlds

export const WORLDS: World[] = [
  // Each chapter's own world, life-size around you: the jungle, the river, the old mine, the mountain.
  { name: 'Light & Shadow', goal: 'Save the Lantern’s lost sparks', grows: 'The jungle grows into your room…', decorate: decorateJungle, ambience: 'jungle', music: 'explore' },
  { name: 'Structures', goal: 'Cross Captain Rook’s flooded river', grows: 'The river finds its way to you…', decorate: decorateRiver, ambience: 'river', music: 'river' },
  { name: 'Fire & Iron', goal: 'Break into Sergeant Vance’s mine', grows: 'The old mine opens around you…', decorate: decorateMine, ambience: 'mine', music: 'mine' },
  { name: 'Hot Air', goal: 'Climb to Kai’s mountain pass', grows: 'The cliffs rise into the evening sky…', decorate: decorateMountain, ambience: 'river', music: 'river' },
  { name: 'The Dragon', goal: 'Free the dragon, then face Morwen', grows: 'The mountain rises around you…', decorate: decorateMountain, ambience: 'mountain', music: 'battle' },
];

// --------------------------------------------------------------- Puzzles

/** A friend tries, bumps into the problem, looks around, and gives up. */
function bumpAndShrug(kit: Kit, at: Vector3, look: Vector3, line: string): Attempt {
  return {
    solved: false,
    line,
    steps: [
      { do: 'walk', to: at },
      { do: 'pose', pose: 'look', time: 0.5, look },
      { do: 'pose', pose: 'bonk', time: 0.9, look },
      { do: 'pose', pose: 'shrug', time: 1.3 },
    ],
  };
}

const warmup: Puzzle = {
  id: 'lantern',
  world: 0,
  title: 'The Lantern',
  story: 'Morwen’s ink has sealed you in, but one lantern still burns, just behind your eyes. Light travels in straight lines: put your hand in its way and the screen goes dark. Here, that dark is solid, and ink cannot touch it.',
  ask: 'Raise your hand into the lantern light',
  warmup: true,
  solved: 'That is your shadow. In this world, everything is built from it.',
  build(root, kit) {
    // A star waits on the stage, sleeping until the story begins.
    const star = goldStar(0.02);
    place(root, star.group, 0, kit.floor + 0.06, 0);
    kit.spin(star.group, 1.2);
    return { start: new Vector3(0, kit.floor, 0.05), attempt: () => ({ steps: [], solved: true }) };
  },
};

const shadowBridge: Puzzle = {
  id: 'shadow-bridge',
  world: 0,
  title: 'The Shadow Bridge',
  story: 'On the screen, your hand\u2019s shadow is solid ground. A shadow hare needs a way across.',
  ask: 'Make a bridge with your hand’s shadow',
  solved: 'Across! Your shadow was the bridge.',
  walk: {
    cliffs: [[0, 28, 27], [52, 80, 27]],
    start: [7, 27],
    goal: [72, 27],
  },
  build(root, kit) {
    return { start: new Vector3(0, kit.floor, 0.05), attempt: () => ({ steps: [], solved: true }) };
  },
};

const highLedge: Puzzle = {
  id: 'high-ledge',
  world: 0,
  title: 'The High Ledge',
  story: 'Pinch your fingers to draw a thread of shadow ink. Its shadow is solid too.',
  ask: 'Draw a ramp up to the high ledge',
  solved: 'Up and over! Ink, light and shadow.',
  walk: {
    cliffs: [[0, 30, 22], [52, 80, 38]],
    start: [8, 22],
    goal: [72, 38],
    ink: 2,
  },
  build(root, kit) {
    return { start: new Vector3(0, kit.floor, 0.05), attempt: () => ({ steps: [], solved: true }) };
  },
};

const fallenLog: Puzzle = {
  id: 'fallen-log',
  world: 0,
  title: 'The Fallen Log',
  story: 'A fallen tree blocks the path. Beyond it glows a shard of the Great Lantern.',
  ask: 'Who can leap over the log?',
  teach: 'fox',
  solved: 'The Fox leapt it and found the shard!',
  build(root, kit) {
    const f = kit.floor;
    // Turned three-quarters to the viewer so it reads as a log, not a pipe.
    place(root, fallenTrunk(0.22, 0.026), 0, f, -0.01, 1.05);
    for (const t of [-0.07, 0, 0.07]) kit.block(t * 0.5, -0.01 - t * 0.87, 0.035);
    const food = place(root, emberShard(0.014).group, 0.15, f, 0.02, 0.3, 1.2);
    kit.block(0.15, 0.02, 0.03);
    return {
      start: new Vector3(-0.15, f, 0.04),
      attempt: () => ({
        solved: true,
        steps: [
          { do: 'walk', to: kit.at(-0.065, f, 0.03) },
          { do: 'pose', pose: 'look', time: 0.6, look: kit.where(food) },
          { do: 'leap', to: kit.at(0.07, f, 0.025), height: 0.11, time: 0.6 },
          { do: 'walk', to: kit.at(0.11, f, 0.025) },
          {
            do: 'call',
            run: () => kit.tween(1.4, (k) => food.scale.setScalar(1.2 * (1 - k * 0.85))),
          },
          { do: 'pose', pose: 'sniff', time: 1.5, look: kit.where(food) },
          { do: 'call', run: () => { food.visible = false; kit.chime(); kit.fx.burst(kit.where(food), 16, 0.25); } },
          { do: 'pose', pose: 'cheer', time: 1.6 },
        ],
      }),
    };
  },
};

const tinyTunnel: Puzzle = {
  id: 'tiny-tunnel',
  world: 0,
  title: 'The Tiny Tunnel',
  story: 'The glow caps fell asleep behind the old roots.',
  ask: 'Only a small friend fits under the roots',
  maxSize: SMALL_FOX,
  solved: 'The little Fox slipped through and woke the glow caps!',
  build(root, kit) {
    const f = kit.floor;
    // The path runs diagonally through the arch, so the viewer sees the
    // snail go in one side and out the other.
    const turn = -0.7;
    const ax = Math.cos(turn);
    const az = -Math.sin(turn);
    const on = (t: number) => kit.at(ax * t, f, az * t);
    place(root, gnarledRoots(0.085), 0, f, 0, turn);
    for (const side of [-1, 1]) kit.block(-az * 0.105 * side, ax * 0.105 * side, 0.035);
    kit.block(az * 0.17, -ax * 0.17, 0.05);
    kit.block(-az * 0.17, ax * 0.17, 0.05);
    const glow = glowCaps(0.045, 0x9b7bff);
    place(root, glow.group, ax * 0.17, f, az * 0.17);
    kit.block(ax * 0.17, az * 0.17, 0.035);
    return {
      start: new Vector3(-ax * 0.17, f, -az * 0.17),
      attempt: (kind, size) => kind !== 'fox' || size > SMALL_FOX
        ? bumpAndShrug(kit, on(-0.07), kit.where(glow.group), kind === 'fox'
          ? 'Too big to fit! Hold your hand farther from the lantern: a smaller shadow makes a smaller fox'
          : `The ${friendName(kind)} is far too big for the roots!`)
        : ({
        solved: true,
        steps: [
          { do: 'walk', to: on(-0.08) },
          { do: 'pose', pose: 'look', time: 0.5, look: kit.where(glow.group) },
          { do: 'walk', to: on(0.07) },
          { do: 'walk', to: on(0.11) },
          { do: 'pose', pose: 'sniff', time: 0.9, look: kit.where(glow.group) },
          { do: 'call', run: () => wakeGlow(kit, glow.cap, kit.where(glow.group)) },
          { do: 'pose', pose: 'cheer', time: 1.6 },
        ],
      }),
    };
  },
};

function wakeGlow(kit: Kit, cap: MeshStandardMaterial, at: Vector3): void {
  kit.chime();
  kit.fx.burst(at.add(new Vector3(0, 0.05, 0)), 20, 0.3);
  kit.tween(1.2, (k) => {
    cap.emissiveIntensity = k * 1.4;
  });
}

const highBerries: Puzzle = {
  id: 'high-berries',
  world: 0,
  title: 'The High Berries',
  story: 'Berries hang high in the old tree, far out of reach of anything small.',
  ask: 'Who is tall enough to reach them?',
  teach: 'stag',
  solved: 'The Stag reached them with ease.',
  build(root, kit) {
    const f = kit.floor;
    const tree = leafyTree(0.24, 0.11);
    place(root, tree.group, 0.13, f, -0.12);
    kit.block(0.13, -0.12, 0.04);
    kit.block(0.1, 0.04, 0.035);
    const fruit = berries();
    const tipX = 0.13 + tree.tip.x;
    const tipY = f + tree.tip.y;
    const tipZ = -0.12 + tree.tip.z;
    place(root, fruit, tipX, tipY, tipZ);
    const landing = new Vector3(0.1, f + 0.02, 0.06);
    return {
      start: new Vector3(-0.14, f, 0.05),
      attempt: () => ({
        solved: true,
        steps: [
          { do: 'walk', to: kit.at(0.06, f, 0.02) },
          { do: 'pose', pose: 'look', time: 0.6, look: kit.where(fruit) },
          { do: 'pose', pose: 'reach', time: 0.8, look: kit.where(fruit) },
          { do: 'leap', to: kit.at(0.065, f, 0.02), height: 0.07, time: 0.45 },
          {
            do: 'call',
            run: () => {
              kit.fx.burst(kit.where(fruit), 10, 0.25);
              kit.tween(0.6, (k) => {
                fruit.position.set(
                  tipX + (landing.x - tipX) * k,
                  tipY + (landing.y - tipY) * k + Math.sin(k * Math.PI) * 0.03,
                  tipZ + (landing.z - tipZ) * k,
                );
              });
            },
          },
          { do: 'pose', pose: 'look', time: 0.6, look: kit.at(landing.x, landing.y, landing.z) },
          { do: 'pose', pose: 'eat', time: 1.4, look: kit.at(landing.x, landing.y, landing.z) },
          { do: 'call', run: () => kit.chime() },
          { do: 'pose', pose: 'cheer', time: 1.6 },
        ],
      }),
    };
  },
};

const lostStar: Puzzle = {
  id: 'lost-star',
  world: 0,
  title: 'The Lost Star',
  story: 'A shard of the Great Lantern rolled deep inside a hollow log!',
  ask: 'Who is small enough to fit inside?',
  maxSize: SMALL_FOX,
  solved: 'The shard is free! The jungle glows again.',
  build(root, kit) {
    const f = kit.floor;
    // Angled so the near opening faces the viewer and the star shows inside.
    const turn = 0.6;
    const cx = 0.03;
    const cz = -0.02;
    const ax = Math.cos(turn);
    const az = -Math.sin(turn);
    const along = (t: number, y = f) => kit.at(cx + ax * t, y, cz + az * t);
    place(root, hollowTrunk(0.17, 0.056), cx, f, cz, turn);
    for (const t of [-0.06, 0, 0.06]) kit.block(cx + ax * t, cz + az * t, 0.055);
    const shard = emberShard(0.012);
    const star = { group: shard.group, material: { emissiveIntensity: 1 } };
    place(root, star.group, cx, f + 0.012, cz);
    kit.spin(star.group, 2);
    const mouth = along(-0.085, f + 0.04);
    const exit = { x: cx + ax * 0.13, z: cz + az * 0.13 };
    return {
      start: new Vector3(cx - ax * 0.2, f, cz - az * 0.2),
      attempt: (kind, size) => {
        if (kind === 'fox' && size <= SMALL_FOX) {
          return {
            solved: true,
            steps: [
              { do: 'walk', to: along(-0.12) },
              { do: 'walk', to: along(0) },
              { do: 'call', run: () => { star.group.visible = false; kit.fx.burst(along(0, f + 0.03), 8, 0.1); } },
              { do: 'walk', to: along(0.13) },
              {
                do: 'call',
                run: () => {
                  star.group.visible = true;
                  star.material.emissiveIntensity = 1.4;
                  kit.chime();
                  kit.tween(1.5, (k) => {
                    star.group.position.set(exit.x, f + 0.04 + k * 0.14, exit.z);
                    star.group.scale.setScalar(1 + k * 0.8);
                  });
                },
              },
              { do: 'pose', pose: 'cheer', time: 1.8 },
            ],
          };
        }
        const line = kind === 'fox'
          ? 'Too big to fit inside! Hold your hand farther from the lantern for a smaller fox'
          : `The ${friendName(kind)} is far too big to fit inside!`;
        return bumpAndShrug(kit, along(-0.13), mouth, line);
      },
    };
  },
};

/** The size of horse that can just wind up the full bucket. */
export const WELL_NEED = 1.18;
/** Stage-local spots for the whim and its well; the river's scenery keeps clear of them. */
export const WHIM_AT = new Vector3(0.34, 0, -0.06);
/** The well's z follows the drum: the rope runs straight back to it. */
export const WELL_AT = new Vector3(-0.06, 0, -0.356);

const oldWell: Puzzle = {
  id: 'old-well',
  world: 1,
  title: 'The Old Well',
  story: 'A shard of the Great Lantern lies at the bottom of the old well, and the bucket is too heavy to wind. A shadow beast is as strong as its shadow is big.',
  ask: 'Cast a horse big enough to turn the whim',
  teach: 'horse',
  needSize: WELL_NEED,
  solved: 'The horse winds the bucket up: strength grows with size squared.',
  build(root, kit) {
    const f = kit.floor;
    const whim = new HorseWhim(f, WHIM_AT, WELL_AT, WELL_NEED);
    root.add(whim.group);
    stage.runNotes = () => whim.journal();
    for (const [x, z, r] of whimFootprint(WHIM_AT, WELL_AT)) kit.block(x, z, r);
    return {
      start: new Vector3(-0.08, f, 0.12),
      update: (dt) => whim.update(dt),
      attempt: (kind, size) => {
        if (kind !== 'horse') {
          return bumpAndShrug(kit, kit.at(0.04, f, 0.1), kit.at(WHIM_AT.x, f + 0.1, WHIM_AT.z), `The ${friendName(kind)} can't push the whim round. It needs a horse.`);
        }
        const strong = size >= WELL_NEED;
        const { at, ahead } = whim.harnessSpot(size);
        return {
          solved: strong,
          line: strong
            ? undefined
            : 'Too heavy for that horse. Hold your hand closer to the lantern: a bigger shadow makes a bigger, stronger horse.',
          steps: [
            { do: 'walk', to: kit.at(at.x, f, at.z) },
            { do: 'pose', pose: 'look', time: 0.8, look: kit.at(ahead.x, f + 0.06, ahead.z) },
            { do: 'harness', rig: whim },
            ...(strong
              ? [
                  {
                    do: 'call' as const,
                    run: () => {
                      whim.freeStone(kit.tween, new Vector3(0, f + 0.32, -0.46), () => {
                        kit.fx.burst(kit.at(0, f + 0.32, -0.46), 24, 0.3);
                        kit.chime();
                      });
                    },
                  },
                  { do: 'pose' as const, pose: 'cheer' as const, time: 2.4 },
                ]
              : [{ do: 'pose' as const, pose: 'shrug' as const, time: 1.3 }]),
          ],
        };
      },
    };
  },
};

/** The same whim, a heavier load: only a big horse turns it. */
const DEEP_NEED = 1.32;
const deepShaft: Puzzle = {
  id: 'deep-shaft',
  world: 1,
  title: 'The Deep Shaft',
  story: 'Iron ore waits at the bottom of the old shaft: twice the weight of the stone. The forge will need it.',
  ask: 'Cast the biggest horse you can: your hand near the lantern',
  teach: 'horse',
  needSize: DEEP_NEED,
  solved: 'A mighty horse! The ore is up.',
  build(root, kit) {
    const f = kit.floor;
    const whim = new HorseWhim(f, WHIM_AT, WELL_AT, DEEP_NEED);
    root.add(whim.group);
    stage.runNotes = () => whim.journal();
    for (const [x, z, r] of whimFootprint(WHIM_AT, WELL_AT)) kit.block(x, z, r);
    return {
      start: new Vector3(-0.08, f, 0.12),
      update: (dt) => whim.update(dt),
      attempt: (kind, size) => {
        if (kind !== 'horse') {
          return bumpAndShrug(kit, kit.at(0.04, f, 0.1), kit.at(WHIM_AT.x, f + 0.1, WHIM_AT.z), `The ${friendName(kind)} can't push the whim round. It needs a horse.`);
        }
        const strong = size >= DEEP_NEED;
        const { at, ahead } = whim.harnessSpot(size);
        return {
          solved: strong,
          line: strong ? undefined : `Still too heavy: a horse of size ×${DEEP_NEED.toFixed(2)} is needed. Bring your hand right up near the lantern.`,
          steps: [
            { do: 'walk', to: kit.at(at.x, f, at.z) },
            { do: 'pose', pose: 'look', time: 0.8, look: kit.at(ahead.x, f + 0.06, ahead.z) },
            { do: 'harness', rig: whim },
            ...(strong
              ? [
                  { do: 'call' as const, run: () => whim.freeStone(kit.tween, new Vector3(0, f + 0.32, -0.46), () => { kit.fx.burst(kit.at(0, f + 0.32, -0.46), 24, 0.3); kit.chime(); }) },
                  { do: 'pose' as const, pose: 'cheer' as const, time: 2.4 },
                ]
              : [{ do: 'pose' as const, pose: 'shrug' as const, time: 1.3 }]),
          ],
        };
      },
    };
  },
};

/** A heavier cart over the river: the same timbers must carry twice the load. */
const oreTrain: Puzzle = {
  id: 'ore-train',
  world: 1,
  title: 'The Ore Train',
  story: 'Sergeant Vance the Musketeer holds the mine, and the way in is a cart loaded with iron ore: twice the weight. A bridge that held before may not hold now.',
  ask: 'Build it stronger: brace the triangles, or add a second truss above the road',
  handsOn: true,
  solved: 'It carried the ore. Bracing turned long members that would buckle into short ones that will not.',
  build(root, kit) {
    // Tuned with the truss physics: the first bridge's design buckles under this cart,
    // cross-braces or a second truss above the road carry it.
    const bridge = new Bridge(kit.floor, BRIDGE_AT, { budget: 28, cartMass: 1.65 });
    root.add(bridge.group);
    stage.runNotes = () => bridge.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        bridge.update(dt, hands);
        task.caption = bridge.caption;
        task.done = bridge.done;
        task.mistakes = bridge.mistakes;
      },
    };
  },
};

/** A shadow that comes alive: the slingshot, against Captain Rook's lookout. */
const shadowSlingshot: Puzzle = {
  id: 'shadow-slingshot',
  world: 1,
  title: 'The Shadow Slingshot',
  story: 'Captain Rook’s lookout guards the river: a caged lantern shard on a rope, his flag, and an alarm bell. A shadow can be more than ground. Shape one well enough and it comes alive.',
  ask: 'Make a V with two fingers to cast a slingshot; when it comes alive, pinch the pouch, pull back and knock down all three targets',
  handsOn: true,
  solved: 'The shard is free, the flag is down, and the bell rings out. Your shadow became a real slingshot.',
  build(root, kit) {
    const sling = new ShadowSlingshot(kit.floor);
    root.add(sling.group);
    stage.runNotes = () => sling.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        sling.update(dt, hands);
        task.caption = sling.caption;
        task.done = sling.done;
        task.mistakes = sling.mistakes;
      },
    };
  },
};

const brokenBridge: Puzzle = {
  id: 'broken-bridge',
  world: 1,
  title: 'The Broken Bridge',
  story: 'Captain Rook cut the old bridge, and the cart carrying the lantern shards has to cross his flooded river.',
  ask: 'Pinch timbers into place: build a truss across the river',
  handsOn: true,
  solved: 'It holds. A triangle cannot change shape unless one of its members changes length.',
  build(root, kit) {
    const bridge = new Bridge(kit.floor, BRIDGE_AT);
    root.add(bridge.group);
    stage.runNotes = () => bridge.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        bridge.update(dt, hands);
        task.caption = bridge.caption;
        task.done = bridge.done;
        task.mistakes = bridge.mistakes;
      },
    };
  },
};

const gateLock: Puzzle = {
  id: 'gate-lock',
  world: 4,
  title: 'The Dragon’s Gate',
  story: 'Morwen’s iron gate bars the last climb to the dragon. Its key is long lost: open it the way a locksmith would, by feel.',
  ask: 'Press the tension lever gently, lift each pin with your fingertip, and beware the spool pin',
  handsOn: true,
  solved: 'Click, click, click, click: the plug turns and the gate swings open.',
  build(root, kit) {
    const lock = new PinLock(kit.floor);
    root.add(lock.group);
    stage.runNotes = () => lock.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        lock.update(dt, hands);
        task.caption = lock.caption;
        task.done = lock.done;
        task.mistakes = lock.mistakes;
      },
    };
  },
};

const shadowDragon: Puzzle = {
  id: 'shadow-dragon',
  world: 4,
  title: 'The Shadow Dragon',
  story: 'At the summit the bewitched dragon guards Morwen’s tower. The Great Lantern is whole again: turn its light on the dragon and break the trance. Then the witch is next.',
  ask: 'Choose your powers: Light or the Arsenal',
  handsOn: true,
  fight: true,
  solved: 'The trance breaks, and the dragon is itself again. High in her tower, Morwen screams.',
  build(root, kit) {
    // First the choice of powers: the story's Light, or Yash's Arsenal of seven weapons.
    const choice = new PowerChoice(kit.floor);
    root.add(choice.group);
    let battle: DragonBattle | ArsenalDragonBattle | null = null;
    stage.runNotes = () => battle?.journal() ?? [];
    const task = { caption: choice.caption, done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is yours to fight.' }),
      update: (dt, hands, head) => {
        if (!battle) {
          const power = choice.update(dt, hands, head);
          task.caption = choice.caption;
          if (!power) return;
          choice.dispose();
          battle = power === 'light' ? new DragonBattle(root) : new ArsenalDragonBattle(root);
          root.add(battle.group);
          // Beating it with the Arsenal fills the Arsenal's own Journal page.
          stage.journalPage = power === 'arsenal' ? 'arsenal' : null;
        }
        battle.update(dt, hands, head);
        task.caption = battle.caption;
        task.done = battle.done;
        task.mistakes = battle.mistakes;
      },
    };
  },
};

const healingDraught: Puzzle = {
  id: 'healing-draught',
  world: 2,
  title: 'The Healing Draught',
  story: 'Vance’s shot and the dragon’s fire will both burn. In the mine hangs an old herbalist’s pot: brew something to heal you.',
  ask: 'Drop the three herbs in, then keep it simmering as the fire shifts',
  handsOn: true,
  solved: 'Two healing draughts, steeped just right.',
  build(root, kit) {
    const brew = new Brew(kit.floor, { fickle: 0.3 });
    root.add(brew.group);
    stage.runNotes = () => brew.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        brew.update(dt, hands);
        task.caption = brew.caption;
        task.done = brew.done;
        task.mistakes = brew.mistakes;
      },
    };
  },
};

/** Stage-local spot for the bridge, clear of the river world's pond. */
const BRIDGE_AT = new Vector3(0.12, 0, -0.02);

/** A stronger draught: the brew must be steeped longer, at just the right heat. */
const strongDraught: Puzzle = {
  id: 'strong-draught',
  world: 2,
  title: 'The Strong Draught',
  story: 'The dragon\u2019s fire will be fierce. Only a draught steeped to full strength will do: keep it at a gentle simmer.',
  ask: 'Brew it stronger: 90 percent, and the coals will not stay steady',
  handsOn: true,
  solved: 'Draughts at full strength. You are ready for the mountain.',
  build(root, kit) {
    const brew = new Brew(kit.floor, { ready: 0.9, fickle: 0.4 });
    root.add(brew.group);
    stage.runNotes = () => brew.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        brew.update(dt, hands);
        task.caption = brew.caption;
        task.done = brew.done;
        task.mistakes = brew.mistakes;
      },
    };
  },
};

const skyLantern: Puzzle = {
  id: 'sky-lantern',
  world: 3,
  title: 'The Sky Lantern',
  story: 'Kai the Ronin waits at the top of the pass, and the path up the cliff is gone. A paper lantern could carry the shards up to him, if the air inside it is hot enough.',
  ask: 'Light it, shelter the flame with one hand, and fan it clear of the crags with the other',
  handsOn: true,
  solved: 'Hot air is less dense than cold air: it rose, and the path is open.',
  build(root, kit) {
    const sky = new SkyLantern(kit.floor);
    root.add(sky.group);
    stage.runNotes = () => sky.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        sky.update(dt, hands);
        task.caption = sky.caption;
        task.done = sky.done;
        task.mistakes = sky.mistakes;
      },
    };
  },
};

const smithy: Puzzle = {
  id: 'smithy',
  world: 2,
  title: 'The Smithy',
  story: 'Sergeant Vance sealed the mine with roots as hard as iron. The old forge is cold: you need an axe, and an axe needs steel.',
  ask: 'Light the forge, heat the bar, and strike each glowing mark',
  handsOn: true,
  solved: 'An axe: quenched hard, with a keen edge.',
  build(root, kit) {
    const forge = new Forge(kit.floor);
    root.add(forge.group);
    stage.runNotes = () => forge.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands) => {
        forge.update(dt, hands);
        task.caption = forge.caption;
        task.done = forge.done;
        task.mistakes = forge.mistakes;
      },
    };
  },
};

/** Sword-defence training: your hand's shadow becomes a blade. */
const swordTraining: Puzzle = {
  id: 'sword-training',
  world: 3,
  title: 'The Shadow Blade',
  story: 'Below Kai’s pass stands the old shrine where the dragon’s keepers trained. The Lantern’s sparks can turn your hand’s shadow into a blade, and the shrine’s ink spirit will test it before you face the Ronin.',
  ask: 'Hold your hand flat and edge-on until it becomes a sword; then block every strike, swing hard into the heavy ones, and slash the ink knots',
  handsOn: true,
  solved: 'You learned the Shadow Blade: block, parry, and the Dawn Cut.',
  build(root, kit) {
    const sword = new SwordTraining(kit.floor);
    root.add(sword.group);
    stage.runNotes = () => sword.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'This one is work for your own hands.' }),
      update: (dt, hands, head) => {
        sword.update(dt, hands, head);
        task.caption = sword.caption;
        task.done = sword.done;
        task.mistakes = sword.mistakes;
      },
    };
  },
};

/**
 * A captain (or Morwen herself) steps out of the screen: the Ink Duel against
 * them, the end of their chapter. Lose, and they come again after a breath;
 * only a win moves the story on.
 */
function storyFight(o: { id: string; rival: string; world: number; title: string; story: string; solved: string }): Puzzle {
  const spec = RIVALS.find((r) => r.id === o.rival)!;
  return {
    id: o.id,
    world: o.world,
    title: o.title,
    story: o.story,
    ask: 'Pinch and draw in the air: throw your ink at them, or draw a closed shape and it comes alive to fight beside you',
    handsOn: true,
    fight: true,
    solved: o.solved,
    build(root, kit) {
      let duel = duelWith(spec, () => new InkDuel(root, kit.floor));
      root.add(duel.group);
      // The fight fills the Ink Duel's Journal page.
      stage.journalPage = 'duel';
      stage.runNotes = () => duel.journal();
      const task = { caption: '', done: false, mistakes: 0 };
      stage.task = task;
      let losses = 0;
      let again = -1;
      return {
        start: new Vector3(0, kit.floor, 0.12),
        attempt: () => ({ solved: false, steps: [], line: 'This one is yours to fight.' }),
        update: (dt, hands, head) => {
          if (again > 0) {
            again -= dt;
            task.caption = `${spec.name} won this round. Get ready: again in ${Math.ceil(again)}…`;
            if (again <= 0) {
              root.remove(duel.group);
              duel = duelWith(spec, () => new InkDuel(root, kit.floor));
              root.add(duel.group);
            }
            return;
          }
          duel.update(dt, hands, head);
          // Lost: no menu rematch in the story; they simply come again.
          task.caption = duel.over && !duel.won ? `Splat! ${spec.name} wins this round, but it is not over. Get ready…` : duel.caption;
          task.mistakes = losses + duel.mistakes;
          if (!duel.done) return;
          if (duel.won) task.done = true;
          else {
            losses++;
            again = 4;
          }
        },
      };
    },
  };
}

const fightRook = storyFight({
  id: 'fight-rook',
  rival: 'rook',
  world: 1,
  title: 'Captain Rook',
  story: 'The cart is over the river, and Captain Rook the Corsair will not let it go. He steps out of the screen, knife twirling, to take the shards back.',
  solved: 'Rook melts back into the ink he came from. The river is yours.',
});

const fightVance = storyFight({
  id: 'fight-vance',
  rival: 'vance',
  world: 2,
  title: 'Sergeant Vance',
  story: 'The mine is open, and Sergeant Vance the Musketeer waits in the dark with his fast ink shot. Keep a drawing hanging in front of you: it takes the shots for you.',
  solved: 'Vance’s ink runs dry. The mine’s shards are free.',
});

const fightKai = storyFight({
  id: 'fight-kai',
  rival: 'kai',
  world: 3,
  title: 'Kai the Ronin',
  story: 'At the top of the pass Kai draws his blade. He can cut your ink straight back at you: throw while he is attacking, or two at once.',
  solved: 'Kai lowers his sword and fades. The way to the dragon is open.',
});

const fightMorwen = storyFight({
  id: 'fight-morwen',
  rival: 'morwen',
  world: 4,
  title: 'Morwen, the Ink Witch',
  story: 'Her captains are gone and her dragon is free. Morwen steps out of her tower to fight you herself. When her rune ward glows, wait; throw the moment it fades.',
  solved: 'Morwen’s ink dries to dust, and the witch is gone with it.',
});

/** The Ink Duel lives outside the story, at this index. */
export const DUEL_INDEX = 1000;

export const DUEL: Puzzle = {
  id: 'duel',
  world: 0,
  title: 'Ink Duel',
  get story(): string {
    const rival = currentRival();
    return `${rival.name}, ${rival.title}, steps out of the screen and challenges you. Draw in the air: a line is ink to throw, and a closed shape comes alive and fights beside you.`;
  },
  ask: 'Pinch and draw in the air',
  handsOn: true,
  solved: 'A duel well fought.',
  build(root, kit) {
    const duel = new InkDuel(root, kit.floor);
    root.add(duel.group);
    stage.runNotes = () => duel.journal();
    const task = { caption: '', done: false, mistakes: 0 };
    stage.task = task;
    return {
      start: new Vector3(0, kit.floor, 0.12),
      attempt: () => ({ solved: false, steps: [], line: 'Draw and throw!' }),
      update: (dt, hands, head) => {
        duel.update(dt, hands, head);
        task.caption = duel.caption;
        task.done = duel.done;
        task.mistakes = duel.mistakes;
        DUEL.solved = duel.won ? `You beat ${duel.spec.name}! Your ink flew true.` : `${duel.spec.name} won this time. Try again!`;
      },
    };
  },
};

/** The puzzle at a story index, the duel, or null (free play). */
/** The Daily Light: a side game like the duel, a new proven course each day. */
export const DAILY_INDEX = 1001;
let daily: { key: string; puzzle: Puzzle } | null = null;

/** Today's Daily Light puzzle (rebuilt when the date changes). */
export function dailyPuzzle(): Puzzle {
  const key = dateKey();
  if (daily?.key !== key) daily = { key, puzzle: runPuzzle(dailyLevel(key)) };
  return daily.puzzle;
}

/** The Workshop: build your own course (a fresh level each visit, with your saved design). */
export const WORKSHOP_INDEX = 1002;
let workshop: Puzzle | null = null;

/** Rebuilds the Workshop from the saved design; called each time it is entered. */
export function refreshWorkshop(): void {
  workshop = runPuzzle(workshopLevel());
}

/** Side games (the duel, the Daily Light, the Workshop) sit outside the story and never move its saved place. */
export function isSideGame(index: number): boolean {
  return index >= DUEL_INDEX;
}

export function puzzleAt(index: number): Puzzle | null {
  if (index === DUEL_INDEX) return DUEL;
  if (index === DAILY_INDEX) return dailyPuzzle();
  if (index === WORKSHOP_INDEX) {
    if (!workshop) refreshWorkshop();
    return workshop;
  }
  return PUZZLES[index] ?? null;
}

/** A Shadow Run level: the spark on the screen, your hands' shadows as its ground. */
function runPuzzle(level: RunLevel): Puzzle {
  // The clear card's line: the time, and whether it beat your best.
  let line = 'Through the gate.';
  return {
    id: level.id,
    world: level.world ?? 0,
    title: level.title,
    story: level.story,
    ask: level.ask,
    handsOn: true,
    painted: true,
    get solved() {
      return line;
    },
    build(root, kit) {
      const run = new ShadowRun(root, level);
      let recorded = false;
      stage.runNotes = () => run.journal();
      const task: { caption: string; done: boolean; mistakes: number; stars?: number } = { caption: level.ask, done: false, mistakes: 0 };
      stage.task = task;
      return {
        start: new Vector3(0, kit.floor, 0.12),
        attempt: () => ({ solved: false, steps: [], line: 'The spark needs your shadow.' }),
        update: (dt, hands) => {
          run.update(dt, hands);
          task.caption = run.caption;
          task.mistakes = run.sim.retries;
          task.done = run.done;
          if (run.done) task.stars = run.stars;
          if (run.done && !recorded) {
            recorded = true;
            const time = run.sim.time;
            const key = level.bestKey ?? level.id;
            const before = play.best[key];
            if (before === undefined || time < before) play.best[key] = time;
            line = before === undefined
              ? `Through the gate in ${time.toFixed(1)} s.`
              : time < before
                ? `${time.toFixed(1)} s: a new best (was ${before.toFixed(1)} s).`
                : `${time.toFixed(1)} s. Your best is ${before.toFixed(1)} s.`;
            if (level.id === 'daily') {
              const streak = noteDaily();
              line += streak > 1 ? `  Day streak: ${streak}. A new course at midnight.` : '  A new course at midnight.';
            }
          }
        },
      };
    },
  };
}

/**
 * The story, in order: light and shadow (the spark), structures, fire and
 * iron, hot air, the dragon. The shadow-animal levels (Fallen Log, Tiny
 * Tunnel, High Berries, Lost Star, the hare's walks, the Old Well, Deep
 * Shaft) are retired from the story; their code stays.
 */
export const PUZZLES: Puzzle[] = [
  warmup,
  ...RUN_LEVELS.filter((l) => !l.build).map(runPuzzle),
  ...RUN_LEVELS.filter((l) => l.build).map(runPuzzle),
  shadowSlingshot,
  brokenBridge,
  oreTrain,
  fightRook,
  smithy,
  healingDraught,
  strongDraught,
  fightVance,
  swordTraining,
  skyLantern,
  fightKai,
  gateLock,
  shadowDragon,
  fightMorwen,
];

/**
 * The thread through every level: the Great Lantern lies in pieces, and
 * each level wins one back. Sparks in the jungle, glass shards on the river,
 * and a heart shard from each captain. Whole again, its light breaks the
 * dragon's trance, and the freed dragon stands with you against Morwen.
 */
const GAINS: Record<string, string> = {
  lantern: 'Your first shadow. Morwen’s ink cannot touch it: this is how you will escape.',
  'run-bridge': 'The spark is home: the first piece of the Great Lantern is back.',
  'run-ramp': 'Another spark climbs out of the ink and back to the Lantern.',
  'run-kick': 'Knocked free of the ink, one more spark returns to the Lantern.',
  'run-long': 'Your shadow stretched over the gap, and another spark is saved.',
  'run-tunnel': 'Morwen’s drain is jammed shut, and its spark is free.',
  'run-twin': 'The jungle’s last spark is safe. The road to the river is open.',
  'build-plank': 'A shard of Lantern glass became your bridge over Rook’s flood.',
  'build-projection': 'A small shard, a big shadow: across, and the shard goes in your pack.',
  'build-launch': 'Past Rook’s lookouts unseen, with one more shard.',
  'build-slide': 'Caught on glass and carried to the gate: another shard.',
  'build-pair': 'Two shards working together. Rook’s valley is nearly crossed.',
  'shadow-slingshot': 'The caged shard is free and Rook’s alarm is silenced: he does not know you are coming.',
  'broken-bridge': 'The cart of Lantern shards crosses the river on your bridge.',
  'ore-train': 'The cart rolls on towards the mine. But Rook has seen it.',
  'fight-rook': 'Rook is beaten. His heart shard, the first of the Lantern’s three hearts, is yours.',
  smithy: 'An axe of real steel: Vance’s iron roots will not stop you.',
  'healing-draught': 'Two healing draughts for the fights ahead.',
  'strong-draught': 'Full-strength draughts: enough to stand the dragon’s fire.',
  'fight-vance': 'Vance’s ink runs dry. The second heart shard is yours.',
  'sword-training': 'The Shadow Blade is yours: block, parry, and the Dawn Cut.',
  'sky-lantern': 'Up the cliff to the top of the pass, where Kai is waiting.',
  'fight-kai': 'Kai yields the third heart shard. The Great Lantern is whole again.',
  'gate-lock': 'The gate swings open. The dragon waits at the summit.',
  'shadow-dragon': 'The Lantern’s light breaks the trance. The dragon is free, and it stands with you now.',
  'fight-morwen': 'Morwen is gone, her ink dries to dust, and the Great Lantern burns at the top of the world.',
};
for (const puzzle of PUZZLES) puzzle.gain = GAINS[puzzle.id];

/** Pieces of the Great Lantern won back: one for every story level cleared. */
export function lanternPieces(): { have: number; total: number } {
  return { have: PUZZLES.filter((p) => (play.stars[p.id] ?? 0) > 0).length, total: PUZZLES.length };
}
