import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { addWeeks, currentWeek, formatDay, isISODate, weekStart } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, MemberDot, useMembers } from '../../components/ui';
import { formatDateTime } from '../../format';

export function ChoreHistory() {
  const { members, name, color } = useMembers();
  const [from, setFrom] = useState(() => addWeeks(currentWeek(), -7));
  const [to, setTo] = useState(() => currentWeek());
  const [person, setPerson] = useState('');
  const [chore, setChore] = useState('');

  const query = useQuery({ queryKey: ['completions', from, to], queryFn: () => api.completions(from, to) });

  const choreNames = useMemo(
    () => [...new Set((query.data ?? []).map((c) => c.choreName))].sort((a, b) => a.localeCompare(b)),
    [query.data],
  );
  const rows = (query.data ?? []).filter(
    (c) => (!person || c.completedBy === person) && (!chore || c.choreName === chore),
  );

  const setWeek = (setter: (w: string) => void) => (value: string) => {
    if (isISODate(value)) setter(weekStart(value));
  };

  return (
    <>
      <div className="filters">
        <label className="field field-compact">
          <span>From week of</span>
          <input type="date" value={from} max={to} onChange={(e) => setWeek(setFrom)(e.target.value)} />
        </label>
        <label className="field field-compact">
          <span>To week of</span>
          <input type="date" value={to} min={from} onChange={(e) => setWeek(setTo)(e.target.value)} />
        </label>
        <label className="field field-compact">
          <span>Person</span>
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-compact">
          <span>Chore</span>
          <select value={chore} onChange={(e) => setChore(e.target.value)}>
            <option value="">All chores</option>
            {choreNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="tally">
          <span className="pill">{rows.length} completed</span>
          {members.map((m) => {
            const count = rows.filter((r) => r.completedBy === m.id).length;
            return (
              <span key={m.id} className="pill" style={{ color: color(m.id) }}>
                {name(m.id)}: {count}
              </span>
            );
          })}
        </div>
      )}

      {query.data && rows.length === 0 && <Empty icon="📊" title="No completions in this range" />}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Chore</th>
                <th>By</th>
                <th>Marked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={`${c.week}-${c.choreId}`}>
                  <td className="nowrap">{formatDay(c.week)}</td>
                  <td>{c.choreName}</td>
                  <td className="nowrap">
                    <span className="who">
                      <MemberDot member={members.find((m) => m.id === c.completedBy)} color={color(c.completedBy)} size={20} />
                      {name(c.completedBy)}
                    </span>
                  </td>
                  <td className="muted small">{formatDateTime(c.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
