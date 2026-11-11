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
  | 'pins'
  | 'slingshot';

export interface JournalPage {
  /** The level's id. */
  id: string;
  /** The science, as the page's heading. */
  topic: string;
  formula: string;
  body: string;
  diagram: Diagram;
  /** For a page that is not a level's own: its heading, chapter line, and the level Replay opens. */
  title?: string;
  chapter?: string;
  replay?: string;
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
    id: 'run-bridge',
    topic: 'A Shadow Is Missing Light',
    formula: 'shadow = where the light never arrives',
    body: 'A shadow is not a thing; it is a gap in the light. The spark can only touch the paper where light is missing, so the gap your hand makes is solid ground. Hold still, and the ground holds still.',
    diagram: 'optics',
  },
  {
    id: 'run-ramp',
    topic: 'Height Becomes Speed',
    formula: 'm g h = ½ m v²',
    body: 'Falling, the spark trades height for speed: from a drop h it reaches v = √(2gh). That speed can carry it back up a slope almost as high as it started. Every sharp corner throws some away, which is why the chute curves.',
    diagram: 'ramp',
  },
  {
    id: 'run-kick',
    topic: 'Bounce',
    formula: 'struck at rest: v = (1 + e) · u',
    body: 'A still shadow only catches the spark; a moving one throws it. Hit by a surface moving at speed u, a resting spark leaves at (1 + e)·u, where e is its bounciness: 0 for clay, 1 for a perfect bounce. And your shadow moves D ÷ d times faster than your hand.',
    diagram: 'reflection',
  },
  {
    id: 'run-long',
    topic: 'Magnification',
    formula: 'M = D ÷ d',
    body: 'Your shadow is your hand magnified by D ÷ d: the lantern-to-screen distance over the lantern-to-hand distance. Halve d by bringing your hand towards the lantern, near your face, and the shadow doubles: long enough to span a gap wider than your arm.',
    diagram: 'optics',
  },
  {
    id: 'run-tunnel',
    topic: 'Similar Triangles',
    formula: 'every length × D ÷ d',
    body: 'Magnification stretches every length of the shadow by the same factor, its thickness too. To fit a low tunnel, shrink the whole shadow: move your hand away from the lantern, towards the screen, until a thin edge is all that is left.',
    diagram: 'scaling',
  },
  {
    id: 'run-twin',
    topic: 'Reaction Time',
    formula: 't = distance ÷ speed',
    body: 'Rolling at 0.6 m/s, the spark crosses a 25 cm gap in about 0.4 s, and a person needs about 0.25 s just to react. So you do not chase the spark: you read its path, and put the shadow there first.',
    diagram: 'projectile',
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
    id: 'arsenal',
    title: 'The Arsenal',
    chapter: 'Arsenal fights: the dragon, or the Arena',
    replay: 'shadow-dragon',
    topic: 'Stretch, Snap, Arc',
    formula: '½kx² = ½mv²',
    body: 'A slingshot’s bands store energy as you pull: pull twice as far and they hold four times as much. Let go and that energy becomes the stone’s speed, so the speed grows in step with the pull. Then gravity bends every shot, stone, spear or power ball, into an arc: aim a little high for a far target.',
    diagram: 'slingshot',
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
