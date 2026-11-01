import * as chrono from 'chrono-node';
import type { DateType, ExtractedDate } from '../types';
import { defaultLabel } from './title';
import { detectPageTz, findTz } from './tz';
import { applyDerivedFlags } from './validate';
import { pad, to24 } from './time';

type Kind = 'abstract' | 'full_paper' | 'application' | 'registration' | 'proposal' | 'submission';
type Role = 'start' | 'end' | 'event' | 'notify';

const SPECIFIC_NOUNS: Array<[Kind, RegExp]> = [
  ['abstract', /\babstracts?\b/g],
  ['full_paper', /\b(?:full[- ]?papers?|camera[- ]?ready|final (?:paper|version)|manuscripts?)\b/g],
  ['application', /\b(?:applications?|apply|applying|applicants?)\b/g],
  ['registration', /\b(?:registration|register|registering|sign[- ]?up|rsvp)\b/g],
  ['proposal', /\b(?:proposals?|letters? of intent|loi|pre-?proposals?|concept notes?)\b/g],
];
const GENERIC_NOUN = /\b(?:submissions?|submit|submitted|papers?|entries|entry)\b/g;

const NOTIFY = /\b(?:notifications?|notified|decisions?|acceptance|accepted|results?|announced|announcements?|winners?)\b/g;
const START = /\b(?:opens?|opening|starts?|starting|begins?|beginning|from|launch(?:es)?|available from|kick[- ]?off)\b/g;
const END =
  /\b(?:deadline|due|closes?|closing|ends?|ending|by|until|till|cut-?off|last date|no later than|before|expires?)\b/g;
const EVENT =
  /\b(?:held|takes? place|event dates?|conference dates?|hackathon dates?|will run|runs|hackathon|summit|symposium|conference|festival|meetup|workshop)\b/g;

const MAIN_PRIORITY: DateType[] = [
  'application_deadline',
  'submission_deadline',
  'proposal_deadline',
  'full_paper_deadline',
  'registration_closes',
  'abstract_deadline',
  'event_dates',
];

interface Cand {
  index: number;
  role: Role;
  kind: Kind | null;
  d: ExtractedDate;
}

export interface ParseOutput {
  dates: ExtractedDate[];
  pageTz: string | null;
  matchIndexes: number[];
}

export interface ParseOptions {
  now?: Date;
  defaultTz?: string;
}

function lastIdx(re: RegExp, s: string): number {
  let last = -1;
  for (const m of s.matchAll(re)) last = m.index ?? last;
  return last;
}

function contextBefore(text: string, index: number): string {
  const start = Math.max(0, index - 160);
  const seg = text.slice(start, index);
  const nl = seg.lastIndexOf('\n');
  let line = nl >= 0 ? seg.slice(nl + 1) : seg;
  const cut = Math.max(line.lastIndexOf('. '), line.lastIndexOf('! '), line.lastIndexOf('? '), line.lastIndexOf('; '));
  if (cut >= 0) line = line.slice(cut + 2);
  // The label may sit on the line above, as in a table or a list.
  if (nl >= 0 && line.replace(/[\s:\u2013\u2014\-|\u2022\u00B7*]/g, '').length < 2) {
    const prev = seg
      .slice(0, nl)
      .split('\n')
      .reverse()
      .find((l) => l.trim());
    if (prev) line = prev + ' ' + line;
  }
  return line;
}

function contextAfter(text: string, end: number): string {
  const seg = text.slice(end, end + 70);
  const nl = seg.indexOf('\n');
  return nl >= 0 ? seg.slice(0, nl) : seg;
}

function kindOf(ctx: string): Kind | null {
  let best: Kind | null = null;
  let bestPos = -1;
  for (const [kind, re] of SPECIFIC_NOUNS) {
    const p = lastIdx(re, ctx);
    if (p > bestPos) {
      bestPos = p;
      best = kind;
    }
  }
  if (best) return best;
  return lastIdx(GENERIC_NOUN, ctx) >= 0 ? 'submission' : null;
}

function classify(ctx: string): { role: Role | null; kind: Kind | null } {
  const c = ctx.toLowerCase();
  const pos: Record<Role, number> = {
    notify: lastIdx(NOTIFY, c),
    start: lastIdx(START, c),
    end: lastIdx(END, c),
    event: lastIdx(EVENT, c),
  };
  let role: Role | null = null;
  let best = -1;
  for (const r of ['notify', 'start', 'end', 'event'] as const) {
    if (pos[r] > best) {
      best = pos[r];
      role = r;
    }
  }
  const kind = kindOf(c);
  if (role === 'event' && kind) role = 'end';
  if (!role && kind) role = 'end';
  return { role, kind };
}

function typeFor(role: Role, kind: Kind | null): DateType {
  if (role === 'notify') return 'notification_date';
  if (role === 'event') return 'event_dates';
  if (role === 'start') return 'window_start';
  switch (kind) {
    case 'abstract':
      return 'abstract_deadline';
    case 'full_paper':
      return 'full_paper_deadline';
    case 'application':
      return 'application_deadline';
    case 'registration':
      return 'registration_closes';
    case 'proposal':
      return 'proposal_deadline';
    default:
      return 'submission_deadline';
  }
}

const TRAILING_TIME =
  /^[\s,(\u2013\u2014\-@]*(?:at\s+)?(?:(\d{1,2}):(\d{2})\s*([ap])\.?m\.?|(\d{1,2})\s*([ap])\.?m\.?)/i;

function trailingTime(after: string): string | null {
  const m = after.match(TRAILING_TIME);
  if (!m) return null;
  if (m[1]) return to24(Number(m[1]), Number(m[2]), m[3]);
  return to24(Number(m[4]), 0, m[5]);
}

function ymd(c: chrono.ParsedComponents): string {
  return `${c.get('year')}-${pad(c.get('month') as number)}-${pad(c.get('day') as number)}`;
}

function hm(c: chrono.ParsedComponents): string | null {
  if (!c.isCertain('hour')) return null;
  return `${pad(c.get('hour') as number)}:${pad((c.get('minute') as number) ?? 0)}`;
}

function endsAtDeadline(t: DateType): boolean {
  return t.endsWith('_deadline') || t === 'registration_closes';
}

function dedupe(dates: ExtractedDate[]): ExtractedDate[] {
  const seen = new Set<string>();
  return dates.filter((d) => {
    const k = `${d.type}|${d.startDate}|${d.date}|${d.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function chooseMain(dates: ExtractedDate[]): ExtractedDate[] {
  const out = dates.map((d) => ({ ...d, selected: false }));
  const live = (d: ExtractedDate) => !d.flags.includes('already_passed') && !d.flags.includes('bad_order');
  for (const type of MAIN_PRIORITY) {
    const hits = out.filter((d) => d.type === type && live(d));
    if (hits.length) {
      hits.sort((a, b) => a.date.localeCompare(b.date));
      hits[0].selected = true;
      break;
    }
  }
  return out;
}

export function parseDates(text: string, opts: ParseOptions = {}): ParseOutput {
  const now = opts.now ?? new Date();
  const defaultTz = opts.defaultTz ?? 'UTC';
  const page = detectPageTz(text);
  const results = chrono.en.parse(text, now, { forwardDate: true });
  const matchIndexes: number[] = [];
  const cands: Cand[] = [];
  let n = 0;

  for (const r of results) {
    const s = r.start;
    if (!s.isCertain('day') || !s.isCertain('month')) continue;
    matchIndexes.push(r.index);
    const endIdx = r.index + r.text.length;
    const before = contextBefore(text, r.index);
    const after = contextAfter(text, endIdx);

    let { role, kind } = classify(before);
    if (!role) {
      const a = classify(after.replace(/\b(?:by|from|before|until|till)\b/gi, ' '));
      role = a.role;
      kind = a.kind;
    }
    if (!role) continue;

    const e = r.end ?? null;
    const last = e ?? s;
    const yearCertain = s.isCertain('year') || !!e?.isCertain('year');
    let time = hm(last);
    if (!time) time = trailingTime(after);
    let startTime = e ? hm(s) : null;

    const tz = findTz(r.text + ' ' + after.slice(0, 30)) ?? null;
    const type = typeFor(role, kind);
    const isRange = !!e && (ymd(s) !== ymd(e) || (!!startTime && !!time));
    const date = isRange ? ymd(e as chrono.ParsedComponents) : ymd(last);
    if (!isRange) startTime = null;

    const d: ExtractedDate = {
      id: `d${++n}`,
      type,
      label: defaultLabel(type, isRange),
      date,
      time,
      tz,
      startDate: isRange ? ymd(s) : null,
      startTime: isRange ? startTime : null,
      rawPhrase: r.text,
      source: 'parser',
      flags: yearCertain ? [] : ['year_inferred'],
      selected: false,
    };
    cands.push({ index: r.index, role, kind, d });
  }

  // Pair "opens ..." with the next matching "closes ..." to make one window.
  const consumed = new Set<Cand>();
  for (const s of cands.filter((c) => c.role === 'start' && !c.d.startDate)) {
    const e = cands.find(
      (c) =>
        c.index > s.index &&
        c.role === 'end' &&
        !c.d.startDate &&
        !consumed.has(c) &&
        c.d.date >= s.d.date &&
        (s.kind === null || c.kind === null || c.kind === 'submission' || c.kind === s.kind),
    );
    if (!e) continue;
    e.d.startDate = s.d.date;
    e.d.startTime = s.d.time;
    e.d.startPhrase = s.d.rawPhrase;
    e.d.label = defaultLabel(e.d.type, true);
    consumed.add(s);
  }

  let dates = dedupe(cands.filter((c) => !consumed.has(c)).map((c) => c.d));

  // Time zone and time given once for the whole page.
  dates = dates.map((d) => {
    const out = { ...d };
    if (page) {
      if (!out.tz && (out.time || (page.time && endsAtDeadline(out.type)))) out.tz = page.tz;
      if (!out.time && page.time && endsAtDeadline(out.type)) out.time = page.time;
    }
    return out;
  });

  dates = dates.map((d) => applyDerivedFlags(d, now, defaultTz));
  dates.sort((a, b) => (a.startDate ?? a.date).localeCompare(b.startDate ?? b.date));
  dates = chooseMain(dates);
  return { dates, pageTz: page?.tz ?? null, matchIndexes };
}
