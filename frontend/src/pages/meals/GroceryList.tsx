import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { buildGroceryList, formatAmount, formatScale, groceryListText, type GroceryItem } from '../../../../shared/grocery';
import {
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  type GroceryMark,
  type GroceryWeek,
  type MealPlan,
  type MealScale,
  type MealSlot,
} from '../../../../shared/types';
import { currentWeek, formatWeekRange, isWeekStart } from '../../../../shared/weeks';
import { api } from '../../api';
import { Empty, ErrorNote, Loading, PageHeader, Toast } from '../../components/ui';
import { ExtraEditor, useGroceryWeek } from './Extras';
import { SLOT_ICONS } from './Meals';

/** While you're at the store, pick up the other person's checks this often. */
const SHOPPING_REFRESH_MS = 15_000;

export function GroceryList() {
  const params = useParams();
  const week = isWeekStart(params.week) ? params.week : currentWeek();
  const queryClient = useQueryClient();
  const planKey = ['meals', week];
  const groceryKey = ['grocery', week];
  const plan = useQuery({ queryKey: planKey, queryFn: () => api.mealPlan(week) });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });
  const grocery = useGroceryWeek(week, { refetchInterval: SHOPPING_REFRESH_MS });
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  // Checking off / removing lines: shared with the other phone, applied
  // instantly here, saved in order in the background.
  const setMark = useMutation({
    mutationKey: ['grocery-mark', week],
    scope: { id: `grocery-mark-${week}` },
    mutationFn: ({ key, mark }: { key: string; mark: GroceryMark | null }) => api.markGrocery(week, key, mark),
    onMutate: async ({ key, mark }) => {
      await queryClient.cancelQueries({ queryKey: groceryKey });
      const previous = queryClient.getQueryData<GroceryWeek>(groceryKey);
      queryClient.setQueryData<GroceryWeek>(groceryKey, (old) => {
        if (!old) return old;
        const marks = { ...old.marks };
        if (mark) marks[key] = mark;
        else delete marks[key];
        return { ...old, marks };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(groceryKey, ctx.previous),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['grocery-mark', week] }) <= 1) {
        queryClient.invalidateQueries({ queryKey: groceryKey });
      }
    },
  });

  const uncheckAll = useMutation({
    mutationFn: () => api.uncheckAll(week),
    onMutate: () =>
      queryClient.setQueryData<GroceryWeek>(groceryKey, (old) =>
        old && { ...old, marks: Object.fromEntries(Object.entries(old.marks).filter(([, m]) => m !== 'checked')) },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: groceryKey }),
  });

  const ready = plan.data && recipes.data && grocery.data;
  const items = ready ? buildGroceryList(plan.data!.slots, recipes.data!, plan.data!.scale, grocery.data!.extras) : [];
  const marks = grocery.data?.marks ?? {};
  const onList = items.filter((i) => marks[i.key] !== 'removed');
  const removed = items.filter((i) => marks[i.key] === 'removed');
  const checkedCount = onList.filter((i) => marks[i.key] === 'checked').length;
  const remaining = onList.length - checkedCount;

  const title = `Grocery list · ${formatWeekRange(week)}`;
  const text = groceryListText(title, onList);
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

  function removeItem(item: GroceryItem) {
    setMark.mutate({ key: item.key, mark: 'removed' });
    flash(`Removed ${item.name}`);
  }

  const error = plan.error ?? recipes.error ?? grocery.error;
  return (
    <main className="page module-meals">
      <PageHeader title="Grocery list" back={week === currentWeek() ? '/meals' : `/meals?week=${week}`} />
      <p className="muted center">
        Week of {formatWeekRange(week)}
        {onList.length > 0 && (remaining === 0 ? ' · All done ✓' : ` · ${remaining} of ${onList.length} left`)}
      </p>

      {(plan.isLoading || recipes.isLoading || grocery.isLoading) && <Loading />}
      {error && <ErrorNote error={error} />}
      {setMark.error && <ErrorNote error={setMark.error} />}
      {ready && onList.length === 0 && (
        <Empty icon="🛒" title={removed.length ? 'Everything’s removed' : 'Nothing to buy'}>
          <p>
            {removed.length
              ? 'Put items back from the list below, or add something.'
              : 'Plan a meal or add an à la carte item and it shows up here.'}
          </p>
        </Empty>
      )}

      {onList.length > 0 && (
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
            {checkedCount > 0 && (
              <button className="btn btn-ghost" disabled={uncheckAll.isPending} onClick={() => uncheckAll.mutate()}>
                Uncheck all
              </button>
            )}
          </div>
          <ul className="list grocery">
            {onList.map((item) => {
              const isChecked = marks[item.key] === 'checked';
              return (
                <li key={item.key} className={`row-item grocery-item${isChecked ? ' done' : ''}`}>
                  <button
                    className="grocery-toggle"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => setMark.mutate({ key: item.key, mark: isChecked ? null : 'checked' })}
                  >
                    <span className={`check${isChecked ? ' checked' : ''}`} aria-hidden="true">
                      {isChecked ? '✓' : ''}
                    </span>
                    <span className="row-main">
                      <span className="row-title">{item.name}</span>
                      <span className="row-meta">{item.recipes.join(', ')}</span>
                    </span>
                    <span className="amount">{formatAmount(item.quantity, item.unit)}</span>
                  </button>
                  <button className="icon-btn icon-btn-small" aria-label={`Remove ${item.name} from the list`} onClick={() => removeItem(item)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {ready && (
        <button className="btn btn-block" onClick={() => setAdding(true)}>
          + Add an item
        </button>
      )}

      {removed.length > 0 && (
        <section aria-label="Removed items">
          <h2 className="section-title">Removed this week</h2>
          <ul className="list list-quiet">
            {removed.map((item) => (
              <li key={item.key} className="row-item removed-item">
                <span className="row-main">
                  <span className="row-title">{item.name}</span>
                  <span className="row-meta">{formatAmount(item.quantity, item.unit)}</span>
                </span>
                <button className="btn btn-small btn-ghost" onClick={() => setMark.mutate({ key: item.key, mark: null })}>
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </section>
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
      {adding && <ExtraEditor week={week} extra={null} onClose={() => setAdding(false)} />}
      <Toast message={toast} />
    </main>
  );
}
