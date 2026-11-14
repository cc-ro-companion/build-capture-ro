// What the engine leaves out of an equipped item: a script outside the parsed
// subset, or bonuses it parses and stores but does not compute yet. Shown next
// to the item and counted in the results, so no number looks complete when it
// is not.
import { autoBonusLabel, notModelledLabels, skillLabel } from '../engine/bonuses';
import type { Slot } from '../engine/gear';
import type { ResolvedBuild } from './resolve';

export interface NotModelledNote {
  /** Set when the item's script could not be read, e.g. `command "autobonus"`. */
  unsupported?: string;
  /**
   * Labels of the item's active bonuses the engine does not compute, then of
   * its granted skills and autobonuses.
   */
  labels: string[];
}

/** Number of effects a note stands for: a whole unread script counts as one. */
export function noteCount(note: NotModelledNote): number {
  return note.unsupported === undefined ? note.labels.length : 1;
}

/**
 * Notes per filled slot, only for items with something not modelled. Bonuses
 * are the calls the build's evaluation produced, so a bonus behind a refine
 * or job condition that is not met does not show. A script that read a skill
 * level, which is 0 until skills are modelled, or that stopped early, gets a
 * label of its own, as its missing bonuses leave no calls to list.
 */
export function notModelledNotes(resolved: ResolvedBuild): Partial<Record<Slot, NotModelledNote>> {
  const notes: Partial<Record<Slot, NotModelledNote>> = {};
  for (const { slot, item } of resolved.equipment) {
    if (item.effects === null) {
      notes[slot] = { unsupported: item.unsupported ?? 'unknown script', labels: [] };
      continue;
    }
    const { bonuses } = resolved.character;
    const ofSlot = <T extends { slot: Slot | null }>(records: readonly T[]) =>
      records.filter((record) => record.slot === slot);
    const labels = notModelledLabels(ofSlot(bonuses.calls));
    const extra = [
      ...ofSlot(bonuses.skills).map(skillLabel),
      ...ofSlot(bonuses.autoBonuses).map(autoBonusLabel),
    ];
    for (const run of ofSlot(bonuses.runs)) {
      if (run.readsSkillLevel) extra.push('effects that depend on skill levels');
      if (run.error !== undefined) extra.push(`effects after a script error (${run.error})`);
    }
    for (const label of extra) if (!labels.includes(label)) labels.push(label);
    if (labels.length > 0) notes[slot] = { labels };
  }
  return notes;
}

/** Total of `noteCount` over the notes, for the results summary line. */
export function notModelledCount(notes: Partial<Record<Slot, NotModelledNote>>): number {
  return Object.values(notes).reduce((sum, note) => sum + noteCount(note), 0);
}

/** The note in plain words, for the equipment list. */
export function noteText(note: NotModelledNote): string {
  if (note.unsupported !== undefined) {
    return `Script not read (${note.unsupported}); none of its effects are applied.`;
  }
  return `Not modelled: ${note.labels.join(', ')}.`;
}
