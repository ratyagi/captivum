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
  IST: 'Asia/Kolkata',
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  ACST: 'Australia/Adelaide',
  AWST: 'Australia/Perth',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
  SGT: 'Asia/Singapore',
  HKT: 'Asia/Hong_Kong',
  KST: 'Asia/Seoul',
  WIB: 'Asia/Jakarta',
  PKT: 'Asia/Karachi',
  SAST: 'Africa/Johannesburg',
  EAT: 'Africa/Nairobi',
  WAT: 'Africa/Lagos',
  WET: 'Europe/Lisbon',
  WEST: 'Europe/Lisbon',
  EET: 'Europe/Helsinki',
  EEST: 'Europe/Helsinki',
  MSK: 'Europe/Moscow',
  BRT: 'America/Sao_Paulo',
  HST: 'Pacific/Honolulu',
  AKST: 'America/Anchorage',
  AKDT: 'America/Anchorage',
};

/** Words people type for a place. */
const ALIASES: Record<string, string> = {
  uk: 'Europe/London',
  'united kingdom': 'Europe/London',
  britain: 'Europe/London',
  england: 'Europe/London',
  india: 'Asia/Kolkata',
  calcutta: 'Asia/Kolkata',
  kiev: 'Europe/Kyiv',
  saigon: 'Asia/Ho_Chi_Minh',
  rangoon: 'Asia/Yangon',
  china: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  japan: 'Asia/Tokyo',
  korea: 'Asia/Seoul',
  germany: 'Europe/Berlin',
  france: 'Europe/Paris',
  spain: 'Europe/Madrid',
  italy: 'Europe/Rome',
  ireland: 'Europe/Dublin',
  singapore: 'Asia/Singapore',
  dubai: 'Asia/Dubai',
  uae: 'Asia/Dubai',
  sydney: 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland',
  nyc: 'America/New_York',
  la: 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  'new york': 'America/New_York',
  chicago: 'America/Chicago',
  'los angeles': 'America/Los_Angeles',
  'sao paulo': 'America/Sao_Paulo',
};

let zoneCache: string[] | null = null;
/** Every time zone the browser knows, as IANA ids. */
export function allZones(): string[] {
  if (zoneCache) return zoneCache;
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    list = [];
  }
  const extra = ['UTC', 'Asia/Kolkata', 'Europe/Kyiv', 'America/Argentina/Buenos_Aires'];
  zoneCache = [...new Set([...list, ...extra])].sort();
  return zoneCache;
}

function key(s: string): string {
  return s.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

function exactCity(input: string): string | null {
  const k = key(input);
  if (!k) return null;
  return allZones().find((z) => key(z.split('/').pop() as string) === k) ?? null;
}

/** Finds a zone from a city name, such as "london" or "new york". */
function byCity(input: string): string[] {
  const k = key(input);
  if (!k) return [];
  const zones = allZones();
  const exact = zones.filter((z) => key(z.split('/').pop() as string) === k);
  if (exact.length) return exact;
  if (k.length < 3) return [];
  return zones.filter((z) => key(z.split('/').pop() as string).startsWith(k) || key(z).includes(k));
}

/**
 * Turns what a person types into a zone id. Accepts IANA ids, abbreviations (EST, IST),
 * offsets (UTC+1), AoE, countries and city names (London, Tokyo, New York).
 */
export function resolveZoneInput(input: string): { tz: string | null; candidates: string[] } {
  const t = (input ?? '').trim();
  if (!t) return { tz: null, candidates: [] };
  const direct = normalizeTz(t);
  if (direct) return { tz: direct, candidates: [] };
  const alias = ALIASES[key(t)];
  if (alias) return { tz: alias, candidates: [] };
  const upper = ZONE_WORDS[t.toUpperCase()];
  if (upper) return { tz: upper, candidates: [] };
  const found = byCity(t);
  return { tz: found[0] ?? null, candidates: found.slice(0, 8) };
}

/** Local clock in a zone, for a quick sanity check in Settings. */
export function nowIn(tz: string, now = new Date()): string {
  const r = resolveTz(tz);
  if (!r) return '';
  if (r.kind === 'iana') {
    return new Intl.DateTimeFormat('en-US', { timeZone: r.id, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(now);
  }
  const d = new Date(now.getTime() + r.minutes * 60000);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
}

const NAMED_ZONES: Record<string, string> = {
  eastern: 'America/New_York',
  central: 'America/Chicago',
  mountain: 'America/Denver',
  pacific: 'America/Los_Angeles',
};

const NAMED_RE = /\b(Eastern|Pacific|Central|Mountain)(?:\s+(?:Standard|Daylight))?\s+Time\b/i;
const AOE_RE = /(?:\bAoE\b|\bA\.o\.E\.?|\bAnywhere on Earth\b)/i;
const TOKEN_RE = new RegExp(
  `\\b(UTC|GMT|${Object.keys(ZONE_WORDS).join('|')})\\b(?:\\s?([+-])(\\d{1,2})(?::?(\\d{2}))?)?`,
);
const CITY_TIME_RE = /\b([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?) (?:local )?time\b/g;

/** Finds a time zone mention in a short piece of text. */
export function findTz(s: string): string | null {
  if (AOE_RE.test(s)) return 'AoE';
  const named = s.match(NAMED_RE);
  if (named) return NAMED_ZONES[named[1].toLowerCase()];
  const m = s.match(TOKEN_RE);
  if (!m) {
    for (const c of s.matchAll(CITY_TIME_RE)) {
      const k = key(c[1]);
      const r = (k.length > 3 ? ALIASES[k] : undefined) ?? exactCity(c[1]);
      if (r) return r;
    }
    return null;
  }
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
