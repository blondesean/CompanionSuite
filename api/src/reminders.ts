import { plannedReminders, reminderBody, reminderRecipients } from '../../shared/reminders';
import type { Todo } from '../../shared/types';
import type { Deps } from './http';
import { MAX_SUFFIX, type Item } from './store';

export type StoredTodo = Todo & { reminderKeys?: string[] };

interface ReminderItem {
  todoId: string;
  title: string;
  offsetMinutes: number;
  sendAt: string;
  recipients: string[];
}

interface PushSubItem {
  memberId: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

/** Reminders older than this when finally processed are dropped, not sent. */
const STALE_MS = 6 * 60 * 60 * 1000;

/** Replaces a to-do's scheduled reminders. Returns the to-do with updated keys. */
export async function syncReminders(deps: Deps, todo: StoredTodo): Promise<StoredTodo> {
  await clearReminders(deps, todo);
  if (todo.completedAt) return { ...todo, reminderKeys: [] };

  const memberIds = (await deps.members()).map((m) => m.id);
  const recipients = reminderRecipients(todo, memberIds);
  const keys: string[] = [];
  for (const r of plannedReminders(todo, deps.now())) {
    const sk = `${r.sendAt}#${todo.id}#${r.offsetMinutes}`;
    const item: ReminderItem = {
      todoId: todo.id,
      title: todo.title,
      offsetMinutes: r.offsetMinutes,
      sendAt: r.sendAt,
      recipients,
    };
    await deps.store.put('REMINDER', sk, item);
    keys.push(sk);
  }
  return { ...todo, reminderKeys: keys };
}

export async function clearReminders(deps: Deps, todo: StoredTodo): Promise<void> {
  await Promise.all((todo.reminderKeys ?? []).map((sk) => deps.store.delete('REMINDER', sk)));
}

export async function sendToMember(deps: Deps, memberId: string, payload: Parameters<Deps['push']['send']>[1]) {
  const subs = await deps.store.query<PushSubItem>('PUSHSUB', { beginsWith: `${memberId}#` });
  let sent = 0;
  for (const sub of subs) {
    const result = await deps.push.send(sub.subscription, payload);
    if (result === 'sent') sent++;
    if (result === 'gone') await deps.store.delete('PUSHSUB', sub.sk);
  }
  return sent;
}

/** Called every minute by the scheduler. */
export async function sendDueReminders(deps: Deps): Promise<number> {
  const now = deps.now();
  const due = await deps.store.query<ReminderItem>('REMINDER', { lte: `${now.toISOString()}#${MAX_SUFFIX}` });
  let processed = 0;

  for (const reminder of due as (ReminderItem & Item)[]) {
    const stale = now.getTime() - Date.parse(reminder.sendAt) > STALE_MS;
    if (!stale) {
      for (const memberId of reminder.recipients) {
        await sendToMember(deps, memberId, {
          title: reminder.title,
          body: reminderBody(reminder.offsetMinutes),
          url: '/todo',
          tag: `todo-${reminder.todoId}-${reminder.offsetMinutes}`,
        });
      }
    }
    await deps.store.delete('REMINDER', reminder.sk);
    processed++;
  }
  return processed;
}
