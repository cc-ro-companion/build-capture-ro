// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBuild, type Build } from '../build/model';
import { gameData, resolveBuild } from '../build/resolve';
import { encodeShareCode } from '../build/shareCode';
import { saveBuild, STORAGE_KEY } from '../build/storage';
import { dataMeta } from '../data';
import { autoAttack } from '../engine/autoAttack';
import { rAthenaDefaults } from '../engine/config';
import App from './App.svelte';

const version = { hash: dataMeta.hash, label: dataMeta.label };

const swordman: Build = {
  ...defaultBuild(),
  job: 1,
  baseLevel: 50,
  jobLevel: 30,
  stats: { str: 50, agi: 30, vit: 1, int: 1, dex: 30, luk: 1 },
  weapon: 1101,
  monster: 1002,
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setNumber(label: string, value: number) {
  await fireEvent.input(screen.getByLabelText(label), { target: { value: String(value) } });
}

async function pick(listName: string, searchLabel: string, query: string, name: RegExp) {
  await fireEvent.input(screen.getByLabelText(searchLabel), { target: { value: query } });
  const list = screen.getByRole('list', { name: listName });
  await fireEvent.click(within(list).getByRole('button', { name }));
}

function expectedResult(build: Build) {
  const resolved = resolveBuild(build, gameData);
  if (!resolved.monster) throw new Error('test build needs a monster');
  return autoAttack(resolved.character, resolved.monster, gameData.tables, rAthenaDefaults);
}

describe('build flow', () => {
  it('shows the engine’s auto attack numbers for the chosen job, stats, weapon and monster', async () => {
    render(App);
    await fireEvent.change(screen.getByLabelText('Job'), { target: { value: '1' } });
    await setNumber('Base level', 50);
    await setNumber('Job level', 30);
    await setNumber('STR', 50);
    await setNumber('AGI', 30);
    await setNumber('DEX', 30);
    await pick('Weapon results', 'Search weapon', '1101', /^Sword/);
    await pick('Monster results', 'Search monster', '1002', /^Poring/);

    expect(screen.getByTestId('selected-weapon').textContent).toContain('Sword (1101)');
    expect(screen.getByTestId('selected-monster').textContent).toContain('Poring (1002)');

    const expected = expectedResult(swordman);
    const normal = screen.getByTestId('damage-normal').textContent ?? '';
    expect(normal).toContain(`${expected.normal.min}`);
    expect(normal).toContain(`${expected.normal.max}`);
    expect(normal).toContain(expected.normal.avg.toFixed(1));
    expect(screen.getByTestId('damage-crit').textContent).toContain(`${expected.crit.min}`);
    expect(screen.getByTestId('dps').textContent).toBe(expected.dps.toFixed(1));
    expect(screen.getByTestId('hit-chance').textContent).toBe(
      `${(expected.hitChance * 100).toFixed(1)} %`,
    );
  });

  it('shows only status values without a monster', () => {
    render(App);
    expect(screen.getByTestId('status-atk')).toBeTruthy();
    expect(screen.queryByTestId('damage-normal')).toBeNull();
  });

  it('flags stats over the point budget', async () => {
    render(App);
    expect(screen.queryByRole('alert')).toBeNull();
    // Base level 1 has 48 points; STR 99 alone costs 628.
    await setNumber('STR', 99);
    const points = screen.getByTestId('points-left');
    expect(points.textContent).toContain('Points left: -580 of 48');
    expect(within(points).getByRole('alert').textContent).toMatch(/over budget by 580/);
  });

  it('removes a weapon the new job cannot equip, with a notice', async () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    await fireEvent.change(screen.getByLabelText('Job'), { target: { value: '2' } });
    expect(screen.getByTestId('selected-weapon').textContent).toBe('No weapon');
    expect(screen.getByRole('list', { name: 'Build warnings' }).textContent).toMatch(
      /Sword cannot be equipped/,
    );
  });
});

describe('saving and share links', () => {
  it('keeps the build across a reload', async () => {
    render(App);
    await fireEvent.change(screen.getByLabelText('Job'), { target: { value: '1' } });
    await setNumber('Base level', 42);
    cleanup();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      job: 1,
      baseLevel: 42,
      d: dataMeta.hash,
    });
    render(App);
    expect((screen.getByLabelText('Job') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('Base level') as HTMLInputElement).value).toBe('42');
  });

  it('opens a #b= link and removes the fragment', () => {
    window.history.replaceState(null, '', `/#b=${encodeShareCode(swordman, version)}`);
    render(App);
    expect(screen.getByTestId('selected-weapon').textContent).toContain('Sword (1101)');
    expect(screen.getByTestId('selected-monster').textContent).toContain('Poring (1002)');
    expect(window.location.hash).toBe('');
  });

  it('asks before a link replaces a different saved build, and keeps it on cancel', () => {
    saveBuild({ ...swordman, baseLevel: 77 }, version, localStorage);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.history.replaceState(null, '', `/#b=${encodeShareCode(swordman, version)}`);
    render(App);
    expect(confirm).toHaveBeenCalledOnce();
    expect((screen.getByLabelText('Base level') as HTMLInputElement).value).toBe('77');
  });

  it('does not ask when the link holds the saved build', () => {
    saveBuild(swordman, version, localStorage);
    const confirm = vi.spyOn(window, 'confirm');
    window.history.replaceState(null, '', `/#b=${encodeShareCode(swordman, version)}`);
    render(App);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows the data version hint for a link made with other data', () => {
    const code = encodeShareCode(swordman, { hash: '0badc0de', label: 'ccRO 2026-10' });
    window.history.replaceState(null, '', `/#b=${code}`);
    render(App);
    expect(screen.getByTestId('data-hint').textContent).toMatch(/Made with data ccRO 2026-10/);
  });

  it('shows an error for a corrupted link and keeps the saved build', () => {
    saveBuild({ ...swordman, baseLevel: 77 }, version, localStorage);
    window.history.replaceState(null, '', '/#b=zzzz');
    render(App);
    expect(screen.getByRole('alert').textContent).toMatch(/not valid.*unchanged/);
    expect((screen.getByLabelText('Base level') as HTMLInputElement).value).toBe('77');
  });

  it('still works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(App);
    await setNumber('Base level', 10);
    expect((screen.getByLabelText('Base level') as HTMLInputElement).value).toBe('10');
    expect(screen.getByTestId('status-hit').textContent).toBe(String(10 + 1));
  });

  it('puts the current build into the share link', () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    const link = (screen.getByLabelText('Share link') as HTMLInputElement).value;
    expect(link).toContain(`#b=${encodeShareCode(swordman, version)}`);
  });
});
