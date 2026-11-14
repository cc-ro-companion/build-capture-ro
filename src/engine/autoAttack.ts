// A player's normal attack against a monster, following rAthena's pre-renewal
// `battle_calc_weapon_attack` for skill_id 0: crit roll, hit roll, base
// damage, overupgrade, crit damage bonus, DEF (ignored, by ratio or
// reduced), refine ATK, minimum damage, element, attacker card fix, katar
// off-hand hit.
import type { Monster, TablesFile } from '../data/types';
import type { BonusSet, BonusSource } from './bonuses';
import type { EngineConfig } from './config';
import { totalStats, type CharacterInput } from './stats';
import { statusWindow, totalBaseAtk, usesArrowPath, weaponTypeOf } from './status';

export interface DamageRange {
  min: number;
  max: number;
  /** Exact expected value over all random parts. */
  avg: number;
}

export interface AutoAttackResult {
  normal: DamageRange;
  crit: DamageRange;
  /** Chance a non-critical attack hits, 0..1, perfect hit included. */
  hitChance: number;
  /** Chance an attack is critical, 0..1; crits always hit. */
  critChance: number;
  amotion: number;
  aspd: number;
  attacksPerSecond: number;
  dps: number;
}

/** Monster values derived from mob_db (`status_calc_misc` pre-renewal, non-player). */
export function monsterFlee(monster: Monster): number {
  return Math.max(1, monster.level + monster.agi);
}

/**
 * The target's keys into item bonuses, as rAthena's enums number them
 * (`e_race`, `e_element`, `e_size`, `e_aegis_monsterclass`, `e_race2`).
 */
export interface TargetKeys {
  race: number;
  element: number;
  size: number;
  class: number;
  raceGroups: number[];
}

const RACE_IDS: Readonly<Record<string, number>> = {
  Formless: 0,
  Undead: 1,
  Brute: 2,
  Plant: 3,
  Insect: 4,
  Fish: 5,
  Demon: 6,
  Demihuman: 7,
  Angel: 8,
  Dragon: 9,
};
const RC_ALL = 12;

/** `e_element` order; bAtkEle's value indexes it. */
export const ELEMENT_NAMES = [
  'Neutral',
  'Water',
  'Earth',
  'Fire',
  'Wind',
  'Poison',
  'Holy',
  'Dark',
  'Ghost',
  'Undead',
] as const;
const ELE_ALL = 10;

const SIZE_IDS: Readonly<Record<string, number>> = { small: 0, medium: 1, large: 2 };
const SZ_ALL = 3;

const CLASS_IDS: Readonly<Record<string, number>> = {
  normal: 0,
  boss: 1,
  guardian: 2,
  battlefield: 4,
};
const CLASS_ALL = 6;

/** `e_race2` in order; mob_db race group names are these without `RC2_`. */
const RACE2_NAMES = [
  'NONE',
  'GOBLIN',
  'KOBOLD',
  'ORC',
  'GOLEM',
  'GUARDIAN',
  'NINJA',
  'GVG',
  'BATTLEFIELD',
  'TREASURE',
  'BIOLAB',
  'MANUK',
  'SPLENDIDE',
  'SCARABA',
  'OGH_ATK_DEF',
  'OGH_HIDDEN',
  'BIO5_SWORDMAN_THIEF',
  'BIO5_ACOLYTE_MERCHANT',
  'BIO5_MAGE_ARCHER',
  'BIO5_MVP',
  'CLOCKTOWER',
  'THANATOS',
  'FACEWORM',
  'HEARTHUNTER',
  'ROCKRIDGE',
  'WERNER_LAB',
  'TEMPLE_DEMON',
  'ILLUSION_VAMPIRE',
  'MALANGDO',
  'EP172ALPHA',
  'EP172BETA',
  'EP172BATH',
  'ILLUSION_TURTLE',
  'RACHEL_SANCTUARY',
  'ILLUSION_LUANDA',
  'ILLUSION_FROZEN',
  'ILLUSION_MOONLIGHT',
  'EP16_DEF',
  'EDDA_ARUNAFELTZ',
  'LASAGNA',
  'GLAST_HEIM_ABYSS',
  'DESTROYED_VALKYRIE_REALM',
  'ENCROACHED_GEPHENIA',
];

export function targetKeys(monster: Monster): TargetKeys {
  const known = (table: Readonly<Record<string, number>>, value: string, what: string) => {
    const id = table[value];
    if (id === undefined) throw new Error(`Unknown monster ${what} ${value}.`);
    return id;
  };
  const element = (ELEMENT_NAMES as readonly string[]).indexOf(monster.element);
  if (element === -1) throw new Error(`Unknown monster element ${monster.element}.`);
  return {
    race: known(RACE_IDS, monster.race, 'race'),
    element,
    size: known(SIZE_IDS, monster.size, 'size'),
    class: known(CLASS_IDS, monster.class, 'class'),
    // A group no bonus can name cannot change damage, so unknown names are skipped.
    raceGroups: monster.raceGroups
      .map((group) => RACE2_NAMES.indexOf(group.toUpperCase()))
      .filter((id) => id > 0),
  };
}

/**
 * Right-hand ignore-DEF and DEF-ratio bonuses come from LR_FLAG_NONE and,
 * because `left_cardfix_to_right` is on, from a left-hand weapon; a
 * shield's are dropped (`pc_bonus` SP_IGNORE_DEF_RACE, `attack_ignores_def`).
 */
const RIGHT_HAND_FLAG_SOURCES: readonly BonusSource[] = ['none', 'leftWeapon'];
/** Bonuses rAthena stores on `right_weapon`: LR_FLAG_NONE and the shield. */
const RIGHT_WEAPON_SOURCES: readonly BonusSource[] = ['none', 'shield'];

/** A race or class bitmask bonus that matches the target or `*_ALL`. */
function hasTargetFlag(bonuses: BonusSet, name: string, target: TargetKeys): boolean {
  const [key, all] = name.endsWith('Race') ? [target.race, RC_ALL] : [target.class, CLASS_ALL];
  return (
    bonuses.has(name, [key], RIGHT_HAND_FLAG_SOURCES) ||
    bonuses.has(name, [all], RIGHT_HAND_FLAG_SOURCES)
  );
}

/** `attack_ignores_def` for the right hand, crits aside. */
function ignoresDef(bonuses: BonusSet, target: TargetKeys): boolean {
  return (
    hasTargetFlag(bonuses, 'bIgnoreDefRace', target) ||
    hasTargetFlag(bonuses, 'bIgnoreDefClass', target)
  );
}

/** `is_attack_piercing` for the right hand (bDefRatioAtkRace/Class), crits aside. */
function piercesDef(bonuses: BonusSet, target: TargetKeys): boolean {
  return (
    hasTargetFlag(bonuses, 'bDefRatioAtkRace', target) ||
    hasTargetFlag(bonuses, 'bDefRatioAtkClass', target)
  );
}

/**
 * Attacker card fix in thousandths (`battle_calc_cardfix`, BF_WEAPON, left
 * flag 2), with `left_cardfix_to_right` on. Arrow attacks (bows and guns)
 * read only `right_weapon` and add the race groups up before multiplying;
 * melee sums both hands and multiplies per race group. Each step truncates.
 */
export function attackerCardFix(bonuses: BonusSet, target: TargetKeys, arrow: boolean): number {
  const sources = arrow ? RIGHT_WEAPON_SOURCES : undefined;
  const add = (name: string, key: number, all: number) =>
    bonuses.sum(name, [key], sources) + bonuses.sum(name, [all], sources);
  let cardfix = 1000;
  const apply = (percent: number) => {
    cardfix = Math.trunc((cardfix * (100 + percent)) / 100);
  };
  const race = add('bAddRace', target.race, RC_ALL);
  const element = add('bAddEle', target.element, ELE_ALL);
  const size = add('bAddSize', target.size, SZ_ALL);
  const raceGroups = target.raceGroups.map((group) => bonuses.sum('bAddRace2', [group]));
  const monsterClass = add('bAddClass', target.class, CLASS_ALL);
  if (arrow) {
    apply(race);
    apply(element);
    apply(size);
    apply(raceGroups.reduce((sum, value) => sum + value, 0));
    apply(monsterClass);
    // Normal attacks with bows and guns are BF_LONG (initialize_weapon_data).
    apply(bonuses.sum('bLongAtkRate'));
  } else {
    apply(element);
    apply(race);
    apply(size);
    for (const value of raceGroups) apply(value);
    apply(monsterClass);
  }
  return cardfix;
}

/** `APPLY_CARDFIX`: damage − damage × (1000 − max(0, fix)) / 1000. */
function applyCardFix(damage: number, cardfix: number): number {
  return damage - Math.trunc((damage * (1000 - Math.max(0, cardfix))) / 1000);
}

/** Weapon element: the last `bAtkEle` from the right weapon or armor (`rhw.ele`), else Neutral. */
export function weaponElement(input: CharacterInput): string {
  const value = input.bonuses.last('bAtkEle', [], RIGHT_WEAPON_SOURCES);
  return (typeof value === 'number' ? ELEMENT_NAMES[value] : undefined) ?? 'Neutral';
}

/** Possible weapon damage values before size, each equally likely. */
function weaponRoll(input: CharacterInput, dex: number, critical: boolean): number[] {
  const weaponType = weaponTypeOf(input);
  // Bows always take the arrow path; guns only when not critical
  // (`battle_calc_skill_base_damage` pre-renewal default case).
  const arrow = usesArrowPath(weaponType) && (weaponType === 'Bow' || !critical);
  let atkMax = input.weapon?.attack ?? 0;
  let atkMin = 0;

  // `battle_calc_base_damage`, PC branch.
  if (!critical || arrow) {
    atkMin = dex;
    if (input.weapon) {
      atkMin = Math.trunc((atkMin * (80 + (input.weapon.weaponLevel ?? 1) * 20)) / 100);
    }
    if (atkMin > atkMax) atkMin = atkMax;
    if (arrow) {
      atkMin = Math.trunc((atkMin * atkMax) / 100);
      if (atkMin > atkMax) atkMax = atkMin;
    }
  }

  if (critical) return [atkMax];
  // `rnd() % (atkmax - atkmin) + atkmin`: the maximum itself is never rolled.
  if (atkMax <= atkMin) return [atkMin];
  return Array.from({ length: atkMax - atkMin }, (_, offset) => atkMin + offset);
}

/**
 * Monster soft DEF: `count` consecutive values from `first`, each equally
 * likely (`battle_calc_defense_reduction`: def2 + rnd() % (def2 / 20)²).
 */
function softDefRoll(def2: number): { first: number; count: number } {
  const spread = Math.trunc(def2 / 20) ** 2;
  return { first: def2, count: Math.max(spread, 1) };
}

function elementRatio(attackElement: string, monster: Monster, tables: TablesFile): number {
  const level = tables.elementModifier[monster.elementLevel - 1];
  return level?.[attackElement]?.[monster.element] ?? 100;
}

function sizeRatio(input: CharacterInput, monster: Monster, tables: TablesFile): number {
  // bNoSizeFix skips the size multiplier (`special_state.no_sizefix`).
  if (input.bonuses.has('bNoSizeFix')) return 100;
  return tables.sizeModifier[weaponTypeOf(input)]?.[monster.size] ?? 100;
}

/**
 * Damage over every combination of weapon roll and soft DEF roll, each
 * equally likely. A VIT 999 target has 2401 soft DEF values, so for the
 * usual DEF formula they are not enumerated: damage only depends on
 * `max(1, beforeSoftDef − softDef)` through a monotone function, so each
 * weapon value's soft DEF range is summed from prefix sums and its extremes
 * are the range ends. DEF-ratio attacks scale with soft DEF instead and are
 * enumerated.
 */
function hitDamage(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  critical: boolean,
): DamageRange {
  const { bonuses } = input;
  const target = targetKeys(monster);
  const total = totalStats(input);
  const batk = totalBaseAtk(input);
  const weaponType = weaponTypeOf(input);
  const size = sizeRatio(input, monster, tables);
  const element = elementRatio(weaponElement(input), monster, tables);
  const cardfix = attackerCardFix(bonuses, target, usesArrowPath(weaponType));
  const katar = weaponType === 'Katar';
  // Crits ignore DEF (`attack_ignores_def`), as do bIgnoreDefRace/Class; crits never pierce.
  const ignore = critical || ignoresDef(bonuses, target);
  const pierce = !ignore && piercesDef(bonuses, target);

  // `battle_calc_defense_reduction`: bIgnoreDefRaceRate/ClassRate lower hard and
  // soft DEF (at most 100 %), then pre-renewal caps hard DEF at 100.
  let def1 = monster.defense;
  let def2 = monster.vit;
  const ignoreRate = Math.min(
    100,
    bonuses.sum('bIgnoreDefRaceRate', [target.race]) +
      bonuses.sum('bIgnoreDefRaceRate', [RC_ALL]) +
      bonuses.sum('bIgnoreDefClassRate', [target.class]) +
      bonuses.sum('bIgnoreDefClassRate', [CLASS_ALL]),
  );
  if (ignoreRate !== 0) {
    def1 -= Math.trunc((def1 * ignoreRate) / 100);
    def2 -= Math.trunc((def2 * ignoreRate) / 100);
  }
  const hardDef = ignore ? 0 : Math.min(def1, 100);
  const softDef = ignore ? { first: 0, count: 1 } : softDefRoll(def2);
  const lastSoftDef = softDef.first + softDef.count - 1;

  // Element, then the attacker card fix, then the katar off-hand hit:
  // damage × (1 + 2 × Double Attack level) / 100.
  const finish = (afterDef: number) => {
    const damage = applyCardFix(Math.trunc((afterDef * element) / 100), cardfix);
    return katar ? damage + Math.trunc(damage / 100) : damage;
  };

  // `battle_add_weapon_damage`: overupgrade adds 1..overrefine (rnd() % n + 1), crits included.
  const { atk: refineAtk, overrefine } = input.weaponRefine;
  const overValues = overrefine > 0 ? Array.from({ length: overrefine }, (_, i) => i + 1) : [0];
  // Pre-renewal bCritAtkRate (only when positive) adds to a crit's base damage, before DEF.
  const critAtkRate = critical ? bonuses.sum('bCritAtkRate') : 0;
  const baseDamages = weaponRoll(input, total.dex, critical).flatMap((weaponValue) =>
    overValues.map((over) => {
      // Size fix on the weapon part, then base ATK and overupgrade (`battle_calc_base_damage`).
      const base = Math.trunc((weaponValue * size) / 100) + batk + over;
      return critAtkRate > 0 ? base + Math.trunc((base * critAtkRate) / 100) : base;
    }),
  );

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  if (pierce) {
    // `ATK_RATE2(damage, def1 + vit_def)` with no soft DEF subtraction; then
    // refine ATK and the floor of 1.
    for (const base of baseDamages) {
      for (let soft = softDef.first; soft <= lastSoftDef; soft++) {
        const damage = finish(Math.max(1, Math.trunc((base * (hardDef + soft)) / 100) + refineAtk));
        sum += damage;
        min = Math.min(min, damage);
        max = Math.max(max, damage);
      }
    }
    return { min, max, avg: sum / (baseDamages.length * softDef.count) };
  }

  // Refine ATK is added after DEF (`battle_calc_attack_post_defense`), before
  // the floor of 1, so it is folded into the value soft DEF is taken from.
  const beforeSoftDefs = baseDamages.map(
    (base) => Math.trunc((base * (100 - hardDef)) / 100) + refineAtk,
  );
  // prefix[x] = finish(1) + … + finish(x).
  const highest = Math.max(1, ...beforeSoftDefs.map((value) => value - softDef.first));
  const prefix = [0];
  for (let x = 1; x <= highest; x++) prefix.push((prefix[x - 1] ?? 0) + finish(x));
  const prefixAt = (x: number) => prefix[x] ?? 0;

  for (const beforeSoftDef of beforeSoftDefs) {
    // Floor of 1 after DEF and refine (`battle_calc_attack_post_defense`), before element.
    const high = Math.max(1, beforeSoftDef - softDef.first);
    const low = Math.max(1, beforeSoftDef - lastSoftDef);
    // Soft DEF values that leave 1 or less all give damage 1 before element.
    const atFloor = Math.min(softDef.count, Math.max(0, lastSoftDef - (beforeSoftDef - 1) + 1));
    const aboveFloor = softDef.count - atFloor;
    sum += atFloor * finish(1);
    if (aboveFloor > 0) sum += prefixAt(high) - prefixAt(high - aboveFloor);
    const ends = [finish(low), finish(high)];
    min = Math.min(min, ...ends);
    max = Math.max(max, ...ends);
  }
  return { min, max, avg: sum / (beforeSoftDefs.length * softDef.count) };
}

export function autoAttack(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  config: EngineConfig,
): AutoAttackResult {
  const { bonuses } = input;
  const target = targetKeys(monster);
  const status = statusWindow(input, config);
  const normal = hitDamage(input, monster, tables, false);
  const crit = hitDamage(input, monster, tables, true);

  // `is_attack_hitting`: 80 + HIT − FLEE, capped by min/max_hitrate; before
  // that, bPerfectHitRate (the highest one counts) hits on rnd() % 100.
  const hitRate = Math.min(
    Math.max(80 + status.hit - monsterFlee(monster), config.minHitRate),
    config.maxHitRate,
  );
  const perfectHit = Math.min(Math.max(bonuses.max('bPerfectHitRate'), 0), 100) / 100;
  const hitChance = perfectHit + (1 - perfectHit) * (hitRate / 100);
  // `is_attack_critical`: cri + bCriticalAddRace × 10 − 2 × target LUK, rolled against 1000.
  const critAddRace =
    10 *
    (bonuses.sum('bCriticalAddRace', [target.race]) + bonuses.sum('bCriticalAddRace', [RC_ALL]));
  const critRoll = status.critRate + critAddRace - 2 * monster.luk;
  const critChance = Math.min(Math.max(critRoll, 0), 1000) / 1000;

  // A player's attack delay is 2 × amotion (`AMOTION_DIVIDER_PC`).
  const attacksPerSecond = 1000 / (2 * status.amotion);
  const expectedPerAttack = critChance * crit.avg + (1 - critChance) * hitChance * normal.avg;

  return {
    normal,
    crit,
    hitChance,
    critChance,
    amotion: status.amotion,
    aspd: status.aspdExact,
    attacksPerSecond,
    dps: attacksPerSecond * expectedPerAttack,
  };
}
