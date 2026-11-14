import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { dateKind, formatCountdown, sortDates, yearsLabel, type DateWithOccurrence } from '../../../../shared/dates';
import { DATE_KINDS, type DateKind, type ImportantDate, type ImportantDateInput } from '../../../../shared/types';
import { localDate } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, PageHeader, Sheet } from '../../components/ui';

/** Kinds that usually come around every year. */
const YEARLY_KINDS: DateKind[] = ['birthday', 'anniversary', 'holiday'];

/** "Sat, Nov 28" (adds the year when it isn't this year). */
function formatDate(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  });
}

function Countdown({ days }: { days: number }) {
  if (days === 0) return <span className="countdown today">Today 🎉</span>;
  if (days === 1) return <span className="countdown soon">Tomorrow</span>;
  return (
    <span className={`countdown${days <= 7 ? ' soon' : ''}`}>
      <strong>{days}</strong>
      <span>days</span>
    </span>
  );
}

export function Dates() {
  const query = useQuery({ queryKey: ['dates'], queryFn: api.dates });
  const [editing, setEditing] = useState<ImportantDate | 'new' | null>(null);
  const today = localDate();
  const { upcoming, past } = sortDates(query.data ?? [], today);
  const [next, ...rest] = upcoming;

  // "Turns 30" / "5th anniversary" already says it repeats; otherwise say so.
  const meta = (item: DateWithOccurrence) =>
    [formatDate(item.next.date, today), yearsLabel(item.kind, item.next.years) ?? (item.yearly ? 'every year' : null)]
      .filter(Boolean)
      .join(' · ');

  return (
    <main className="page module-dates">
      <PageHeader title="Dates" />
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}

      {query.data && query.data.length === 0 && (
        <Empty icon="📅" title="No dates yet">
          <p>Birthdays, your anniversary, trips and anything else worth counting down to. Soonest shows first.</p>
        </Empty>
      )}

      {next && (
        <button className={`next-date${next.next.daysUntil === 0 ? ' is-today' : ''}`} onClick={() => setEditing(next)}>
          <span className="next-date-icon" aria-hidden="true">
            {dateKind(next.kind).icon}
          </span>
          <span className="next-date-label">Next up</span>
          <strong className="next-date-title">{next.title}</strong>
          <span className="next-date-count">
            {next.next.daysUntil <= 1 ? (
              formatCountdown(next.next.daysUntil)
            ) : (
              <>
                <b>{next.next.daysUntil}</b> days
              </>
            )}
          </span>
          <span className="muted">{meta(next)}</span>
        </button>
      )}

      {rest.length > 0 && (
        <ul className="list">
          {rest.map((item) => (
            <li key={item.id}>
              <button className="row-item row-button" onClick={() => setEditing(item)}>
                <span className="fun-icon" aria-hidden="true">
                  {dateKind(item.kind).icon}
                </span>
                <div className="row-main">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{meta(item)}</span>
                </div>
                <Countdown days={item.next.daysUntil} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="section-title">Past</h2>
          <ul className="list list-quiet">
            {past.map((item) => (
              <li key={item.id}>
                <button className="row-item row-button" onClick={() => setEditing(item)}>
                  <span className="fun-icon" aria-hidden="true">
                    {dateKind(item.kind).icon}
                  </span>
                  <div className="row-main">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">
                      {formatDate(item.date, today)} · {formatCountdown(item.next.daysUntil)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add date">
        +
      </button>
      {editing && <DateEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function DateEditor({ item, onClose }: { item: ImportantDate | null; onClose(): void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.date ?? '');
  const [kind, setKind] = useState<DateKind>(item?.kind ?? 'birthday');
  const [yearly, setYearly] = useState(item?.yearly ?? true);
  // Picking a kind suggests yearly/one time until you choose for yourself.
  const [yearlyTouched, setYearlyTouched] = useState(item !== null);
  const [notes, setNotes] = useState(item?.notes ?? '');

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ['dates'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: (input: ImportantDateInput) => (item ? api.updateDate(item.id, input) : api.createDate(input)),
    onSuccess: finish,
  });
  const remove = useMutation({ mutationFn: () => api.deleteDate(item!.id), onSuccess: finish });

  function chooseKind(k: DateKind) {
    setKind(k);
    if (!yearlyTouched) setYearly(YEARLY_KINDS.includes(k));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ title, date, yearly, kind, notes });
  }

  const error = save.error ?? remove.error;
  return (
    <Sheet open title={item ? 'Date' : 'New date'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>What is it?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Mom’s birthday"
            autoFocus={!item}
          />
        </label>
        <div className="field">
          <span>Kind</span>
          <div className="chips" role="radiogroup">
            {DATE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                className={`chip${kind === k.id ? ' active' : ''}`}
                onClick={() => chooseKind(k.id)}
              >
                {k.icon} {k.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="field">
          <span>Repeats</span>
          <div className="segmented" role="radiogroup" aria-label="Repeats">
            {[
              { value: true, label: 'Every year' },
              { value: false, label: 'One time' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={yearly === o.value}
                className={yearly === o.value ? 'active' : ''}
                onClick={() => {
                  setYearly(o.value);
                  setYearlyTouched(true);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          {yearly && (kind === 'birthday' || kind === 'anniversary') && (
            <p className="hint">Use the original year (when they were born, or when it started) and the years are counted for you.</p>
          )}
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Gift ideas, plans…" />
        </label>

        {error && <ErrorNote error={error} />}
        <button className="btn btn-primary btn-block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {item && (
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete “${item.title}”?`) && remove.mutate()}
          >
            Delete date
          </button>
        )}
      </form>
    </Sheet>
  );
}
