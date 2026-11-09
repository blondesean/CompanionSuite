import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { cadenceLabel, nextDueWeek } from '../../../../shared/chores';
import type { Chore, ChoreInput } from '../../../../shared/types';
import { addWeeks, currentWeek, formatDay, formatWeekRange } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, Sheet } from '../../components/ui';

export function ChoreManage() {
  const query = useQuery({ queryKey: ['chores'], queryFn: api.chores });
  const [editing, setEditing] = useState<Chore | 'new' | null>(null);

  return (
    <>
      <div className="toolbar">
        <p className="muted">{query.data ? `${query.data.length} chore${query.data.length === 1 ? '' : 's'}` : ''}</p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add chore
        </button>
      </div>
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <Empty icon="📝" title="No chores yet">
          <p>Vacuuming, dishes, laundry, bins… add whatever you split.</p>
        </Empty>
      )}
      <ul className="list">
        {query.data?.map((chore) => (
          <li key={chore.id}>
            <button className="row-item row-button" onClick={() => setEditing(chore)}>
              <div className="row-main">
                <span className="row-title">{chore.name}</span>
                <span className="row-meta">
                  {cadenceLabel(chore.cadenceWeeks)}
                  {chore.cadenceWeeks > 1 && ` · next due week of ${formatDay(nextDueWeek(chore, currentWeek()))}`}
                </span>
              </div>
              <span className="chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <ChoreForm chore={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ChoreForm({ chore, onClose }: { chore: Chore | null; onClose(): void }) {
  const queryClient = useQueryClient();
  const thisWeek = currentWeek();
  const [name, setName] = useState(chore?.name ?? '');
  const [cadence, setCadence] = useState(chore?.cadenceWeeks ?? 1);
  // For "every N weeks" the only real choice is which of the next N weeks it lands on.
  const originalNext = chore ? nextDueWeek(chore, thisWeek) : thisWeek;
  const [firstWeek, setFirstWeek] = useState(originalNext);
  const weekOptions = Array.from({ length: cadence }, (_, i) => addWeeks(thisWeek, i));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['chores'] });
    queryClient.invalidateQueries({ queryKey: ['choreWeek'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
  };

  const save = useMutation({
    mutationFn: (input: ChoreInput) => (chore ? api.updateChore(chore.id, input) : api.createChore(input)),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChore(chore!.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    let startWeek: string;
    if (chore && cadence === chore.cadenceWeeks && firstWeek === originalNext) {
      startWeek = chore.startWeek; // unchanged schedule: keep history lined up
    } else if (cadence === 1) {
      startWeek = chore?.startWeek ?? thisWeek;
    } else {
      startWeek = weekOptions.includes(firstWeek) ? firstWeek : thisWeek;
    }
    save.mutate({ name, cadenceWeeks: cadence, startWeek });
  }

  return (
    <Sheet open title={chore ? 'Edit chore' : 'New chore'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Chore</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vacuum living room"
            maxLength={80}
            required
            autoFocus={!chore}
          />
        </label>

        <div className="field">
          <span>Repeats</span>
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setCadence(Math.max(1, cadence - 1))} aria-label="Less often">
              −
            </button>
            <strong>{cadenceLabel(cadence)}</strong>
            <button type="button" className="icon-btn" onClick={() => setCadence(Math.min(52, cadence + 1))} aria-label="More weeks apart">
              +
            </button>
          </div>
        </div>

        {cadence > 1 && (
          <label className="field">
            <span>First due</span>
            <select value={weekOptions.includes(firstWeek) ? firstWeek : thisWeek} onChange={(e) => setFirstWeek(e.target.value)}>
              {weekOptions.map((w, i) => (
                <option key={w} value={w}>
                  {i === 0 ? 'This week' : i === 1 ? 'Next week' : `In ${i} weeks`} ({formatWeekRange(w)})
                </option>
              ))}
            </select>
          </label>
        )}

        {(save.error || remove.error) && <ErrorNote error={save.error ?? remove.error} />}
        <button className="btn btn-primary btn-block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {chore && (
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete “${chore.name}”? Its completion history is kept.`) && remove.mutate()}
          >
            Delete chore
          </button>
        )}
      </form>
    </Sheet>
  );
}
