<script lang="ts">
  import { jobName, itemName } from '../build/resolve';
  import { searchWeapons } from '../build/search';
  import { jobBonus, statPointCost, STAT_NAMES, type StatName } from '../engine/stats';
  import type { BuildState } from './build.svelte';
  import NumberInput from './NumberInput.svelte';

  let { planner }: { planner: BuildState } = $props();

  let weaponQuery = $state('');

  const job = $derived(planner.resolved.character.job);
  const bonus = $derived(jobBonus(job, planner.build.jobLevel));
  const pointsLeft = $derived(planner.pointsBudget - planner.pointsSpent);
  const weapons = $derived(
    searchWeapons(weaponQuery, planner.build.job, planner.build.baseLevel, planner.data),
  );
  const weapon = $derived(planner.resolved.character.weapon);
  const rangedWeapon = $derived(
    ['Bow', 'Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'].includes(
      weapon?.weaponType ?? '',
    ),
  );

  function onJobChange(event: Event & { currentTarget: HTMLSelectElement }) {
    planner.setJob(Number(event.currentTarget.value));
  }

  function statLabel(stat: StatName): string {
    return stat.toUpperCase();
  }
</script>

<div class="panel">
  <label class="row">
    <span>Job</span>
    <select value={String(planner.build.job)} onchange={onJobChange}>
      {#each planner.data.jobOrder as jobId (jobId)}
        <option value={String(jobId)}>{jobName(planner.data, jobId)}</option>
      {/each}
    </select>
  </label>

  <div class="levels">
    <NumberInput
      label="Base level"
      value={planner.build.baseLevel}
      min={1}
      max={job.maxBaseLevel}
      onchange={(value) => planner.setBaseLevel(value)}
    />
    <NumberInput
      label="Job level"
      value={planner.build.jobLevel}
      min={1}
      max={job.maxJobLevel}
      onchange={(value) => planner.setJobLevel(value)}
    />
  </div>

  <table class="stats">
    <thead>
      <tr><th>Stat</th><th>Base</th><th>Job</th><th>Total</th><th>Next</th></tr>
    </thead>
    <tbody>
      {#each STAT_NAMES as stat (stat)}
        <tr>
          <th scope="row">{statLabel(stat)}</th>
          <td>
            <NumberInput
              label={statLabel(stat)}
              hideLabel
              value={planner.build.stats[stat]}
              min={1}
              max={planner.config.maxStat}
              onchange={(value) => planner.setStat(stat, value)}
            />
          </td>
          <td class="number">+{bonus[stat]}</td>
          <td class="number" data-testid="total-{stat}"
            >{planner.build.stats[stat] + bonus[stat]}</td
          >
          <td class="number">
            {planner.build.stats[stat] < planner.config.maxStat
              ? statPointCost(planner.build.stats[stat])
              : '–'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="points" class:over={pointsLeft < 0} data-testid="points-left">
    Points left: {pointsLeft} of {planner.pointsBudget}
    {#if pointsLeft < 0}
      <strong role="alert">— over budget by {-pointsLeft}</strong>
    {/if}
  </p>

  <div class="picker">
    <h3>Weapon</h3>
    <p class="selected" data-testid="selected-weapon">
      {weapon ? `${itemName(planner.data, weapon.id)} (${weapon.id})` : 'No weapon'}
    </p>
    {#if rangedWeapon}
      <p class="note">Computed without ammunition (no arrow or bullet ATK); ammo comes later.</p>
    {/if}
    <input
      type="search"
      placeholder="Search weapon by name or id"
      aria-label="Search weapon"
      bind:value={weaponQuery}
    />
    <ul class="results" aria-label="Weapon results">
      <li>
        <button type="button" onclick={() => planner.setWeapon(null)}>No weapon</button>
      </li>
      {#each weapons.matches as item (item.id)}
        <li>
          <button
            type="button"
            class:active={item.id === planner.build.weapon}
            onclick={() => planner.setWeapon(item.id)}
          >
            {itemName(planner.data, item.id)}
            <span class="meta">{item.id} · {item.weaponType} · ATK {item.attack}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if weapons.total > weapons.matches.length}
      <p class="note">
        Showing {weapons.matches.length} of {weapons.total}; type to narrow the list.
      </p>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .levels {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .stats {
    border-collapse: collapse;
  }

  .stats th,
  .stats td {
    padding: 2px 6px;
    text-align: left;
  }

  .number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .points {
    margin: 0;
  }

  .over {
    color: var(--color-error);
  }

  .picker h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .selected {
    margin: 0 0 6px;
    font-weight: 600;
  }

  .note {
    margin: 4px 0;
    color: var(--color-muted);
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
