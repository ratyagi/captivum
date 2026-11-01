import * as chrono from 'chrono-node';
import type { DateType, ExtractedDate, PageSnapshot, Provider } from '../types';
import { DATE_TYPES } from '../types';
import { containsPhrase } from './text';
import { defaultLabel } from './title';
import { isValidDate, isValidTime, pad } from './time';
import { normalizeTz } from './tz';

export interface LlmOutput {
  name: string | null;
  dates: ExtractedDate[];
}

export interface LlmOutcome extends LlmOutput {
  provider: string;
  errors: string[];
  /** Provider ids that were called, in order, with success flags. */
  calls: Array<{ providerId: string; ok: boolean }>;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'dates'],
  properties: {
    name: { type: ['string', 'null'] },
    dates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'date', 'time', 'timezone', 'start_date', 'start_time', 'raw_phrase'],
        properties: {
          type: { type: 'string', enum: DATE_TYPES.filter((t) => t !== 'window_start') },
          date: { type: 'string' },
          time: { type: ['string', 'null'] },
          timezone: { type: ['string', 'null'] },
          start_date: { type: ['string', 'null'] },
          start_time: { type: ['string', 'null'] },
          raw_phrase: { type: 'string' },
        },
      },
    },
  },
} as const;

export function buildMessages(snap: Pick<PageSnapshot, 'url' | 'title'>, excerpt: string, now: Date) {
  const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const system = [
    'You extract dates from the text of a web page about an opportunity such as a hackathon, paper call, grant, fellowship or event.',
    'Reply with JSON only, in this shape: {"name": string|null, "dates": [{"type", "date", "time", "timezone", "start_date", "start_time", "raw_phrase"}]}.',
    'Rules:',
    '1. Report only dates the text states. Never guess and never calculate a date.',
    '2. raw_phrase must be copied exactly from the text. Use the shortest span that holds the date, and the time and time zone when they are written next to it.',
    '3. date and start_date use YYYY-MM-DD. time and start_time use 24 hour HH:mm, or null when the text gives no time.',
    '4. timezone is an IANA name, "AoE", or "UTC+HH:MM", exactly as the text implies. Use null if the text does not say.',
    '5. When something runs over a period, put the end in date and the start in start_date. Otherwise start_date is null.',
    `6. type is one of: ${DATE_TYPES.filter((t) => t !== 'window_start').join(', ')}.`,
    '7. name is the name of the opportunity, short and meaningful, without the website name.',
    '8. If the page has no deadline and no event date, return an empty dates list.',
    `Today is ${today}. If a date has no year, use its next occurrence.`,
  ].join('\n');
  const user = `URL: ${snap.url}\nPage title: ${snap.title}\n\nText:\n${excerpt}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseLlmJson(raw: string): unknown | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function ymdOf(c: chrono.ParsedComponents): string {
  return `${c.get('year')}-${pad(c.get('month') as number)}-${pad(c.get('day') as number)}`;
}

/** Turns the model's JSON into dates and checks every one against the page text. */
export function normalizeLlmOutput(obj: unknown, pageText: string, now: Date): LlmOutput {
  const o = (obj ?? {}) as { name?: unknown; dates?: unknown };
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
  const dates: ExtractedDate[] = [];
  const list = Array.isArray(o.dates) ? o.dates : [];
  let n = 0;
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const type = r.type as DateType;
    if (!DATE_TYPES.includes(type)) continue;
    const date = typeof r.date === 'string' ? r.date : '';
    if (!isValidDate(date)) continue;
    const phrase = typeof r.raw_phrase === 'string' ? r.raw_phrase.trim() : '';
    // A date the page does not contain is a guess, so it is dropped.
    if (!phrase || !containsPhrase(pageText, phrase)) continue;

    const time = typeof r.time === 'string' && isValidTime(r.time) ? r.time : null;
    const startDate = typeof r.start_date === 'string' && isValidDate(r.start_date) ? r.start_date : null;
    const startTime = startDate && typeof r.start_time === 'string' && isValidTime(r.start_time) ? r.start_time : null;
    const tz = typeof r.timezone === 'string' ? normalizeTz(r.timezone) : null;

    const flags: ExtractedDate['flags'] = [];
    const check = chrono.en.parse(phrase, now, { forwardDate: true });
    const hit = check.find((c) => c.start.isCertain('day') && c.start.isCertain('month'));
    if (!hit) {
      flags.push('llm_date_unverified');
    } else {
      const last = hit.end ?? hit.start;
      if (ymdOf(last) !== date && ymdOf(hit.start) !== date) flags.push('date_mismatch');
    }

    dates.push({
      id: `l${++n}`,
      type,
      label: defaultLabel(type, !!startDate),
      date,
      time,
      tz,
      startDate,
      startTime,
      rawPhrase: phrase,
      source: 'llm',
      flags,
      selected: false,
    });
  }
  return { name, dates };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function responseFormat(mode: Provider['jsonMode']) {
  if (mode === 'json_schema') {
    return { response_format: { type: 'json_schema', json_schema: { name: 'captivum', strict: true, schema: SCHEMA } } };
  }
  if (mode === 'json_object') return { response_format: { type: 'json_object' } };
  return {};
}

export class LlmError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function callProvider(
  p: Provider,
  messages: Array<{ role: string; content: string }>,
  fetchImpl: FetchLike,
  mode: Provider['jsonMode'] = p.jsonMode,
  timeoutMs = 30000,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${p.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, temperature: 0, messages, ...responseFormat(mode) }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new LlmError(`${p.name} answered ${res.status}. ${detail}`.trim(), res.status);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError(`${p.name} returned no content.`, 0);
    return content;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    const aborted = (e as Error)?.name === 'AbortError';
    throw new LlmError(aborted ? `${p.name} timed out.` : `${p.name} could not be reached.`, 0);
  } finally {
    clearTimeout(timer);
  }
}

async function callWithDowngrade(p: Provider, messages: Array<{ role: string; content: string }>, f: FetchLike) {
  try {
    return await callProvider(p, messages, f);
  } catch (e) {
    // Some models reject structured output. Retry once as plain text.
    if (e instanceof LlmError && e.status === 400 && p.jsonMode !== 'none') {
      return await callProvider(p, messages, f, 'none');
    }
    throw e;
  }
}

/** Tries each enabled provider in order until one returns usable JSON. */
export async function runLlm(
  providers: Provider[],
  snap: PageSnapshot,
  excerpt: string,
  now: Date,
  fetchImpl: FetchLike = fetch,
): Promise<LlmOutcome> {
  const usable = providers.filter((p) => p.enabled && p.apiKey.trim() && p.baseUrl.trim() && p.model.trim());
  const errors: string[] = [];
  const calls: LlmOutcome['calls'] = [];
  if (!usable.length) throw new LlmError('No AI provider is set up.', 0);
  const messages = buildMessages(snap, excerpt, now);
  for (const p of usable) {
    try {
      const raw = await callWithDowngrade(p, messages, fetchImpl);
      const parsed = parseLlmJson(raw);
      if (!parsed) {
        calls.push({ providerId: p.id, ok: false });
        errors.push(`${p.name} did not return valid JSON.`);
        continue;
      }
      calls.push({ providerId: p.id, ok: true });
      const out = normalizeLlmOutput(parsed, snap.text, now);
      return { ...out, provider: p.name, errors, calls };
    } catch (e) {
      calls.push({ providerId: p.id, ok: false });
      errors.push((e as Error).message);
    }
  }
  const err = new LlmError(errors.join(' '), 0);
  (err as LlmError & { calls?: LlmOutcome['calls'] }).calls = calls;
  throw err;
}

/** Cheap check used by the Settings screen. */
export async function pingProvider(p: Provider, fetchImpl: FetchLike = fetch): Promise<string> {
  const raw = await callWithDowngrade(
    p,
    [
      { role: 'system', content: 'Reply with JSON only.' },
      { role: 'user', content: 'Return {"ok": true}.' },
    ],
    fetchImpl,
  );
  const parsed = parseLlmJson(raw) as { ok?: boolean } | null;
  return parsed?.ok ? 'Working.' : 'Reached the provider, but the reply was not the expected JSON.';
}
