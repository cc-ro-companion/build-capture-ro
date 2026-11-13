// Equipment rules shared by the status window and auto attack: refinement
// bonuses from refine.yml as rAthena's status_calc_pc applies them.
import type { Item, RefineLevel, RefineTables } from '../data/types';

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
