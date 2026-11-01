import type { Settings } from '../types';
import type { FetchLike } from './llm';

export interface ScriptOk {
  ok: true;
  data: {
    eventId?: string;
    quota?: { used: number; limit: number; left: number };
    [k: string]: unknown;
  };
}
export interface ScriptFail {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}
export type ScriptResult = ScriptOk | ScriptFail;

const RETRYABLE = new Set(['network', 'timeout', 'rate_limited', 'script_error', 'server']);

/** Sends one request to the Apps Script web app on the sender account. */
export async function callScript(
  settings: Pick<Settings, 'scriptUrl' | 'scriptSecret'>,
  action: string,
  payload: Record<string, unknown> = {},
  fetchImpl: FetchLike = fetch,
  timeoutMs = 45000,
): Promise<ScriptResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Plain text keeps this a simple request, so there is no CORS preflight.
    const res = await fetchImpl(settings.scriptUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, secret: settings.scriptSecret.trim() }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!json) {
      if (/<html|<!doctype/i.test(text)) {
        return {
          ok: false,
          code: 'not_deployed',
          message:
            'Google returned a web page instead of data. In Apps Script, deploy as a web app that runs as you and that Anyone can access, then paste the new /exec URL.',
          retryable: false,
        };
      }
      return { ok: false, code: res.status >= 500 ? 'server' : 'bad_reply', message: `Unexpected reply (${res.status}).`, retryable: res.status >= 500 };
    }
    if (json.ok === true) return { ok: true, data: json as ScriptOk['data'] };
    const code = typeof json.error === 'string' ? json.error : 'script_error';
    return {
      ok: false,
      code,
      message: typeof json.message === 'string' ? json.message : 'The script reported an error.',
      retryable: RETRYABLE.has(code),
    };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'timeout' : 'network',
      message: aborted ? 'The script did not answer in time.' : 'Could not reach Google. Check the connection.',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
