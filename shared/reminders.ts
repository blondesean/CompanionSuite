import { REMINDER_OPTIONS, type TodoInput } from './types';

export const REMINDER_MINUTES: readonly number[] = REMINDER_OPTIONS.map((o) => o.minutes);

/** Unassigned (or assigned to everyone) means everyone gets the reminder. */
export function reminderRecipients(todo: Pick<TodoInput, 'assignees'>, allMemberIds: string[]): string[] {
  return todo.assignees.length > 0 ? [...todo.assignees] : [...allMemberIds];
}

/** Reminder send times that are still in the future (with 1 minute grace). */
export function plannedReminders(
  todo: Pick<TodoInput, 'dueAt' | 'reminders'>,
  now: Date,
): { sendAt: string; offsetMinutes: number }[] {
  if (!todo.dueAt) return [];
  const due = Date.parse(todo.dueAt);
  if (Number.isNaN(due)) return [];
  return [...new Set(todo.reminders)]
    .map((offsetMinutes) => ({ sendAt: due - offsetMinutes * 60_000, offsetMinutes }))
    .filter((r) => r.sendAt > now.getTime() - 60_000)
    .sort((a, b) => a.sendAt - b.sendAt)
    .map((r) => ({ sendAt: new Date(r.sendAt).toISOString(), offsetMinutes: r.offsetMinutes }));
}

/** Time-zone free wording, since the server doesn't know the viewer's clock. */
export function reminderBody(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'Due now';
  if (offsetMinutes < 60) return `Due in ${offsetMinutes} minutes`;
  if (offsetMinutes < 1440) {
    const hours = Math.round(offsetMinutes / 60);
    return `Due in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (offsetMinutes === 10080) return 'Due in 1 week';
  const days = Math.round(offsetMinutes / 1440);
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}
