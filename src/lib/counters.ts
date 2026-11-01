import type { Counters } from '../types';
import type { Store } from './storage';

const KEY = 'counters';

export function dayKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function fresh(now: Date, prev?: Counters): Counters {
  return {
    day: dayKey(now),
    invitesToday: 0,
    totalInvites: prev?.totalInvites ?? 0,
    llmToday: {},
    llmFailedToday: 0,
    scriptLeft: prev?.scriptLeft ?? null,
  };
}

export async function getCounters(store: Store, now = new Date()): Promise<Counters> {
  const c = await store.get<Counters | null>(KEY, null);
  if (!c) return fresh(now);
  return c.day === dayKey(now) ? c : fresh(now, c);
}

async function mutate(store: Store, now: Date, fn: (c: Counters) => void): Promise<Counters> {
  const c = await getCounters(store, now);
  fn(c);
  await store.set(KEY, c);
  return c;
}

export const bumpInvite = (store: Store, now = new Date()) =>
  mutate(store, now, (c) => {
    c.invitesToday += 1;
    c.totalInvites += 1;
  });

export const bumpLlm = (store: Store, providerId: string, ok: boolean, now = new Date()) =>
  mutate(store, now, (c) => {
    c.llmToday[providerId] = (c.llmToday[providerId] ?? 0) + 1;
    if (!ok) c.llmFailedToday += 1;
  });

export const setScriptLeft = (store: Store, left: number | null, now = new Date()) =>
  mutate(store, now, (c) => {
    c.scriptLeft = left;
  });

export function badgeFor(counters: Counters, queued: number): { text: string; color: string } {
  if (queued > 0) return { text: '!', color: '#d97706' };
  if (counters.invitesToday > 0) return { text: String(counters.invitesToday), color: '#4f46e5' };
  return { text: '', color: '#4f46e5' };
}

export function llmCallsToday(c: Counters): number {
  return Object.values(c.llmToday).reduce((a, b) => a + b, 0);
}
