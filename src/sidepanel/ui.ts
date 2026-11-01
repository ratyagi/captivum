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

function fmtDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function fmtClock(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const ap = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ap}`;
}

export function fmtWhen(d: Pick<ExtractedDate, 'date' | 'time' | 'tz' | 'startDate' | 'startTime'>): string {
  const end = `${fmtDay(d.date)}${d.time ? ', ' + fmtClock(d.time) : ''}${d.tz && d.time ? ' ' + d.tz : ''}`;
  if (!d.startDate) return end;
  return `${fmtDay(d.startDate)}${d.startTime ? ', ' + fmtClock(d.startTime) : ''} to ${end}`;
}

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
