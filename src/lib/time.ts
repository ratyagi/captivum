// Small date and time zone helpers built on Intl. No date library needed.

export type ResolvedTz = { kind: 'iana'; id: string } | { kind: 'fixed'; minutes: number };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s: string | null | undefined): s is string {
  return !!s && TIME_RE.test(s);
}

export function to24(hour: number, minute: number, ap?: string | null): string | null {
  let h = hour;
  if (ap) {
    const pm = ap.toLowerCase().startsWith('p');
    if (h < 1 || h > 12) return null;
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || minute > 59) return null;
  return `${pad(h)}:${pad(minute)}`;
}

export function resolveTz(tz: string | null | undefined): ResolvedTz | null {
  if (!tz) return null;
  const t = tz.trim();
  if (!t) return null;
  if (/^(aoe|anywhere on earth)$/i.test(t)) return { kind: 'fixed', minutes: -720 };
  if (/^(utc|gmt|z)$/i.test(t)) return { kind: 'fixed', minutes: 0 };
  const m = t.match(/^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (m) {
    const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return { kind: 'fixed', minutes: m[1] === '-' ? -mins : mins };
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: t });
    return { kind: 'iana', id: t };
  } catch {
    return null;
  }
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(id: string): Intl.DateTimeFormat {
  let f = dtfCache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: id,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(id, f);
  }
  return f;
}

function ianaOffsetMinutes(ms: number, id: string): number {
  const parts: Record<string, string> = {};
  for (const p of dtf(id).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Converts a wall clock time in a zone to a UTC timestamp in milliseconds. */
export function zonedToUtcMs(date: string, time: string, tz: ResolvedTz): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  if (tz.kind === 'fixed') return guess - tz.minutes * 60000;
  const o1 = ianaOffsetMinutes(guess, tz.id);
  let utc = guess - o1 * 60000;
  const o2 = ianaOffsetMinutes(utc, tz.id);
  if (o2 !== o1) utc = guess - o2 * 60000;
  return utc;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function localDateOf(ms: number, tz: ResolvedTz): string {
  const offset = tz.kind === 'fixed' ? tz.minutes : ianaOffsetMinutes(ms, tz.id);
  const dt = new Date(ms + offset * 60000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface WhenLike {
  date: string;
  time: string | null;
  tz: string | null;
}

/** True when the end of the date has already passed. */
export function isPast(d: WhenLike, now: Date, fallbackTz: string): boolean {
  const tz = resolveTz(d.tz) ?? resolveTz(fallbackTz) ?? { kind: 'fixed' as const, minutes: 0 };
  if (!d.time) return d.date < localDateOf(now.getTime(), tz);
  return zonedToUtcMs(d.date, d.time, tz) < now.getTime();
}

export function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}
