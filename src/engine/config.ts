// Server settings that change formula results. Values follow rAthena's
// conf/battle defaults, which ccRO uses unless validation shows otherwise.

export interface EngineConfig {
  /** Highest value a base stat can be raised to (job_stats.yml MaxStats). */
  maxStat: number;
  /** player.conf `max_aspd`; items in later phases can raise it. */
  maxAspd: number;
  /** battle.conf `min_hitrate`, percent. */
  minHitRate: number;
  /** battle.conf `max_hitrate`, percent. */
  maxHitRate: number;
}

export const rAthenaDefaults: EngineConfig = {
  maxStat: 99,
  maxAspd: 190,
  minHitRate: 5,
  maxHitRate: 100,
};
