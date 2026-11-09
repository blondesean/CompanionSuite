// A tiny key-value-with-sort-key store. Production uses one DynamoDB table
// (pk + sk); local dev and tests use the in-memory version.

import { readFileSync, writeFileSync } from 'node:fs';

/** Storage keys added to every stored item. */
export type Item = { pk: string; sk: string };

export interface QueryOptions {
  /** sk >= gte */
  gte?: string;
  /** sk <= lte */
  lte?: string;
  beginsWith?: string;
  /** Newest (highest sk) first. */
  reverse?: boolean;
  limit?: number;
}

export interface Store {
  get<T extends object>(pk: string, sk: string): Promise<(T & Item) | undefined>;
  query<T extends object>(pk: string, options?: QueryOptions): Promise<(T & Item)[]>;
  put(pk: string, sk: string, data: object): Promise<void>;
  delete(pk: string, sk: string): Promise<void>;
}

export class MemoryStore implements Store {
  private data = new Map<string, Map<string, Item>>();

  /** Pass a file path to persist between restarts (local dev). */
  constructor(private file?: string) {
    if (!file) return;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Item[];
      for (const item of raw) this.partition(item.pk).set(item.sk, item);
    } catch {
      // No saved data yet.
    }
  }

  private partition(pk: string): Map<string, Item> {
    let p = this.data.get(pk);
    if (!p) this.data.set(pk, (p = new Map()));
    return p;
  }

  private save(): void {
    if (!this.file) return;
    const all = [...this.data.values()].flatMap((p) => [...p.values()]);
    writeFileSync(this.file, JSON.stringify(all, null, 1));
  }

  async get<T extends object>(pk: string, sk: string) {
    const item = this.data.get(pk)?.get(sk);
    return item ? (structuredClone(item) as T & Item) : undefined;
  }

  async query<T extends object>(pk: string, o: QueryOptions = {}) {
    let items = [...(this.data.get(pk)?.values() ?? [])]
      .filter(
        (i) =>
          (o.gte === undefined || i.sk >= o.gte) &&
          (o.lte === undefined || i.sk <= o.lte) &&
          (o.beginsWith === undefined || i.sk.startsWith(o.beginsWith)),
      )
      .sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
    if (o.reverse) items.reverse();
    if (o.limit !== undefined) items = items.slice(0, o.limit);
    return structuredClone(items) as (T & Item)[];
  }

  async put(pk: string, sk: string, data: object) {
    this.partition(pk).set(sk, structuredClone({ ...data, pk, sk }) as Item);
    this.save();
  }

  async delete(pk: string, sk: string) {
    this.data.get(pk)?.delete(sk);
    this.save();
  }
}

/** Highest possible suffix for sort-key range queries. */
export const MAX_SUFFIX = '￿';
