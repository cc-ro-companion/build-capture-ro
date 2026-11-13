// Comparison rules between a fixture's in-game observations and the engine.
// In-game damage is a sample, so it can only prove that values exist, not
// where the range ends; the status window and crits are exact.
import type { AutoAttackResult } from '../../src/engine/autoAttack';
import type { StatusWindow } from '../../src/engine/status';

export interface Observed {
  status: { atk: [number, number]; hit: number; flee: number; crit: number; aspd: number };
  normal?: { min: number; max: number; rangeComplete?: boolean };
  crit?: { min: number; max: number };
  dps?: ObservedDps;
}

/** The training dummy's DPS messages from one uninterrupted session. */
export interface ObservedDps {
  /** Every "I've taken x DPS in last 5 seconds." value, in order. */
  windows: number[];
  /** Allowed relative deviation; wider than the default needs a reason. */
  tolerance?: number;
  toleranceReason?: string;
}

/** The DPS mean is a sample over a few hundred attacks, so it gets a tolerance. */
export const DPS_TOLERANCE = 0.05;

/**
 * The dummy prints the 5-second damage divided by 5 without decimals, which
 * loses 0.4 DPS per window on average (damage mod 5 is evenly spread).
 */
export const DUMMY_DPS_ROUNDING = 0.4;

/**
 * The game's DPS from the dummy's windows. The first and last window are
 * usually partial (attacking starts or stops inside them), so they are dropped.
 */
export function observedDps(windows: readonly number[]): number | null {
  const full = windows.slice(1, -1);
  if (full.length === 0) return null;
  return full.reduce((sum, value) => sum + value, 0) / full.length + DUMMY_DPS_ROUNDING;
}

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

  if (observed.dps) {
    const tolerance = observed.dps.tolerance ?? DPS_TOLERANCE;
    if (tolerance > DPS_TOLERANCE && !observed.dps.toleranceReason) {
      problems.push(`DPS: tolerance ${tolerance} is wider than ${DPS_TOLERANCE} without a reason`);
    }
    const gameDps = observedDps(observed.dps.windows);
    if (gameDps === null) {
      problems.push('DPS: needs at least three windows');
    } else {
      const deviation = Math.abs(attack.dps - gameDps) / gameDps;
      if (!(deviation <= tolerance)) {
        problems.push(
          `DPS: game ${gameDps.toFixed(2)}, engine ${attack.dps.toFixed(2)} ` +
            `(${(deviation * 100).toFixed(1)} % off, allowed ${tolerance * 100} %)`,
        );
      }
    }
  }

  return problems;
}
