// Local API for development: same routes as production, but data lives in
// api/.local-data.json, there's no login (the frontend sends x-dev-user),
// and push notifications are printed to the console instead of sent.

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Member } from '../../shared/types';
import { router } from './app';
import type { Deps } from './http';
import { sendDueReminders } from './reminders';
import { MemoryStore } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const names = (process.env.DEV_MEMBERS ?? 'Sean,Partner').split(',').map((n) => n.trim());
const members: Member[] = names.map((name) => ({ id: `dev-${name.toLowerCase()}`, name }));

const deps: Deps = {
  store: new MemoryStore(fileURLToPath(new URL('../.local-data.json', import.meta.url))),
  members: async () => members,
  push: {
    publicKey: async () => null,
    send: async (sub, payload) => {
      console.log(`🔔 [push → ${sub.endpoint.slice(0, 40)}…] ${payload.title}: ${payload.body}`);
      return 'sent';
    },
  },
  now: () => new Date(),
  newId: () => randomUUID(),
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  // Unauthenticated: lets the dev login screen list who can sign in.
  if (req.method === 'GET' && url.pathname === '/dev/members') return send(200, members);

  const user = members.find((m) => m.id === req.headers['x-dev-user']);
  if (!user) return send(401, { error: 'Pick a dev user (x-dev-user header)' });

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    return send(400, { error: 'Body must be JSON' });
  }

  const result = await router.handle(
    {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      user: { id: user.id, name: user.name },
    },
    deps,
  );
  console.log(`${req.method} ${url.pathname}${url.search} → ${result.status} (${user.name})`);
  send(result.status, result.body);
}).listen(PORT, () => {
  console.log(`CompanionSuite dev API on http://localhost:${PORT} — members: ${names.join(', ')}`);
});

// Mimic the production every-minute reminder job.
setInterval(() => {
  sendDueReminders(deps).catch((err) => console.error('Reminder job failed', err));
}, 30_000);
