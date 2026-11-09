import { createHash } from 'node:crypto';
import { buildChoreWeek, isChoreDue } from '../../shared/chores';
import { REMINDER_MINUTES } from '../../shared/reminders';
import {
  MEAL_SLOTS,
  UNITS,
  type Chore,
  type ChoreInput,
  type Completion,
  type MealPlan,
  type MealSlots,
  type Recipe,
  type RecipeInput,
  type Summary,
  type TodoInput,
  type Unit,
} from '../../shared/types';
import { addWeeks, currentWeek, isWeekStart } from '../../shared/weeks';
import {
  asObject,
  badRequest,
  clean,
  int,
  isoTimestamp,
  notFound,
  num,
  Router,
  str,
  type Deps,
  type PushSubscriptionJSON,
} from './http';
import { clearReminders, sendToMember, syncReminders, type StoredTodo } from './reminders';
import { MAX_SUFFIX } from './store';

export const router = new Router();

// ---------- helpers ----------

function weekParam(value: string | undefined, field = 'week'): string {
  if (!isWeekStart(value)) throw badRequest(`${field} must be a Monday in YYYY-MM-DD format`);
  return value;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

async function memberIds(deps: Deps): Promise<Set<string>> {
  return new Set((await deps.members()).map((m) => m.id));
}

// ---------- members & summary ----------

router.on('GET', '/members', async ({ deps }) => (await deps.members()).sort(byName));

router.on('GET', '/me', async ({ user }) => user);

router.on('GET', '/summary', async ({ query, deps }): Promise<Summary> => {
  const week = query.week ? weekParam(query.week) : currentWeek(deps.now());
  const [chores, completions, todos, plan] = await Promise.all([
    deps.store.query<Chore>('CHORE'),
    deps.store.query<Completion>('COMPLETION', { beginsWith: `${week}#` }),
    deps.store.query<StoredTodo>('TODO'),
    deps.store.get<MealPlan>('MEALPLAN', week),
  ]);
  const due = chores.filter((c) => isChoreDue(c, week));
  const done = new Set(completions.map((c) => c.choreId));
  const now = deps.now().toISOString();
  return {
    choresDue: due.length,
    choresLeft: due.filter((c) => !done.has(c.id)).length,
    mealsPlanned: plan ? MEAL_SLOTS.filter((s) => plan.slots[s]).length : 0,
    todosOpen: todos.length,
    todosOverdue: todos.filter((t) => t.dueAt && t.dueAt < now).length,
  };
});

// ---------- chores ----------

function parseChore(body: unknown): ChoreInput {
  const o = asObject(body);
  if (!isWeekStart(o.startWeek)) throw badRequest('Start week must be a Monday');
  return {
    name: str(o.name, 'Name', { min: 1, max: 80 }),
    cadenceWeeks: int(o.cadenceWeeks ?? 1, 'Cadence', 1, 52),
    startWeek: o.startWeek,
  };
}

router.on('GET', '/chores', async ({ deps }) => (await deps.store.query<Chore>('CHORE')).map(clean).sort(byName));

router.on('POST', '/chores', async ({ body, deps }) => {
  const chore: Chore = { ...parseChore(body), id: deps.newId(), createdAt: deps.now().toISOString() };
  await deps.store.put('CHORE', chore.id, chore);
  return chore;
});

router.on('PUT', '/chores/:id', async ({ params, body, deps }) => {
  const existing = await deps.store.get<Chore>('CHORE', params.id);
  if (!existing) throw notFound('Chore');
  const chore: Chore = { ...clean(existing), ...parseChore(body) };
  await deps.store.put('CHORE', chore.id, chore);
  return chore;
});

router.on('DELETE', '/chores/:id', async ({ params, deps }) => {
  await deps.store.delete('CHORE', params.id);
});

router.on('GET', '/chores/week/:week', async ({ params, deps }) => {
  const week = weekParam(params.week);
  const [chores, completions] = await Promise.all([
    deps.store.query<Chore>('CHORE'),
    // A year of history is plenty to find "who did it last time".
    deps.store.query<Completion>('COMPLETION', { gte: addWeeks(week, -52), lte: `${week}#${MAX_SUFFIX}` }),
  ]);
  return buildChoreWeek(chores.map(clean), week, completions.map(clean));
});

router.on('PUT', '/chores/:id/completions/:week', async ({ params, body, deps }) => {
  const week = weekParam(params.week);
  const chore = await deps.store.get<Chore>('CHORE', params.id);
  if (!chore) throw notFound('Chore');
  const { completedBy } = asObject(body);
  if (typeof completedBy !== 'string' || !(await memberIds(deps)).has(completedBy)) {
    throw badRequest('completedBy must be a household member');
  }
  const completion: Completion = {
    choreId: chore.id,
    choreName: chore.name,
    week,
    completedBy,
    completedAt: deps.now().toISOString(),
  };
  await deps.store.put('COMPLETION', `${week}#${chore.id}`, completion);
  return completion;
});

router.on('DELETE', '/chores/:id/completions/:week', async ({ params, deps }) => {
  await deps.store.delete('COMPLETION', `${weekParam(params.week)}#${params.id}`);
});

router.on('GET', '/completions', async ({ query, deps }) => {
  const to = query.to ? weekParam(query.to, 'to') : currentWeek(deps.now());
  const from = query.from ? weekParam(query.from, 'from') : addWeeks(to, -11);
  const items = await deps.store.query<Completion>('COMPLETION', {
    gte: from,
    lte: `${to}#${MAX_SUFFIX}`,
    reverse: true,
  });
  return items.map(clean);
});

// ---------- recipes ----------

function parseRecipe(body: unknown): RecipeInput {
  const o = asObject(body);
  if (!Array.isArray(o.ingredients)) throw badRequest('Ingredients must be a list');
  if (o.ingredients.length > 100) throw badRequest('A recipe can have at most 100 ingredients');
  const ingredients = o.ingredients.map((raw, i) => {
    const ing = asObject(raw);
    const label = `Ingredient ${i + 1}`;
    if (!UNITS.includes(ing.unit as Unit)) throw badRequest(`${label}: unknown unit`);
    return {
      name: str(ing.name, `${label} name`, { min: 1, max: 80 }),
      quantity: num(ing.quantity, `${label} amount`, 0, 100_000),
      unit: ing.unit as Unit,
    };
  });
  return {
    name: str(o.name, 'Name', { min: 1, max: 100 }),
    ingredients,
    notes: o.notes == null ? '' : str(o.notes, 'Notes', { max: 10_000 }),
  };
}

router.on('GET', '/recipes', async ({ deps }) => (await deps.store.query<Recipe>('RECIPE')).map(clean).sort(byName));

router.on('POST', '/recipes', async ({ body, deps }) => {
  const now = deps.now().toISOString();
  const recipe: Recipe = { ...parseRecipe(body), id: deps.newId(), createdAt: now, updatedAt: now };
  await deps.store.put('RECIPE', recipe.id, recipe);
  return recipe;
});

router.on('PUT', '/recipes/:id', async ({ params, body, deps }) => {
  const existing = await deps.store.get<Recipe>('RECIPE', params.id);
  if (!existing) throw notFound('Recipe');
  const recipe: Recipe = { ...clean(existing), ...parseRecipe(body), updatedAt: deps.now().toISOString() };
  await deps.store.put('RECIPE', recipe.id, recipe);
  return recipe;
});

router.on('DELETE', '/recipes/:id', async ({ params, deps }) => {
  await deps.store.delete('RECIPE', params.id);
});

// ---------- meal plans ----------

const emptySlots = (): MealSlots => ({ breakfast: null, lunch: null, dinner: null, filler: null });

router.on('GET', '/meals/:week', async ({ params, deps }): Promise<MealPlan> => {
  const week = weekParam(params.week);
  const plan = await deps.store.get<MealPlan>('MEALPLAN', week);
  return plan ? clean(plan) : { week, slots: emptySlots(), updatedAt: null, updatedBy: null };
});

router.on('PUT', '/meals/:week', async ({ params, body, user, deps }) => {
  const week = weekParam(params.week);
  const raw = asObject(asObject(body).slots);
  const recipeIds = new Set((await deps.store.query<Recipe>('RECIPE')).map((r) => r.id));
  const slots = emptySlots();
  for (const slot of MEAL_SLOTS) {
    const value = raw[slot];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || !recipeIds.has(value)) throw badRequest(`Unknown recipe for ${slot}`);
    slots[slot] = value;
  }
  const plan: MealPlan = { week, slots, updatedAt: deps.now().toISOString(), updatedBy: user.id };
  await deps.store.put('MEALPLAN', week, plan);
  return plan;
});

// ---------- to-dos ----------

async function parseTodo(body: unknown, deps: Deps): Promise<TodoInput> {
  const o = asObject(body);
  const members = await memberIds(deps);

  const rawAssignees = o.assignees ?? [];
  if (!Array.isArray(rawAssignees)) throw badRequest('Assignees must be a list');
  const assignees = [...new Set(rawAssignees)].map((a) => {
    if (typeof a !== 'string' || !members.has(a)) throw badRequest('Unknown assignee');
    return a;
  });

  const rawReminders = o.reminders ?? [];
  if (!Array.isArray(rawReminders)) throw badRequest('Reminders must be a list');
  const reminders = [...new Set(rawReminders)]
    .map((r) => {
      if (typeof r !== 'number' || !REMINDER_MINUTES.includes(r)) throw badRequest('Unknown reminder option');
      return r;
    })
    .sort((a, b) => a - b);

  return {
    title: str(o.title, 'Title', { min: 1, max: 200 }),
    notes: o.notes == null ? '' : str(o.notes, 'Notes', { max: 2000 }),
    dueAt: o.dueAt == null || o.dueAt === '' ? null : isoTimestamp(o.dueAt, 'Due date'),
    assignees,
    reminders,
  };
}

/** Open to-dos first by due date (no date last), then oldest first. */
function compareTodos(a: StoredTodo, b: StoredTodo): number {
  if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
  if (a.dueAt && !b.dueAt) return -1;
  if (!a.dueAt && b.dueAt) return 1;
  return a.createdAt < b.createdAt ? -1 : 1;
}

router.on('GET', '/todos', async ({ deps }) =>
  (await deps.store.query<StoredTodo>('TODO')).sort(compareTodos).map(clean),
);

router.on('GET', '/todos/history', async ({ query, deps }) => {
  const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 100, 1), 500) : 200;
  return (await deps.store.query<StoredTodo>('TODO_DONE', { reverse: true, limit })).map(clean);
});

router.on('POST', '/todos', async ({ body, user, deps }) => {
  const now = deps.now().toISOString();
  let todo: StoredTodo = {
    ...(await parseTodo(body, deps)),
    id: deps.newId(),
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completedBy: null,
  };
  todo = await syncReminders(deps, todo);
  await deps.store.put('TODO', todo.id, todo);
  return clean(todo);
});

router.on('PUT', '/todos/:id', async ({ params, body, deps }) => {
  const existing = await deps.store.get<StoredTodo>('TODO', params.id);
  if (!existing) throw notFound('To-do');
  let todo: StoredTodo = { ...existing, ...(await parseTodo(body, deps)), updatedAt: deps.now().toISOString() };
  todo = await syncReminders(deps, todo);
  await deps.store.put('TODO', todo.id, todo);
  return clean(todo);
});

router.on('DELETE', '/todos/:id', async ({ params, deps }) => {
  const existing = await deps.store.get<StoredTodo>('TODO', params.id);
  if (!existing) return;
  await clearReminders(deps, existing);
  await deps.store.delete('TODO', params.id);
});

router.on('POST', '/todos/:id/complete', async ({ params, user, deps }) => {
  const existing = await deps.store.get<StoredTodo>('TODO', params.id);
  if (!existing) throw notFound('To-do');
  await clearReminders(deps, existing);
  const done: StoredTodo = { ...clean(existing), completedAt: deps.now().toISOString(), completedBy: user.id };
  await deps.store.put('TODO_DONE', `${done.completedAt}#${done.id}`, done);
  await deps.store.delete('TODO', done.id);
  return done;
});

router.on('POST', '/todos/:id/reopen', async ({ params, body, deps }) => {
  const completedAt = isoTimestamp(asObject(body).completedAt, 'completedAt');
  const sk = `${completedAt}#${params.id}`;
  const existing = await deps.store.get<StoredTodo>('TODO_DONE', sk);
  if (!existing) throw notFound('Completed to-do');
  let todo: StoredTodo = {
    ...clean(existing),
    completedAt: null,
    completedBy: null,
    updatedAt: deps.now().toISOString(),
  };
  todo = await syncReminders(deps, todo);
  await deps.store.put('TODO', todo.id, todo);
  await deps.store.delete('TODO_DONE', sk);
  return clean(todo);
});

// ---------- push notifications ----------

const endpointKey = (memberId: string, endpoint: string) =>
  `${memberId}#${createHash('sha256').update(endpoint).digest('hex').slice(0, 32)}`;

function parseSubscription(value: unknown): PushSubscriptionJSON {
  const o = asObject(value);
  const keys = asObject(o.keys);
  if (typeof o.endpoint !== 'string' || !o.endpoint.startsWith('https://')) throw badRequest('Invalid endpoint');
  return {
    endpoint: o.endpoint,
    keys: { p256dh: str(keys.p256dh, 'p256dh', { min: 1, max: 500 }), auth: str(keys.auth, 'auth', { min: 1, max: 500 }) },
  };
}

router.on('GET', '/push/key', async ({ deps }) => ({ publicKey: await deps.push.publicKey() }));

router.on('POST', '/push/subscriptions', async ({ body, user, deps }) => {
  const subscription = parseSubscription(asObject(body).subscription);
  await deps.store.put('PUSHSUB', endpointKey(user.id, subscription.endpoint), {
    memberId: user.id,
    subscription,
    createdAt: deps.now().toISOString(),
  });
});

router.on('POST', '/push/unsubscribe', async ({ body, user, deps }) => {
  const { endpoint } = asObject(body);
  if (typeof endpoint !== 'string') throw badRequest('endpoint is required');
  await deps.store.delete('PUSHSUB', endpointKey(user.id, endpoint));
});

router.on('POST', '/push/test', async ({ user, deps }) => {
  const sent = await sendToMember(deps, user.id, {
    title: 'CompanionSuite',
    body: 'Notifications are working 🎉',
    url: '/settings',
    tag: 'test',
  });
  return { sent };
});
