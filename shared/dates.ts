// Countdowns for important dates. All math is on 'YYYY-MM-DD' strings in UTC,
// like weeks.ts, so time zones and daylight saving never shift a day.

import { DATE_KINDS, type DateKind, type ImportantDate } from './types';

const DAY_MS = 86_400_000;

const toMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** The month/day of `date` in `year`; Feb 29 falls on Feb 28 in other years. */
function inYear(date: string, year: number): string {
  let [, m, d] = date.split('-').map(Number);
  if (m === 2 && d === 29 && !isLeapYear(year)) d = 28;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface Occurrence {
  /** The date it next happens (or happened, for a past one-time date). */
  date: string;
  /** 0 = today; negative = a one-time date that has passed. */
  daysUntil: number;
  /** For yearly dates: which year this will be (3 = third anniversary). Null for one-time or year 0. */
  years: number | null;
}

/** When a date next comes around, counting from `today`. */
export function nextOccurrence(item: Pick<ImportantDate, 'date' | 'yearly'>, today: string): Occurrence {
  if (!item.yearly) return { date: item.date, daysUntil: daysBetween(today, item.date), years: null };
  const startYear = Number(item.date.slice(0, 4));
  let year = Math.max(Number(today.slice(0, 4)), startYear);
  let date = inYear(item.date, year);
  if (date < today) date = inYear(item.date, ++year);
  const years = year - startYear;
  return { date, daysUntil: daysBetween(today, date), years: years > 0 ? years : null };
}

export interface DateWithOccurrence extends ImportantDate {
  next: Occurrence;
}

/** Upcoming dates soonest first, and past one-time dates most recent first. */
export function sortDates(items: ImportantDate[], today: string): { upcoming: DateWithOccurrence[]; past: DateWithOccurrence[] } {
  const all = items.map((item) => ({ ...item, next: nextOccurrence(item, today) }));
  const upcoming = all
    .filter((d) => d.next.daysUntil >= 0)
    .sort((a, b) => a.next.daysUntil - b.next.daysUntil || a.title.localeCompare(b.title));
  const past = all.filter((d) => d.next.daysUntil < 0).sort((a, b) => b.next.daysUntil - a.next.daysUntil);
  return { upcoming, past };
}

export function dateKind(id: DateKind) {
  return DATE_KINDS.find((k) => k.id === id) ?? DATE_KINDS[DATE_KINDS.length - 1];
}

/** "Today", "Tomorrow", "12 days", "Yesterday", "40 days ago". */
export function formatCountdown(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil === -1) return 'Yesterday';
  return daysUntil > 0 ? `${daysUntil} days` : `${-daysUntil} days ago`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "Turns 30", "3rd anniversary", "5 years", or null. */
export function yearsLabel(kind: DateKind, years: number | null): string | null {
  if (!years) return null;
  if (kind === 'birthday') return `Turns ${years}`;
  if (kind === 'anniversary') return `${ordinal(years)} anniversary`;
  return `${years} year${years === 1 ? '' : 's'}`;
}
