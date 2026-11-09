import type {
  Chore,
  ChoreInput,
  ChoreWeek,
  Completion,
  MealPlan,
  MealSlots,
  Member,
  Recipe,
  RecipeInput,
  Summary,
  Todo,
  TodoInput,
} from '../../shared/types';
import type { AuthClient, User } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let auth: AuthClient;
let onUnauthorized: () => void = () => {};

export function initApi(client: AuthClient, unauthorized: () => void): void {
  auth = client;
  onUnauthorized = unauthorized;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = await auth.authHeaders();
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(auth.config.apiUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Please sign in again.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  devMembers: async (): Promise<User[]> => (await fetch('/api/dev/members')).json(),
  members: () => request<Member[]>('GET', '/members'),
  summary: (week: string) => request<Summary>('GET', `/summary?week=${week}`),

  chores: () => request<Chore[]>('GET', '/chores'),
  createChore: (input: ChoreInput) => request<Chore>('POST', '/chores', input),
  updateChore: (id: string, input: ChoreInput) => request<Chore>('PUT', `/chores/${enc(id)}`, input),
  deleteChore: (id: string) => request<void>('DELETE', `/chores/${enc(id)}`),
  choreWeek: (week: string) => request<ChoreWeek>('GET', `/chores/week/${week}`),
  completeChore: (id: string, week: string, completedBy: string) =>
    request<Completion>('PUT', `/chores/${enc(id)}/completions/${week}`, { completedBy }),
  uncompleteChore: (id: string, week: string) => request<void>('DELETE', `/chores/${enc(id)}/completions/${week}`),
  completions: (from: string, to: string) => request<Completion[]>('GET', `/completions?from=${from}&to=${to}`),

  recipes: () => request<Recipe[]>('GET', '/recipes'),
  createRecipe: (input: RecipeInput) => request<Recipe>('POST', '/recipes', input),
  updateRecipe: (id: string, input: RecipeInput) => request<Recipe>('PUT', `/recipes/${enc(id)}`, input),
  deleteRecipe: (id: string) => request<void>('DELETE', `/recipes/${enc(id)}`),
  mealPlan: (week: string) => request<MealPlan>('GET', `/meals/${week}`),
  saveMealPlan: (week: string, slots: MealSlots) => request<MealPlan>('PUT', `/meals/${week}`, { slots }),

  todos: () => request<Todo[]>('GET', '/todos'),
  todoHistory: () => request<Todo[]>('GET', '/todos/history'),
  createTodo: (input: TodoInput) => request<Todo>('POST', '/todos', input),
  updateTodo: (id: string, input: TodoInput) => request<Todo>('PUT', `/todos/${enc(id)}`, input),
  deleteTodo: (id: string) => request<void>('DELETE', `/todos/${enc(id)}`),
  completeTodo: (id: string) => request<Todo>('POST', `/todos/${enc(id)}/complete`),
  reopenTodo: (id: string, completedAt: string) =>
    request<Todo>('POST', `/todos/${enc(id)}/reopen`, { completedAt }),

  pushKey: () => request<{ publicKey: string | null }>('GET', '/push/key'),
  subscribePush: (subscription: PushSubscriptionJSON) =>
    request<void>('POST', '/push/subscriptions', { subscription }),
  unsubscribePush: (endpoint: string) => request<void>('POST', '/push/unsubscribe', { endpoint }),
  testPush: () => request<{ sent: number }>('POST', '/push/test'),
};
