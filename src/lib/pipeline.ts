import type { ExtractedDate, ExtractionResult, PageSnapshot, Settings } from '../types';
import type { LlmOutcome } from './llm';
import { parseDates, chooseMain } from './parser';
import { buildLlmExcerpt } from './text';
import { isBlockedTitle, pickName } from './title';
import { applyDerivedFlags } from './validate';

export interface PipelineDeps {
  fetchPage(url: string): Promise<PageSnapshot>;
  /** Present only when a provider key is configured. */
  runLlm?(snap: PageSnapshot, excerpt: string): Promise<LlmOutcome>;
  now(): Date;
  settings: Settings;
}

const WALL = /(log ?in|sign ?in|authwall|checkpoint|captcha|challenge)/i;

/** The parser is not sure when a person would likely want a second opinion. */
export function isUnsure(dates: ExtractedDate[], name: string): string | null {
  const selected = dates.filter((d) => d.selected);
  if (!selected.length) return 'no usable deadline';
  if (!name) return 'no name';
  if (selected.some((d) => d.flags.includes('no_timezone'))) return 'timed deadline with no time zone';
  if (selected.some((d) => d.flags.includes('year_inferred'))) return 'year not stated';
  const live = dates.filter((d) => !d.flags.includes('already_passed') && d.type.endsWith('_deadline'));
  const byType = new Map<string, Set<string>>();
  for (const d of live) {
    const set = byType.get(d.type) ?? new Set();
    set.add(`${d.startDate ?? ''}|${d.date}`);
    byType.set(d.type, set);
  }
  for (const set of byType.values()) if (set.size > 1) return 'conflicting dates of the same kind';
  return null;
}

function merge(parser: ExtractedDate[], llm: ExtractedDate[]): ExtractedDate[] {
  const llmTypes = new Set(llm.map((d) => d.type));
  const out: ExtractedDate[] = [];
  for (const l of llm) {
    const twin = parser.find((p) => p.type === l.type && p.date === l.date && p.startDate === l.startDate);
    // When both agree, keep the parser's version because its text came straight from the page.
    out.push(twin ? { ...twin, time: twin.time ?? l.time, tz: twin.tz ?? l.tz } : l);
  }
  for (const p of parser) if (!llmTypes.has(p.type)) out.push(p);
  return out;
}

export async function extract(url: string, deps: PipelineDeps): Promise<ExtractionResult> {
  const now = deps.now();
  const notes: string[] = [];
  const snap = await deps.fetchPage(url);

  if (snap.text.trim().length < 200 || isBlockedTitle(snap.title) || WALL.test(new URL(snap.finalUrl || url).pathname)) {
    notes.push(
      'This page looks empty or blocked, maybe a sign in wall. Open the link in Chrome, sign in, then add it again.',
    );
  }

  const parsed = parseDates(snap.text, { now, defaultTz: deps.settings.defaultTz });
  const picked = pickName(snap);
  let name = picked.name;
  let titleSource = picked.source;
  let dates = parsed.dates;
  let usedLlm = false;
  let llmProvider: string | undefined;

  const why = isUnsure(dates, name);
  if (why) {
    if (deps.runLlm) {
      try {
        const excerpt = buildLlmExcerpt(snap.text, parsed.matchIndexes);
        const out = await deps.runLlm(snap, excerpt);
        usedLlm = true;
        llmProvider = out.provider;
        const merged = merge(parsed.dates, out.dates).map((d) => applyDerivedFlags(d, now, deps.settings.defaultTz));
        merged.sort((a, b) => (a.startDate ?? a.date).localeCompare(b.startDate ?? b.date));
        dates = chooseMain(merged);
        if (!name && out.name) {
          name = out.name;
          titleSource = 'ai';
        }
        if (out.errors.length) notes.push(`AI fallback used. ${out.errors.join(' ')}`);
      } catch (e) {
        notes.push(`The AI check failed (${(e as Error).message}). Showing what the parser found.`);
      }
    } else {
      notes.push(`Parser was unsure (${why}). Add an AI key in Settings to double check pages like this.`);
    }
  }

  if (!dates.length && !notes.length) notes.push('No dates found on this page. You can add one by hand.');

  return {
    name,
    titleSource,
    finalUrl: snap.finalUrl || url,
    dates,
    pageTz: parsed.pageTz,
    usedLlm,
    llmProvider,
    notes,
  };
}
