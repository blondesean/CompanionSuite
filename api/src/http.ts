// Minimal routing and validation helpers shared by every route.

import type { Member } from '../../shared/types';
import type { Store } from './store';

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSender {
  /** Null when push isn't configured (e.g. local dev). */
  publicKey(): Promise<string | null>;
  /** 'gone' means the subscription is dead and should be deleted. */
  send(subscription: PushSubscriptionJSON, payload: PushPayload): Promise<'sent' | 'gone' | 'failed'>;
}

export interface Deps {
  store: Store;
  members(): Promise<Member[]>;
  push: PushSender;
  now(): Date;
  newId(): string;
}

export interface AppRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
  user: { id: string; name: string };
}

export interface AppResponse {
  status: number;
  body?: unknown;
}

export interface RouteContext extends AppRequest {
  params: Record<string, string>;
  deps: Deps;
}

type Handler = (ctx: RouteContext) => Promise<unknown>;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (what: string) => new HttpError(404, `${what} not found`);

export class Router {
  private routes: { method: string; parts: string[]; handler: Handler }[] = [];

  on(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  async handle(req: AppRequest, deps: Deps): Promise<AppResponse> {
    const segments = req.path.split('/').filter(Boolean).map(decodeURIComponent);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.parts.length !== segments.length) continue;
      const params: Record<string, string> = {};
      const matches = route.parts.every((part, i) => {
        if (part.startsWith(':')) {
          params[part.slice(1)] = segments[i];
          return true;
        }
        return part === segments[i];
      });
      if (!matches) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;

      try {
        const result = await route.handler({ ...req, params, deps });
        return result === undefined ? { status: 204 } : { status: 200, body: result };
      } catch (err) {
        if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
        console.error('Unhandled error', req.method, req.path, err);
        return { status: 500, body: { error: 'Something went wrong' } };
      }
    }

    return pathMatched
      ? { status: 405, body: { error: 'Method not allowed' } }
      : { status: 404, body: { error: 'Not found' } };
  }
}

// ---------- validation ----------

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('Expected a JSON object');
  return value as Record<string, unknown>;
}

export function str(value: unknown, field: string, { min = 0, max = 200 } = {}): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(min === 1 ? `${field} is required` : `${field} is too short`);
  if (trimmed.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

export function num(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw badRequest(`${field} must be a number from ${min} to ${max}`);
  }
  return value;
}

export function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw badRequest(`${field} must be a date/time`);
  return new Date(value).toISOString();
}

/** Removes storage-only fields before sending an item to the client. */
export function clean<T extends object>(item: T): Omit<T, 'pk' | 'sk' | 'reminderKeys'> {
  const { pk: _pk, sk: _sk, reminderKeys: _r, ...rest } = item as Record<string, unknown>;
  return rest as Omit<T, 'pk' | 'sk' | 'reminderKeys'>;
}
