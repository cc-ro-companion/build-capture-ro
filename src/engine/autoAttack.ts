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

/** Possible monster soft DEF values, each equally likely (`battle_calc_defense_reduction`). */
function softDefRoll(monster: Monster): number[] {
  const def2 = monster.vit;
  const spread = Math.trunc(def2 / 20) ** 2;
  if (spread <= 0) return [def2];
  return Array.from({ length: spread }, (_, offset) => def2 + offset);
}

function elementRatio(monster: Monster, tables: TablesFile): number {
  const level = tables.elementModifier[monster.elementLevel - 1];
  return level?.Neutral?.[monster.element] ?? 100;
}

function sizeRatio(input: CharacterInput, monster: Monster, tables: TablesFile): number {
  return tables.sizeModifier[weaponTypeOf(input)]?.[monster.size] ?? 100;
}

/** Turns every combination of the random parts into a damage range. */
function summarize(values: Iterable<number>): DamageRange {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    count++;
  }
  return { min, max, avg: sum / count };
}

function* hitDamages(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  critical: boolean,
): Generator<number> {
  const total = totalStats(input);
  const batk = baseAtk(total, weaponTypeOf(input));
  const size = sizeRatio(input, monster, tables);
  const element = elementRatio(monster, tables);
  // `battle_calc_defense_reduction` pre-renewal caps hard DEF at 100.
  const hardDef = Math.min(monster.defense, 100);
  // Crits ignore DEF (`attack_ignores_def`), so the soft DEF roll does not apply.
  const softDefs = critical ? [0] : softDefRoll(monster);
  const katar = weaponTypeOf(input) === 'Katar';

  for (const weaponValue of weaponRoll(input, total.dex, critical)) {
    // Size fix on the weapon part, then base ATK (`battle_calc_base_damage`).
    const base = Math.trunc((weaponValue * size) / 100) + batk;
    const afterHardDef = critical ? base : Math.trunc((base * (100 - hardDef)) / 100);
    for (const softDef of softDefs) {
      // Floor of 1 after DEF and refine (`battle_calc_attack_post_defense`), before element.
      let damage = Math.max(1, afterHardDef - softDef);
      damage = Math.trunc((damage * element) / 100);
      // Katar off-hand hit: damage × (1 + 2 × Double Attack level) / 100.
      if (katar) damage += Math.trunc(damage / 100);
      yield damage;
    }
  }
}

export function autoAttack(
  input: CharacterInput,
  monster: Monster,
  tables: TablesFile,
  config: EngineConfig,
): AutoAttackResult {
  const status = statusWindow(input, config);
  const normal = summarize(hitDamages(input, monster, tables, false));
  const crit = summarize(hitDamages(input, monster, tables, true));

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
