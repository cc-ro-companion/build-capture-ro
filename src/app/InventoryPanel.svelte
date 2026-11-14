<script lang="ts">
  import { slotsFor } from '../build/inventory';
  import { MAX_INVENTORY } from '../build/model';
  import { itemName, runeName } from '../build/resolve';
  import type { BuildState } from './build.svelte';
  import { SLOT_LABELS } from './slots';

  let { planner }: { planner: BuildState } = $props();
</script>

<div class="inventory">
  <h3>Inventory <span class="count">{planner.build.inventory.length}/{MAX_INVENTORY}</span></h3>
  {#if planner.inventoryMessage}
    <p class="message" role="alert">{planner.inventoryMessage}</p>
  {/if}
  {#if planner.build.inventory.length === 0}
    <p class="empty">No stored items. "Store" next to an equipped item keeps a copy here.</p>
  {:else}
    <ul aria-label="Inventory items">
      {#each planner.build.inventory as ref, index (index)}
        {@const name = itemName(planner.data, ref.item)}
        <li data-testid="inventory-{index}">
          <span class="name">
            {ref.refine > 0 ? `+${ref.refine} ` : ''}{name} ({ref.item})
            {#if ref.runes}
              <span class="runes">
                {ref.runes.map((runeId) => runeName(planner.data, runeId)).join(', ')}
              </span>
            {/if}
          </span>
          <span class="actions">
            {#each slotsFor(ref, planner.build.job, planner.data) as slot (slot)}
              <button
                type="button"
                aria-label="Equip {name} ({index + 1}) in {SLOT_LABELS[slot]}"
                onclick={() => planner.equipFromInventory(index, slot)}>{SLOT_LABELS[slot]}</button
              >
            {/each}
            <button
              type="button"
              class="remove"
              aria-label="Remove {name} ({index + 1}) from inventory"
              onclick={() => planner.removeInventoryItem(index)}>×</button
            >
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .inventory {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  h3 {
    margin: 0;
    font-size: 14px;
  }

  .count,
  .empty,
  .runes {
    color: var(--color-muted);
    font-size: 12px;
    font-weight: normal;
  }

  .empty,
  .message {
    margin: 0;
  }

  .message {
    color: var(--color-error);
    font-size: 12px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px;
    padding: 2px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .runes {
    display: block;
  }

  .actions button {
    border: 0;
    background: none;
    color: var(--color-link);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .actions .remove {
    color: var(--color-muted);
  }
</style>
