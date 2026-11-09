import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router';
import { cadenceLabel } from '../../../../shared/chores';
import type { ChoreWeek, ChoreWeekEntry } from '../../../../shared/types';
import { formatDay, formatWeekRange } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, MemberDot, PageHeader, Tabs, useMembers, WeekNav } from '../../components/ui';
import { useWeekParam } from '../../hooks';

export function ChoresLayout() {
  return (
    <main className="page module-chores">
      <PageHeader title="Chores" />
      <Tabs
        tabs={[
          { to: '/chores', label: 'This week', end: true },
          { to: '/chores/manage', label: 'Manage' },
          { to: '/chores/history', label: 'History' },
        ]}
      />
      <Outlet />
    </main>
  );
}

export function ChoreWeekView() {
  const [week, setWeek] = useWeekParam();
  const queryClient = useQueryClient();
  const key = ['choreWeek', week];
  const query = useQuery({ queryKey: key, queryFn: () => api.choreWeek(week) });

  const setDone = useMutation({
    mutationFn: async ({ choreId, by }: { choreId: string; by: string | null }): Promise<void> => {
      if (by) await api.completeChore(choreId, week, by);
      else await api.uncompleteChore(choreId, week);
    },
    onMutate: async ({ choreId, by }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChoreWeek>(key);
      queryClient.setQueryData<ChoreWeek>(key, (old) =>
        old && {
          ...old,
          due: old.due.map((e) =>
            e.chore.id !== choreId
              ? e
              : {
                  ...e,
                  completion: by
                    ? { choreId, choreName: e.chore.name, week, completedBy: by, completedAt: new Date().toISOString() }
                    : null,
                },
          ),
        },
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['completions'] });
    },
  });

  const data = query.data;
  const doneCount = data?.due.filter((e) => e.completion).length ?? 0;

  return (
    <>
      <WeekNav week={week} onChange={setWeek} />
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {setDone.error && <ErrorNote error={setDone.error} />}

      {data && data.due.length === 0 && data.upcoming.length === 0 && (
        <Empty icon="🧽" title="No chores yet">
          <p>Add the chores you share and they’ll show up here every week.</p>
          <Link to="/chores/manage" className="btn btn-primary">
            Add chores
          </Link>
        </Empty>
      )}

      {data && data.due.length > 0 && (
        <>
          <div className="progress" aria-label={`${doneCount} of ${data.due.length} done`}>
            <div className="progress-text">
              <strong>
                {doneCount} of {data.due.length}
              </strong>{' '}
              done {doneCount === data.due.length && '🎉'}
            </div>
            <div className="progress-bar">
              <div style={{ width: `${(doneCount / data.due.length) * 100}%` }} />
            </div>
          </div>
          <ul className="list">
            {data.due.map((entry) => (
              <ChoreRow
                key={entry.chore.id}
                entry={entry}
                onDone={(by) => setDone.mutate({ choreId: entry.chore.id, by })}
                onUndo={() => setDone.mutate({ choreId: entry.chore.id, by: null })}
              />
            ))}
          </ul>
        </>
      )}

      {data && data.due.length === 0 && data.upcoming.length > 0 && (
        <p className="hint center">Nothing due {formatWeekRange(week)}.</p>
      )}

      {data && data.upcoming.length > 0 && (
        <section>
          <h2 className="section-title">Not due this week</h2>
          <ul className="list list-quiet">
            {data.upcoming.map(({ chore, nextWeek }) => (
              <li key={chore.id} className="row-item">
                <div className="row-main">
                  <span className="row-title">{chore.name}</span>
                  <span className="row-meta">
                    Next: week of {formatDay(nextWeek)} · {cadenceLabel(chore.cadenceWeeks)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ChoreRow({ entry, onDone, onUndo }: { entry: ChoreWeekEntry; onDone(by: string): void; onUndo(): void }) {
  const { members, name, color } = useMembers();
  const { chore, completion, last } = entry;
  const lastText = last ? `Last time: ${name(last.completedBy)}` : 'First time';

  return (
    <li className={`row-item chore-row${completion ? ' done' : ''}`}>
      <span className={`check${completion ? ' checked' : ''}`} aria-hidden="true">
        {completion ? '✓' : ''}
      </span>
      <div className="row-main">
        <span className="row-title">{chore.name}</span>
        <span className="row-meta">
          {completion ? (
            <>Done by {name(completion.completedBy)}</>
          ) : (
            <>
              {lastText}
              {chore.cadenceWeeks > 1 && ` · ${cadenceLabel(chore.cadenceWeeks)}`}
            </>
          )}
        </span>
      </div>
      {completion ? (
        <div className="row-actions">
          <MemberDot member={members.find((m) => m.id === completion.completedBy)} color={color(completion.completedBy)} />
          <button className="btn btn-small btn-ghost" onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : (
        <div className="row-actions" aria-label="Who did it?">
          {members.map((m) => (
            <button
              key={m.id}
              className="who-btn"
              style={{ borderColor: color(m.id), color: color(m.id) }}
              onClick={() => onDone(m.id)}
              aria-label={`${m.name} did it`}
            >
              {name(m.id)}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
