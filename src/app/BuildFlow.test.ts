// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDummy, MAX_DUMMIES } from '../build/dummy';
import { BUILD_VERSION, defaultBuild, type Build } from '../build/model';
import { gameData, resolveBuild } from '../build/resolve';
import { encodeShareCode } from '../build/shareCode';
import { saveBuild, STORAGE_KEY, UNREADABLE_KEY } from '../build/storage';
import { dataMeta } from '../data';
import { autoAttack } from '../engine/autoAttack';
import { rAthenaDefaults } from '../engine/config';
import { statusWindow } from '../engine/status';
import App from './App.svelte';

const version = { hash: dataMeta.hash, label: dataMeta.label };

const swordman: Build = {
  ...defaultBuild(),
  job: 1,
  baseLevel: 50,
  jobLevel: 30,
  stats: { str: 50, agi: 30, vit: 1, int: 1, dex: 30, luk: 1 },
  equipment: { rightHand: { item: 1101, refine: 0 } },
  target: { monster: 1002 },
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
    await pick('Right hand results', 'Search right hand', '1101', /^Sword/);
    await pick('Monster results', 'Search monster', '1002', /^Poring/);

    expect(screen.getByTestId('slot-rightHand').textContent).toContain('Sword (1101)');
    expect(screen.getByTestId('selected-target').textContent).toContain('Poring (1002)');

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

  it('keeps a weapon the new job cannot equip and shows it as an error', async () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    await fireEvent.change(screen.getByLabelText('Job'), { target: { value: '2' } });
    expect(screen.getByTestId('slot-rightHand').textContent).toContain('Sword (1101)');
    expect(screen.getByRole('list', { name: 'Equipment errors' }).textContent).toMatch(
      /Sword \(1101\) cannot be equipped by Mage/,
    );
    await fireEvent.change(screen.getByLabelText('Job'), { target: { value: '1' } });
    expect(screen.queryByRole('list', { name: 'Equipment errors' })).toBeNull();
  });

  it('offers a weapon above the base level in red and says the level is too low', async () => {
    saveBuild({ ...swordman, baseLevel: 1, equipment: {} }, version, localStorage);
    render(App);
    await fireEvent.input(screen.getByLabelText('Search right hand'), {
      target: { value: '1101' },
    });
    const list = screen.getByRole('list', { name: 'Right hand results' });
    const sword = within(list).getByRole('button', { name: /^Sword/ });
    expect(sword.classList.contains('level-blocked')).toBe(true);
    await fireEvent.click(sword);
    expect(screen.getByTestId('slot-rightHand').textContent).toContain('Sword (1101)');
    expect(screen.getByRole('list', { name: 'Equipment errors' }).textContent).toBe(
      'Base level 1 is too low for Sword (1101); it needs base level 2.',
    );
    await setNumber('Base level', 2);
    expect(screen.queryByRole('list', { name: 'Equipment errors' })).toBeNull();
    expect(sword.classList.contains('level-blocked')).toBe(false);
  });
});

describe('equipment panel', () => {
  const ASSASSIN = 12;

  function slotText(slot: string): string {
    return screen.getByTestId(`slot-${slot}`).textContent ?? '';
  }

  async function equip(slotLabel: string, query: string, name: RegExp) {
    const slots = screen.getByRole('table', { name: 'Equipment slots' });
    await fireEvent.click(within(slots).getByRole('button', { name: slotLabel }));
    await pick(`${slotLabel} results`, `Search ${slotLabel.toLowerCase()}`, query, name);
  }

  it('fills slots through search, refines them, and shows the engine’s status window', async () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    await equip('Armor', '2301', /^Cotton Shirt/);
    await equip('Left hand', '2101', /^Guard/);
    await equip('Left accessory', '2601', /^Ring/);
    await setNumber('Armor refine', 4);
    await setNumber('Right hand refine', 7);

    expect(slotText('armor')).toContain('Cotton Shirt (2301)');
    expect(slotText('leftHand')).toContain('Guard (2101)');
    expect(slotText('accessoryLeft')).toContain('Ring (2601)');
    // Ring is not refineable, so it has no refine input.
    expect(screen.queryByLabelText('Left accessory refine')).toBeNull();

    const geared: Build = {
      ...swordman,
      equipment: {
        armor: { item: 2301, refine: 4 },
        leftHand: { item: 2101, refine: 0 },
        accessoryLeft: { item: 2601, refine: 0 },
        rightHand: { item: 1101, refine: 7 },
      },
    };
    const status = statusWindow(resolveBuild(geared, gameData).character, rAthenaDefaults);
    expect(screen.getByTestId('status-def').textContent).toBe(
      `${status.def[0]} + ${status.def[1]}`,
    );
    expect(screen.getByTestId('status-atk').textContent).toBe(
      `${status.atk[0]} + ${status.atk[1]}`,
    );
    expect(screen.getByTestId('status-hp').textContent).toBe(String(status.maxHp));
    expect(screen.getByTestId('dps').textContent).toBe(expectedResult(geared).dps.toFixed(1));

    cleanup();
    render(App);
    expect(slotText('armor')).toContain('Cotton Shirt (2301)');
    expect((screen.getByLabelText('Right hand refine') as HTMLInputElement).value).toBe('7');
  });

  it('clears the slots a multi-location headgear or a two-handed weapon covers', async () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    await equip('Middle headgear', '2201', /^Sunglasses/);
    await equip('Upper headgear', '2224', /^Goggles/);
    expect(slotText('headTop')).toContain('Goggles (2224)');
    expect(slotText('headMid')).toContain('Goggles (also here)');
    await equip('Middle headgear', '2201', /^Sunglasses/);
    expect(slotText('headTop')).toContain('Empty');
    expect(slotText('headMid')).toContain('Sunglasses (2201)');

    await equip('Left hand', '2101', /^Guard/);
    await equip('Right hand', '1116', /^Katana/);
    expect(slotText('leftHand')).toContain('Katana (also here)');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Left hand' }));
    expect(slotText('rightHand')).toContain('Empty');
    expect(slotText('leftHand')).toContain('Empty');
  });

  it('shows both hands of an Assassin with two daggers and a DPS that includes both', () => {
    const assassin: Build = {
      ...swordman,
      job: ASSASSIN,
      equipment: { rightHand: { item: 1201, refine: 0 }, leftHand: { item: 1201, refine: 0 } },
    };
    saveBuild(assassin, version, localStorage);
    render(App);
    const expected = expectedResult(assassin);
    if (!expected.left) throw new Error('expected a left hand result');
    const left = screen.getByTestId('damage-left').textContent ?? '';
    expect(left).toContain(`${expected.left.normal.min}`);
    expect(left).toContain(expected.left.normal.avg.toFixed(1));
    expect(screen.getByTestId('damage-normal').textContent).toContain('Right hand');
    expect(screen.getByTestId('dps').textContent).toBe(expected.dps.toFixed(1));
    expect(screen.getByText('DPS (both hands)')).toBeTruthy();
  });

  it('notes effects that are not modelled and counts them in the results', () => {
    saveBuild(
      {
        ...swordman,
        baseLevel: 50,
        equipment: { headMid: { item: 2201, refine: 0 }, rightHand: { item: 1131, refine: 0 } },
      },
      version,
      localStorage,
    );
    render(App);
    expect(screen.getByTestId('note-headMid').textContent).toBe('Not modelled: status resistance.');
    expect(screen.getByTestId('note-rightHand').textContent).toBe(
      'Not modelled: status chance on attack, status chance on self when attacking, autocast on attack, grants skill MG_COLDBOLT Lv 3.',
    );
    expect(screen.getByTestId('not-modelled-summary').textContent).toMatch(
      /^5 equipment effects not modelled/,
    );
  });

  it('shows no summary line when every effect is modelled', () => {
    saveBuild(swordman, version, localStorage);
    render(App);
    expect(screen.queryByTestId('not-modelled-summary')).toBeNull();
  });
});

describe('training dummies', () => {
  function editor() {
    return within(screen.getByRole('form', { name: 'Edit dummy' }));
  }

  async function setDummyNumber(label: string, value: number) {
    await fireEvent.input(editor().getByLabelText(label), { target: { value: String(value) } });
  }

  async function setDummyChoice(label: string, value: string) {
    await fireEvent.change(editor().getByLabelText(label), { target: { value } });
  }

  function dummyRows() {
    return within(screen.getByRole('list', { name: 'Dummies' })).getAllByRole('listitem');
  }

  it('adds a dummy, edits its settings and shows the engine numbers against it', async () => {
    saveBuild({ ...swordman, target: null }, version, localStorage);
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Add dummy' }));
    expect(screen.getByTestId('selected-target').textContent).toContain('Dummy 1');
    expect(screen.getByTestId('target-hp').textContent).toBe('–');

    const name = editor().getByLabelText('Name');
    await fireEvent.change(name, { target: { value: 'Ghost tank' } });
    await setDummyNumber('Level', 80);
    await setDummyNumber('DEF', 40);
    await setDummyNumber('VIT', 120);
    await setDummyNumber('AGI', 150);
    await setDummyNumber('LUK', 60);
    await setDummyChoice('Size', 'large');
    await setDummyChoice('Race', 'Undead');
    await setDummyChoice('Element', 'Ghost');
    await setDummyNumber('Element level', 2);

    const dummy = {
      ...defaultDummy(0),
      name: 'Ghost tank',
      level: 80,
      def: 40,
      vit: 120,
      agi: 150,
      luk: 60,
      size: 'large' as const,
      race: 'Undead',
      element: 'Ghost',
      elementLevel: 2,
    };
    const expected = expectedResult({ ...swordman, dummies: [dummy], target: { dummy: 0 } });
    expect(screen.getByTestId('selected-target').textContent).toContain('Ghost tank');
    const normal = screen.getByTestId('damage-normal').textContent ?? '';
    expect(normal).toContain(`${expected.normal.min}`);
    expect(normal).toContain(expected.normal.avg.toFixed(1));
    expect(screen.getByTestId('dps').textContent).toBe(expected.dps.toFixed(1));
    expect(screen.getByTestId('hit-chance').textContent).toBe(
      `${(expected.hitChance * 100).toFixed(1)} %`,
    );

    // Survives a reload.
    cleanup();
    render(App);
    expect(screen.getByTestId('selected-target').textContent).toContain('Ghost tank');
    expect(screen.getByTestId('dps').textContent).toBe(expected.dps.toFixed(1));
  });

  it('keeps the old name when the name is cleared', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Add dummy' }));
    const name = editor().getByLabelText('Name') as HTMLInputElement;
    await fireEvent.change(name, { target: { value: '   ' } });
    expect(name.value).toBe('Dummy 1');
    expect(dummyRows()[0]?.textContent).toContain('Dummy 1');
  });

  it('switches the target between dummies and monsters, and removes dummies', async () => {
    saveBuild(
      {
        ...swordman,
        dummies: [defaultDummy(0), { ...defaultDummy(1), name: 'Second' }, defaultDummy(2)],
        target: { dummy: 2 },
      },
      version,
      localStorage,
    );
    render(App);
    expect(screen.getByTestId('selected-target').textContent).toContain('Dummy 3');

    await fireEvent.click(
      within(dummyRows()[1] as HTMLElement).getByRole('button', { name: /^Second/ }),
    );
    expect(screen.getByTestId('selected-target').textContent).toContain('Second');

    // Removing an earlier dummy keeps the same dummy targeted.
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Dummy 1' }));
    expect(dummyRows()).toHaveLength(2);
    expect(screen.getByTestId('selected-target').textContent).toContain('Second');

    // Removing the target dummy clears the target.
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Second' }));
    expect(screen.queryByTestId('selected-target')).toBeNull();

    await pick('Monster results', 'Search monster', '1002', /^Poring/);
    expect(screen.getByTestId('selected-target').textContent).toContain('Poring (1002)');
  });

  it('allows at most 20 dummies', async () => {
    const dummies = Array.from({ length: MAX_DUMMIES - 1 }, (_, index) => defaultDummy(index));
    saveBuild({ ...swordman, dummies }, version, localStorage);
    render(App);
    const add = screen.getByRole('button', { name: 'Add dummy' }) as HTMLButtonElement;
    await fireEvent.click(add);
    expect(dummyRows()).toHaveLength(MAX_DUMMIES);
    expect(add.disabled).toBe(true);
  });

  it('opens a #b= link with a dummy target', () => {
    const build: Build = {
      ...swordman,
      dummies: [{ ...defaultDummy(0), name: 'Shared', def: 70 }],
      target: { dummy: 0 },
    };
    window.history.replaceState(null, '', `/#b=${encodeShareCode(build, version)}`);
    render(App);
    expect(screen.getByTestId('selected-target').textContent).toContain('Shared');
    expect(screen.getByTestId('dps').textContent).toBe(expectedResult(build).dps.toFixed(1));
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
    expect(screen.getByTestId('slot-rightHand').textContent).toContain('Sword (1101)');
    expect(screen.getByTestId('selected-target').textContent).toContain('Poring (1002)');
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

  it('keeps an unreadable saved build before autosave replaces it', () => {
    const newer = JSON.stringify({ ...swordman, v: BUILD_VERSION + 1 });
    localStorage.setItem(STORAGE_KEY, newer);
    render(App);
    expect(screen.getByRole('alert').textContent).toMatch(/newer version.*copy is kept/);
    expect(localStorage.getItem(UNREADABLE_KEY)).toBe(newer);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      v: BUILD_VERSION,
      job: 0,
    });
  });

  it('shows both errors when the saved build and the link are unreadable', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    window.history.replaceState(null, '', '/#b=zzzz');
    render(App);
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatch(/Saved build ignored/);
    expect(alerts[1]).toMatch(/not valid/);
    expect(alerts[1]).not.toMatch(/unchanged/);
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

describe('runes, combos and inventory', () => {
  const assassin: Build = {
    ...defaultBuild(),
    job: 12,
    baseLevel: 99,
    jobLevel: 50,
    stats: { str: 80, agi: 90, vit: 30, int: 1, dex: 40, luk: 10 },
    equipment: { rightHand: { item: 1201, refine: 7 } },
    target: { monster: 1002 },
  };

  function openWith(build: Build) {
    saveBuild(build, version, localStorage);
    render(App);
  }

  it('offers only fitting runes, adds one, and updates the numbers', async () => {
    openWith(assassin);
    await fireEvent.click(screen.getByRole('button', { name: 'Add rune to Right hand' }));
    const search = screen.getByLabelText('Search runes for right hand');
    const list = screen.getByRole('list', { name: 'Runes for Right hand' });
    await fireEvent.input(search, { target: { value: 'Alicel' } });
    // Alicel Rune goes into armor, so a knife is not offered it.
    expect(within(list).queryByRole('button')).toBeNull();
    await fireEvent.input(search, { target: { value: 'Andre Larva' } });
    await fireEvent.click(within(list).getByRole('button', { name: /Andre Larva Rune/ }));

    const runes = screen.getByTestId('runes-rightHand');
    expect(runes.textContent).toContain('Andre Larva Rune');
    // Every shipped rune is reviewed; EquipmentPanel.test.ts covers the draft badge.
    expect(within(runes).queryByText('draft')).toBeNull();
    const withRune: Build = {
      ...assassin,
      equipment: { rightHand: { item: 1201, refine: 7, runes: [39103] } },
    };
    const status = statusWindow(resolveBuild(withRune, gameData).character, rAthenaDefaults);
    expect(screen.getByTestId('status-sp').textContent).toBe(String(status.maxSp));
    expect(
      screen.getByText(
        /Andre Larva Rune \+ Beholder Card \(right hand only\).*needs card album \(phase 8\)/,
      ),
    ).toBeTruthy();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove Andre Larva Rune from Right hand' }),
    );
    expect(screen.getByTestId('runes-rightHand').textContent).not.toContain('Andre Larva');
  });

  it('keeps runes and refine when the equipped item is picked again', async () => {
    openWith({
      ...assassin,
      equipment: { rightHand: { item: 1201, refine: 7, runes: [39101] } },
    });
    await pick('Right hand results', 'Search right hand', '1201', /Knife/);
    expect(screen.getByTestId('runes-rightHand').textContent).toContain('Anacondaq Rune');
    expect(screen.getByLabelText<HTMLInputElement>('Right hand refine').value).toBe('7');
  });

  it('stops offering runes once the item’s slots are full', async () => {
    openWith({
      ...assassin,
      equipment: { rightHand: { item: 1201, refine: 7, runes: [39101, 39101, 39101] } },
    });
    expect(screen.queryByRole('button', { name: 'Add rune to Right hand' })).toBeNull();
  });

  it('shows a rune that does not fit as an error', () => {
    openWith({
      ...assassin,
      equipment: { rightHand: { item: 1201, refine: 7, runes: [39259] } },
    });
    const errors = screen.getByRole('list', { name: 'Equipment errors' });
    expect(errors.textContent).toContain('Alicel Rune goes into armor, not into Knife (1201).');
  });

  it('lists an active combo by name and applies it', () => {
    const mage: Build = {
      ...defaultBuild(),
      job: 2,
      baseLevel: 99,
      jobLevel: 50,
      equipment: { armor: { item: 2334, refine: 0 }, rightHand: { item: 1573, refine: 0 } },
    };
    openWith(mage);
    const groups = screen.getByRole('list', { name: 'Active rune sets and combos' });
    expect(groups.textContent).toContain('Combo: Ancient Magic + Mage Coat');
    const status = statusWindow(resolveBuild(mage, gameData).character, rAthenaDefaults);
    expect(screen.getByTestId('status-mdef').textContent).toBe(
      `${status.mdef[0]} + ${status.mdef[1]}`,
    );
  });

  it('stores an item with refine and runes and equips it back unchanged', async () => {
    openWith({
      ...assassin,
      equipment: { rightHand: { item: 1201, refine: 7, runes: [39101, 39103] } },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Store Right hand in inventory' }));
    const stored = screen.getByTestId('inventory-0');
    expect(stored.textContent).toContain('+7 Knife (1201)');
    expect(stored.textContent).toContain('Anacondaq Rune, Andre Larva Rune');

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Right hand' }));
    expect(screen.getByTestId('slot-rightHand').textContent).toContain('Empty');
    await fireEvent.click(screen.getByRole('button', { name: 'Equip Knife (1) in Right hand' }));
    const slot = screen.getByTestId('slot-rightHand');
    expect(slot.textContent).toContain('Knife (1201)');
    expect(screen.getByTestId('runes-rightHand').textContent).toContain('Anacondaq Rune');
    expect(screen.getByLabelText<HTMLInputElement>('Right hand refine').value).toBe('7');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Build;
    expect(saved.inventory).toEqual([{ item: 1201, refine: 7, runes: [39101, 39103] }]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Knife (1) from inventory' }));
    expect(screen.queryByTestId('inventory-0')).toBeNull();
  });
});
