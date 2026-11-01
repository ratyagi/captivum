import { createActions } from './lib/actions';
import { badgeFor, getCounters } from './lib/counters';
import { fetchPageViaTab } from './lib/pageFetch';
import { createRecords } from './lib/records';
import { chromeStore } from './lib/storage';
import type { Msg, Reply } from './types';

const records = createRecords(chromeStore);

// Chrome stops an idle worker after about 30 seconds. Touching an extension API keeps it alive.
function keepAlive<T>(p: Promise<T>): Promise<T> {
  const t = setInterval(() => void chrome.runtime.getPlatformInfo(), 20000);
  return p.finally(() => clearInterval(t));
}

const actions = createActions({ store: chromeStore, records, fetchPage: fetchPageViaTab, keepAlive });

async function handle(msg: Msg): Promise<Reply> {
  switch (msg.type) {
    case 'extract': {
      const { reply } = await actions.startExtract(msg.input);
      return reply;
    }
    case 'saveDraft':
      return actions.saveDraft(msg.id, msg.name, msg.dates);
    case 'deliver':
      return actions.deliver(msg.id);
    case 'reopen':
      return actions.reopen(msg.id);
    case 'cancelInvites':
      return actions.cancelInvites(msg.id);
    case 'delete':
      await actions.remove(msg.id);
      return { ok: true };
    case 'scriptTest':
      return actions.scriptTest(msg.sendInvite);
    case 'cancelTestInvite':
      return actions.cancelTestInvite(msg.eventId);
    case 'llmTest':
      return actions.llmTest(msg.providerId);
    case 'retryNow': {
      const n = await actions.retryQueued(true);
      return { ok: true, retried: n };
    }
    default:
      return { ok: false, error: 'Unknown request.' };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String((e as Error)?.message ?? e) }));
  return true;
});

async function refreshBadge(): Promise<void> {
  const [counters, recs] = await Promise.all([getCounters(chromeStore), records.list()]);
  const queued = recs.filter((r) => r.status === 'queued').length;
  const b = badgeFor(counters, queued);
  await chrome.action.setBadgeText({ text: b.text });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
}

function setup(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  chrome.alarms.create('captivum-retry', { periodInMinutes: 5 });
  void refreshBadge();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'captivum-retry') void actions.retryQueued(false).then(refreshBadge);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.counters || changes.records)) void refreshBadge();
});

// Anything left mid-flight when the worker was killed is marked so the person can retry.
void (async () => {
  const stuck = (await records.list()).filter(
    (r) => (r.status === 'extracting' || r.status === 'sending') && Date.now() - Date.parse(r.updatedAt) > 90000,
  );
  for (const r of stuck) {
    await records.update(r.id, (x) => ({
      ...x,
      status: x.status === 'extracting' ? 'error' : 'queued',
      error: 'Interrupted. Try again.',
    }));
  }
})();
