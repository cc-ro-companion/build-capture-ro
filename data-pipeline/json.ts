const INDENT = '  ';
// Wide enough for an item's list of all 26 job ids on one line.
const MAX_INLINE_WIDTH = 160;

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function isFlat(value: object): boolean {
  return Object.values(value).every(isPrimitive);
}

// Drops undefined-valued keys, as JSON.stringify does.
function definedEntries(value: object): [string, unknown][] {
  return Object.entries(value).filter(([, item]) => item !== undefined);
}

function renderPrimitive(value: unknown): string {
  if (value === undefined) throw new Error('formatJson: undefined is not valid JSON.');
  return JSON.stringify(value);
}

function renderInline(value: object): string {
  if (Array.isArray(value)) return `[${value.map(renderPrimitive).join(', ')}]`;
  const entries = definedEntries(value).map(
    ([key, item]) => `${JSON.stringify(key)}: ${renderPrimitive(item)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

function render(value: unknown, depth: number): string {
  if (isPrimitive(value)) return renderPrimitive(value);
  if (isFlat(value as object)) {
    const inline = renderInline(value as object);
    if (depth * INDENT.length + inline.length <= MAX_INLINE_WIDTH) return inline;
  }
  const pad = INDENT.repeat(depth + 1);
  const closePad = INDENT.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => pad + render(item, depth + 1)).join(',\n')}\n${closePad}]`;
  }
  const entries = definedEntries(value as object);
  if (entries.length === 0) return '{}';
  const lines = entries.map(
    ([key, item]) => `${pad}${JSON.stringify(key)}: ${render(item, depth + 1)}`,
  );
  return `{\n${lines.join(',\n')}\n${closePad}}`;
}

/**
 * Pretty-prints JSON for small, readable diffs: like `JSON.stringify(value,
 * null, 2)`, except that arrays and objects holding only primitives stay on
 * one line when they fit.
 */
export function formatJson(value: unknown): string {
  return `${render(value, 0)}\n`;
}
