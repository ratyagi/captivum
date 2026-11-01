import type { Provider, Settings } from '../types';
import { browserTz } from './time';

export interface Store {
  get<T>(key: string, fallback: T): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export const chromeStore: Store = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const r = await chrome.storage.local.get(key);
    return (r[key] as T | undefined) ?? fallback;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
};

export function memoryStore(): Store {
  const m = new Map<string, unknown>();
  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      return m.has(key) ? (structuredClone(m.get(key)) as T) : fallback;
    },
    async set(key, value) {
      m.set(key, structuredClone(value));
    },
    async remove(key) {
      m.delete(key);
    },
  };
}

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    model: 'gemini-2.5-flash-lite',
    jsonMode: 'json_object',
    enabled: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: 'openai/gpt-oss-20b',
    jsonMode: 'json_object',
    enabled: true,
  },
];

export function defaultSettings(): Settings {
  return {
    scriptUrl: '',
    scriptSecret: '',
    senderEmail: '',
    receiverEmail: '',
    defaultTz: browserTz(),
    llmEnabled: true,
    providers: structuredClone(DEFAULT_PROVIDERS),
  };
}

export async function loadSettings(store: Store): Promise<Settings> {
  const saved = await store.get<Partial<Settings>>('settings', {});
  const base = defaultSettings();
  const merged: Settings = { ...base, ...saved };
  // Keep any provider the person added and make sure the built in ones exist.
  const have = new Map((saved.providers ?? []).map((p) => [p.id, p]));
  merged.providers = [
    ...base.providers.map((p) => ({ ...p, ...(have.get(p.id) ?? {}) })),
    ...(saved.providers ?? []).filter((p) => !base.providers.some((b) => b.id === p.id)),
  ];
  return merged;
}

export async function saveSettings(store: Store, settings: Settings): Promise<void> {
  await store.set('settings', settings);
}

export function isScriptConfigured(s: Settings): boolean {
  return /^https:\/\/script\.google\.com\//.test(s.scriptUrl.trim()) && s.scriptSecret.trim().length > 0;
}

export function llmReady(s: Settings): boolean {
  return s.llmEnabled && s.providers.some((p) => p.enabled && p.apiKey.trim());
}
