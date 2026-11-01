import { fmtWhen } from '../lib/format';
import { allZones } from '../lib/tz';
import type { CaptivumRecord, Counters, ExtractedDate, Flag, Msg, Reply, Settings } from '../types';

type Child = Node | string | null | false | undefined;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') (el as unknown as Attrs)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

export const FLAG_TEXT: Record<Flag, string> = {
  no_timezone: 'The page gives a time but no time zone. Your default is used.',
  year_inferred: 'The year is not written on the page. It was guessed.',
  already_passed: 'This date has already passed.',
  phrase_not_found: 'The source sentence was not found on the page.',
  date_mismatch: 'The AI date differs from the page text. Check it.',
  llm_date_unverified: 'This date could not be checked against the page text.',
  bad_order: 'The start is after the end.',
};

export const BAD_FLAGS: Flag[] = ['already_passed', 'bad_order', 'date_mismatch', 'phrase_not_found'];

export interface Ctx {
  records: CaptivumRecord[];
  settings: Settings;
  counters: Counters;
  flash: { kind: 'good' | 'bad' | 'warn'; text: string } | null;
  addDraft: string;
  settingsMsg: { kind: 'good' | 'bad'; text: string; testEventId?: string } | null;
  setTab(t: 'add' | 'history' | 'settings'): void;
  send(msg: Msg): Promise<Reply>;
  rerender(): void;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  drafts: Map<string, { name: string; dates: ExtractedDate[] }>;
  scheduleSave(id: string): void;
  flushSave(id: string): Promise<void>;
}

export { fmtWhen };

export function statusChip(status: CaptivumRecord['status']): HTMLElement {
  const map: Record<CaptivumRecord['status'], [string, string]> = {
    extracting: ['Reading', ''],
    pending: ['Needs review', 'warn'],
    sending: ['Sending', ''],
    sent: ['Invite sent', 'good'],
    queued: ['Will retry', 'warn'],
    failed: ['Failed', 'bad'],
    cancelled: ['Cancelled', ''],
    error: ['Could not read', 'bad'],
  };
  const [text, cls] = map[status];
  return h('span', { class: `chip ${cls}` }, text);
}

/** A button that asks once more before doing something you cannot take back. */
export function confirmButton(label: string, onConfirm: () => void, cls = 'danger'): HTMLButtonElement {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const b = h('button', { class: cls }, label);
  b.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      b.textContent = 'Sure?';
      timer = setTimeout(() => {
        armed = false;
        b.textContent = label;
      }, 3500);
      return;
    }
    if (timer) clearTimeout(timer);
    onConfirm();
  });
  return b;
}

export type Mood = 'idle' | 'look' | 'happy' | 'dizzy' | 'sleepy';

const INK = '#000330';
const HEAD =
  'M6 41C6 31 10 24 12.5 9L23 19.5C29 18 35 18 41 19.5L51.5 9C54 24 58 31 58 41C58 52.5 46.5 58 32 58C17.5 58 6 52.5 6 41Z';
const BLOB = 'M10 20C14 2 40 -4 58 6C74 16 76 44 62 58C48 70 16 70 4 52C-2 42 4 32 10 20Z';

function eyes(mood: Mood): string {
  const stroke = 'stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none"';
  switch (mood) {
    case 'happy':
      return `<g class="eyes"><path d="M14.5 43Q22 33 29.5 43" ${stroke}/><path d="M34.5 43Q42 33 49.5 43" ${stroke}/></g>`;
    case 'dizzy':
      return `<g class="eyes"><path d="M16 34L28 46M28 34L16 46M36 34L48 46M48 34L36 46" ${stroke}/></g>`;
    case 'sleepy':
      return `<g class="eyes"><path d="M15 42H29M35 42H49" ${stroke}/></g>`;
    default:
      return `<g class="eyes"><circle cx="22" cy="40" r="7.6" fill="#fff"/><circle cx="42" cy="40" r="7.6" fill="#fff"/>` +
        `<circle class="pupil" cx="22" cy="40" r="3.6" fill="${INK}"/><circle class="pupil" cx="42" cy="40" r="3.6" fill="${INK}"/></g>`;
  }
}

/** The Captivum mascot: a black blob cat on a periwinkle blob. */
export function cat(mood: Mood = 'idle', size = 56): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `mascot m-${mood}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Captivum cat');
  wrap.innerHTML =
    `<svg viewBox="-8 -4 80 72" width="${size}" height="${Math.round((size * 72) / 80)}" aria-hidden="true">` +
    `<path d="${BLOB}" fill="#879ee2"/>` +
    `<path d="${HEAD}" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
    eyes(mood) +
    `</svg>`;
  return wrap;
}

export function emptyState(mood: Mood, text: string): HTMLElement {
  return h('div', { class: 'empty' }, cat(mood, 84), h('p', {}, text));
}

/** One shared list of every world time zone, for the zone fields. */
export function ensureTzList(extra: string[] = []): void {
  if (document.getElementById('tzlist')) return;
  const dl = document.createElement('datalist');
  dl.id = 'tzlist';
  for (const t of new Set(['AoE', 'UTC', ...extra, ...allZones()])) {
    const o = document.createElement('option');
    o.value = t;
    dl.append(o);
  }
  document.body.append(dl);
}
