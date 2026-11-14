// Turns a character's equipped items into the engine's input: each item's
// script evaluated for the build, collected into a BonusSet in the order
// rAthena's status_calc_pc runs them, plus equipment DEF and refine ATK.
import type { BonusStats, Item, Job, RefineTables } from '../data/types';
import {
  BonusSet,
  type BonusSource,
  type ScriptRun,
  type SourcedAutoBonus,
  type SourcedBonusCall,
  type SourcedSkill,
} from './bonuses';
import { evaluateEffects } from './effects';
import { armorRefineDef, weaponRefine } from './equipment';
import type { CharacterInput } from './stats';

/** Equipment slots; the order is part of the share code format, so only append. */
export const SLOTS = [
  'headTop',
  'headMid',
  'headLow',
  'armor',
  'garment',
  'shoes',
  'accessoryLeft',
  'accessoryRight',
  'rightHand',
  'leftHand',
] as const;
export type Slot = (typeof SLOTS)[number];

/**
 * rAthena `enum equip_index` order (EQI_ACC_L … EQI_HAND_R), in which
 * status_calc_pc runs item scripts. It decides which `bAtkEle` wins when
 * several items set one: the last, so a weapon's beats an armor's.
 */
const SCRIPT_ORDER: readonly Slot[] = [
  'accessoryLeft',
  'accessoryRight',
  'shoes',
  'garment',
  'headLow',
  'headMid',
  'headTop',
  'armor',
  'leftHand',
  'rightHand',
];

export interface EquippedItem {
  slot: Slot;
  item: Item;
  refine: number;
}

export interface CharacterBase {
  job: Job;
  baseLevel: number;
  jobLevel: number;
  baseStats: BonusStats;
}

/**
 * `sd->state.lr_flag` while the item's script runs: a weapon in the left
 * hand is LR_FLAG_WEAPON, armor in the left hand (a shield) LR_FLAG_SHIELD.
 */
export function bonusSource(slot: Slot, item: Item): BonusSource {
  if (slot !== 'leftHand') return 'none';
  return item.type === 'weapon' ? 'leftWeapon' : 'shield';
}

/** Stat bonuses (`param_equip`) from the calls: bStr…bLuk, bAllStats, bAgiVit, bAgiDexStr. */
export function equipmentStats(bonuses: BonusSet): BonusStats {
  const all = bonuses.sum('bAllStats');
  const agiVit = bonuses.sum('bAgiVit');
  const agiDexStr = bonuses.sum('bAgiDexStr');
  return {
    str: bonuses.sum('bStr') + all + agiDexStr,
    agi: bonuses.sum('bAgi') + all + agiVit + agiDexStr,
    vit: bonuses.sum('bVit') + all + agiVit,
    int: bonuses.sum('bInt') + all,
    dex: bonuses.sum('bDex') + all + agiDexStr,
    luk: bonuses.sum('bLuk') + all,
  };
}

/**
 * Engine input for a character wearing `equipment`. An item that occupies
 * several slots (a multi-location headgear) is listed once, as rAthena's
 * `pc_is_same_equip_index` skips the repeats. Items whose script did not
 * parse (`effects: null`) contribute their DEF and refine only.
 */
export function buildCharacter(
  base: CharacterBase,
  equipment: readonly EquippedItem[],
  refineTables: RefineTables,
): CharacterInput {
  const ordered = SCRIPT_ORDER.flatMap((slot) =>
    equipment.filter((equipped) => equipped.slot === slot),
  );
  const calls: SourcedBonusCall[] = [];
  const skills: SourcedSkill[] = [];
  const autoBonuses: SourcedAutoBonus[] = [];
  const runs: ScriptRun[] = [];
  for (const { slot, item, refine } of ordered) {
    if (item.effects === null) continue;
    let readsSkillLevel = false;
    const result = evaluateEffects(item.effects, {
      refine,
      baseStats: base.baseStats,
      baseLevel: base.baseLevel,
      jobLevel: base.jobLevel,
      jobId: base.job.id,
      skillLevel: () => {
        readsSkillLevel = true;
        return 0;
      },
    });
    const source = bonusSource(slot, item);
    const origin = { itemId: item.id, slot };
    for (const call of result.calls) calls.push({ ...call, ...origin, source });
    for (const skill of result.skills) skills.push({ ...skill, ...origin });
    for (const autoBonus of result.autoBonuses)
      autoBonuses.push({ ...autoBonus, ...origin, source });
    runs.push({
      ...origin,
      readsSkillLevel,
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  }
  const bonuses = new BonusSet(calls, skills, autoBonuses, runs);
  const rightHand = equipment.find((equipped) => equipped.slot === 'rightHand');
  const weapon = rightHand?.item.type === 'weapon' ? rightHand.item : null;
  // A weapon in the left hand is `lhw` (status_calc_pc: EQI_HAND_L equipped
  // as EQP_HAND_L); a shield there is armor and only adds DEF and its script.
  const leftHand = equipment.find((equipped) => equipped.slot === 'leftHand');
  const leftWeapon = leftHand?.item.type === 'weapon' ? leftHand.item : null;
  return {
    ...base,
    weapon,
    weaponRefine: weaponRefine(refineTables, weapon, rightHand?.refine ?? 0),
    leftWeapon,
    leftWeaponRefine: weaponRefine(refineTables, leftWeapon, leftHand?.refine ?? 0),
    bonuses,
    equipmentStats: equipmentStats(bonuses),
    // status_calc_pc adds every equipped item's DEF, then (refinedef + 50) / 100.
    equipmentDef:
      ordered.reduce((sum, { item }) => sum + item.defense, 0) +
      armorRefineDef(refineTables, ordered),
  };
}
