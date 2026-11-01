import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Runs apps-script/Code.gs against hand made stand-ins for Google's services. */
function boot(opts: { sender?: string; props?: Record<string, string> } = {}) {
  const props: Record<string, string> = { SECRET: 'topsecret', RECEIVER: 'me@uni.edu', CALENDAR_ID: 'cal1', ...(opts.props ?? {}) };
  const events: Record<string, any> = {};
  const log: string[] = [];
  let seq = 0;
  const cache: Record<string, string> = {};
  const ctx: any = {
    console,
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.sender ?? 'me@gmail.com' }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (k in props ? props[k] : null),
        setProperty: (k: string, v: string) => void (props[k] = v),
        deleteProperty: (k: string) => void delete props[k],
        getKeys: () => Object.keys(props),
      }),
    },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache[k] ?? null, put: (k: string, v: string) => void (cache[k] = v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const iso = d.toISOString();
        if (fmt === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
        if (fmt === 'yyyyMMddHH') return iso.slice(0, 13).replace(/[-T]/g, '');
        return iso.slice(0, 10);
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }),
    },
    CalendarApp: { getCalendarsByName: () => [], createCalendar: () => ({ getId: () => 'newcal' }) },
    Calendar: {
      Calendars: { get: () => ({ summary: 'Captivum' }) },
      Events: {
        list: (_c: string, o: any) => ({ items: Object.values(events).filter((e: any) => `captivumRequest=${e.extendedProperties.private.captivumRequest}` === o.privateExtendedProperty) }),
        insert: (res: any, cal: string, o: any) => {
          const id = `e${++seq}`;
          events[id] = { ...res, id, htmlLink: `https://cal/${id}` };
          log.push(`insert ${cal} ${o.sendUpdates}`);
          return events[id];
        },
        patch: (res: any, _c: string, id: string, o: any) => {
          if (!events[id]) throw new Error('Not Found');
          events[id] = { ...events[id], ...res };
          log.push(`patch ${id} ${o.sendUpdates}`);
          return events[id];
        },
        remove: (_c: string, id: string, o: any) => {
          if (!events[id]) throw new Error('Resource has been deleted');
          delete events[id];
          log.push(`remove ${id} ${o.sendUpdates}`);
        },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = (body: object) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { post, events, log, props, ctx };
}

const allDay = { requestId: 'r1', title: 'Grant: Application window', description: 'd', allDay: true, startDate: '2027-03-01', endDate: '2027-04-16', sourceUrl: 'https://e.org/g' };
const timed = { requestId: 'r2', title: 'CFP: Submission deadline', description: 'd', allDay: false, startDateTime: '2027-03-04T11:29:00.000Z', endDateTime: '2027-03-04T11:59:00.000Z', sourceUrl: 'https://e.org/c' };

describe('Code.gs', () => {
  it('answers a browser GET without secrets', () => {
    const { ctx } = boot();
    expect(JSON.parse(ctx.doGet().getContent()).service).toBe('captivum');
  });

  it('rejects a wrong secret and an unset script', () => {
    expect(boot().post({ secret: 'wrong', action: 'quota' }).error).toBe('bad_secret');
    expect(boot({ props: { SECRET: '' } }).post({ secret: 'x', action: 'quota' }).error).toBe('setup_incomplete');
  });

  it('refuses when sender and receiver are the same', () => {
    const r = boot({ sender: 'ME@uni.edu' }).post({ secret: 'topsecret', action: 'test' });
    expect(r.error).toBe('same_address');
  });

  it('checks the connection without sending', () => {
    const { post, log } = boot();
    const r = post({ secret: 'topsecret', action: 'test' });
    expect(r).toMatchObject({ ok: true, sender: 'me@gmail.com', receiver: 'me@uni.edu', calendar: 'Captivum' });
    expect(log).toHaveLength(0);
  });

  it('creates all day and timed events with the receiver as guest', () => {
    const { post, events, log } = boot();
    const a = post({ secret: 'topsecret', action: 'create', ...allDay });
    expect(a.ok).toBe(true);
    expect(events[a.eventId].attendees).toEqual([{ email: 'me@uni.edu' }]);
    expect(events[a.eventId].start).toEqual({ date: '2027-03-01' });
    expect(events[a.eventId].end).toEqual({ date: '2027-04-16' });
    const t = post({ secret: 'topsecret', action: 'create', ...timed });
    expect(events[t.eventId].start.dateTime).toBe('2027-03-04T11:29:00.000Z');
    expect(log).toEqual(['insert cal1 all', 'insert cal1 all']);
    expect(t.quota).toEqual({ used: 2, limit: 100, left: 98 });
  });

  it('does not duplicate a retried request', () => {
    const { post, events } = boot();
    const a = post({ secret: 'topsecret', action: 'create', ...allDay });
    const b = post({ secret: 'topsecret', action: 'create', ...allDay });
    expect(b.eventId).toBe(a.eventId);
    expect(b.duplicate).toBe(true);
    expect(Object.keys(events)).toHaveLength(1);
  });

  it('updates and cancels, and reports a missing event', () => {
    const { post, log } = boot();
    const a = post({ secret: 'topsecret', action: 'create', ...allDay });
    expect(post({ secret: 'topsecret', action: 'update', eventId: a.eventId, ...allDay, endDate: '2027-04-20' }).ok).toBe(true);
    expect(post({ secret: 'topsecret', action: 'update', eventId: 'nope', ...allDay }).error).toBe('not_found');
    expect(post({ secret: 'topsecret', action: 'cancel', eventId: a.eventId }).ok).toBe(true);
    expect(post({ secret: 'topsecret', action: 'cancel', eventId: a.eventId }).alreadyGone).toBe(true);
    expect(log).toContain(`patch ${a.eventId} all`);
    expect(log).toContain(`remove ${a.eventId} all`);
  });

  it('validates input and enforces the daily limit', () => {
    const { post } = boot({ props: { DAILY_LIMIT: '1' } });
    expect(post({ secret: 'topsecret', action: 'create', ...allDay, endDate: '2027-03-01' }).error).toBe('bad_request');
    expect(post({ secret: 'topsecret', action: 'create', ...allDay }).ok).toBe(true);
    expect(post({ secret: 'topsecret', action: 'create', ...timed }).error).toBe('quota');
  });

  it('creates the Captivum calendar once when none is configured', () => {
    const { post, props } = boot({ props: { CALENDAR_ID: '' } });
    delete props.CALENDAR_ID;
    expect(post({ secret: 'topsecret', action: 'test' }).ok).toBe(true);
    expect(props.CALENDAR_ID).toBe('newcal');
  });
});
