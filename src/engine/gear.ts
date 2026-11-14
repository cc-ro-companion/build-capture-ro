// Turns a character's equipped items into the engine's input: each item's
// script, then item combos and rune sets, then the runes in the items,
// evaluated for the build and collected into a BonusSet in the order rAthena's
// status_calc_pc runs item scripts, combos and cards; plus equipment DEF and
// refine ATK.
import type { BonusStats, Combo, Item, Job, RefineTables, Rune, ScriptStmt } from '../data/types';
import {
  BonusSet,
  type BonusSource,
  type ScriptOrigin,
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
  /** Runes compounded in the item, in card slot order; none when absent. */
  runes?: readonly Rune[];
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

/**
 * `sd->state.lr_flag` while a rune's script runs. rAthena runs card scripts
 * in the left-hand item as LR_FLAG_WEAPON when its `equip` is EQP_HAND_L,
 * and EQP_SHIELD is EQP_HAND_L, so a shield's runes count as left weapon too.
 */
export function runeBonusSource(slot: Slot): BonusSource {
  return slot === 'leftHand' ? 'leftWeapon' : 'none';
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

/** Equipped items in the order status_calc_pc runs their scripts. */
function scriptOrder(equipment: readonly EquippedItem[]): EquippedItem[] {
  return SCRIPT_ORDER.flatMap((slot) => equipment.filter((equipped) => equipped.slot === slot));
}

/**
 * Item combos whose items are all equipped, in data order. Each equipped item
 * counts once, so a combo listing an id twice needs two of that item, and a
 * combo applies once however often its items are worn (rAthena pc_checkcombo).
 */
export function activeCombos(
  equipment: readonly EquippedItem[],
  combos: readonly Combo[],
): Combo[] {
  const worn = new Map<number, number>();
  for (const { item } of equipment) worn.set(item.id, (worn.get(item.id) ?? 0) + 1);
  return combos.filter((combo) => {
    const needed = new Map<number, number>();
    for (const id of combo.items) needed.set(id, (needed.get(id) ?? 0) + 1);
    return [...needed].every(([id, count]) => (worn.get(id) ?? 0) >= count);
  });
}

export interface ActiveRuneSet {
  rune: Rune;
  /** Index into `rune.sets`. */
  index: number;
  /** The first equipped item, in script order, that holds the set's rune. */
  host: EquippedItem;
}

/**
 * Rune sets that apply: the rune holding the set and every rune it requires
 * are equipped anywhere. Each applies once, however many copies are worn.
 */
export function activeRuneSets(equipment: readonly EquippedItem[]): ActiveRuneSet[] {
  const ordered = scriptOrder(equipment);
  const worn = new Set(
    ordered.flatMap((equipped) => (equipped.runes ?? []).map((rune) => rune.id)),
  );
  const active: ActiveRuneSet[] = [];
  const seen = new Set<number>();
  for (const host of ordered) {
    for (const rune of host.runes ?? []) {
      if (seen.has(rune.id)) continue;
      seen.add(rune.id);
      rune.sets.forEach((set, index) => {
        if (set.requires.every((id) => worn.has(id))) active.push({ rune, index, host });
      });
    }
  }
  return active;
}

interface ScriptPlace {
  itemId: number | null;
  slot: Slot | null;
  origin: ScriptOrigin;
}

/**
 * Engine input for a character wearing `equipment`. An item that occupies
 * several slots (a multi-location headgear) is listed once, as rAthena's
 * `pc_is_same_equip_index` skips the repeats. Items whose script did not
 * parse (`effects: null`) contribute their DEF, refine and runes only.
 * Scripts run in status_calc_pc's order: item scripts, then combos (with rune
 * sets, which ccRO's rune text describes like combos), then cards (runes).
 * Album effects (phase 8) never run.
 */
export function buildCharacter(
  base: CharacterBase,
  equipment: readonly EquippedItem[],
  refineTables: RefineTables,
  combos: readonly Combo[] = [],
): CharacterInput {
  const ordered = scriptOrder(equipment);
  const calls: SourcedBonusCall[] = [];
  const skills: SourcedSkill[] = [];
  const autoBonuses: SourcedAutoBonus[] = [];
  const runs: ScriptRun[] = [];
  const run = (
    effects: readonly ScriptStmt[],
    refine: number,
    place: ScriptPlace,
    source: BonusSource,
  ) => {
    let readsSkillLevel = false;
    const result = evaluateEffects(effects, {
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
    for (const call of result.calls) calls.push({ ...call, ...place, source });
    for (const skill of result.skills) skills.push({ ...skill, ...place });
    for (const autoBonus of result.autoBonuses)
      autoBonuses.push({ ...autoBonus, ...place, source });
    runs.push({
      ...place,
      readsSkillLevel,
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  };

  for (const { slot, item, refine } of ordered) {
    if (item.effects === null) continue;
    const place = { itemId: item.id, slot, origin: { kind: 'item' } } as const;
    run(item.effects, refine, place, bonusSource(slot, item));
  }
  // A combo runs with no current item (current_equip_item_index -1), where
  // getrefine() returns 0.
  for (const combo of activeCombos(ordered, combos)) {
    if (combo.effects === null) continue;
    const origin: ScriptOrigin = { kind: 'combo', items: combo.items };
    run(combo.effects, 0, { itemId: null, slot: null, origin }, 'none');
  }
  for (const { rune, index, host } of activeRuneSets(ordered)) {
    const set = rune.sets[index]!;
    const origin: ScriptOrigin = { kind: 'runeSet', runeId: rune.id, requires: set.requires };
    run(set.effects, 0, { itemId: host.item.id, slot: host.slot, origin }, 'none');
  }
  // A rune's script runs in the context of the item it sits in, as a card's does.
  for (const { slot, item, refine, runes } of ordered) {
    for (const rune of runes ?? []) {
      const origin: ScriptOrigin = { kind: 'rune', runeId: rune.id };
      run(rune.effects, refine, { itemId: item.id, slot, origin }, runeBonusSource(slot));
    }
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
