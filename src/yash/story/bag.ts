import { play, saveProgress } from './progress.js';

/**
 * The bag: raw resources gathered in the worlds, and the things you craft
 * from them. Like a survival crafting game, but every recipe matters in a
 * fight: a draught heals, a ward takes a blow, a sun shard doubles a throw.
 */
export type Resource = 'wood' | 'stone' | 'iron' | 'herb' | 'crystal' | 'ember';

export const RESOURCES: Record<Resource, { name: string; plural: string; color: number }> = {
  wood: { name: 'Wood', plural: 'Wood', color: 0x8a5a33 },
  stone: { name: 'Stone', plural: 'Stone', color: 0x9a948a },
  iron: { name: 'Iron ore', plural: 'Iron', color: 0x6d7480 },
  herb: { name: 'Herb', plural: 'Herbs', color: 0x6fa83a },
  crystal: { name: 'Crystal', plural: 'Crystal', color: 0x9b7bff },
  ember: { name: 'Ember', plural: 'Embers', color: 0xff8a2a },
};

export const RESOURCE_ORDER: Resource[] = ['wood', 'stone', 'iron', 'herb', 'crystal', 'ember'];

export type ItemId = 'potion' | 'ward' | 'shard';

export interface Recipe {
  item: ItemId;
  name: string;
  /** Short button label. */
  label: string;
  needs: Partial<Record<Resource, number>>;
  does: string;
}

export const RECIPES: Recipe[] = [
  { item: 'potion', name: 'Healing Draught', label: 'Draught', needs: { herb: 3 }, does: 'heals one heart' },
  { item: 'ward', name: 'Iron Ward', label: 'Ward', needs: { iron: 2, stone: 1 }, does: 'takes the next blow for you' },
  { item: 'shard', name: 'Sun Shard', label: 'Shard', needs: { crystal: 2, ember: 1 }, does: 'your next throw strikes twice as hard' },
];

export function count(resource: Resource): number {
  return play.bag[resource] ?? 0;
}

export function add(resource: Resource, n = 1): void {
  play.bag[resource] = count(resource) + n;
  saveProgress();
}

export function items(item: ItemId): number {
  return play.items.filter((i) => i === item).length;
}

/** Use up one of an item; true if there was one. */
export function useItem(item: ItemId): boolean {
  const i = play.items.indexOf(item);
  if (i < 0) return false;
  play.items.splice(i, 1);
  saveProgress();
  return true;
}

export function canCraft(recipe: Recipe): boolean {
  return Object.entries(recipe.needs).every(([r, n]) => count(r as Resource) >= (n ?? 0));
}

export function craft(recipe: Recipe): boolean {
  if (!canCraft(recipe)) return false;
  for (const [r, n] of Object.entries(recipe.needs)) play.bag[r] = count(r as Resource) - (n ?? 0);
  play.items.push(recipe.item);
  saveProgress();
  return true;
}

export function needsText(recipe: Recipe): string {
  return Object.entries(recipe.needs)
    .map(([r, n]) => `${n} ${n === 1 ? RESOURCES[r as Resource].name.toLowerCase() : RESOURCES[r as Resource].plural.toLowerCase()}`)
    .join(' + ');
}
