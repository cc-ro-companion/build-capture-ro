// The build's inventory: configured items (refine, runes) kept for quick
// swapping. Storing and equipping copy the item, so the inventory and the
// equipped gear never share an entry.
import {
  fitsSlot,
  jobCanUseSlot,
  SLOTS,
  withEquipped,
  type EquippedRef,
  type Slot,
} from './equipment';
import { MAX_INVENTORY, type Build } from './model';
import { jobCanEquip, type GameData } from './resolve';

export type InventoryResult = { build: Build } | { error: string };

function copyRef(ref: EquippedRef): EquippedRef {
  return { item: ref.item, refine: ref.refine, ...(ref.runes ? { runes: [...ref.runes] } : {}) };
}

/** The build with a copy of the item in `slot` added to the end of the inventory. */
export function storeEquipped(build: Build, slot: Slot): InventoryResult {
  const entry = build.equipment[slot];
  if (!entry) return { error: 'Nothing is equipped there.' };
  if (build.inventory.length >= MAX_INVENTORY) {
    return { error: `The inventory is full (${MAX_INVENTORY} items).` };
  }
  return { build: { ...build, inventory: [...build.inventory, copyRef(entry)] } };
}

/**
 * Slots the job can equip the inventory item into, in slot order: the slots
 * the equipment picker would offer it for (none if the job cannot wear it).
 */
export function slotsFor(ref: EquippedRef, jobId: number, data: GameData): Slot[] {
  const item = data.items.get(ref.item);
  if (!item || !jobCanEquip(item, jobId)) return [];
  return SLOTS.filter((slot) => fitsSlot(item, slot) && jobCanUseSlot(item, slot, jobId));
}

/**
 * The build with a copy of inventory item `index` equipped into `slot`,
 * replacing whatever it overlaps there, as equipping from the panel does.
 */
export function equipFromInventory(
  build: Build,
  index: number,
  slot: Slot,
  data: GameData,
): InventoryResult {
  const ref = build.inventory[index];
  if (!ref) return { error: 'No such inventory item.' };
  if (!slotsFor(ref, build.job, data).includes(slot))
    return { error: 'The item does not go there.' };
  return {
    build: { ...build, equipment: withEquipped(build.equipment, slot, copyRef(ref), data) },
  };
}

export function removeFromInventory(build: Build, index: number): Build {
  return { ...build, inventory: build.inventory.filter((_, position) => position !== index) };
}
