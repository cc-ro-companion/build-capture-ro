// Types of the files in ./generated, written by data-pipeline/generate.ts.
// rAthena names (weapon types, locations, elements, races, modes) are kept
// as rAthena spells them so they can be traced back to its db files.

export interface BonusStats {
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
}

export interface Job {
  /** rAthena `e_job` value; stable, used in share codes. */
  id: number;
  /** rAthena job name, e.g. `Super_Novice`. */
  key: string;
  maxBaseLevel: number;
  maxJobLevel: number;
  /** Index = job level - 1; cumulative bonus up to and including that level. */
  bonusStats: BonusStats[];
  /**
   * Weapon type → base attack delay, as rAthena's job_aspd.yml lists it.
   * rAthena uses 2000 for unlisted types, which some items' `jobs` still allow
   * (e.g. 1161 Balmung, which every job can equip).
   */
  baseAspd: Record<string, number>;
}

export interface JobsFile {
  /** Index = base level - 1; total stat points at that level. */
  statPoints: number[];
  jobs: Job[];
}

export interface Item {
  /** rAthena item id; stable, used in share codes. */
  id: number;
  aegisName: string;
  type: 'weapon' | 'armor';
  /** rAthena weapon SubType, e.g. `1hSword`; weapons only. */
  weaponType?: string;
  attack: number;
  defense: number;
  range: number;
  slots: number;
  /** Weapons only. */
  weaponLevel?: number;
  equipLevelMin: number;
  /** 0 means no upper limit (rAthena treats it like the maximum level). */
  equipLevelMax: number;
  refineable: boolean;
  /** rAthena location names, e.g. `Right_Hand`, `Head_Top`. */
  locations: string[];
  /** Supported job ids that can equip the item, ascending. */
  jobs: number[];
  /** Only present when restricted. */
  gender?: 'male' | 'female';
  /** Not obtainable on ccRO (data-overrides/hidden-items.yml); left out of search by default. */
  hidden?: true;
}

export type Size = 'small' | 'medium' | 'large';
export type MonsterClass = 'normal' | 'boss' | 'guardian' | 'battlefield';

export interface Monster {
  /** rAthena monster id; stable, used in share codes. */
  id: number;
  aegisName: string;
  level: number;
  hp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  magicDefense: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  size: Size;
  /** rAthena race name, e.g. `Demihuman`. */
  race: string;
  /** rAthena race group names that are set, e.g. `Goblin`. */
  raceGroups: string[];
  /** rAthena element name, e.g. `Water`. */
  element: string;
  elementLevel: number;
  class: MonsterClass;
  /** rAthena mode names that are set, e.g. `Mvp`, `Detector`. */
  modes: string[];
  attackRange: number;
  attackDelay: number;
  attackMotion: number;
  damageMotion: number;
  walkSpeed: number;
}

export interface SizeModifier {
  small: number;
  medium: number;
  large: number;
}

export interface TablesFile {
  /** Weapon type → damage % against each monster size. */
  sizeModifier: Record<string, SizeModifier>;
  /** Index = element level - 1; attack element → defence element → damage %. */
  elementModifier: Record<string, Record<string, number>>[];
}

/** Display names by kind and id; one file per language. */
export interface NamesFile {
  items: Record<string, string>;
  monsters: Record<string, string>;
  jobs: Record<string, string>;
}

export interface DataMeta {
  /** Human label from data-overrides/meta.yml. */
  label: string;
  /** First 8 hex chars of SHA-256 over the other generated files. */
  hash: string;
  rathenaCommit: string;
  rathenaCommitDate: string;
  /** True if rAthena's db/pre-re had uncommitted changes when generating. */
  rathenaDirty: boolean;
  /** SHA-256 over data-overrides/*.yml, for the staleness test. */
  overridesHash: string;
  generatedAt: string;
}
