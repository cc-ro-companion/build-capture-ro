<script lang="ts">
  import {
    DUMMY_ELEMENT_LEVEL,
    DUMMY_ELEMENTS,
    DUMMY_NUMBERS,
    DUMMY_RACES,
    DUMMY_SIZES,
    MAX_DUMMIES,
    MAX_DUMMY_NAME_LENGTH,
    type Dummy,
  } from '../build/dummy';
  import type { BuildState } from './build.svelte';
  import NumberInput from './NumberInput.svelte';

  let { planner }: { planner: BuildState } = $props();

  let editing = $state<number | null>(null);

  const dummies = $derived(planner.build.dummies);
  const targetIndex = $derived(
    planner.build.target && 'dummy' in planner.build.target ? planner.build.target.dummy : null,
  );
  const edited = $derived(editing === null ? undefined : dummies[editing]);

  function add() {
    planner.addDummy();
    editing = planner.build.dummies.length - 1;
  }

  function remove(index: number) {
    planner.removeDummy(index);
    if (editing === index) editing = null;
    else if (editing !== null && editing > index) editing -= 1;
  }

  function change(changes: Partial<Dummy>) {
    if (editing !== null) planner.updateDummy(editing, changes);
  }

  function onNameChange(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    change({ name: input.value });
    // Normalize may keep the old name (e.g. for an empty entry); show what is stored.
    if (editing !== null) input.value = planner.build.dummies[editing]?.name ?? '';
  }

  function onSelect(key: 'size' | 'race' | 'element') {
    return (event: Event & { currentTarget: HTMLSelectElement }) =>
      change({ [key]: event.currentTarget.value });
  }
</script>

<section class="dummies" aria-labelledby="dummies-heading">
  <div class="heading">
    <h3 id="dummies-heading">Training dummies</h3>
    <button type="button" onclick={add} disabled={dummies.length >= MAX_DUMMIES}>Add dummy</button>
  </div>
  {#if dummies.length === 0}
    <p class="note">
      ccRO's training dummy is set up per player. Add one with the settings you use in game.
    </p>
  {:else}
    <ul class="list" aria-label="Dummies">
      {#each dummies as dummy, index (index)}
        <li class:active={index === targetIndex}>
          <button
            type="button"
            class="name"
            aria-pressed={index === targetIndex}
            onclick={() => planner.selectDummy(index)}
          >
            {dummy.name}
            <span class="meta">Lv {dummy.level} · {dummy.element} {dummy.elementLevel}</span>
          </button>
          <button
            type="button"
            aria-label="Edit {dummy.name}"
            aria-expanded={editing === index}
            onclick={() => (editing = editing === index ? null : index)}>Edit</button
          >
          <button type="button" aria-label="Remove {dummy.name}" onclick={() => remove(index)}
            >Remove</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  {#if dummies.length >= MAX_DUMMIES}
    <p class="note">A build holds at most {MAX_DUMMIES} dummies.</p>
  {/if}

  {#if edited}
    <form class="editor" aria-label="Edit dummy" onsubmit={(event) => event.preventDefault()}>
      <label class="wide">
        <span>Name</span>
        <input
          type="text"
          maxlength={MAX_DUMMY_NAME_LENGTH}
          value={edited.name}
          onchange={onNameChange}
        />
      </label>
      {#each DUMMY_NUMBERS as setting (setting.key)}
        <NumberInput
          label={setting.label}
          value={edited[setting.key]}
          min={setting.min}
          max={setting.max}
          onchange={(value) => change({ [setting.key]: value })}
        />
      {/each}
      <label>
        <span>Size</span>
        <select value={edited.size} onchange={onSelect('size')}>
          {#each DUMMY_SIZES as size (size)}
            <option value={size}>{size}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Race</span>
        <select value={edited.race} onchange={onSelect('race')}>
          {#each DUMMY_RACES as race (race)}
            <option value={race}>{race}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Element</span>
        <select value={edited.element} onchange={onSelect('element')}>
          {#each DUMMY_ELEMENTS as element (element)}
            <option value={element}>{element}</option>
          {/each}
        </select>
      </label>
      <NumberInput
        label="Element level"
        value={edited.elementLevel}
        min={DUMMY_ELEMENT_LEVEL.min}
        max={DUMMY_ELEMENT_LEVEL.max}
        onchange={(value) => change({ elementLevel: value })}
      />
    </form>
  {/if}
</section>

<style>
  .dummies {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: 14px;
  }

  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .list li {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 2px 4px;
  }

  .list li.active {
    background: var(--color-highlight);
  }

  .name {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .meta {
    color: var(--color-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .editor {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .editor label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .editor .wide {
    flex-basis: 100%;
  }

  .editor .wide input {
    flex: 1;
    min-width: 0;
  }
</style>
