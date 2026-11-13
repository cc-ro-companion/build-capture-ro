const INDENT = '  ';
const MAX_INLINE_WIDTH = 100;

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function isFlat(value: object): boolean {
  return Object.values(value).every(isPrimitive);
}

function renderInline(value: object): string {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  const entries = Object.entries(value).map(
    ([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`,
  );
  return `{ ${entries.join(', ')} }`;
}

function render(value: unknown, depth: number): string {
  if (isPrimitive(value)) return JSON.stringify(value);
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
  const entries = Object.entries(value as Record<string, unknown>);
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
