import { Color } from '@iwsdk/core';

/**
 * Real heat: what colour hot iron glows and how fast things heat and cool.
 *
 * The glow is Planck's law for a black body, integrated against the CIE 1931
 * colour-matching functions and converted to sRGB, so iron starts to glow a
 * dull red at the Draper point (about 525 °C) and climbs through cherry,
 * orange and yellow to white exactly as a smith sees it. Cooling is
 * radiation (Stefan–Boltzmann, ∝ T⁴) plus convection; heating in the fire
 * is Newton's law towards the coals' temperature.
 */

/** Room temperature, °C. */
export const ROOM = 20;
/** Iron starts to glow visibly here (the Draper point). */
export const DRAPER = 525;

/** Iron shapes well under the hammer in this band; colder cracks, hotter burns. */
export const FORGE_MIN = 900;
export const FORGE_MAX = 1260;
/** Below this a blow just rings off; between this and FORGE_MIN it moves a little. */
export const WORKABLE = 760;
/** Steel this hot starts to burn: white sparks, scale flaking off. */
export const BURNING = 1330;

const LUT_MIN = 400;
const LUT_MAX = 1700;
const LUT_STEP = 10;
const colors: Color[] = [];
const brightness: number[] = [];

/** Gaussian lobe with different widths either side of its peak (Wyman, Sloan & Shirley 2013). */
function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

function buildTable(): void {
  const c2 = 1.4388e-2; // second radiation constant hc/k, m·K
  const raw: Array<[number, number, number, number]> = [];
  for (let t = LUT_MIN; t <= LUT_MAX; t += LUT_STEP) {
    const kelvin = t + 273.15;
    let X = 0;
    let Y = 0;
    let Z = 0;
    for (let nm = 380; nm <= 780; nm += 5) {
      const lambda = nm * 1e-9;
      // Planck spectral radiance (constant factors drop out on normalising).
      const b = 1 / (lambda ** 5 * (Math.exp(c2 / (lambda * kelvin)) - 1));
      X += b * (1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2));
      Y += b * (0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1));
      Z += b * (1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8));
    }
    raw.push([X, Y, Z, t]);
  }
  const yDraper = raw[Math.round((DRAPER - LUT_MIN) / LUT_STEP)][1];
  const yWhite = raw[raw.length - 1][1];
  for (const [X, Y, Z] of raw) {
    // XYZ → linear sRGB, clipped and normalised to the brightest channel.
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
    r = Math.max(0, r);
    g = Math.max(0, g);
    b = Math.max(0, b);
    const m = Math.max(r, g, b, 1e-30);
    colors.push(new Color(r / m, g / m, b / m));
    // Perceived brightness on a log scale: 0 at the Draper point, 1 at white heat.
    brightness.push(Math.max(0, Math.log(Y / yDraper) / Math.log(yWhite / yDraper)));
  }
}

/**
 * Glow of a black body at `celsius`: `out` gets the linear colour, and the
 * return value is its brightness (0 below the Draper point, 1 at white heat).
 */
export function glow(celsius: number, out: Color): number {
  if (colors.length === 0) buildTable();
  if (celsius <= LUT_MIN) {
    out.copy(colors[0]);
    return 0;
  }
  const f = (Math.min(celsius, LUT_MAX) - LUT_MIN) / LUT_STEP;
  const i = Math.min(colors.length - 2, Math.floor(f));
  const k = f - i;
  out.copy(colors[i]).lerp(colors[i + 1], k);
  return brightness[i] + (brightness[i + 1] - brightness[i]) * k;
}

/** The names smiths give each heat, hottest first. */
const NAMES: Array<[number, string]> = [
  [1330, 'sparkling white: burning'],
  [1200, 'yellow'],
  [1050, 'orange-yellow'],
  [900, 'orange'],
  [800, 'cherry red'],
  [700, 'dull red'],
  [DRAPER, 'faint red'],
  [-Infinity, 'black'],
];

export function heatName(celsius: number): string {
  return NAMES.find(([t]) => celsius >= t)![1];
}

/**
 * One step of a small iron part's temperature. `surround` is what it is
 * touching (the coals, water, or air at room temperature); `contact` how well
 * heat passes (1 = in the coals, ~3 = plunged in water, 0 = just air).
 * Radiation and convection always cool it towards the room.
 */
export function stepHeat(celsius: number, dt: number, surround: number, contact: number): number {
  const kelvin = celsius + 273.15;
  const room = ROOM + 273.15;
  // Calibrated so a glowing bar loses ~25 °C/s at 1100 °C and ~7 °C/s at 700 °C.
  const radiation = 6.2e-12 * (kelvin ** 4 - room ** 4);
  const convection = 0.0028 * (celsius - ROOM);
  const conduction = (contact / 4.5) * (surround - celsius);
  return celsius + (conduction - radiation - convection) * dt;
}

/**
 * The fire: charcoal burns hotter with more air. Without the bellows it
 * smoulders around 650 °C; with a steady draught it reaches about 1350 °C.
 */
export function fireTarget(air: number): number {
  // Furious pumping (air above 1) overheats it: steel left in too long burns.
  return 650 + 720 * Math.min(1.4, Math.max(0, air));
}
