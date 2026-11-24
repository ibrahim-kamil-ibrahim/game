/**
 * Timezone helpers.
 *
 * Every timestamp is stored in UTC. Business reports are grouped in the
 * business timezone (default Africa/Addis_Ababa, UTC+3, no DST).
 */

export interface DateRange {
  from: Date;
  to: Date;
  timezone: string;
}

function partsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = partsInTimezone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - date.getTime()) / 60000;
}

/** Converts a wall-clock time in a timezone to the equivalent UTC Date. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone = 'UTC',
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const firstOffset = timezoneOffsetMinutes(new Date(guess), timeZone);
  const first = new Date(guess - firstOffset * 60000);
  // Correct for DST boundaries with a second pass.
  const secondOffset = timezoneOffsetMinutes(first, timeZone);
  if (secondOffset !== firstOffset) {
    return new Date(guess - secondOffset * 60000);
  }
  return first;
}

/** Returns YYYY-MM-DD for the given instant in the target timezone. */
export function formatDateInTimezone(date: Date, timeZone: string): string {
  const p = partsInTimezone(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function startOfDay(date: Date, timeZone: string): Date {
  const p = partsInTimezone(date, timeZone);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, 0, 0, timeZone);
}

export function endOfDay(date: Date, timeZone: string): Date {
  const p = partsInTimezone(date, timeZone);
  return new Date(zonedToUtc(p.year, p.month, p.day, 23, 59, 59, 999, timeZone).getTime());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function startOfWeek(date: Date, timeZone: string): Date {
  const dayStart = startOfDay(date, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const index = Math.max(0, order.indexOf(weekday));
  return addDays(dayStart, -index);
}

export function startOfMonth(date: Date, timeZone: string): Date {
  const p = partsInTimezone(date, timeZone);
  return zonedToUtc(p.year, p.month, 1, 0, 0, 0, 0, timeZone);
}

export function startOfYear(date: Date, timeZone: string): Date {
  const p = partsInTimezone(date, timeZone);
  return zonedToUtc(p.year, 1, 1, 0, 0, 0, 0, timeZone);
}

export interface ParsedRangeOptions {
  /** ISO date (YYYY-MM-DD) interpreted in the business timezone. */
  from?: string;
  /** ISO date (YYYY-MM-DD) interpreted in the business timezone. */
  to?: string;
  timezone: string;
  /** Used when no from/to values are supplied. */
  defaultDays?: number;
}

export function parseDateRange(options: ParsedRangeOptions): DateRange {
  const { timezone } = options;
  const now = new Date();
  let to: Date;
  let from: Date;

  if (options.to) {
    const [y, m, d] = options.to.split('-').map(Number);
    to = endOfDay(zonedToUtc(y, m, d, 12, 0, 0, 0, timezone), timezone);
  } else {
    to = new Date();
  }

  if (options.from) {
    const [y, m, d] = options.from.split('-').map(Number);
    from = zonedToUtc(y, m, d, 0, 0, 0, 0, timezone);
  } else {
    const days = options.defaultDays ?? 30;
    from = startOfDay(addDays(to, -(days - 1)), timezone);
  }

  if (from.getTime() > to.getTime()) {
    from = startOfDay(to, timezone);
  }

  return { from, to, timezone };
}

/** Number of full seconds remaining in a session, never negative. */
export function remainingSeconds(endsAt: Date | null, now = new Date()): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
}
