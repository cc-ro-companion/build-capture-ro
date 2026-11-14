// Equipment slot rules for builds: which slots an item goes into and covers,
// what equipping an item clears, and which equipped items the build's job or
// level cannot wear. Mirrors rAthena's pc_equippoint and pc_equipitem.
import type { Item } from '../data/types';
import { SLOTS, type Slot } from '../engine/gear';
import { canEquip, itemName, jobName, type GameData } from './resolve';

export { SLOTS, type Slot };

/** ccRO refines to +10, like rAthena's default. */
export const MAX_REFINE = 10;

export interface EquippedRef {
  item: number;
  refine: number;
}

export type Equipment = Partial<Record<Slot, EquippedRef>>;

/** rAthena location names per slot (`Both_Accessory` and `Both_Hand` expand below). */
const SLOT_LOCATIONS: Record<Slot, string> = {
  headTop: 'Head_Top',
  headMid: 'Head_Mid',
  headLow: 'Head_Low',
  armor: 'Armor',
  garment: 'Garment',
  shoes: 'Shoes',
  accessoryLeft: 'Left_Accessory',
  accessoryRight: 'Right_Accessory',
  rightHand: 'Right_Hand',
  leftHand: 'Left_Hand',
};

/** Weapon types that `pc_equippoint` lets a dual-wield job hold in the left hand. */
const DUAL_WIELD_TYPES = new Set(['Dagger', '1hSword', '1hAxe']);

/**
 * Jobs that dual wield: pc_equippoint returns EQP_ARMS for Assassin (and
 * Kagerou/Oboro, which ccRO does not have) holding a dual-wield weapon type.
 */
const DUAL_WIELD_JOBS = new Set([12]);

function expandedLocations(item: Item): Set<string> {
  const locations = new Set(item.locations);
  if (locations.has('Both_Accessory')) {
    locations.add('Left_Accessory');
    locations.add('Right_Accessory');
  }
  if (locations.has('Both_Hand')) {
    locations.add('Right_Hand');
    locations.add('Left_Hand');
  }
  return locations;
}

function isDualWieldWeapon(item: Item): boolean {
  return (
    item.type === 'weapon' &&
    item.locations.includes('Right_Hand') &&
    DUAL_WIELD_TYPES.has(item.weaponType ?? '')
  );
}

/**
 * The slots an item fills once equipped in `slot`: every head slot of a
 * multi-location headgear, both hands for a two-handed weapon, else just `slot`.
 */
export function coveredSlots(item: Item, slot: Slot): Slot[] {
  if (slot === 'accessoryLeft' || slot === 'accessoryRight') return [slot];
  if (slot === 'leftHand' && item.type === 'weapon') return [slot];
  const locations = expandedLocations(item);
  return SLOTS.filter(
    (candidate) =>
      locations.has(SLOT_LOCATIONS[candidate]) &&
      candidate !== 'accessoryLeft' &&
      candidate !== 'accessoryRight',
  );
}

/**
 * The slot a build stores the item under: the first slot it covers, so a
 * multi-location headgear is stored once (the engine lists it once too).
 */
export function homeSlot(item: Item, slot: Slot): Slot {
  return coveredSlots(item, slot)[0] ?? slot;
}

/**
 * Whether the item can go into the slot regardless of job: its locations
 * include the slot, or it is a dual-wield weapon type and the slot is the
 * left hand (whether the job may dual wield is a separate, job-level check).
 */
export function fitsSlot(item: Item, slot: Slot): boolean {
  if (slot === 'leftHand' && isDualWieldWeapon(item)) return true;
  if (slot === 'leftHand' && item.type === 'weapon') return false;
  return expandedLocations(item).has(SLOT_LOCATIONS[slot]);
}

/** Whether the job can hold this item in this slot (dual wield is job-limited). */
export function jobCanUseSlot(item: Item, slot: Slot, jobId: number): boolean {
  return !(slot === 'leftHand' && item.type === 'weapon' && !DUAL_WIELD_JOBS.has(jobId));
}

/**
 * Equipment with `entry` put into `slot` (or the slot emptied with null).
 * Like pc_equipitem, the new item takes off everything whose covered slots
 * overlap its own. Caller checks `fitsSlot` first.
 */
export function withEquipped(
  equipment: Equipment,
  slot: Slot,
  entry: EquippedRef | null,
  data: GameData,
): Equipment {
  const next: Equipment = { ...equipment };
  const current = equipment[slot];
  if (entry === null) {
    delete next[slot];
    // A multi-location headgear is stored under its home slot only.
    if (!current) {
      for (const [otherSlot, other] of Object.entries(equipment) as [Slot, EquippedRef][]) {
        const otherItem = data.items.get(other.item);
        if (otherItem && coveredSlots(otherItem, otherSlot).includes(slot)) delete next[otherSlot];
      }
    }
    return next;
  }
  const item = data.items.get(entry.item);
  if (!item) return next;
  const home = homeSlot(item, slot);
  const covered = new Set(coveredSlots(item, slot));
  for (const [otherSlot, other] of Object.entries(equipment) as [Slot, EquippedRef][]) {
    const otherItem = data.items.get(other.item);
    const otherCovered = otherItem ? coveredSlots(otherItem, otherSlot) : [otherSlot];
    if (otherCovered.some((covers) => covered.has(covers))) delete next[otherSlot];
  }
  next[home] = entry;
  return next;
}

/**
 * Equipped items the build's job or level cannot wear. They stay in the
 * build, so a level or job change does not destroy gear, and are shown as
 * errors.
 */
export function equipmentErrors(
  equipment: Equipment,
  jobId: number,
  baseLevel: number,
  data: GameData,
): string[] {
  const errors: string[] = [];
  for (const slot of SLOTS) {
    const entry = equipment[slot];
    const item = entry && data.items.get(entry.item);
    if (!entry || !item) continue;
    const name = `${itemName(data, entry.item)} (${entry.item})`;
    if (!canEquip(item, jobId, baseLevel)) {
      errors.push(
        `${name} cannot be equipped by ${jobName(data, jobId)} at base level ${baseLevel}.`,
      );
    } else if (!jobCanUseSlot(item, slot, jobId)) {
      errors.push(`${name}: ${jobName(data, jobId)} cannot hold a weapon in the left hand.`);
    }
  }
  return errors;
}
