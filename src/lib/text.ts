export function normalizeText(s: string): string {
  return s
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the phrase appears in the text, ignoring case, spacing and fancy punctuation. */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const p = squash(phrase);
  if (!p) return false;
  return squash(haystack).includes(p);
}

/**
 * Builds the text sent to a language model: the start of the page plus a window around
 * every date mention, so long pages stay within a free tier's limits.
 */
export function buildLlmExcerpt(text: string, dateIndexes: number[], max = 12000): string {
  if (text.length <= max) return text;
  const head = 3500;
  const radius = 450;
  const ranges: Array<[number, number]> = [[0, head]];
  for (const i of dateIndexes) ranges.push([Math.max(0, i - radius), Math.min(text.length, i + radius)]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = '';
  for (const [a, b] of merged) {
    const piece = text.slice(a, b);
    if (out.length + piece.length > max) {
      out += piece.slice(0, Math.max(0, max - out.length));
      break;
    }
    out += piece + '\n...\n';
  }
  return out.trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}
