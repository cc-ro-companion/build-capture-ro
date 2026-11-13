// Runs every validated character in auto-attack/ through the engine.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { normalizeBuild } from '../../src/build/model';
import { gameData, resolveBuild } from '../../src/build/resolve';
import { autoAttack, type AutoAttackResult } from '../../src/engine/autoAttack';
import { rAthenaDefaults } from '../../src/engine/config';
import type { StatusWindow } from '../../src/engine/status';
import { statusWindow } from '../../src/engine/status';
import { compareObserved, type Observed } from './compare';

interface Fixture {
  name: string;
  synthetic?: boolean;
  validatedOn: string;
  dataHash: string;
  build: unknown;
  observed: Observed;
  notes?: string;
}

const fixtureDir = path.join(import.meta.dirname, 'auto-attack');
const files = readdirSync(fixtureDir).filter((name) => /\.ya?ml$/.test(name));

function computed(fixture: Fixture): { status: StatusWindow; attack: AutoAttackResult } {
  const normalized = normalizeBuild(fixture.build, gameData, rAthenaDefaults);
  if ('error' in normalized) throw new Error(`build: ${normalized.error}`);
  if (normalized.warnings.length > 0) {
    throw new Error(`build is not valid with the current data: ${normalized.warnings.join(' ')}`);
  }
  const { character, monster } = resolveBuild(normalized.build, gameData);
  if (!monster) throw new Error('build has no target');
  return {
    status: statusWindow(character, rAthenaDefaults),
    attack: autoAttack(character, monster, gameData.tables, rAthenaDefaults),
  };
}

describe('auto attack fixtures', () => {
  it('has at least one fixture', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s matches the game', (file) => {
    const fixture = parse(readFileSync(path.join(fixtureDir, file), 'utf8')) as Fixture;
    expect(fixture.name, 'fixture needs a name').toBeTypeOf('string');
    expect(fixture.observed?.status, 'fixture needs observed.status').toBeDefined();
    const { status, attack } = computed(fixture);
    expect(compareObserved(fixture.observed, status, attack)).toEqual([]);
  });
});

describe('fixture comparison rules', () => {
  const status: StatusWindow = {
    atk: [104, 0],
    baseAtk: 79,
    weaponAtk: 25,
    hit: 62,
    flee: 81,
    perfectDodge: 1,
    crit: 1,
    critRate: 16,
    amotion: 476,
    aspdExact: 152.4,
    aspd: 152,
  };
  const attack: AutoAttackResult = {
    normal: { min: 90, max: 102, avg: 96 },
    crit: { min: 104, max: 104, avg: 104 },
    hitChance: 1,
    critChance: 0,
    amotion: 476,
    aspd: 152.4,
    attacksPerSecond: 1.05,
    dps: 100,
  };
  const observed: Observed = {
    status: { atk: [104, 0], hit: 62, flee: 81, crit: 1, aspd: 152 },
    normal: { min: 92, max: 100 },
    crit: { min: 104, max: 104 },
    dps: 100,
  };

  it('accepts matching observations', () => {
    expect(compareObserved(observed, status, attack)).toEqual([]);
  });

  it('requires exact status window values', () => {
    const wrong = { ...observed, status: { ...observed.status, aspd: 153 } };
    expect(compareObserved(wrong, status, attack)).toEqual(['status ASPD: game 153, engine 152']);
  });

  it('requires a damage sample inside the engine range', () => {
    const wrong = { ...observed, normal: { min: 89, max: 100 } };
    expect(compareObserved(wrong, status, attack)).toHaveLength(1);
  });

  it('requires the exact range when the sample is marked complete', () => {
    const incomplete = { ...observed, normal: { min: 92, max: 100, rangeComplete: true } };
    expect(compareObserved(incomplete, status, attack)).toHaveLength(1);
    const complete = { ...observed, normal: { min: 90, max: 102, rangeComplete: true } };
    expect(compareObserved(complete, status, attack)).toEqual([]);
  });

  it('requires exact crit damage', () => {
    const wrong = { ...observed, crit: { min: 103, max: 104 } };
    expect(compareObserved(wrong, status, attack)).toHaveLength(1);
  });

  it('allows DPS within 5 %', () => {
    expect(compareObserved({ ...observed, dps: 104 }, status, attack)).toEqual([]);
    expect(compareObserved({ ...observed, dps: 110 }, status, attack)).toHaveLength(1);
  });
});
