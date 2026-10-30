/**
 * Shadow shape matching. Pure functions, no Three.js or DOM.
 *
 * A raw shadow mask (RGBA pixels rendered from the lantern's point of view) is
 * cropped to its bounding box and resampled into a square GRID x GRID cell
 * map, so matching ignores where on the paper the shadow is and how big it is.
 * Two normalized maps are then compared with intersection-over-union.
 */

export const GRID = 32;
export const GRID_CELLS = GRID * GRID;

/** Fewer lit mask pixels than this counts as "no shadow". */
const MIN_PIXELS = 20;

export interface MaskBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

export function createBounds(): MaskBounds {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0, count: 0 };
}

export function copyBounds(from: MaskBounds, to: MaskBounds): void {
  to.minX = from.minX;
  to.minY = from.minY;
  to.maxX = from.maxX;
  to.maxY = from.maxY;
  to.count = from.count;
}

/** Which hand(s) to read from the mask: left is red, right is green. */
export const MaskChannel = { Left: 0, Right: 1, Both: -1 } as const;
export type MaskChannel = (typeof MaskChannel)[keyof typeof MaskChannel];

function isShadow(rgba: Uint8Array, pixel: number, channel: MaskChannel): boolean {
  const o = pixel * 4;
  return channel === MaskChannel.Both
    ? rgba[o] > 127 || rgba[o + 1] > 127
    : rgba[o + channel] > 127;
}

/**
 * Normalizes one channel of an RGBA mask into `out`.
 * Returns false when there is not enough shadow to match against.
 */
export function normalizeMask(
  rgba: Uint8Array,
  width: number,
  height: number,
  channel: MaskChannel,
  out: Uint8Array,
  bounds: MaskBounds,
): boolean {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isShadow(rgba, y * width + x, channel)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  bounds.minX = minX;
  bounds.minY = minY;
  bounds.maxX = maxX;
  bounds.maxY = maxY;
  bounds.count = count;
  out.fill(0);
  if (count < MIN_PIXELS) return false;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const size = Math.max(bw, bh);
  const startX = minX - (size - bw) / 2;
  const startY = minY - (size - bh) / 2;
  const step = size / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    const sy = Math.floor(startY + (gy + 0.5) * step);
    if (sy < minY || sy > maxY) continue;
    for (let gx = 0; gx < GRID; gx++) {
      const sx = Math.floor(startX + (gx + 0.5) * step);
      if (sx < minX || sx > maxX) continue;
      if (isShadow(rgba, sy * width + sx, channel)) out[gy * GRID + gx] = 1;
    }
  }
  return true;
}

/**
 * Forgiving intersection-over-union. A cell only counts as a miss when there
 * is no matching cell within one step of it, so slightly thicker or thinner
 * fingers than the target still score well.
 */
export function matchScore(shadow: Uint8Array, target: Uint8Array): number {
  let hit = 0;
  let miss = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const s = shadow[i];
      const t = target[i];
      if (s && t) hit++;
      else if (s && !hasNeighbor(target, x, y)) miss++;
      else if (t && !hasNeighbor(shadow, x, y)) miss++;
    }
  }
  const total = hit + miss;
  return total === 0 ? 0 : hit / total;
}

function hasNeighbor(cells: Uint8Array, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= GRID) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= GRID) continue;
      if (cells[ny * GRID + nx]) return true;
    }
  }
  return false;
}

/** Packs a normalized map into a 256-char hex string for level data. */
export function encodeCells(cells: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < GRID_CELLS; i += 4) {
    const nibble =
      (cells[i] << 3) | (cells[i + 1] << 2) | (cells[i + 2] << 1) | cells[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

export function decodeCells(hex: string): Uint8Array {
  const cells = new Uint8Array(GRID_CELLS);
  for (let i = 0; i < hex.length && i * 4 < GRID_CELLS; i++) {
    const nibble = parseInt(hex[i], 16);
    cells[i * 4] = (nibble >> 3) & 1;
    cells[i * 4 + 1] = (nibble >> 2) & 1;
    cells[i * 4 + 2] = (nibble >> 1) & 1;
    cells[i * 4 + 3] = nibble & 1;
  }
  return cells;
}
