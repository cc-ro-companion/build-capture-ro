// What the engine leaves out of an equipped item and its runes: a script
// outside the parsed subset, or bonuses it parses and stores but does not
// compute yet. Shown next to the item and counted in the results, so no number
// looks complete when it is not. Active rune sets and combos are listed apart,
// with their own notes, and card album effects as waiting for phase 8.
import { autoBonusLabel, notModelledLabels, skillLabel, type Sourced } from '../engine/bonuses';
import { activeCombos, type Slot } from '../engine/gear';
import { itemName, runeName, type GameData, type ResolvedBuild } from './resolve';

export interface NotModelledNote {
  /** Set when the item's script could not be read, e.g. `command "autobonus"`. */
  unsupported?: string;
  /**
   * Labels of the active bonuses the engine does not compute, then of
   * granted skills and autobonuses.
   */
  labels: string[];
}

/** Number of effects a note stands for: a whole unread script counts as one. */
export function noteCount(note: NotModelledNote): number {
  return (note.unsupported === undefined ? 0 : 1) + note.labels.length;
}

/** Labels for what the engine leaves out of the records, without repeats. */
function labelsOf(
  bonuses: ResolvedBuild['character']['bonuses'],
  accept: (record: Sourced) => boolean,
): string[] {
  const labels = notModelledLabels(bonuses.calls.filter(accept));
  const extra = [
    ...bonuses.skills.filter(accept).map(skillLabel),
    ...bonuses.autoBonuses.filter(accept).map(autoBonusLabel),
  ];
  for (const run of bonuses.runs.filter(accept)) {
    if (run.readsSkillLevel) extra.push('effects that depend on skill levels');
    if (run.error !== undefined) extra.push(`effects after a script error (${run.error})`);
  }
  for (const label of extra) if (!labels.includes(label)) labels.push(label);
  return labels;
}

/**
 * Notes per filled slot, for the item's own script and the runes in it, only
 * where something is not modelled. Bonuses are the calls the build's
 * evaluation produced, so a bonus behind a refine or job condition that is
 * not met does not show. A script that read a skill level, which is 0 until
 * skills are modelled, or that stopped early, gets a label of its own, as its
 * missing bonuses leave no calls to list.
 */
export function notModelledNotes(resolved: ResolvedBuild): Partial<Record<Slot, NotModelledNote>> {
  const notes: Partial<Record<Slot, NotModelledNote>> = {};
  const { bonuses } = resolved.character;
  for (const { slot, item } of resolved.equipment) {
    const labels = labelsOf(
      bonuses,
      (record) =>
        record.slot === slot && (record.origin.kind === 'item' || record.origin.kind === 'rune'),
    );
    if (item.effects === null) {
      notes[slot] = { unsupported: item.unsupported ?? 'unknown script', labels };
    } else if (labels.length > 0) {
      notes[slot] = { labels };
    }
  }
  return notes;
}

/** An active rune set or item combo, by name, with what the engine leaves out of it. */
export interface GroupNote {
  kind: 'runeSet' | 'combo';
  name: string;
  /** Set when the combo's script could not be read. */
  unsupported?: string;
  labels: string[];
}

/**
 * The rune sets and combos that apply, in the order their scripts ran, and
 * combos that apply but whose script could not be read (they have no run).
 */
export function groupNotes(resolved: ResolvedBuild, data: GameData): GroupNote[] {
  const { bonuses } = resolved.character;
  const notes: GroupNote[] = [];
  for (const run of bonuses.runs) {
    const { origin } = run;
    if (origin.kind !== 'runeSet' && origin.kind !== 'combo') continue;
    const name =
      origin.kind === 'runeSet'
        ? `${runeName(data, origin.runeId)} with ${origin.requires.map((id) => runeName(data, id)).join(', ')}`
        : origin.items.map((id) => itemName(data, id)).join(' + ');
    // The records of one script run share its origin object (buildCharacter).
    const labels = labelsOf(bonuses, (record) => record.origin === origin);
    notes.push({ kind: origin.kind, name, labels });
  }
  const unread = data.combos.filter((combo) => combo.effects === null);
  for (const combo of activeCombos(resolved.equipment, unread)) {
    notes.push({
      kind: 'combo',
      name: combo.items.map((id) => itemName(data, id)).join(' + '),
      unsupported: combo.unsupported ?? 'unknown script',
      labels: [],
    });
  }
  return notes;
}

/** Total of `noteCount` over the slot notes and group notes, for the results summary. */
export function notModelledCount(
  notes: Partial<Record<Slot, NotModelledNote>>,
  groups: readonly GroupNote[] = [],
): number {
  return [...Object.values(notes), ...groups].reduce((sum, note) => sum + noteCount(note), 0);
}

/** The note in plain words, for the equipment list. */
export function noteText(note: NotModelledNote): string {
  const notModelled = note.labels.length > 0 ? `Not modelled: ${note.labels.join(', ')}.` : '';
  if (note.unsupported !== undefined) {
    const unread = `Script not read (${note.unsupported}); none of its effects are applied.`;
    return notModelled === '' ? unread : `${unread} ${notModelled}`;
  }
  return notModelled;
}

/**
 * Card album effects of the runes in each slot (phase 8): stored, never
 * applied. One line per effect, e.g. `Anacondaq Rune + Mobster Card
 * (right hand only)`.
 */
export function albumNotes(
  resolved: ResolvedBuild,
  data: GameData,
): Partial<Record<Slot, string[]>> {
  const notes: Partial<Record<Slot, string[]>> = {};
  for (const { slot, runes } of resolved.equipment) {
    const lines: string[] = [];
    for (const rune of runes ?? []) {
      for (const effect of rune.album) {
        const where = effect.rightHandOnly ? ' (right hand only)' : '';
        const note = effect.note === undefined ? '' : `, ${effect.note}`;
        lines.push(`${runeName(data, rune.id)} + ${effect.requires.join(', ')}${where}${note}`);
      }
    }
    if (lines.length > 0) notes[slot] = [...new Set(lines)];
  }
  return notes;
}
