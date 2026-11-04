import { play } from './progress.js';

/**
 * The Inventor's Journal: one page for every level, filled in as you clear
 * it. Each page names the real science the level runs on, its formula, a
 * sketch, and your own numbers from the run: how big your horse was and
 * how much strength it had to spare, the hottest your iron got, the
 * hardest-working timber in your bridge.
 */

export type Diagram =
  | 'optics'
  | 'ramp'
  | 'scaling'
  | 'pendulum'
  | 'gears'
  | 'work'
  | 'truss'
  | 'buckling'
  | 'heat'
  | 'arrhenius'
  | 'balloon'
  | 'reflection'
  | 'projectile'
  | 'pins';

export interface JournalPage {
  /** The level's id. */
  id: string;
  /** The science, as the page's heading. */
  topic: string;
  formula: string;
  body: string;
  diagram: Diagram;
}

/** In story order, the Ink Duel last. */
export const JOURNAL: JournalPage[] = [
  {
    id: 'lantern',
    topic: 'Light Travels in Straight Lines',
    formula: 'shadow = hand × D ÷ d',
    body: 'Light leaves the lantern in straight lines. Your hand blocks a cone of it, and the cone keeps widening until it meets the screen. Bring your hand nearer the lantern (a smaller d) and the shadow grows: a hand close to the light casts a giant.',
    diagram: 'optics',
  },
  {
    id: 'shadow-bridge',
    topic: 'A Shadow Is Missing Light',
    formula: 'still hand → still shadow',
    body: 'A shadow is the shape of the light that never arrived. Hold your hand still and its shadow is as steady as a plank. In the shadow world anything dark is solid ground, so your hand can be a bridge.',
    diagram: 'optics',
  },
  {
    id: 'high-ledge',
    topic: 'The Inclined Plane',
    formula: 'effort × length = load × height',
    body: 'Your friend can only step up a little at a time. A ramp turns one big climb into many small steps: the gentler the slope, the longer the walk and the easier each step. It is the oldest machine there is.',
    diagram: 'ramp',
  },
  {
    id: 'fallen-log',
    topic: 'The Square–Cube Law',
    formula: 'strength ∝ size²   weight ∝ size³',
    body: 'A muscle’s strength comes from its cross-section, an area; a body’s weight from its volume. Double a friend’s size and it is 4× as strong but 8× as heavy. That is why an ant lifts fifty times its weight and an elephant cannot jump.',
    diagram: 'scaling',
  },
  {
    id: 'tiny-tunnel',
    topic: 'Legs Swing Like Pendulums',
    formula: 'walk speed ∝ √size',
    body: 'A walking leg swings like a pendulum, and a pendulum’s swing takes longer the longer it is (by the square root). Small friends take quick little steps; big ones stride slowly but cover more ground. Engineers call it the Froude number.',
    diagram: 'pendulum',
  },
  {
    id: 'high-berries',
    topic: 'Size Sets the Reach',
    formula: 'reach = size × normal height',
    body: 'A friend twice the size reaches twice as high, but carries eight times the weight. Its bones must grow thicker faster than it grows taller, which Galileo noticed in 1638 drawing the bones of giants.',
    diagram: 'scaling',
  },
  {
    id: 'lost-star',
    topic: 'Magnification',
    formula: 'magnification = D ÷ d',
    body: 'To make a small friend, move your hand away from the lantern, towards the screen. As d grows towards D the magnification falls towards 1, and the shadow shrinks to the size of your hand.',
    diagram: 'optics',
  },
  {
    id: 'old-well',
    topic: 'The Horse Whim',
    formula: '36 cogs ÷ 9 staves = 4 : 1',
    body: 'A horse walking round turns the great crown wheel. Its 36 cogs drive a 9-stave lantern pinion four times as fast, winding the rope onto the drum. A ratchet and pawl clicks into each tooth, so the bucket can never run back down.',
    diagram: 'gears',
  },
  {
    id: 'deep-shaft',
    topic: 'Work = Force × Distance',
    formula: 'W = F × s',
    body: 'Twice the weight takes twice the force through the same gears. A bigger horse brings it, since strength grows with size². With smaller gears a weaker horse could do it, but it would walk twice as far: no machine gives work for free.',
    diagram: 'work',
  },
  {
    id: 'broken-bridge',
    topic: 'Why Bridges Are Triangles',
    formula: 'three sides fix one shape',
    body: 'Timbers joined by pins can swing. A square racks over into a diamond, but a triangle’s three lengths allow only one shape. Every truss is triangles: the top timbers are squeezed (compression), the bottom ones stretched (tension).',
    diagram: 'truss',
  },
  {
    id: 'ore-train',
    topic: 'Buckling',
    formula: 'P = π²EI ÷ L²',
    body: 'A long strut being squeezed does not crush, it bows sideways and gives way. Halve its length and it carries four times the load (Euler, 1744). Braces and extra joints keep every strut short.',
    diagram: 'buckling',
  },
  {
    id: 'smithy',
    topic: 'The Colours of Hot Iron',
    formula: 'glow ∝ T⁴ (Stefan–Boltzmann)',
    body: 'Hot iron glows as its atoms shake: a dull red from 525 °C, cherry by 800, orange, then yellow-white at 1200. Steel is soft enough to shape above 760 °C. Plunged into water from cherry red, it freezes into hard martensite.',
    diagram: 'heat',
  },
  {
    id: 'healing-draught',
    topic: 'Hotter Is Faster',
    formula: 'rate = A · e^(−Ea/RT)  (Arrhenius)',
    body: 'Heat makes molecules move faster and collide harder, so the herbs give up their goodness more quickly: near the boil, every 10 °C makes this pot steep about a third faster. Too hot, though, and the goodness breaks down faster than it steeps.',
    diagram: 'arrhenius',
  },
  {
    id: 'strong-draught',
    topic: 'Two Reactions Race',
    formula: 'steep Ea/R = 4 000 K   spoil Ea/R = 15 000 K',
    body: 'Spoiling has the bigger activation energy, so heat speeds it up far more: near the boil, 10 °C more makes steeping 1.3× faster but spoiling 3× faster. Simmer just below and steeping wins; boil, and spoiling wins. Cooks and chemists live by this.',
    diagram: 'arrhenius',
  },
  {
    id: 'sky-lantern',
    topic: 'Hot Air Rises',
    formula: 'lift = V·g·ρ·(1 − T_out ÷ T_in)',
    body: 'Hot air is thinner than cold, so a bag of it weighs less than the air it pushes aside (Archimedes). The lantern’s 1.1 litres of air weigh 1.3 g; heated to 412 K, 29% of that weight is gone: 0.38 g of lift for 0.35 g of paper and stone.',
    diagram: 'balloon',
  },
  {
    id: 'gate-lock',
    topic: 'The Pin-Tumbler Lock',
    formula: 'opens when every gap meets the shear line',
    body: 'Each stack is a key pin and a driver pin, pushed down by a spring. The plug turns only when every gap between them sits at the shear line. No lock is made perfectly, so under a gentle twist one pin binds at a time. Linus Yale Jr. patented this cylinder lock in 1861.',
    diagram: 'pins',
  },
  {
    id: 'shadow-dragon',
    topic: 'Angle In, Angle Out',
    formula: "v' = v − 2(v·n)n",
    body: 'Fire and light bounce off a mirror at the angle they arrive. Tilt your palm and you aim the bounce: the fireball’s direction flips about the line straight out of your palm (its normal, n). Your shield of light even adds a quarter more speed.',
    diagram: 'reflection',
  },
  {
    id: 'duel',
    topic: 'The Energy of a Throw',
    formula: 'E = ½ m v²',
    body: 'A throw’s damage is its kinetic energy. Twice the mass gives twice the energy, but twice the speed gives four times: a small, fast drawing beats a big, slow one. Ink falls under gravity on the way, so aim a little high.',
    diagram: 'projectile',
  },
];

/** At a level's clear: write its page's "your run" lines. True if the page is new. */
export function noteRun(id: string, lines: string[]): boolean {
  if (!JOURNAL.some((p) => p.id === id)) return false;
  const fresh = !play.journal[id];
  play.journal[id] = lines;
  return fresh;
}

export function pagesFilled(): number {
  return JOURNAL.filter((p) => play.journal[p.id]).length;
}

/** Your friend's body, from its shadow: the scaling laws with your numbers in. */
export function friendRunLines(shadowSpan: number, size: number): string[] {
  return [
    `Your shadow: ${Math.round(shadowSpan * 100)} cm across the screen`,
    `Your friend: ${size.toFixed(2)}× normal size`,
    `Strength ×${(size * size).toFixed(2)} · weight ×${(size ** 3).toFixed(2)} · stride ×${Math.sqrt(size).toFixed(2)}`,
  ];
}
