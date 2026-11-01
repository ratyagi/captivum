// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/lib/readerCore';

describe('reader', () => {
  it('collects title, headings and visible text and skips scripts', () => {
    document.head.innerHTML = `<title>Grant | Site</title><meta property="og:title" content="Open Data Grant"><meta name="description" content="Funding for open data.">`;
    document.body.innerHTML = `<h1>Open Data Grant</h1><p>Applications close <b>April 15, 2027</b>.</p><script>var secret = 1;</script><div hidden>hidden text</div>
      <script type="application/ld+json">{"@type":"Event","name":"Open Data Day","startDate":"2027-05-01","endDate":"2027-05-02"}</script>`;
    const s = readDocument(document, 'https://e.org/g');
    expect(s.ogTitle).toBe('Open Data Grant');
    expect(s.h1).toBe('Open Data Grant');
    expect(s.text).toContain('Applications close');
    expect(s.text).toContain('April 15, 2027');
    expect(s.text).not.toContain('var secret');
    expect(s.text).not.toContain('hidden text');
    expect(s.text).toContain('Structured data: Open Data Day, starts 2027-05-01, ends 2027-05-02');
  });
});
