import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { buildGroceryList, formatAmount, formatScale, groceryListText } from '../../../../shared/grocery';
import {
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  type MealPlan,
  type MealScale,
  type MealSlot,
} from '../../../../shared/types';
import { currentWeek, formatWeekRange, isWeekStart } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, PageHeader, Toast } from '../../components/ui';
import { SLOT_ICONS } from './Meals';

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
  const queryClient = useQueryClient();
  const planKey = ['meals', week];
  const plan = useQuery({ queryKey: planKey, queryFn: () => api.mealPlan(week) });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });
  const { checked, toggle, clear } = useChecked(week);
  const [toast, setToast] = useState<string | null>(null);

  // Portion changes save to the shared plan. They run one at a time so fast
  // taps can't arrive out of order, and the list only re-syncs after the last.
  const saveScale = useMutation({
    mutationKey: ['meal-scale', week],
    scope: { id: `meal-scale-${week}` },
    mutationFn: (scale: MealScale) => api.saveMealPlan(week, plan.data!.slots, scale),
    onMutate: async (scale) => {
      await queryClient.cancelQueries({ queryKey: planKey });
      const previous = queryClient.getQueryData<MealPlan>(planKey);
      queryClient.setQueryData<MealPlan>(planKey, (old) => old && { ...old, scale });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(planKey, ctx.previous),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['meal-scale', week] }) <= 1) {
        queryClient.invalidateQueries({ queryKey: planKey });
      }
    },
  });

  const items = plan.data && recipes.data ? buildGroceryList(plan.data.slots, recipes.data, plan.data.scale) : [];
  const title = `Grocery list · ${formatWeekRange(week)}`;
  const text = groceryListText(title, items);
  const recipeById = new Map((recipes.data ?? []).map((r) => [r.id, r]));
  const planned = plan.data ? MEAL_SLOTS.filter((s) => plan.data.slots[s] && recipeById.has(plan.data.slots[s]!)) : [];

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

  function changeScale(slot: MealSlot, delta: number) {
    const current = plan.data!.scale[slot];
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((current + delta) / SCALE_STEP) * SCALE_STEP));
    if (next !== current) saveScale.mutate({ ...plan.data!.scale, [slot]: next });
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

      {plan.data && planned.length > 0 && (
        <section className="card portions" aria-label="Portion sizes">
          <h2 className="card-title">Portions</h2>
          <p className="hint">Make more or less of a meal. The list above updates for both of you.</p>
          {saveScale.error && <ErrorNote error={saveScale.error} />}
          {planned.map((slot) => {
            const scale = plan.data.scale[slot];
            return (
              <div key={slot} className="portion-row">
                <span className="meal-icon" aria-hidden="true">
                  {SLOT_ICONS[slot]}
                </span>
                <div className="row-main">
                  <span className="row-label">{MEAL_SLOT_LABELS[slot]}</span>
                  <span className="row-title">{recipeById.get(plan.data.slots[slot]!)!.name}</span>
                </div>
                <div className="stepper stepper-compact">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Smaller ${MEAL_SLOT_LABELS[slot]} portion`}
                    disabled={scale <= SCALE_MIN}
                    onClick={() => changeScale(slot, -SCALE_STEP)}
                  >
                    −
                  </button>
                  <strong className={scale !== 1 ? 'scaled' : ''}>{formatScale(scale)}</strong>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Bigger ${MEAL_SLOT_LABELS[slot]} portion`}
                    disabled={scale >= SCALE_MAX}
                    onClick={() => changeScale(slot, SCALE_STEP)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <Toast message={toast} />
    </main>
  );
}
