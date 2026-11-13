// A player's normal attack against a monster, following rAthena's pre-renewal
// `battle_calc_weapon_attack` for skill_id 0: crit roll, hit roll, base
// damage, DEF, minimum damage, element, katar off-hand hit.
import type { Monster, TablesFile } from '../data/types';
import type { EngineConfig } from './config';
import { totalStats, type CharacterInput } from './stats';
import { baseAtk, statusWindow, usesArrowPath, weaponTypeOf } from './status';

export interface DamageRange {
  min: number;
  max: number;
  /** Exact expected value over all random parts. */
  avg: number;
}

export interface AutoAttackResult {
  normal: DamageRange;
  crit: DamageRange;
  /** Chance a non-critical attack hits, 0..1. */
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
 * likely (`battle_calc_defense_reduction`: VIT + rnd() % (VIT / 20)²).
 */
function softDefRoll(monster: Monster): { first: number; count: number } {
  const def2 = monster.vit;
  const spread = Math.trunc(def2 / 20) ** 2;
  return { first: def2, count: Math.max(spread, 1) };
}

function elementRatio(monster: Monster, tables: TablesFile): number {
  const level = tables.elementModifier[monster.elementLevel - 1];
  return level?.Neutral?.[monster.element] ?? 100;
}

function sizeRatio(input: CharacterInput, monster: Monster, tables: TablesFile): number {
  return tables.sizeModifier[weaponTypeOf(input)]?.[monster.size] ?? 100;
}

/**
 * Damage over every combination of weapon roll and soft DEF roll, each
 * equally likely. A VIT 999 target has 2401 soft DEF values, so they are not
 * enumerated: damage only depends on `max(1, afterHardDef − softDef)` through
 * a monotone function, so each weapon value's soft DEF range is summed from
 * prefix sums and its extremes are the range ends.
 */
function hitDamage(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  critical: boolean,
): DamageRange {
  const total = totalStats(input);
  const batk = baseAtk(total, weaponTypeOf(input));
  const size = sizeRatio(input, monster, tables);
  const element = elementRatio(monster, tables);
  // `battle_calc_defense_reduction` pre-renewal caps hard DEF at 100.
  const hardDef = Math.min(monster.defense, 100);
  // Crits ignore DEF (`attack_ignores_def`), so the soft DEF roll does not apply.
  const softDef = critical ? { first: 0, count: 1 } : softDefRoll(monster);
  const lastSoftDef = softDef.first + softDef.count - 1;
  const katar = weaponTypeOf(input) === 'Katar';

  // Element, then the katar off-hand hit: damage × (1 + 2 × Double Attack level) / 100.
  const finish = (afterDef: number) => {
    const damage = Math.trunc((afterDef * element) / 100);
    return katar ? damage + Math.trunc(damage / 100) : damage;
  };

  const afterHardDefs = weaponRoll(input, total.dex, critical).map((weaponValue) => {
    // Size fix on the weapon part, then base ATK (`battle_calc_base_damage`).
    const base = Math.trunc((weaponValue * size) / 100) + batk;
    return critical ? base : Math.trunc((base * (100 - hardDef)) / 100);
  });
  // prefix[x] = finish(1) + … + finish(x).
  const highest = Math.max(1, ...afterHardDefs.map((value) => value - softDef.first));
  const prefix = [0];
  for (let x = 1; x <= highest; x++) prefix.push((prefix[x - 1] ?? 0) + finish(x));
  const prefixAt = (x: number) => prefix[x] ?? 0;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const afterHardDef of afterHardDefs) {
    // Floor of 1 after DEF and refine (`battle_calc_attack_post_defense`), before element.
    const high = Math.max(1, afterHardDef - softDef.first);
    const low = Math.max(1, afterHardDef - lastSoftDef);
    // Soft DEF values that leave 1 or less all give damage 1 before element.
    const atFloor = Math.min(softDef.count, Math.max(0, lastSoftDef - (afterHardDef - 1) + 1));
    const aboveFloor = softDef.count - atFloor;
    sum += atFloor * finish(1);
    if (aboveFloor > 0) sum += prefixAt(high) - prefixAt(high - aboveFloor);
    const ends = [finish(low), finish(high)];
    min = Math.min(min, ...ends);
    max = Math.max(max, ...ends);
  }
  return { min, max, avg: sum / (afterHardDefs.length * softDef.count) };
}

export function autoAttack(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  config: EngineConfig,
): AutoAttackResult {
  const status = statusWindow(input, config);
  const normal = hitDamage(input, monster, tables, false);
  const crit = hitDamage(input, monster, tables, true);

  // `is_attack_hitting`: 80 + HIT − FLEE, capped by min/max_hitrate.
  const hitRate = Math.min(
    Math.max(80 + status.hit - monsterFlee(monster), config.minHitRate),
    config.maxHitRate,
  );
  // `is_attack_critical`: cri − 2 × target LUK, rolled against 1000.
  const critRoll = status.critRate - 2 * monster.luk;
  const critChance = Math.min(Math.max(critRoll, 0), 1000) / 1000;
  const hitChance = hitRate / 100;

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
