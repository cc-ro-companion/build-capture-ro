import { describe, expect, it } from 'vitest';
import {
  coveredSlots,
  equipmentErrors,
  fitsSlot,
  homeSlot,
  withEquipped,
  type Equipment,
} from './equipment';
import { gameData } from './resolve';

const ASSASSIN = 12;
const SWORDMAN = 1;
const RIBBON = 2208; // Head_Top
const SUNGLASSES = 2201; // Head_Mid
const GOGGLES = 2224; // Head_Mid + Head_Top
const RING = 2601; // Both_Accessory
const KNIFE = 1201; // Dagger
const JUR = 1250; // Katar, Both_Hand
const GUARD = 2101; // Shield

function item(id: number) {
  const found = gameData.items.get(id);
  if (!found) throw new Error(`test item ${id} missing`);
  return found;
}

function equip(equipment: Equipment, slot: Parameters<typeof withEquipped>[1], id: number) {
  return withEquipped(equipment, slot, { item: id, refine: 0 }, gameData);
}

describe('slot rules', () => {
  it('lets an accessory go on either side', () => {
    expect(fitsSlot(item(RING), 'accessoryLeft')).toBe(true);
    expect(fitsSlot(item(RING), 'accessoryRight')).toBe(true);
    expect(coveredSlots(item(RING), 'accessoryRight')).toEqual(['accessoryRight']);
  });

  it('covers every head slot of a multi-location headgear and stores it under the first', () => {
    expect(fitsSlot(item(GOGGLES), 'headMid')).toBe(true);
    expect(fitsSlot(item(GOGGLES), 'headLow')).toBe(false);
    expect(coveredSlots(item(GOGGLES), 'headMid')).toEqual(['headTop', 'headMid']);
    expect(homeSlot(item(GOGGLES), 'headMid')).toBe('headTop');
  });

  it('puts a two-handed weapon in the right hand only, covering both hands', () => {
    expect(fitsSlot(item(JUR), 'rightHand')).toBe(true);
    expect(fitsSlot(item(JUR), 'leftHand')).toBe(false);
    expect(coveredSlots(item(JUR), 'rightHand')).toEqual(['rightHand', 'leftHand']);
  });

  it('takes a shield or a dual-wield weapon type in the left hand', () => {
    expect(fitsSlot(item(GUARD), 'leftHand')).toBe(true);
    expect(fitsSlot(item(GUARD), 'rightHand')).toBe(false);
    expect(fitsSlot(item(KNIFE), 'leftHand')).toBe(true);
    expect(coveredSlots(item(KNIFE), 'leftHand')).toEqual(['leftHand']);
  });
});

describe('withEquipped', () => {
  it('takes off what a multi-location headgear overlaps, and the other way round', () => {
    const top = equip(equip({}, 'headTop', RIBBON), 'headMid', SUNGLASSES);
    const goggles = equip(top, 'headMid', GOGGLES);
    expect(goggles).toEqual({ headTop: { item: GOGGLES, refine: 0 } });
    expect(equip(goggles, 'headMid', SUNGLASSES)).toEqual({
      headMid: { item: SUNGLASSES, refine: 0 },
    });
  });

  it('empties a multi-location headgear from any slot it covers', () => {
    const goggles = equip({}, 'headTop', GOGGLES);
    expect(withEquipped(goggles, 'headMid', null, gameData)).toEqual({});
  });

  it('clears the left hand for a two-handed weapon and the weapon for a shield', () => {
    const shield = equip(equip({}, 'rightHand', KNIFE), 'leftHand', GUARD);
    const katar = equip(shield, 'rightHand', JUR);
    expect(katar).toEqual({ rightHand: { item: JUR, refine: 0 } });
    expect(equip(katar, 'leftHand', KNIFE)).toEqual({ leftHand: { item: KNIFE, refine: 0 } });
  });

  it('keeps two different accessories and two daggers', () => {
    const gear = equip(
      equip(equip(equip({}, 'accessoryLeft', RING), 'accessoryRight', RING), 'rightHand', KNIFE),
      'leftHand',
      KNIFE,
    );
    expect(Object.keys(gear).sort()).toEqual([
      'accessoryLeft',
      'accessoryRight',
      'leftHand',
      'rightHand',
    ]);
  });
});

describe('equipmentErrors', () => {
  it('reports a left-hand weapon for a job that cannot dual wield', () => {
    const gear = equip(equip({}, 'rightHand', KNIFE), 'leftHand', KNIFE);
    expect(equipmentErrors(gear, ASSASSIN, 99, gameData)).toEqual([]);
    expect(equipmentErrors(gear, SWORDMAN, 99, gameData)).toEqual([
      'Knife (1201): Swordman cannot hold a weapon in the left hand.',
    ]);
  });

  it('reports items the job or level cannot wear', () => {
    const katar = equip({}, 'rightHand', JUR);
    expect(equipmentErrors(katar, SWORDMAN, 99, gameData)).toEqual([
      'Jur (1250) cannot be equipped by Swordman.',
    ]);
  });

  it('says when the base level is too low for an item', () => {
    const katar = equip({}, 'rightHand', JUR);
    const needed = item(JUR).equipLevelMin;
    expect(equipmentErrors(katar, ASSASSIN, needed - 1, gameData)).toEqual([
      `Base level ${needed - 1} is too low for Jur (1250); it needs base level ${needed}.`,
    ]);
    expect(equipmentErrors(katar, ASSASSIN, needed, gameData)).toEqual([]);
  });
});
