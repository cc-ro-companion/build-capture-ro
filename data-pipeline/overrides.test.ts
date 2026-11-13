import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  ITEM_SCHEMA,
  JOB_SCHEMA,
  loadOverrideFile,
  OverrideError,
} from './overrides.ts';
import { loadDb } from './rathena.ts';

const fixtures = path.join(import.meta.dirname, 'fixtures');
const baseItems = loadDb(fixtures, 'overrides/base_items.yml').body;

function apply(fileName: string) {
  return applyOverrides(
    baseItems,
    loadOverrideFile(path.join(fixtures, 'overrides', fileName)),
    ITEM_SCHEMA,
  );
}

function byId(records: ReturnType<typeof apply>, id: number) {
  return records.find((record) => record.Id === id);
}

describe('applyOverrides', () => {
  const result = apply('valid.yml');

  it('patches only the listed fields of an existing entry', () => {
    const sword = byId(result, 1101);
    expect(sword?.Attack).toBe(30);
    expect(sword?.Slots).toBe(3);
    expect(sword?.AegisName).toBe('Sword');
  });

  it('merges nested maps key by key', () => {
    expect(byId(result, 1102)?.Jobs).toEqual({ Novice: false, Swordman: true, Thief: true });
    expect(byId(result, 1101)?.Flags).toEqual({ BuyingStore: true, DeadBranch: true });
  });

  it('adds an entry with an unknown id', () => {
    expect(byId(result, 990001)).toMatchObject({ AegisName: 'Example_Sword', Attack: 40 });
    expect(result.map((record) => record.Id)).toEqual([1101, 1102, 990001]);
  });

  it('removes listed ids', () => {
    expect(byId(result, 1103)).toBeUndefined();
  });

  it('does not modify the input records', () => {
    expect(byId(baseItems, 1101)?.Attack).toBe(25);
    expect(byId(baseItems, 1102)?.Jobs).toEqual({ Novice: true, Swordman: true });
  });

  it('leaves records unchanged for an empty override file', () => {
    expect(apply('empty.yml')).toEqual(baseItems);
  });

  it('rejects an unknown field, naming file and id', () => {
    expect(() => apply('unknown_field.yml')).toThrow(OverrideError);
    expect(() => apply('unknown_field.yml')).toThrow(
      'unknown_field.yml: Id 1101: unknown field "Atack".',
    );
  });

  it('rejects an unknown field inside a nested map', () => {
    expect(() => apply('unknown_nested_field.yml')).toThrow(
      'unknown_nested_field.yml: Id 1101.Flags: unknown field "BuyingStor".',
    );
  });

  it('rejects a new entry missing a required field', () => {
    expect(() => apply('missing_required.yml')).toThrow(
      'missing_required.yml: Id 990002: new entry is missing required field(s) Name.',
    );
  });

  it('rejects removing an id that does not exist', () => {
    expect(() => apply('unknown_remove.yml')).toThrow(
      'unknown_remove.yml: Remove 424242: no such Id.',
    );
  });

  it('rejects adding a job, since the job list is fixed', () => {
    const jobs = [{ Job: 'Swordman', MaxJobLevel: 50 }];
    const overrides = {
      name: 'jobs.yml',
      body: [{ Job: 'Swordsman', MaxJobLevel: 70 }],
      remove: [],
    };
    expect(() => applyOverrides(jobs, overrides, JOB_SCHEMA)).toThrow(
      'jobs.yml: Job Swordsman: no such entry; entries cannot be added here.',
    );
  });
});
