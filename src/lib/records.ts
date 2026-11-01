import type { CaptivumRecord } from '../types';
import type { Store } from './storage';

const KEY = 'records';
const MAX_RECORDS = 300;

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** All writes go through one queue so two async flows never overwrite each other. */
export function createRecords(store: Store) {
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };

  const readAll = () => store.get<CaptivumRecord[]>(KEY, []);

  return {
    list: readAll,
    async get(id: string): Promise<CaptivumRecord | undefined> {
      return (await readAll()).find((r) => r.id === id);
    },
    create(url: string, now: Date): Promise<CaptivumRecord> {
      return lock(async () => {
        const all = await readAll();
        const iso = now.toISOString();
        const rec: CaptivumRecord = {
          id: newId(),
          url,
          finalUrl: url,
          name: '',
          createdAt: iso,
          updatedAt: iso,
          status: 'extracting',
          attempts: 0,
          dates: [],
          delivered: {},
          notes: [],
          usedLlm: false,
        };
        all.unshift(rec);
        await store.set(KEY, all.slice(0, MAX_RECORDS));
        return rec;
      });
    },
    update(id: string, fn: (r: CaptivumRecord) => CaptivumRecord, now = new Date()): Promise<CaptivumRecord | undefined> {
      return lock(async () => {
        const all = await readAll();
        const i = all.findIndex((r) => r.id === id);
        if (i < 0) return undefined;
        const next = { ...fn(all[i]), id, updatedAt: now.toISOString() };
        all[i] = next;
        await store.set(KEY, all);
        return next;
      });
    },
    remove(id: string): Promise<void> {
      return lock(async () => {
        const all = await readAll();
        await store.set(
          KEY,
          all.filter((r) => r.id !== id),
        );
      });
    },
  };
}

export type RecordsApi = ReturnType<typeof createRecords>;
