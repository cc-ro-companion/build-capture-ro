import { describe, expect, it } from 'vitest';
import { convertMonster } from './monsters.ts';

describe('convertMonster', () => {
  it('fills rAthena defaults for absent fields', () => {
    expect(convertMonster({ Id: 1, AegisName: 'BARE', Name: 'Bare' })).toEqual({
      id: 1,
      aegisName: 'BARE',
      level: 1,
      hp: 1,
      attackMin: 0,
      attackMax: 0,
      defense: 0,
      magicDefense: 0,
      str: 1,
      agi: 1,
      vit: 1,
      int: 1,
      dex: 1,
      luk: 1,
      size: 'small',
      race: 'Formless',
      raceGroups: [],
      element: 'Neutral',
      elementLevel: 1,
      class: 'normal',
      modes: [],
      attackRange: 0,
      attackDelay: 100,
      attackMotion: 100,
      damageMotion: 0,
      walkSpeed: 150,
    });
  });

  it('maps attack, size, class and lists only the set flags', () => {
    const monster = convertMonster({
      Id: 2,
      AegisName: 'BOSS',
      Attack: 7,
      Attack2: 10,
      Size: 'Large',
      Class: 'Boss',
      Modes: { Mvp: true, Detector: false },
      RaceGroups: { Goblin: true },
    });
    expect(monster).toMatchObject({
      attackMin: 7,
      attackMax: 10,
      size: 'large',
      class: 'boss',
      modes: ['Mvp'],
      raceGroups: ['Goblin'],
    });
  });

  it('rejects unknown enum values', () => {
    expect(() => convertMonster({ Id: 3, AegisName: 'X', Element: 'Lightning' })).toThrow(
      'monster 3: unknown Element "Lightning".',
    );
    expect(() => convertMonster({ Id: 3, AegisName: 'X', Size: 'Huge' })).toThrow(
      'monster 3: unknown Size "Huge".',
    );
  });
});
