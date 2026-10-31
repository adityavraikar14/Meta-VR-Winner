import { Group, type MeshStandardMaterial, type Object3D, Vector3 } from '@iwsdk/core';
import type { TaskStep } from '../creatures/creature.js';
import type { Effects } from '../creatures/fx.js';
import type { WalkLevel } from '../shadow-world.js';
import { decorateForest, decorateMountain, decoratePond } from './scenery.js';
import {
  berries,
  berryTree,
  bush,
  carrot,
  goldStar,
  hollowLog,
  log,
  moundMark,
  mushroom,
  rootArch,
} from './props.js';

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
  attempt(kind: string): Attempt;
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
  /** Caption once solved. */
  solved: string;
  build(root: Group, kit: Kit): PuzzleScene;
}

export interface World {
  name: string;
  /** Builds the world's miniature landscape on the stage, its ground at `floor`. */
  decorate(root: Group, floor: number): void;
}

const NAMES: Record<string, string> = {
  rabbit: 'Rabbit',
  snail: 'Snail',
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
  { name: 'Whispering Forest', decorate: decorateForest },
  { name: 'Moonlit Pond', decorate: decoratePond },
  { name: "Dragon's Mountain", decorate: decorateMountain },
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
  story: 'A little lantern glows behind you. Its light makes magic shadows.',
  ask: 'Raise your hand into the lantern light',
  warmup: true,
  solved: "That's your shadow! Let's bring it to life.",
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
  story: 'In the shadow world, your shadow is solid! A little shadow rabbit wants that star.',
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
  story: 'Pinch your fingers to pull a thread of shadow ink. Its shadow is solid too!',
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
  story: 'A fallen log blocks the way to a juicy carrot.',
  ask: 'Who can hop over the log?',
  teach: 'rabbit',
  solved: 'Crunch! The Rabbit got the carrot.',
  build(root, kit) {
    const f = kit.floor;
    // Turned three-quarters to the viewer so it reads as a log, not a pipe.
    place(root, log(0.2, 0.026), 0, f, -0.01, 1.05);
    for (const t of [-0.07, 0, 0.07]) kit.block(t * 0.5, -0.01 - t * 0.87, 0.035);
    const food = place(root, carrot(), 0.15, f, 0.02, 0.3, 1.2);
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
          { do: 'pose', pose: 'eat', time: 1.5, look: kit.where(food) },
          { do: 'call', run: () => { food.visible = false; kit.chime(); } },
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
  story: 'The glow mushroom fell asleep behind the old roots.',
  ask: 'Only someone tiny fits under the roots',
  teach: 'snail',
  solved: 'The Snail woke the glow mushroom!',
  build(root, kit) {
    const f = kit.floor;
    // The path runs diagonally through the arch, so the viewer sees the
    // snail go in one side and out the other.
    const turn = -0.7;
    const ax = Math.cos(turn);
    const az = -Math.sin(turn);
    const on = (t: number) => kit.at(ax * t, f, az * t);
    place(root, rootArch(0.105), 0, f, 0, turn);
    for (const side of [-1, 1]) kit.block(-az * 0.105 * side, ax * 0.105 * side, 0.035);
    place(root, bush(0.07, 0x5d9e52), az * 0.17, f, -ax * 0.17, turn);
    place(root, bush(0.06, 0x6aa95a), -az * 0.17, f, ax * 0.17, turn);
    kit.block(az * 0.17, -ax * 0.17, 0.05);
    kit.block(-az * 0.17, ax * 0.17, 0.05);
    const glow = mushroom(0.04, 0x9b7bff);
    place(root, glow.group, ax * 0.17, f, az * 0.17);
    kit.block(ax * 0.17, az * 0.17, 0.035);
    return {
      start: new Vector3(-ax * 0.17, f, -az * 0.17),
      attempt: () => ({
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
  story: 'Sweet berries hang from a branch, high up in the old tree.',
  ask: 'Who is tall enough to reach them?',
  teach: 'stag',
  solved: 'Berries for everyone!',
  build(root, kit) {
    const f = kit.floor;
    const tree = berryTree(0.24, 0.11);
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
  story: 'A star fell from the sky and rolled inside a hollow log!',
  ask: 'Who is small enough to fit inside?',
  solved: 'The star is free! The forest is glowing again.',
  build(root, kit) {
    const f = kit.floor;
    // Angled so the near opening faces the viewer and the star shows inside.
    const turn = 0.6;
    const cx = 0.03;
    const cz = -0.02;
    const ax = Math.cos(turn);
    const az = -Math.sin(turn);
    const along = (t: number, y = f) => kit.at(cx + ax * t, y, cz + az * t);
    place(root, hollowLog(0.17, 0.056), cx, f, cz, turn);
    for (const t of [-0.06, 0, 0.06]) kit.block(cx + ax * t, cz + az * t, 0.055);
    const star = goldStar(0.018);
    place(root, star.group, cx, f + 0.03, cz);
    kit.spin(star.group, 2);
    const mouth = along(-0.085, f + 0.04);
    const exit = { x: cx + ax * 0.13, z: cz + az * 0.13 };
    return {
      start: new Vector3(cx - ax * 0.2, f, cz - az * 0.2),
      attempt: (kind) => {
        if (kind === 'snail') {
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
        const line = kind === 'stag'
          ? 'The Deer is far too tall for the log!'
          : `The ${friendName(kind)} is too big to fit inside!`;
        return bumpAndShrug(kit, along(-0.13), mouth, line);
      },
    };
  },
};

/** A buried or hidden star for a new friend to find; chapters 2 and 3 for now. */
function findStar(
  id: string,
  world: number,
  teach: string,
  title: string,
  story: string,
  ask: string,
  solved: string,
): Puzzle {
  return {
    id,
    world,
    title,
    story,
    ask,
    teach,
    solved,
    build(root, kit) {
      const f = kit.floor;
      place(root, moundMark(), 0.06, f, 0);
      kit.block(0.06, 0, 0.035);
      const star = goldStar(0.018);
      place(root, star.group, 0.06, f + 0.005, 0);
      star.group.visible = false;
      return {
        start: new Vector3(-0.14, f, 0.05),
        attempt: () => ({
          solved: true,
          steps: [
            { do: 'walk', to: kit.at(0.0, f, 0.01) },
            { do: 'pose', pose: teach === 'horse' ? 'sniff' : 'look', time: 0.9, look: kit.at(0.06, f, 0) },
            { do: 'pose', pose: teach === 'horse' ? 'dig' : 'reach', time: 1.1, look: kit.at(0.06, f, 0) },
            {
              do: 'call',
              run: () => {
                star.group.visible = true;
                kit.spin(star.group, 2.5);
                kit.chime();
                kit.tween(1.2, (k) => star.group.position.setY(f + 0.005 + k * 0.12));
              },
            },
            { do: 'pose', pose: 'cheer', time: 1.8 },
          ],
        }),
      };
    },
  };
}

export const PUZZLES: Puzzle[] = [
  warmup,
  shadowBridge,
  highLedge,
  fallenLog,
  tinyTunnel,
  highBerries,
  lostStar,
  findStar('buried-lantern', 1, 'horse', 'The Buried Lantern', 'Something shiny is buried by the pond.', 'Who has the best nose?', 'The Horse sniffed it out!'),
  findStar('pond-song', 1, 'bird', 'The Silent Pond', 'The pond is too quiet. It needs a song.', 'Who can sing the pond awake?', 'The Bird sang, and a star woke up!'),
  findStar('night-flowers', 1, 'butterfly', 'The Night Flowers', 'The flowers closed up for the night.', 'Who can wake the flowers gently?', 'The flowers opened for the Butterfly!'),
  findStar('great-lantern', 2, 'dragon', 'The Great Lantern', 'On top of the mountain, the Great Lantern has gone out.', 'Who can light it with a tiny spark?', 'The Dragon lit the Great Lantern! The end... for now.'),
];
