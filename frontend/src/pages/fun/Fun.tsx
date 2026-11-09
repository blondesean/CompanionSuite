import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router';
import { FUN_CATEGORIES, type FunCategory, type FunIdea, type FunIdeaInput } from '../../../../shared/types';
import { formatDay, localDate } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, PageHeader, Sheet, Tabs, useMembers } from '../../components/ui';
import { playComplete } from '../../sound';

const categoryOf = (id: FunCategory) => FUN_CATEGORIES.find((c) => c.id === id) ?? FUN_CATEGORIES[FUN_CATEGORIES.length - 1];

function useFun() {
  return useQuery({ queryKey: ['fun'], queryFn: api.funIdeas });
}

function useInvalidateFun() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['fun'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
  };
}

export function FunLayout() {
  return (
    <main className="page module-fun">
      <PageHeader title="Fun" />
      <Tabs
        tabs={[
          { to: '/fun', label: 'Ideas', end: true },
          { to: '/fun/done', label: 'Done together' },
        ]}
      />
      <Outlet />
    </main>
  );
}

// ---------- ideas ----------

export function FunIdeas() {
  const query = useFun();
  const [filter, setFilter] = useState<FunCategory | 'all'>('all');
  const [editing, setEditing] = useState<FunIdea | 'new' | null>(null);
  const [picking, setPicking] = useState(false);

  const open = (query.data ?? []).filter((i) => !i.doneOn);
  const shown = open.filter((i) => filter === 'all' || i.category === filter);
  const countIn = (c: FunCategory) => open.filter((i) => i.category === c).length;

  return (
    <>
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}

      {query.data && open.length === 0 && (
        <Empty icon="🎡" title="No ideas yet">
          <p>Date nights, restaurants to try, trips, things to do at home — jot them down here and pick one when you’re stuck.</p>
        </Empty>
      )}

      {open.length > 0 && (
        <>
          <button className="btn btn-primary btn-block pick-btn" disabled={shown.length === 0} onClick={() => setPicking(true)}>
            🎲 Pick one for us
          </button>
          <div className="chips chips-scroll" role="radiogroup" aria-label="Filter by category">
            <button className={`chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
              All {open.length}
            </button>
            {FUN_CATEGORIES.filter((c) => countIn(c.id) > 0).map((c) => (
              <button key={c.id} className={`chip${filter === c.id ? ' active' : ''}`} onClick={() => setFilter(c.id)}>
                {c.icon} {c.label} {countIn(c.id)}
              </button>
            ))}
          </div>
          <ul className="list">
            {shown.map((idea) => (
              <li key={idea.id}>
                <button className="row-item row-button" onClick={() => setEditing(idea)}>
                  <span className="fun-icon" aria-hidden="true">
                    {categoryOf(idea.category).icon}
                  </span>
                  <div className="row-main">
                    <span className="row-title">{idea.title}</span>
                    <span className="row-meta">{idea.notes ? idea.notes.split('\n')[0] : categoryOf(idea.category).label}</span>
                  </div>
                  <span className="chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add idea">
        +
      </button>
      {editing && <IdeaEditor idea={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {picking && <Picker ideas={shown} onClose={() => setPicking(false)} />}
    </>
  );
}

// ---------- random picker ----------

const SHUFFLE_MS = 1400;

function Picker({ ideas: initialIdeas, onClose }: { ideas: FunIdea[]; onClose(): void }) {
  const invalidate = useInvalidateFun();
  // Snapshot so a background refresh doesn't restart the shuffle.
  const [ideas] = useState(initialIdeas);
  const [current, setCurrent] = useState<FunIdea>(ideas[0]);
  const [settled, setSettled] = useState(false);
  const [round, setRound] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSettled(false);
    const winner = ideas[Math.floor(Math.random() * ideas.length)];
    const start = Date.now();
    // Flick through ideas, slowing down, then land on the winner.
    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= SHUFFLE_MS || ideas.length === 1) {
        setCurrent(winner);
        setSettled(true);
        return;
      }
      setCurrent(ideas[Math.floor(Math.random() * ideas.length)]);
      timer.current = window.setTimeout(tick, 60 + (elapsed / SHUFFLE_MS) * 180);
    };
    tick();
    return () => window.clearTimeout(timer.current);
  }, [ideas, round]);

  const markDone = useMutation({
    mutationFn: () => api.markFunDone(current.id, localDate()),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const category = categoryOf(current.category);
  return (
    <Sheet open title="Tonight’s pick" onClose={onClose}>
      <div className="stack">
        <div className={`pick-card${settled ? ' settled' : ''}`} aria-live="polite">
          <span className="pick-icon">{category.icon}</span>
          <strong className="pick-title">{current.title}</strong>
          <span className="muted">{category.label}</span>
          {settled && current.notes && <p className="pick-notes">{current.notes}</p>}
        </div>
        {markDone.error && <ErrorNote error={markDone.error} />}
        <div className="row row-center">
          <button className="btn" disabled={!settled || ideas.length < 2} onClick={() => setRound((r) => r + 1)}>
            🎲 Pick again
          </button>
          <button
            className="btn btn-primary"
            disabled={!settled || markDone.isPending}
            onClick={() => {
              playComplete();
              markDone.mutate();
            }}
          >
            We did it today ✓
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- add / edit ----------

function IdeaEditor({ idea, onClose }: { idea: FunIdea | null; onClose(): void }) {
  const invalidate = useInvalidateFun();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [category, setCategory] = useState<FunCategory>(idea?.category ?? 'date');
  const [notes, setNotes] = useState(idea?.notes ?? '');
  const [doneOn, setDoneOn] = useState(localDate());

  const finish = () => {
    invalidate();
    onClose();
  };
  const save = useMutation({
    mutationFn: (input: FunIdeaInput) => (idea ? api.updateFunIdea(idea.id, input) : api.createFunIdea(input)),
    onSuccess: finish,
  });
  const markDone = useMutation({
    mutationFn: async () => {
      // Save any edits first so they aren't lost.
      await api.updateFunIdea(idea!.id, { title, category, notes });
      return api.markFunDone(idea!.id, doneOn);
    },
    onSuccess: finish,
  });
  const remove = useMutation({ mutationFn: () => api.deleteFunIdea(idea!.id), onSuccess: finish });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ title, category, notes });
  }

  const error = save.error ?? markDone.error ?? remove.error;
  return (
    <Sheet open title={idea ? 'Idea' : 'New idea'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>What’s the idea?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. Sunset hike + tacos"
            autoFocus={!idea}
          />
        </label>
        <div className="field">
          <span>Category</span>
          <div className="chips" role="radiogroup">
            {FUN_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                className={`chip${category === c.id ? ' active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Where, links, who recommended it…" />
        </label>

        {error && <ErrorNote error={error} />}
        <button className="btn btn-primary btn-block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>

        {idea && (
          <div className="done-box">
            <span className="field-label">Did it together?</span>
            <div className="due-row">
              <input type="date" value={doneOn} max={localDate()} onChange={(e) => setDoneOn(e.target.value)} aria-label="Date you did it" />
              <button
                type="button"
                className="btn"
                disabled={!doneOn || !title.trim() || markDone.isPending}
                onClick={() => {
                  playComplete();
                  markDone.mutate();
                }}
              >
                We did it ✓
              </button>
            </div>
          </div>
        )}

        {idea && (
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete “${idea.title}”?`) && remove.mutate()}
          >
            Delete idea
          </button>
        )}
      </form>
    </Sheet>
  );
}

// ---------- done together ----------

function monthHeading(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function FunDone() {
  const query = useFun();
  const invalidate = useInvalidateFun();
  const { name } = useMembers();
  const restore = useMutation({ mutationFn: (id: string) => api.markFunUndone(id), onSuccess: invalidate });

  const done = (query.data ?? []).filter((i) => i.doneOn);
  const groups: { heading: string; items: FunIdea[] }[] = [];
  for (const idea of done) {
    const heading = monthHeading(idea.doneOn!);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(idea);
    else groups.push({ heading, items: [idea] });
  }

  return (
    <>
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {restore.error && <ErrorNote error={restore.error} />}
      {query.data && done.length === 0 && (
        <Empty icon="📸" title="Nothing yet">
          <p>Ideas you mark as done show up here — a little log of your adventures.</p>
        </Empty>
      )}
      {done.length > 0 && (
        <p className="muted center">
          {done.length} thing{done.length === 1 ? '' : 's'} done together 🎉
        </p>
      )}
      {groups.map((group) => (
        <section key={group.heading}>
          <h2 className="section-title">{group.heading}</h2>
          <ul className="list">
            {group.items.map((idea) => (
              <li key={idea.id} className="row-item">
                <span className="fun-icon" aria-hidden="true">
                  {categoryOf(idea.category).icon}
                </span>
                <div className="row-main">
                  <span className="row-title">{idea.title}</span>
                  <span className="row-meta">
                    {formatDay(idea.doneOn!)} · marked by {name(idea.doneBy)}
                  </span>
                </div>
                <button className="btn btn-small btn-ghost" disabled={restore.isPending} onClick={() => restore.mutate(idea.id)}>
                  Do again
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
