import type { Group, ShadowMaterial } from '@iwsdk/core';

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
  shadowMaterial: null as ShadowMaterial | null,
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
   * consumed by the creature system. x/y are paper-local meters.
   */
  spawns: [] as Array<{ kind: string; x: number; y: number }>,
};
