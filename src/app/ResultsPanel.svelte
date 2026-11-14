<script lang="ts">
  import { notModelledCount } from '../build/notModelled';
  import type { BuildState } from './build.svelte';

  let { planner }: { planner: BuildState } = $props();

  const status = $derived(planner.status);
  const result = $derived(planner.result);
  const notModelled = $derived(notModelledCount(planner.notModelled, planner.groups));
  const summary = $derived(
    `${notModelled} ${notModelled === 1 ? 'equipment effect' : 'equipment effects'} not modelled; ` +
      'see the notes in the equipment list.',
  );

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
    <dt>DEF</dt>
    <dd data-testid="status-def">{status.def[0]} + {status.def[1]}</dd>
    <dt>MDEF</dt>
    <dd data-testid="status-mdef">{status.mdef[0]} + {status.mdef[1]}</dd>
    <dt>Max HP</dt>
    <dd data-testid="status-hp">{status.maxHp}</dd>
    <dt>Max SP</dt>
    <dd data-testid="status-sp">{status.maxSp}</dd>
  </dl>

  {#if result}
    <h3>Auto attack</h3>
    <table class="damage">
      <thead>
        <tr><th></th><th>Min</th><th>Max</th><th>Avg</th></tr>
      </thead>
      <tbody>
        <tr data-testid="damage-normal">
          <th scope="row">{result.left ? 'Right hand' : 'Normal hit'}</th>
          <td>{result.normal.min}</td><td>{result.normal.max}</td><td>{round(result.normal.avg)}</td
          >
        </tr>
        <tr data-testid="damage-crit">
          <th scope="row">{result.left ? 'Right hand critical' : 'Critical'}</th>
          <td>{result.crit.min}</td><td>{result.crit.max}</td><td>{round(result.crit.avg)}</td>
        </tr>
        {#if result.left}
          {@const left = result.left}
          <tr data-testid="damage-left">
            <th scope="row">Left hand</th>
            <td>{left.normal.min}</td><td>{left.normal.max}</td><td>{round(left.normal.avg)}</td>
          </tr>
          <tr data-testid="damage-left-crit">
            <th scope="row">Left hand critical</th>
            <td>{left.crit.min}</td><td>{left.crit.max}</td><td>{round(left.crit.avg)}</td>
          </tr>
        {/if}
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
      <dt>DPS{result.left ? ' (both hands)' : ''}</dt>
      <dd data-testid="dps">{round(result.dps)}</dd>
    </dl>
  {:else}
    <p class="note">Pick a target monster or dummy for damage, hit chance and DPS.</p>
  {/if}

  {#if notModelled > 0}
    <p class="warning" data-testid="not-modelled-summary">
      {summary}
    </p>
  {/if}

  <p class="note">
    Not modelled yet: runes, item combos, skills and passives, buffs, ammunition for bows and guns,
    special monster damage rules.
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

  .warning {
    margin: 0;
    color: var(--color-error);
    font-size: 12px;
  }

  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
  }
</style>
