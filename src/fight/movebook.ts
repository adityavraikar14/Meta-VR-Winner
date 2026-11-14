import type { Shot } from './rivals.js';

/**
 * Every fighter's move book: twenty named moves each, attacks and ways of
 * getting about, built from a shared set of techniques. A fight deals them
 * from a shuffled deck, so every move turns up and no two fights run the
 * same; the big ones wait until the fighter is hurt.
 *
 * Attacks (where the ink comes from, and when):
 *   shot      one throw
 *   double    two, a quarter second apart
 *   burst     a quick run of small fast pellets
 *   stream    a steady stream of bolts
 *   fan       several at once, from a spread of starting points
 *   curves    two curveballs bending in from both sides
 *   weave     curveballs one after another, from alternate sides
 *   lob       high, slow lobs that drop on you
 *   sky       ink falling from right above your head
 *   wall      a low row of ink across the whole table
 *   snipe     a moment's aim, then one very fast shot
 *   spiral    shots spun out of a turning circle
 *   pincer    from both your sides at once
 *   converge  thrown one by one, timed to arrive together
 *   cross     two curves and a straight one through the middle
 *   ring      a whole ring at once
 *   geyser    up at you from below the table's edge
 *   slam      a ground slam: a heavy and two lobs
 * Ways of moving (most end in an attack):
 *   walk, run, roll, blink (gone in a splash, back on the far side),
 *   dash (a sprint to the far side), zigzag (two quick rolls),
 *   leap (a jump to a new spot), feint (a fake, then a fast real one)
 */
export type Technique =
  | 'shot'
  | 'double'
  | 'burst'
  | 'stream'
  | 'fan'
  | 'curves'
  | 'weave'
  | 'lob'
  | 'sky'
  | 'wall'
  | 'snipe'
  | 'spiral'
  | 'pincer'
  | 'converge'
  | 'cross'
  | 'ring'
  | 'geyser'
  | 'slam'
  | 'walk'
  | 'run'
  | 'roll'
  | 'blink'
  | 'dash'
  | 'zigzag'
  | 'leap'
  | 'feint';

export interface Move {
  name: string;
  tech: Technique;
  /** What the ink is (attacks), or the attack that follows (a move). */
  shot?: Shot;
  /** How many (attacks with a count). */
  n?: number;
  /** A move's follow-up attack, once it arrives. */
  then?: Technique;
  /** A big move: only once they are hurt, with a warning. */
  big?: boolean;
}

export const MOVEMENT: ReadonlySet<Technique> = new Set(['walk', 'run', 'roll', 'blink', 'dash', 'zigzag', 'leap', 'feint']);

const m = (name: string, tech: Technique, shot?: Shot, n?: number, extra: Partial<Move> = {}): Move => ({ name, tech, shot, n, ...extra });

export const MOVE_BOOK: Record<string, Move[]> = {
  morwen: [
    m('Ink Dart', 'shot', 'bolt'),
    m('Twin Hex', 'double', 'curve'),
    m('Quill Storm', 'stream', 'bolt', 5),
    m('Hex Fan', 'fan', 'arc', 5),
    m('Serpent Hex', 'curves', 'curve'),
    m('Inkweave', 'weave', 'curve', 4),
    m('Cauldron Lob', 'lob', 'heavy', 3),
    m('Blot Rain', 'sky', 'arc', 5, { big: true }),
    m('Black Tide', 'wall', 'arc', 5, { big: true }),
    m('Witch’s Eye', 'snipe', 'pellet'),
    m('Ink Spiral', 'spiral', 'bolt', 6),
    m('Raven Pincer', 'pincer', 'bolt'),
    m('Dark Convergence', 'converge', 'arc', 5, { big: true }),
    m('Cursed Cross', 'cross', 'curve'),
    m('Ink Crown', 'ring', 'arc', 8, { big: true }),
    m('Inkwell Geyser', 'geyser', 'arc', 3),
    m('Ink Step', 'blink', 'bolt', 1, { then: 'double' }),
    m('Shadow Glide', 'dash', 'arc', 3, { then: 'fan' }),
    m('Hex Hop', 'leap', 'curve', 1, { then: 'curves' }),
    m('Mocking Feint', 'feint', 'pellet'),
  ],
  thorne: [
    m('Ember Dart', 'shot', 'bolt'),
    m('Twin Flames', 'double', 'bolt'),
    m('Flame Stream', 'stream', 'bolt', 5),
    m('Fire Fan', 'fan', 'arc', 5),
    m('Wisp Curves', 'curves', 'curve'),
    m('Will-o’-Wisp', 'weave', 'curve', 4),
    m('Magma Lob', 'lob', 'heavy', 3),
    m('Meteor Shower', 'sky', 'heavy', 4, { big: true }),
    m('Wall of Fire', 'wall', 'arc', 5, { big: true }),
    m('Pyre Lance', 'snipe', 'pellet'),
    m('Fire Spiral', 'spiral', 'bolt', 6),
    m('Salamander Pincer', 'pincer', 'bolt'),
    m('Inferno', 'converge', 'arc', 5, { big: true }),
    m('Burning Cross', 'cross', 'curve'),
    m('Ring of Fire', 'ring', 'arc', 8, { big: true }),
    m('Lava Geyser', 'geyser', 'arc', 3),
    m('Smoke Step', 'blink', 'bolt', 1, { then: 'burst' }),
    m('Ember Dash', 'dash', 'bolt', 4, { then: 'stream' }),
    m('Phoenix Leap', 'leap', 'heavy', 2, { then: 'lob' }),
    m('Ash Feint', 'feint', 'pellet'),
  ],
  rook: [
    m('Throwing Knife', 'shot', 'bolt'),
    m('Twin Blades', 'double', 'bolt'),
    m('Pistol Volley', 'burst', 'pellet', 3),
    m('Fan of Knives', 'fan', 'arc', 4),
    m('Cutlass Curl', 'curves', 'curve'),
    m('Rope Swing', 'weave', 'curve', 4),
    m('Powder Keg', 'lob', 'heavy', 2),
    m('Grapeshot Rain', 'sky', 'pellet', 6, { big: true }),
    m('Broadside', 'wall', 'arc', 5, { big: true }),
    m('Long-gun Shot', 'snipe', 'pellet'),
    m('Whirlpool Spin', 'spiral', 'bolt', 6),
    m('Boarding Pincer', 'pincer', 'bolt'),
    m('Cannon Volley', 'converge', 'heavy', 4, { big: true }),
    m('Crossed Sabres', 'cross', 'curve'),
    m('Anchor Ring', 'ring', 'arc', 8, { big: true }),
    m('Bilge Geyser', 'geyser', 'arc', 3),
    m('Smoke Bomb', 'blink', 'arc', 4, { then: 'fan' }),
    m('Deck Dash', 'dash', 'bolt', 2, { then: 'double' }),
    m('Mast Leap', 'leap', 'heavy', 2, { then: 'lob' }),
    m('Pirate’s Bluff', 'feint', 'pellet'),
  ],
  sable: [
    m('Shadow Dart', 'shot', 'bolt'),
    m('Twin Cut', 'double', 'bolt'),
    m('Flurry', 'stream', 'bolt', 6),
    m('Blade Fan', 'fan', 'bolt', 4),
    m('Crescent Cuts', 'curves', 'curve'),
    m('Silent Weave', 'weave', 'curve', 5),
    m('Dusk Lob', 'lob', 'arc', 3),
    m('Falling Blades', 'sky', 'bolt', 5, { big: true }),
    m('Blade Wall', 'wall', 'bolt', 5, { big: true }),
    m('Assassin’s Mark', 'snipe', 'pellet'),
    m('Whirling Edge', 'spiral', 'bolt', 6),
    m('Pincer Strike', 'pincer', 'bolt'),
    m('Nightfall', 'converge', 'bolt', 5, { big: true }),
    m('Cross Slash', 'cross', 'curve'),
    m('Blade Ring', 'ring', 'bolt', 8, { big: true }),
    m('Shadow Spring', 'geyser', 'bolt', 3),
    m('Shadow Dash', 'blink', 'bolt', 2, { then: 'double' }),
    m('Phantom Run', 'dash', 'bolt', 4, { then: 'stream' }),
    m('Rooftop Leap', 'leap', 'curve', 1, { then: 'cross' }),
    m('Hooded Feint', 'feint', 'pellet'),
  ],
  vex: [
    m('Snap Kick', 'shot', 'curve'),
    m('Double Kick', 'double', 'curve'),
    m('Rapid Jabs', 'burst', 'pellet', 4),
    m('Fan Kick', 'fan', 'arc', 4),
    m('Spin Kick', 'curves', 'curve'),
    m('Side Weave', 'weave', 'curve', 4),
    m('Moon Lob', 'lob', 'arc', 3),
    m('Pebble Rain', 'sky', 'pellet', 6, { big: true }),
    m('Sweep', 'wall', 'arc', 5, { big: true }),
    m('Pinpoint', 'snipe', 'pellet'),
    m('Tornado Kick', 'spiral', 'curve', 6),
    m('Scissor Kick', 'pincer', 'bolt'),
    m('Triple Threat', 'converge', 'curve', 4, { big: true }),
    m('X-Kick', 'cross', 'curve'),
    m('Cyclone', 'ring', 'arc', 8, { big: true }),
    m('Ground Pop', 'geyser', 'arc', 3),
    m('Cartwheel', 'zigzag', 'curve', 2, { then: 'curves' }),
    m('Sprint', 'run', 'bolt', 1, { then: 'shot' }),
    m('Flip', 'leap', 'curve', 1, { then: 'weave' }),
    m('Fake-out', 'feint', 'pellet'),
  ],
  mako: [
    m('Glob', 'shot', 'arc'),
    m('Double Glob', 'double', 'arc'),
    m('Spray', 'stream', 'pellet', 6),
    m('Splash Fan', 'fan', 'arc', 5),
    m('Rip Curl', 'curves', 'curve'),
    m('Eddy', 'weave', 'curve', 4),
    m('Boulder Lob', 'lob', 'heavy', 3),
    m('Monsoon', 'sky', 'arc', 6, { big: true }),
    m('Tidal Wave', 'wall', 'arc', 5, { big: true }),
    m('Harpoon', 'snipe', 'pellet'),
    m('Maelstrom', 'spiral', 'arc', 6),
    m('Shark Pincer', 'pincer', 'bolt'),
    m('Undertow', 'converge', 'heavy', 4, { big: true }),
    m('Crossing Currents', 'cross', 'curve'),
    m('Whirlpool', 'ring', 'arc', 8, { big: true }),
    m('Waterspout', 'geyser', 'arc', 3),
    m('Belly Slam', 'slam', 'heavy'),
    m('Charge', 'run', 'heavy', 1, { then: 'slam' }),
    m('Ground Pound', 'leap', 'heavy', 1, { then: 'slam' }),
    m('Bluff Roar', 'feint', 'heavy'),
  ],
  vance: [
    m('Musket Ball', 'shot', 'pellet'),
    m('Double Shot', 'double', 'pellet'),
    m('Triple Burst', 'burst', 'pellet', 3),
    m('Buckshot', 'fan', 'pellet', 5),
    m('Trick Shot', 'curves', 'curve'),
    m('Ricochet', 'weave', 'curve', 4),
    m('Grenade Lob', 'lob', 'heavy', 2),
    m('Hail of Lead', 'sky', 'pellet', 6, { big: true }),
    m('Firing Line', 'wall', 'pellet', 5, { big: true }),
    m('Deadeye', 'snipe', 'pellet'),
    m('Spin Shot', 'spiral', 'pellet', 6),
    m('Crossfire', 'pincer', 'pellet'),
    m('Volley', 'converge', 'pellet', 5, { big: true }),
    m('Cross Fire', 'cross', 'curve'),
    m('Bandolier', 'ring', 'pellet', 8, { big: true }),
    m('Mine Burst', 'geyser', 'arc', 3),
    m('Duck and Roll', 'roll', 'pellet', 2, { then: 'burst' }),
    m('Flank Run', 'dash', 'pellet', 3, { then: 'burst' }),
    m('Barrel Vault', 'leap', 'heavy', 2, { then: 'lob' }),
    m('Quick Draw', 'feint', 'pellet'),
  ],
  kai: [
    m('Shuriken', 'shot', 'bolt'),
    m('Twin Shuriken', 'double', 'bolt'),
    m('Shuriken Stream', 'stream', 'bolt', 5),
    m('Kunai Fan', 'fan', 'bolt', 5),
    m('Wind Curves', 'curves', 'curve'),
    m('Leaf Weave', 'weave', 'curve', 4),
    m('Smoke Lob', 'lob', 'arc', 3),
    m('Falling Petals', 'sky', 'bolt', 5, { big: true }),
    m('Blade Wall', 'wall', 'bolt', 5, { big: true }),
    m('Iaido', 'snipe', 'pellet'),
    m('Whirlwind', 'spiral', 'bolt', 6),
    m('Mantis Pincer', 'pincer', 'bolt'),
    m('Storm of Steel', 'converge', 'bolt', 5, { big: true }),
    m('Cross Cut', 'cross', 'curve'),
    m('Petal Ring', 'ring', 'bolt', 8, { big: true }),
    m('Earth Spike', 'geyser', 'bolt', 3),
    m('Shadow Step', 'blink', 'bolt', 2, { then: 'double' }),
    m('Wind Dash', 'dash', 'bolt', 4, { then: 'stream' }),
    m('Crane Leap', 'leap', 'curve', 1, { then: 'cross' }),
    m('Ronin’s Feint', 'feint', 'pellet'),
  ],
};

/** A fresh shuffled deck of someone's moves. */
export function shuffledMoves(id: string): Move[] {
  const deck = [...(MOVE_BOOK[id] ?? MOVE_BOOK.morwen)];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
