export const SANTIM_PER_ETB = 100;

/** Formats integer santim as a human readable ETB string. */
export function formatEtb(santim: number): string {
  return `${(santim / SANTIM_PER_ETB).toFixed(2)} ETB`;
}

/** Safe conversion for numeric SQL aggregates (returns integer santim). */
export function toSantim(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** Generates a human friendly, non-guessable transaction reference. */
export function transactionReference(prefix = 'TXN'): string {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
  const tail = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${datePart}-${random}${tail}`;
}
