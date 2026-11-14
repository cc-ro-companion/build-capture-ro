// The build's inventory: configured items (refine, runes) kept for quick
// swapping. Storing and equipping copy the item, so the inventory and the
// equipped gear never share an entry.
import { fitsSlot, SLOTS, withEquipped, type EquippedRef, type Slot } from './equipment';
import { MAX_INVENTORY, type Build } from './model';
import type { GameData } from './resolve';

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

/** Slots the inventory item can be equipped into, in slot order. */
export function slotsFor(ref: EquippedRef, data: GameData): Slot[] {
  const item = data.items.get(ref.item);
  return item ? SLOTS.filter((slot) => fitsSlot(item, slot)) : [];
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
  if (!slotsFor(ref, data).includes(slot)) return { error: 'The item does not go there.' };
  return {
    build: { ...build, equipment: withEquipped(build.equipment, slot, copyRef(ref), data) },
  };
}

export function removeFromInventory(build: Build, index: number): Build {
  return { ...build, inventory: build.inventory.filter((_, position) => position !== index) };
}
