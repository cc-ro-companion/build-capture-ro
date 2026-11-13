import { describe, expect, it } from 'vitest';
import { parseHiddenItems } from './hiddenItems.ts';

describe('parseHiddenItems', () => {
  it('collects the ids with hide: true across groups', () => {
    const text = [
      'seasonShop:',
      '  - { id: 2214, name: Bunny Band, hide: false }',
      '  - { id: 5146, name: Elephant Hat, hide: true, reason: "not obtainable" }',
      'noSource:',
      '  - { id: 1101, name: Sword, from: [shop] }',
      '  - { id: 1102, name: Sword, hide: true }',
    ].join('\n');
    expect([...parseHiddenItems(text, 'hidden-items.yml')].sort()).toEqual([1102, 5146]);
  });

  it('treats an empty file as nothing hidden', () => {
    expect(parseHiddenItems('', 'hidden-items.yml').size).toBe(0);
  });

  it('rejects entries without an id and non-boolean hide', () => {
    expect(() => parseHiddenItems('group:\n  - { hide: true }', 'h.yml')).toThrow(
      'h.yml: group: every entry needs a numeric id.',
    );
    expect(() => parseHiddenItems('group:\n  - { id: 1, hide: yes please }', 'h.yml')).toThrow(
      'h.yml: group: id 1: hide must be true or false.',
    );
    expect(() => parseHiddenItems('group: 1', 'h.yml')).toThrow('h.yml: group must be a list.');
  });
});
