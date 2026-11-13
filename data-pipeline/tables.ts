import type { RefineLevel, RefineTables, SizeModifier, TablesFile } from '../src/data/types.ts';
import { loadDb, PRE_RE_DIR, SIZE_FIX_BASE_FILE, type YamlMap } from './rathena.ts';

/** rAthena element names in `enum e_element` order. */
export const ELEMENTS = [
  'Neutral',
  'Water',
  'Earth',
  'Fire',
  'Wind',
  'Poison',
  'Holy',
  'Dark',
  'Ghost',
  'Undead',
] as const;

/** rAthena weapon type names (`enum weapon_type`) used in pre-renewal, incl. bare hands. */
export const WEAPON_TYPES = [
  'Fist',
  'Dagger',
  '1hSword',
  '2hSword',
  '1hSpear',
  '2hSpear',
  '1hAxe',
  '2hAxe',
  'Mace',
  '2hMace',
  'Staff',
  'Bow',
  'Knuckle',
  'Musical',
  'Whip',
  'Book',
  'Katar',
  'Revolver',
  'Rifle',
  'Gatling',
  'Shotgun',
  'Grenade',
  'Huuma',
  '2hStaff',
] as const;

const ELEMENT_LEVELS = 4;
// rAthena's default for any size_fix or attr_fix value not listed.
const DEFAULT_PERCENT = 100;

function percent(value: unknown, where: string): number {
  if (value === undefined) return DEFAULT_PERCENT;
  if (typeof value !== 'number') throw new Error(`${where} must be a number.`);
  return value;
}

export function convertSizeFix(entries: readonly YamlMap[]): Record<string, SizeModifier> {
  const byWeapon = new Map<string, YamlMap>();
  for (const entry of entries) {
    const weapon = String(entry.Weapon);
    if (!(WEAPON_TYPES as readonly string[]).includes(weapon)) {
      throw new Error(`size_fix.yml: unknown weapon type "${weapon}".`);
    }
    // A later entry for the same weapon only changes the sizes it lists, as in
    // rAthena's SizeFixDatabase.
    byWeapon.set(weapon, { ...byWeapon.get(weapon), ...entry });
  }
  return Object.fromEntries(
    WEAPON_TYPES.map((weapon) => {
      const entry = byWeapon.get(weapon) ?? {};
      const where = `size_fix.yml: ${weapon}`;
      return [
        weapon,
        {
          small: percent(entry.Small, `${where}.Small`),
          medium: percent(entry.Medium, `${where}.Medium`),
          large: percent(entry.Large, `${where}.Large`),
        },
      ];
    }),
  );
}

export function convertAttrFix(
  entries: readonly YamlMap[],
): Record<string, Record<string, number>>[] {
  const byLevel = new Map<number, YamlMap>(entries.map((entry) => [Number(entry.Level), entry]));
  const levels: Record<string, Record<string, number>>[] = [];
  for (let level = 1; level <= ELEMENT_LEVELS; level++) {
    const entry = byLevel.get(level);
    if (entry === undefined) throw new Error(`attr_fix.yml: no entry for level ${level}.`);
    const table: Record<string, Record<string, number>> = {};
    for (const attack of ELEMENTS) {
      const row = (entry[attack] ?? {}) as YamlMap;
      table[attack] = Object.fromEntries(
        ELEMENTS.map((defence) => [
          defence,
          percent(row[defence], `attr_fix.yml: level ${level} ${attack}.${defence}`),
        ]),
      );
    }
    levels.push(table);
  }
  return levels;
}

function refineNumber(value: unknown, where: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${where} must be a non-negative integer.`);
  }
  return value;
}

function asList(value: unknown, where: string): YamlMap[] {
  if (!Array.isArray(value)) throw new Error(`${where} must be a list.`);
  return value as YamlMap[];
}

/**
 * refine.yml's Armor and Weapon groups. A refine level missing from the file
 * gives no bonus, as rAthena's RefineDatabase finds no entry for it.
 */
export function convertRefine(entries: readonly YamlMap[]): RefineTables {
  const groups: Record<string, RefineLevel[][]> = { Armor: [], Weapon: [] };
  for (const entry of entries) {
    const group = groups[String(entry.Group)];
    if (group === undefined) continue; // Shadow_Armor, Shadow_Weapon: renewal shadow gear.
    for (const levelEntry of asList(entry.Levels, `refine.yml: ${String(entry.Group)}.Levels`)) {
      const where = `refine.yml: ${String(entry.Group)} level ${String(levelEntry.Level)}`;
      const itemLevel = refineNumber(levelEntry.Level, `${where}.Level`);
      const levels: RefineLevel[] = group[itemLevel - 1] ?? [];
      for (const refineEntry of asList(levelEntry.RefineLevels, `${where}.RefineLevels`)) {
        const refine = refineNumber(refineEntry.Level, `${where}.RefineLevels.Level`);
        if (refine < 1) throw new Error(`${where}: refine level must be at least 1.`);
        levels[refine - 1] = {
          bonus: refineNumber(refineEntry.Bonus, `${where} +${refine}.Bonus`),
          randomBonus: refineNumber(refineEntry.RandomBonus, `${where} +${refine}.RandomBonus`),
        };
      }
      group[itemLevel - 1] = levels;
    }
  }
  const fill = (levels: RefineLevel[][]) =>
    Array.from(levels, (refines) =>
      Array.from(refines ?? [], (level) => level ?? { bonus: 0, randomBonus: 0 }),
    );
  return {
    armor: fill(groups.Armor as RefineLevel[][]),
    weapon: fill(groups.Weapon as RefineLevel[][]),
  };
}

export function generateTables(rathenaDir: string): TablesFile {
  return {
    // The full table lives in db/size_fix.yml; its Footer imports
    // db/pre-re/size_fix.yml, which only changes Knuckle and Whip.
    sizeModifier: convertSizeFix(loadDb(rathenaDir, SIZE_FIX_BASE_FILE).body),
    elementModifier: convertAttrFix(loadDb(rathenaDir, `${PRE_RE_DIR}/attr_fix.yml`).body),
    refine: convertRefine(loadDb(rathenaDir, `${PRE_RE_DIR}/refine.yml`).body),
  };
}
