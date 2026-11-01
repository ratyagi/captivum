// Human readable dates for the review card and the invite text.

function fmtDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function fmtClock(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const ap = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ap}`;
}

export interface WhenParts {
  date: string;
  time: string | null;
  tz: string | null;
  startDate: string | null;
  startTime: string | null;
}

export function fmtWhen(d: WhenParts, fallbackTz?: string): string {
  const zone = d.tz ?? fallbackTz ?? '';
  const end = `${fmtDay(d.date)}${d.time ? ', ' + fmtClock(d.time) : ''}${d.time && zone ? ' ' + zone : ''}`;
  if (!d.startDate) return end;
  return `${fmtDay(d.startDate)}${d.startTime ? ', ' + fmtClock(d.startTime) : ''} to ${end}`;
}
