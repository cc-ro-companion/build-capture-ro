// Runes, rune sets and item combos in buildCharacter, and what they change in
// the status window and auto attack.
import { describe, expect, it } from 'vitest';
import type { Combo, RuneLocation, ScriptStmt } from '../data/types';
import { attackerCardFix, autoAttack, targetKeys, weaponElement } from './autoAttack';
import { rAthenaDefaults } from './config';
import { runeFits } from './equipment';
import { activeCombos, activeRuneSets, type EquippedItem, type Slot } from './gear';
import { statusWindow } from './status';
import { bonus, gearCharacter, testArmor, testMonster, testRune, testWeapon } from './testData';

const RC_PLANT = 3;
const ELE_WATER = 1;
const ELE_FIRE = 3;

/** `if (getrefine() >= 9) bonus bFlee,20;` */
const fleeAtRefine9: ScriptStmt = {
  k: 'if',
  cond: {
    k: 'op',
    op: '>=',
    args: [
      { k: 'call', fn: 'getrefine', args: [] },
      { k: 'num', v: 9 },
    ],
  },
  then: [bonus('bFlee', 20)],
  else: [],
};

const sword = testWeapon();
const shirt = testArmor();
const guard = testArmor({ id: 2101, locations: ['Left_Hand'] });
const flee = (equipment: EquippedItem[]) =>
  statusWindow(gearCharacter(equipment), rAthenaDefaults).flee;

describe('runeFits', () => {
  // Only hand slots can hold either a weapon or armor (a shield).
  const handCases: [RuneLocation, Slot, boolean, boolean][] = [
    // location, slot, fits a weapon there, fits a shield there
    ['Weapon', 'rightHand', true, false],
    ['Weapon', 'leftHand', true, false],
    ['Shield', 'leftHand', false, true],
    ['Shield', 'rightHand', false, false],
    ['Armor', 'leftHand', false, false],
  ];
  it.each(handCases)('%s rune in %s: weapon %s, shield %s', (location, slot, weapon, armor) => {
    expect(runeFits(location, slot, sword)).toBe(weapon);
    expect(runeFits(location, slot, guard)).toBe(armor);
  });

  const armorCases: [RuneLocation, Slot, boolean][] = [
    ['Armor', 'armor', true],
    ['Garment', 'garment', true],
    ['Footgear', 'shoes', true],
    ['Accessory', 'accessoryLeft', true],
    ['Accessory', 'accessoryRight', true],
    ['Headgear', 'headTop', true],
    ['Headgear', 'headMid', true],
    ['Headgear', 'headLow', true],
    ['Armor', 'garment', false],
    ['Headgear', 'armor', false],
    ['Weapon', 'armor', false],
    ['Shield', 'armor', false],
  ];
  it.each(armorCases)('%s rune in %s: %s', (location, slot, fits) => {
    expect(runeFits(location, slot, shirt)).toBe(fits);
  });
});

describe('runes in buildCharacter', () => {
  it('runs a rune with the refine of the item it sits in', () => {
    const rune = testRune({ location: 'Armor', effects: [fleeAtRefine9] });
    const base = flee([{ slot: 'armor', item: shirt, refine: 9 }]);
    expect(flee([{ slot: 'armor', item: shirt, refine: 9, runes: [rune] }])).toBe(base + 20);
    expect(flee([{ slot: 'armor', item: shirt, refine: 8, runes: [rune] }])).toBe(
      flee([{ slot: 'armor', item: shirt, refine: 8 }]),
    );
  });

  it('counts every copy of a rune, and records its origin and host item', () => {
    const rune = testRune({ id: 39200, effects: [bonus('bStr', 2)] });
    const character = gearCharacter([
      { slot: 'rightHand', item: sword, refine: 0, runes: [rune, rune] },
    ]);
    expect(character.equipmentStats.str).toBe(4);
    expect(character.bonuses.calls[0]).toEqual({
      name: 'bStr',
      args: [2],
      itemId: sword.id,
      slot: 'rightHand',
      origin: { kind: 'rune', runeId: 39200 },
      source: 'none',
    });
  });

  it('runs left-hand runes as left weapon, shield or not, like rAthena cards', () => {
    const rune = testRune({ location: 'Shield', effects: [bonus('bAddRace', RC_PLANT, 10)] });
    const character = gearCharacter([
      { slot: 'rightHand', item: sword, refine: 0 },
      { slot: 'leftHand', item: guard, refine: 0, runes: [rune] },
    ]);
    expect(character.bonuses.calls.map((call) => call.source)).toEqual(['leftWeapon']);
    // So a shield rune's race damage counts for melee only through
    // left_cardfix_to_right; arrow attacks read the right weapon alone.
    const poring = targetKeys(testMonster());
    expect(attackerCardFix(character.bonuses, poring, false)).toBe(1100);
    expect(attackerCardFix(character.bonuses, poring, true)).toBe(1000);
  });

  it('runs runes after item scripts, so a rune bAtkEle wins over the weapon’s', () => {
    const fireSword = testWeapon({ effects: [bonus('bAtkEle', ELE_FIRE)] });
    const waterRune = testRune({ effects: [bonus('bAtkEle', ELE_WATER)] });
    expect(
      weaponElement(
        gearCharacter([{ slot: 'rightHand', item: fireSword, refine: 0, runes: [waterRune] }]),
      ),
    ).toBe('Water');
  });

  it('never runs album effects', () => {
    const rune = testRune({
      album: [{ requires: ['Mobster Card'], rightHandOnly: true, effects: [bonus('bFlee', 50)] }],
    });
    const character = gearCharacter([{ slot: 'rightHand', item: sword, refine: 0, runes: [rune] }]);
    expect(character.bonuses.calls).toEqual([]);
  });

  it('changes the status window and auto attack', () => {
    const rune = testRune({ effects: [bonus('bStr', 10), bonus('bAddRace', RC_PLANT, 10)] });
    const plain = gearCharacter([{ slot: 'rightHand', item: sword, refine: 0 }]);
    const runed = gearCharacter([{ slot: 'rightHand', item: sword, refine: 0, runes: [rune] }]);
    const status = (character: typeof plain) => statusWindow(character, rAthenaDefaults);
    expect(status(runed).baseAtk).toBeGreaterThan(status(plain).baseAtk);
    const poring = testMonster();
    expect(attackerCardFix(runed.bonuses, targetKeys(poring), false)).toBe(1100);
    const tables = { sizeModifier: {}, elementModifier: [], refine: { armor: [], weapon: [] } };
    expect(autoAttack(runed, poring, tables, rAthenaDefaults).dps).toBeGreaterThan(
      autoAttack(plain, poring, tables, rAthenaDefaults).dps,
    );
  });
});

describe('rune sets', () => {
  const owner = testRune({
    id: 39105,
    sets: [{ requires: [39331, 39441], effects: [bonus('bFlee', 7)] }],
  });
  const soldier = testRune({ id: 39331 });
  const heater = testRune({ id: 39441, location: 'Footgear' });
  const shoes = testArmor({ id: 2401, locations: ['Shoes'] });

  it('applies once every required rune and the owner are equipped anywhere', () => {
    const equipment: EquippedItem[] = [
      { slot: 'rightHand', item: sword, refine: 0, runes: [owner, soldier] },
      { slot: 'shoes', item: shoes, refine: 0, runes: [heater] },
    ];
    expect(flee(equipment)).toBe(flee([]) + 7);
    const runs = gearCharacter(equipment).bonuses.runs.filter(
      (run) => run.origin.kind === 'runeSet',
    );
    expect(runs).toEqual([
      {
        itemId: sword.id,
        slot: 'rightHand',
        origin: { kind: 'runeSet', runeId: 39105, requires: [39331, 39441] },
        readsSkillLevel: false,
      },
    ]);
  });

  it('does not apply with a required rune missing, or without the owner', () => {
    expect(flee([{ slot: 'rightHand', item: sword, refine: 0, runes: [owner, soldier] }])).toBe(
      flee([]),
    );
    expect(
      flee([
        { slot: 'rightHand', item: sword, refine: 0, runes: [soldier] },
        { slot: 'shoes', item: shoes, refine: 0, runes: [heater] },
      ]),
    ).toBe(flee([]));
  });

  it('changes auto attack (a set bAddRace)', () => {
    const raceOwner = testRune({
      id: 39105,
      sets: [{ requires: [39331], effects: [bonus('bAddRace', RC_PLANT, 15)] }],
    });
    const runes = (list: (typeof soldier)[]) =>
      gearCharacter([{ slot: 'rightHand', item: sword, refine: 0, runes: list }]).bonuses;
    const poring = targetKeys(testMonster());
    expect(attackerCardFix(runes([raceOwner, soldier]), poring, false)).toBe(1150);
    expect(attackerCardFix(runes([raceOwner]), poring, false)).toBe(1000);
  });

  it('applies once even with the owner rune twice', () => {
    const equipment: EquippedItem[] = [
      { slot: 'rightHand', item: sword, refine: 0, runes: [owner, owner, soldier] },
      { slot: 'shoes', item: shoes, refine: 0, runes: [heater] },
    ];
    expect(activeRuneSets(equipment)).toHaveLength(1);
  });
});

describe('item combos', () => {
  const ring = testArmor({ id: 2601, locations: ['Left_Accessory', 'Right_Accessory'] });
  const swordAndShirt: Combo = { items: [sword.id, shirt.id], effects: [bonus('bFlee', 5)] };
  const twoRings: Combo = { items: [ring.id, ring.id], effects: [bonus('bHit', 3)] };
  const unread: Combo = { items: [sword.id, shirt.id], effects: null, unsupported: 'x' };

  it('applies once all items are equipped, and changes the status window', () => {
    const both: EquippedItem[] = [
      { slot: 'rightHand', item: sword, refine: 0 },
      { slot: 'armor', item: shirt, refine: 0 },
    ];
    const window = (equipment: EquippedItem[], combos: Combo[]) =>
      statusWindow(gearCharacter(equipment, {}, undefined, combos), rAthenaDefaults);
    expect(window(both, [swordAndShirt]).flee).toBe(window(both, []).flee + 5);
    expect(window(both.slice(0, 1), [swordAndShirt]).flee).toBe(window(both.slice(0, 1), []).flee);
    const runs = gearCharacter(both, {}, undefined, [swordAndShirt, unread]).bonuses.runs;
    expect(runs.filter((run) => run.origin.kind === 'combo')).toEqual([
      {
        itemId: null,
        slot: null,
        origin: { kind: 'combo', items: [sword.id, shirt.id] },
        readsSkillLevel: false,
      },
    ]);
  });

  it('needs two of an item the combo lists twice', () => {
    const left = { slot: 'accessoryLeft', item: ring, refine: 0 } as const;
    const right = { slot: 'accessoryRight', item: ring, refine: 0 } as const;
    expect(activeCombos([left], [twoRings])).toEqual([]);
    expect(activeCombos([left, right], [twoRings])).toEqual([twoRings]);
  });

  it('changes auto attack (a combo bAddRace)', () => {
    const combo: Combo = {
      items: [sword.id, shirt.id],
      effects: [bonus('bAddRace', RC_PLANT, 20)],
    };
    const character = gearCharacter(
      [
        { slot: 'rightHand', item: sword, refine: 0 },
        { slot: 'armor', item: shirt, refine: 0 },
      ],
      {},
      undefined,
      [combo],
    );
    expect(attackerCardFix(character.bonuses, targetKeys(testMonster()), false)).toBe(1200);
  });
});
