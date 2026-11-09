import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Todo } from '../../../../shared/types';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, useMembers } from '../../components/ui';
import { dayHeading, formatTime } from '../../format';

export function TodoHistory() {
  const queryClient = useQueryClient();
  const { name } = useMembers();
  const query = useQuery({ queryKey: ['todoHistory'], queryFn: api.todoHistory });
  const [search, setSearch] = useState('');

  const reopen = useMutation({
    mutationFn: (todo: Todo) => api.reopenTodo(todo.id, todo.completedAt!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['todoHistory'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const term = search.trim().toLowerCase();
  const todos = (query.data ?? []).filter((t) => !term || t.title.toLowerCase().includes(term));
  const groups: { heading: string; items: Todo[] }[] = [];
  for (const todo of todos) {
    const heading = dayHeading(todo.completedAt!);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(todo);
    else groups.push({ heading, items: [todo] });
  }

  return (
    <>
      {query.data && query.data.length > 0 && (
        <input
          type="search"
          className="search search-full"
          placeholder="Search finished to-dos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {reopen.error && <ErrorNote error={reopen.error} />}
      {query.data?.length === 0 && (
        <Empty icon="🏁" title="Nothing finished yet">
          <p>Completed to-dos are kept here.</p>
        </Empty>
      )}
      {groups.map((group) => (
        <section key={group.heading}>
          <h2 className="section-title">{group.heading}</h2>
          <ul className="list">
            {group.items.map((todo) => (
              <li key={`${todo.id}-${todo.completedAt}`} className="row-item done">
                <span className="check checked" aria-hidden="true">
                  ✓
                </span>
                <div className="row-main">
                  <span className="row-title">{todo.title}</span>
                  <span className="row-meta">
                    {name(todo.completedBy)} · {formatTime(todo.completedAt!)}
                  </span>
                </div>
                <button className="btn btn-small btn-ghost" disabled={reopen.isPending} onClick={() => reopen.mutate(todo)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
