import { MEAL_SLOTS, type MealSlots, type Recipe } from './types';

export interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
}

/**
 * Totals every ingredient used by the week's meals. Ingredients merge when
 * the name (ignoring case/whitespace) and unit match; different units stay
 * on separate lines. Sorted alphabetically by name.
 */
export function buildGroceryList(slots: MealSlots, recipes: Recipe[]): GroceryItem[] {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const items = new Map<string, GroceryItem>();

  for (const slot of MEAL_SLOTS) {
    const recipeId = slots[slot];
    const recipe = recipeId ? recipesById.get(recipeId) : undefined;
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const name = ing.name.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = `${name.toLowerCase()}|${ing.unit}`;
      const existing = items.get(key);
      if (existing) {
        existing.quantity += ing.quantity;
        if (!existing.recipes.includes(recipe.name)) existing.recipes.push(recipe.name);
      } else {
        items.set(key, { name, quantity: ing.quantity, unit: ing.unit, recipes: [recipe.name] });
      }
    }
  }

  return [...items.values()].sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.unit.localeCompare(b.unit),
  );
}

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** 1.5 -> "1½", 0.333 -> "⅓", 2.4 -> "2.4". */
export function formatQuantity(quantity: number): string {
  const whole = Math.floor(quantity + 1e-9);
  const frac = quantity - whole;
  if (frac < 0.01) return String(whole);
  const match = FRACTIONS.find(([value]) => Math.abs(frac - value) < 0.01);
  if (match) return whole > 0 ? `${whole}${match[1]}` : match[1];
  return String(Math.round(quantity * 100) / 100);
}

const PLURAL_UNITS: Record<string, string> = {
  can: 'cans',
  clove: 'cloves',
  cup: 'cups',
  bunch: 'bunches',
  slice: 'slices',
  pinch: 'pinches',
  package: 'packages',
};

/** "2 cans", "½ cup", "3" (for "each"). */
export function formatAmount(quantity: number, unit: string): string {
  if (unit === 'each') return formatQuantity(quantity);
  const label = quantity > 1 ? (PLURAL_UNITS[unit] ?? unit) : unit;
  return `${formatQuantity(quantity)} ${label}`;
}

/** Accepts "2", "1.5", "1/2" or "1 1/2". Returns null if unparseable. */
export function parseQuantity(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) {
    const [, w, n, d] = mixed.map(Number);
    return d ? w + n / d : null;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const [, n, d] = fraction.map(Number);
    return d ? n / d : null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function groceryListText(title: string, items: GroceryItem[]): string {
  const lines = items.map((i) => `• ${i.name} — ${formatAmount(i.quantity, i.unit)}`);
  return [title, '', ...lines].join('\n');
}
