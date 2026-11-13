// Comparison rules between a fixture's in-game observations and the engine.
// In-game damage is a sample, so it can only prove that values exist, not
// where the range ends; the status window and crits are exact.
import type { AutoAttackResult } from '../../src/engine/autoAttack';
import type { StatusWindow } from '../../src/engine/status';

export interface Observed {
  status: { atk: [number, number]; hit: number; flee: number; crit: number; aspd: number };
  normal?: { min: number; max: number; rangeComplete?: boolean };
  crit?: { min: number; max: number };
  dps?: number;
}

/** DPS meters average over a time window, so DPS gets a tolerance. */
export const DPS_TOLERANCE = 0.05;

export function compareObserved(
  observed: Observed,
  status: StatusWindow,
  attack: AutoAttackResult,
): string[] {
  const problems: string[] = [];
  const expectEqual = (label: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      problems.push(`${label}: game ${JSON.stringify(wanted)}, engine ${JSON.stringify(actual)}`);
    }
  };

  expectEqual('status ATK', status.atk, observed.status.atk);
  expectEqual('status HIT', status.hit, observed.status.hit);
  expectEqual('status FLEE', status.flee, observed.status.flee);
  expectEqual('status CRIT', status.crit, observed.status.crit);
  expectEqual('status ASPD', status.aspd, observed.status.aspd);

  if (observed.normal) {
    const { min, max, rangeComplete } = observed.normal;
    if (rangeComplete) {
      expectEqual('normal hit range', [attack.normal.min, attack.normal.max], [min, max]);
    } else if (min < attack.normal.min || max > attack.normal.max) {
      problems.push(
        `normal hit: game saw ${min}–${max}, outside engine range ` +
          `${attack.normal.min}–${attack.normal.max}`,
      );
    }
  }

  if (observed.crit) {
    expectEqual(
      'crit range',
      [attack.crit.min, attack.crit.max],
      [observed.crit.min, observed.crit.max],
    );
  }

  if (observed.dps !== undefined) {
    const deviation = Math.abs(attack.dps - observed.dps) / observed.dps;
    if (!(deviation <= DPS_TOLERANCE)) {
      problems.push(
        `DPS: game ${observed.dps}, engine ${attack.dps.toFixed(1)} ` +
          `(${(deviation * 100).toFixed(1)} % off, allowed ${DPS_TOLERANCE * 100} %)`,
      );
    }
  }

  return problems;
}
