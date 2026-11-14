// A player's normal attack against a monster, following rAthena's pre-renewal
// `battle_calc_weapon_attack` for skill_id 0: crit roll, hit roll, base
// damage, overupgrade, crit damage bonus, DEF (ignored, by ratio or
// reduced), refine ATK, minimum damage, element, attacker card fix, katar
// off-hand hit, and the dual-wield left hand with both hands' rates.
import type { Item, Monster, TablesFile } from '../data/types';
import type { BonusSet, BonusSource } from './bonuses';
import type { EngineConfig } from './config';
import type { WeaponRefine } from './equipment';
import { totalStats, type CharacterInput } from './stats';
import { statusWindow, totalBaseAtk, usesArrowPath, weaponTypeOf } from './status';

export interface DamageRange {
  min: number;
  max: number;
  /** Exact expected value over all random parts. */
  avg: number;
}

export interface HandDamage {
  normal: DamageRange;
  crit: DamageRange;
}

export interface AutoAttackResult {
  /** Right-hand damage (the only hand without a dual-wielded left weapon). */
  normal: DamageRange;
  crit: DamageRange;
  /** Left-hand damage of a dual-wield attack, dealt on the same hit; null otherwise. */
  left: HandDamage | null;
  /** Chance a non-critical attack hits, 0..1, perfect hit included. */
  hitChance: number;
  /** Chance an attack is critical, 0..1; crits always hit. */
  critChance: number;
  amotion: number;
  aspd: number;
  attacksPerSecond: number;
  /** Expected damage per second, both hands included. */
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

/** Bonuses rAthena stores on `right_weapon`: LR_FLAG_NONE and the shield. */
const RIGHT_WEAPON_SOURCES: readonly BonusSource[] = ['none', 'shield'];
const LEFT_WEAPON_SOURCES: readonly BonusSource[] = ['leftWeapon'];

/** A race or class bitmask bonus from `sources` that matches the target or `*_ALL`. */
function hasTargetFlag(
  bonuses: BonusSet,
  name: string,
  target: TargetKeys,
  sources: readonly BonusSource[],
): boolean {
  const [key, all] = name.endsWith('Race') ? [target.race, RC_ALL] : [target.class, CLASS_ALL];
  return bonuses.has(name, [key], sources) || bonuses.has(name, [all], sources);
}

/** `attack_ignores_def` for one hand, crits aside. */
function ignoresDef(bonuses: BonusSet, target: TargetKeys, sources: readonly BonusSource[]) {
  return (
    hasTargetFlag(bonuses, 'bIgnoreDefRace', target, sources) ||
    hasTargetFlag(bonuses, 'bIgnoreDefClass', target, sources)
  );
}

/** `is_attack_piercing` for one hand (bDefRatioAtkRace/Class), crits aside. */
function piercesDef(bonuses: BonusSet, target: TargetKeys, sources: readonly BonusSource[]) {
  return (
    hasTargetFlag(bonuses, 'bDefRatioAtkRace', target, sources) ||
    hasTargetFlag(bonuses, 'bDefRatioAtkClass', target, sources)
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

function elementFrom(input: CharacterInput, sources: readonly BonusSource[]): string {
  const value = input.bonuses.last('bAtkEle', [], sources);
  return (typeof value === 'number' ? ELEMENT_NAMES[value] : undefined) ?? 'Neutral';
}

/** Weapon element: the last `bAtkEle` from the right weapon or armor (`rhw.ele`), else Neutral. */
export function weaponElement(input: CharacterInput): string {
  return elementFrom(input, RIGHT_WEAPON_SOURCES);
}

/** Left-hand weapon element: the last `bAtkEle` of the left weapon's script (`lhw.ele`). */
export function leftWeaponElement(input: CharacterInput): string {
  return elementFrom(input, LEFT_WEAPON_SOURCES);
}

/**
 * One hand's part of a normal attack. rAthena computes `damage` (right) and
 * `damage2` (left) side by side in battle_calc_weapon_attack with the same
 * crit, hit and soft DEF rolls; they differ in these values.
 */
interface Hand {
  weapon: Item | null;
  refine: WeaponRefine;
  /** Weapon type whose size_fix.yml row applies (`atkmods` from weapontype1 or weapontype2). */
  sizeType: string;
  element: string;
  /** Sources whose ignore-DEF and DEF-ratio flags apply to this hand. */
  defFlagSources: readonly BonusSource[];
  /** Attacker card fix in thousandths. */
  cardfix: number;
  /** `battle_min_damage` after refine ATK. */
  floor: number;
  /** Final percent from `battle_calc_attack_left_right_hands`, or null. */
  handRate: number | null;
  /** Katar off-hand hit, right hand only. */
  katar: boolean;
}

/**
 * The hands that deal damage (`is_attack_right_handed`, `is_attack_left_handed`).
 * With `left_cardfix_to_right` on, the right hand takes the left weapon's
 * ignore-DEF and DEF-ratio flags and its card bonuses, so the left hand keeps
 * neither (`attack_ignores_def`, `is_attack_piercing`, and `battle_calc_cardfix`
 * with left flag 3 applies an untouched `cardfix_`); a shield's flags are
 * dropped. Without a right-hand weapon the right hand still deals an unarmed
 * hit and the left weapon keeps its own flags. Dual wield scales the right
 * hand by AS_RIGHT (50 + 10 × level) % and the left by AS_LEFT (30 + 10 ×
 * level) %, each at least 1; mastery levels are 0 until skills exist. rAthena
 * applies the rates to Thief-family jobs, the only ones that can hold a
 * left-hand weapon.
 */
function attackHands(
  input: CharacterInput,
  target: TargetKeys,
): { right: Hand; left: Hand | null } {
  const weaponType = weaponTypeOf(input);
  const leftWeapon = input.leftWeapon;
  const leftOnly = input.weapon === null && leftWeapon !== null;
  const right: Hand = {
    weapon: input.weapon,
    refine: input.weaponRefine,
    sizeType: input.weapon?.weaponType ?? 'Fist',
    element: weaponElement(input),
    defFlagSources: leftOnly ? ['none'] : ['none', 'leftWeapon'],
    cardfix: attackerCardFix(input.bonuses, target, usesArrowPath(weaponType)),
    // rAthena skips the right hand's floor without a right-hand weapon and
    // leaves a negative unarmed hit; it is floored at 0 here instead.
    floor: leftOnly ? 0 : 1,
    handRate: null,
    katar: weaponType === 'Katar',
  };
  // `is_attack_left_handed`: a left weapon with ATK, or one without a right weapon.
  if (leftWeapon === null || !(leftOnly || leftWeapon.attack > 0)) return { right, left: null };
  if (!leftOnly) right.handRate = 50;
  const left: Hand = {
    weapon: leftWeapon,
    refine: input.leftWeaponRefine,
    sizeType: leftWeapon.weaponType ?? 'Fist',
    element: leftWeaponElement(input),
    defFlagSources: leftOnly ? LEFT_WEAPON_SOURCES : [],
    cardfix: 1000,
    // Left-hand damage is floored at 0, not 1 (`battle_min_damage`).
    floor: 0,
    handRate: 30,
    katar: false,
  };
  return { right, left };
}

/** Possible weapon damage values before size, each equally likely. */
function weaponRoll(
  input: CharacterInput,
  weapon: Item | null,
  dex: number,
  critical: boolean,
): number[] {
  const weaponType = weaponTypeOf(input);
  // Bows always take the arrow path; guns only when not critical
  // (`battle_calc_skill_base_damage` pre-renewal default case).
  const arrow = usesArrowPath(weaponType) && (weaponType === 'Bow' || !critical);
  let atkMax = weapon?.attack ?? 0;
  let atkMin = 0;

  // `battle_calc_base_damage`, PC branch: the DEX minimum scales by this hand's weapon level.
  if (!critical || arrow) {
    atkMin = dex;
    if (weapon) {
      atkMin = Math.trunc((atkMin * (80 + (weapon.weaponLevel ?? 1) * 20)) / 100);
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

function sizeRatio(
  input: CharacterInput,
  hand: Hand,
  monster: Monster,
  tables: TablesFile,
): number {
  // bNoSizeFix skips the size multiplier (`special_state.no_sizefix`).
  if (input.bonuses.has('bNoSizeFix')) return 100;
  return tables.sizeModifier[hand.sizeType]?.[monster.size] ?? 100;
}

/**
 * One hand's damage over every combination of weapon roll and soft DEF roll,
 * each equally likely. A VIT 999 target has 2401 soft DEF values, so for the
 * usual DEF formula they are not enumerated: damage only depends on
 * `max(floor, beforeSoftDef − softDef)` through a monotone function, so each
 * weapon value's soft DEF range is summed from prefix sums and its extremes
 * are the range ends. DEF-ratio attacks scale with soft DEF instead and are
 * enumerated.
 */
function hitDamage(
  input: CharacterInput,
  hand: Hand,
  monster: Monster,
  tables: TablesFile,
  critical: boolean,
): DamageRange {
  const { bonuses } = input;
  const target = targetKeys(monster);
  const total = totalStats(input);
  const batk = totalBaseAtk(input);
  const size = sizeRatio(input, hand, monster, tables);
  const element = elementRatio(hand.element, monster, tables);
  const { cardfix, floor, handRate } = hand;
  // Crits ignore DEF (`attack_ignores_def`), as do bIgnoreDefRace/Class; crits never pierce.
  const ignore = critical || ignoresDef(bonuses, target, hand.defFlagSources);
  const pierce = !ignore && piercesDef(bonuses, target, hand.defFlagSources);

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

  // Element, then the attacker card fix, then `battle_calc_attack_left_right_hands`:
  // the katar off-hand hit, damage × (1 + 2 × Double Attack level) / 100, or
  // the dual-wield hand rate on nonzero damage, at least 1.
  const finish = (afterDef: number) => {
    const damage = applyCardFix(Math.trunc((afterDef * element) / 100), cardfix);
    if (hand.katar) return damage + Math.trunc(damage / 100);
    if (handRate === null || damage === 0) return damage;
    return Math.max(1, Math.trunc((damage * handRate) / 100));
  };

  // `battle_add_weapon_damage`: overupgrade adds 1..overrefine (rnd() % n + 1), crits included.
  const { atk: refineAtk, overrefine } = hand.refine;
  const overValues = overrefine > 0 ? Array.from({ length: overrefine }, (_, i) => i + 1) : [0];
  // Pre-renewal bCritAtkRate (only when positive) adds to a crit's base damage, before DEF.
  const critAtkRate = critical ? bonuses.sum('bCritAtkRate') : 0;
  const baseDamages = weaponRoll(input, hand.weapon, total.dex, critical).flatMap((weaponValue) =>
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
    // refine ATK and the floor. Base damages repeat a lot (weapon roll ×
    // overupgrade), and a dummy's soft DEF spans up to 2,401 values, so each
    // distinct base is enumerated once and weighted by how often it occurs.
    const baseCounts = new Map<number, number>();
    for (const base of baseDamages) baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    for (const [base, count] of baseCounts) {
      for (let soft = softDef.first; soft <= lastSoftDef; soft++) {
        const damage = finish(
          Math.max(floor, Math.trunc((base * (hardDef + soft)) / 100) + refineAtk),
        );
        sum += damage * count;
        min = Math.min(min, damage);
        max = Math.max(max, damage);
      }
    }
    return { min, max, avg: sum / (baseDamages.length * softDef.count) };
  }

  // Refine ATK is added after DEF (`battle_calc_attack_post_defense`), before
  // the floor, so it is folded into the value soft DEF is taken from.
  const beforeSoftDefs = baseDamages.map(
    (base) => Math.trunc((base * (100 - hardDef)) / 100) + refineAtk,
  );
  // prefixAt(x) = finish(floor) + … + finish(x); prefixAt(floor - 1) = 0.
  const highest = Math.max(floor, ...beforeSoftDefs.map((value) => value - softDef.first));
  const prefix = [0];
  for (let x = floor; x <= highest; x++) prefix.push((prefix[prefix.length - 1] ?? 0) + finish(x));
  const prefixAt = (x: number) => prefix[x - floor + 1] ?? 0;

  for (const beforeSoftDef of beforeSoftDefs) {
    // Floor after DEF and refine (`battle_calc_attack_post_defense`), before element.
    const high = Math.max(floor, beforeSoftDef - softDef.first);
    const low = Math.max(floor, beforeSoftDef - lastSoftDef);
    // Soft DEF values that leave `floor` or less all give `floor` before element.
    const atFloor = Math.min(softDef.count, Math.max(0, lastSoftDef - (beforeSoftDef - floor) + 1));
    const aboveFloor = softDef.count - atFloor;
    sum += atFloor * finish(floor);
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
  const hands = attackHands(input, target);
  const damageOf = (hand: Hand): HandDamage => ({
    normal: hitDamage(input, hand, monster, tables, false),
    crit: hitDamage(input, hand, monster, tables, true),
  });
  const { normal, crit } = damageOf(hands.right);
  const left = hands.left && damageOf(hands.left);

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
  // Both hands land on the same crit and hit roll.
  const normalAvg = normal.avg + (left?.normal.avg ?? 0);
  const critAvg = crit.avg + (left?.crit.avg ?? 0);
  const expectedPerAttack = critChance * critAvg + (1 - critChance) * hitChance * normalAvg;

  return {
    normal,
    crit,
    left,
    hitChance,
    critChance,
    amotion: status.amotion,
    aspd: status.aspdExact,
    attacksPerSecond,
    dps: attacksPerSecond * expectedPerAttack,
  };
}
