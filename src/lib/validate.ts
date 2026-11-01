import type { CaptivumRecord, ExtractedDate, Flag } from '../types';
import { isPast, isValidDate, isValidTime, resolveTz } from './time';

const DERIVED: Flag[] = ['already_passed', 'bad_order', 'no_timezone'];

/** Recomputes the flags that depend on the current values. Other flags are kept. */
export function applyDerivedFlags(d: ExtractedDate, now: Date, defaultTz: string): ExtractedDate {
  const flags = d.flags.filter((f) => !DERIVED.includes(f));
  const hasTime = !!(d.time || d.startTime);
  if (hasTime && !resolveTz(d.tz)) flags.push('no_timezone');
  if (isValidDate(d.date) && isPast(d, now, defaultTz)) flags.push('already_passed');
  if (d.startDate && isValidDate(d.startDate) && isValidDate(d.date)) {
    const sameDay = d.startDate === d.date;
    if (d.startDate > d.date) flags.push('bad_order');
    else if (sameDay && d.startTime && d.time && d.startTime >= d.time) flags.push('bad_order');
  }
  return { ...d, flags };
}

/** Problems that must be fixed before anything is sent. */
export function validateForSend(rec: Pick<CaptivumRecord, 'name' | 'dates'>): string[] {
  const errors: string[] = [];
  if (!rec.name.trim()) errors.push('Give the opportunity a name.');
  const selected = rec.dates.filter((d) => d.selected);
  if (!selected.length) errors.push('Tick at least one date.');
  for (const d of selected) {
    const who = d.label || 'A date';
    if (!isValidDate(d.date)) errors.push(`${who}: the date is not valid.`);
    if (d.time && !isValidTime(d.time)) errors.push(`${who}: the time is not valid.`);
    if (d.tz && !resolveTz(d.tz)) errors.push(`${who}: the time zone "${d.tz}" is not recognised.`);
    if (d.startDate) {
      if (!isValidDate(d.startDate)) errors.push(`${who}: the start date is not valid.`);
      if (d.flags.includes('bad_order')) errors.push(`${who}: the start is after the end.`);
    }
  }
  return errors;
}
