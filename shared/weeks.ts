// Calendar math on plain 'YYYY-MM-DD' strings. All arithmetic is done in UTC
// so daylight-saving changes never shift a date. Weeks start on Monday.

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && fromUtcMs(ms) === value;
}

/** The calendar date in the device's local time zone. */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const ms = toUtcMs(date);
  const daysSinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return fromUtcMs(ms - daysSinceMonday * DAY_MS);
}

export function isWeekStart(value: unknown): value is string {
  return isISODate(value) && weekStart(value) === value;
}

export function currentWeek(now: Date = new Date()): string {
  return weekStart(localDate(now));
}

export function addWeeks(week: string, weeks: number): string {
  return addDays(week, weeks * 7);
}

/** Whole weeks from week `a` to week `b` (negative if b is earlier). */
export function weeksBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / (7 * DAY_MS));
}

export function formatDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Nov 3 – 9" or "Oct 27 – Nov 2". */
export function formatWeekRange(week: string): string {
  const end = addDays(week, 6);
  const [, sm, sd] = week.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  return sm === em ? `${MONTHS[sm - 1]} ${sd} – ${ed}` : `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}`;
}
