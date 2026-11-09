import type { Chore, ChoreWeek, Completion } from './types';
import { addWeeks, weeksBetween } from './weeks';

export function isChoreDue(chore: Pick<Chore, 'cadenceWeeks' | 'startWeek'>, week: string): boolean {
  const elapsed = weeksBetween(chore.startWeek, week);
  return elapsed >= 0 && elapsed % chore.cadenceWeeks === 0;
}

/** First week on or after `fromWeek` in which the chore is due. */
export function nextDueWeek(chore: Pick<Chore, 'cadenceWeeks' | 'startWeek'>, fromWeek: string): string {
  const elapsed = weeksBetween(chore.startWeek, fromWeek);
  if (elapsed <= 0) return chore.startWeek;
  const remainder = elapsed % chore.cadenceWeeks;
  return remainder === 0 ? fromWeek : addWeeks(fromWeek, chore.cadenceWeeks - remainder);
}

export function cadenceLabel(cadenceWeeks: number): string {
  return cadenceWeeks === 1 ? 'Weekly' : `Every ${cadenceWeeks} weeks`;
}

/**
 * Builds the view for one week. `completions` should cover the week itself
 * plus enough earlier weeks to find each chore's previous completion.
 */
export function buildChoreWeek(chores: Chore[], week: string, completions: Completion[]): ChoreWeek {
  const byName = (a: Chore, b: Chore) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const due = chores
    .filter((c) => isChoreDue(c, week))
    .sort(byName)
    .map((chore) => {
      const mine = completions.filter((c) => c.choreId === chore.id);
      const completion = mine.find((c) => c.week === week) ?? null;
      const last =
        mine.filter((c) => c.week < week).sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))[0] ??
        null;
      return { chore, completion, last };
    });

  const upcoming = chores
    .filter((c) => !isChoreDue(c, week))
    .map((chore) => ({ chore, nextWeek: nextDueWeek(chore, week) }))
    .sort((a, b) => (a.nextWeek === b.nextWeek ? byName(a.chore, b.chore) : a.nextWeek < b.nextWeek ? -1 : 1));

  return { week, due, upcoming };
}
