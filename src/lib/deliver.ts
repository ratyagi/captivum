import type { CaptivumRecord, DeliveryInfo, EventPayload, ExtractedDate, Settings } from '../types';
import type { ScriptResult } from './script';
import { fmtWhen } from './format';
import { buildEventTitle } from './title';
import { addDays, resolveTz, toIsoUtc, zonedToUtcMs } from './time';

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Builds the event the script will create. Pure, so it is easy to test. */
export function buildEventPayload(
  rec: Pick<CaptivumRecord, 'id' | 'name' | 'url' | 'finalUrl'>,
  d: ExtractedDate,
  settings: Pick<Settings, 'defaultTz'>,
): EventPayload {
  const title = buildEventTitle(rec.name, d);
  const tz = resolveTz(d.tz) ?? resolveTz(settings.defaultTz) ?? { kind: 'fixed' as const, minutes: 0 };
  const assumedTz = !resolveTz(d.tz);
  const source = rec.finalUrl || rec.url;

  const when = fmtWhen(d, settings.defaultTz);
  const hasClock = !!(d.time || d.startTime);
  const parts: string[] = [`<b>${esc(d.label)}</b>`, esc(when)];
  if (hasClock && assumedTz) {
    parts.push(`<i>The page did not name a time zone, so Captivum assumed ${esc(settings.defaultTz)}. Check the page.</i>`);
  }
  parts.push('', `<b>For</b>`, `<a href="${esc(source)}">${esc(rec.name.trim() || source)}</a>`);
  if (d.rawPhrase) parts.push('', `<b>From the page</b>`, `"${esc(d.rawPhrase)}"`);
  parts.push('', '<i>Added with Captivum</i>');
  const description = parts.join('<br>');

  const base = { title, description, sourceUrl: source };
  let body: Omit<EventPayload, 'requestId'>;

  if (d.startDate) {
    if (!d.startTime) {
      // A period with no start time becomes one all day event across the whole span.
      body = { ...base, allDay: true, startDate: d.startDate, endDate: addDays(d.date, 1) };
    } else {
      const start = zonedToUtcMs(d.startDate, d.startTime, tz);
      const end = zonedToUtcMs(d.date, d.time ?? '23:59', tz);
      body = { ...base, allDay: false, startDateTime: toIsoUtc(start), endDateTime: toIsoUtc(end) };
    }
  } else if (!d.time) {
    body = { ...base, allDay: true, startDate: d.date, endDate: addDays(d.date, 1) };
  } else {
    // A single timed deadline is a 30 minute event that ends at the deadline.
    const end = zonedToUtcMs(d.date, d.time, tz);
    body = { ...base, allDay: false, startDateTime: toIsoUtc(end - 30 * 60000), endDateTime: toIsoUtc(end) };
  }

  const h = hash(JSON.stringify(body));
  return { ...body, requestId: `${rec.id}:${d.id}:${h}` };
}

export function payloadHash(p: EventPayload): string {
  const { requestId: _ignored, ...rest } = p;
  return hash(JSON.stringify(rest));
}

export interface DeliverDeps {
  call(action: 'create' | 'update' | 'cancel', payload: Record<string, unknown>): Promise<ScriptResult>;
  now(): Date;
  onCreated?(quotaLeft: number | null): void | Promise<void>;
  onQuota?(quotaLeft: number): void | Promise<void>;
}

export interface DeliverError {
  dateId: string;
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Brings the calendar in line with the record: creates new events, updates changed ones,
 * cancels ones that were unticked. Safe to run again after a failure.
 */
export async function deliverRecord(
  record: CaptivumRecord,
  settings: Settings,
  deps: DeliverDeps,
): Promise<{ record: CaptivumRecord; errors: DeliverError[] }> {
  const delivered: Record<string, DeliveryInfo> = { ...record.delivered };
  const errors: DeliverError[] = [];

  const note = async (res: ScriptResult) => {
    if (res.ok && res.data.quota) await deps.onQuota?.(res.data.quota.left);
  };

  for (const d of record.dates) {
    const prev = delivered[d.id];

    if (!d.selected) {
      if (!prev) continue;
      const res = await deps.call('cancel', { eventId: prev.eventId, requestId: prev.requestId });
      await note(res);
      if (res.ok || res.code === 'not_found') delete delivered[d.id];
      else errors.push({ dateId: d.id, code: res.code, message: res.message, retryable: res.retryable });
      continue;
    }

    const payload = buildEventPayload(record, d, settings);
    const h = payloadHash(payload);
    if (prev && prev.hash === h) continue;

    let res: ScriptResult;
    let created = false;
    if (prev) {
      res = await deps.call('update', { ...payload, eventId: prev.eventId });
      if (!res.ok && res.code === 'not_found') {
        res = await deps.call('create', { ...payload });
        created = true;
      }
    } else {
      res = await deps.call('create', { ...payload });
      created = true;
    }
    await note(res);
    if (res.ok && typeof res.data.eventId === 'string') {
      delivered[d.id] = {
        eventId: res.data.eventId,
        requestId: payload.requestId,
        sentAt: deps.now().toISOString(),
        hash: h,
      };
      if (created) await deps.onCreated?.(res.data.quota?.left ?? null);
    } else if (!res.ok) {
      errors.push({ dateId: d.id, code: res.code, message: res.message, retryable: res.retryable });
    } else {
      errors.push({ dateId: d.id, code: 'bad_reply', message: 'The script did not return an event id.', retryable: false });
    }
  }

  let status: CaptivumRecord['status'];
  if (errors.length === 0) {
    status = Object.keys(delivered).length ? 'sent' : 'cancelled';
  } else {
    status = errors.every((e) => e.retryable) ? 'queued' : 'failed';
  }
  const first = errors[0];
  return {
    record: {
      ...record,
      delivered,
      status,
      error: first?.message,
      errorCode: first?.code,
    },
    errors,
  };
}
