import { localDate } from '../../shared/weeks';

const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayDiff(a: Date, b: Date): number {
  const ms = Date.parse(localDate(a)) - Date.parse(localDate(b));
  return Math.round(ms / 86_400_000);
}

/** "Today 5:00 PM", "Tomorrow 9:00 AM", "Fri 9:00 AM", "Nov 14, 9:00 AM". */
export function formatDue(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return `Today ${time(d)}`;
  if (diff === 1) return `Tomorrow ${time(d)}`;
  if (diff === -1) return `Yesterday ${time(d)}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time(d)}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}, ${time(d)}`;
}

/** "Wed, Nov 4 · 6:04 PM" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(d)}`;
}

export function formatTime(iso: string): string {
  return time(new Date(iso));
}

/** "Today", "Yesterday", "Monday, Nov 2". */
export function dayHeading(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/** ISO timestamp -> value for <input type="datetime-local">. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Today/tomorrow at a given hour, as an ISO timestamp. */
export function atHour(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
