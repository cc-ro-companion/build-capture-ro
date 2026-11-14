// Bonus calls from equipped items' scripts, summed the way rAthena's
// pc_bonus…pc_bonus5 store them, plus which bonuses the engine computes and
// plain-word labels for the ones it does not.
import type { AutobonusCommand } from '../data/types';
import type { AutoBonus, BonusArg, BonusCall, GrantedSkill } from './effects';

/**
 * Where a bonus came from, as rAthena's `sd->state.lr_flag` while the item's
 * script runs: `none` for armor and the right-hand weapon, `shield` for a
 * shield in the left hand, `leftWeapon` for a dual-wielded left weapon.
 * Weapon bonuses such as bAddRace go to `left_weapon` only from `leftWeapon`.
 */
export type BonusSource = 'none' | 'shield' | 'leftWeapon';

export interface SourcedBonusCall extends BonusCall {
  itemId: number;
  source: BonusSource;
}

export interface SourcedSkill extends GrantedSkill {
  itemId: number;
}

export interface SourcedAutoBonus extends AutoBonus {
  itemId: number;
  source: BonusSource;
}

const ALL_SOURCES: readonly BonusSource[] = ['none', 'shield', 'leftWeapon'];

function sameArgs(args: readonly BonusArg[], keys: readonly BonusArg[]): boolean {
  return keys.every((key, index) => args[index] === key);
}

/**
 * The bonus calls of every equipped item, with lookups by name, key values
 * and source, plus the granted skills and autobonuses (stored, not computed).
 */
export class BonusSet {
  readonly calls: readonly SourcedBonusCall[];
  readonly skills: readonly SourcedSkill[];
  readonly autoBonuses: readonly SourcedAutoBonus[];

  constructor(
    calls: readonly SourcedBonusCall[],
    skills: readonly SourcedSkill[] = [],
    autoBonuses: readonly SourcedAutoBonus[] = [],
  ) {
    this.calls = calls;
    this.skills = skills;
    this.autoBonuses = autoBonuses;
  }

  /**
   * Calls named `name` with `keys.length + 1` values whose leading values
   * are `keys`, e.g. `('bAddRace', [RC_DEMIHUMAN])` for `bonus2 bAddRace,7,x`.
   */
  private matching(
    name: string,
    keys: readonly BonusArg[],
    sources: readonly BonusSource[],
  ): SourcedBonusCall[] {
    return this.calls.filter(
      (call) =>
        call.name === name &&
        call.args.length === keys.length + 1 &&
        sources.includes(call.source) &&
        sameArgs(call.args, keys),
    );
  }

  /** Sum of the last value of the matching calls (most bonuses stack by adding). */
  sum(name: string, keys: readonly BonusArg[] = [], sources = ALL_SOURCES): number {
    return this.matching(name, keys, sources).reduce((total, call) => {
      const value = call.args[call.args.length - 1];
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  }

  /** Largest last value of the matching calls, or 0 (e.g. bPerfectHitRate keeps the highest). */
  max(name: string, keys: readonly BonusArg[] = [], sources = ALL_SOURCES): number {
    let best = 0;
    for (const call of this.matching(name, keys, sources)) {
      const value = call.args[call.args.length - 1];
      if (typeof value === 'number' && value > best) best = value;
    }
    return best;
  }

  /** Last value of the last matching call, for bonuses where the last one applied wins (bAtkEle). */
  last(name: string, keys: readonly BonusArg[] = [], sources = ALL_SOURCES): BonusArg | undefined {
    const found = this.matching(name, keys, sources);
    const call = found[found.length - 1];
    return call?.args[call.args.length - 1];
  }

  /**
   * Whether a call with exactly `arity` values exists from the sources: flag
   * bonuses (`bonus bNoSizeFix;`, arity 0) and bitmask bonuses such as
   * `bonus bIgnoreDefRace,RC_DemiHuman;` (arity 1, with the race as key).
   */
  has(name: string, keys: readonly BonusArg[] = [], sources = ALL_SOURCES): boolean {
    return this.calls.some(
      (call) =>
        call.name === name &&
        call.args.length === keys.length &&
        sources.includes(call.source) &&
        sameArgs(call.args, keys),
    );
  }
}

/** `name/arity` of a bonus call, the key COMPUTED_BONUSES uses. */
export function bonusKey(call: BonusCall): string {
  return `${call.name}/${call.args.length}`;
}

/**
 * Bonuses the engine applies to the status window and auto attack, as
 * `name/arity`. A call with another arity (e.g. `bonus3 bAddEle`, which adds
 * an attack-type filter) is not computed. bAtkRate is absent on purpose:
 * pre-renewal rAthena rejects it (pc_bonus logs "not supported in
 * Pre-Renewal mode").
 */
export const COMPUTED_BONUSES: ReadonlySet<string> = new Set([
  'bStr/1',
  'bAgi/1',
  'bVit/1',
  'bInt/1',
  'bDex/1',
  'bLuk/1',
  'bAllStats/1',
  'bAgiVit/1',
  'bAgiDexStr/1',
  'bBaseAtk/1',
  'bHit/1',
  'bHitRate/1',
  'bFlee/1',
  'bFlee2/1',
  'bCritical/1',
  'bCriticalRate/1',
  'bCritAtkRate/1',
  'bCriticalAddRace/2',
  'bAspd/1',
  'bAspdRate/1',
  'bAtkEle/1',
  'bAddRace/2',
  'bAddRace2/2',
  'bAddEle/2',
  'bAddSize/2',
  'bAddClass/2',
  'bIgnoreDefRace/1',
  'bIgnoreDefClass/1',
  'bIgnoreDefRaceRate/2',
  'bIgnoreDefClassRate/2',
  'bDefRatioAtkRace/1',
  'bDefRatioAtkClass/1',
  'bLongAtkRate/1',
  'bNoSizeFix/0',
  'bPerfectHitRate/1',
  'bDef/1',
  'bDefRate/1',
  'bMdef/1',
  'bMaxHP/1',
  'bMaxHPrate/1',
  'bMaxSP/1',
  'bMaxSPrate/1',
]);

/** Plain-word labels for bonus names, used where an effect is not modelled. */
export const BONUS_LABELS: Readonly<Record<string, string>> = {
  bStr: 'STR',
  bAgi: 'AGI',
  bVit: 'VIT',
  bInt: 'INT',
  bDex: 'DEX',
  bLuk: 'LUK',
  bAllStats: 'all stats',
  bAgiVit: 'AGI and VIT',
  bAgiDexStr: 'AGI, DEX and STR',
  bBaseAtk: 'ATK',
  bMatk: 'MATK',
  bMatkRate: 'MATK %',
  bHit: 'HIT',
  bHitRate: 'hit rate %',
  bFlee: 'FLEE',
  bFlee2: 'perfect dodge',
  bCritical: 'CRIT',
  bCriticalRate: 'critical rate',
  bCritAtkRate: 'critical damage %',
  bCriticalAddRace: 'CRIT against a race',
  bAspd: 'ASPD',
  bAspdRate: 'ASPD %',
  bAtkEle: 'weapon element',
  bAddRace: 'damage against a race',
  bAddRace2: 'damage against a monster group',
  bAddEle: 'damage against an element',
  bAddSize: 'damage against a size',
  bAddClass: 'damage against boss or normal monsters',
  bAddDamageClass: 'damage against a monster',
  bAddDefMonster: 'damage reduction from a monster',
  bIgnoreDefRace: 'ignore DEF of a race',
  bIgnoreDefClass: 'ignore DEF of boss or normal monsters',
  bIgnoreDefRaceRate: 'ignore DEF % of a race',
  bIgnoreDefClassRate: 'ignore DEF % of boss or normal monsters',
  bIgnoreMdefRaceRate: 'ignore MDEF % of a race',
  bDefRatioAtkRace: 'damage by target DEF against a race',
  bDefRatioAtkClass: 'damage by target DEF against boss or normal monsters',
  bLongAtkRate: 'ranged damage %',
  bLongAtkDef: 'ranged damage reduction',
  bNoSizeFix: 'no size penalty',
  bPerfectHitRate: 'perfect hit chance',
  bDef: 'DEF',
  bDefRate: 'DEF %',
  bDef2Rate: 'VIT DEF %',
  bMdef: 'MDEF',
  bMaxHP: 'max HP',
  bMaxHPrate: 'max HP %',
  bMaxSP: 'max SP',
  bMaxSPrate: 'max SP %',
  bHPrecovRate: 'HP recovery %',
  bSPrecovRate: 'SP recovery %',
  bHPRegenRate: 'HP regeneration',
  bSPRegenRate: 'SP regeneration',
  bNoRegen: 'no natural regeneration',
  bHPLossRate: 'HP loss over time',
  bSPLossRate: 'SP loss over time',
  bSubRace: 'damage reduction from a race',
  bSubRace2: 'damage reduction from a monster group',
  bSubEle: 'damage reduction from an element',
  bSubSize: 'damage reduction from a size',
  bSubClass: 'damage reduction from boss or normal monsters',
  bDefEle: 'armor element',
  bResEff: 'status resistance',
  bAddEff: 'status chance on attack',
  bAddEff2: 'status chance on self when attacking',
  bAddEffWhenHit: 'status chance when hit',
  bAddEffOnSkill: 'status chance on a skill',
  bComaRace: 'coma chance against a race',
  bComaClass: 'coma chance against boss or normal monsters',
  bAutoSpell: 'autocast on attack',
  bAutoSpellWhenHit: 'autocast when hit',
  bAutoSpellOnSkill: 'autocast on a skill',
  bSkillAtk: 'skill damage %',
  bCastrate: 'cast time',
  bDelayrate: 'skill delay',
  bUseSPrate: 'SP cost %',
  bHealPower: 'healing power',
  bHealPower2: 'healing received',
  bAddItemHealRate: 'item healing %',
  bMagicAddRace: 'magic damage against a race',
  bHPDrainRate: 'HP drain',
  bSPDrainRate: 'SP drain',
  bSPDrainValue: 'SP drain per hit',
  bSPDrainValueRace: 'SP drain per hit against a race',
  bHPGainValue: 'HP on kill',
  bSPGainValue: 'SP on kill',
  bSPGainRace: 'SP on kill of a race',
  bMagicHPGainValue: 'HP on magic kill',
  bMagicSPGainValue: 'SP on magic kill',
  bSPVanishRate: 'SP vanish chance',
  bShortWeaponDamageReturn: 'melee damage reflection',
  bBreakWeaponRate: 'weapon break chance',
  bBreakArmorRate: 'armor break chance',
  bUnbreakableWeapon: 'unbreakable weapon',
  bUnbreakableArmor: 'unbreakable armor',
  bUnbreakableHelm: 'unbreakable headgear',
  bUnbreakableShield: 'unbreakable shield',
  bUnbreakableGarment: 'unbreakable garment',
  bSplashRange: 'splash attack',
  bSpeedRate: 'movement speed',
  bSpeedAddRate: 'movement speed',
  bNoKnockback: 'no knockback',
  bNoCastCancel: 'uninterruptible casting',
  bAddSkillBlow: 'skill knockback',
  bClassChange: 'transform monsters',
  bExpAddRace: 'EXP against a race',
  bExpAddClass: 'EXP against boss or normal monsters',
  bAddMonsterDropItem: 'extra drops',
  bAddMonsterIdDropItem: 'extra drops from a monster',
  bGetZenyNum: 'zeny on kill',
  bNoGemStone: 'no gemstone cost',
  bNoWalkDelay: 'no flinch when hit',
};

export function bonusLabel(name: string): string {
  return BONUS_LABELS[name] ?? name;
}

const AUTOBONUS_LABELS: Readonly<Record<AutobonusCommand, string>> = {
  autobonus: 'temporary bonus on attack',
  autobonus2: 'temporary bonus when hit',
  autobonus3: 'temporary bonus on skill use',
};

/** A granted skill in words, e.g. `grants skill MG_COLDBOLT Lv 3` (skill names come with phase 5). */
export function skillLabel(skill: GrantedSkill): string {
  return `grants skill ${String(skill.skill)} Lv ${skill.level}`;
}

export function autoBonusLabel(autoBonus: Pick<AutoBonus, 'command'>): string {
  return AUTOBONUS_LABELS[autoBonus.command];
}

/** Labels of the calls the engine does not compute, each once, in call order. */
export function notModelledLabels(calls: readonly BonusCall[]): string[] {
  const labels: string[] = [];
  for (const call of calls) {
    if (COMPUTED_BONUSES.has(bonusKey(call))) continue;
    const label = bonusLabel(call.name);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}
