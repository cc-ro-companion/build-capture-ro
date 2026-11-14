<script lang="ts">
  import { coveredSlots, MAX_REFINE, SLOTS, type Slot } from '../build/equipment';
  import { noteText } from '../build/notModelled';
  import { itemName, levelCanEquip } from '../build/resolve';
  import { searchEquipment } from '../build/search';
  import type { Item } from '../data/types';
  import { usesArrowPath } from '../engine/status';
  import type { BuildState } from './build.svelte';
  import NumberInput from './NumberInput.svelte';

  let { planner }: { planner: BuildState } = $props();

  const SLOT_LABELS: Record<Slot, string> = {
    headTop: 'Upper headgear',
    headMid: 'Middle headgear',
    headLow: 'Lower headgear',
    armor: 'Armor',
    garment: 'Garment',
    shoes: 'Shoes',
    accessoryLeft: 'Left accessory',
    accessoryRight: 'Right accessory',
    rightHand: 'Right hand',
    leftHand: 'Left hand',
  };

  let activeSlot = $state<Slot>('rightHand');
  let query = $state('');
  let showHidden = $state(false);

  const activeLabel = $derived(SLOT_LABELS[activeSlot]);
  const results = $derived(
    searchEquipment(query, activeSlot, planner.build.job, planner.data, { showHidden }),
  );
  const weapon = $derived(planner.resolved.character.weapon);
  const rangedWeapon = $derived(usesArrowPath(weapon?.weaponType ?? ''));

  /**
   * The slot whose item also fills `slot`: a multi-location headgear is
   * stored under its first slot only, a two-handed weapon under the right hand.
   */
  function coveringSlot(slot: Slot): Slot | null {
    for (const other of SLOTS) {
      if (other === slot) continue;
      const entry = planner.build.equipment[other];
      const item = entry && planner.data.items.get(entry.item);
      if (item && coveredSlots(item, other).includes(slot)) return other;
    }
    return null;
  }

  function selectSlot(slot: Slot) {
    if (slot !== activeSlot) query = '';
    activeSlot = slot;
  }

  function describe(item: Item): string {
    const level = `Lv ${item.equipLevelMin}`;
    if (item.type === 'weapon') {
      return `${item.id} · ${item.weaponType} · ATK ${item.attack} · ${level}`;
    }
    return `${item.id} · DEF ${item.defense} · ${level}`;
  }
</script>

<div class="equipment">
  <h3>Equipment</h3>
  <table class="slots" aria-label="Equipment slots">
    <tbody>
      {#each SLOTS as slot (slot)}
        {@const entry = planner.build.equipment[slot]}
        {@const covering = entry ? null : coveringSlot(slot)}
        {@const coveringEntry = covering ? planner.build.equipment[covering] : undefined}
        {@const item = entry ? planner.data.items.get(entry.item) : undefined}
        {@const note = planner.notModelled[slot]}
        <tr class:active={slot === activeSlot} data-testid="slot-{slot}">
          <th scope="row">
            <button
              type="button"
              class="slot-name"
              aria-pressed={slot === activeSlot}
              onclick={() => selectSlot(slot)}>{SLOT_LABELS[slot]}</button
            >
          </th>
          <td class="item">
            {#if entry}
              {itemName(planner.data, entry.item)} ({entry.item})
              {#if note}
                <span class="not-modelled" data-testid="note-{slot}">{noteText(note)}</span>
              {/if}
            {:else if coveringEntry}
              <span class="covered">{itemName(planner.data, coveringEntry.item)} (also here)</span>
            {:else}
              <span class="empty">Empty</span>
            {/if}
          </td>
          <td class="refine">
            {#if entry && item?.refineable}
              <span class="plus">+</span>
              <NumberInput
                label="{SLOT_LABELS[slot]} refine"
                hideLabel
                value={entry.refine}
                min={0}
                max={MAX_REFINE}
                onchange={(value) => planner.setRefine(slot, value)}
              />
            {/if}
          </td>
          <td class="remove">
            {#if entry || coveringEntry}
              <button
                type="button"
                aria-label="Remove {SLOT_LABELS[slot]}"
                onclick={() => planner.equip(slot, null)}>×</button
              >
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if planner.equipmentErrors.length > 0}
    <ul class="errors" aria-label="Equipment errors">
      {#each planner.equipmentErrors as error, index (index)}
        <li role="alert">{error}</li>
      {/each}
    </ul>
  {/if}
  {#if rangedWeapon}
    <p class="note">Computed without ammunition (no arrow or bullet ATK); ammo comes later.</p>
  {/if}

  <div class="picker">
    <input
      type="search"
      placeholder="Search {activeLabel.toLowerCase()} by name or id"
      aria-label="Search {activeLabel.toLowerCase()}"
      bind:value={query}
    />
    <label class="toggle">
      <input type="checkbox" bind:checked={showHidden} />
      Show hidden items
    </label>
    <ul class="results" aria-label="{activeLabel} results">
      {#each results.matches as item (item.id)}
        <li>
          <button
            type="button"
            class:active={item.id === planner.build.equipment[activeSlot]?.item}
            class:level-blocked={!levelCanEquip(item, planner.build.baseLevel)}
            onclick={() => planner.equip(activeSlot, item.id)}
          >
            {itemName(planner.data, item.id)}
            <span class="meta">{describe(item)}</span>
          </button>
        </li>
      {:else}
        <li class="none">No items for this slot match.</li>
      {/each}
    </ul>
    {#if results.total > results.matches.length}
      <p class="note">
        Showing {results.matches.length} of {results.total}; type to narrow the list.
      </p>
    {/if}
  </div>
</div>

<style>
  .equipment {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h3 {
    margin: 0;
    font-size: 14px;
  }

  .slots {
    border-collapse: collapse;
    width: 100%;
  }

  .slots th,
  .slots td {
    padding: 2px 4px;
    text-align: left;
    vertical-align: top;
  }

  .slots tr.active {
    background: var(--color-highlight);
  }

  .slot-name {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .item {
    width: 100%;
  }

  .empty,
  .covered {
    color: var(--color-muted);
  }

  .not-modelled {
    display: block;
    color: var(--color-muted);
    font-size: 12px;
  }

  .refine {
    white-space: nowrap;
  }

  .refine :global(input) {
    width: 3.5em;
  }

  .plus {
    color: var(--color-muted);
  }

  .remove button {
    border: 0;
    background: none;
    color: var(--color-muted);
    font: inherit;
    cursor: pointer;
  }

  .errors {
    margin: 0;
    padding-left: 18px;
    color: var(--color-error);
    font-size: 12px;
  }

  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
  }

  .toggle {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
    font-size: 12px;
  }

  input[type='search'] {
    width: 100%;
    box-sizing: border-box;
  }

  .results {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .results .none {
    padding: 3px 6px;
    color: var(--color-muted);
  }

  .results button {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 3px 6px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .results button:hover,
  .results button.active {
    background: var(--color-highlight);
  }

  .meta {
    color: var(--color-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  /* Equippable, but not at the current base level; the build reports it as an error. */
  .results button.level-blocked,
  .results button.level-blocked .meta {
    color: var(--color-error);
  }
</style>
