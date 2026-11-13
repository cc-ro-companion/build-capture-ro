<script lang="ts">
  import { monsterName } from '../build/resolve';
  import { searchMonsters } from '../build/search';
  import { monsterFlee } from '../engine/autoAttack';
  import type { BuildState } from './build.svelte';
  import DummyEditor from './DummyEditor.svelte';

  let { planner }: { planner: BuildState } = $props();

  let query = $state('');

  const monsters = $derived(searchMonsters(query, planner.data));
  const monster = $derived(planner.resolved.monster);
  const dummy = $derived(planner.resolved.dummy);
  const targetMonsterId = $derived(
    planner.build.target && 'monster' in planner.build.target ? planner.build.target.monster : null,
  );
</script>

<div class="panel">
  {#if monster}
    <p class="selected" data-testid="selected-target">
      {#if dummy}
        {dummy.name} <span class="kind">(training dummy)</span>
      {:else}
        {monsterName(planner.data, monster.id)} ({monster.id})
      {/if}
      <button type="button" class="clear" onclick={() => planner.setTarget(null)}>Clear</button>
    </p>
    <dl class="facts">
      <dt>Level</dt>
      <dd>{monster.level}</dd>
      <dt>HP</dt>
      <dd data-testid="target-hp">{dummy ? '–' : monster.hp}</dd>
      <dt>Size</dt>
      <dd>{monster.size}</dd>
      <dt>Race</dt>
      <dd>{monster.race}</dd>
      <dt>Element</dt>
      <dd>{monster.element} {monster.elementLevel}</dd>
      <dt>DEF</dt>
      <dd>{monster.defense}</dd>
      <dt>VIT</dt>
      <dd>{monster.vit}</dd>
      <dt>FLEE</dt>
      <dd>{monsterFlee(monster)}</dd>
      <dt>LUK</dt>
      <dd>{monster.luk}</dd>
    </dl>
  {:else}
    <p class="note">Pick a monster or a training dummy to see auto attack damage.</p>
  {/if}

  <input
    type="search"
    placeholder="Search monster by name or id"
    aria-label="Search monster"
    bind:value={query}
  />
  <ul class="results" aria-label="Monster results">
    {#each monsters.matches as candidate (candidate.id)}
      <li>
        <button
          type="button"
          class:active={candidate.id === targetMonsterId}
          onclick={() => planner.setMonster(candidate.id)}
        >
          {monsterName(planner.data, candidate.id)}
          <span class="meta">{candidate.id} · Lv {candidate.level}</span>
        </button>
      </li>
    {/each}
  </ul>
  {#if monsters.total > monsters.matches.length}
    <p class="note">
      Showing {monsters.matches.length} of {monsters.total}; type to narrow the list.
    </p>
  {/if}

  <DummyEditor {planner} />
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .selected {
    margin: 0;
    font-weight: 600;
  }

  .kind {
    color: var(--color-muted);
    font-weight: normal;
  }

  .clear {
    margin-left: 6px;
    font-size: 12px;
  }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  .facts dt {
    color: var(--color-muted);
  }

  .facts dd {
    margin: 0;
  }

  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
  }

  input[type='search'] {
    width: 100%;
    box-sizing: border-box;
  }

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
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
</style>
