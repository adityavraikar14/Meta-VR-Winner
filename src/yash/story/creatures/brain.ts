import type { Locomotion } from './rig.js';

/**
 * Things a pet can choose to do on its own. Each runs for a while, then the
 * brain picks again, so a creature never loops through a fixed routine.
 */
export type Behavior =
  | 'wander'
  | 'lookAround'
  | 'sniff'
  | 'groom'
  | 'nap'
  | 'beg'
  | 'zoomies'
  | 'dance'
  | 'visit'
  | 'followHand'
  | 'fly'
  | 'sing';

/** Inborn temperament, rolled once per creature: 0.5 (low) to 1.5 (high). */
export interface Personality {
  energetic: number;
  affectionate: number;
  playful: number;
  curious: number;
}

export function rollPersonality(): Personality {
  const trait = () => 0.5 + Math.random();
  return { energetic: trait(), affectionate: trait(), playful: trait(), curious: trait() };
}

/** What the pet can currently sense when deciding. */
export interface Situation {
  locomotion: Locomotion;
  /** A tracked, relaxed hand is close to the pet. */
  handNearby: boolean;
  /** Another creature is resting on the stage. */
  friendAvailable: boolean;
  /** Seconds since the player last touched, petted or carried it. */
  sinceAttention: number;
  /** Just enjoyed a good petting. */
  excited: boolean;
}

/** Each behaviour's base appeal and how long it typically lasts (seconds). */
const CATALOG: Record<Behavior, { appeal: number; min: number; max: number; cost: number }> = {
  wander: { appeal: 1.0, min: 1.5, max: 3.5, cost: 0.04 },
  lookAround: { appeal: 0.8, min: 2, max: 4, cost: 0 },
  sniff: { appeal: 0.6, min: 1.5, max: 3, cost: 0.01 },
  groom: { appeal: 0.5, min: 2.5, max: 4.5, cost: 0 },
  nap: { appeal: 0.0, min: 8, max: 16, cost: -0.6 },
  beg: { appeal: 0.0, min: 2.5, max: 4, cost: 0.03 },
  zoomies: { appeal: 0.1, min: 2.5, max: 4, cost: 0.15 },
  dance: { appeal: 0.25, min: 2.5, max: 4, cost: 0.06 },
  visit: { appeal: 0.0, min: 4, max: 6, cost: 0.03 },
  followHand: { appeal: 0.0, min: 3, max: 6, cost: 0.03 },
  fly: { appeal: 0.0, min: 4, max: 6, cost: 0.12 },
  sing: { appeal: 0.0, min: 2.5, max: 4, cost: 0.02 },
};

const MEMORY = 3;

/**
 * Mood-driven behaviour selection: weighted by needs and personality, with
 * a novelty penalty on recent choices so the pet keeps surprising.
 */
export class PetBrain {
  /** 1 = rested, 0 = exhausted. */
  energy = 0.8 + Math.random() * 0.2;
  readonly personality = rollPersonality();
  private recent: Behavior[] = [];

  /** Picks the next behaviour and how long to keep at it. */
  choose(s: Situation): { behavior: Behavior; duration: number } {
    const p = this.personality;
    const tired = 1 - this.energy;
    const lonely = Math.min(1, s.sinceAttention / 40) * p.affectionate;
    const weights: Partial<Record<Behavior, number>> = {
      wander: CATALOG.wander.appeal * p.energetic * (1 - tired * 0.7),
      lookAround: CATALOG.lookAround.appeal * p.curious,
      sniff: CATALOG.sniff.appeal * p.curious,
      groom: CATALOG.groom.appeal * (0.6 + tired),
      nap: tired > 0.55 ? (tired - 0.4) * 4 : 0,
      beg: lonely > 0.4 ? lonely * 1.5 : 0,
      zoomies: (s.excited ? 2.5 : CATALOG.zoomies.appeal) * p.playful * this.energy,
      dance: CATALOG.dance.appeal * p.playful * this.energy,
      visit: s.friendAvailable ? 0.5 * p.affectionate : 0,
      followHand: s.handNearby ? 2.2 * p.curious : 0,
    };
    if (s.locomotion === 'flyer') {
      weights.fly = 0.7 * p.energetic * this.energy;
      weights.sing = 0.6 * p.playful;
    }

    let total = 0;
    for (const key of Object.keys(weights) as Behavior[]) {
      // Novelty: the more recently something was done, the less appealing it is.
      const index = this.recent.lastIndexOf(key);
      if (index >= 0) {
        const age = this.recent.length - 1 - index; // 0 = the last thing it did
        weights[key]! *= 0.15 + 0.25 * age;
      }
      weights[key] = Math.max(0, weights[key]! * (0.75 + Math.random() * 0.5));
      total += weights[key]!;
    }
    let pick = Math.random() * total;
    let behavior: Behavior = 'lookAround';
    for (const key of Object.keys(weights) as Behavior[]) {
      pick -= weights[key]!;
      if (pick <= 0) {
        behavior = key;
        break;
      }
    }

    this.recent.push(behavior);
    if (this.recent.length > MEMORY) this.recent.shift();
    const { min, max, cost } = CATALOG[behavior];
    const duration = min + Math.random() * (max - min);
    this.energy = Math.min(1, Math.max(0, this.energy - cost * (duration / 3)));
    return { behavior, duration };
  }

  /** Slowly tires while awake and playing. */
  tick(dt: number, active: boolean): void {
    this.energy = Math.max(0, this.energy - dt * (active ? 0.006 : 0.002) / this.personality.energetic);
  }
}
