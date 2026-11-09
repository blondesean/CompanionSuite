import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { buildGroceryList, formatAmount, groceryListText } from '../../../../shared/grocery';
import { currentWeek, formatWeekRange, isWeekStart } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, PageHeader, Toast } from '../../components/ui';

function useChecked(week: string) {
  const storageKey = `cs.grocery.${week}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
    } catch {
      // Not critical.
    }
  }, [storageKey, checked]);
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { checked, toggle, clear: () => setChecked(new Set()) };
}

export function GroceryList() {
  const params = useParams();
  const week = isWeekStart(params.week) ? params.week : currentWeek();
  const plan = useQuery({ queryKey: ['meals', week], queryFn: () => api.mealPlan(week) });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });
  const { checked, toggle, clear } = useChecked(week);
  const [toast, setToast] = useState<string | null>(null);

  const items = plan.data && recipes.data ? buildGroceryList(plan.data.slots, recipes.data) : [];
  const title = `Grocery list · ${formatWeekRange(week)}`;
  const text = groceryListText(title, items);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  async function share() {
    try {
      await navigator.share({ title, text });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') flash('Couldn’t open the share sheet');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      flash('Copied to clipboard');
    } catch {
      flash('Copy failed — try Share instead');
    }
  }

  const itemKey = (i: { name: string; unit: string }) => `${i.name.toLowerCase()}|${i.unit}`;
  const remaining = items.filter((i) => !checked.has(itemKey(i))).length;

  return (
    <main className="page module-meals">
      <PageHeader title="Grocery list" back={week === currentWeek() ? '/meals' : `/meals?week=${week}`} />
      <p className="muted center">
        Week of {formatWeekRange(week)}
        {items.length > 0 && ` · ${remaining} of ${items.length} left`}
      </p>

      {(plan.isLoading || recipes.isLoading) && <Loading />}
      {(plan.error || recipes.error) && <ErrorNote error={plan.error ?? recipes.error} />}
      {plan.data && recipes.data && items.length === 0 && (
        <Empty icon="🛒" title="Nothing to buy">
          <p>The meals planned for this week don’t have any ingredients yet.</p>
        </Empty>
      )}

      {items.length > 0 && (
        <>
          <div className="row">
            {'share' in navigator && (
              <button className="btn btn-primary" onClick={share}>
                Share
              </button>
            )}
            <button className="btn" onClick={copy}>
              Copy
            </button>
            {checked.size > 0 && (
              <button className="btn btn-ghost" onClick={clear}>
                Uncheck all
              </button>
            )}
          </div>
          <ul className="list grocery">
            {items.map((item) => {
              const key = itemKey(item);
              const isChecked = checked.has(key);
              return (
                <li key={key}>
                  <button className={`row-item row-button grocery-item${isChecked ? ' done' : ''}`} onClick={() => toggle(key)}>
                    <span className={`check${isChecked ? ' checked' : ''}`} aria-hidden="true">
                      {isChecked ? '✓' : ''}
                    </span>
                    <div className="row-main">
                      <span className="row-title">{item.name}</span>
                      <span className="row-meta">{item.recipes.join(', ')}</span>
                    </div>
                    <span className="amount">{formatAmount(item.quantity, item.unit)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Toast message={toast} />
    </main>
  );
}
