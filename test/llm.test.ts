import { describe, expect, it } from 'vitest';
import { normalizeLlmOutput, parseLlmJson, runLlm } from '../src/lib/llm';
import type { PageSnapshot, Provider } from '../src/types';

const now = new Date('2027-02-01T12:00:00Z');
const text = 'Quantum Futures Fellowship. Applications close on April 15, 2027 at 5pm PT. Results by June 1, 2027.';

describe('llm output', () => {
  it('parses fenced JSON', () => {
    expect(parseLlmJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLlmJson('Sure! {"a":2} done')).toEqual({ a: 2 });
    expect(parseLlmJson('nope')).toBeNull();
  });

  it('drops dates whose source text is not on the page and flags disagreements', () => {
    const out = normalizeLlmOutput(
      {
        name: 'Quantum Futures Fellowship',
        dates: [
          { type: 'application_deadline', date: '2027-04-15', time: '17:00', timezone: 'PT', start_date: null, start_time: null, raw_phrase: 'April 15, 2027 at 5pm PT' },
          { type: 'notification_date', date: '2027-06-02', time: null, timezone: null, start_date: null, start_time: null, raw_phrase: 'June 1, 2027' },
          { type: 'submission_deadline', date: '2027-05-05', time: null, timezone: null, start_date: null, start_time: null, raw_phrase: 'May 5, 2027' },
          { type: 'bogus', date: '2027-05-05', time: null, timezone: null, start_date: null, start_time: null, raw_phrase: 'April 15, 2027' },
        ],
      },
      text,
      now,
    );
    expect(out.name).toBe('Quantum Futures Fellowship');
    expect(out.dates).toHaveLength(2);
    expect(out.dates[0].tz).toBe('America/Los_Angeles');
    expect(out.dates[0].flags).toEqual([]);
    expect(out.dates[1].flags).toContain('date_mismatch');
  });
});

const snap: PageSnapshot = { url: 'https://e.org/a', finalUrl: 'https://e.org/a', title: 'T', ogTitle: '', h1: '', description: '', siteName: '', text };
const provider = (id: string): Provider => ({ id, name: id, baseUrl: `https://${id}.test/v1`, apiKey: 'k', model: 'm', jsonMode: 'json_schema', enabled: true });
const good = JSON.stringify({
  name: 'Quantum Futures Fellowship',
  dates: [{ type: 'application_deadline', date: '2027-04-15', time: '17:00', timezone: 'PT', start_date: null, start_time: null, raw_phrase: 'April 15, 2027 at 5pm PT' }],
});

describe('provider fallback', () => {
  it('moves to the next provider on a rate limit', async () => {
    const seen: string[] = [];
    const f = async (url: string) => {
      seen.push(url);
      if (url.includes('first.test')) return new Response('slow down', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: good } }] }), { status: 200 });
    };
    const out = await runLlm([provider('first'), provider('second')], snap, text, now, f);
    expect(out.provider).toBe('second');
    expect(out.dates).toHaveLength(1);
    expect(out.errors[0]).toContain('429');
    expect(out.calls).toEqual([
      { providerId: 'first', ok: false },
      { providerId: 'second', ok: true },
    ]);
    expect(seen).toHaveLength(2);
  });

  it('retries once without structured output after a 400', async () => {
    const bodies: string[] = [];
    const f = async (_u: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) return new Response('unsupported', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: good } }] }), { status: 200 });
    };
    const out = await runLlm([provider('only')], snap, text, now, f);
    expect(out.dates).toHaveLength(1);
    expect(bodies[0]).toContain('response_format');
    expect(bodies[1]).not.toContain('response_format');
  });

  it('throws when every provider fails', async () => {
    const f = async () => new Response('no', { status: 500 });
    await expect(runLlm([provider('a'), provider('b')], snap, text, now, f)).rejects.toThrow();
  });
});
