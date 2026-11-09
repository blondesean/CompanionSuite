import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router';
import { MEAL_SLOT_LABELS, MEAL_SLOTS, type MealPlan, type MealSlot, type MealSlots } from '../../../../shared/types';
import { api } from '../../api';
import { ErrorNote, Loading, PageHeader, Tabs, WeekNav } from '../../components/ui';
import { useWeekParam } from '../../hooks';

const SLOT_ICONS: Record<MealSlot, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍝', filler: '🍎' };

export function MealsLayout() {
  return (
    <main className="page module-meals">
      <PageHeader title="Meals" />
      <Tabs
        tabs={[
          { to: '/meals', label: 'Meal prep', end: true },
          { to: '/meals/recipes', label: 'Recipes' },
        ]}
      />
      <Outlet />
    </main>
  );
}

export function MealWeekView() {
  const [week, setWeek] = useWeekParam();
  const queryClient = useQueryClient();
  const key = ['meals', week];
  const plan = useQuery({ queryKey: key, queryFn: () => api.mealPlan(week) });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });

  const save = useMutation({
    mutationFn: (slots: MealSlots) => api.saveMealPlan(week, slots),
    onMutate: async (slots) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MealPlan>(key);
      queryClient.setQueryData<MealPlan>(key, (old) => old && { ...old, slots });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const loading = plan.isLoading || recipes.isLoading;
  const error = plan.error ?? recipes.error;
  const slots = plan.data?.slots;
  const filled = slots ? MEAL_SLOTS.filter((s) => slots[s]).length : 0;
  const recipeById = new Map((recipes.data ?? []).map((r) => [r.id, r]));

  return (
    <>
      <WeekNav week={week} onChange={setWeek} />
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {save.error && <ErrorNote error={save.error} />}

      {slots && recipes.data && (
        <>
          <p className="muted center week-status">
            {filled === 0 ? 'Nothing planned yet' : filled === MEAL_SLOTS.length ? 'All 4 meals planned ✓' : `${filled} of 4 meals planned`}
          </p>
          <ul className="list">
            {MEAL_SLOTS.map((slot) => {
              const recipe = slots[slot] ? recipeById.get(slots[slot]!) : undefined;
              return (
                <li key={slot} className={`row-item meal-slot${recipe ? '' : ' unplanned'}`}>
                  <span className="meal-icon" aria-hidden="true">
                    {SLOT_ICONS[slot]}
                  </span>
                  <label className="row-main">
                    <span className="row-label">{MEAL_SLOT_LABELS[slot]}</span>
                    <select
                      className="slot-select"
                      value={recipe ? recipe.id : ''}
                      disabled={recipes.data.length === 0}
                      onChange={(e) => save.mutate({ ...slots, [slot]: e.target.value || null })}
                    >
                      <option value="">Not planned</option>
                      {recipes.data.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {recipe && (
                      <span className="row-meta">
                        {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </label>
                  {recipe && (
                    <Link to={`/meals/recipes/${recipe.id}`} className="btn btn-small btn-ghost">
                      View
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          {recipes.data.length === 0 ? (
            <div className="card card-center">
              <p>Add your meal-prep recipes with their ingredients, then pick one for each meal.</p>
              <Link to="/meals/recipes/new" className="btn btn-primary">
                Add a recipe
              </Link>
            </div>
          ) : filled > 0 ? (
            <Link to={`/meals/grocery/${week}`} className="btn btn-primary btn-block">
              🛒 Grocery list
            </Link>
          ) : (
            <p className="hint center">Pick at least one meal to build a grocery list.</p>
          )}
        </>
      )}
    </>
  );
}
