import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { REMINDER_OPTIONS, type Todo, type TodoInput } from '../../../../shared/types';
import { api } from '../../api';
import { useSession } from '../../App';
import { ErrorNote, Sheet, useMembers } from '../../components/ui';
import { atHour, fromLocalInput, toLocalInput } from '../../format';

type Assign = 'anyone' | 'both' | string;

/** [label, days from today, hour] */
const QUICK_DUE: [string, number, number][] = [
  ['Tonight 6 PM', 0, 18],
  ['Tomorrow 9 AM', 1, 9],
  ['In a week', 7, 9],
];

export function TodoEditor({ todo, onClose }: { todo: Todo | null; onClose(): void }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { members, name } = useMembers();
  const [title, setTitle] = useState(todo?.title ?? '');
  const [notes, setNotes] = useState(todo?.notes ?? '');
  const [due, setDue] = useState(toLocalInput(todo?.dueAt ?? null));
  const [reminders, setReminders] = useState<number[]>(todo?.reminders ?? [0]);
  const [assign, setAssign] = useState<Assign>(() => {
    if (!todo || todo.assignees.length === 0) return 'anyone';
    if (todo.assignees.length > 1) return 'both';
    return todo.assignees[0];
  });

  const assignees = assign === 'anyone' ? [] : assign === 'both' ? members.map((m) => m.id) : [assign];
  const recipients = assignees.length ? assignees : members.map((m) => m.id);
  const recipientText =
    recipients.length === members.length && members.length === 2
      ? 'both of you'
      : recipients.length === 1
        ? recipients[0] === user.id
          ? 'you'
          : name(recipients[0])
        : 'everyone';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
  };
  const save = useMutation({
    mutationFn: (input: TodoInput) => (todo ? api.updateTodo(todo.id, input) : api.createTodo(input)),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteTodo(todo!.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ title, notes, dueAt: fromLocalInput(due), assignees, reminders });
  }

  const toggleReminder = (minutes: number) =>
    setReminders((rs) => (rs.includes(minutes) ? rs.filter((r) => r !== minutes) : [...rs, minutes].sort((a, b) => a - b)));

  const assignOptions: { value: Assign; label: string }[] = [
    { value: 'anyone', label: 'Anyone' },
    ...members.map((m) => ({ value: m.id, label: name(m.id) })),
    ...(members.length > 1 ? [{ value: 'both', label: 'Both' }] : []),
  ];

  return (
    <Sheet open title={todo ? 'Edit to-do' : 'New to-do'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>What needs doing?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus={!todo} />
        </label>

        <label className="field">
          <span>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </label>

        <div className="field">
          <span>Due</span>
          <div className="due-row">
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date and time" />
            {due && (
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setDue('')}>
                Clear
              </button>
            )}
          </div>
          <div className="chips">
            {QUICK_DUE.map(([label, days, hour]) => {
              const iso = atHour(days, hour);
              if (Date.parse(iso) <= Date.now()) return null; // e.g. "Tonight" after 6 PM
              return (
                <button key={label} type="button" className="chip" onClick={() => setDue(toLocalInput(iso))}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span>Assigned to</span>
          <div className="segmented" role="radiogroup">
            {assignOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={assign === o.value}
                className={assign === o.value ? 'active' : ''}
                onClick={() => setAssign(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Reminders</span>
          <div className="chips">
            {REMINDER_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                type="button"
                className={`chip${reminders.includes(o.minutes) ? ' active' : ''}`}
                aria-pressed={reminders.includes(o.minutes)}
                disabled={!due}
                onClick={() => toggleReminder(o.minutes)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="hint">
            {!due
              ? 'Set a due date to get reminders.'
              : reminders.length === 0
                ? 'No reminders.'
                : `Reminders go to ${recipientText}.`}
          </p>
        </div>

        {(save.error || remove.error) && <ErrorNote error={save.error ?? remove.error} />}
        <button className="btn btn-primary btn-block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {todo && (
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete “${todo.title}”? (To keep it in history, mark it done instead.)`) && remove.mutate()}
          >
            Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}
