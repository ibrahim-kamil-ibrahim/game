/**
 * Suggests the next unused machine code based on the codes already in use.
 *
 * Codes that end with a number are grouped by their prefix:
 *   PS5-01 ... PS5-10, SK1  ->  PS5-11
 * The prefix with the highest number wins; ties prefer the larger group.
 * The width of the existing number is preserved (PS5-09 -> PS5-10).
 * Returns an empty string when no numeric codes exist.
 */
export function suggestNextMachineCode(codes: string[]): string {
  const groups = new Map<string, { max: number; width: number; count: number }>();

  for (const raw of codes) {
    const code = raw.trim();
    const match = /^(.*?)(\d+)$/.exec(code);
    if (!match) continue;

    const prefix = match[1];
    const digits = match[2];
    const value = Number.parseInt(digits, 10);
    if (!Number.isFinite(value)) continue;

    const group = groups.get(prefix) ?? { max: 0, width: 1, count: 0 };
    group.max = Math.max(group.max, value);
    group.width = Math.max(group.width, digits.length);
    group.count += 1;
    groups.set(prefix, group);
  }

  if (groups.size === 0) return '';

  const [prefix, group] = [...groups.entries()].sort(
    (a, b) => b[1].max - a[1].max || b[1].count - a[1].count,
  )[0];

  const used = new Set(codes.map((code) => code.trim().toUpperCase()));
  let next = group.max + 1;
  let candidate = `${prefix}${String(next).padStart(group.width, '0')}`;

  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(group.width, '0')}`;
  }

  return candidate;
}
