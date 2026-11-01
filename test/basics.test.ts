import { describe, expect, it } from 'vitest';
import { cleanName, pickName, buildEventTitle } from '../src/lib/title';
import { resolveTz, zonedToUtcMs, addDays, isPast, toIsoUtc } from '../src/lib/time';
import { extractUrl } from '../src/lib/url';
import { buildLlmExcerpt, containsPhrase } from '../src/lib/text';
import { findTz, normalizeTz } from '../src/lib/tz';

describe('title', () => {
  it('strips site names and social wrappers', () => {
    expect(cleanName('AI for Good Hackathon 2027 | Devpost')).toBe('AI for Good Hackathon 2027');
    expect(cleanName('(3) Jane Doe on LinkedIn: Excited to announce the Campus Climate Prize. Applications are open!')).toBe(
      'Excited to announce the Campus Climate Prize.',
    );
    expect(cleanName('Smart-City Challenge - Eventbrite')).toBe('Smart-City Challenge');
    expect(cleanName('Fellowship \u{1F680} for Early Career Researchers')).toBe('Fellowship for Early Career Researchers');
  });
  it('skips blocked pages and falls back', () => {
    expect(pickName({ title: 'Just a moment...', ogTitle: '', h1: 'Open Data Grant', text: '' }).name).toBe('Open Data Grant');
    expect(pickName({ title: '', ogTitle: '', h1: '', text: '' }).name).toBe('');
  });
  it('builds the event title', () => {
    expect(buildEventTitle('Open Data Grant', { label: 'Application window' })).toBe('Open Data Grant: Application window');
  });
});

describe('time', () => {
  it('converts New York wall time during daylight saving', () => {
    const ms = zonedToUtcMs('2027-04-15', '23:59', resolveTz('America/New_York')!);
    expect(toIsoUtc(ms)).toBe('2027-04-16T03:59:00.000Z');
  });
  it('converts winter time', () => {
    const ms = zonedToUtcMs('2027-01-15', '09:00', resolveTz('America/New_York')!);
    expect(toIsoUtc(ms)).toBe('2027-01-15T14:00:00.000Z');
  });
  it('treats AoE as UTC minus 12', () => {
    const ms = zonedToUtcMs('2027-03-03', '23:59', resolveTz('AoE')!);
    expect(toIsoUtc(ms)).toBe('2027-03-04T11:59:00.000Z');
  });
  it('handles fixed offsets and bad zones', () => {
    expect(resolveTz('UTC+05:30')).toEqual({ kind: 'fixed', minutes: 330 });
    expect(resolveTz('Mars/Olympus')).toBeNull();
  });
  it('adds days across month ends', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
  });
  it('knows when a date has passed', () => {
    const now = new Date('2027-02-01T12:00:00Z');
    expect(isPast({ date: '2027-01-31', time: null, tz: null }, now, 'UTC')).toBe(true);
    expect(isPast({ date: '2027-02-01', time: null, tz: null }, now, 'UTC')).toBe(false);
    expect(isPast({ date: '2027-02-01', time: '11:00', tz: 'UTC' }, now, 'UTC')).toBe(true);
  });
});

describe('tz', () => {
  it('finds zones in short text', () => {
    expect(findTz('11:59 PM EST')).toBe('America/New_York');
    expect(findTz('5pm Eastern Time')).toBe('America/New_York');
    expect(findTz('23:59 UTC+2')).toBe('UTC+02:00');
    expect(findTz('(AoE)')).toBe('AoE');
    expect(findTz('March 3')).toBeNull();
  });
  it('normalises model output', () => {
    expect(normalizeTz('Anywhere on Earth')).toBe('AoE');
    expect(normalizeTz('Europe/Berlin')).toBe('Europe/Berlin');
    expect(normalizeTz('nonsense zone')).toBeNull();
  });
});

describe('url', () => {
  it('finds the link in pasted text and removes tracking', () => {
    expect(extractUrl('Look at this! https://example.com/grant?utm_source=x&id=4, wow')).toBe('https://example.com/grant?id=4');
    expect(extractUrl('example.org/cfp')).toBe('https://example.org/cfp');
    expect(extractUrl('https://x.com/user/status/1?s=20&t=abc')).toBe('https://x.com/user/status/1');
    expect(extractUrl('not a link')).toBeNull();
    expect(extractUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('text', () => {
  it('matches phrases loosely', () => {
    expect(containsPhrase('Deadline:  March 3,\n2027 (AoE)', 'march 3, 2027')).toBe(true);
    expect(containsPhrase('Nothing', 'March 3')).toBe(false);
  });
  it('keeps windows around dates in long text', () => {
    const text = 'a'.repeat(20000) + ' Deadline March 3, 2027 ' + 'b'.repeat(20000);
    const out = buildLlmExcerpt(text, [20010]);
    expect(out.length).toBeLessThanOrEqual(12000);
    expect(out).toContain('March 3, 2027');
  });
});
