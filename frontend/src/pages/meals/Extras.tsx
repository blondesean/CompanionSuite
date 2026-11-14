import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { formatAmount, parseQuantity } from '../../../../shared/grocery';
import { UNIT_LABELS, UNITS, type ExtraItem, type ExtraItemInput, type Unit } from '../../../../shared/types';
import { api } from '../../api';
import { ErrorNote, Sheet } from '../../components/ui';

export function useGroceryWeek(week: string, options: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: ['grocery', week], queryFn: () => api.groceryWeek(week), ...options });
}

function useInvalidateGrocery(week: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['grocery', week] });
}

/** The week's à la carte items, shown on the meal prep page. */
export function ExtrasCard({ week }: { week: string }) {
  const grocery = useGroceryWeek(week);
  const invalidate = useInvalidateGrocery(week);
  const [editing, setEditing] = useState<ExtraItem | 'new' | null>(null);
  const quickAdd = useMutation({ mutationFn: (item: ExtraItemInput) => api.addExtra(week, item), onSuccess: invalidate });

  const extras = grocery.data?.extras ?? [];
  const recent = grocery.data?.recent ?? [];

  return (
    <section className="card extras" aria-label="À la carte items">
      <div className="card-head">
        <h2 className="card-title">🧴 À la carte</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing('new')}>
          + Add item
        </button>
      </div>
      {grocery.error && <ErrorNote error={grocery.error} onRetry={() => grocery.refetch()} />}
      {quickAdd.error && <ErrorNote error={quickAdd.error} />}
      {grocery.data && extras.length === 0 && (
        <p className="hint">Anything else to pick up this week, like shampoo or paper towels. It goes on the grocery list.</p>
      )}
      {extras.length > 0 && (
        <ul className="extras-list">
          {extras.map((extra) => (
            <li key={extra.id}>
              <button type="button" className="extra-row" onClick={() => setEditing(extra)}>
                <span className="extra-name">{extra.name}</span>
                <span className="amount">{formatAmount(extra.quantity, extra.unit)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <div className="recent">
          <span className="field-label">Recently bought</span>
          <div className="chips">
            {recent.map((item) => (
              <button
                key={item.name}
                type="button"
                className="chip"
                disabled={quickAdd.isPending}
                onClick={() => quickAdd.mutate(item)}
              >
                + {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {editing && <ExtraEditor week={week} extra={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Add or edit one à la carte item. */
export function ExtraEditor({ week, extra, onClose }: { week: string; extra: ExtraItem | null; onClose(): void }) {
  const invalidate = useInvalidateGrocery(week);
  const [name, setName] = useState(extra?.name ?? '');
  const [quantity, setQuantity] = useState(extra ? String(extra.quantity) : '1');
  const [unit, setUnit] = useState<Unit>(extra?.unit ?? 'each');
  const [formError, setFormError] = useState<string | null>(null);

  const finish = () => {
    invalidate();
    onClose();
  };
  const save = useMutation({
    mutationFn: (input: ExtraItemInput) => (extra ? api.updateExtra(week, extra.id, input) : api.addExtra(week, input)),
    onSuccess: finish,
  });
  const remove = useMutation({ mutationFn: () => api.deleteExtra(week, extra!.id), onSuccess: finish });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amount = parseQuantity(quantity);
    if (amount === null || amount <= 0) return setFormError('Enter an amount, like 1 or 2.');
    save.mutate({ name, quantity: amount, unit });
  }

  const units: Unit[] = (UNITS as readonly Unit[]).includes(unit) ? [...UNITS] : [...UNITS, unit];
  const error = save.error ?? remove.error;
  return (
    <Sheet open title={extra ? 'À la carte item' : 'Add an item'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Item</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="e.g. Shampoo"
            autoFocus={!extra}
          />
        </label>
        <div className="extra-amount">
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Amount" />
          </label>
          <label className="field">
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u] ?? u}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">Only for this week’s list.</p>
        {formError && <p className="form-error">{formError}</p>}
        {error && <ErrorNote error={error} />}
        <button className="btn btn-primary btn-block" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : extra ? 'Save' : 'Add to list'}
        </button>
        {extra && (
          <button type="button" className="btn btn-danger-outline btn-block" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete item
          </button>
        )}
      </form>
    </Sheet>
  );
}
