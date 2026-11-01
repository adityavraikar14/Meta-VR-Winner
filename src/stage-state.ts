import type { Entity, Group, ShadowMaterial, Vector3 } from '@iwsdk/core';

/** Paper screen size in meters. */
export const PAPER_WIDTH = 1.0;
export const PAPER_HEIGHT = 0.7;

/** Shadow mask resolution, matching the paper's aspect ratio. */
export const MASK_WIDTH = 80;
export const MASK_HEIGHT = 56;

/**
 * State shared between the stage (paper, lantern, hand shadows) and the game
 * (levels, matching, creatures). The stage writes it, the game reads it.
 */
export const stage = {
  /** Paper root. Local +Z faces the player, origin is the paper center. */
  paper: null as Group | null,
  /** The paper's entity, for parenting interactive children. */
  paperEntity: null as Entity | null,
  shadowMaterial: null as ShadowMaterial | null,
  /** Lantern position in paper space; shadows are cast from here. */
  lantern: [0, 0, 1] as [number, number, number],
  /** RGBA shadow mask as seen from the lantern, row 0 at the paper bottom. */
  mask: new Uint8Array(MASK_WIDTH * MASK_HEIGHT * 4),
  /** Incremented every time a new mask has been read back. */
  maskVersion: 0,
  /** Number of tracked hands this frame. */
  handCount: 0,
  /** Joint positions (25 x xyz, WebXR joint order) per hand: [left, right]. */
  joints: [new Float32Array(75), new Float32Array(75)] as const,
  /** Whether each hand's joints are valid this frame: [left, right]. */
  tracked: [false, false],
  /**
   * Creatures waiting to step out of the paper, queued by the game and
   * consumed by the creature system. x/y are paper-local meters. `attempt`
   * sends the creature to try the puzzle on stage.
   */
  /** Friends to bring to life; `size` is body size from the shadow (1 = normal). */
  spawns: [] as Array<{ kind: string; x: number; y: number; attempt?: boolean; size?: number }>,
  /** A hand-menu choice waiting to be handled by the stage or the game. */
  command: null as MenuCommand | null,
  /** The hand menu is open: the game pauses judging so the menu hand is not scored. */
  menuOpen: false,
  /** World height of the player's real table, once they have laid a hand on it. */
  tableHeight: null as number | null,
  /** The world is not here yet: the player hasn't shown us their table. */
  sceneryHidden: false,
  /** A world to show while the player browses chapters (null: the current level's world). */
  previewWorld: null as number | null,
  /** The level is being played right now (not the menu, the table or the story card). */
  playing: false,
  /** A hands-on level's progress: what to do next, and whether it is finished. */
  task: null as { caption: string; done: boolean; mistakes: number } | null,
  /** Ask the world to grow, from a world point (or its centre if null). Consumed once. */
  grow: null as { from: Vector3 | null } | null,
};

export type MenuCommand = 'recenter' | 'restart' | 'skip' | 'menu';
