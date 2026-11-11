import { JOURNAL } from './journal.js';
import { play } from './progress.js';

/**
 * The Trophy Shelf: milestones across the whole game, the story's levels and
 * machines, both ways of beating the Shadow Dragon, the Ink Duel and the
 * Arsenal's Arena. Each is judged from the save itself, so a trophy earned
 * before the shelf existed still counts. Shown as the Journal's last spread.
 */

export interface Trophy {
  id: string;
  icon: string;
  title: string;
  /** How to earn it, in a few words. */
  how: string;
  earned(): boolean;
}

const cleared = (id: string) => (play.stars[id] ?? 0) > 0;
const allCleared = (...ids: string[]) => ids.every(cleared);

export const TROPHIES: Trophy[] = [
  { id: 'first-shadow', icon: '🌟', title: 'First Shadow', how: 'Bring your first shadow to life', earned: () => cleared('lantern') },
  {
    id: 'runner',
    icon: '💫',
    title: 'Spark Runner',
    how: 'Guide the spark through all six gates',
    earned: () => allCleared('run-bridge', 'run-ramp', 'run-kick', 'run-long', 'run-tunnel', 'run-twin'),
  },
  { id: 'engineer', icon: '🌉', title: 'Engineer', how: 'Build both bridges that hold', earned: () => allCleared('broken-bridge', 'ore-train') },
  { id: 'smith', icon: '⚒️', title: 'Blacksmith', how: 'Forge a blade in the Smithy', earned: () => cleared('smithy') },
  { id: 'alchemist', icon: '⚗️', title: 'Alchemist', how: 'Brew both draughts', earned: () => allCleared('healing-draught', 'strong-draught') },
  { id: 'aeronaut', icon: '🎈', title: 'Aeronaut', how: 'Fly the Sky Lantern', earned: () => cleared('sky-lantern') },
  { id: 'locksmith', icon: '🔐', title: 'Locksmith', how: 'Pick the Dragon’s Gate', earned: () => cleared('gate-lock') },
  { id: 'light', icon: '✨', title: 'Light-Bringer', how: 'Beat the dragon with Light', earned: () => play.feats.includes('dragon-light') },
  { id: 'armourer', icon: '⚔️', title: 'Armourer', how: 'Beat the dragon with the Arsenal', earned: () => play.feats.includes('dragon-arsenal') },
  { id: 'ink', icon: '🖋️', title: 'Ink Master', how: 'Win the Ink Duel', earned: () => play.journal.duel !== undefined },
  { id: 'slayer', icon: '🐉', title: 'Boss Slayer', how: 'Beat the dragon and Morwen in the Arena', earned: () => !!play.arena.dragon && !!play.arena.witch },
  { id: 'scholar', icon: '📖', title: 'Scholar', how: 'Fill twelve Journal pages', earned: () => JOURNAL.filter((p) => play.journal[p.id]).length >= 12 },
  { id: 'perfect', icon: '⭐', title: 'Perfectionist', how: 'Three stars on eight levels', earned: () => Object.values(play.stars).filter((s) => s >= 3).length >= 8 },
];

export function trophiesEarned(): number {
  return TROPHIES.filter((t) => t.earned()).length;
}

/** Trophies earned since last asked, remembered so each is announced once. Call after anything that could earn one. */
export function awardTrophies(): Trophy[] {
  const fresh = TROPHIES.filter((t) => t.earned() && !play.trophies.includes(t.id));
  for (const t of fresh) play.trophies.push(t.id);
  return fresh;
}

/** "🏆 Locksmith" or "🏆 Locksmith, Aeronaut" for a banner footer; empty for none. */
export function trophyLine(fresh: Trophy[]): string {
  return fresh.length ? `🏆 ${fresh.map((t) => t.title).join(', ')}` : '';
}
