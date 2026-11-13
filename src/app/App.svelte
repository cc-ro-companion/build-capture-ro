<script lang="ts">
  import { gameData } from '../build/resolve';
  import { shareCodeFromFragment } from '../build/shareCode';
  import { browserStorage } from '../build/storage';
  import { dataMeta } from '../data';
  import { rAthenaDefaults } from '../engine/config';
  import { BuildState } from './build.svelte';
  import BuildPanel from './BuildPanel.svelte';
  import ResultsPanel from './ResultsPanel.svelte';
  import ShareBar from './ShareBar.svelte';
  import TargetPanel from './TargetPanel.svelte';
  import { appVersion, dataVersion } from './version';

  const sharedCode = shareCodeFromFragment(window.location.hash);

  const buildState = new BuildState({
    data: gameData,
    config: rAthenaDefaults,
    version: { hash: dataMeta.hash, label: dataMeta.label },
    storage: browserStorage(),
    sharedCode,
    confirmReplace: (message) => window.confirm(message),
  });

  // The link has been read; drop the fragment so a reload shows the saved
  // build instead of asking again.
  if (sharedCode !== null) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }

  const pageUrl = window.location.href.split('#')[0] ?? '';

  $effect(() => {
    buildState.save();
  });
</script>

<div class="shell">
  <div class="banner" role="status">
    Unfinished: this planner is under development and its numbers are not validated yet.
  </div>

  <header class="header">
    <h1>ccRO Build Planner</h1>
    <span class="version">v{appVersion}</span>
  </header>

  <ShareBar planner={buildState} {pageUrl} />

  <main class="main">
    <section class="region" aria-labelledby="region-build">
      <h2 id="region-build">Build</h2>
      <BuildPanel planner={buildState} />
    </section>
    <section class="region" aria-labelledby="region-target">
      <h2 id="region-target">Target</h2>
      <TargetPanel planner={buildState} />
    </section>
    <section class="region" aria-labelledby="region-results">
      <h2 id="region-results">Results</h2>
      <ResultsPanel planner={buildState} />
    </section>
  </main>

  <footer class="footer">
    <p>Unofficial fan project, not affiliated with ccRO or Gravity. All numbers are estimates.</p>
    <p>
      Based on <a href="https://github.com/rathena/rathena">rAthena</a>. Licensed under GPL-3.0.
    </p>
    <p class="data-version">{dataVersion}</p>
  </footer>
</div>

<style>
  :global(:root) {
    --color-bg: #f6f7f9;
    --color-surface: #ffffff;
    --color-border: #d9dde3;
    --color-text: #1d2330;
    --color-muted: #5b6474;
    --color-banner-bg: #fff4d6;
    --color-banner-text: #6b4e00;
    --color-link: #1f5fbf;
    --color-error: #b3261e;
    --color-highlight: #e6eefb;
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --color-bg: #14171c;
      --color-surface: #1c2027;
      --color-border: #2e343d;
      --color-text: #e3e6eb;
      --color-muted: #9aa3b2;
      --color-banner-bg: #3a3014;
      --color-banner-text: #f2d98a;
      --color-link: #7fb0ff;
      --color-error: #ff8a80;
      --color-highlight: #26354d;
    }
  }

  :global(body) {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: system-ui, sans-serif;
    font-size: 14px;
  }

  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .banner {
    padding: 6px 16px;
    background: var(--color-banner-bg);
    color: var(--color-banner-text);
    text-align: center;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h1 {
    margin: 0;
    font-size: 18px;
  }

  .version {
    color: var(--color-muted);
  }

  .main {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(320px, 2fr) minmax(240px, 1fr) minmax(280px, 1.5fr);
    gap: 12px;
    padding: 12px 16px;
  }

  @media (max-width: 900px) {
    .main {
      grid-template-columns: 1fr;
    }
  }

  .region {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 12px;
  }

  .region h2 {
    margin: 0 0 8px;
    font-size: 15px;
  }

  .footer {
    padding: 8px 16px;
    border-top: 1px solid var(--color-border);
    color: var(--color-muted);
    font-size: 12px;
  }

  .footer p {
    margin: 2px 0;
  }

  .footer a {
    color: var(--color-link);
  }
</style>
