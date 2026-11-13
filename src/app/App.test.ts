// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { dataMeta } from '../data';
import App from './App.svelte';
import { appVersion } from './version';

afterEach(cleanup);

describe('App shell', () => {
  it('shows the unfinished banner', () => {
    render(App);
    expect(screen.getByRole('status').textContent).toMatch(/unfinished/i);
  });

  it('shows the disclaimer and rAthena credit', () => {
    render(App);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/not affiliated with ccRO or Gravity/);
    expect(footer.textContent).toMatch(/estimates/);
    expect(screen.getByRole('link', { name: 'rAthena' })).toBeTruthy();
  });

  it('shows the data label, data hash and rAthena commit in the footer', () => {
    render(App);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain(
      `Data: ${dataMeta.label} (${dataMeta.hash}) · rAthena ${dataMeta.rathenaCommit.slice(0, 8)}`,
    );
    expect(dataMeta.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('shows the app version and the three regions', () => {
    render(App);
    expect(screen.getByText(`v${appVersion}`)).toBeTruthy();
    for (const title of ['Build', 'Target', 'Results']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
  });
});
