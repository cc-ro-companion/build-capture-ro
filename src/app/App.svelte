<script lang="ts">
  import { appVersion } from './version';

  const regions = [
    { id: 'build', title: 'Build', hint: 'Character, equipment, skills and buffs.' },
    { id: 'target', title: 'Target', hint: 'Monster and its debuffs.' },
    { id: 'results', title: 'Results', hint: 'Damage dealt and taken, ASPD, DPS.' },
  ];
</script>

<div class="shell">
  <div class="banner" role="status">
    Unfinished: this planner is under development and its numbers are not validated yet.
  </div>

  <header class="header">
    <h1>ccRO Build Planner</h1>
    <span class="version">v{appVersion}</span>
  </header>

  <main class="main">
    {#each regions as region (region.id)}
      <section class="region" aria-labelledby="region-{region.id}">
        <h2 id="region-{region.id}">{region.title}</h2>
        <p class="placeholder">{region.hint}</p>
      </section>
    {/each}
  </main>

  <footer class="footer">
    <p>Unofficial fan project, not affiliated with ccRO or Gravity. All numbers are estimates.</p>
    <p>
      Based on <a href="https://github.com/rathena/rathena">rAthena</a>. Licensed under GPL-3.0.
    </p>
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

  .placeholder {
    margin: 0;
    color: var(--color-muted);
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
