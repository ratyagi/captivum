import { describe, expect, it } from 'vitest';
import { extract, isUnsure } from '../src/lib/pipeline';
import { buildEventPayload, deliverRecord } from '../src/lib/deliver';
import { createActions } from '../src/lib/actions';
import { createRecords } from '../src/lib/records';
import { defaultSettings, memoryStore, saveSettings } from '../src/lib/storage';
import { getCounters } from '../src/lib/counters';
import type { CaptivumRecord, ExtractedDate, PageSnapshot } from '../src/types';
import type { ScriptResult } from '../src/lib/script';

const now = new Date('2027-02-01T12:00:00Z');
const settings = { ...defaultSettings(), defaultTz: 'America/New_York', scriptUrl: 'https://script.google.com/macros/s/x/exec', scriptSecret: 's' };

const page = (text: string, title = 'AI for Good Hackathon 2027 | Devpost'): PageSnapshot => ({
  url: 'https://e.org/h',
  finalUrl: 'https://e.org/h',
  title,
  ogTitle: '',
  h1: '',
  description: '',
  siteName: '',
  text: text + '\n' + 'Lorem ipsum dolor sit amet. '.repeat(12),
});

describe('pipeline', () => {
  it('does not call the AI when the parser is sure', async () => {
    let called = 0;
    const res = await extract('https://e.org/h', {
      settings,
      now: () => now,
      fetchPage: async () => page('Applications open March 1, 2027 and close April 15, 2027 at 11:59 PM EST.'),
      runLlm: async () => {
        called++;
        throw new Error('should not run');
      },
    });
    expect(called).toBe(0);
    expect(res.name).toBe('AI for Good Hackathon 2027');
    expect(res.dates.find((d) => d.selected)?.type).toBe('application_deadline');
  });

  it('asks the AI when the year is missing and merges the answer', async () => {
    const res = await extract('https://e.org/h', {
      settings,
      now: () => now,
      fetchPage: async () => page('Apply by March 3'),
      runLlm: async () => ({
        name: null,
        provider: 'Test',
        errors: [],
        calls: [{ providerId: 't', ok: true }],
        dates: [
          {
            id: 'l1', type: 'application_deadline', label: 'Application deadline', date: '2027-03-03', time: null, tz: null,
            startDate: null, startTime: null, rawPhrase: 'March 3', source: 'llm', flags: [], selected: false,
          },
        ],
      }),
    });
    expect(res.usedLlm).toBe(true);
    expect(res.dates.filter((d) => d.selected)).toHaveLength(1);
    expect(res.dates[0].date).toBe('2027-03-03');
  });

  it('keeps the parser result and says so when the AI fails', async () => {
    const res = await extract('https://e.org/h', {
      settings,
      now: () => now,
      fetchPage: async () => page('Apply by March 3'),
      runLlm: async () => {
        throw new Error('offline');
      },
    });
    expect(res.usedLlm).toBe(false);
    expect(res.notes.join(' ')).toContain('offline');
    expect(res.dates).toHaveLength(1);
  });

  it('flags conflicting deadlines of the same kind', () => {
    const mk = (id: string, date: string): ExtractedDate => ({
      id, type: 'submission_deadline', label: 'Submission deadline', date, time: null, tz: null, startDate: null, startTime: null,
      rawPhrase: date, source: 'parser', flags: [], selected: id === 'a',
    });
    expect(isUnsure([mk('a', '2027-03-01'), mk('b', '2027-03-09')], 'X')).toContain('conflicting');
  });
});

const rec = (dates: ExtractedDate[]): CaptivumRecord => ({
  id: 'r1', url: 'https://e.org/h', finalUrl: 'https://e.org/h', name: 'AI for Good Hackathon', createdAt: '', updatedAt: '',
  status: 'pending', attempts: 0, dates, delivered: {}, notes: [], usedLlm: false,
});
const date = (over: Partial<ExtractedDate>): ExtractedDate => ({
  id: 'd1', type: 'application_deadline', label: 'Application window', date: '2027-04-15', time: null, tz: null,
  startDate: null, startTime: null, rawPhrase: 'April 15', source: 'parser', flags: [], selected: true, ...over,
});

describe('event payloads', () => {
  it('makes a multi day all day event with an exclusive end', () => {
    const p = buildEventPayload(rec([]), date({ startDate: '2027-03-01' }), settings);
    expect(p.allDay).toBe(true);
    expect(p.startDate).toBe('2027-03-01');
    expect(p.endDate).toBe('2027-04-16');
    expect(p.title).toBe('AI for Good Hackathon: Application window');
  });
  it('makes a 30 minute event ending at a timed deadline', () => {
    const p = buildEventPayload(rec([]), date({ label: 'Application deadline', time: '23:59', tz: 'America/New_York' }), settings);
    expect(p.allDay).toBe(false);
    expect(p.endDateTime).toBe('2027-04-16T03:59:00.000Z');
    expect(p.startDateTime).toBe('2027-04-16T03:29:00.000Z');
  });
  it('uses AoE and notes an assumed zone', () => {
    expect(buildEventPayload(rec([]), date({ time: '23:59', tz: 'AoE' }), settings).endDateTime).toBe('2027-04-16T11:59:00.000Z');
    expect(buildEventPayload(rec([]), date({ time: '23:59' }), settings).description).toContain('assumed America/New_York');
  });
});

function fakeScript() {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  let n = 0;
  let mode: 'ok' | 'network' | 'secret' | 'gone' = 'ok';
  return {
    calls,
    setMode: (m: typeof mode) => (mode = m),
    call: async (action: 'create' | 'update' | 'cancel', payload: Record<string, unknown>): Promise<ScriptResult> => {
      calls.push({ action, payload });
      if (mode === 'network') return { ok: false, code: 'network', message: 'offline', retryable: true };
      if (mode === 'secret') return { ok: false, code: 'bad_secret', message: 'nope', retryable: false };
      if (mode === 'gone' && action !== 'create') return { ok: false, code: 'not_found', message: 'gone', retryable: false };
      return { ok: true, data: { eventId: action === 'create' ? `ev${++n}` : String(payload.eventId), quota: { used: n, limit: 100, left: 100 - n } } };
    },
  };
}

describe('delivery', () => {
  it('creates, skips unchanged, updates changed, cancels unticked', async () => {
    const f = fakeScript();
    const deps = { call: f.call, now: () => now };
    let r = rec([date({})]);

    let out = await deliverRecord(r, settings, deps);
    expect(out.record.status).toBe('sent');
    expect(f.calls.map((c) => c.action)).toEqual(['create']);

    r = out.record;
    out = await deliverRecord(r, settings, deps);
    expect(f.calls).toHaveLength(1);

    r = { ...out.record, dates: [date({ date: '2027-04-20' })] };
    out = await deliverRecord(r, settings, deps);
    expect(f.calls.map((c) => c.action)).toEqual(['create', 'update']);

    r = { ...out.record, dates: [date({ date: '2027-04-20', selected: false })] };
    out = await deliverRecord(r, settings, deps);
    expect(f.calls.map((c) => c.action)).toEqual(['create', 'update', 'cancel']);
    expect(out.record.status).toBe('cancelled');
    expect(Object.keys(out.record.delivered)).toHaveLength(0);
  });

  it('recreates an event the person deleted by hand', async () => {
    const f = fakeScript();
    const deps = { call: f.call, now: () => now };
    let out = await deliverRecord(rec([date({})]), settings, deps);
    f.setMode('gone');
    out = await deliverRecord({ ...out.record, dates: [date({ date: '2027-05-01' })] }, settings, deps);
    expect(f.calls.map((c) => c.action)).toEqual(['create', 'update', 'create']);
    expect(out.record.status).toBe('sent');
  });

  it('queues network failures and fails on a bad secret', async () => {
    const f = fakeScript();
    f.setMode('network');
    let out = await deliverRecord(rec([date({})]), settings, { call: f.call, now: () => now });
    expect(out.record.status).toBe('queued');
    f.setMode('secret');
    out = await deliverRecord(rec([date({})]), settings, { call: f.call, now: () => now });
    expect(out.record.status).toBe('failed');
    expect(out.record.errorCode).toBe('bad_secret');
  });
});

describe('actions end to end', () => {
  it('extracts, edits, delivers and counts', async () => {
    const store = memoryStore();
    await saveSettings(store, settings);
    const records = createRecords(store);
    const f = fakeScript();
    const fetchImpl = async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const res = await f.call(body.action, body);
      return new Response(JSON.stringify(res.ok ? { ok: true, ...res.data } : { ok: false, error: res.code, message: res.message }), { status: 200 });
    };
    const actions = createActions({
      store, records, now: () => now, fetchImpl,
      fetchPage: async () => page('Applications open March 1, 2027 and close April 15, 2027 at 11:59 PM EST.'),
    });

    const { reply, done } = await actions.startExtract('check this out https://e.org/h?utm_source=zz');
    expect(reply.ok).toBe(true);
    await done;
    const id = (reply as unknown as { id: string }).id;
    let r = (await records.get(id))!;
    expect(r.status).toBe('pending');
    expect(r.url).toBe('https://e.org/h');

    const dup = await actions.startExtract('https://e.org/h');
    expect((dup.reply as { existing?: boolean }).existing).toBe(true);

    await actions.saveDraft(id, 'AI for Good Hackathon', r.dates);
    const sent = await actions.deliver(id);
    expect(sent.ok).toBe(true);
    r = (await records.get(id))!;
    expect(r.status).toBe('sent');
    const c = await getCounters(store, now);
    expect(c.invitesToday).toBe(1);
    expect(c.scriptLeft).toBe(99);

    const cancelled = await actions.cancelInvites(id);
    expect(cancelled.ok).toBe(true);
    expect((await records.get(id))!.status).toBe('cancelled');
  });

  it('asks to link the sender first', async () => {
    const store = memoryStore();
    const actions = createActions({ store, records: createRecords(store), fetchPage: async () => page('x') });
    const { reply } = await actions.startExtract('https://e.org/z');
    const id = (reply as unknown as { id: string }).id;
    const res = await actions.deliver(id);
    expect(res.ok).toBe(false);
    expect((res as { code?: string }).code).toBe('not_configured');
  });
});

describe('invite wording', () => {
  it('keeps the label visible in a long title and writes a readable body', () => {
    const r = rec([]);
    r.name = 'Mapping propaganda: practices, media and power';
    const p = buildEventPayload(r, date({ type: 'submission_deadline', label: 'Submission deadline', time: '16:43', rawPhrase: 'July 14, 2027 16:43' }), settings);
    expect(p.title).toBe('Mapping propaganda: practices, media: Submission deadline');
    expect(p.title.length).toBeLessThan(62);
    expect(p.description).toContain('<b>Submission deadline</b>');
    expect(p.description).toContain('Thu, Apr 15, 2027, 4:43 PM America/New_York');
    expect(p.description).toContain('did not name a time zone');
    expect(p.description).not.toContain('2027-04-15 16:43');
    expect(p.description).toContain('<a href="https://e.org/h">');
  });
});
