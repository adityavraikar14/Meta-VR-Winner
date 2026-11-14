/**
 * The Ink Duel's roster: six fighters made of shadow-ink who step out of the
 * screen. Each has a body (a rigged, animated model), a way of fighting and
 * one special ability that changes how you have to play:
 *
 *   ward    Morwen raises a circle of runes that stops your throws.
 *   burst   Thorne hurls a volley of three embers from his staff (Vance fires three pellets), and rolls aside.
 *   duck    Rook ducks under high throws: aim at his chest.
 *   tumble  Vex never stands still, and her ink curves in the air.
 *   armor   Mako's hide shrugs off soft throws: only real energy (½mv²) hurts.
 *   parry   Sable (and Kai) slash your ink straight back at you.
 */

export type RivalMove = 'idle' | 'walk' | 'run' | 'throw' | 'attack' | 'skill' | 'dodge' | 'hit' | 'death' | 'taunt';
export type Ability = 'ward' | 'burst' | 'duck' | 'tumble' | 'armor' | 'parry';
/** What a throw sends: a falling arc, a fast flat bolt, a small pellet, a curveball, or a heavy glob. */
export type Shot = 'arc' | 'bolt' | 'pellet' | 'curve' | 'heavy';

export interface RivalSpec {
  id: string;
  name: string;
  title: string;
  url: string;
  /** Standing height in the room, metres. */
  height: number;
  /** Body radius for hits, metres. */
  girth: number;
  health: number;
  ability: Ability;
  /** The roster card. */
  style: string;
  tip: string;
  /** Said as they step out of the screen. */
  entrance: string;
  /** Clip words per move (matched against a clip name's '|' parts), first found wins. */
  clips: Record<RivalMove, string[]>;
  /** Bone names (three.js drops the dots: Wrist.R is WristR), first found wins. */
  head: string[];
  chest: string[];
  hands: [string[], string[]];
  shots: { throw: Shot; attack: Shot };
  /** When a move lets go, as a fraction of its clip (default: when a hand moves fastest). */
  releaseAt?: Partial<Record<RivalMove, number>>;
  /** Their ink: the stroke colour and its glow. */
  ink: number;
  glow: number;
  /** UI accent. */
  accent: string;
  /** Seconds between moves: fresh, and hurt. */
  pace: [number, number];
}

const QUATERNIUS_HEAD = ['Head'];
const QUATERNIUS_CHEST = ['Chest', 'Torso'];
const QUATERNIUS_HANDS: [string[], string[]] = [['Middle1R', 'WristR', 'LowerArmR'], ['Middle1L', 'WristL', 'LowerArmL']];

export const RIVALS: RivalSpec[] = [
  {
    id: 'morwen',
    name: 'Morwen',
    title: 'the Ink Witch',
    url: 'gltf/witch.glb',
    height: 0.5,
    girth: 0.07,
    health: 100,
    ability: 'ward',
    style: 'Hurls ink in high arcs, flicks fast bolts, and raises a ward of runes that stops your throws.',
    tip: 'When the green circle glows, wait. Throw the moment it fades.',
    entrance: 'Morwen the Ink Witch steps out of the screen!',
    clips: {
      idle: ['idle'],
      walk: ['walk'],
      run: [],
      throw: ['throw'],
      attack: ['attack'],
      skill: ['skill'],
      dodge: [],
      hit: [],
      death: ['death'],
      taunt: ['skill'],
    },
    head: ['head01_09'],
    chest: ['spine03_05'],
    hands: [['Hand01R_033'], ['Hand01L_014']],
    shots: { throw: 'arc', attack: 'bolt' },
    ink: 0x1a0c24,
    glow: 0x6a20a8,
    accent: '#9a5cff',
    pace: [3.8, 2.6],
  },
  {
    id: 'rook',
    name: 'Captain Rook',
    title: 'the Corsair',
    url: 'gltf/rival-rook.glb',
    height: 0.46,
    girth: 0.075,
    health: 90,
    ability: 'duck',
    style: 'Knife-quick slashes, then a fan of three. Ducks under anything thrown at his head.',
    tip: 'Throw low, at his chest: a duck can’t dodge that.',
    entrance: 'Captain Rook swaggers out of the screen, knife twirling!',
    clips: {
      idle: ['Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Slash'],
      attack: ['Stab'],
      skill: ['Slash'],
      dodge: ['Duck'],
      hit: ['HitReact'],
      death: ['Death'],
      taunt: ['Yes', 'Wave'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'arc', attack: 'bolt' },
    ink: 0x2a1406,
    glow: 0xe07a1c,
    accent: '#f08a2a',
    pace: [3.5, 2.5],
  },
  {
    id: 'thorne',
    name: 'Thorne',
    title: 'the Ember Mage',
    url: 'gltf/rival-thorne.glb',
    height: 0.5,
    girth: 0.065,
    health: 100,
    ability: 'burst',
    style: 'An old fire mage. Flings fast embers from his staff, then a volley of three. Rolls out of the way of your throws.',
    tip: 'Keep a drawing hanging in front of you: the volley hits it, not you.',
    entrance: 'Thorne the Ember Mage steps out of the screen, his staff ablaze!',
    clips: {
      idle: ['Idle_Weapon', 'Idle'],
      walk: ['Walk'],
      run: ['Run_Weapon', 'Run'],
      throw: ['Spell1'],
      attack: ['Staff_Attack'],
      skill: ['Spell2'],
      dodge: ['Roll'],
      hit: ['RecieveHit'],
      death: ['Death'],
      taunt: ['Idle_Attacking'],
    },
    head: QUATERNIUS_HEAD,
    chest: ['Torso'],
    hands: [['FistR', 'LowerArmR'], ['FistL', 'LowerArmL']],
    shots: { throw: 'bolt', attack: 'pellet' },
    ink: 0x2a0a04,
    glow: 0xff5a1a,
    accent: '#ff5a2a',
    pace: [3.5, 2.5],
  },
  {
    id: 'sable',
    name: 'Sable',
    title: 'the Hooded Blade',
    url: 'gltf/rival-sable.glb',
    height: 0.5,
    girth: 0.065,
    health: 110,
    ability: 'parry',
    style: 'A hooded swordswoman. When your ink comes at her she can slash it straight back at you.',
    tip: 'Throw while she is mid-attack, or two at once: she can only parry one.',
    entrance: 'Sable steps out of the screen and draws her blade.',
    clips: {
      idle: ['Idle_Sword', 'Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Punch_Right'],
      attack: ['Kick_Right'],
      skill: ['Sword_Slash'],
      dodge: ['Roll'],
      hit: ['HitRecieve'],
      death: ['Death'],
      taunt: ['Wave'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'arc', attack: 'bolt' },
    ink: 0x1c1606,
    glow: 0xffc830,
    accent: '#ffc830',
    pace: [3.4, 2.4],
  },
  {
    id: 'vex',
    name: 'Vex',
    title: 'the Acrobat',
    url: 'gltf/ada.glb',
    height: 0.5,
    girth: 0.06,
    health: 80,
    ability: 'tumble',
    style: 'Never stands still: she tumbles to a new spot again and again, and her kicks send ink that curves in the air.',
    tip: 'Throw right after she lands, before she rolls again.',
    entrance: 'Vex strolls out of the screen, already bored of standing still.',
    clips: {
      idle: ['Idle_Neutral', 'Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Punch_Right'],
      attack: ['Kick_Right'],
      skill: ['Kick_Left'],
      dodge: ['Roll'],
      hit: ['HitRecieve'],
      death: ['Death'],
      taunt: ['Wave'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'curve', attack: 'curve' },
    ink: 0x2a0620,
    glow: 0xff3a8a,
    accent: '#ff4f9a',
    pace: [3.3, 2.4],
  },
  {
    id: 'mako',
    name: 'Mako',
    title: 'the Shark Brute',
    url: 'gltf/rival-mako.glb',
    height: 0.52,
    girth: 0.09,
    health: 170,
    ability: 'armor',
    style: 'Huge, slow and tough. Small, soft throws bounce off his hide. Leaps and slams the ground, throwing up a wave of ink.',
    tip: 'Big drawings, thrown hard: ½mv² is what gets through armour.',
    entrance: 'Mako stomps out of the screen. The ground shakes.',
    clips: {
      idle: ['Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Punch'],
      attack: ['Sword'],
      skill: ['Jump'],
      dodge: [],
      hit: ['HitReact'],
      death: ['Death'],
      taunt: ['Yes'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'heavy', attack: 'arc' },
    releaseAt: { skill: 0.62 },
    ink: 0x061a30,
    glow: 0x3a7aff,
    accent: '#4a8aff',
    pace: [4.2, 3.0],
  },
  {
    id: 'vance',
    name: 'Sgt. Vance',
    title: 'the Musketeer',
    url: 'gltf/rival-vance.glb',
    height: 0.5,
    girth: 0.065,
    health: 100,
    ability: 'burst',
    style: 'Fires flat, fast ink pellets from his fingertips, then a burst of three. Rolls out of the way of your throws.',
    tip: 'Keep a drawing hanging in front of you: the burst hits it, not you.',
    entrance: 'Sgt. Vance steps out of the screen, finger guns ready!',
    clips: {
      idle: ['Idle_Gun', 'Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Gun_Shoot'],
      attack: ['Idle_Gun_Shoot', 'Gun_Shoot'],
      skill: ['Gun_Shoot'],
      dodge: ['Roll'],
      hit: ['HitRecieve'],
      death: ['Death'],
      taunt: ['Idle_Gun_Pointing', 'Wave'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'bolt', attack: 'pellet' },
    ink: 0x07222c,
    glow: 0x18b0d8,
    accent: '#2ec4e6',
    pace: [3.5, 2.5],
  },
  {
    id: 'kai',
    name: 'Kai',
    title: 'the Ronin',
    url: 'gltf/rival-kai.glb',
    height: 0.5,
    girth: 0.065,
    health: 110,
    ability: 'parry',
    style: 'A swordsman. When your ink comes at him he can slash it straight back at you.',
    tip: 'Throw while he is mid-attack, or two at once: he can only parry one.',
    entrance: 'Kai steps out of the screen and draws his blade.',
    clips: {
      idle: ['Idle_Sword', 'Idle'],
      walk: ['Walk'],
      run: ['Run'],
      throw: ['Punch_Right'],
      attack: ['Kick_Right'],
      skill: ['Sword_Slash'],
      dodge: ['Roll'],
      hit: ['HitRecieve'],
      death: ['Death'],
      taunt: ['Wave'],
    },
    head: QUATERNIUS_HEAD,
    chest: QUATERNIUS_CHEST,
    hands: QUATERNIUS_HANDS,
    shots: { throw: 'arc', attack: 'bolt' },
    ink: 0x1c1606,
    glow: 0xffc830,
    accent: '#ffc830',
    pace: [3.4, 2.4],
  },
];

/** What each ability is called on the roster card. */
export const ABILITY_NAME: Record<Ability, string> = {
  ward: 'Rune Ward',
  burst: 'Triple Burst',
  duck: 'Duck & Weave',
  tumble: 'Tumble',
  armor: 'Thick Hide',
  parry: 'Parry',
};

const PICK_KEY = 'shadowplay.duel.rival';
const WINS_KEY = 'shadowplay.duel.wins';

/** The rival picked on the roster (remembered on the device). */
export function rivalIndex(): number {
  try {
    const n = Number(localStorage.getItem(PICK_KEY));
    return Number.isInteger(n) && n >= 0 && n < RIVALS.length ? n : 0;
  } catch {
    return 0;
  }
}

export function setRivalIndex(index: number): void {
  try {
    localStorage.setItem(PICK_KEY, String(((index % RIVALS.length) + RIVALS.length) % RIVALS.length));
  } catch {
    // Not remembered; the duel still uses Morwen.
  }
}

export function currentRival(): RivalSpec {
  return RIVALS[rivalIndex()];
}

function wins(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(WINS_KEY) ?? '{}') as Record<string, number>;
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** Times you have beaten this rival. */
export function winsAgainst(id: string): number {
  return wins()[id] ?? 0;
}

export function recordWin(id: string): void {
  const all = wins();
  all[id] = (all[id] ?? 0) + 1;
  try {
    localStorage.setItem(WINS_KEY, JSON.stringify(all));
  } catch {
    // Not remembered.
  }
}

/** How many different rivals you have beaten. */
export function rivalsBeaten(): number {
  const all = wins();
  return RIVALS.filter((r) => (all[r.id] ?? 0) > 0).length;
}
