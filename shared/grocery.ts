import { MEAL_SLOTS, type ExtraItemInput, type MealScale, type MealSlots, type Recipe } from './types';

export interface GroceryItem {
  /** Stable id for the line (see groceryKey), used for check/remove marks. */
  key: string;
  name: string;
  quantity: number;
  unit: string;
  /** Recipe names, with the portion multiplier when it isn't 1 (e.g. "Chili 1½×"), or "À la carte". */
  recipes: string[];
}

export const EXTRA_LABEL = 'À la carte';

const tidyName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Lines merge when the name (ignoring case/spacing) and unit match. */
export function groceryKey(name: string, unit: string): string {
  return `${tidyName(name).toLowerCase()}|${unit}`;
}

/** Units you can only buy whole, so totals round up (1½ cans → 2 cans). */
const WHOLE_UNITS = new Set(['each', 'can', 'package']);

export const defaultScale = (): MealScale => ({ breakfast: 1, lunch: 1, dinner: 1, filler: 1 });

export function formatScale(scale: number): string {
  return `${formatQuantity(scale)}×`;
}

/**
 * Totals every ingredient used by the week's meals, multiplied by each
 * slot's portion size, plus the week's à la carte items. Lines merge when the
 * name (ignoring case/whitespace) and unit match; different units stay on
 * separate lines. Sorted alphabetically by name.
 */
export function buildGroceryList(
  slots: MealSlots,
  recipes: Recipe[],
  scale: MealScale = defaultScale(),
  extras: ExtraItemInput[] = [],
): GroceryItem[] {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const items = new Map<string, GroceryItem>();

  function add(rawName: string, quantity: number, unit: string, label: string) {
    const name = tidyName(rawName);
    if (!name) return;
    const key = groceryKey(name, unit);
    const existing = items.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (!existing.recipes.includes(label)) existing.recipes.push(label);
    } else {
      items.set(key, { key, name, quantity, unit, recipes: [label] });
    }
  }

  for (const slot of MEAL_SLOTS) {
    const recipeId = slots[slot];
    const recipe = recipeId ? recipesById.get(recipeId) : undefined;
    if (!recipe) continue;
    const factor = scale[slot] ?? 1;
    const label = factor === 1 ? recipe.name : `${recipe.name} ${formatScale(factor)}`;

    for (const ing of recipe.ingredients) add(ing.name, ing.quantity * factor, ing.unit, label);
  }
  for (const extra of extras) add(extra.name, extra.quantity, extra.unit, EXTRA_LABEL);

  for (const item of items.values()) {
    if (WHOLE_UNITS.has(item.unit)) item.quantity = Math.ceil(item.quantity - 1e-9);
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
  lb: 'lbs',
  can: 'cans',
  package: 'packages',
  clove: 'cloves',
  cup: 'cups',
  bunch: 'bunches',
  slice: 'slices',
  pinch: 'pinches',
};

/** "2 cans", "1½ lbs", "½ cup", "3" (for "each"). */
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
