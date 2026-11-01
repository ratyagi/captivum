"use strict";
(() => {
  // src/lib/counters.ts
  var KEY = "counters";
  function dayKey(now) {
    const p = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  }
  function fresh(now, prev) {
    return {
      day: dayKey(now),
      invitesToday: 0,
      totalInvites: prev?.totalInvites ?? 0,
      llmToday: {},
      llmFailedToday: 0,
      scriptLeft: prev?.scriptLeft ?? null
    };
  }
  async function getCounters(store, now = /* @__PURE__ */ new Date()) {
    const c = await store.get(KEY, null);
    if (!c) return fresh(now);
    return c.day === dayKey(now) ? c : fresh(now, c);
  }
  function llmCallsToday(c) {
    return Object.values(c.llmToday).reduce((a, b) => a + b, 0);
  }

  // src/lib/records.ts
  var KEY2 = "records";
  var MAX_RECORDS = 300;
  function newId() {
    try {
      return crypto.randomUUID();
    } catch {
      return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
  }
  function createRecords(store) {
    let chain = Promise.resolve();
    const lock = (fn) => {
      const p = chain.then(fn, fn);
      chain = p.catch(() => void 0);
      return p;
    };
    const readAll = () => store.get(KEY2, []);
    return {
      list: readAll,
      async get(id) {
        return (await readAll()).find((r) => r.id === id);
      },
      create(url, now) {
        return lock(async () => {
          const all = await readAll();
          const iso = now.toISOString();
          const rec = {
            id: newId(),
            url,
            finalUrl: url,
            name: "",
            createdAt: iso,
            updatedAt: iso,
            status: "extracting",
            attempts: 0,
            dates: [],
            delivered: {},
            notes: [],
            usedLlm: false
          };
          all.unshift(rec);
          await store.set(KEY2, all.slice(0, MAX_RECORDS));
          return rec;
        });
      },
      update(id, fn, now = /* @__PURE__ */ new Date()) {
        return lock(async () => {
          const all = await readAll();
          const i = all.findIndex((r) => r.id === id);
          if (i < 0) return void 0;
          const next = { ...fn(all[i]), id, updatedAt: now.toISOString() };
          all[i] = next;
          await store.set(KEY2, all);
          return next;
        });
      },
      remove(id) {
        return lock(async () => {
          const all = await readAll();
          await store.set(
            KEY2,
            all.filter((r) => r.id !== id)
          );
        });
      }
    };
  }

  // src/lib/time.ts
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function isValidDate(s) {
    if (!s || !DATE_RE.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function isValidTime(s) {
    return !!s && TIME_RE.test(s);
  }
  function resolveTz(tz) {
    if (!tz) return null;
    const t = tz.trim();
    if (!t) return null;
    if (/^(aoe|anywhere on earth)$/i.test(t)) return { kind: "fixed", minutes: -720 };
    if (/^(utc|gmt|z)$/i.test(t)) return { kind: "fixed", minutes: 0 };
    const m = t.match(/^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (m) {
      const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
      return { kind: "fixed", minutes: m[1] === "-" ? -mins : mins };
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: t });
      return { kind: "iana", id: t };
    } catch {
      return null;
    }
  }
  var dtfCache = /* @__PURE__ */ new Map();
  function dtf(id) {
    let f = dtfCache.get(id);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: id,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      dtfCache.set(id, f);
    }
    return f;
  }
  function ianaOffsetMinutes(ms, id) {
    const parts = {};
    for (const p of dtf(id).formatToParts(new Date(ms))) parts[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return Math.round((asUtc - Math.floor(ms / 1e3) * 1e3) / 6e4);
  }
  function zonedToUtcMs(date, time, tz) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    if (tz.kind === "fixed") return guess - tz.minutes * 6e4;
    const o1 = ianaOffsetMinutes(guess, tz.id);
    let utc = guess - o1 * 6e4;
    const o2 = ianaOffsetMinutes(utc, tz.id);
    if (o2 !== o1) utc = guess - o2 * 6e4;
    return utc;
  }
  function localDateOf(ms, tz) {
    const offset = tz.kind === "fixed" ? tz.minutes : ianaOffsetMinutes(ms, tz.id);
    const dt = new Date(ms + offset * 6e4);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  function browserTz() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }
  function isPast(d, now, fallbackTz) {
    const tz = resolveTz(d.tz) ?? resolveTz(fallbackTz) ?? { kind: "fixed", minutes: 0 };
    if (!d.time) return d.date < localDateOf(now.getTime(), tz);
    return zonedToUtcMs(d.date, d.time, tz) < now.getTime();
  }

  // src/lib/storage.ts
  var chromeStore = {
    async get(key2, fallback) {
      const r = await chrome.storage.local.get(key2);
      return r[key2] ?? fallback;
    },
    async set(key2, value) {
      await chrome.storage.local.set({ [key2]: value });
    },
    async remove(key2) {
      await chrome.storage.local.remove(key2);
    }
  };
  var DEFAULT_PROVIDERS = [
    {
      id: "gemini",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "",
      model: "gemini-2.5-flash-lite",
      jsonMode: "json_object",
      enabled: true
    },
    {
      id: "groq",
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "",
      model: "openai/gpt-oss-20b",
      jsonMode: "json_object",
      enabled: true
    }
  ];
  function defaultSettings() {
    return {
      scriptUrl: "",
      scriptSecret: "",
      senderEmail: "",
      receiverEmail: "",
      defaultTz: browserTz(),
      llmEnabled: true,
      providers: structuredClone(DEFAULT_PROVIDERS)
    };
  }
  async function loadSettings(store) {
    const saved = await store.get("settings", {});
    const base = defaultSettings();
    const merged = { ...base, ...saved };
    const have = new Map((saved.providers ?? []).map((p) => [p.id, p]));
    merged.providers = [
      ...base.providers.map((p) => ({ ...p, ...have.get(p.id) ?? {} })),
      ...(saved.providers ?? []).filter((p) => !base.providers.some((b) => b.id === p.id))
    ];
    return merged;
  }
  async function saveSettings(store, settings) {
    await store.set("settings", settings);
  }
  function isScriptConfigured(s) {
    return /^https:\/\/script\.google\.com\//.test(s.scriptUrl.trim()) && s.scriptSecret.trim().length > 0;
  }

  // src/lib/title.ts
  var LABELS = {
    abstract_deadline: "Abstract deadline",
    full_paper_deadline: "Full paper deadline",
    application_deadline: "Application deadline",
    registration_closes: "Registration closes",
    submission_deadline: "Submission deadline",
    proposal_deadline: "Proposal deadline",
    notification_date: "Notification date",
    event_dates: "Event dates",
    window_start: "Opens"
  };
  var WINDOW_LABELS = {
    abstract_deadline: "Abstract window",
    full_paper_deadline: "Full paper window",
    application_deadline: "Application window",
    registration_closes: "Registration window",
    submission_deadline: "Submission window",
    proposal_deadline: "Proposal window",
    event_dates: "Event",
    notification_date: "Notification window"
  };
  function defaultLabel(type, isWindow) {
    if (isWindow) return WINDOW_LABELS[type] ?? LABELS[type];
    return LABELS[type];
  }
  function shortName(name, max = 38) {
    const n = name.trim();
    if (n.length <= max) return n;
    const cut = n.slice(0, max);
    const sp = cut.lastIndexOf(" ");
    return (sp > 20 ? cut.slice(0, sp) : cut).replace(/[\s:;,\-]+$/, "");
  }
  function buildEventTitle(name, d) {
    const n = shortName(name) || "Opportunity";
    const l = d.label.trim();
    return l ? `${n}: ${l}` : n;
  }

  // src/lib/validate.ts
  var DERIVED = ["already_passed", "bad_order", "no_timezone"];
  function applyDerivedFlags(d, now, defaultTz) {
    const flags = d.flags.filter((f) => !DERIVED.includes(f));
    const hasTime = !!(d.time || d.startTime);
    if (hasTime && !resolveTz(d.tz)) flags.push("no_timezone");
    if (isValidDate(d.date) && isPast(d, now, defaultTz)) flags.push("already_passed");
    if (d.startDate && isValidDate(d.startDate) && isValidDate(d.date)) {
      const sameDay = d.startDate === d.date;
      if (d.startDate > d.date) flags.push("bad_order");
      else if (sameDay && d.startTime && d.time && d.startTime >= d.time) flags.push("bad_order");
    }
    return { ...d, flags };
  }
  function validateForSend(rec) {
    const errors = [];
    if (!rec.name.trim()) errors.push("Give the opportunity a name.");
    const selected = rec.dates.filter((d) => d.selected);
    if (!selected.length) errors.push("Tick at least one date.");
    for (const d of selected) {
      const who = d.label || "A date";
      if (!isValidDate(d.date)) errors.push(`${who}: the date is not valid.`);
      if (d.time && !isValidTime(d.time)) errors.push(`${who}: the time is not valid.`);
      if (d.tz && !resolveTz(d.tz)) errors.push(`${who}: the time zone "${d.tz}" is not recognised.`);
      if (d.startDate) {
        if (!isValidDate(d.startDate)) errors.push(`${who}: the start date is not valid.`);
        if (d.flags.includes("bad_order")) errors.push(`${who}: the start is after the end.`);
      }
    }
    return errors;
  }

  // src/lib/url.ts
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  // src/lib/tz.ts
  var ZONE_WORDS = {
    PST: "America/Los_Angeles",
    PDT: "America/Los_Angeles",
    PT: "America/Los_Angeles",
    EST: "America/New_York",
    EDT: "America/New_York",
    ET: "America/New_York",
    CST: "America/Chicago",
    CDT: "America/Chicago",
    CT: "America/Chicago",
    MST: "America/Denver",
    MDT: "America/Denver",
    MT: "America/Denver",
    CET: "Europe/Paris",
    CEST: "Europe/Paris",
    BST: "Europe/London",
    JST: "Asia/Tokyo",
    IST: "Asia/Kolkata",
    AEST: "Australia/Sydney",
    AEDT: "Australia/Sydney",
    ACST: "Australia/Adelaide",
    AWST: "Australia/Perth",
    NZST: "Pacific/Auckland",
    NZDT: "Pacific/Auckland",
    SGT: "Asia/Singapore",
    HKT: "Asia/Hong_Kong",
    KST: "Asia/Seoul",
    WIB: "Asia/Jakarta",
    PKT: "Asia/Karachi",
    SAST: "Africa/Johannesburg",
    EAT: "Africa/Nairobi",
    WAT: "Africa/Lagos",
    WET: "Europe/Lisbon",
    WEST: "Europe/Lisbon",
    EET: "Europe/Helsinki",
    EEST: "Europe/Helsinki",
    MSK: "Europe/Moscow",
    BRT: "America/Sao_Paulo",
    HST: "Pacific/Honolulu",
    AKST: "America/Anchorage",
    AKDT: "America/Anchorage"
  };
  var ALIASES = {
    uk: "Europe/London",
    "united kingdom": "Europe/London",
    britain: "Europe/London",
    england: "Europe/London",
    india: "Asia/Kolkata",
    calcutta: "Asia/Kolkata",
    kiev: "Europe/Kyiv",
    saigon: "Asia/Ho_Chi_Minh",
    rangoon: "Asia/Yangon",
    china: "Asia/Shanghai",
    beijing: "Asia/Shanghai",
    japan: "Asia/Tokyo",
    korea: "Asia/Seoul",
    germany: "Europe/Berlin",
    france: "Europe/Paris",
    spain: "Europe/Madrid",
    italy: "Europe/Rome",
    ireland: "Europe/Dublin",
    singapore: "Asia/Singapore",
    dubai: "Asia/Dubai",
    uae: "Asia/Dubai",
    sydney: "Australia/Sydney",
    "new zealand": "Pacific/Auckland",
    nyc: "America/New_York",
    la: "America/Los_Angeles",
    sf: "America/Los_Angeles",
    "san francisco": "America/Los_Angeles",
    "new york": "America/New_York",
    chicago: "America/Chicago",
    "los angeles": "America/Los_Angeles",
    "sao paulo": "America/Sao_Paulo"
  };
  var zoneCache = null;
  function allZones() {
    if (zoneCache) return zoneCache;
    let list = [];
    try {
      list = Intl.supportedValuesOf("timeZone");
    } catch {
      list = [];
    }
    const extra = ["UTC", "Asia/Kolkata", "Europe/Kyiv", "America/Argentina/Buenos_Aires"];
    zoneCache = [.../* @__PURE__ */ new Set([...list, ...extra])].sort();
    return zoneCache;
  }
  function key(s) {
    return s.trim().toLowerCase().replace(/[_\s]+/g, " ");
  }
  function exactCity(input) {
    const k = key(input);
    if (!k) return null;
    return allZones().find((z) => key(z.split("/").pop()) === k) ?? null;
  }
  function byCity(input) {
    const k = key(input);
    if (!k) return [];
    const zones = allZones();
    const exact = zones.filter((z) => key(z.split("/").pop()) === k);
    if (exact.length) return exact;
    if (k.length < 3) return [];
    return zones.filter((z) => key(z.split("/").pop()).startsWith(k) || key(z).includes(k));
  }
  function resolveZoneInput(input) {
    const t = (input ?? "").trim();
    if (!t) return { tz: null, candidates: [] };
    const direct = normalizeTz(t);
    if (direct) return { tz: direct, candidates: [] };
    const alias = ALIASES[key(t)];
    if (alias) return { tz: alias, candidates: [] };
    const upper = ZONE_WORDS[t.toUpperCase()];
    if (upper) return { tz: upper, candidates: [] };
    const found = byCity(t);
    return { tz: found[0] ?? null, candidates: found.slice(0, 8) };
  }
  function nowIn(tz, now = /* @__PURE__ */ new Date()) {
    const r = resolveTz(tz);
    if (!r) return "";
    if (r.kind === "iana") {
      return new Intl.DateTimeFormat("en-US", { timeZone: r.id, weekday: "short", hour: "numeric", minute: "2-digit" }).format(now);
    }
    const d = new Date(now.getTime() + r.minutes * 6e4);
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
  }
  var NAMED_ZONES = {
    eastern: "America/New_York",
    central: "America/Chicago",
    mountain: "America/Denver",
    pacific: "America/Los_Angeles"
  };
  var NAMED_RE = /\b(Eastern|Pacific|Central|Mountain)(?:\s+(?:Standard|Daylight))?\s+Time\b/i;
  var AOE_RE = /(?:\bAoE\b|\bA\.o\.E\.?|\bAnywhere on Earth\b)/i;
  var TOKEN_RE = new RegExp(
    `\\b(UTC|GMT|${Object.keys(ZONE_WORDS).join("|")})\\b(?:\\s?([+-])(\\d{1,2})(?::?(\\d{2}))?)?`
  );
  var CITY_TIME_RE = /\b([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?) (?:local )?time\b/g;
  function findTz(s) {
    if (AOE_RE.test(s)) return "AoE";
    const named = s.match(NAMED_RE);
    if (named) return NAMED_ZONES[named[1].toLowerCase()];
    const m = s.match(TOKEN_RE);
    if (!m) {
      for (const c of s.matchAll(CITY_TIME_RE)) {
        const k = key(c[1]);
        const r = (k.length > 3 ? ALIASES[k] : void 0) ?? exactCity(c[1]);
        if (r) return r;
      }
      return null;
    }
    const word = m[1];
    if (word === "UTC" || word === "GMT") {
      if (m[2] && m[3]) {
        return `UTC${m[2]}${String(m[3]).padStart(2, "0")}:${m[4] ?? "00"}`;
      }
      return "UTC";
    }
    return ZONE_WORDS[word] ?? null;
  }
  function normalizeTz(input) {
    if (!input) return null;
    const t = input.trim();
    if (!t) return null;
    const found = findTz(t);
    if (found) return found;
    return resolveTz(t) ? t : null;
  }

  // src/lib/format.ts
  function fmtDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
      new Date(Date.UTC(y, m - 1, d))
    );
  }
  function fmtClock(t) {
    const [hh, mm] = t.split(":").map(Number);
    const ap = hh >= 12 ? "PM" : "AM";
    return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${ap}`;
  }
  function fmtWhen(d, fallbackTz) {
    const zone = d.tz ?? fallbackTz ?? "";
    const end = `${fmtDay(d.date)}${d.time ? ", " + fmtClock(d.time) : ""}${d.time && zone ? " " + zone : ""}`;
    if (!d.startDate) return end;
    return `${fmtDay(d.startDate)}${d.startTime ? ", " + fmtClock(d.startTime) : ""} to ${end}`;
  }

  // src/sidepanel/ui.ts
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === void 0 || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = String(v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children) if (c !== null && c !== false && c !== void 0) el.append(c);
    return el;
  }
  var FLAG_TEXT = {
    no_timezone: "The page gives a time but no time zone. Your default is used.",
    year_inferred: "The year is not written on the page. It was guessed.",
    already_passed: "This date has already passed.",
    phrase_not_found: "The source sentence was not found on the page.",
    date_mismatch: "The AI date differs from the page text. Check it.",
    llm_date_unverified: "This date could not be checked against the page text.",
    bad_order: "The start is after the end."
  };
  var BAD_FLAGS = ["already_passed", "bad_order", "date_mismatch", "phrase_not_found"];
  function statusChip(status) {
    const map = {
      extracting: ["Reading", ""],
      pending: ["Needs review", "warn"],
      sending: ["Sending", ""],
      sent: ["Invite sent", "good"],
      queued: ["Will retry", "warn"],
      failed: ["Failed", "bad"],
      cancelled: ["Cancelled", ""],
      error: ["Could not read", "bad"]
    };
    const [text, cls] = map[status];
    return h("span", { class: `chip ${cls}` }, text);
  }
  function confirmButton(label, onConfirm, cls = "danger") {
    let armed = false;
    let timer;
    const b = h("button", { class: cls }, label);
    b.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        b.textContent = "Sure?";
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
  var INK = "#000330";
  var HEAD = "M6 41C6 31 10 24 12.5 9L23 19.5C29 18 35 18 41 19.5L51.5 9C54 24 58 31 58 41C58 52.5 46.5 58 32 58C17.5 58 6 52.5 6 41Z";
  var BLOB = "M10 20C14 2 40 -4 58 6C74 16 76 44 62 58C48 70 16 70 4 52C-2 42 4 32 10 20Z";
  function eyes(mood) {
    const stroke = 'stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none"';
    switch (mood) {
      case "happy":
        return `<g class="eyes"><path d="M14.5 43Q22 33 29.5 43" ${stroke}/><path d="M34.5 43Q42 33 49.5 43" ${stroke}/></g>`;
      case "dizzy":
        return `<g class="eyes"><path d="M16 34L28 46M28 34L16 46M36 34L48 46M48 34L36 46" ${stroke}/></g>`;
      case "sleepy":
        return `<g class="eyes"><path d="M15 42H29M35 42H49" ${stroke}/></g>`;
      default:
        return `<g class="eyes"><circle cx="22" cy="40" r="7.6" fill="#fff"/><circle cx="42" cy="40" r="7.6" fill="#fff"/><circle class="pupil" cx="22" cy="40" r="3.6" fill="${INK}"/><circle class="pupil" cx="42" cy="40" r="3.6" fill="${INK}"/></g>`;
    }
  }
  function cat(mood = "idle", size = 56) {
    const wrap = document.createElement("span");
    wrap.className = `mascot m-${mood}`;
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", "Captivum cat");
    wrap.innerHTML = `<svg viewBox="-8 -4 80 72" width="${size}" height="${Math.round(size * 72 / 80)}" aria-hidden="true"><path d="${BLOB}" fill="#879ee2"/><path d="${HEAD}" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` + eyes(mood) + `</svg>`;
    return wrap;
  }
  function emptyState(mood, text) {
    return h("div", { class: "empty" }, cat(mood, 84), h("p", {}, text));
  }
  function ensureTzList(extra = []) {
    if (document.getElementById("tzlist")) return;
    const dl = document.createElement("datalist");
    dl.id = "tzlist";
    for (const t of /* @__PURE__ */ new Set(["AoE", "UTC", ...extra, ...allZones()])) {
      const o = document.createElement("option");
      o.value = t;
      dl.append(o);
    }
    document.body.append(dl);
  }

  // src/sidepanel/views/add.ts
  var ACTIVE = /* @__PURE__ */ new Set(["extracting", "pending", "sending", "queued", "failed", "error"]);
  function renderAdd(ctx2) {
    const wrap = h("div", {});
    if (!isScriptConfigured(ctx2.settings)) {
      wrap.append(
        h(
          "div",
          { class: "notice" },
          "Your sender is not linked yet, so invites cannot be sent. ",
          h("button", { class: "link", onclick: () => ctx2.setTab("settings") }, "Set it up")
        )
      );
    }
    if (ctx2.flash) wrap.append(h("div", { class: `notice ${ctx2.flash.kind}` }, ctx2.flash.kind === "good" ? cat("happy", 40) : null, ctx2.flash.text));
    const input = h("input", {
      type: "text",
      placeholder: "Paste a link and press Enter",
      value: ctx2.addDraft,
      "aria-label": "Link",
      autofocus: true
    });
    input.addEventListener("input", () => ctx2.addDraft = input.value);
    const errorBox = h("div", { class: "small", style: "color:var(--bad);margin-top:6px" });
    let busy = false;
    const submit = async () => {
      errorBox.textContent = "";
      if (busy || !input.value.trim()) return;
      busy = true;
      input.disabled = true;
      const res = await ctx2.send({ type: "extract", input: input.value });
      busy = false;
      input.disabled = false;
      if (!res.ok) {
        errorBox.textContent = res.error;
        return;
      }
      ctx2.addDraft = "";
      ctx2.flash = res.existing ? { kind: "warn", text: "That link is already in your list." } : null;
      ctx2.rerender();
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    input.addEventListener(
      "paste",
      () => setTimeout(() => {
        if (/^https?:\/\/\S+$/i.test(input.value.trim())) void submit();
      }, 0)
    );
    wrap.append(input, errorBox);
    const active = ctx2.records.filter((r) => ACTIVE.has(r.status));
    if (!active.length && !ctx2.flash) {
      wrap.append(
        emptyState(
          "idle",
          "Paste a link from LinkedIn, X, a forum or an organisation site. I will read it, show you the deadline to check, and send the invite when you confirm."
        )
      );
    }
    for (const r of active) wrap.append(renderCard(ctx2, r));
    return wrap;
  }
  function renderCard(ctx2, r) {
    switch (r.status) {
      case "extracting":
        return h(
          "div",
          { class: "card" },
          h("div", { class: "row" }, cat("look", 44), `Reading ${hostOf(r.url)}...`),
          h("div", { class: "actions" }, h("button", { class: "link", onclick: async () => (await ctx2.send({ type: "delete", id: r.id }), ctx2.rerender()) }, "Cancel"))
        );
      case "sending":
        return h("div", { class: "card" }, h("div", { class: "row" }, cat("look", 44), `Sending the invite for ${r.name || hostOf(r.url)}...`));
      case "error":
        return h(
          "div",
          { class: "card" },
          h("h3", {}, hostOf(r.url)),
          h("div", { class: "notice bad" }, cat("dizzy", 40), r.error ?? "Could not read this page."),
          h(
            "div",
            { class: "actions" },
            h("button", { class: "primary", onclick: () => ctx2.send({ type: "extract", input: r.url }).then(() => ctx2.rerender()) }, "Try again"),
            h("button", { class: "link", onclick: async () => (await ctx2.send({ type: "delete", id: r.id }), ctx2.rerender()) }, "Remove")
          )
        );
      case "queued":
      case "failed":
        return h(
          "div",
          { class: "card" },
          h("div", { class: "item-head" }, h("h3", {}, r.name || hostOf(r.url)), h("span", { class: `chip ${r.status === "failed" ? "bad" : "warn"}` }, r.status === "failed" ? "Failed" : "Will retry")),
          h("div", { class: `notice ${r.status === "failed" ? "bad" : ""}` }, r.error ?? "Something went wrong.", r.status === "queued" ? " Captivum will try again automatically." : ""),
          h(
            "div",
            { class: "actions" },
            h("button", { class: "primary", onclick: async () => (await ctx2.send({ type: "deliver", id: r.id }), ctx2.rerender()) }, "Try now"),
            r.errorCode === "not_configured" || r.errorCode === "bad_secret" ? h("button", { class: "link", onclick: () => ctx2.setTab("settings") }, "Fix sender") : h("button", { class: "link", onclick: async () => (await ctx2.send({ type: "reopen", id: r.id }), ctx2.rerender()) }, "Edit")
          )
        );
      default:
        return reviewCard(ctx2, r);
    }
  }
  function draftOf(ctx2, r) {
    let d = ctx2.drafts.get(r.id);
    if (!d) {
      d = { name: r.name, dates: structuredClone(r.dates) };
      ctx2.drafts.set(r.id, d);
    }
    return d;
  }
  function reviewCard(ctx2, r) {
    const draft = draftOf(ctx2, r);
    const card = h("div", { class: "card" });
    const nameInput = h("input", { type: "text", value: draft.name, "aria-label": "Opportunity name", placeholder: "Name of the opportunity" });
    const errors = h("div", { class: "notice bad", style: "display:none" });
    const datesBox = h("div", {});
    const refreshTitles = () => card.querySelectorAll("[data-title-for]").forEach((el) => {
      const d = draft.dates.find((x) => x.id === el.dataset.titleFor);
      if (d) el.textContent = buildEventTitle(draft.name, d);
    });
    nameInput.addEventListener("input", () => {
      draft.name = nameInput.value;
      refreshTitles();
      ctx2.scheduleSave(r.id);
    });
    card.append(
      nameInput,
      h("div", { class: "small muted", style: "margin-top:4px" }, `From ${hostOf(r.finalUrl || r.url)}`, r.usedLlm ? " (checked with AI)" : "")
    );
    for (const n of r.notes) card.append(h("div", { class: "notice" }, n));
    const renderDates = () => {
      datesBox.replaceChildren();
      if (!draft.dates.length) datesBox.append(h("p", { class: "muted" }, "No dates were found. Add one below."));
      for (const d of draft.dates) datesBox.append(dateRow(ctx2, r, draft, d, refreshTitles));
    };
    renderDates();
    const addDate = h(
      "button",
      {
        class: "link",
        onclick: () => {
          const base = {
            id: `m${Date.now().toString(36)}`,
            type: "submission_deadline",
            label: defaultLabel("submission_deadline", false),
            date: "",
            time: null,
            tz: null,
            startDate: null,
            startTime: null,
            rawPhrase: "",
            source: "parser",
            flags: [],
            selected: true
          };
          draft.dates.push(base);
          ctx2.scheduleSave(r.id);
          renderDates();
        }
      },
      "+ Add a date"
    );
    const confirm = h("button", { class: "primary wide" }, "Send invite");
    confirm.addEventListener("click", async () => {
      const probs = validateForSend({ name: draft.name, dates: draft.dates });
      if (probs.length) {
        errors.style.display = "";
        errors.textContent = probs.join(" ");
        return;
      }
      errors.style.display = "none";
      confirm.disabled = true;
      await ctx2.flushSave(r.id);
      const res = await ctx2.send({ type: "deliver", id: r.id });
      ctx2.drafts.delete(r.id);
      if (res.ok) {
        ctx2.flash = { kind: "good", text: `Sent. Check your university inbox or calendar for "${draft.name}".` };
      } else if (res.code === "not_configured") {
        ctx2.settingsMsg = { kind: "bad", text: res.error };
        ctx2.setTab("settings");
        return;
      } else {
        ctx2.flash = null;
      }
      ctx2.rerender();
    });
    card.append(
      datesBox,
      h("div", { class: "actions" }, addDate),
      errors,
      confirm,
      h(
        "div",
        { class: "center" },
        confirmButton(
          "Discard",
          async () => {
            ctx2.drafts.delete(r.id);
            await ctx2.send({ type: "delete", id: r.id });
            ctx2.rerender();
          },
          "link danger"
        )
      )
    );
    return card;
  }
  function dateRow(ctx2, r, draft, d, refreshTitles) {
    const row = h("div", { class: "date" });
    const chips = h("div", { class: "row", style: "flex-wrap:wrap" });
    const paintChips = () => {
      chips.replaceChildren();
      for (const f of d.flags) {
        chips.append(h("span", { class: `chip ${BAD_FLAGS.includes(f) ? "bad" : "warn"}`, title: FLAG_TEXT[f] }, FLAG_TEXT[f]));
      }
    };
    const touch = (recompute) => {
      if (recompute) {
        const next = applyDerivedFlags(d, /* @__PURE__ */ new Date(), ctx2.settings.defaultTz);
        d.flags = next.flags;
        paintChips();
      }
      refreshTitles();
      ctx2.scheduleSave(r.id);
    };
    const check = h("input", { type: "checkbox", checked: d.selected, "aria-label": "Send this date" });
    check.addEventListener("change", () => {
      d.selected = check.checked;
      touch(false);
    });
    const label = h("input", { type: "text", value: d.label, "aria-label": "Label" });
    label.addEventListener("input", () => {
      d.label = label.value;
      touch(false);
    });
    const field = (text, el) => h("label", { class: "field" }, text, el);
    const dateInput = (value, set) => {
      const i = h("input", { type: "date", value: value ?? "" });
      i.addEventListener("change", () => {
        set(i.value);
        touch(true);
      });
      return i;
    };
    const timeInput = (value, set) => {
      const i = h("input", { type: "time", value: value ?? "" });
      i.addEventListener("change", () => {
        set(i.value || null);
        touch(true);
      });
      return i;
    };
    const tz = h("input", { type: "text", value: d.tz ?? "", list: "tzlist", placeholder: `Default (${ctx2.settings.defaultTz}). Try a city, like London`, "aria-label": "Time zone" });
    tz.addEventListener("change", () => {
      const raw = tz.value.trim();
      const res = raw ? resolveZoneInput(raw) : { tz: null };
      d.tz = res.tz ?? (raw || null);
      if (res.tz) tz.value = res.tz;
      touch(true);
    });
    const startInput = h("input", { type: "date", value: d.startDate ?? "" });
    startInput.addEventListener("change", () => {
      const wasPlain = d.label === defaultLabel(d.type, d.startDate !== null);
      d.startDate = startInput.value || null;
      if (!d.startDate) d.startTime = null;
      if (wasPlain) d.label = defaultLabel(d.type, d.startDate !== null);
      label.value = d.label;
      touch(true);
    });
    const startTime = timeInput(d.startTime, (v) => d.startTime = v);
    const more = h(
      "details",
      { class: "more" },
      h("summary", {}, "More"),
      h(
        "div",
        { class: "stack", style: "margin-top:8px" },
        h("div", { class: "grid2" }, field("Starts (for a period)", startInput), field("Start time", startTime)),
        field("Time zone", tz),
        d.rawPhrase ? h("div", { class: "quote" }, d.startPhrase ? `"${d.startPhrase}" ... ` : "", `"${d.rawPhrase}"`) : null
      )
    );
    if (d.startDate || d.tz || d.flags.includes("no_timezone")) more.open = true;
    const parts = [
      h("div", { class: "row" }, check, label),
      h("div", { class: "grid2" }, field(d.startDate ? "Ends" : "Date", dateInput(d.date, (v) => d.date = v)), field("Time (optional)", timeInput(d.time, (v) => d.time = v))),
      chips,
      h("div", { class: "title-preview", "data-title-for": d.id }, buildEventTitle(draft.name, d)),
      more
    ];
    row.append(...parts.filter(Boolean));
    paintChips();
    ensureTzList([ctx2.settings.defaultTz]);
    return row;
  }

  // src/sidepanel/views/history.ts
  function renderHistory(ctx2) {
    const wrap = h("div", {});
    if (ctx2.flash) wrap.append(h("div", { class: `notice ${ctx2.flash.kind}`, style: "margin-top:0" }, ctx2.flash.text));
    const items = ctx2.records.filter((r) => r.status === "sent" || r.status === "cancelled");
    if (!items.length) {
      wrap.append(emptyState("sleepy", "Nothing here yet. Invites you send will be listed here."));
      return wrap;
    }
    for (const r of items) {
      const sent = r.dates.filter((d) => r.delivered[d.id]);
      const card = h("div", { class: "card" });
      card.append(
        h(
          "div",
          { class: "item-head" },
          h("a", { href: r.finalUrl || r.url, target: "_blank", rel: "noreferrer" }, r.name || hostOf(r.url)),
          statusChip(r.status)
        )
      );
      if (sent.length) {
        for (const d of sent) card.append(h("div", { class: "small" }, h("strong", {}, d.label + ": "), fmtWhen(d)));
      } else {
        card.append(h("div", { class: "small muted" }, "No active invites."));
      }
      card.append(h("div", { class: "small muted" }, `${hostOf(r.url)} \xB7 ${new Date(r.updatedAt).toLocaleString()}`));
      const actions = h("div", { class: "actions" });
      actions.append(
        h(
          "button",
          {
            class: "link",
            onclick: async () => {
              await ctx2.send({ type: "reopen", id: r.id });
              ctx2.drafts.delete(r.id);
              ctx2.setTab("add");
            }
          },
          "Edit"
        )
      );
      if (sent.length) {
        actions.append(
          confirmButton("Cancel invite", async () => {
            const res = await ctx2.send({ type: "cancelInvites", id: r.id });
            ctx2.flash = res.ok ? { kind: "good", text: "Invites cancelled. The calendar entry is removed for your receiver." } : { kind: "bad", text: res.error };
            ctx2.rerender();
          }, "link danger")
        );
      }
      actions.append(
        confirmButton("Remove", async () => {
          await ctx2.send({ type: "delete", id: r.id });
          ctx2.rerender();
        }, "link danger")
      );
      card.append(actions);
      wrap.append(card);
    }
    return wrap;
  }

  // src/sidepanel/views/settings.ts
  function textField(label, value, onChange, opts = {}) {
    const i = h("input", { type: opts.type ?? "text", value, placeholder: opts.placeholder, autocomplete: "off", spellcheck: false });
    i.addEventListener("change", () => onChange(i.value.trim()));
    return h("label", { class: "field" }, label, i, opts.help ? h("span", { class: "small" }, opts.help) : null);
  }
  function renderSettings(ctx2) {
    const s = ctx2.settings;
    const wrap = h("div", {});
    const result = h("div", { class: "small", style: "margin-top:8px" });
    const paint = () => {
      const m = ctx2.settingsMsg;
      if (!m) return result.replaceChildren();
      let extra = null;
      if (m.testEventId) {
        const eventId = m.testEventId;
        const undo = h("button", { class: "link" }, "Remove the test invite");
        undo.addEventListener("click", async () => {
          const r = await ctx2.send({ type: "cancelTestInvite", eventId });
          ctx2.settingsMsg = r.ok ? { kind: "good", text: "Test invite removed." } : { kind: "bad", text: r.error };
          paint();
        });
        extra = undo;
      }
      result.replaceChildren(h("div", { class: `notice ${m.kind}`, style: "margin-top:0" }, m.text, extra));
    };
    const show = (kind, text, testEventId) => {
      ctx2.settingsMsg = { kind, text, testEventId };
      paint();
    };
    const verify = async () => {
      const cur = ctx2.settings;
      if (!isScriptConfigured(cur) || !cur.scriptSecret) return;
      show("good", "Checking...");
      const res = await ctx2.send({ type: "scriptTest", sendInvite: false });
      if (!res.ok) return show("bad", res.error);
      show("good", `Connected. Invites go from ${res.sender} to ${res.receiver}.`);
    };
    const test = h("button", { class: "link" }, "Send a test invite");
    test.addEventListener("click", async () => {
      test.disabled = true;
      show("good", "Sending...");
      const res = await ctx2.send({ type: "scriptTest", sendInvite: true });
      test.disabled = false;
      if (!res.ok) return show("bad", res.error);
      show("good", `Test invite sent to ${res.receiver}. `, String(res.eventId ?? ""));
    });
    paint();
    const saveAndVerify = async (patch) => {
      await ctx2.saveSettings(patch);
      await verify();
    };
    wrap.append(
      h("h2", {}, "Sender (your Gmail)"),
      h(
        "div",
        { class: "stack" },
        textField("Web app URL", s.scriptUrl, (v) => saveAndVerify({ scriptUrl: v }), {
          placeholder: "https://script.google.com/macros/s/.../exec"
        }),
        textField("Secret", s.scriptSecret, (v) => saveAndVerify({ scriptSecret: v }), { type: "password" }),
        h("div", { class: "small muted" }, "You only enter these once. They stay in this browser."),
        result,
        isScriptConfigured(s) ? h("div", {}, test) : null
      )
    );
    const tzInput = h("input", { type: "text", value: s.defaultTz, list: "tzlist", placeholder: "A city, like London", autocomplete: "off", spellcheck: false });
    const tzNote = h("div", { class: "small" });
    const paintTz = (tz) => {
      const when = nowIn(tz);
      tzNote.textContent = when ? `Using ${tz}. It is ${when} there now.` : "";
      tzNote.className = "small muted";
    };
    paintTz(s.defaultTz);
    tzInput.addEventListener("change", async () => {
      const r = resolveZoneInput(tzInput.value);
      if (!r.tz || !resolveTz(r.tz)) {
        tzNote.textContent = "Not recognised. Try a city (London, Tokyo, New York), an abbreviation (IST, CET) or a name like Europe/London.";
        tzNote.className = "small";
        tzNote.style.color = "var(--bad)";
        return;
      }
      tzNote.style.color = "";
      tzInput.value = r.tz;
      paintTz(r.tz);
      await ctx2.saveSettings({ defaultTz: r.tz });
    });
    ensureTzList();
    wrap.append(
      h("h2", {}, "Time zone"),
      h(
        "label",
        { class: "field" },
        "Default time zone",
        tzInput,
        h("span", { class: "small" }, "Used when a page gives a time but no zone. Any city or zone in the world works.")
      ),
      tzNote
    );
    const llmToggle = h("input", { type: "checkbox", checked: s.llmEnabled });
    llmToggle.addEventListener("change", () => ctx2.saveSettings({ llmEnabled: llmToggle.checked }));
    const ai = h(
      "details",
      { class: "more", style: "margin-top:18px" },
      h("summary", {}, "AI help (optional)"),
      h("p", { class: "muted small" }, "The parser reads most pages on its own. The AI is only asked when the parser is unsure. It sees public page text only."),
      h("label", { class: "check" }, llmToggle, "Use AI when the parser is unsure")
    );
    for (const p of s.providers) ai.append(providerBox(ctx2, p));
    if (s.llmEnabled || s.providers.some((p) => p.apiKey)) ai.open = true;
    wrap.append(ai);
    wrap.append(
      h("h2", {}, "Usage"),
      h("div", { class: "small muted" }, `${ctx2.counters.totalInvites} invites sent in total.`)
    );
    return wrap;
  }
  function providerBox(ctx2, p) {
    const save = (patch) => ctx2.saveSettings({ providers: ctx2.settings.providers.map((x) => x.id === p.id ? { ...x, ...patch } : x) });
    const on = h("input", { type: "checkbox", checked: p.enabled });
    on.addEventListener("change", () => save({ enabled: on.checked }));
    const mode = h("select", {}, ...["json_object", "json_schema", "none"].map((m) => h("option", { value: m, selected: m === p.jsonMode }, m)));
    mode.addEventListener("change", () => save({ jsonMode: mode.value }));
    const out = h("div", { class: "small" });
    const test = async () => {
      out.textContent = "Testing the key...";
      const res = await ctx2.send({ type: "llmTest", providerId: p.id });
      out.textContent = res.ok ? String(res.message) : res.error;
    };
    return h(
      "div",
      { class: "card" },
      h("label", { class: "check" }, on, h("strong", {}, p.name)),
      h(
        "div",
        { class: "stack", style: "margin-top:8px" },
        textField("API key", p.apiKey, async (v) => {
          await save({ apiKey: v });
          if (v) await test();
        }, { type: "password" }),
        h(
          "details",
          { class: "more" },
          h("summary", {}, "Advanced"),
          h(
            "div",
            { class: "stack", style: "margin-top:8px" },
            textField("Model", p.model, (v) => save({ model: v })),
            textField("Base URL", p.baseUrl, (v) => save({ baseUrl: v })),
            h("label", { class: "field" }, "Structured output mode", mode)
          )
        ),
        out
      )
    );
  }

  // src/sidepanel/panel.ts
  var main = document.getElementById("main");
  var footer = document.getElementById("footer");
  var tabsEl = document.getElementById("tabs");
  var recordsApi = createRecords(chromeStore);
  var gear = h("button", { class: "gear", title: "Settings", "aria-label": "Settings", onclick: () => ctx.setTab(tab === "settings" ? "add" : "settings") });
  gear.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  document.getElementById("brand").append(
    cat("idle", 46),
    h("div", {}, h("div", { class: "wordmark" }, "captivum."), h("div", { class: "tagline" }, "Deadlines, caught.")),
    gear
  );
  var tab = "add";
  var dirty = false;
  var ctx = {
    records: [],
    settings: void 0,
    counters: void 0,
    flash: null,
    addDraft: "",
    settingsMsg: null,
    drafts: /* @__PURE__ */ new Map(),
    setTab(t) {
      tab = t;
      ctx.flash = null;
      render();
    },
    async send(msg) {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e) };
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
        setTimeout(() => void ctx.flushSave(id), 500)
      );
    },
    async flushSave(id) {
      clearTimeout(saveTimers.get(id));
      const d = ctx.drafts.get(id);
      if (d) await ctx.send({ type: "saveDraft", id, name: d.name, dates: d.dates });
    }
  };
  var saveTimers = /* @__PURE__ */ new Map();
  async function refresh() {
    [ctx.records, ctx.settings, ctx.counters] = await Promise.all([recordsApi.list(), loadSettings(chromeStore), getCounters(chromeStore)]);
    for (const id of [...ctx.drafts.keys()]) {
      const r = ctx.records.find((x) => x.id === id);
      if (!r || r.status !== "pending") ctx.drafts.delete(id);
    }
  }
  function renderTabs() {
    const defs = [
      ["add", "Add"],
      ["history", "History"]
    ];
    gear.setAttribute("aria-pressed", String(tab === "settings"));
    tabsEl.replaceChildren(
      ...defs.map(([id, label]) => {
        const pending = id === "add" ? ctx.records.filter((r) => r.status === "pending").length : 0;
        return h("button", { role: "tab", "aria-selected": String(tab === id), onclick: () => ctx.setTab(id) }, label + (pending ? ` (${pending})` : ""));
      })
    );
  }
  function renderFooter() {
    const c = ctx.counters;
    const llm = llmCallsToday(c);
    footer.replaceChildren(
      h("span", {}, `Today: ${c.invitesToday} invite${c.invitesToday === 1 ? "" : "s"}`),
      h("span", {}, `${llm} AI read${llm === 1 ? "" : "s"}`),
      h("span", {}, c.scriptLeft === null ? "Invites left: unknown" : `Invites left: ${c.scriptLeft}`)
    );
  }
  function render() {
    dirty = false;
    const scroll = main.scrollTop;
    const view = tab === "add" ? renderAdd(ctx) : tab === "history" ? renderHistory(ctx) : renderSettings(ctx);
    main.replaceChildren(view);
    main.scrollTop = scroll;
    renderTabs();
    renderFooter();
  }
  function typing() {
    const a = document.activeElement;
    return !!a && main.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
  }
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== "local") return;
    await refresh();
    renderFooter();
    renderTabs();
    if (typing()) dirty = true;
    else render();
  });
  main.addEventListener("focusout", () => {
    setTimeout(() => {
      if (dirty && !typing()) render();
    }, 0);
  });
  void (async () => {
    await refresh();
    render();
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\/\S+$/i.test(t) && !ctx.addDraft && tab === "add") {
        ctx.addDraft = t;
        const el = main.querySelector("input[type=text]");
        if (el && !el.value) el.value = t;
      }
    } catch {
    }
  })();
})();
