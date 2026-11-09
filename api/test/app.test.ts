import { beforeEach, describe, expect, it } from 'vitest';
import type { ChoreWeek, Completion, MealPlan, Recipe, Summary, Todo } from '../../shared/types';
import { router } from '../src/app';
import type { Deps, PushPayload } from '../src/http';
import { sendDueReminders } from '../src/reminders';
import { MemoryStore } from '../src/store';

const SEAN = { id: 'sean', name: 'Sean' };
const PARTNER = { id: 'partner', name: 'Partner' };

let clock: Date;
let deps: Deps;
let pushed: { endpoint: string; payload: PushPayload }[];
let goneEndpoints: Set<string>;

beforeEach(() => {
  clock = new Date('2026-11-04T18:00:00Z'); // Wednesday
  pushed = [];
  goneEndpoints = new Set();
  let n = 0;
  deps = {
    store: new MemoryStore(),
    members: async () => [SEAN, PARTNER],
    push: {
      publicKey: async () => 'test-key',
      send: async (sub, payload) => {
        if (goneEndpoints.has(sub.endpoint)) return 'gone';
        pushed.push({ endpoint: sub.endpoint, payload });
        return 'sent';
      },
    },
    now: () => clock,
    newId: () => `id${++n}`,
  };
});

async function call<T = unknown>(method: string, path: string, body?: unknown, user = SEAN) {
  const url = new URL(path, 'http://x');
  const res = await router.handle(
    { method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, user },
    deps,
  );
  return res as { status: number; body: T };
}

async function ok<T>(method: string, path: string, body?: unknown, user = SEAN): Promise<T> {
  const res = await call<T>(method, path, body, user);
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  return res.body;
}

describe('chores', () => {
  it('tracks weekly completions and history', async () => {
    const vacuum = await ok<{ id: string }>('POST', '/chores', {
      name: 'Vacuum',
      cadenceWeeks: 1,
      startWeek: '2026-10-26',
    });
    await ok('PUT', `/chores/${vacuum.id}/completions/2026-10-26`, { completedBy: 'partner' });
    await ok('PUT', `/chores/${vacuum.id}/completions/2026-11-02`, { completedBy: 'sean' });

    const week = await ok<ChoreWeek>('GET', '/chores/week/2026-11-02');
    expect(week.due).toHaveLength(1);
    expect(week.due[0].completion?.completedBy).toBe('sean');
    expect(week.due[0].last?.completedBy).toBe('partner');

    const summary = await ok<Summary>('GET', '/summary?week=2026-11-02');
    expect(summary).toMatchObject({ choresDue: 1, choresLeft: 0 });

    // Undo, then the week shows it as not done.
    await ok('DELETE', `/chores/${vacuum.id}/completions/2026-11-02`);
    expect((await ok<ChoreWeek>('GET', '/chores/week/2026-11-02')).due[0].completion).toBeNull();

    const history = await ok<Completion[]>('GET', '/completions?from=2026-10-19&to=2026-11-02');
    expect(history.map((c) => c.week)).toEqual(['2026-10-26']);
  });

  it('keeps completion history after the chore is deleted', async () => {
    const chore = await ok<{ id: string }>('POST', '/chores', { name: 'Dust', cadenceWeeks: 1, startWeek: '2026-11-02' });
    await ok('PUT', `/chores/${chore.id}/completions/2026-11-02`, { completedBy: 'sean' });
    await ok('DELETE', `/chores/${chore.id}`);
    const history = await ok<Completion[]>('GET', '/completions?from=2026-11-02&to=2026-11-02');
    expect(history[0].choreName).toBe('Dust');
  });

  it('rejects bad input', async () => {
    expect((await call('POST', '/chores', { name: '', startWeek: '2026-11-02' })).status).toBe(400);
    expect((await call('POST', '/chores', { name: 'X', startWeek: '2026-11-03' })).status).toBe(400);
    expect((await call('POST', '/chores', { name: 'X', cadenceWeeks: 0, startWeek: '2026-11-02' })).status).toBe(400);
    const chore = await ok<{ id: string }>('POST', '/chores', { name: 'X', startWeek: '2026-11-02' });
    expect((await call('PUT', `/chores/${chore.id}/completions/2026-11-02`, { completedBy: 'stranger' })).status).toBe(
      400,
    );
    expect((await call('GET', '/chores/week/2026-11-04')).status).toBe(400);
    expect((await call('GET', '/nope')).status).toBe(404);
    expect((await call('PATCH', '/chores')).status).toBe(405);
  });
});

describe('meals', () => {
  it('saves recipes and weekly plans', async () => {
    const recipe = await ok<Recipe>('POST', '/recipes', {
      name: 'Chili',
      ingredients: [{ name: 'Beans', quantity: 2, unit: 'can' }],
      notes: 'Simmer 1 hour',
    });
    const edited = await ok<Recipe>('PUT', `/recipes/${recipe.id}`, {
      ...recipe,
      ingredients: [...recipe.ingredients, { name: 'Onion', quantity: 1, unit: 'each' }],
    });
    expect(edited.ingredients).toHaveLength(2);
    expect(edited.createdAt).toBe(recipe.createdAt);

    const empty = await ok<MealPlan>('GET', '/meals/2026-11-02');
    expect(empty.slots).toEqual({ breakfast: null, lunch: null, dinner: null, filler: null });

    const plan = await ok<MealPlan>('PUT', '/meals/2026-11-02', { slots: { dinner: recipe.id, lunch: null } });
    expect(plan.slots.dinner).toBe(recipe.id);
    expect((await ok<Summary>('GET', '/summary?week=2026-11-02')).mealsPlanned).toBe(1);

    expect((await call('PUT', '/meals/2026-11-02', { slots: { dinner: 'nope' } })).status).toBe(400);
    expect(
      (await call('POST', '/recipes', { name: 'Bad', ingredients: [{ name: 'X', quantity: 1, unit: 'bucket' }] }))
        .status,
    ).toBe(400);
  });
});

describe('to-dos and reminders', () => {
  async function subscribe(user = SEAN, endpoint = `https://push.example/${user.id}`) {
    await ok('POST', '/push/subscriptions', { subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } }, user);
  }

  it('completes, records history, and reopens', async () => {
    const todo = await ok<Todo>('POST', '/todos', { title: 'Call the vet', assignees: [], reminders: [] });
    expect((await ok<Todo[]>('GET', '/todos')).map((t) => t.title)).toEqual(['Call the vet']);

    const done = await ok<Todo>('POST', `/todos/${todo.id}/complete`, undefined, PARTNER);
    expect(done.completedBy).toBe('partner');
    expect(await ok<Todo[]>('GET', '/todos')).toEqual([]);
    expect((await ok<Todo[]>('GET', '/todos/history'))[0].title).toBe('Call the vet');

    await ok('POST', `/todos/${todo.id}/reopen`, { completedAt: done.completedAt });
    expect(await ok<Todo[]>('GET', '/todos/history')).toEqual([]);
    expect((await ok<Todo[]>('GET', '/todos'))[0].completedAt).toBeNull();
  });

  it('sorts open to-dos by due date with undated last and counts overdue', async () => {
    await ok('POST', '/todos', { title: 'No date' });
    await ok('POST', '/todos', { title: 'Later', dueAt: '2026-11-10T17:00:00Z' });
    await ok('POST', '/todos', { title: 'Overdue', dueAt: '2026-11-01T17:00:00Z' });
    expect((await ok<Todo[]>('GET', '/todos')).map((t) => t.title)).toEqual(['Overdue', 'Later', 'No date']);
    expect((await ok<Summary>('GET', '/summary?week=2026-11-02')).todosOverdue).toBe(1);
  });

  it('sends reminders to the assignee only', async () => {
    await subscribe(SEAN);
    await subscribe(PARTNER);
    await ok('POST', '/todos', {
      title: 'Pay rent',
      dueAt: '2026-11-04T20:00:00Z',
      assignees: ['partner'],
      reminders: [0, 60],
    });

    clock = new Date('2026-11-04T19:00:30Z');
    expect(await sendDueReminders(deps)).toBe(1);
    expect(pushed).toEqual([
      expect.objectContaining({ endpoint: 'https://push.example/partner', payload: expect.objectContaining({ body: 'Due in 1 hour' }) }),
    ]);

    clock = new Date('2026-11-04T20:00:30Z');
    expect(await sendDueReminders(deps)).toBe(1);
    expect(pushed).toHaveLength(2);
    expect(await sendDueReminders(deps)).toBe(0); // nothing sent twice
  });

  it('sends reminders to everyone when unassigned', async () => {
    await subscribe(SEAN);
    await subscribe(PARTNER);
    await ok('POST', '/todos', { title: 'Trash night', dueAt: '2026-11-04T20:00:00Z', reminders: [0] });
    clock = new Date('2026-11-04T20:00:00Z');
    await sendDueReminders(deps);
    expect(pushed.map((p) => p.endpoint).sort()).toEqual(['https://push.example/partner', 'https://push.example/sean']);
  });

  it('cancels reminders when completed or rescheduled', async () => {
    await subscribe(SEAN);
    const a = await ok<Todo>('POST', '/todos', { title: 'A', dueAt: '2026-11-04T20:00:00Z', reminders: [0] });
    const b = await ok<Todo>('POST', '/todos', { title: 'B', dueAt: '2026-11-04T20:00:00Z', reminders: [0] });
    await ok('POST', `/todos/${a.id}/complete`);
    await ok('PUT', `/todos/${b.id}`, { ...b, dueAt: '2026-11-05T20:00:00Z' });

    clock = new Date('2026-11-04T20:01:00Z');
    expect(await sendDueReminders(deps)).toBe(0);
    clock = new Date('2026-11-05T20:00:00Z');
    expect(await sendDueReminders(deps)).toBe(1);
    expect(pushed.map((p) => p.payload.title)).toEqual(['B']);
  });

  it('drops dead push subscriptions', async () => {
    await subscribe(SEAN, 'https://push.example/old-phone');
    goneEndpoints.add('https://push.example/old-phone');
    expect(await ok<{ sent: number }>('POST', '/push/test')).toEqual({ sent: 0 });
    expect(await deps.store.query('PUSHSUB')).toEqual([]);
  });

  it('validates to-do input', async () => {
    expect((await call('POST', '/todos', { title: '' })).status).toBe(400);
    expect((await call('POST', '/todos', { title: 'X', assignees: ['stranger'] })).status).toBe(400);
    expect((await call('POST', '/todos', { title: 'X', reminders: [7] })).status).toBe(400);
    expect((await call('POST', '/todos', { title: 'X', dueAt: 'tomorrow-ish' })).status).toBe(400);
  });
});
