// The reactive build state shared by the panels: the current build, the
// notices from loading it, and everything the engine derives from it.
import { defaultBuild, normalizeBuild, sameBuild, type Build } from '../build/model';
import { canEquip, itemName, resolveBuild, type GameData } from '../build/resolve';
import {
  decodeShareCode,
  encodeShareCode,
  type DataVersion,
  type RestoreResult,
} from '../build/shareCode';
import { loadBuild, saveBuild } from '../build/storage';
import { autoAttack } from '../engine/autoAttack';
import type { EngineConfig } from '../engine/config';
import { statPointBudget, statPointsSpent, type StatName } from '../engine/stats';
import { statusWindow } from '../engine/status';

export interface BuildStateOptions {
  data: GameData;
  config: EngineConfig;
  version: DataVersion;
  storage: Storage | null;
  /** Share code from the URL, if the page was opened with one. */
  sharedCode: string | null;
  /** Asks before a shared build replaces a different saved one. */
  confirmReplace: (message: string) => boolean;
}

export class BuildState {
  readonly data: GameData;
  readonly config: EngineConfig;
  readonly version: DataVersion;
  private readonly storage: Storage | null;

  build = $state<Build>(defaultBuild());
  /** Values dropped or clamped while loading, or by a job/level change. */
  warnings = $state<string[]>([]);
  /** Set when the loaded build was made with other data. */
  dataHint = $state<string | null>(null);
  /** A share code or saved build that could not be read at all. */
  loadError = $state<string | null>(null);

  resolved = $derived.by(() => resolveBuild(this.build, this.data));
  status = $derived.by(() => statusWindow(this.resolved.character, this.config));
  result = $derived.by(() =>
    this.resolved.monster
      ? autoAttack(this.resolved.character, this.resolved.monster, this.data.tables, this.config)
      : null,
  );
  pointsSpent = $derived.by(() => statPointsSpent(this.build.stats));
  pointsBudget = $derived.by(() => statPointBudget(this.data.statPoints, this.build.baseLevel));
  shareCode = $derived.by(() => encodeShareCode(this.build, this.version));

  constructor(options: BuildStateOptions) {
    this.data = options.data;
    this.config = options.config;
    this.version = options.version;
    this.storage = options.storage;

    const saved = loadBuild(this.data, this.config, this.version, this.storage);
    if (saved && 'error' in saved) this.loadError = `Saved build ignored: ${saved.error}`;
    else if (saved) this.apply(saved);

    if (options.sharedCode !== null) {
      const shared = decodeShareCode(options.sharedCode, this.data, this.config, this.version);
      if ('error' in shared) {
        this.loadError = `${shared.error} Your current build is unchanged.`;
      } else if (
        !saved ||
        'error' in saved ||
        sameBuild(saved.build, shared.build) ||
        options.confirmReplace('Replace your current build with the build from this link?')
      ) {
        this.apply(shared);
      }
    }
  }

  private apply(restored: Exclude<RestoreResult, { error: string }>): void {
    this.build = restored.build;
    this.warnings = restored.warnings;
    this.dataHint = restored.dataHint;
  }

  save(): boolean {
    return saveBuild($state.snapshot(this.build) as Build, this.version, this.storage);
  }

  setJob(jobId: number): void {
    this.update({ ...this.build, job: jobId });
  }

  setBaseLevel(level: number): void {
    this.update({ ...this.build, baseLevel: level });
  }

  setJobLevel(level: number): void {
    this.update({ ...this.build, jobLevel: level });
  }

  setStat(stat: StatName, value: number): void {
    this.update({ ...this.build, stats: { ...this.build.stats, [stat]: value } });
  }

  setWeapon(itemId: number | null): void {
    this.update({ ...this.build, weapon: itemId });
  }

  setMonster(monsterId: number | null): void {
    this.update({ ...this.build, monster: monsterId });
  }

  /**
   * Applies an edit through normalize so the build stays valid. A weapon that
   * the new job or level cannot equip is removed with a notice; clamping of
   * typed numbers is silent because the inputs show the result.
   */
  private update(next: Build): void {
    const previousWeapon = this.build.weapon;
    const result = normalizeBuild($state.snapshot(next), this.data, this.config);
    if ('error' in result) return;
    this.build = result.build;
    this.warnings = [];
    if (previousWeapon !== null && next.weapon === previousWeapon && result.build.weapon === null) {
      const item = this.data.items.get(previousWeapon);
      const reason =
        item && !canEquip(item, result.build.job, result.build.baseLevel)
          ? 'cannot be equipped with the new job or level'
          : 'is not available';
      this.warnings = [`${itemName(this.data, previousWeapon)} ${reason}; removed.`];
    }
  }
}
