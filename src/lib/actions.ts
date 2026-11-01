import type { CaptivumRecord, ExtractedDate, PageSnapshot, Reply, Settings } from '../types';
import { bumpInvite, bumpLlm, setScriptLeft } from './counters';
import { deliverRecord } from './deliver';
import { pingProvider, runLlm, type FetchLike, type LlmOutcome } from './llm';
import { extract } from './pipeline';
import type { RecordsApi } from './records';
import { callScript, type ScriptResult } from './script';
import { isScriptConfigured, llmReady, loadSettings, saveSettings, type Store } from './storage';
import { applyDerivedFlags, validateForSend } from './validate';
import { extractUrl } from './url';

export interface ActionDeps {
  store: Store;
  records: RecordsApi;
  fetchPage(url: string): Promise<PageSnapshot>;
  fetchImpl?: FetchLike;
  now?(): Date;
  /** Keeps the extension worker awake while a long task runs. */
  keepAlive?<T>(p: Promise<T>): Promise<T>;
}

export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 * 2 ** Math.max(0, attempts));
}

export function createActions(deps: ActionDeps) {
  const now = () => (deps.now ? deps.now() : new Date());
  const keep = <T>(p: Promise<T>) => (deps.keepAlive ? deps.keepAlive(p) : p);
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((i, init) => fetch(i, init));
  const { store, records } = deps;

  async function runExtract(id: string, url: string): Promise<void> {
    const settings = await loadSettings(store);
    try {
      const res = await extract(url, {
        settings,
        now,
        fetchPage: deps.fetchPage,
        runLlm: llmReady(settings)
          ? async (snap, excerpt) => {
              try {
                const out: LlmOutcome = await runLlm(settings.providers, snap, excerpt, now(), fetchImpl);
                for (const c of out.calls) await bumpLlm(store, c.providerId, c.ok, now());
                return out;
              } catch (e) {
                const calls = (e as { calls?: LlmOutcome['calls'] }).calls ?? [];
                for (const c of calls) await bumpLlm(store, c.providerId, false, now());
                throw e;
              }
            }
          : undefined,
      });
      await records.update(
        id,
        (r) => ({
          ...r,
          name: res.name,
          finalUrl: res.finalUrl,
          dates: res.dates,
          notes: res.notes,
          usedLlm: res.usedLlm,
          status: 'pending',
          error: undefined,
        }),
        now(),
      );
    } catch (e) {
      await records.update(id, (r) => ({ ...r, status: 'error', error: (e as Error).message }), now());
    }
  }

  async function startExtract(input: string): Promise<{ reply: Reply; done?: Promise<void> }> {
    const url = extractUrl(input);
    if (!url) return { reply: { ok: false, error: 'That does not look like a link.' } };
    const existing = (await records.list()).find(
      (r) => (r.url === url || r.finalUrl === url) && r.status !== 'error' && r.status !== 'cancelled',
    );
    if (existing) return { reply: { ok: true, id: existing.id, existing: true } };
    const rec = await records.create(url, now());
    const done = keep(runExtract(rec.id, url));
    return { reply: { ok: true, id: rec.id }, done };
  }

  async function reextract(id: string): Promise<{ reply: Reply; done?: Promise<void> }> {
    const rec = await records.get(id);
    if (!rec) return { reply: { ok: false, error: 'That item no longer exists.' } };
    await records.update(id, (r) => ({ ...r, status: 'extracting', error: undefined }), now());
    return { reply: { ok: true, id }, done: keep(runExtract(id, rec.url)) };
  }

  async function saveDraft(id: string, name: string, dates: ExtractedDate[]): Promise<Reply> {
    const settings = await loadSettings(store);
    const rec = await records.update(
      id,
      (r) =>
        r.status === 'pending'
          ? { ...r, name, dates: dates.map((d) => applyDerivedFlags(d, now(), settings.defaultTz)) }
          : r,
      now(),
    );
    return rec ? { ok: true } : { ok: false, error: 'That item no longer exists.' };
  }

  function callFor(settings: Settings) {
    return (action: 'create' | 'update' | 'cancel', payload: Record<string, unknown>): Promise<ScriptResult> =>
      callScript(settings, action, payload, fetchImpl);
  }

  async function deliver(id: string): Promise<Reply> {
    const settings = await loadSettings(store);
    if (!isScriptConfigured(settings)) {
      return { ok: false, code: 'not_configured', error: 'Link your sender in Settings first.' };
    }
    if (
      settings.senderEmail &&
      settings.receiverEmail &&
      settings.senderEmail.trim().toLowerCase() === settings.receiverEmail.trim().toLowerCase()
    ) {
      return { ok: false, code: 'same_address', error: 'Sender and receiver must be different addresses.' };
    }
    const rec = await records.get(id);
    if (!rec) return { ok: false, error: 'That item no longer exists.' };
    const problems = validateForSend(rec);
    if (problems.length) return { ok: false, code: 'invalid', error: problems.join(' ') };

    await records.update(id, (r) => ({ ...r, status: 'sending', error: undefined }), now());
    return keep(runDelivery(id, settings));
  }

  async function runDelivery(id: string, settings: Settings): Promise<Reply> {
    const rec = await records.get(id);
    if (!rec) return { ok: false, error: 'That item no longer exists.' };
    const out = await deliverRecord(rec, settings, {
      call: callFor(settings),
      now,
      onCreated: async () => {
        await bumpInvite(store, now());
      },
      onQuota: async (left) => {
        await setScriptLeft(store, left, now());
      },
    });
    const next = await records.update(
      id,
      (r) => {
        const attempts = out.record.status === 'queued' ? r.attempts + 1 : 0;
        return {
          ...r,
          delivered: out.record.delivered,
          status: out.record.status,
          error: out.record.error,
          errorCode: out.record.errorCode,
          attempts,
          nextRetryAt:
            out.record.status === 'queued'
              ? new Date(now().getTime() + backoffMinutes(attempts) * 60000).toISOString()
              : undefined,
        };
      },
      now(),
    );
    if (out.errors.length) {
      return { ok: false, code: out.errors[0].code, error: out.errors[0].message, status: next?.status };
    }
    return { ok: true, status: next?.status };
  }

  async function reopen(id: string): Promise<Reply> {
    const rec = await records.update(id, (r) => ({ ...r, status: 'pending', error: undefined, errorCode: undefined }), now());
    return rec ? { ok: true } : { ok: false, error: 'That item no longer exists.' };
  }

  async function cancelInvites(id: string): Promise<Reply> {
    const settings = await loadSettings(store);
    if (!isScriptConfigured(settings)) return { ok: false, code: 'not_configured', error: 'Link your sender in Settings first.' };
    await records.update(
      id,
      (r) => ({ ...r, dates: r.dates.map((d) => ({ ...d, selected: false })), status: 'sending' }),
      now(),
    );
    return keep(runDelivery(id, settings));
  }

  async function retryQueued(force = false): Promise<number> {
    const settings = await loadSettings(store);
    if (!isScriptConfigured(settings)) return 0;
    const due = (await records.list()).filter(
      (r: CaptivumRecord) => r.status === 'queued' && (force || !r.nextRetryAt || new Date(r.nextRetryAt).getTime() <= now().getTime()),
    );
    for (const r of due) {
      await records.update(r.id, (x) => ({ ...x, status: 'sending' }), now());
      await runDelivery(r.id, settings);
    }
    return due.length;
  }

  async function scriptTest(sendInvite: boolean): Promise<Reply> {
    const settings = await loadSettings(store);
    if (!isScriptConfigured(settings)) return { ok: false, code: 'not_configured', error: 'Paste the web app URL and the secret first.' };
    const res = await callScript(settings, 'test', { sendInvite }, fetchImpl);
    if (!res.ok) return { ok: false, code: res.code, error: res.message };
    const d = res.data;
    if (typeof d.sender === 'string' || typeof d.receiver === 'string') {
      await saveSettings(store, {
        ...settings,
        senderEmail: typeof d.sender === 'string' ? d.sender : settings.senderEmail,
        receiverEmail: typeof d.receiver === 'string' ? d.receiver : settings.receiverEmail,
      });
    }
    if (d.quota) await setScriptLeft(store, d.quota.left, now());
    return { ok: true, ...d };
  }

  async function cancelTestInvite(eventId: string): Promise<Reply> {
    const settings = await loadSettings(store);
    const res = await callScript(settings, 'cancel', { eventId }, fetchImpl);
    return res.ok || res.code === 'not_found' ? { ok: true } : { ok: false, code: res.code, error: res.message };
  }

  async function llmTest(providerId: string): Promise<Reply> {
    const settings = await loadSettings(store);
    const p = settings.providers.find((x) => x.id === providerId);
    if (!p) return { ok: false, error: 'Unknown provider.' };
    if (!p.apiKey.trim()) return { ok: false, error: 'Add the API key first.' };
    try {
      const message = await pingProvider(p, fetchImpl);
      return { ok: true, message };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  return { startExtract, reextract, saveDraft, deliver, reopen, cancelInvites, retryQueued, scriptTest, cancelTestInvite, llmTest, remove: (id: string) => records.remove(id) };
}

export type Actions = ReturnType<typeof createActions>;
