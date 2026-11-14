<script lang="ts">
  import { jobName } from '../build/resolve';
  import { jobBonus, statPointCost, STAT_NAMES, type StatName } from '../engine/stats';
  import type { BuildState } from './build.svelte';
  import EquipmentPanel from './EquipmentPanel.svelte';
  import InventoryPanel from './InventoryPanel.svelte';
  import NumberInput from './NumberInput.svelte';

  let { planner }: { planner: BuildState } = $props();

  const job = $derived(planner.resolved.character.job);
  const bonus = $derived(jobBonus(job, planner.build.jobLevel));
  const pointsLeft = $derived(planner.pointsBudget - planner.pointsSpent);

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

  <EquipmentPanel {planner} />
  <InventoryPanel {planner} />
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
</style>
