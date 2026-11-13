import { loadDb, PRE_RE_DIR, type YamlMap } from './rathena.ts';

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

export interface SizeModifier {
  small: number;
  medium: number;
  large: number;
}

export interface TablesData {
  /** Weapon type → damage % against each monster size. */
  sizeModifier: Record<string, SizeModifier>;
  /** Index = element level - 1; attack element → defence element → damage %. */
  elementModifier: Record<string, Record<string, number>>[];
}

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
    byWeapon.set(weapon, entry);
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

export function generateTables(rathenaDir: string): TablesData {
  return {
    sizeModifier: convertSizeFix(loadDb(rathenaDir, `${PRE_RE_DIR}/size_fix.yml`).body),
    elementModifier: convertAttrFix(loadDb(rathenaDir, `${PRE_RE_DIR}/attr_fix.yml`).body),
  };
}
