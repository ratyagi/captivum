import { getCounters, llmCallsToday } from '../lib/counters';
import { createRecords } from '../lib/records';
import { chromeStore, loadSettings, saveSettings } from '../lib/storage';
import type { Counters, CaptivumRecord, Msg, Reply, Settings } from '../types';
import { renderAdd } from './views/add';
import { renderHistory } from './views/history';
import { renderSettings } from './views/settings';
import { h, type Ctx } from './ui';

type Tab = 'add' | 'history' | 'settings';

const main = document.getElementById('main') as HTMLElement;
const footer = document.getElementById('footer') as HTMLElement;
const tabsEl = document.getElementById('tabs') as HTMLElement;
const recordsApi = createRecords(chromeStore);

let tab: Tab = 'add';
let dirty = false;

const ctx: Ctx = {
  records: [] as CaptivumRecord[],
  settings: undefined as unknown as Settings,
  counters: undefined as unknown as Counters,
  flash: null,
  addDraft: '',
  settingsMsg: null,
  drafts: new Map(),
  setTab(t) {
    tab = t;
    ctx.flash = null;
    render();
  },
  async send(msg: Msg): Promise<Reply> {
    try {
      return (await chrome.runtime.sendMessage(msg)) as Reply;
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  },
  rerender: () => void refresh().then(render),
  async saveSettings(patch) {
    ctx.settings = { ...ctx.settings, ...patch };
    await saveSettings(chromeStore, ctx.settings);
  },
  scheduleSave(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.set(
      id,
      setTimeout(() => void ctx.flushSave(id), 500),
    );
  },
  async flushSave(id) {
    clearTimeout(saveTimers.get(id));
    const d = ctx.drafts.get(id);
    if (d) await ctx.send({ type: 'saveDraft', id, name: d.name, dates: d.dates });
  },
};
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function refresh(): Promise<void> {
  [ctx.records, ctx.settings, ctx.counters] = await Promise.all([recordsApi.list(), loadSettings(chromeStore), getCounters(chromeStore)]);
  // A draft only matters while its card is waiting for review.
  for (const id of [...ctx.drafts.keys()]) {
    const r = ctx.records.find((x) => x.id === id);
    if (!r || r.status !== 'pending') ctx.drafts.delete(id);
  }
}

function renderTabs(): void {
  const defs: Array<[Tab, string]> = [
    ['add', 'Add'],
    ['history', 'History'],
    ['settings', 'Settings'],
  ];
  tabsEl.replaceChildren(
    ...defs.map(([id, label]) => {
      const pending = id === 'add' ? ctx.records.filter((r) => r.status === 'pending').length : 0;
      return h('button', { role: 'tab', 'aria-selected': String(tab === id), onclick: () => ctx.setTab(id) }, label + (pending ? ` (${pending})` : ''));
    }),
  );
}

function renderFooter(): void {
  const c = ctx.counters;
  const llm = llmCallsToday(c);
  footer.replaceChildren(
    h('span', {}, `Today: ${c.invitesToday} invite${c.invitesToday === 1 ? '' : 's'}`),
    h('span', {}, `${llm} AI read${llm === 1 ? '' : 's'}`),
    h('span', {}, c.scriptLeft === null ? 'Invites left: unknown' : `Invites left: ${c.scriptLeft}`),
  );
}

function render(): void {
  dirty = false;
  const scroll = main.scrollTop;
  const view = tab === 'add' ? renderAdd(ctx) : tab === 'history' ? renderHistory(ctx) : renderSettings(ctx);
  main.replaceChildren(view);
  main.scrollTop = scroll;
  renderTabs();
  renderFooter();
}

function typing(): boolean {
  const a = document.activeElement;
  return !!a && main.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
}

chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'local') return;
  await refresh();
  renderFooter();
  renderTabs();
  if (typing()) dirty = true;
  else render();
});

main.addEventListener('focusout', () => {
  setTimeout(() => {
    if (dirty && !typing()) render();
  }, 0);
});

void (async () => {
  await refresh();
  render();
  // Try to prefill the box with a copied link. Chrome may refuse, and that is fine.
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (/^https?:\/\/\S+$/i.test(t) && !ctx.addDraft && tab === 'add') {
      ctx.addDraft = t;
      const el = main.querySelector<HTMLInputElement>('input[type=text]');
      if (el && !el.value) el.value = t;
    }
  } catch {
    /* ignore */
  }
})();
