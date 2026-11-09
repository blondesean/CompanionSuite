import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import type { Todo } from '../../../../shared/types';
import { localDate } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, MemberDot, PageHeader, Tabs, Toast, useMembers } from '../../components/ui';
import { formatDue } from '../../format';
import { currentSubscription, pushSupport } from '../../push';
import { playComplete } from '../../sound';
import { TodoEditor } from './TodoEditor';

export function TodoLayout() {
  return (
    <main className="page module-todo">
      <PageHeader title="To-Do" />
      <Tabs
        tabs={[
          { to: '/todo', label: 'Open', end: true },
          { to: '/todo/history', label: 'Done' },
        ]}
      />
      <Outlet />
    </main>
  );
}

function groupTodos(todos: Todo[], now: Date) {
  const nowIso = now.toISOString();
  const today = localDate(now);
  const groups = { overdue: [] as Todo[], today: [] as Todo[], upcoming: [] as Todo[], someday: [] as Todo[] };
  for (const t of todos) {
    if (!t.dueAt) groups.someday.push(t);
    else if (t.dueAt < nowIso) groups.overdue.push(t);
    else if (localDate(new Date(t.dueAt)) === today) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  return [
    { id: 'overdue', title: 'Overdue', items: groups.overdue },
    { id: 'today', title: 'Today', items: groups.today },
    { id: 'upcoming', title: 'Upcoming', items: groups.upcoming },
    { id: 'someday', title: 'No due date', items: groups.someday },
  ].filter((g) => g.items.length > 0);
}

const COMPLETE_ANIMATION_MS = 600;

export function TodoList() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['todos'], queryFn: api.todos });
  const [editing, setEditing] = useState<Todo | 'new' | null>(null);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const complete = useMutation({
    mutationFn: (id: string) => api.completeTodo(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueryData<Todo[]>(['todos']);
      queryClient.setQueryData<Todo[]>(['todos'], (old) => old?.filter((t) => t.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['todos'], ctx.previous);
      setToast('Couldn’t mark that done — try again');
      setTimeout(() => setToast(null), 2500);
    },
    onSettled: (_d, _e, id) => {
      setCompleting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['todoHistory'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  function check(todo: Todo) {
    if (completing.has(todo.id)) return;
    playComplete();
    setCompleting((s) => new Set(s).add(todo.id));
    setTimeout(() => complete.mutate(todo.id), COMPLETE_ANIMATION_MS);
  }

  const groups = query.data ? groupTodos(query.data, new Date()) : [];

  return (
    <>
      <ReminderBanner />
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <Empty icon="🌿" title="All clear">
          <p>Nothing on the list. Tap + to add something.</p>
        </Empty>
      )}

      {groups.map((group) => (
        <section key={group.id}>
          <h2 className={`section-title${group.id === 'overdue' ? ' danger' : ''}`}>{group.title}</h2>
          <ul className="list">
            {group.items.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                overdue={group.id === 'overdue'}
                completing={completing.has(todo.id)}
                onCheck={() => check(todo)}
                onEdit={() => setEditing(todo)}
              />
            ))}
          </ul>
        </section>
      ))}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add to-do">
        +
      </button>
      {editing && <TodoEditor todo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Toast message={toast} />
    </>
  );
}

function TodoRow({
  todo,
  overdue,
  completing,
  onCheck,
  onEdit,
}: {
  todo: Todo;
  overdue: boolean;
  completing: boolean;
  onCheck(): void;
  onEdit(): void;
}) {
  const { members, color } = useMembers();
  const assigned = members.filter((m) => todo.assignees.includes(m.id));

  return (
    <li className={`row-item todo-row${completing ? ' completing' : ''}`}>
      <button className="todo-check" onClick={onCheck} aria-label={`Mark “${todo.title}” done`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="row-main row-main-button" onClick={onEdit}>
        <span className="row-title">{todo.title}</span>
        {(todo.dueAt || todo.notes) && (
          <span className={`row-meta${overdue ? ' danger' : ''}`}>
            {todo.dueAt && formatDue(todo.dueAt)}
            {todo.dueAt && todo.reminders.length > 0 && ' 🔔'}
            {todo.notes && <span className="note-dot"> · {todo.notes.split('\n')[0]}</span>}
          </span>
        )}
      </button>
      {assigned.length > 0 && (
        <div className="assignees">
          {assigned.map((m) => (
            <MemberDot key={m.id} member={m} color={color(m.id)} size={24} />
          ))}
        </div>
      )}
    </li>
  );
}

const BANNER_DISMISSED = 'cs.pushBannerDismissed';

/** Nudges each phone to turn on reminders once. */
function ReminderBanner() {
  const support = pushSupport();
  const key = useQuery({ queryKey: ['pushKey'], queryFn: api.pushKey, enabled: support === 'supported' });
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_DISMISSED) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (support === 'supported') currentSubscription().then((s) => setSubscribed(!!s));
  }, [support]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_DISMISSED, '1');
    } catch {
      // ignore
    }
  };

  if (dismissed) return null;
  const show =
    support === 'needs-install' || (support === 'supported' && subscribed === false && !!key.data?.publicKey);
  if (!show) return null;

  return (
    <div className="banner">
      <span>🔔</span>
      <p>
        {support === 'needs-install' ? (
          <>To get reminders, add this app to your Home Screen (Share → Add to Home Screen).</>
        ) : (
          <>
            Reminders are off on this phone. <Link to="/settings">Turn them on</Link>
          </>
        )}
      </p>
      <button className="icon-btn icon-btn-small" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
