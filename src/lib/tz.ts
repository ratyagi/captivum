import { resolveTz, to24 } from './time';

const ZONE_WORDS: Record<string, string> = {
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  CET: 'Europe/Paris',
  CEST: 'Europe/Paris',
  BST: 'Europe/London',
  JST: 'Asia/Tokyo',
};

const NAMED_ZONES: Record<string, string> = {
  eastern: 'America/New_York',
  central: 'America/Chicago',
  mountain: 'America/Denver',
  pacific: 'America/Los_Angeles',
};

const NAMED_RE = /\b(Eastern|Pacific|Central|Mountain)(?:\s+(?:Standard|Daylight))?\s+Time\b/i;
const AOE_RE = /(?:\bAoE\b|\bA\.o\.E\.?|\bAnywhere on Earth\b)/i;
const TOKEN_RE =
  /\b(UTC|GMT|PST|PDT|PT|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|CET|CEST|BST|JST)\b(?:\s?([+-])(\d{1,2})(?::?(\d{2}))?)?/;

/** Finds a time zone mention in a short piece of text. */
export function findTz(s: string): string | null {
  if (AOE_RE.test(s)) return 'AoE';
  const named = s.match(NAMED_RE);
  if (named) return NAMED_ZONES[named[1].toLowerCase()];
  const m = s.match(TOKEN_RE);
  if (!m) return null;
  const word = m[1];
  if (word === 'UTC' || word === 'GMT') {
    if (m[2] && m[3]) {
      return `UTC${m[2]}${String(m[3]).padStart(2, '0')}:${m[4] ?? '00'}`;
    }
    return 'UTC';
  }
  return ZONE_WORDS[word] ?? null;
}

/** Accepts anything a model or a person might write and returns a usable zone id, or null. */
export function normalizeTz(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  if (!t) return null;
  const found = findTz(t);
  if (found) return found;
  return resolveTz(t) ? t : null;
}

const CLOCK_RE = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?|\b(\d{1,2})\s*([ap])\.?m\.?\b|\b(23:59|00:00)\b/i;

export interface PageTz {
  tz: string;
  time: string | null;
}

/** Looks for statements such as "All deadlines are 11:59pm AoE". */
export function detectPageTz(text: string): PageTz | null {
  const sentence = text.match(/\ball\s+(?:deadlines?|times?|dates?)\b[^.\n]{0,100}/i);
  if (sentence) {
    const tz = findTz(sentence[0]);
    if (tz) {
      const c = sentence[0].match(CLOCK_RE);
      let time: string | null = null;
      if (c) {
        if (c[1]) time = to24(Number(c[1]), Number(c[2]), c[3]);
        else if (c[4]) time = to24(Number(c[4]), 0, c[5]);
        else if (c[6]) time = c[6];
      }
      return { tz, time };
    }
  }
  if (AOE_RE.test(text)) return { tz: 'AoE', time: null };
  return null;
}
