import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { formatQuantity, parseQuantity } from '../../../../shared/grocery';
import { UNITS, type Ingredient, type Recipe, type RecipeInput, type Unit } from '../../../../shared/types';
import { api } from '../../api';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';

interface Row {
  key: number;
  quantity: string;
  unit: Unit;
  name: string;
}

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, quantity: '', unit: 'each', name: '' });
const toRow = (i: Ingredient): Row => ({ key: nextKey++, quantity: formatPlain(i.quantity), unit: i.unit, name: i.name });

/** Plain decimals for editing (the input needs "1.5", not "1½"). */
function formatPlain(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function RecipeEditor() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });
  const recipe = recipes.data?.find((r) => r.id === id);

  return (
    <main className="page module-meals">
      <PageHeader title={isNew ? 'New recipe' : 'Recipe'} back="/meals/recipes" />
      {recipes.isLoading && <Loading />}
      {recipes.error && <ErrorNote error={recipes.error} />}
      {recipes.data && !isNew && !recipe && <ErrorNote error={new Error('This recipe was deleted.')} />}
      {recipes.data && (isNew || recipe) && <RecipeForm key={id} recipe={recipe ?? null} allRecipes={recipes.data} />}
    </main>
  );
}

function RecipeForm({ recipe, allRecipes }: { recipe: Recipe | null; allRecipes: Recipe[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(recipe?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    recipe && recipe.ingredients.length ? recipe.ingredients.map(toRow) : [blankRow(), blankRow(), blankRow()],
  );
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const focusKey = useRef<number | null>(null);

  // Suggest ingredient names already used elsewhere so totals merge nicely.
  const knownIngredients = useMemo(
    () => [...new Set(allRecipes.flatMap((r) => r.ingredients.map((i) => i.name)))].sort((a, b) => a.localeCompare(b)),
    [allRecipes],
  );

  useEffect(() => {
    if (focusKey.current === null) return;
    document.querySelector<HTMLInputElement>(`[data-row="${focusKey.current}"]`)?.focus();
    focusKey.current = null;
  }, [rows]);

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    navigate('/meals/recipes');
  };
  const save = useMutation({
    mutationFn: (input: RecipeInput) => (recipe ? api.updateRecipe(recipe.id, input) : api.createRecipe(input)),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api.deleteRecipe(recipe!.id), onSuccess: done });

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    const row = blankRow();
    focusKey.current = row.key;
    setRows((rs) => [...rs, row]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const ingredients: Ingredient[] = [];
    for (const row of rows) {
      const ingName = row.name.trim();
      if (!ingName && !row.quantity.trim()) continue; // empty row
      if (!ingName) return setFormError('Every ingredient with an amount needs a name.');
      const quantity = parseQuantity(row.quantity);
      if (quantity === null) return setFormError(`Check the amount for “${ingName}” (e.g. 2, 1.5 or 1/2).`);
      ingredients.push({ name: ingName, quantity, unit: row.unit });
    }
    save.mutate({ name, ingredients, notes });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Recipe name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. Turkey chili" />
      </label>

      <fieldset className="field">
        <legend>Ingredients</legend>
        <datalist id="known-ingredients">
          {knownIngredients.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="ingredient-head" aria-hidden="true">
          <span>Amount</span>
          <span>Unit</span>
          <span>Ingredient</span>
        </div>
        <ul className="ingredients">
          {rows.map((row) => (
            <li key={row.key} className="ingredient-row">
              <input
                aria-label="Amount"
                inputMode="decimal"
                placeholder="1"
                value={row.quantity}
                data-row={row.key}
                onChange={(e) => update(row.key, { quantity: e.target.value })}
              />
              <select aria-label="Unit" value={row.unit} onChange={(e) => update(row.key, { unit: e.target.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                aria-label="Ingredient"
                list="known-ingredients"
                placeholder="Ingredient"
                value={row.name}
                maxLength={80}
                onChange={(e) => update(row.key, { name: e.target.value })}
              />
              <button
                type="button"
                className="icon-btn icon-btn-small"
                aria-label="Remove ingredient"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : [blankRow()]))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost" onClick={addRow}>
          + Add ingredient
        </button>
        {recipe && recipe.ingredients.some((i) => formatQuantity(i.quantity) !== formatPlain(i.quantity)) && (
          <p className="hint">Amounts like ½ show as decimals while editing.</p>
        )}
      </fieldset>

      <label className="field">
        <span>Notes / instructions (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={10000} />
      </label>

      {formError && <p className="form-error">{formError}</p>}
      {(save.error || remove.error) && <ErrorNote error={save.error ?? remove.error} />}
      <button className="btn btn-primary btn-block" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save recipe'}
      </button>
      {recipe && (
        <button
          type="button"
          className="btn btn-danger-outline btn-block"
          disabled={remove.isPending}
          onClick={() => confirm(`Delete “${recipe.name}”?`) && remove.mutate()}
        >
          Delete recipe
        </button>
      )}
    </form>
  );
}
