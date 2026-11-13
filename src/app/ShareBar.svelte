<script lang="ts">
  import { shareLink } from '../build/shareCode';
  import type { BuildState } from './build.svelte';

  let { planner, pageUrl }: { planner: BuildState; pageUrl: string } = $props();

  let copyStatus = $state('');

  const link = $derived(shareLink(pageUrl, planner.shareCode));

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copyStatus = 'Copied.';
    } catch {
      copyStatus = 'Copying failed; select the link and copy it by hand.';
    }
  }
</script>

<div class="share">
  <div class="row">
    <button type="button" onclick={copy}>Copy share link</button>
    <input
      type="text"
      readonly
      value={link}
      aria-label="Share link"
      onfocus={(event) => event.currentTarget.select()}
    />
    <span class="status" aria-live="polite">{copyStatus}</span>
  </div>
  {#if planner.loadError}
    <p class="error" role="alert">{planner.loadError}</p>
  {/if}
  {#if planner.dataHint}
    <p class="hint" data-testid="data-hint">{planner.dataHint}</p>
  {/if}
  {#if planner.warnings.length > 0}
    <ul class="warnings" aria-label="Build warnings">
      {#each planner.warnings as warning, index (index)}
        <li>{warning}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .share {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  input {
    flex: 1;
    min-width: 200px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }

  .status {
    color: var(--color-muted);
  }

  p,
  ul {
    margin: 0;
  }

  .error {
    color: var(--color-error);
  }

  .hint,
  .warnings {
    color: var(--color-banner-text);
    background: var(--color-banner-bg);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .warnings {
    padding-left: 24px;
  }
</style>
