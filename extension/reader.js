"use strict";
(() => {
  // src/lib/readerCore.ts
  var BLOCK = /* @__PURE__ */ new Set(["P", "DIV", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "BR", "UL", "OL", "TABLE", "HEADER", "FOOTER"]);
  var SKIP = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME"]);
  function meta(doc, key) {
    const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return (el?.getAttribute("content") ?? "").trim();
  }
  function walkText(root) {
    const out = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        out.push(node.nodeValue ?? "");
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      if (SKIP.has(el.tagName.toUpperCase())) return;
      if (el.getAttribute("hidden") !== null || el.getAttribute("aria-hidden") === "true") return;
      const block = BLOCK.has(el.tagName.toUpperCase());
      if (block) out.push("\n");
      el.childNodes.forEach(visit);
      if (block) out.push("\n");
    };
    visit(root);
    return out.join("");
  }
  function bodyText(doc) {
    const body = doc.body;
    if (!body) return "";
    const inner = body.innerText;
    return typeof inner === "string" && inner.trim() ? inner : walkText(body);
  }
  function postText(doc, host) {
    let sels = [];
    if (/(^|\.)(x|twitter)\.com$/.test(host)) sels = ['[data-testid="tweetText"]'];
    else if (/linkedin\.com$/.test(host))
      sels = [".feed-shared-update-v2__description", ".update-components-text", '[data-test-id="main-feed-activity-card__commentary"]', ".attributed-text-segment-list__content"];
    if (!sels.length) return "";
    const seen = /* @__PURE__ */ new Set();
    for (const s of sels) {
      doc.querySelectorAll(s).forEach((el) => {
        const t = (el.innerText ?? el.textContent ?? "").trim();
        if (t) seen.add(t);
      });
    }
    return [...seen].join("\n\n");
  }
  function structuredData(doc) {
    const lines = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
      try {
        const raw = JSON.parse(el.textContent ?? "null");
        const items = Array.isArray(raw) ? raw : raw?.["@graph"] ? raw["@graph"] : [raw];
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const type = String(it["@type"] ?? "");
          if (!/event|course|scholarly|grant|jobposting/i.test(type)) continue;
          const bits = [it.name, it.startDate && `starts ${it.startDate}`, it.endDate && `ends ${it.endDate}`, it.validThrough && `valid through ${it.validThrough}`].filter(Boolean);
          if (bits.length) lines.push(`Structured data: ${bits.join(", ")}`);
        }
      } catch {
      }
    });
    return lines.join("\n");
  }
  function readDocument(doc, href) {
    let host = "";
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
    }
    const description = meta(doc, "og:description") || meta(doc, "description");
    const parts = [postText(doc, host), description, structuredData(doc), bodyText(doc)].filter((p) => p && p.trim());
    const text = parts.join("\n\n").slice(0, 8e4);
    return {
      href,
      title: (doc.title ?? "").trim(),
      ogTitle: meta(doc, "og:title") || meta(doc, "twitter:title"),
      h1: (doc.querySelector("h1")?.textContent ?? "").trim(),
      description,
      siteName: meta(doc, "og:site_name"),
      text
    };
  }

  // src/content/reader-entry.ts
  window.__captivumRead = () => readDocument(document, location.href);
})();
