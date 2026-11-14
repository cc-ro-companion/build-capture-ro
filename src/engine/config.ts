// Server settings that change formula results. Values follow rAthena's
// conf/battle defaults, which the maintainer confirmed ccRO uses.

export interface EngineConfig {
  /** Highest value a base stat can be raised to (job_stats.yml MaxStats). */
  maxStat: number;
  /** player.conf `max_aspd`; some ccRO items raise it. */
  maxAspd: number;
  /** battle.conf `min_hitrate`, percent. */
  minHitRate: number;
  /** battle.conf `max_hitrate`, percent. */
  maxHitRate: number;
  /** player.conf `max_def`: equipment DEF and MDEF cap (over_def_bonus 0). */
  maxDef: number;
  /** player.conf `max_hp_lv99`; base levels above 99 are not supported. */
  maxHp: number;
  /** player.conf `max_sp`. */
  maxSp: number;
}

export const rAthenaDefaults: EngineConfig = {
  maxStat: 99,
  maxAspd: 190,
  minHitRate: 5,
  maxHitRate: 100,
  maxDef: 99,
  maxHp: 330000,
  maxSp: 1000000,
};
