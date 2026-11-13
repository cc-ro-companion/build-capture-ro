<script lang="ts">
  import type { BuildState } from './build.svelte';

  let { planner }: { planner: BuildState } = $props();

  const status = $derived(planner.status);
  const result = $derived(planner.result);

  function round(value: number, digits = 1): string {
    return value.toFixed(digits);
  }

  function percent(chance: number): string {
    return `${round(chance * 100)} %`;
  }
</script>

<div class="panel">
  <h3>Status window</h3>
  <dl class="values" aria-label="Status window">
    <dt>ATK</dt>
    <dd data-testid="status-atk">{status.atk[0]} + {status.atk[1]}</dd>
    <dt>HIT</dt>
    <dd data-testid="status-hit">{status.hit}</dd>
    <dt>FLEE</dt>
    <dd data-testid="status-flee">{status.flee} + {status.perfectDodge}</dd>
    <dt>CRIT</dt>
    <dd data-testid="status-crit">{status.crit}</dd>
    <dt>ASPD</dt>
    <dd data-testid="status-aspd">{status.aspd}</dd>
  </dl>

  {#if result}
    <h3>Auto attack</h3>
    <table class="damage">
      <thead>
        <tr><th></th><th>Min</th><th>Max</th><th>Avg</th></tr>
      </thead>
      <tbody>
        <tr data-testid="damage-normal">
          <th scope="row">Normal hit</th>
          <td>{result.normal.min}</td><td>{result.normal.max}</td><td>{round(result.normal.avg)}</td
          >
        </tr>
        <tr data-testid="damage-crit">
          <th scope="row">Critical</th>
          <td>{result.crit.min}</td><td>{result.crit.max}</td><td>{round(result.crit.avg)}</td>
        </tr>
      </tbody>
    </table>
    <dl class="values" aria-label="Auto attack">
      <dt>Hit chance</dt>
      <dd data-testid="hit-chance">{percent(result.hitChance)}</dd>
      <dt>Crit chance</dt>
      <dd data-testid="crit-chance">{percent(result.critChance)}</dd>
      <dt>ASPD</dt>
      <dd>{round(result.aspd)}</dd>
      <dt>Attacks/s</dt>
      <dd>{round(result.attacksPerSecond, 2)}</dd>
      <dt>DPS</dt>
      <dd data-testid="dps">{round(result.dps)}</dd>
    </dl>
  {:else}
    <p class="note">Pick a target monster or dummy for damage, hit chance and DPS.</p>
  {/if}

  <p class="note">
    Not modelled yet: refinement, cards, other equipment, skills and passives, buffs, ammunition for
    bows and guns, special monster damage rules.
  </p>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h3 {
    margin: 4px 0 0;
    font-size: 14px;
  }

  .values {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }

  .values dt {
    color: var(--color-muted);
  }

  .values dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .damage {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .damage th,
  .damage td {
    padding: 2px 8px;
    text-align: right;
  }

  .damage th[scope='row'] {
    text-align: left;
    font-weight: normal;
    color: var(--color-muted);
  }

  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
  }
</style>
