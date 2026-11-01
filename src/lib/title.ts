import type { DateType, ExtractedDate, PageSnapshot } from '../types';

const LABELS: Record<DateType, string> = {
  abstract_deadline: 'Abstract deadline',
  full_paper_deadline: 'Full paper deadline',
  application_deadline: 'Application deadline',
  registration_closes: 'Registration closes',
  submission_deadline: 'Submission deadline',
  proposal_deadline: 'Proposal deadline',
  notification_date: 'Notification date',
  event_dates: 'Event dates',
  window_start: 'Opens',
};

const WINDOW_LABELS: Partial<Record<DateType, string>> = {
  abstract_deadline: 'Abstract window',
  full_paper_deadline: 'Full paper window',
  application_deadline: 'Application window',
  registration_closes: 'Registration window',
  submission_deadline: 'Submission window',
  proposal_deadline: 'Proposal window',
  event_dates: 'Event',
  notification_date: 'Notification window',
};

export function defaultLabel(type: DateType, isWindow: boolean): string {
  if (isWindow) return WINDOW_LABELS[type] ?? LABELS[type];
  return LABELS[type];
}

const SOCIAL = /^(.+?)\s+on\s+(?:LinkedIn|X|Twitter|Facebook|Instagram|Threads)\s*[:\-]\s*(.+)$/is;
const SITE_NAMES = /^(linkedin|x|twitter|facebook|instagram|devpost|eventbrite|medium|github|luma|lu\.ma|google forms?)$/i;
const BLOCKED = /^(log ?in|sign ?in|just a moment|access denied|attention required|are you a robot|security check|404|page not found|redirecting)/i;

export function isBlockedTitle(t: string): boolean {
  return BLOCKED.test(t.trim());
}

export function cleanName(raw: string): string {
  let s = (raw || '').replace(/[\p{Extended_Pictographic}️‍]/gu, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\(\d+\)\s*/, '');
  const social = s.match(SOCIAL);
  if (social) s = social[2];
  s = s.replace(/^["“”']+|["“”']+$/g, '').trim();

  // Drop a trailing or leading site name such as "| LinkedIn" or "Devpost - ".
  const parts = s.split(/\s+(?:\||·|–|—|-)\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const useful = parts.filter((p) => !SITE_NAMES.test(p));
    if (useful.length) s = useful[0];
  }

  // Posts are long. Keep the first sentence or line.
  const firstLine = s.split(/\n/)[0];
  const sentence = firstLine.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
  s = sentence.length >= 8 ? sentence : firstLine;

  if (s.length > 80) {
    const cut = s.slice(0, 80);
    const sp = cut.lastIndexOf(' ');
    s = (sp > 40 ? cut.slice(0, sp) : cut).trim();
  }
  return s.replace(/[\s:;,\-–—|]+$/g, '').trim();
}

export function pickName(s: Pick<PageSnapshot, 'title' | 'ogTitle' | 'h1' | 'text'>): { name: string; source: string } {
  const candidates: Array<[string, string]> = [
    ['og:title', s.ogTitle],
    ['title', s.title],
    ['h1', s.h1],
  ];
  for (const [source, raw] of candidates) {
    if (!raw || isBlockedTitle(raw)) continue;
    const name = cleanName(raw);
    if (name.length >= 4 && !SITE_NAMES.test(name)) return { name, source };
  }
  const firstLine = (s.text || '').split('\n').find((l) => l.trim().length >= 8) ?? '';
  const name = cleanName(firstLine);
  return name.length >= 4 ? { name, source: 'text' } : { name: '', source: 'none' };
}

/** Mail apps cut subjects at about 60 characters, so keep the name short enough for the label to show. */
export function shortName(name: string, max = 38): string {
  const n = name.trim();
  if (n.length <= max) return n;
  const cut = n.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 20 ? cut.slice(0, sp) : cut).replace(/[\s:;,\-]+$/, '');
}

export function buildEventTitle(name: string, d: Pick<ExtractedDate, 'label'>): string {
  const n = shortName(name) || 'Opportunity';
  const l = d.label.trim();
  return l ? `${n}: ${l}` : n;
}
