<script lang="ts">
  // A whole-number input that reports clamped values and shows the clamped
  // value right away; an empty or partial entry is left alone while typing.
  let {
    label,
    value,
    min,
    max,
    hideLabel = false,
    onchange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    hideLabel?: boolean;
    onchange: (value: number) => void;
  } = $props();

  function onInput(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const typed = Number.parseInt(input.value, 10);
    if (Number.isNaN(typed)) return;
    const clamped = Math.min(Math.max(typed, min), max);
    if (String(clamped) !== input.value) input.value = String(clamped);
    onchange(clamped);
  }

  function onBlur(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    event.currentTarget.value = String(value);
  }
</script>

<label class="number-input">
  <span class:visually-hidden={hideLabel}>{label}</span>
  <input type="number" {min} {max} step="1" {value} oninput={onInput} onblur={onBlur} />
</label>

<style>
  .number-input {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  input {
    width: 4.5em;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
