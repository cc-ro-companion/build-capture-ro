// Equipment rules shared by the status window and auto attack: refinement
// bonuses from refine.yml as rAthena's status_calc_pc applies them, and
// which rune fits which equipped item.
import type { Item, RefineLevel, RefineTables, RuneLocation } from '../data/types';
import type { Slot } from './gear';

/**
 * Whether a rune of `location` fits the item in `slot`: runes go into card
 * slots like vanilla cards, so a Weapon rune fits a weapon in either hand and
 * a Shield rune only a shield in the left hand.
 */
export function runeFits(location: RuneLocation, slot: Slot, item: Item): boolean {
  switch (location) {
    case 'Weapon':
      return (slot === 'rightHand' || slot === 'leftHand') && item.type === 'weapon';
    case 'Shield':
      return slot === 'leftHand' && item.type === 'armor';
    case 'Armor':
      return slot === 'armor';
    case 'Garment':
      return slot === 'garment';
    case 'Footgear':
      return slot === 'shoes';
    case 'Accessory':
      return slot === 'accessoryLeft' || slot === 'accessoryRight';
    case 'Headgear':
      return slot === 'headTop' || slot === 'headMid' || slot === 'headLow';
  }
}

/** rAthena `MAX_REFINE`; ccRO refines to +10, which the build model enforces. */
const MAX_REFINE = 20;

/**
 * `RefineDatabase::findCurrentLevelInfo`: the refine.yml entry for the
 * item's current refine, or undefined when the item cannot be refined, is
 * at +0, or has no entry. Armor uses armor level 1, the only one pre-renewal has.
 */
export function refineLevel(
  tables: RefineTables,
  item: Item,
  refine: number,
): RefineLevel | undefined {
  if (!item.refineable || refine <= 0) return undefined;
  const capped = Math.min(refine, MAX_REFINE);
  const group = item.type === 'weapon' ? tables.weapon : tables.armor;
  const itemLevel = item.type === 'weapon' ? (item.weaponLevel ?? 1) : 1;
  return group[itemLevel - 1]?.[capped - 1];
}

export interface WeaponRefine {
  /** Refine ATK (`wa->atk2 += bonus / 100`), added after DEF. */
  atk: number;
  /** Overupgrade (`wd->overrefine = randombonus_max / 100`): damage + 1..overrefine. */
  overrefine: number;
}

export function weaponRefine(
  tables: RefineTables,
  item: Item | null,
  refine: number,
): WeaponRefine {
  const level = item === null ? undefined : refineLevel(tables, item, refine);
  return {
    atk: Math.trunc((level?.bonus ?? 0) / 100),
    overrefine: Math.trunc((level?.randomBonus ?? 0) / 100),
  };
}

/**
 * DEF from refined armor: status_calc_pc sums refine.yml bonuses of every
 * equipped armor piece (shield included) and adds `(refinedef + 50) / 100`.
 */
export function armorRefineDef(
  tables: RefineTables,
  armor: readonly { item: Item; refine: number }[],
): number {
  let refineDef = 0;
  for (const { item, refine } of armor) {
    if (item.type !== 'armor') continue;
    refineDef += refineLevel(tables, item, refine)?.bonus ?? 0;
  }
  return Math.trunc((refineDef + 50) / 100);
}
