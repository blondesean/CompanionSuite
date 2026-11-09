// Types shared by the frontend and the API.

export interface Member {
  id: string;
  name: string;
  email?: string;
}

// ---------- Chores ----------

export interface ChoreInput {
  name: string;
  /** Due once every N weeks (1 = weekly). */
  cadenceWeeks: number;
  /** Monday (YYYY-MM-DD) of the first week the chore is due. */
  startWeek: string;
}

export interface Chore extends ChoreInput {
  id: string;
  createdAt: string;
}

export interface Completion {
  choreId: string;
  /** Snapshot of the chore name, so history survives renames/deletes. */
  choreName: string;
  /** Monday (YYYY-MM-DD) of the week this completion counts for. */
  week: string;
  completedBy: string;
  completedAt: string;
}

export interface ChoreWeekEntry {
  chore: Chore;
  completion: Completion | null;
  /** Most recent completion from an earlier week. */
  last: Completion | null;
}

export interface ChoreWeek {
  week: string;
  due: ChoreWeekEntry[];
  upcoming: { chore: Chore; nextWeek: string }[];
}

// ---------- Meals ----------

/** Units offered for ingredients: how you actually buy things. */
export const UNITS = ['each', 'can', 'package', 'lb'] as const;
/** Older units, still accepted so recipes saved with them keep working. */
export const LEGACY_UNITS = ['g', 'kg', 'oz', 'ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'clove', 'bunch', 'slice', 'pinch'] as const;
export type Unit = (typeof UNITS)[number] | (typeof LEGACY_UNITS)[number];
export const ALL_UNITS: readonly Unit[] = [...UNITS, ...LEGACY_UNITS];
/** Display label in the unit picker, where it differs from the stored value. */
export const UNIT_LABELS: Partial<Record<Unit, string>> = { lb: 'lbs' };

export interface Ingredient {
  name: string;
  quantity: number;
  unit: Unit;
}

export interface RecipeInput {
  name: string;
  ingredients: Ingredient[];
  notes: string;
}

export interface Recipe extends RecipeInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'filler'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  filler: 'Filler',
};

export type MealSlots = Record<MealSlot, string | null>;

/** Portion multiplier per slot (1 = the recipe as written). */
export type MealScale = Record<MealSlot, number>;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 5;
export const SCALE_STEP = 0.5;

export interface MealPlan {
  week: string;
  slots: MealSlots;
  scale: MealScale;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ---------- To-Do ----------

export const REMINDER_OPTIONS = [
  { minutes: 0, label: 'At due time' },
  { minutes: 15, label: '15 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 10080, label: '1 week before' },
] as const;

export interface TodoInput {
  title: string;
  notes: string;
  /** ISO timestamp (UTC) or null for no due date. */
  dueAt: string | null;
  /** Empty = unassigned (reminders go to everyone). */
  assignees: string[];
  /** Minutes before dueAt to send a reminder. */
  reminders: number[];
}

export interface Todo extends TodoInput {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
}

// ---------- Fun ----------

export const FUN_CATEGORIES = [
  { id: 'date', label: 'Date night', icon: '🍷' },
  { id: 'food', label: 'Food', icon: '🍜' },
  { id: 'activity', label: 'Activity', icon: '🎳' },
  { id: 'trip', label: 'Trip', icon: '✈️' },
  { id: 'home', label: 'At home', icon: '🛋️' },
  { id: 'other', label: 'Other', icon: '✨' },
] as const;
export type FunCategory = (typeof FUN_CATEGORIES)[number]['id'];

export interface FunIdeaInput {
  title: string;
  category: FunCategory;
  notes: string;
}

export interface FunIdea extends FunIdeaInput {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Local date (YYYY-MM-DD) you did it together, or null if still an idea. */
  doneOn: string | null;
  doneBy: string | null;
}

// ---------- Home ----------

export interface Summary {
  choresDue: number;
  choresLeft: number;
  mealsPlanned: number;
  todosOpen: number;
  todosOverdue: number;
  funIdeas: number;
}
