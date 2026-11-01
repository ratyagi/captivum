"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/lib/counters.ts
  var KEY = "counters";
  function dayKey(now2) {
    const p = (n) => String(n).padStart(2, "0");
    return `${now2.getFullYear()}-${p(now2.getMonth() + 1)}-${p(now2.getDate())}`;
  }
  function fresh(now2, prev) {
    return {
      day: dayKey(now2),
      invitesToday: 0,
      totalInvites: prev?.totalInvites ?? 0,
      llmToday: {},
      llmFailedToday: 0,
      scriptLeft: prev?.scriptLeft ?? null
    };
  }
  async function getCounters(store, now2 = /* @__PURE__ */ new Date()) {
    const c = await store.get(KEY, null);
    if (!c) return fresh(now2);
    return c.day === dayKey(now2) ? c : fresh(now2, c);
  }
  async function mutate(store, now2, fn) {
    const c = await getCounters(store, now2);
    fn(c);
    await store.set(KEY, c);
    return c;
  }
  var bumpInvite = (store, now2 = /* @__PURE__ */ new Date()) => mutate(store, now2, (c) => {
    c.invitesToday += 1;
    c.totalInvites += 1;
  });
  var bumpLlm = (store, providerId, ok, now2 = /* @__PURE__ */ new Date()) => mutate(store, now2, (c) => {
    c.llmToday[providerId] = (c.llmToday[providerId] ?? 0) + 1;
    if (!ok) c.llmFailedToday += 1;
  });
  var setScriptLeft = (store, left, now2 = /* @__PURE__ */ new Date()) => mutate(store, now2, (c) => {
    c.scriptLeft = left;
  });
  function badgeFor(counters, queued) {
    if (queued > 0) return { text: "!", color: "#d97706" };
    if (counters.invitesToday > 0) return { text: String(counters.invitesToday), color: "#4f46e5" };
    return { text: "", color: "#4f46e5" };
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
  var SOCIAL = /^(.+?)\s+on\s+(?:LinkedIn|X|Twitter|Facebook|Instagram|Threads)\s*[:\-]\s*(.+)$/is;
  var SITE_NAMES = /^(linkedin|x|twitter|facebook|instagram|devpost|eventbrite|medium|github|luma|lu\.ma|google forms?)$/i;
  var BLOCKED = /^(log ?in|sign ?in|just a moment|access denied|attention required|are you a robot|security check|404|page not found|redirecting)/i;
  function isBlockedTitle(t) {
    return BLOCKED.test(t.trim());
  }
  function cleanName(raw) {
    let s = (raw || "").replace(/[\p{Extended_Pictographic}️‍]/gu, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^\(\d+\)\s*/, "");
    const social = s.match(SOCIAL);
    if (social) s = social[2];
    s = s.replace(/^["“”']+|["“”']+$/g, "").trim();
    const parts = s.split(/\s+(?:\||·|–|—|-)\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const useful = parts.filter((p) => !SITE_NAMES.test(p));
      if (useful.length) s = useful[0];
    }
    const firstLine = s.split(/\n/)[0];
    const sentence = firstLine.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
    s = sentence.length >= 8 ? sentence : firstLine;
    if (s.length > 80) {
      const cut = s.slice(0, 80);
      const sp = cut.lastIndexOf(" ");
      s = (sp > 40 ? cut.slice(0, sp) : cut).trim();
    }
    return s.replace(/[\s:;,\-–—|]+$/g, "").trim();
  }
  function pickName(s) {
    const candidates = [
      ["og:title", s.ogTitle],
      ["title", s.title],
      ["h1", s.h1]
    ];
    for (const [source, raw] of candidates) {
      if (!raw || isBlockedTitle(raw)) continue;
      const name2 = cleanName(raw);
      if (name2.length >= 4 && !SITE_NAMES.test(name2)) return { name: name2, source };
    }
    const firstLine = (s.text || "").split("\n").find((l) => l.trim().length >= 8) ?? "";
    const name = cleanName(firstLine);
    return name.length >= 4 ? { name, source: "text" } : { name: "", source: "none" };
  }
  function buildEventTitle(name, d) {
    const n = name.trim() || "Opportunity";
    const l = d.label.trim();
    return l ? `${n}: ${l}` : n;
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
  function to24(hour, minute, ap) {
    let h = hour;
    if (ap) {
      const pm = ap.toLowerCase().startsWith("p");
      if (h < 1 || h > 12) return null;
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (h > 23 || minute > 59) return null;
    return `${pad(h)}:${pad(minute)}`;
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
  function addDays(date, n) {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
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
  function isPast(d, now2, fallbackTz) {
    const tz = resolveTz(d.tz) ?? resolveTz(fallbackTz) ?? { kind: "fixed", minutes: 0 };
    if (!d.time) return d.date < localDateOf(now2.getTime(), tz);
    return zonedToUtcMs(d.date, d.time, tz) < now2.getTime();
  }
  function toIsoUtc(ms) {
    return new Date(ms).toISOString();
  }

  // src/lib/deliver.ts
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) | 0;
    return (h >>> 0).toString(36);
  }
  function human(date, time, tz) {
    return [date, time, tz].filter(Boolean).join(" ");
  }
  function buildEventPayload(rec, d, settings) {
    const title = buildEventTitle(rec.name, d);
    const tz = resolveTz(d.tz) ?? resolveTz(settings.defaultTz) ?? { kind: "fixed", minutes: 0 };
    const assumedTz = !resolveTz(d.tz);
    const source = rec.finalUrl || rec.url;
    const lines = [];
    const ends = d.startDate ? `${human(d.startDate, d.startTime, null)} to ${human(d.date, d.time, d.tz)}` : human(d.date, d.time, d.tz);
    lines.push(`${d.label}: ${ends}`);
    if (d.time || d.startTime) {
      lines.push(
        assumedTz ? `The page did not name a time zone. Captivum assumed ${settings.defaultTz}.` : `Time zone: ${d.tz}`
      );
    }
    lines.push("", `Source: ${source}`);
    if (d.rawPhrase) lines.push(`From the page: "${d.rawPhrase}"`);
    lines.push("", "Added with Captivum.");
    const description = lines.join("\n");
    const base = { title, description, sourceUrl: source };
    let body;
    if (d.startDate) {
      if (!d.startTime) {
        body = { ...base, allDay: true, startDate: d.startDate, endDate: addDays(d.date, 1) };
      } else {
        const start = zonedToUtcMs(d.startDate, d.startTime, tz);
        const end = zonedToUtcMs(d.date, d.time ?? "23:59", tz);
        body = { ...base, allDay: false, startDateTime: toIsoUtc(start), endDateTime: toIsoUtc(end) };
      }
    } else if (!d.time) {
      body = { ...base, allDay: true, startDate: d.date, endDate: addDays(d.date, 1) };
    } else {
      const end = zonedToUtcMs(d.date, d.time, tz);
      body = { ...base, allDay: false, startDateTime: toIsoUtc(end - 30 * 6e4), endDateTime: toIsoUtc(end) };
    }
    const h = hash(JSON.stringify(body));
    return { ...body, requestId: `${rec.id}:${d.id}:${h}` };
  }
  function payloadHash(p) {
    const { requestId: _ignored, ...rest } = p;
    return hash(JSON.stringify(rest));
  }
  async function deliverRecord(record, settings, deps) {
    const delivered = { ...record.delivered };
    const errors = [];
    const note = async (res) => {
      if (res.ok && res.data.quota) await deps.onQuota?.(res.data.quota.left);
    };
    for (const d of record.dates) {
      const prev = delivered[d.id];
      if (!d.selected) {
        if (!prev) continue;
        const res2 = await deps.call("cancel", { eventId: prev.eventId, requestId: prev.requestId });
        await note(res2);
        if (res2.ok || res2.code === "not_found") delete delivered[d.id];
        else errors.push({ dateId: d.id, code: res2.code, message: res2.message, retryable: res2.retryable });
        continue;
      }
      const payload = buildEventPayload(record, d, settings);
      const h = payloadHash(payload);
      if (prev && prev.hash === h) continue;
      let res;
      let created = false;
      if (prev) {
        res = await deps.call("update", { ...payload, eventId: prev.eventId });
        if (!res.ok && res.code === "not_found") {
          res = await deps.call("create", { ...payload });
          created = true;
        }
      } else {
        res = await deps.call("create", { ...payload });
        created = true;
      }
      await note(res);
      if (res.ok && typeof res.data.eventId === "string") {
        delivered[d.id] = {
          eventId: res.data.eventId,
          requestId: payload.requestId,
          sentAt: deps.now().toISOString(),
          hash: h
        };
        if (created) await deps.onCreated?.(res.data.quota?.left ?? null);
      } else if (!res.ok) {
        errors.push({ dateId: d.id, code: res.code, message: res.message, retryable: res.retryable });
      } else {
        errors.push({ dateId: d.id, code: "bad_reply", message: "The script did not return an event id.", retryable: false });
      }
    }
    let status;
    if (errors.length === 0) {
      status = Object.keys(delivered).length ? "sent" : "cancelled";
    } else {
      status = errors.every((e) => e.retryable) ? "queued" : "failed";
    }
    const first = errors[0];
    return {
      record: {
        ...record,
        delivered,
        status,
        error: first?.message,
        errorCode: first?.code
      },
      errors
    };
  }

  // node_modules/chrono-node/dist/esm/locales/en/index.js
  var en_exports = {};
  __export(en_exports, {
    Chrono: () => Chrono,
    GB: () => GB,
    Meridiem: () => Meridiem,
    ParsingComponents: () => ParsingComponents,
    ParsingResult: () => ParsingResult,
    ReferenceWithTimezone: () => ReferenceWithTimezone,
    Weekday: () => Weekday,
    casual: () => casual,
    configuration: () => configuration,
    parse: () => parse,
    parseDate: () => parseDate,
    strict: () => strict
  });

  // node_modules/chrono-node/dist/esm/types.js
  var Meridiem;
  (function(Meridiem2) {
    Meridiem2[Meridiem2["AM"] = 0] = "AM";
    Meridiem2[Meridiem2["PM"] = 1] = "PM";
  })(Meridiem || (Meridiem = {}));
  var Weekday;
  (function(Weekday2) {
    Weekday2[Weekday2["SUNDAY"] = 0] = "SUNDAY";
    Weekday2[Weekday2["MONDAY"] = 1] = "MONDAY";
    Weekday2[Weekday2["TUESDAY"] = 2] = "TUESDAY";
    Weekday2[Weekday2["WEDNESDAY"] = 3] = "WEDNESDAY";
    Weekday2[Weekday2["THURSDAY"] = 4] = "THURSDAY";
    Weekday2[Weekday2["FRIDAY"] = 5] = "FRIDAY";
    Weekday2[Weekday2["SATURDAY"] = 6] = "SATURDAY";
  })(Weekday || (Weekday = {}));
  var Month;
  (function(Month2) {
    Month2[Month2["JANUARY"] = 1] = "JANUARY";
    Month2[Month2["FEBRUARY"] = 2] = "FEBRUARY";
    Month2[Month2["MARCH"] = 3] = "MARCH";
    Month2[Month2["APRIL"] = 4] = "APRIL";
    Month2[Month2["MAY"] = 5] = "MAY";
    Month2[Month2["JUNE"] = 6] = "JUNE";
    Month2[Month2["JULY"] = 7] = "JULY";
    Month2[Month2["AUGUST"] = 8] = "AUGUST";
    Month2[Month2["SEPTEMBER"] = 9] = "SEPTEMBER";
    Month2[Month2["OCTOBER"] = 10] = "OCTOBER";
    Month2[Month2["NOVEMBER"] = 11] = "NOVEMBER";
    Month2[Month2["DECEMBER"] = 12] = "DECEMBER";
  })(Month || (Month = {}));

  // node_modules/chrono-node/dist/esm/utils/dates.js
  function assignSimilarDate(component, target) {
    component.assign("day", target.getDate());
    component.assign("month", target.getMonth() + 1);
    component.assign("year", target.getFullYear());
  }
  function assignSimilarTime(component, target) {
    component.assign("hour", target.getHours());
    component.assign("minute", target.getMinutes());
    component.assign("second", target.getSeconds());
    component.assign("millisecond", target.getMilliseconds());
    component.assign("meridiem", target.getHours() < 12 ? Meridiem.AM : Meridiem.PM);
  }
  function implySimilarDate(component, target) {
    component.imply("day", target.getDate());
    component.imply("month", target.getMonth() + 1);
    component.imply("year", target.getFullYear());
  }
  function implySimilarTime(component, target) {
    component.imply("hour", target.getHours());
    component.imply("minute", target.getMinutes());
    component.imply("second", target.getSeconds());
    component.imply("millisecond", target.getMilliseconds());
    component.imply("meridiem", target.getHours() < 12 ? Meridiem.AM : Meridiem.PM);
  }

  // node_modules/chrono-node/dist/esm/timezone.js
  var TIMEZONE_ABBR_MAP = {
    ACDT: 630,
    ACST: 570,
    ADT: -180,
    AEDT: 660,
    AEST: 600,
    AFT: 270,
    AKDT: -480,
    AKST: -540,
    ALMT: 360,
    AMST: -180,
    AMT: -240,
    ANAST: 720,
    ANAT: 720,
    AQTT: 300,
    ART: -180,
    AST: -240,
    AWDT: 540,
    AWST: 480,
    AZOST: 0,
    AZOT: -60,
    AZST: 300,
    AZT: 240,
    BNT: 480,
    BOT: -240,
    BRST: -120,
    BRT: -180,
    BST: 60,
    BTT: 360,
    CAST: 480,
    CAT: 120,
    CCT: 390,
    CDT: -300,
    CEST: 120,
    CET: {
      timezoneOffsetDuringDst: 2 * 60,
      timezoneOffsetNonDst: 60,
      dstStart: (year) => getLastWeekdayOfMonth(year, Month.MARCH, Weekday.SUNDAY, 2),
      dstEnd: (year) => getLastWeekdayOfMonth(year, Month.OCTOBER, Weekday.SUNDAY, 3)
    },
    CHADT: 825,
    CHAST: 765,
    CKT: -600,
    CLST: -180,
    CLT: -240,
    COT: -300,
    CST: -360,
    CT: {
      timezoneOffsetDuringDst: -5 * 60,
      timezoneOffsetNonDst: -6 * 60,
      dstStart: (year) => getNthWeekdayOfMonth(year, Month.MARCH, Weekday.SUNDAY, 2, 2),
      dstEnd: (year) => getNthWeekdayOfMonth(year, Month.NOVEMBER, Weekday.SUNDAY, 1, 2)
    },
    CVT: -60,
    CXT: 420,
    ChST: 600,
    DAVT: 420,
    EASST: -300,
    EAST: -360,
    EAT: 180,
    ECT: -300,
    EDT: -240,
    EEST: 180,
    EET: 120,
    EGST: 0,
    EGT: -60,
    EST: -300,
    ET: {
      timezoneOffsetDuringDst: -4 * 60,
      timezoneOffsetNonDst: -5 * 60,
      dstStart: (year) => getNthWeekdayOfMonth(year, Month.MARCH, Weekday.SUNDAY, 2, 2),
      dstEnd: (year) => getNthWeekdayOfMonth(year, Month.NOVEMBER, Weekday.SUNDAY, 1, 2)
    },
    FJST: 780,
    FJT: 720,
    FKST: -180,
    FKT: -240,
    FNT: -120,
    GALT: -360,
    GAMT: -540,
    GET: 240,
    GFT: -180,
    GILT: 720,
    GMT: 0,
    GST: 240,
    GYT: -240,
    HAA: -180,
    HAC: -300,
    HADT: -540,
    HAE: -240,
    HAP: -420,
    HAR: -360,
    HAST: -600,
    HAT: -90,
    HAY: -480,
    HKT: 480,
    HLV: -210,
    HNA: -240,
    HNC: -360,
    HNE: -300,
    HNP: -480,
    HNR: -420,
    HNT: -150,
    HNY: -540,
    HOVT: 420,
    ICT: 420,
    IDT: 180,
    IOT: 360,
    IRDT: 270,
    IRKST: 540,
    IRKT: 540,
    IRST: 210,
    IST: 330,
    JST: 540,
    KGT: 360,
    KRAST: 480,
    KRAT: 480,
    KST: 540,
    KUYT: 240,
    LHDT: 660,
    LHST: 630,
    LINT: 840,
    MAGST: 720,
    MAGT: 720,
    MART: -510,
    MAWT: 300,
    MDT: -360,
    MESZ: 120,
    MEZ: 60,
    MHT: 720,
    MMT: 390,
    MSD: 240,
    MSK: 180,
    MST: -420,
    MT: {
      timezoneOffsetDuringDst: -6 * 60,
      timezoneOffsetNonDst: -7 * 60,
      dstStart: (year) => getNthWeekdayOfMonth(year, Month.MARCH, Weekday.SUNDAY, 2, 2),
      dstEnd: (year) => getNthWeekdayOfMonth(year, Month.NOVEMBER, Weekday.SUNDAY, 1, 2)
    },
    MUT: 240,
    MVT: 300,
    MYT: 480,
    NCT: 660,
    NDT: -90,
    NFT: 690,
    NOVST: 420,
    NOVT: 360,
    NPT: 345,
    NST: -150,
    NUT: -660,
    NZDT: 780,
    NZST: 720,
    OMSST: 420,
    OMST: 420,
    PDT: -420,
    PET: -300,
    PETST: 720,
    PETT: 720,
    PGT: 600,
    PHOT: 780,
    PHT: 480,
    PKT: 300,
    PMDT: -120,
    PMST: -180,
    PONT: 660,
    PST: -480,
    PT: {
      timezoneOffsetDuringDst: -7 * 60,
      timezoneOffsetNonDst: -8 * 60,
      dstStart: (year) => getNthWeekdayOfMonth(year, Month.MARCH, Weekday.SUNDAY, 2, 2),
      dstEnd: (year) => getNthWeekdayOfMonth(year, Month.NOVEMBER, Weekday.SUNDAY, 1, 2)
    },
    PWT: 540,
    PYST: -180,
    PYT: -240,
    RET: 240,
    SAMT: 240,
    SAST: 120,
    SBT: 660,
    SCT: 240,
    SGT: 480,
    SRT: -180,
    SST: -660,
    TAHT: -600,
    TFT: 300,
    TJT: 300,
    TKT: 780,
    TLT: 540,
    TMT: 300,
    TVT: 720,
    ULAT: 480,
    UTC: 0,
    UYST: -120,
    UYT: -180,
    UZT: 300,
    VET: -210,
    VLAST: 660,
    VLAT: 660,
    VUT: 660,
    WAST: 120,
    WAT: 60,
    WEST: 60,
    WESZ: 60,
    WET: 0,
    WEZ: 0,
    WFT: 720,
    WGST: -120,
    WGT: -180,
    WIB: 420,
    WIT: 540,
    WITA: 480,
    WST: 780,
    WT: 0,
    YAKST: 600,
    YAKT: 600,
    YAPT: 600,
    YEKST: 360,
    YEKT: 360
  };
  function getNthWeekdayOfMonth(year, month, weekday, n, hour = 0) {
    let dayOfMonth = 0;
    let i = 0;
    while (i < n) {
      dayOfMonth++;
      const date = new Date(year, month - 1, dayOfMonth);
      if (date.getDay() === weekday)
        i++;
    }
    return new Date(year, month - 1, dayOfMonth, hour);
  }
  function getLastWeekdayOfMonth(year, month, weekday, hour = 0) {
    const oneIndexedWeekday = weekday === 0 ? 7 : weekday;
    const date = new Date(year, month - 1 + 1, 1, 12);
    const firstWeekdayNextMonth = date.getDay() === 0 ? 7 : date.getDay();
    let dayDiff;
    if (firstWeekdayNextMonth === oneIndexedWeekday)
      dayDiff = 7;
    else if (firstWeekdayNextMonth < oneIndexedWeekday)
      dayDiff = 7 + firstWeekdayNextMonth - oneIndexedWeekday;
    else
      dayDiff = firstWeekdayNextMonth - oneIndexedWeekday;
    date.setDate(date.getDate() - dayDiff);
    return new Date(year, month - 1, date.getDate(), hour);
  }
  function toTimezoneOffset(timezoneInput, date, timezoneOverrides = {}) {
    if (timezoneInput == null) {
      return null;
    }
    if (typeof timezoneInput === "number") {
      return timezoneInput;
    }
    const matchedTimezone = timezoneOverrides[timezoneInput] ?? TIMEZONE_ABBR_MAP[timezoneInput];
    if (matchedTimezone == null) {
      return null;
    }
    if (typeof matchedTimezone == "number") {
      return matchedTimezone;
    }
    if (date == null) {
      return null;
    }
    if (date > matchedTimezone.dstStart(date.getFullYear()) && !(date > matchedTimezone.dstEnd(date.getFullYear()))) {
      return matchedTimezone.timezoneOffsetDuringDst;
    }
    return matchedTimezone.timezoneOffsetNonDst;
  }

  // node_modules/chrono-node/dist/esm/calculation/duration.js
  var EmptyDuration = {
    day: 0,
    second: 0,
    millisecond: 0
  };
  function addDuration(ref, duration) {
    let date = new Date(ref);
    if (duration["y"]) {
      duration["year"] = duration["y"];
      delete duration["y"];
    }
    if (duration["mo"]) {
      duration["month"] = duration["mo"];
      delete duration["mo"];
    }
    if (duration["M"]) {
      duration["month"] = duration["M"];
      delete duration["M"];
    }
    if (duration["w"]) {
      duration["week"] = duration["w"];
      delete duration["w"];
    }
    if (duration["d"]) {
      duration["day"] = duration["d"];
      delete duration["d"];
    }
    if (duration["h"]) {
      duration["hour"] = duration["h"];
      delete duration["h"];
    }
    if (duration["m"]) {
      duration["minute"] = duration["m"];
      delete duration["m"];
    }
    if (duration["s"]) {
      duration["second"] = duration["s"];
      delete duration["s"];
    }
    if (duration["ms"]) {
      duration["millisecond"] = duration["ms"];
      delete duration["ms"];
    }
    if ("year" in duration) {
      const floor = Math.floor(duration["year"]);
      date.setFullYear(date.getFullYear() + floor);
      const remainingFraction = duration["year"] - floor;
      if (remainingFraction > 0) {
        duration.month = duration?.month ?? 0;
        duration.month += remainingFraction * 12;
      }
    }
    if ("quarter" in duration) {
      const floor = Math.floor(duration["quarter"]);
      date.setMonth(date.getMonth() + floor * 3);
      const remainingFraction = duration["quarter"] - floor;
      if (remainingFraction > 0) {
        duration.month = duration?.month ?? 0;
        duration.month += remainingFraction * 3;
      }
    }
    if ("month" in duration) {
      const floor = Math.floor(duration["month"]);
      date.setMonth(date.getMonth() + floor);
      const remainingFraction = duration["month"] - floor;
      if (remainingFraction > 0) {
        duration.week = duration?.week ?? 0;
        duration.week += remainingFraction * 4;
      }
    }
    if ("week" in duration) {
      const floor = Math.floor(duration["week"]);
      date.setDate(date.getDate() + floor * 7);
      const remainingFraction = duration["week"] - floor;
      if (remainingFraction > 0) {
        duration.day = duration?.day ?? 0;
        duration.day += Math.round(remainingFraction * 7);
      }
    }
    if ("day" in duration) {
      const floor = Math.floor(duration["day"]);
      date.setDate(date.getDate() + floor);
      const remainingFraction = duration["day"] - floor;
      if (remainingFraction > 0) {
        duration.hour = duration?.hour ?? 0;
        duration.hour += Math.round(remainingFraction * 24);
      }
    }
    if ("hour" in duration) {
      const floor = Math.floor(duration["hour"]);
      date.setHours(date.getHours() + floor);
      const remainingFraction = duration["hour"] - floor;
      if (remainingFraction > 0) {
        duration.minute = duration?.minute ?? 0;
        duration.minute += Math.round(remainingFraction * 60);
      }
    }
    if ("minute" in duration) {
      const floor = Math.floor(duration["minute"]);
      date.setMinutes(date.getMinutes() + floor);
      const remainingFraction = duration["minute"] - floor;
      if (remainingFraction > 0) {
        duration.second = duration?.second ?? 0;
        duration.second += Math.round(remainingFraction * 60);
      }
    }
    if ("second" in duration) {
      const floor = Math.floor(duration["second"]);
      date.setSeconds(date.getSeconds() + floor);
      const remainingFraction = duration["second"] - floor;
      if (remainingFraction > 0) {
        duration.millisecond = duration?.millisecond ?? 0;
        duration.millisecond += Math.round(remainingFraction * 1e3);
      }
    }
    if ("millisecond" in duration) {
      const floor = Math.floor(duration["millisecond"]);
      date.setMilliseconds(date.getMilliseconds() + floor);
    }
    return date;
  }
  function reverseDuration(duration) {
    const reversed = {};
    for (const key in duration) {
      reversed[key] = -duration[key];
    }
    return reversed;
  }

  // node_modules/chrono-node/dist/esm/results.js
  var ReferenceWithTimezone = class _ReferenceWithTimezone {
    instant;
    timezoneOffset;
    constructor(instant, timezoneOffset) {
      this.instant = instant ?? /* @__PURE__ */ new Date();
      this.timezoneOffset = timezoneOffset ?? null;
    }
    static fromDate(date) {
      return new _ReferenceWithTimezone(date);
    }
    static fromInput(input, timezoneOverrides) {
      if (input instanceof Date) {
        return _ReferenceWithTimezone.fromDate(input);
      }
      const instant = input?.instant ?? /* @__PURE__ */ new Date();
      const timezoneOffset = toTimezoneOffset(input?.timezone, instant, timezoneOverrides);
      return new _ReferenceWithTimezone(instant, timezoneOffset);
    }
    getDateWithAdjustedTimezone() {
      const date = new Date(this.instant);
      if (this.timezoneOffset !== null) {
        date.setMinutes(date.getMinutes() - this.getSystemTimezoneAdjustmentMinute(this.instant));
      }
      return date;
    }
    getSystemTimezoneAdjustmentMinute(date, overrideTimezoneOffset) {
      if (!date) {
        date = /* @__PURE__ */ new Date();
      }
      const currentTimezoneOffset = -date.getTimezoneOffset();
      const targetTimezoneOffset = overrideTimezoneOffset ?? this.timezoneOffset ?? currentTimezoneOffset;
      return currentTimezoneOffset - targetTimezoneOffset;
    }
    getTimezoneOffset() {
      return this.timezoneOffset ?? -this.instant.getTimezoneOffset();
    }
  };
  var ParsingComponents = class _ParsingComponents {
    knownValues;
    impliedValues;
    reference;
    _tags = /* @__PURE__ */ new Set();
    constructor(reference, knownComponents) {
      this.reference = reference;
      this.knownValues = {};
      this.impliedValues = {};
      if (knownComponents) {
        for (const key in knownComponents) {
          this.knownValues[key] = knownComponents[key];
        }
      }
      const date = reference.getDateWithAdjustedTimezone();
      this.imply("day", date.getDate());
      this.imply("month", date.getMonth() + 1);
      this.imply("year", date.getFullYear());
      this.imply("hour", 12);
      this.imply("minute", 0);
      this.imply("second", 0);
      this.imply("millisecond", 0);
    }
    static createRelativeFromReference(reference, duration = EmptyDuration) {
      let date = addDuration(reference.getDateWithAdjustedTimezone(), duration);
      const components = new _ParsingComponents(reference);
      components.addTag("result/relativeDate");
      if ("hour" in duration || "minute" in duration || "second" in duration || "millisecond" in duration) {
        components.addTag("result/relativeDateAndTime");
        assignSimilarTime(components, date);
        assignSimilarDate(components, date);
        components.assign("timezoneOffset", reference.getTimezoneOffset());
      } else {
        implySimilarTime(components, date);
        components.imply("timezoneOffset", reference.getTimezoneOffset());
        if ("day" in duration) {
          components.assign("day", date.getDate());
          components.assign("month", date.getMonth() + 1);
          components.assign("year", date.getFullYear());
          components.assign("weekday", date.getDay());
        } else if ("week" in duration) {
          components.assign("day", date.getDate());
          components.assign("month", date.getMonth() + 1);
          components.assign("year", date.getFullYear());
          components.imply("weekday", date.getDay());
        } else {
          components.imply("day", date.getDate());
          if ("month" in duration) {
            components.assign("month", date.getMonth() + 1);
            components.assign("year", date.getFullYear());
          } else {
            components.imply("month", date.getMonth() + 1);
            if ("year" in duration) {
              components.assign("year", date.getFullYear());
            } else {
              components.imply("year", date.getFullYear());
            }
          }
        }
      }
      return components;
    }
    get(component) {
      if (component in this.knownValues) {
        return this.knownValues[component];
      }
      if (component in this.impliedValues) {
        return this.impliedValues[component];
      }
      return null;
    }
    isCertain(component) {
      return component in this.knownValues;
    }
    getCertainComponents() {
      return Object.keys(this.knownValues);
    }
    imply(component, value) {
      if (component in this.knownValues) {
        return this;
      }
      this.impliedValues[component] = value;
      return this;
    }
    assign(component, value) {
      this.knownValues[component] = value;
      delete this.impliedValues[component];
      return this;
    }
    addDurationAsImplied(duration) {
      const currentDate = this.dateWithoutTimezoneAdjustment();
      const date = addDuration(currentDate, duration);
      if ("day" in duration || "week" in duration || "month" in duration || "year" in duration) {
        this.delete(["day", "weekday", "month", "year"]);
        this.imply("day", date.getDate());
        this.imply("weekday", date.getDay());
        this.imply("month", date.getMonth() + 1);
        this.imply("year", date.getFullYear());
      }
      if ("second" in duration || "minute" in duration || "hour" in duration) {
        this.delete(["second", "minute", "hour"]);
        this.imply("second", date.getSeconds());
        this.imply("minute", date.getMinutes());
        this.imply("hour", date.getHours());
      }
      return this;
    }
    delete(components) {
      if (typeof components === "string") {
        components = [components];
      }
      for (const component of components) {
        delete this.knownValues[component];
        delete this.impliedValues[component];
      }
    }
    clone() {
      const component = new _ParsingComponents(this.reference);
      component.knownValues = {};
      component.impliedValues = {};
      for (const key in this.knownValues) {
        component.knownValues[key] = this.knownValues[key];
      }
      for (const key in this.impliedValues) {
        component.impliedValues[key] = this.impliedValues[key];
      }
      return component;
    }
    isOnlyDate() {
      return !this.isCertain("hour") && !this.isCertain("minute") && !this.isCertain("second");
    }
    isOnlyTime() {
      return !this.isCertain("weekday") && !this.isCertain("day") && !this.isCertain("month") && !this.isCertain("year");
    }
    isOnlyWeekdayComponent() {
      return this.isCertain("weekday") && !this.isCertain("day") && !this.isCertain("month");
    }
    isDateWithUnknownYear() {
      return this.isCertain("month") && !this.isCertain("year");
    }
    isValidDate() {
      const date = new Date(Date.UTC(this.get("year"), this.get("month") - 1, this.get("day"), this.get("hour"), this.get("minute"), this.get("second"), this.get("millisecond")));
      date.setUTCFullYear(this.get("year"));
      if (date.getUTCFullYear() !== this.get("year"))
        return false;
      if (date.getUTCMonth() !== this.get("month") - 1)
        return false;
      if (date.getUTCDate() !== this.get("day"))
        return false;
      if (this.get("hour") != null && date.getUTCHours() != this.get("hour"))
        return false;
      if (this.get("minute") != null && date.getUTCMinutes() != this.get("minute"))
        return false;
      return true;
    }
    toString() {
      return `[ParsingComponents {
            tags: ${JSON.stringify(Array.from(this._tags).sort())}, 
            knownValues: ${JSON.stringify(this.knownValues)}, 
            impliedValues: ${JSON.stringify(this.impliedValues)}}, 
            reference: ${JSON.stringify(this.reference)}]`;
    }
    date() {
      const timezoneOffset = this.get("timezoneOffset") ?? this.reference.timezoneOffset;
      if (timezoneOffset === null || timezoneOffset === void 0) {
        return this.dateWithoutTimezoneAdjustment();
      }
      const date = new Date(Date.UTC(this.get("year"), this.get("month") - 1, this.get("day"), this.get("hour"), this.get("minute"), this.get("second"), this.get("millisecond")));
      date.setUTCFullYear(this.get("year"));
      return new Date(date.getTime() - timezoneOffset * 6e4);
    }
    addTag(tag) {
      this._tags.add(tag);
      return this;
    }
    addTags(tags) {
      for (const tag of tags) {
        this._tags.add(tag);
      }
      return this;
    }
    tags() {
      return new Set(this._tags);
    }
    dateWithoutTimezoneAdjustment() {
      const date = new Date(this.get("year"), this.get("month") - 1, this.get("day"), this.get("hour"), this.get("minute"), this.get("second"), this.get("millisecond"));
      date.setFullYear(this.get("year"));
      return date;
    }
  };
  var ParsingResult = class _ParsingResult {
    refDate;
    index;
    text;
    reference;
    start;
    end;
    constructor(reference, index, text, start, end) {
      this.reference = reference;
      this.refDate = reference.instant;
      this.index = index;
      this.text = text;
      this.start = start || new ParsingComponents(reference);
      this.end = end;
    }
    clone() {
      const result = new _ParsingResult(this.reference, this.index, this.text);
      result.start = this.start ? this.start.clone() : null;
      result.end = this.end ? this.end.clone() : null;
      return result;
    }
    date() {
      return this.start.date();
    }
    addTag(tag) {
      this.start.addTag(tag);
      if (this.end) {
        this.end.addTag(tag);
      }
      return this;
    }
    addTags(tags) {
      this.start.addTags(tags);
      if (this.end) {
        this.end.addTags(tags);
      }
      return this;
    }
    tags() {
      const combinedTags = new Set(this.start.tags());
      if (this.end) {
        for (const tag of this.end.tags()) {
          combinedTags.add(tag);
        }
      }
      return combinedTags;
    }
    toString() {
      const tags = Array.from(this.tags()).sort();
      return `[ParsingResult {index: ${this.index}, text: '${this.text}', tags: ${JSON.stringify(tags)} ...}]`;
    }
  };

  // node_modules/chrono-node/dist/esm/utils/pattern.js
  function repeatedTimeunitPattern(prefix, singleTimeunitPattern, connectorPattern = "\\s{0,5},?\\s{0,5}") {
    const singleTimeunitPatternNoCapture = singleTimeunitPattern.replace(/\((?!\?)/g, "(?:");
    return `${prefix}${singleTimeunitPatternNoCapture}(?:${connectorPattern}${singleTimeunitPatternNoCapture}){0,10}`;
  }
  function extractTerms(dictionary) {
    let keys;
    if (dictionary instanceof Array) {
      keys = [...dictionary];
    } else if (dictionary instanceof Map) {
      keys = Array.from(dictionary.keys());
    } else {
      keys = Object.keys(dictionary);
    }
    return keys;
  }
  function matchAnyPattern(dictionary) {
    const joinedTerms = extractTerms(dictionary).sort((a, b) => b.length - a.length).join("|").replace(/\./g, "\\.");
    return `(?:${joinedTerms})`;
  }

  // node_modules/chrono-node/dist/esm/calculation/years.js
  function findMostLikelyADYear(yearNumber) {
    if (yearNumber < 100) {
      if (yearNumber > 50) {
        yearNumber = yearNumber + 1900;
      } else {
        yearNumber = yearNumber + 2e3;
      }
    }
    return yearNumber;
  }
  function findYearClosestToRef(refDate, day, month) {
    let date = new Date(refDate);
    date.setMonth(month - 1);
    date.setDate(day);
    const nextYear = addDuration(date, { "year": 1 });
    const lastYear = addDuration(date, { "year": -1 });
    if (Math.abs(nextYear.getTime() - refDate.getTime()) < Math.abs(date.getTime() - refDate.getTime())) {
      date = nextYear;
    } else if (Math.abs(lastYear.getTime() - refDate.getTime()) < Math.abs(date.getTime() - refDate.getTime())) {
      date = lastYear;
    }
    return date.getFullYear();
  }

  // node_modules/chrono-node/dist/esm/locales/en/constants.js
  var WEEKDAY_DICTIONARY = {
    sunday: 0,
    sun: 0,
    "sun.": 0,
    monday: 1,
    mon: 1,
    "mon.": 1,
    tuesday: 2,
    tue: 2,
    "tue.": 2,
    wednesday: 3,
    wed: 3,
    "wed.": 3,
    thursday: 4,
    thurs: 4,
    "thurs.": 4,
    thur: 4,
    "thur.": 4,
    thu: 4,
    "thu.": 4,
    friday: 5,
    fri: 5,
    "fri.": 5,
    saturday: 6,
    sat: 6,
    "sat.": 6
  };
  var FULL_MONTH_NAME_DICTIONARY = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  };
  var MONTH_DICTIONARY = {
    ...FULL_MONTH_NAME_DICTIONARY,
    jan: 1,
    "jan.": 1,
    feb: 2,
    "feb.": 2,
    mar: 3,
    "mar.": 3,
    apr: 4,
    "apr.": 4,
    jun: 6,
    "jun.": 6,
    jul: 7,
    "jul.": 7,
    aug: 8,
    "aug.": 8,
    sep: 9,
    "sep.": 9,
    sept: 9,
    "sept.": 9,
    oct: 10,
    "oct.": 10,
    nov: 11,
    "nov.": 11,
    dec: 12,
    "dec.": 12
  };
  var INTEGER_WORD_DICTIONARY = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12
  };
  var ORDINAL_WORD_DICTIONARY = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14,
    fifteenth: 15,
    sixteenth: 16,
    seventeenth: 17,
    eighteenth: 18,
    nineteenth: 19,
    twentieth: 20,
    "twenty first": 21,
    "twenty-first": 21,
    "twenty second": 22,
    "twenty-second": 22,
    "twenty third": 23,
    "twenty-third": 23,
    "twenty fourth": 24,
    "twenty-fourth": 24,
    "twenty fifth": 25,
    "twenty-fifth": 25,
    "twenty sixth": 26,
    "twenty-sixth": 26,
    "twenty seventh": 27,
    "twenty-seventh": 27,
    "twenty eighth": 28,
    "twenty-eighth": 28,
    "twenty ninth": 29,
    "twenty-ninth": 29,
    "thirtieth": 30,
    "thirty first": 31,
    "thirty-first": 31
  };
  var TIME_UNIT_DICTIONARY_NO_ABBR = {
    second: "second",
    seconds: "second",
    minute: "minute",
    minutes: "minute",
    hour: "hour",
    hours: "hour",
    day: "day",
    days: "day",
    week: "week",
    weeks: "week",
    month: "month",
    months: "month",
    quarter: "quarter",
    quarters: "quarter",
    year: "year",
    years: "year"
  };
  var TIME_UNIT_DICTIONARY = {
    s: "second",
    sec: "second",
    second: "second",
    seconds: "second",
    m: "minute",
    min: "minute",
    mins: "minute",
    minute: "minute",
    minutes: "minute",
    h: "hour",
    hr: "hour",
    hrs: "hour",
    hour: "hour",
    hours: "hour",
    d: "day",
    day: "day",
    days: "day",
    w: "week",
    week: "week",
    weeks: "week",
    mo: "month",
    mon: "month",
    mos: "month",
    month: "month",
    months: "month",
    qtr: "quarter",
    quarter: "quarter",
    quarters: "quarter",
    y: "year",
    yr: "year",
    year: "year",
    years: "year",
    ...TIME_UNIT_DICTIONARY_NO_ABBR
  };
  var NUMBER_PATTERN = `(?:${matchAnyPattern(INTEGER_WORD_DICTIONARY)}|[0-9]+|[0-9]+\\.[0-9]+|half(?:\\s{0,2}an?)?|an?\\b(?:\\s{0,2}few)?|few|several|the|a?\\s{0,2}couple\\s{0,2}(?:of)?)`;
  function parseNumberPattern(match) {
    const num = match.toLowerCase();
    if (INTEGER_WORD_DICTIONARY[num] !== void 0) {
      return INTEGER_WORD_DICTIONARY[num];
    } else if (num === "a" || num === "an" || num == "the") {
      return 1;
    } else if (num.match(/few/)) {
      return 3;
    } else if (num.match(/half/)) {
      return 0.5;
    } else if (num.match(/couple/)) {
      return 2;
    } else if (num.match(/several/)) {
      return 7;
    }
    return parseFloat(num);
  }
  var ORDINAL_NUMBER_PATTERN = `(?:${matchAnyPattern(ORDINAL_WORD_DICTIONARY)}|[0-9]{1,2}(?:st|nd|rd|th)?)`;
  function parseOrdinalNumberPattern(match) {
    let num = match.toLowerCase();
    if (ORDINAL_WORD_DICTIONARY[num] !== void 0) {
      return ORDINAL_WORD_DICTIONARY[num];
    }
    num = num.replace(/(?:st|nd|rd|th)$/i, "");
    return parseInt(num);
  }
  var YEAR_PATTERN = `(?:[1-9][0-9]{0,3}\\s{0,2}(?:BE|AD|BC|BCE|CE)|[1-9][0-9]{3}|[0-9]{2}(?!\\w|:\\d|\\s+(?:am|pm|o\\s*clock|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)))`;
  function parseYear(match) {
    if (/BE/i.test(match)) {
      match = match.replace(/BE/i, "");
      return parseInt(match) - 543;
    }
    if (/BCE?/i.test(match)) {
      match = match.replace(/BCE?/i, "");
      return -parseInt(match);
    }
    if (/(AD|CE)/i.test(match)) {
      match = match.replace(/(AD|CE)/i, "");
      return parseInt(match);
    }
    const rawYearNumber = parseInt(match);
    return findMostLikelyADYear(rawYearNumber);
  }
  var SINGLE_TIME_UNIT_PATTERN = `(${NUMBER_PATTERN})\\s{0,3}(${matchAnyPattern(TIME_UNIT_DICTIONARY)})`;
  var SINGLE_TIME_UNIT_REGEX = new RegExp(SINGLE_TIME_UNIT_PATTERN, "i");
  var SINGLE_TIME_UNIT_NO_ABBR_PATTERN = `(${NUMBER_PATTERN})\\s{0,3}(${matchAnyPattern(TIME_UNIT_DICTIONARY_NO_ABBR)})`;
  var TIME_UNIT_CONNECTOR_PATTERN = `\\s{0,5},?(?:\\s*and)?\\s{0,5}`;
  var TIME_UNITS_PATTERN = repeatedTimeunitPattern(`(?:(?:about|around)\\s{0,3})?`, SINGLE_TIME_UNIT_PATTERN, TIME_UNIT_CONNECTOR_PATTERN);
  var TIME_UNITS_NO_ABBR_PATTERN = repeatedTimeunitPattern(`(?:(?:about|around)\\s{0,3})?`, SINGLE_TIME_UNIT_NO_ABBR_PATTERN, TIME_UNIT_CONNECTOR_PATTERN);
  function parseDuration(timeunitText) {
    const fragments = {};
    let remainingText = timeunitText;
    let match = SINGLE_TIME_UNIT_REGEX.exec(remainingText);
    while (match) {
      collectDateTimeFragment(fragments, match);
      remainingText = remainingText.substring(match[0].length).trim();
      match = SINGLE_TIME_UNIT_REGEX.exec(remainingText);
    }
    if (Object.keys(fragments).length == 0) {
      return null;
    }
    return fragments;
  }
  function collectDateTimeFragment(fragments, match) {
    if (match[0].match(/^[a-zA-Z]+$/)) {
      return;
    }
    const num = parseNumberPattern(match[1]);
    const unit = TIME_UNIT_DICTIONARY[match[2].toLowerCase()];
    fragments[unit] = num;
  }

  // node_modules/chrono-node/dist/esm/common/parsers/AbstractParserWithWordBoundary.js
  var AbstractParserWithWordBoundaryChecking = class {
    innerPatternHasChange(context, currentInnerPattern) {
      return this.innerPattern(context) !== currentInnerPattern;
    }
    patternLeftBoundary() {
      return `(\\W|^)`;
    }
    cachedInnerPattern = null;
    cachedPattern = null;
    pattern(context) {
      if (this.cachedInnerPattern) {
        if (!this.innerPatternHasChange(context, this.cachedInnerPattern)) {
          return this.cachedPattern;
        }
      }
      this.cachedInnerPattern = this.innerPattern(context);
      this.cachedPattern = new RegExp(`${this.patternLeftBoundary()}${this.cachedInnerPattern.source}`, this.cachedInnerPattern.flags);
      return this.cachedPattern;
    }
    extract(context, match) {
      const header = match[1] ?? "";
      match.index = match.index + header.length;
      match[0] = match[0].substring(header.length);
      for (let i = 2; i < match.length; i++) {
        match[i - 1] = match[i];
      }
      return this.innerExtract(context, match);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENTimeUnitWithinFormatParser.js
  var PATTERN_WITH_OPTIONAL_PREFIX = new RegExp(`(?:(?:within|in|for)\\s*)?(?:(?:about|around|roughly|approximately|just)\\s*(?:~\\s*)?)?(${TIME_UNITS_PATTERN})(?=\\W|$)`, "i");
  var PATTERN_WITH_PREFIX = new RegExp(`(?:within|in|for)\\s*(?:(?:about|around|roughly|approximately|just)\\s*(?:~\\s*)?)?(${TIME_UNITS_PATTERN})(?=\\W|$)`, "i");
  var PATTERN_WITH_PREFIX_STRICT = new RegExp(`(?:within|in|for)\\s*(?:(?:about|around|roughly|approximately|just)\\s*(?:~\\s*)?)?(${TIME_UNITS_NO_ABBR_PATTERN})(?=\\W|$)`, "i");
  var ENTimeUnitWithinFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    strictMode;
    constructor(strictMode) {
      super();
      this.strictMode = strictMode;
    }
    innerPattern(context) {
      if (this.strictMode) {
        return PATTERN_WITH_PREFIX_STRICT;
      }
      return context.option.forwardDate ? PATTERN_WITH_OPTIONAL_PREFIX : PATTERN_WITH_PREFIX;
    }
    innerExtract(context, match) {
      if (match[0].match(/^for\s*the\s*\w+/i)) {
        return null;
      }
      const timeUnits = parseDuration(match[1]);
      if (!timeUnits) {
        return null;
      }
      return ParsingComponents.createRelativeFromReference(context.reference, timeUnits);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENMonthNameLittleEndianParser.js
  var PATTERN = new RegExp(`(?:on\\s{0,3})?(${ORDINAL_NUMBER_PATTERN})(?:\\s{0,3}(?:to|\\-|\\\u2013|until|through|till)\\s{0,3}(${ORDINAL_NUMBER_PATTERN}))?(?:-|/|\\s{0,3}(?:of)?\\s{0,3})(${matchAnyPattern(MONTH_DICTIONARY)})(?:(?:-|/|,?\\s{0,3})(${YEAR_PATTERN}(?!\\w)))?(?=\\W|$)`, "i");
  var DATE_GROUP = 1;
  var DATE_TO_GROUP = 2;
  var MONTH_NAME_GROUP = 3;
  var YEAR_GROUP = 4;
  var ENMonthNameLittleEndianParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN;
    }
    innerExtract(context, match) {
      const result = context.createParsingResult(match.index, match[0]);
      const month = MONTH_DICTIONARY[match[MONTH_NAME_GROUP].toLowerCase()];
      const day = parseOrdinalNumberPattern(match[DATE_GROUP]);
      if (day > 31) {
        match.index = match.index + match[DATE_GROUP].length;
        return null;
      }
      result.start.assign("month", month);
      result.start.assign("day", day);
      if (match[YEAR_GROUP]) {
        const yearNumber = parseYear(match[YEAR_GROUP]);
        result.start.assign("year", yearNumber);
      } else {
        const year = findYearClosestToRef(context.refDate, day, month);
        result.start.imply("year", year);
      }
      if (match[DATE_TO_GROUP]) {
        const endDate = parseOrdinalNumberPattern(match[DATE_TO_GROUP]);
        result.end = result.start.clone();
        result.end.assign("day", endDate);
      }
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENMonthNameMiddleEndianParser.js
  var PATTERN2 = new RegExp(`(${matchAnyPattern(MONTH_DICTIONARY)})(?:-|/|\\s*,?\\s*)(${ORDINAL_NUMBER_PATTERN})(?!\\s*(?:am|pm))\\s*(?:(?:to|\\-)\\s*(${ORDINAL_NUMBER_PATTERN})\\s*)?(?:(?:-|/|\\s*,\\s*|\\s+)(${YEAR_PATTERN}))?(?=\\W|$)(?!\\:\\d)`, "i");
  var MONTH_NAME_GROUP2 = 1;
  var DATE_GROUP2 = 2;
  var DATE_TO_GROUP2 = 3;
  var YEAR_GROUP2 = 4;
  var ENMonthNameMiddleEndianParser = class extends AbstractParserWithWordBoundaryChecking {
    shouldSkipYearLikeDate;
    constructor(shouldSkipYearLikeDate) {
      super();
      this.shouldSkipYearLikeDate = shouldSkipYearLikeDate;
    }
    innerPattern() {
      return PATTERN2;
    }
    innerExtract(context, match) {
      const month = MONTH_DICTIONARY[match[MONTH_NAME_GROUP2].toLowerCase()];
      const day = parseOrdinalNumberPattern(match[DATE_GROUP2]);
      if (day > 31) {
        return null;
      }
      if (this.shouldSkipYearLikeDate) {
        if (!match[DATE_TO_GROUP2] && !match[YEAR_GROUP2] && match[DATE_GROUP2].match(/^\d{2}$/)) {
          return null;
        }
      }
      const components = context.createParsingComponents({
        day,
        month
      }).addTag("parser/ENMonthNameMiddleEndianParser");
      if (match[YEAR_GROUP2]) {
        const year = parseYear(match[YEAR_GROUP2]);
        components.assign("year", year);
      } else {
        const year = findYearClosestToRef(context.refDate, day, month);
        components.imply("year", year);
      }
      if (!match[DATE_TO_GROUP2]) {
        return components;
      }
      const endDate = parseOrdinalNumberPattern(match[DATE_TO_GROUP2]);
      const result = context.createParsingResult(match.index, match[0]);
      result.start = components;
      result.end = components.clone();
      result.end.assign("day", endDate);
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENMonthNameParser.js
  var PATTERN3 = new RegExp(`((?:in)\\s*)?(${matchAnyPattern(MONTH_DICTIONARY)})\\s*(?:(?:,|-|of)?\\s*(${YEAR_PATTERN})?)?(?=[^\\s\\w]|\\s+[^0-9]|\\s+$|$)`, "i");
  var PREFIX_GROUP = 1;
  var MONTH_NAME_GROUP3 = 2;
  var YEAR_GROUP3 = 3;
  var ENMonthNameParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN3;
    }
    innerExtract(context, match) {
      const monthName = match[MONTH_NAME_GROUP3].toLowerCase();
      if (match[0].length <= 3 && !FULL_MONTH_NAME_DICTIONARY[monthName]) {
        return null;
      }
      const result = context.createParsingResult(match.index + (match[PREFIX_GROUP] || "").length, match.index + match[0].length);
      result.start.imply("day", 1);
      result.start.addTag("parser/ENMonthNameParser");
      const month = MONTH_DICTIONARY[monthName];
      result.start.assign("month", month);
      if (match[YEAR_GROUP3]) {
        const year = parseYear(match[YEAR_GROUP3]);
        result.start.assign("year", year);
      } else {
        const year = findYearClosestToRef(context.refDate, 1, month);
        result.start.imply("year", year);
      }
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENYearMonthDayParser.js
  var PATTERN4 = new RegExp(`([0-9]{4})[-\\.\\/\\s](?:(${matchAnyPattern(MONTH_DICTIONARY)})|([0-9]{1,2}))[-\\.\\/\\s]([0-9]{1,2})(?=\\W|$)`, "i");
  var YEAR_NUMBER_GROUP = 1;
  var MONTH_NAME_GROUP4 = 2;
  var MONTH_NUMBER_GROUP = 3;
  var DATE_NUMBER_GROUP = 4;
  var ENYearMonthDayParser = class extends AbstractParserWithWordBoundaryChecking {
    strictMonthDateOrder;
    constructor(strictMonthDateOrder) {
      super();
      this.strictMonthDateOrder = strictMonthDateOrder;
    }
    innerPattern() {
      return PATTERN4;
    }
    innerExtract(context, match) {
      const year = parseInt(match[YEAR_NUMBER_GROUP]);
      let day = parseInt(match[DATE_NUMBER_GROUP]);
      let month = match[MONTH_NUMBER_GROUP] ? parseInt(match[MONTH_NUMBER_GROUP]) : MONTH_DICTIONARY[match[MONTH_NAME_GROUP4].toLowerCase()];
      if (month < 1 || month > 12) {
        if (this.strictMonthDateOrder) {
          return null;
        }
        if (day >= 1 && day <= 12) {
          [month, day] = [day, month];
        }
      }
      if (day < 1 || day > 31) {
        return null;
      }
      return {
        day,
        month,
        year
      };
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENYearMonthNameParser.js
  var YEAR_PATTERN2 = `(?:[1-9][0-9]{0,3}\\s{0,2}(?:BE|AD|BC|BCE|CE)|[1-9][0-9]{3})`;
  var PATTERN5 = new RegExp(`(${YEAR_PATTERN2})(?:\\s*[-.\\/,]?\\s*|\\s+of\\s+)(${matchAnyPattern(MONTH_DICTIONARY)})(?=[^\\s\\w]|\\s+[^0-9]|\\s+$|$)`, "i");
  var YEAR_GROUP4 = 1;
  var MONTH_NAME_GROUP5 = 2;
  var ENYearMonthNameParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN5;
    }
    innerExtract(context, match) {
      const year = parseYear(match[YEAR_GROUP4]);
      const monthName = match[MONTH_NAME_GROUP5].toLowerCase();
      const month = MONTH_DICTIONARY[monthName];
      const result = context.createParsingResult(match.index, match[0]);
      result.start.imply("day", 1);
      result.start.assign("month", month);
      result.start.assign("year", year);
      result.start.addTag("parser/ENYearMonthNameParser");
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENSlashMonthFormatParser.js
  var PATTERN6 = new RegExp("([0-9]|0[1-9]|1[012])/([0-9]{4})", "i");
  var MONTH_GROUP = 1;
  var YEAR_GROUP5 = 2;
  var ENSlashMonthFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN6;
    }
    innerExtract(context, match) {
      if (/\d\/?$/.test(context.text.substring(0, match.index))) {
        return null;
      }
      const year = parseInt(match[YEAR_GROUP5]);
      const month = parseInt(match[MONTH_GROUP]);
      return context.createParsingComponents().imply("day", 1).assign("month", month).assign("year", year);
    }
  };

  // node_modules/chrono-node/dist/esm/common/parsers/AbstractTimeExpressionParser.js
  function primaryTimePattern(leftBoundary, primaryPrefix, primarySuffix, flags) {
    return new RegExp(`${leftBoundary}${primaryPrefix}(\\d{1,4})(?:(?:\\.|:|\uFF1A)(\\d{1,2})(?:(?::|\uFF1A)(\\d{2})(?:\\.(\\d{1,6}))?)?)?(?:\\s*(a\\.m\\.|p\\.m\\.|am?|pm?))?${primarySuffix}`, flags);
  }
  function followingTimePatten(followingPhase, followingSuffix) {
    return new RegExp(`^(${followingPhase})(\\d{1,4})(?:(?:\\.|\\:|\\\uFF1A)(\\d{1,2})(?:(?:\\.|\\:|\\\uFF1A)(\\d{1,2})(?:\\.(\\d{1,6}))?)?)?(?:\\s*(a\\.m\\.|p\\.m\\.|am?|pm?))?${followingSuffix}`, "i");
  }
  var HOUR_GROUP = 2;
  var MINUTE_GROUP = 3;
  var SECOND_GROUP = 4;
  var MILLI_SECOND_GROUP = 5;
  var AM_PM_HOUR_GROUP = 6;
  var AbstractTimeExpressionParser = class {
    strictMode;
    constructor(strictMode = false) {
      this.strictMode = strictMode;
    }
    patternFlags() {
      return "i";
    }
    primaryPatternLeftBoundary() {
      return `(^|\\s|T|\\b)`;
    }
    primarySuffix() {
      return `(?!/)(?=\\W|$)`;
    }
    followingSuffix() {
      return `(?!/)(?=\\W|$)`;
    }
    pattern(context) {
      return this.getPrimaryTimePatternThroughCache();
    }
    extract(context, match) {
      const startComponents = this.extractPrimaryTimeComponents(context, match);
      if (!startComponents) {
        if (match[0].match(/^\d{4}/)) {
          match.index += 4;
          return null;
        }
        match.index += match[0].length;
        return null;
      }
      const index = match.index + match[1].length;
      const text = match[0].substring(match[1].length);
      const result = context.createParsingResult(index, text, startComponents);
      match.index += match[0].length;
      const remainingText = context.text.substring(match.index);
      const followingPattern = this.getFollowingTimePatternThroughCache();
      const followingMatch = followingPattern.exec(remainingText);
      if (text.match(/^\d{3,4}/) && followingMatch) {
        if (followingMatch[0].match(/^\s*([+-])\s*\d{2,4}$/)) {
          return null;
        }
        if (followingMatch[0].match(/^\s*([+-])\s*\d{2}\W\d{2}/)) {
          return null;
        }
      }
      if (!followingMatch || followingMatch[0].match(/^\s*([+-])\s*\d{3,4}$/)) {
        return this.checkAndReturnWithoutFollowingPattern(result);
      }
      result.end = this.extractFollowingTimeComponents(context, followingMatch, result);
      if (result.end) {
        result.text += followingMatch[0];
      }
      return this.checkAndReturnWithFollowingPattern(result);
    }
    extractPrimaryTimeComponents(context, match, strict2 = false) {
      const components = context.createParsingComponents();
      let minute = 0;
      let meridiem = null;
      let hour = parseInt(match[HOUR_GROUP]);
      if (hour > 100) {
        if (match[HOUR_GROUP].length == 4 && match[MINUTE_GROUP] == null && !match[AM_PM_HOUR_GROUP]) {
          return null;
        }
        if (this.strictMode || match[MINUTE_GROUP] != null) {
          return null;
        }
        minute = hour % 100;
        hour = Math.floor(hour / 100);
      }
      if (hour > 24) {
        return null;
      }
      if (match[MINUTE_GROUP] != null) {
        if (match[MINUTE_GROUP].length == 1 && !match[AM_PM_HOUR_GROUP]) {
          return null;
        }
        minute = parseInt(match[MINUTE_GROUP]);
      }
      if (minute >= 60) {
        return null;
      }
      if (hour > 12) {
        meridiem = Meridiem.PM;
      }
      if (match[AM_PM_HOUR_GROUP] != null) {
        if (hour > 12)
          return null;
        const ampm = match[AM_PM_HOUR_GROUP][0].toLowerCase();
        if (ampm == "a") {
          meridiem = Meridiem.AM;
          if (hour == 12) {
            hour = 0;
          }
        }
        if (ampm == "p") {
          meridiem = Meridiem.PM;
          if (hour != 12) {
            hour += 12;
          }
        }
      }
      components.assign("hour", hour);
      components.assign("minute", minute);
      if (meridiem !== null) {
        components.assign("meridiem", meridiem);
      } else {
        if (hour < 12) {
          components.imply("meridiem", Meridiem.AM);
        } else {
          components.imply("meridiem", Meridiem.PM);
        }
      }
      if (match[MILLI_SECOND_GROUP] != null) {
        const millisecond = parseInt(match[MILLI_SECOND_GROUP].substring(0, 3));
        if (millisecond >= 1e3)
          return null;
        components.assign("millisecond", millisecond);
      }
      if (match[SECOND_GROUP] != null) {
        const second = parseInt(match[SECOND_GROUP]);
        if (second >= 60)
          return null;
        components.assign("second", second);
      }
      return components;
    }
    extractFollowingTimeComponents(context, match, result) {
      const components = context.createParsingComponents();
      if (match[MILLI_SECOND_GROUP] != null) {
        const millisecond = parseInt(match[MILLI_SECOND_GROUP].substring(0, 3));
        if (millisecond >= 1e3)
          return null;
        components.assign("millisecond", millisecond);
      }
      if (match[SECOND_GROUP] != null) {
        const second = parseInt(match[SECOND_GROUP]);
        if (second >= 60)
          return null;
        components.assign("second", second);
      }
      let hour = parseInt(match[HOUR_GROUP]);
      let minute = 0;
      let meridiem = -1;
      if (match[MINUTE_GROUP] != null) {
        minute = parseInt(match[MINUTE_GROUP]);
      } else if (hour > 100) {
        minute = hour % 100;
        hour = Math.floor(hour / 100);
      }
      if (minute >= 60 || hour > 24) {
        return null;
      }
      if (hour >= 12) {
        meridiem = Meridiem.PM;
      }
      if (match[AM_PM_HOUR_GROUP] != null) {
        if (hour > 12) {
          return null;
        }
        const ampm = match[AM_PM_HOUR_GROUP][0].toLowerCase();
        if (ampm == "a") {
          meridiem = Meridiem.AM;
          if (hour == 12) {
            hour = 0;
            if (!components.isCertain("day")) {
              components.addDurationAsImplied({ day: 1 });
            }
          }
        }
        if (ampm == "p") {
          meridiem = Meridiem.PM;
          if (hour != 12)
            hour += 12;
        }
        if (!result.start.isCertain("meridiem")) {
          if (meridiem == Meridiem.AM) {
            result.start.imply("meridiem", Meridiem.AM);
            if (result.start.get("hour") == 12) {
              result.start.assign("hour", 0);
            }
          } else {
            result.start.imply("meridiem", Meridiem.PM);
            if (result.start.get("hour") != 12) {
              result.start.assign("hour", result.start.get("hour") + 12);
            }
          }
        }
      }
      components.assign("hour", hour);
      components.assign("minute", minute);
      if (meridiem >= 0) {
        components.assign("meridiem", meridiem);
      } else {
        const startAtPM = result.start.isCertain("meridiem") && result.start.get("hour") > 12;
        if (startAtPM) {
          if (result.start.get("hour") - 12 > hour) {
            components.imply("meridiem", Meridiem.AM);
          } else if (hour <= 12) {
            components.assign("hour", hour + 12);
            components.assign("meridiem", Meridiem.PM);
          }
        } else if (hour > 12) {
          components.imply("meridiem", Meridiem.PM);
        } else if (hour <= 12) {
          components.imply("meridiem", Meridiem.AM);
        }
      }
      if (components.date().getTime() < result.start.date().getTime()) {
        components.addDurationAsImplied({ day: 1 });
      }
      return components;
    }
    checkAndReturnWithoutFollowingPattern(result) {
      if (result.text.match(/^\d$/)) {
        return null;
      }
      if (result.text.match(/^\d\d\d+$/)) {
        return null;
      }
      if (result.text.match(/\d[apAP]$/)) {
        return null;
      }
      const endingWithNumbers = result.text.match(/[^\d:.](\d[\d.]+)$/);
      if (endingWithNumbers) {
        const endingNumbers = endingWithNumbers[1];
        if (this.strictMode) {
          return null;
        }
        if (endingNumbers.includes(".") && !endingNumbers.match(/\d(\.\d{2})+$/)) {
          return null;
        }
        const endingNumberVal = parseInt(endingNumbers);
        if (endingNumberVal > 24) {
          return null;
        }
      }
      return result;
    }
    checkAndReturnWithFollowingPattern(result) {
      if (result.text.match(/^\d+-\d+$/)) {
        return null;
      }
      const endingWithNumbers = result.text.match(/[^\d:.](\d[\d.]+)\s*-\s*(\d[\d.]+)$/);
      if (endingWithNumbers) {
        if (this.strictMode) {
          return null;
        }
        const startingNumbers = endingWithNumbers[1];
        const endingNumbers = endingWithNumbers[2];
        if (endingNumbers.includes(".") && !endingNumbers.match(/\d(\.\d{2})+$/)) {
          return null;
        }
        const endingNumberVal = parseInt(endingNumbers);
        const startingNumberVal = parseInt(startingNumbers);
        if (endingNumberVal > 24 || startingNumberVal > 24) {
          return null;
        }
      }
      return result;
    }
    cachedPrimaryPrefix = null;
    cachedPrimarySuffix = null;
    cachedPrimaryTimePattern = null;
    getPrimaryTimePatternThroughCache() {
      const primaryPrefix = this.primaryPrefix();
      const primarySuffix = this.primarySuffix();
      if (this.cachedPrimaryPrefix === primaryPrefix && this.cachedPrimarySuffix === primarySuffix) {
        return this.cachedPrimaryTimePattern;
      }
      this.cachedPrimaryTimePattern = primaryTimePattern(this.primaryPatternLeftBoundary(), primaryPrefix, primarySuffix, this.patternFlags());
      this.cachedPrimaryPrefix = primaryPrefix;
      this.cachedPrimarySuffix = primarySuffix;
      return this.cachedPrimaryTimePattern;
    }
    cachedFollowingPhase = null;
    cachedFollowingSuffix = null;
    cachedFollowingTimePatten = null;
    getFollowingTimePatternThroughCache() {
      const followingPhase = this.followingPhase();
      const followingSuffix = this.followingSuffix();
      if (this.cachedFollowingPhase === followingPhase && this.cachedFollowingSuffix === followingSuffix) {
        return this.cachedFollowingTimePatten;
      }
      this.cachedFollowingTimePatten = followingTimePatten(followingPhase, followingSuffix);
      this.cachedFollowingPhase = followingPhase;
      this.cachedFollowingSuffix = followingSuffix;
      return this.cachedFollowingTimePatten;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENTimeExpressionParser.js
  var ENTimeExpressionParser = class extends AbstractTimeExpressionParser {
    constructor(strictMode) {
      super(strictMode);
    }
    followingPhase() {
      return "\\s*(?:\\-|\\\u2013|\\~|\\\u301C|to|until|through|till|\\?)\\s*";
    }
    primaryPrefix() {
      return "(?:(?:at|from)\\s*)??";
    }
    primarySuffix() {
      return "(?:\\s*(?:o\\W*clock|at\\s*night|in\\s*the\\s*(?:morning|afternoon)))?(?!/)(?=\\W|$)";
    }
    extractPrimaryTimeComponents(context, match) {
      const components = super.extractPrimaryTimeComponents(context, match);
      if (!components) {
        return components;
      }
      if (match[0].endsWith("night")) {
        const hour = components.get("hour");
        if (hour >= 6 && hour < 12) {
          components.assign("hour", components.get("hour") + 12);
          components.assign("meridiem", Meridiem.PM);
        } else if (hour < 6) {
          components.assign("meridiem", Meridiem.AM);
        }
      }
      if (match[0].endsWith("afternoon")) {
        components.assign("meridiem", Meridiem.PM);
        const hour = components.get("hour");
        if (hour >= 0 && hour <= 6) {
          components.assign("hour", components.get("hour") + 12);
        }
      }
      if (match[0].endsWith("morning")) {
        components.assign("meridiem", Meridiem.AM);
        const hour = components.get("hour");
        if (hour < 12) {
          components.assign("hour", components.get("hour"));
        }
      }
      return components.addTag("parser/ENTimeExpressionParser");
    }
    extractFollowingTimeComponents(context, match, result) {
      const followingComponents = super.extractFollowingTimeComponents(context, match, result);
      if (followingComponents) {
        followingComponents.addTag("parser/ENTimeExpressionParser");
      }
      return followingComponents;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENTimeUnitAgoFormatParser.js
  var PATTERN7 = new RegExp(`(${TIME_UNITS_PATTERN})\\s{0,5}(?:ago|before|earlier)(?=\\W|$)`, "i");
  var STRICT_PATTERN = new RegExp(`(${TIME_UNITS_NO_ABBR_PATTERN})\\s{0,5}(?:ago|before|earlier)(?=\\W|$)`, "i");
  var ENTimeUnitAgoFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    strictMode;
    constructor(strictMode) {
      super();
      this.strictMode = strictMode;
    }
    innerPattern() {
      return this.strictMode ? STRICT_PATTERN : PATTERN7;
    }
    innerExtract(context, match) {
      const duration = parseDuration(match[1]);
      if (!duration) {
        return null;
      }
      return ParsingComponents.createRelativeFromReference(context.reference, reverseDuration(duration));
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENTimeUnitLaterFormatParser.js
  var PATTERN8 = new RegExp(`(${TIME_UNITS_PATTERN})\\s{0,5}(?:later|after|from now|henceforth|forward|out)(?=(?:\\W|$))`, "i");
  var STRICT_PATTERN2 = new RegExp(`(${TIME_UNITS_NO_ABBR_PATTERN})\\s{0,5}(later|after|from now)(?=\\W|$)`, "i");
  var GROUP_NUM_TIMEUNITS = 1;
  var ENTimeUnitLaterFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    strictMode;
    constructor(strictMode) {
      super();
      this.strictMode = strictMode;
    }
    innerPattern() {
      return this.strictMode ? STRICT_PATTERN2 : PATTERN8;
    }
    innerExtract(context, match) {
      const timeUnits = parseDuration(match[GROUP_NUM_TIMEUNITS]);
      if (!timeUnits) {
        return null;
      }
      return ParsingComponents.createRelativeFromReference(context.reference, timeUnits);
    }
  };

  // node_modules/chrono-node/dist/esm/common/abstractRefiners.js
  var Filter = class {
    refine(context, results) {
      return results.filter((r) => this.isValid(context, r));
    }
  };
  var MergingRefiner = class {
    refine(context, results) {
      if (results.length < 2) {
        return results;
      }
      const mergedResults = [];
      let curResult = results[0];
      let nextResult = null;
      for (let i = 1; i < results.length; i++) {
        nextResult = results[i];
        const textBetween = context.text.substring(curResult.index + curResult.text.length, nextResult.index);
        if (!this.shouldMergeResults(textBetween, curResult, nextResult, context)) {
          mergedResults.push(curResult);
          curResult = nextResult;
        } else {
          const left = curResult;
          const right = nextResult;
          const mergedResult = this.mergeResults(textBetween, left, right, context);
          context.debug(() => {
            console.log(`${this.constructor.name} merged ${left} and ${right} into ${mergedResult}`);
          });
          curResult = mergedResult;
        }
      }
      if (curResult != null) {
        mergedResults.push(curResult);
      }
      return mergedResults;
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/AbstractMergeDateRangeRefiner.js
  var AbstractMergeDateRangeRefiner = class extends MergingRefiner {
    shouldMergeResults(textBetween, currentResult, nextResult) {
      return !currentResult.end && !nextResult.end && textBetween.match(this.patternBetween()) != null;
    }
    mergeResults(textBetween, fromResult, toResult) {
      if (!fromResult.start.isOnlyWeekdayComponent() && !toResult.start.isOnlyWeekdayComponent()) {
        toResult.start.getCertainComponents().forEach((key) => {
          if (!fromResult.start.isCertain(key)) {
            fromResult.start.imply(key, toResult.start.get(key));
          }
        });
        fromResult.start.getCertainComponents().forEach((key) => {
          if (!toResult.start.isCertain(key)) {
            toResult.start.imply(key, fromResult.start.get(key));
          }
        });
      }
      if (fromResult.start.date() > toResult.start.date()) {
        let fromDate = fromResult.start.date();
        let toDate = toResult.start.date();
        if (toResult.start.isOnlyWeekdayComponent() && addDuration(toDate, { day: 7 }) > fromDate) {
          toDate = addDuration(toDate, { day: 7 });
          toResult.start.imply("day", toDate.getDate());
          toResult.start.imply("month", toDate.getMonth() + 1);
          toResult.start.imply("year", toDate.getFullYear());
        } else if (fromResult.start.isOnlyWeekdayComponent() && addDuration(fromDate, { day: -7 }) < toDate) {
          fromDate = addDuration(fromDate, { day: -7 });
          fromResult.start.imply("day", fromDate.getDate());
          fromResult.start.imply("month", fromDate.getMonth() + 1);
          fromResult.start.imply("year", fromDate.getFullYear());
        } else if (toResult.start.isDateWithUnknownYear() && addDuration(toDate, { year: 1 }) > fromDate) {
          toDate = addDuration(toDate, { year: 1 });
          toResult.start.imply("year", toDate.getFullYear());
        } else if (fromResult.start.isDateWithUnknownYear() && addDuration(fromDate, { year: -1 }) < toDate) {
          fromDate = addDuration(fromDate, { year: -1 });
          fromResult.start.imply("year", fromDate.getFullYear());
        } else {
          [toResult, fromResult] = [fromResult, toResult];
        }
      }
      const result = fromResult.clone();
      result.start = fromResult.start;
      result.end = toResult.start;
      result.index = Math.min(fromResult.index, toResult.index);
      if (fromResult.index < toResult.index) {
        result.text = fromResult.text + textBetween + toResult.text;
      } else {
        result.text = toResult.text + textBetween + fromResult.text;
      }
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENMergeDateRangeRefiner.js
  var ENMergeDateRangeRefiner = class extends AbstractMergeDateRangeRefiner {
    patternBetween() {
      return /^\s*(to|-|–|until|through|till)\s*$/i;
    }
  };

  // node_modules/chrono-node/dist/esm/calculation/mergingCalculation.js
  function mergeDateTimeResult(dateResult, timeResult) {
    const result = dateResult.clone();
    const beginDate = dateResult.start;
    const beginTime = timeResult.start;
    result.start = mergeDateTimeComponent(beginDate, beginTime);
    if (dateResult.end != null || timeResult.end != null) {
      const endDate = dateResult.end == null ? dateResult.start : dateResult.end;
      const endTime = timeResult.end == null ? timeResult.start : timeResult.end;
      const endDateTime = mergeDateTimeComponent(endDate, endTime);
      if (dateResult.end == null && endDateTime.date().getTime() < result.start.date().getTime()) {
        const nextDay = new Date(endDateTime.date().getTime());
        nextDay.setDate(nextDay.getDate() + 1);
        if (endDateTime.isCertain("day")) {
          assignSimilarDate(endDateTime, nextDay);
        } else {
          implySimilarDate(endDateTime, nextDay);
        }
      }
      result.end = endDateTime;
    }
    return result;
  }
  function mergeDateTimeComponent(dateComponent, timeComponent) {
    const dateTimeComponent = dateComponent.clone();
    if (timeComponent.isCertain("hour")) {
      dateTimeComponent.assign("hour", timeComponent.get("hour"));
      dateTimeComponent.assign("minute", timeComponent.get("minute"));
      if (timeComponent.isCertain("second")) {
        dateTimeComponent.assign("second", timeComponent.get("second"));
        if (timeComponent.isCertain("millisecond")) {
          dateTimeComponent.assign("millisecond", timeComponent.get("millisecond"));
        } else {
          dateTimeComponent.imply("millisecond", timeComponent.get("millisecond"));
        }
      } else {
        dateTimeComponent.imply("second", timeComponent.get("second"));
        dateTimeComponent.imply("millisecond", timeComponent.get("millisecond"));
      }
    } else {
      dateTimeComponent.imply("hour", timeComponent.get("hour"));
      dateTimeComponent.imply("minute", timeComponent.get("minute"));
      dateTimeComponent.imply("second", timeComponent.get("second"));
      dateTimeComponent.imply("millisecond", timeComponent.get("millisecond"));
    }
    if (timeComponent.isCertain("timezoneOffset")) {
      dateTimeComponent.assign("timezoneOffset", timeComponent.get("timezoneOffset"));
    }
    const dateHasMeaningfulMeridiem = dateComponent.get("meridiem") != null && (dateComponent.isCertain("meridiem") || Array.from(dateComponent.tags()).some((t) => t.startsWith("casualReference/")));
    if (timeComponent.isCertain("meridiem")) {
      dateTimeComponent.assign("meridiem", timeComponent.get("meridiem"));
    } else if (timeComponent.get("meridiem") != null && !dateHasMeaningfulMeridiem) {
      dateTimeComponent.imply("meridiem", timeComponent.get("meridiem"));
    }
    if (dateTimeComponent.get("meridiem") == Meridiem.PM && dateTimeComponent.get("hour") < 12) {
      if (timeComponent.isCertain("hour")) {
        dateTimeComponent.assign("hour", dateTimeComponent.get("hour") + 12);
      } else {
        dateTimeComponent.imply("hour", dateTimeComponent.get("hour") + 12);
      }
    }
    dateTimeComponent.addTags(dateComponent.tags());
    dateTimeComponent.addTags(timeComponent.tags());
    return dateTimeComponent;
  }

  // node_modules/chrono-node/dist/esm/common/refiners/AbstractMergeDateTimeRefiner.js
  var AbstractMergeDateTimeRefiner = class extends MergingRefiner {
    shouldMergeResults(textBetween, currentResult, nextResult) {
      const isDateThenTime = currentResult.start.isOnlyDate() && nextResult.start.isOnlyTime();
      const isTimeThenDate = currentResult.start.isOnlyTime() && nextResult.start.isOnlyDate();
      if (isTimeThenDate && textBetween.trim() === ":") {
        return false;
      }
      return (isDateThenTime || isTimeThenDate) && textBetween.match(this.patternBetween()) != null;
    }
    mergeResults(textBetween, currentResult, nextResult) {
      const result = currentResult.start.isOnlyDate() ? mergeDateTimeResult(currentResult, nextResult) : mergeDateTimeResult(nextResult, currentResult);
      result.index = currentResult.index;
      result.text = currentResult.text + textBetween + nextResult.text;
      return result;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENMergeDateTimeRefiner.js
  var ENMergeDateTimeRefiner = class extends AbstractMergeDateTimeRefiner {
    patternBetween() {
      return new RegExp("^\\s*(T|at|after|before|on|of|,|-|\\.|\u2219|:)?\\s*$");
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/ExtractTimezoneAbbrRefiner.js
  var TIMEZONE_NAME_PATTERN = new RegExp("^\\s*,?\\s*\\(?([A-Z]{2,4})\\)?(?=\\W|$)", "i");
  var ExtractTimezoneAbbrRefiner = class {
    timezoneOverrides;
    constructor(timezoneOverrides) {
      this.timezoneOverrides = timezoneOverrides;
    }
    refine(context, results) {
      const timezoneOverrides = context.option.timezones ?? {};
      results.forEach((result) => {
        const suffix = context.text.substring(result.index + result.text.length);
        const match = TIMEZONE_NAME_PATTERN.exec(suffix);
        if (!match) {
          return;
        }
        const timezoneAbbr = match[1].toUpperCase();
        const refDate = result.start.date() ?? result.refDate ?? /* @__PURE__ */ new Date();
        const tzOverrides = { ...this.timezoneOverrides, ...timezoneOverrides };
        const extractedTimezoneOffset = toTimezoneOffset(timezoneAbbr, refDate, tzOverrides);
        if (extractedTimezoneOffset == null) {
          return;
        }
        context.debug(() => {
          console.log(`Extracting timezone: '${timezoneAbbr}' into: ${extractedTimezoneOffset} for: ${result.start}`);
        });
        const currentTimezoneOffset = result.start.get("timezoneOffset");
        if (currentTimezoneOffset !== null && extractedTimezoneOffset != currentTimezoneOffset) {
          if (result.start.isCertain("timezoneOffset")) {
            return;
          }
          if (timezoneAbbr != match[1]) {
            return;
          }
        }
        if (result.start.isOnlyDate()) {
          if (timezoneAbbr != match[1]) {
            return;
          }
        }
        result.text += match[0];
        if (!result.start.isCertain("timezoneOffset")) {
          result.start.assign("timezoneOffset", extractedTimezoneOffset);
        }
        if (result.end != null && !result.end.isCertain("timezoneOffset")) {
          result.end.assign("timezoneOffset", extractedTimezoneOffset);
        }
      });
      return results;
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/ExtractTimezoneOffsetRefiner.js
  var TIMEZONE_OFFSET_PATTERN = new RegExp("^\\s*(?:\\(?(?:GMT|UTC)\\s?)?([+-])(\\d{1,2})(?::?(\\d{2}))?\\)?", "i");
  var TIMEZONE_OFFSET_SIGN_GROUP = 1;
  var TIMEZONE_OFFSET_HOUR_OFFSET_GROUP = 2;
  var TIMEZONE_OFFSET_MINUTE_OFFSET_GROUP = 3;
  var ExtractTimezoneOffsetRefiner = class {
    refine(context, results) {
      results.forEach(function(result) {
        if (result.start.isCertain("timezoneOffset")) {
          return;
        }
        const suffix = context.text.substring(result.index + result.text.length);
        const match = TIMEZONE_OFFSET_PATTERN.exec(suffix);
        if (!match) {
          return;
        }
        context.debug(() => {
          console.log(`Extracting timezone: '${match[0]}' into : ${result}`);
        });
        const hourOffset = parseInt(match[TIMEZONE_OFFSET_HOUR_OFFSET_GROUP]);
        const minuteOffset = parseInt(match[TIMEZONE_OFFSET_MINUTE_OFFSET_GROUP] || "0");
        let timezoneOffset = hourOffset * 60 + minuteOffset;
        if (timezoneOffset > 14 * 60) {
          return;
        }
        if (match[TIMEZONE_OFFSET_SIGN_GROUP] === "-") {
          timezoneOffset = -timezoneOffset;
        }
        if (result.end != null) {
          result.end.assign("timezoneOffset", timezoneOffset);
        }
        result.start.assign("timezoneOffset", timezoneOffset);
        result.text += match[0];
      });
      return results;
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/OverlapRemovalRefiner.js
  var OverlapRemovalRefiner = class {
    refine(context, results) {
      if (results.length < 2) {
        return results;
      }
      const filteredResults = [];
      let prevResult = results[0];
      for (let i = 1; i < results.length; i++) {
        const result = results[i];
        if (result.index >= prevResult.index + prevResult.text.length) {
          filteredResults.push(prevResult);
          prevResult = result;
          continue;
        }
        let kept = null;
        let removed = null;
        if (result.text.length > prevResult.text.length) {
          kept = result;
          removed = prevResult;
        } else {
          kept = prevResult;
          removed = result;
        }
        context.debug(() => {
          console.log(`${this.constructor.name} remove ${removed} by ${kept}`);
        });
        prevResult = kept;
      }
      if (prevResult != null) {
        filteredResults.push(prevResult);
      }
      return filteredResults;
    }
  };

  // node_modules/chrono-node/dist/esm/calculation/weekdays.js
  function createParsingComponentsAtWeekday(reference, weekday, modifier) {
    const refDate = reference.getDateWithAdjustedTimezone();
    const daysToWeekday = getDaysToWeekday(refDate, weekday, modifier);
    let components = new ParsingComponents(reference);
    components = components.addDurationAsImplied({ day: daysToWeekday });
    components.assign("weekday", weekday);
    return components;
  }
  function getDaysToWeekday(refDate, weekday, modifier) {
    const refWeekday = refDate.getDay();
    switch (modifier) {
      case "this":
        return getDaysForwardToWeekday(refDate, weekday);
      case "last":
        return getBackwardDaysToWeekday(refDate, weekday);
      case "next":
        if (refWeekday == Weekday.SUNDAY) {
          return weekday == Weekday.SUNDAY ? 7 : weekday;
        }
        if (refWeekday == Weekday.SATURDAY) {
          if (weekday == Weekday.SATURDAY)
            return 7;
          if (weekday == Weekday.SUNDAY)
            return 8;
          return 1 + weekday;
        }
        if (weekday < refWeekday && weekday != Weekday.SUNDAY) {
          return getDaysForwardToWeekday(refDate, weekday);
        } else {
          return getDaysForwardToWeekday(refDate, weekday) + 7;
        }
    }
    return getDaysToWeekdayClosest(refDate, weekday);
  }
  function getDaysToWeekdayClosest(refDate, weekday) {
    const backward = getBackwardDaysToWeekday(refDate, weekday);
    const forward = getDaysForwardToWeekday(refDate, weekday);
    return forward < -backward ? forward : backward;
  }
  function getDaysForwardToWeekday(refDate, weekday) {
    const refWeekday = refDate.getDay();
    let forwardCount = weekday - refWeekday;
    if (forwardCount < 0) {
      forwardCount += 7;
    }
    return forwardCount;
  }
  function getBackwardDaysToWeekday(refDate, weekday) {
    const refWeekday = refDate.getDay();
    let backwardCount = weekday - refWeekday;
    if (backwardCount >= 0) {
      backwardCount -= 7;
    }
    return backwardCount;
  }

  // node_modules/chrono-node/dist/esm/common/refiners/ForwardDateRefiner.js
  var ForwardDateRefiner = class {
    refine(context, results) {
      if (!context.option.forwardDate) {
        return results;
      }
      results.forEach((result) => {
        let refDate = context.reference.getDateWithAdjustedTimezone();
        if (result.start.isOnlyTime() && context.reference.instant > result.start.date()) {
          const refDate2 = context.reference.getDateWithAdjustedTimezone();
          const refFollowingDay = new Date(refDate2);
          refFollowingDay.setDate(refFollowingDay.getDate() + 1);
          implySimilarDate(result.start, refFollowingDay);
          context.debug(() => {
            console.log(`${this.constructor.name} adjusted ${result} time from the ref date (${refDate2}) to the following day (${refFollowingDay})`);
          });
          if (result.end && result.end.isOnlyTime()) {
            implySimilarDate(result.end, refFollowingDay);
            if (result.start.date() > result.end.date()) {
              refFollowingDay.setDate(refFollowingDay.getDate() + 1);
              implySimilarDate(result.end, refFollowingDay);
            }
          }
        }
        if (result.start.isOnlyWeekdayComponent() && refDate > result.start.date()) {
          let daysToAdd = getDaysForwardToWeekday(refDate, result.start.get("weekday")) || 7;
          const forwardedWeekday = addDuration(refDate, { day: daysToAdd });
          implySimilarDate(result.start, forwardedWeekday);
          context.debug(() => {
            console.log(`${this.constructor.name} adjusted ${result} weekday (${result.start})`);
          });
          if (result.end && result.start.date() > result.end.date()) {
            let daysToAdd2 = getDaysForwardToWeekday(refDate, result.start.get("weekday")) || 7;
            const forwardedWeekday2 = addDuration(refDate, { day: daysToAdd2 });
            implySimilarDate(result.end, forwardedWeekday2);
            context.debug(() => {
              console.log(`${this.constructor.name} adjusted ${result} weekday (${result.end})`);
            });
          }
        }
        if (result.start.isDateWithUnknownYear() && refDate > result.start.date()) {
          for (let i = 0; i < 3 && refDate > result.start.date(); i++) {
            result.start.imply("year", result.start.get("year") + 1);
            context.debug(() => {
              console.log(`${this.constructor.name} adjusted ${result} year (${result.start})`);
            });
            if (result.end && !result.end.isCertain("year")) {
              result.end.imply("year", result.end.get("year") + 1);
              context.debug(() => {
                console.log(`${this.constructor.name} adjusted ${result} month (${result.start})`);
              });
            }
          }
        }
      });
      return results;
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/UnlikelyFormatFilter.js
  var UnlikelyFormatFilter = class extends Filter {
    strictMode;
    constructor(strictMode) {
      super();
      this.strictMode = strictMode;
    }
    isValid(context, result) {
      if (result.text.replace(" ", "").match(/^\d*(\.\d*)?$/)) {
        context.debug(() => {
          console.log(`Removing unlikely result '${result.text}'`);
        });
        return false;
      }
      if (!result.start.isValidDate()) {
        context.debug(() => {
          console.log(`Removing invalid result: ${result} (${result.start})`);
        });
        return false;
      }
      if (result.end && !result.end.isValidDate()) {
        context.debug(() => {
          console.log(`Removing invalid result: ${result} (${result.end})`);
        });
        return false;
      }
      if (this.strictMode) {
        return this.isStrictModeValid(context, result);
      }
      return true;
    }
    isStrictModeValid(context, result) {
      if (result.start.isOnlyWeekdayComponent()) {
        context.debug(() => {
          console.log(`(Strict) Removing weekday only component: ${result} (${result.end})`);
        });
        return false;
      }
      return true;
    }
  };

  // node_modules/chrono-node/dist/esm/common/parsers/ISOFormatParser.js
  var PATTERN9 = new RegExp("([0-9]{4})\\-([0-9]{1,2})\\-([0-9]{1,2})(?:T([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2})(?:\\.(\\d{1,4}))?)?(Z|([+-]\\d{2}):?(\\d{2})?)?)?(?=\\W|$)", "i");
  var YEAR_NUMBER_GROUP2 = 1;
  var MONTH_NUMBER_GROUP2 = 2;
  var DATE_NUMBER_GROUP2 = 3;
  var HOUR_NUMBER_GROUP = 4;
  var MINUTE_NUMBER_GROUP = 5;
  var SECOND_NUMBER_GROUP = 6;
  var MILLISECOND_NUMBER_GROUP = 7;
  var TZD_GROUP = 8;
  var TZD_HOUR_OFFSET_GROUP = 9;
  var TZD_MINUTE_OFFSET_GROUP = 10;
  var ISOFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN9;
    }
    innerExtract(context, match) {
      const components = context.createParsingComponents({
        "year": parseInt(match[YEAR_NUMBER_GROUP2]),
        "month": parseInt(match[MONTH_NUMBER_GROUP2]),
        "day": parseInt(match[DATE_NUMBER_GROUP2])
      });
      if (match[HOUR_NUMBER_GROUP] != null) {
        components.assign("hour", parseInt(match[HOUR_NUMBER_GROUP]));
        components.assign("minute", parseInt(match[MINUTE_NUMBER_GROUP]));
        if (match[SECOND_NUMBER_GROUP] != null) {
          components.assign("second", parseInt(match[SECOND_NUMBER_GROUP]));
        }
        if (match[MILLISECOND_NUMBER_GROUP] != null) {
          components.assign("millisecond", parseInt(match[MILLISECOND_NUMBER_GROUP]));
        }
        if (match[TZD_GROUP] != null) {
          let offset = 0;
          if (match[TZD_HOUR_OFFSET_GROUP]) {
            const hourOffset = parseInt(match[TZD_HOUR_OFFSET_GROUP]);
            let minuteOffset = 0;
            if (match[TZD_MINUTE_OFFSET_GROUP] != null) {
              minuteOffset = parseInt(match[TZD_MINUTE_OFFSET_GROUP]);
            }
            offset = hourOffset * 60;
            if (offset < 0) {
              offset -= minuteOffset;
            } else {
              offset += minuteOffset;
            }
          }
          components.assign("timezoneOffset", offset);
        }
      }
      return components.addTag("parser/ISOFormatParser");
    }
  };

  // node_modules/chrono-node/dist/esm/common/refiners/MergeWeekdayComponentRefiner.js
  var MergeWeekdayComponentRefiner = class extends MergingRefiner {
    mergeResults(textBetween, currentResult, nextResult) {
      const newResult = nextResult.clone();
      newResult.index = currentResult.index;
      newResult.text = currentResult.text + textBetween + newResult.text;
      newResult.start.assign("weekday", currentResult.start.get("weekday"));
      if (newResult.end) {
        newResult.end.assign("weekday", currentResult.start.get("weekday"));
      }
      return newResult;
    }
    shouldMergeResults(textBetween, currentResult, nextResult) {
      const weekdayThenNormalDate = currentResult.start.isOnlyWeekdayComponent() && !currentResult.start.isCertain("hour") && nextResult.start.isCertain("day") && !nextResult.start.tags().has("result/relativeDate");
      return weekdayThenNormalDate && textBetween.match(/^,?\s*$/) != null;
    }
  };

  // node_modules/chrono-node/dist/esm/configurations.js
  function includeCommonConfiguration(configuration2, strictMode = false) {
    configuration2.parsers.unshift(new ISOFormatParser());
    configuration2.refiners.unshift(new MergeWeekdayComponentRefiner());
    configuration2.refiners.unshift(new ExtractTimezoneOffsetRefiner());
    configuration2.refiners.unshift(new OverlapRemovalRefiner());
    configuration2.refiners.push(new ExtractTimezoneAbbrRefiner());
    configuration2.refiners.push(new OverlapRemovalRefiner());
    configuration2.refiners.push(new ForwardDateRefiner());
    configuration2.refiners.push(new UnlikelyFormatFilter(strictMode));
    return configuration2;
  }

  // node_modules/chrono-node/dist/esm/common/casualReferences.js
  function now(reference) {
    const targetDate = reference.getDateWithAdjustedTimezone();
    const component = new ParsingComponents(reference, {});
    assignSimilarDate(component, targetDate);
    assignSimilarTime(component, targetDate);
    component.assign("timezoneOffset", reference.getTimezoneOffset());
    component.addTag("casualReference/now");
    return component;
  }
  function today(reference) {
    const targetDate = reference.getDateWithAdjustedTimezone();
    const component = new ParsingComponents(reference, {});
    assignSimilarDate(component, targetDate);
    implySimilarTime(component, targetDate);
    component.delete("meridiem");
    component.addTag("casualReference/today");
    return component;
  }
  function yesterday(reference) {
    return theDayBefore(reference, 1).addTag("casualReference/yesterday");
  }
  function tomorrow(reference) {
    return theDayAfter(reference, 1).addTag("casualReference/tomorrow");
  }
  function theDayBefore(reference, numDay) {
    return theDayAfter(reference, -numDay);
  }
  function theDayAfter(reference, nDays) {
    const targetDate = reference.getDateWithAdjustedTimezone();
    const component = new ParsingComponents(reference, {});
    const newDate = new Date(targetDate.getTime());
    newDate.setDate(newDate.getDate() + nDays);
    assignSimilarDate(component, newDate);
    implySimilarTime(component, newDate);
    component.delete("meridiem");
    return component;
  }
  function tonight(reference, implyHour = 22) {
    const targetDate = reference.getDateWithAdjustedTimezone();
    const component = new ParsingComponents(reference, {});
    assignSimilarDate(component, targetDate);
    component.imply("hour", implyHour);
    component.imply("meridiem", Meridiem.PM);
    component.addTag("casualReference/tonight");
    return component;
  }
  function evening(reference, implyHour = 20) {
    const component = new ParsingComponents(reference, {});
    component.imply("meridiem", Meridiem.PM);
    component.imply("hour", implyHour);
    component.addTag("casualReference/evening");
    return component;
  }
  function midnight(reference) {
    const component = new ParsingComponents(reference, {});
    if (reference.getDateWithAdjustedTimezone().getHours() > 2) {
      component.addDurationAsImplied({ day: 1 });
    }
    component.assign("hour", 0);
    component.imply("minute", 0);
    component.imply("second", 0);
    component.imply("millisecond", 0);
    component.addTag("casualReference/midnight");
    return component;
  }
  function morning(reference, implyHour = 6) {
    const component = new ParsingComponents(reference, {});
    component.imply("meridiem", Meridiem.AM);
    component.imply("hour", implyHour);
    component.imply("minute", 0);
    component.imply("second", 0);
    component.imply("millisecond", 0);
    component.addTag("casualReference/morning");
    return component;
  }
  function afternoon(reference, implyHour = 15) {
    const component = new ParsingComponents(reference, {});
    component.imply("meridiem", Meridiem.PM);
    component.imply("hour", implyHour);
    component.imply("minute", 0);
    component.imply("second", 0);
    component.imply("millisecond", 0);
    component.addTag("casualReference/afternoon");
    return component;
  }
  function noon(reference) {
    const component = new ParsingComponents(reference, {});
    component.imply("meridiem", Meridiem.AM);
    component.assign("hour", 12);
    component.imply("minute", 0);
    component.imply("second", 0);
    component.imply("millisecond", 0);
    component.addTag("casualReference/noon");
    return component;
  }

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENCasualDateParser.js
  var PATTERN10 = /(now|today|tonight|tomorrow|overmorrow|tmr|tmrw|yesterday|last\s*night)(?=\W|$)/i;
  var ENCasualDateParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern(context) {
      return PATTERN10;
    }
    innerExtract(context, match) {
      let targetDate = context.refDate;
      const lowerText = match[0].toLowerCase();
      let component = context.createParsingComponents();
      switch (lowerText) {
        case "now":
          component = now(context.reference);
          break;
        case "today":
          component = today(context.reference);
          break;
        case "yesterday":
          component = yesterday(context.reference);
          break;
        case "tomorrow":
        case "tmr":
        case "tmrw":
          component = tomorrow(context.reference);
          break;
        case "tonight":
          component = tonight(context.reference);
          break;
        case "overmorrow":
          component = theDayAfter(context.reference, 2);
          break;
        default:
          if (lowerText.match(/last\s*night/)) {
            if (targetDate.getHours() > 6) {
              const previousDay = new Date(targetDate.getTime());
              previousDay.setDate(previousDay.getDate() - 1);
              targetDate = previousDay;
            }
            assignSimilarDate(component, targetDate);
            component.imply("hour", 0);
          }
          break;
      }
      component.addTag("parser/ENCasualDateParser");
      return component;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENCasualTimeParser.js
  var PATTERN11 = /(?:this)?\s{0,3}(morning|afternoon|evening|night|midnight|midday|noon)(?=\W|$)/i;
  var ENCasualTimeParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN11;
    }
    innerExtract(context, match) {
      let component = null;
      switch (match[1].toLowerCase()) {
        case "afternoon":
          component = afternoon(context.reference);
          break;
        case "evening":
        case "night":
          component = evening(context.reference);
          break;
        case "midnight":
          component = midnight(context.reference);
          break;
        case "morning":
          component = morning(context.reference);
          break;
        case "noon":
        case "midday":
          component = noon(context.reference);
          break;
      }
      if (component) {
        component.addTag("parser/ENCasualTimeParser");
      }
      return component;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENWeekdayParser.js
  var PATTERN12 = new RegExp(`(?:(?:\\,|\\(|\\\uFF08)\\s*)?(?:on\\s*?)?(?:(this|last|past|next)\\s*)?(${matchAnyPattern(WEEKDAY_DICTIONARY)}|weekend|weekday)(?:\\s*(?:\\,|\\)|\\\uFF09))?(?:\\s*(?:of\\s*)?(this|last|past|next)\\s*week)?(?=\\W|$)`, "i");
  var PREFIX_GROUP2 = 1;
  var WEEKDAY_GROUP = 2;
  var POSTFIX_GROUP = 3;
  var ENWeekdayParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN12;
    }
    innerExtract(context, match) {
      const prefix = match[PREFIX_GROUP2];
      const postfix = match[POSTFIX_GROUP];
      let modifierWord = prefix || postfix;
      modifierWord = modifierWord || "";
      modifierWord = modifierWord.toLowerCase();
      let modifier = null;
      if (modifierWord == "last" || modifierWord == "past") {
        modifier = "last";
      } else if (modifierWord == "next") {
        modifier = "next";
      } else if (modifierWord == "this") {
        modifier = "this";
      }
      const weekday_word = match[WEEKDAY_GROUP].toLowerCase();
      let weekday;
      if (WEEKDAY_DICTIONARY[weekday_word] !== void 0) {
        weekday = WEEKDAY_DICTIONARY[weekday_word];
      } else if (weekday_word == "weekend") {
        weekday = modifier == "last" ? Weekday.SUNDAY : Weekday.SATURDAY;
      } else if (weekday_word == "weekday") {
        const refWeekday = context.reference.getDateWithAdjustedTimezone().getDay();
        if (refWeekday == Weekday.SUNDAY || refWeekday == Weekday.SATURDAY) {
          weekday = modifier == "last" ? Weekday.FRIDAY : Weekday.MONDAY;
        } else {
          weekday = refWeekday - 1;
          weekday = modifier == "last" ? weekday - 1 : weekday + 1;
          weekday = weekday % 5 + 1;
        }
      } else {
        return null;
      }
      return createParsingComponentsAtWeekday(context.reference, weekday, modifier);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENRelativeDateFormatParser.js
  var PATTERN13 = new RegExp(`(this|last|past|next|after\\s*this)\\s*(${matchAnyPattern(TIME_UNIT_DICTIONARY)})(?=\\s*)(?=\\W|$)`, "i");
  var MODIFIER_WORD_GROUP = 1;
  var RELATIVE_WORD_GROUP = 2;
  var ENRelativeDateFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN13;
    }
    innerExtract(context, match) {
      const modifier = match[MODIFIER_WORD_GROUP].toLowerCase();
      const unitWord = match[RELATIVE_WORD_GROUP].toLowerCase();
      const timeunit = TIME_UNIT_DICTIONARY[unitWord];
      if (modifier == "next" || modifier.startsWith("after")) {
        const timeUnits = {};
        timeUnits[timeunit] = 1;
        return ParsingComponents.createRelativeFromReference(context.reference, timeUnits);
      }
      if (modifier == "last" || modifier == "past") {
        const timeUnits = {};
        timeUnits[timeunit] = -1;
        return ParsingComponents.createRelativeFromReference(context.reference, timeUnits);
      }
      const components = context.createParsingComponents();
      let date = new Date(context.reference.instant.getTime());
      if (unitWord.match(/week/i)) {
        date.setDate(date.getDate() - date.getDay());
        components.imply("day", date.getDate());
        components.imply("month", date.getMonth() + 1);
        components.imply("year", date.getFullYear());
      } else if (unitWord.match(/month/i)) {
        date.setDate(1);
        components.imply("day", date.getDate());
        components.assign("year", date.getFullYear());
        components.assign("month", date.getMonth() + 1);
      } else if (unitWord.match(/year/i)) {
        date.setDate(1);
        date.setMonth(0);
        components.imply("day", date.getDate());
        components.imply("month", date.getMonth() + 1);
        components.assign("year", date.getFullYear());
      }
      return components;
    }
  };

  // node_modules/chrono-node/dist/esm/common/parsers/SlashDateFormatParser.js
  var PATTERN14 = new RegExp("([^\\d]|^)([0-3]{0,1}[0-9]{1})[\\/\\.\\-]([0-3]{0,1}[0-9]{1})(?:[\\/\\.\\-]([0-9]{4}|[0-9]{2}))?(\\W|$)", "i");
  var OPENING_GROUP = 1;
  var ENDING_GROUP = 5;
  var FIRST_NUMBERS_GROUP = 2;
  var SECOND_NUMBERS_GROUP = 3;
  var YEAR_GROUP6 = 4;
  var SlashDateFormatParser = class {
    groupNumberMonth;
    groupNumberDay;
    constructor(littleEndian) {
      this.groupNumberMonth = littleEndian ? SECOND_NUMBERS_GROUP : FIRST_NUMBERS_GROUP;
      this.groupNumberDay = littleEndian ? FIRST_NUMBERS_GROUP : SECOND_NUMBERS_GROUP;
    }
    pattern() {
      return PATTERN14;
    }
    extract(context, match) {
      const index = match.index + match[OPENING_GROUP].length;
      const indexEnd = match.index + match[0].length - match[ENDING_GROUP].length;
      if (index > 0) {
        const textBefore = context.text.substring(0, index);
        if (textBefore.match("\\d/?$")) {
          return;
        }
      }
      if (indexEnd < context.text.length) {
        const textAfter = context.text.substring(indexEnd);
        if (textAfter.match("^/?\\d")) {
          return;
        }
      }
      const text = context.text.substring(index, indexEnd);
      if (text.match(/^\d\.\d$/) || text.match(/^\d\.\d{1,2}\.\d{1,2}\s*$/)) {
        return;
      }
      if (!match[YEAR_GROUP6] && text.indexOf("/") < 0) {
        return;
      }
      const result = context.createParsingResult(index, text);
      let month = parseInt(match[this.groupNumberMonth]);
      let day = parseInt(match[this.groupNumberDay]);
      if (month < 1 || month > 12) {
        if (month > 12) {
          if (day >= 1 && day <= 12 && month <= 31) {
            [day, month] = [month, day];
          } else {
            return null;
          }
        }
      }
      if (day < 1 || day > 31) {
        return null;
      }
      result.start.assign("day", day);
      result.start.assign("month", month);
      if (match[YEAR_GROUP6]) {
        const rawYearNumber = parseInt(match[YEAR_GROUP6]);
        const year = findMostLikelyADYear(rawYearNumber);
        result.start.assign("year", year);
      } else {
        const year = findYearClosestToRef(context.refDate, day, month);
        result.start.imply("year", year);
      }
      return result.addTag("parser/SlashDateFormatParser");
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENTimeUnitCasualRelativeFormatParser.js
  var PATTERN15 = new RegExp(`(this|last|past|next|after|\\+|-)\\s*(${TIME_UNITS_PATTERN})(?=\\W|$)`, "i");
  var PATTERN_NO_ABBR = new RegExp(`(this|last|past|next|after|\\+|-)\\s*(${TIME_UNITS_NO_ABBR_PATTERN})(?=\\W|$)`, "i");
  var ENTimeUnitCasualRelativeFormatParser = class extends AbstractParserWithWordBoundaryChecking {
    allowAbbreviations;
    constructor(allowAbbreviations = true) {
      super();
      this.allowAbbreviations = allowAbbreviations;
    }
    innerPattern() {
      return this.allowAbbreviations ? PATTERN15 : PATTERN_NO_ABBR;
    }
    innerExtract(context, match) {
      const prefix = match[1].toLowerCase();
      let duration = parseDuration(match[2]);
      if (!duration) {
        return null;
      }
      switch (prefix) {
        case "last":
        case "past":
        case "-":
          duration = reverseDuration(duration);
          break;
      }
      return ParsingComponents.createRelativeFromReference(context.reference, duration);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENMergeRelativeAfterDateRefiner.js
  function IsPositiveFollowingReference(result) {
    return result.text.match(/^[+-]/i) != null;
  }
  function IsNegativeFollowingReference(result) {
    return result.text.match(/^-/i) != null;
  }
  var ENMergeRelativeAfterDateRefiner = class extends MergingRefiner {
    shouldMergeResults(textBetween, currentResult, nextResult) {
      if (!textBetween.match(/^\s*$/i)) {
        return false;
      }
      return IsPositiveFollowingReference(nextResult) || IsNegativeFollowingReference(nextResult);
    }
    mergeResults(textBetween, currentResult, nextResult, context) {
      let timeUnits = parseDuration(nextResult.text);
      if (IsNegativeFollowingReference(nextResult)) {
        timeUnits = reverseDuration(timeUnits);
      }
      const components = ParsingComponents.createRelativeFromReference(ReferenceWithTimezone.fromDate(currentResult.start.date()), timeUnits);
      return new ParsingResult(currentResult.reference, currentResult.index, `${currentResult.text}${textBetween}${nextResult.text}`, components);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENMergeRelativeFollowByDateRefiner.js
  function hasImpliedEarlierReferenceDate(result) {
    return result.text.match(/\s+(before|from)$/i) != null;
  }
  function hasImpliedLaterReferenceDate(result) {
    return result.text.match(/\s+(after|since)$/i) != null;
  }
  var ENMergeRelativeFollowByDateRefiner = class extends MergingRefiner {
    patternBetween() {
      return /^\s*$/i;
    }
    shouldMergeResults(textBetween, currentResult, nextResult) {
      if (!textBetween.match(this.patternBetween())) {
        return false;
      }
      if (!hasImpliedEarlierReferenceDate(currentResult) && !hasImpliedLaterReferenceDate(currentResult)) {
        return false;
      }
      return !!nextResult.start.get("day") && !!nextResult.start.get("month") && !!nextResult.start.get("year");
    }
    mergeResults(textBetween, currentResult, nextResult) {
      let duration = parseDuration(currentResult.text);
      if (hasImpliedEarlierReferenceDate(currentResult)) {
        duration = reverseDuration(duration);
      }
      const components = ParsingComponents.createRelativeFromReference(ReferenceWithTimezone.fromDate(nextResult.start.date()), duration);
      return new ParsingResult(nextResult.reference, currentResult.index, `${currentResult.text}${textBetween}${nextResult.text}`, components);
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENExtractYearSuffixRefiner.js
  var YEAR_SUFFIX_PATTERN = new RegExp(`^\\s*(${YEAR_PATTERN})`, "i");
  var YEAR_GROUP7 = 1;
  var ENExtractYearSuffixRefiner = class {
    refine(context, results) {
      results.forEach(function(result) {
        if (!result.start.isDateWithUnknownYear()) {
          return;
        }
        const suffix = context.text.substring(result.index + result.text.length);
        const match = YEAR_SUFFIX_PATTERN.exec(suffix);
        if (!match) {
          return;
        }
        if (match[0].trim().length <= 3) {
          return;
        }
        context.debug(() => {
          console.log(`Extracting year: '${match[0]}' into : ${result}`);
        });
        const year = parseYear(match[YEAR_GROUP7]);
        if (result.end != null) {
          result.end.assign("year", year);
        }
        result.start.assign("year", year);
        result.text += match[0];
      });
      return results;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENUnlikelyFormatFilter.js
  var ENUnlikelyFormatFilter = class extends Filter {
    constructor() {
      super();
    }
    isValid(context, result) {
      const text = result.text.trim();
      if (text === context.text.trim()) {
        return true;
      }
      if (text.toLowerCase() === "may") {
        const textBefore = context.text.substring(0, result.index).trim();
        if (!textBefore.match(/\b(in)$/i)) {
          context.debug(() => {
            console.log(`Removing unlikely result: ${result}`);
          });
          return false;
        }
      }
      if (text.toLowerCase().endsWith("the second")) {
        const textAfter = context.text.substring(result.index + result.text.length).trim();
        if (textAfter.length > 0) {
          context.debug(() => {
            console.log(`Removing unlikely result: ${result}`);
          });
        }
        return false;
      }
      return true;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/refiners/ENEndOfPeriodRefiner.js
  var PREFIX_PATTERN = /\b(?:last\s+day|end)\s+of\s+(?:the\s+)?$/i;
  var RELATIVE_PERIOD_PATTERN = /^(this|last|past|next)\s*(week|month|year)$/i;
  var RELATIVE_YEAR_SUFFIX_PATTERN = /^\s+(this|last|past|next)\s+year(?=\W|$)/i;
  function modifierOffset(modifier) {
    return modifier === "next" ? 1 : modifier === "last" || modifier === "past" ? -1 : 0;
  }
  var ENEndOfPeriodRefiner = class {
    refine(context, results) {
      results.forEach((result) => {
        const prefix = context.text.substring(0, result.index).match(PREFIX_PATTERN);
        if (!prefix) {
          return;
        }
        const relativePeriod = result.text.match(RELATIVE_PERIOD_PATTERN);
        if (relativePeriod) {
          const modifier = relativePeriod[1].toLowerCase();
          this.moveToEndOfRelativePeriod(context, result, modifier, relativePeriod[2].toLowerCase());
        } else if (result.start.isCertain("month") && !result.start.isCertain("day")) {
          this.moveToEndOfMonth(context, result);
        } else {
          return;
        }
        result.start.imply("hour", 12);
        result.start.imply("minute", 0);
        result.start.imply("second", 0);
        result.start.imply("millisecond", 0);
        if (!result.start.isCertain("timezoneOffset")) {
          result.start.delete("timezoneOffset");
        }
        result.index -= prefix[0].length;
        result.text = prefix[0] + result.text;
        result.addTag("refiner/ENEndOfPeriodRefiner");
      });
      return results;
    }
    moveToEndOfRelativePeriod(context, result, modifier, period) {
      const offset = modifierOffset(modifier);
      const referenceDate = context.reference.getDateWithAdjustedTimezone();
      let lastDay;
      if (period === "week") {
        lastDay = new Date(referenceDate.getTime());
        lastDay.setDate(referenceDate.getDate() + (6 - referenceDate.getDay()) + offset * 7);
      } else if (period === "month") {
        lastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + offset + 1, 0);
      } else {
        lastDay = new Date(referenceDate.getFullYear() + offset, 11, 31);
      }
      result.start.assign("day", lastDay.getDate());
      result.start.assign("month", lastDay.getMonth() + 1);
      result.start.assign("year", lastDay.getFullYear());
      result.start.delete("weekday");
      result.start.imply("weekday", lastDay.getDay());
    }
    moveToEndOfMonth(context, result) {
      let year = result.start.get("year");
      const month = result.start.get("month");
      const suffix = context.text.substring(result.index + result.text.length).match(RELATIVE_YEAR_SUFFIX_PATTERN);
      if (suffix) {
        const modifier = suffix[1].toLowerCase();
        const referenceYear = context.reference.getDateWithAdjustedTimezone().getFullYear();
        year = referenceYear + modifierOffset(modifier);
        result.start.assign("year", year);
        result.text += suffix[0];
      }
      if (!result.start.isCertain("year")) {
        const lastDayInReferenceYear = new Date(year, month, 0).getDate();
        year = findYearClosestToRef(context.reference.getDateWithAdjustedTimezone(), lastDayInReferenceYear, month);
        result.start.imply("year", year);
      }
      result.start.assign("day", new Date(year, month, 0).getDate());
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/parsers/ENEndOfCurrentMonthParser.js
  var PATTERN16 = /(?:last\s+day|end)\s+of\s+(?:the\s+)?month(?=\W|$)/i;
  var ENEndOfCurrentMonthParser = class extends AbstractParserWithWordBoundaryChecking {
    innerPattern() {
      return PATTERN16;
    }
    innerExtract(context) {
      const targetDate = context.reference.getDateWithAdjustedTimezone();
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const components = context.createParsingComponents();
      components.assign("day", lastDay);
      components.assign("month", month);
      components.assign("year", year);
      components.addTag("parser/ENEndOfCurrentMonthParser");
      return components;
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/configuration.js
  var ENDefaultConfiguration = class {
    createCasualConfiguration(littleEndian = false) {
      const option = this.createConfiguration(false, littleEndian);
      option.parsers.push(new ENCasualDateParser());
      option.parsers.push(new ENCasualTimeParser());
      option.parsers.push(new ENEndOfCurrentMonthParser());
      option.parsers.push(new ENMonthNameParser());
      option.parsers.push(new ENRelativeDateFormatParser());
      option.parsers.push(new ENTimeUnitCasualRelativeFormatParser());
      option.refiners.unshift(new ENEndOfPeriodRefiner());
      option.refiners.push(new ENUnlikelyFormatFilter());
      return option;
    }
    createConfiguration(strictMode = true, littleEndian = false) {
      const options = includeCommonConfiguration({
        parsers: [
          new SlashDateFormatParser(littleEndian),
          new ENTimeUnitWithinFormatParser(strictMode),
          new ENMonthNameLittleEndianParser(),
          new ENMonthNameMiddleEndianParser(littleEndian),
          new ENWeekdayParser(),
          new ENSlashMonthFormatParser(),
          new ENTimeExpressionParser(strictMode),
          new ENTimeUnitAgoFormatParser(strictMode),
          new ENTimeUnitLaterFormatParser(strictMode),
          new ENYearMonthNameParser()
        ],
        refiners: [new ENMergeDateTimeRefiner()]
      }, strictMode);
      options.parsers.unshift(new ENYearMonthDayParser(strictMode));
      options.refiners.unshift(new ENMergeRelativeFollowByDateRefiner());
      options.refiners.unshift(new ENMergeRelativeAfterDateRefiner());
      options.refiners.unshift(new OverlapRemovalRefiner());
      options.refiners.push(new ENMergeDateTimeRefiner());
      options.refiners.push(new ENExtractYearSuffixRefiner());
      options.refiners.push(new ENMergeDateRangeRefiner());
      return options;
    }
  };

  // node_modules/chrono-node/dist/esm/chrono.js
  var Chrono = class _Chrono {
    parsers;
    refiners;
    defaultConfig = new ENDefaultConfiguration();
    constructor(configuration2) {
      configuration2 = configuration2 || this.defaultConfig.createCasualConfiguration();
      this.parsers = [...configuration2.parsers];
      this.refiners = [...configuration2.refiners];
    }
    clone() {
      return new _Chrono({
        parsers: [...this.parsers],
        refiners: [...this.refiners]
      });
    }
    parseDate(text, referenceDate, option) {
      const results = this.parse(text, referenceDate, option);
      return results.length > 0 ? results[0].start.date() : null;
    }
    parse(text, referenceDate, option) {
      const context = new ParsingContext(text, referenceDate, option);
      let results = [];
      this.parsers.forEach((parser) => {
        const parsedResults = _Chrono.executeParser(context, parser);
        results = results.concat(parsedResults);
      });
      results.sort((a, b) => {
        return a.index - b.index;
      });
      this.refiners.forEach(function(refiner) {
        results = refiner.refine(context, results);
      });
      return results;
    }
    static executeParser(context, parser) {
      const results = [];
      const pattern = parser.pattern(context);
      const originalText = context.text;
      let remainingText = context.text;
      let match = pattern.exec(remainingText);
      while (match) {
        const index = match.index + originalText.length - remainingText.length;
        match.index = index;
        const result = parser.extract(context, match);
        if (!result) {
          remainingText = originalText.substring(match.index + 1);
          match = pattern.exec(remainingText);
          continue;
        }
        let parsedResult = null;
        if (result instanceof ParsingResult) {
          parsedResult = result;
        } else if (result instanceof ParsingComponents) {
          parsedResult = context.createParsingResult(match.index, match[0]);
          parsedResult.start = result;
        } else {
          parsedResult = context.createParsingResult(match.index, match[0], result);
        }
        const parsedIndex = parsedResult.index;
        const parsedText = parsedResult.text;
        context.debug(() => console.log(`${parser.constructor.name} extracted (at index=${parsedIndex}) '${parsedText}'`));
        results.push(parsedResult);
        remainingText = originalText.substring(parsedIndex + parsedText.length);
        match = pattern.exec(remainingText);
      }
      return results;
    }
  };
  var ParsingContext = class {
    text;
    option;
    reference;
    refDate;
    constructor(text, refDate, option) {
      this.text = text;
      this.option = option ?? {};
      this.reference = ReferenceWithTimezone.fromInput(refDate, this.option.timezones);
      this.refDate = this.reference.instant;
    }
    createParsingComponents(components) {
      if (components instanceof ParsingComponents) {
        return components;
      }
      return new ParsingComponents(this.reference, components);
    }
    createParsingResult(index, textOrEndIndex, startComponents, endComponents) {
      const text = typeof textOrEndIndex === "string" ? textOrEndIndex : this.text.substring(index, textOrEndIndex);
      const start = startComponents ? this.createParsingComponents(startComponents) : null;
      const end = endComponents ? this.createParsingComponents(endComponents) : null;
      return new ParsingResult(this.reference, index, text, start, end);
    }
    debug(block) {
      if (this.option.debug) {
        if (this.option.debug instanceof Function) {
          this.option.debug(block);
        } else {
          const handler = this.option.debug;
          handler.debug(block);
        }
      }
    }
  };

  // node_modules/chrono-node/dist/esm/locales/en/index.js
  var configuration = new ENDefaultConfiguration();
  var casual = new Chrono(configuration.createCasualConfiguration(false));
  var strict = new Chrono(configuration.createConfiguration(true, false));
  var GB = new Chrono(configuration.createCasualConfiguration(true));
  function parse(text, ref, option) {
    return casual.parse(text, ref, option);
  }
  function parseDate(text, ref, option) {
    return casual.parseDate(text, ref, option);
  }

  // src/types.ts
  var DATE_TYPES = [
    "abstract_deadline",
    "full_paper_deadline",
    "application_deadline",
    "registration_closes",
    "submission_deadline",
    "proposal_deadline",
    "notification_date",
    "event_dates",
    "window_start"
  ];

  // src/lib/text.ts
  function squash(s) {
    return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  }
  function containsPhrase(haystack, phrase) {
    const p = squash(phrase);
    if (!p) return false;
    return squash(haystack).includes(p);
  }
  function buildLlmExcerpt(text, dateIndexes, max = 12e3) {
    if (text.length <= max) return text;
    const head = 3500;
    const radius = 450;
    const ranges = [[0, head]];
    for (const i of dateIndexes) ranges.push([Math.max(0, i - radius), Math.min(text.length, i + radius)]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    let out = "";
    for (const [a, b] of merged) {
      const piece = text.slice(a, b);
      if (out.length + piece.length > max) {
        out += piece.slice(0, Math.max(0, max - out.length));
        break;
      }
      out += piece + "\n...\n";
    }
    return out.trim();
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
    JST: "Asia/Tokyo"
  };
  var NAMED_ZONES = {
    eastern: "America/New_York",
    central: "America/Chicago",
    mountain: "America/Denver",
    pacific: "America/Los_Angeles"
  };
  var NAMED_RE = /\b(Eastern|Pacific|Central|Mountain)(?:\s+(?:Standard|Daylight))?\s+Time\b/i;
  var AOE_RE = /(?:\bAoE\b|\bA\.o\.E\.?|\bAnywhere on Earth\b)/i;
  var TOKEN_RE = /\b(UTC|GMT|PST|PDT|PT|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|CET|CEST|BST|JST)\b(?:\s?([+-])(\d{1,2})(?::?(\d{2}))?)?/;
  function findTz(s) {
    if (AOE_RE.test(s)) return "AoE";
    const named = s.match(NAMED_RE);
    if (named) return NAMED_ZONES[named[1].toLowerCase()];
    const m = s.match(TOKEN_RE);
    if (!m) return null;
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
  var CLOCK_RE = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?|\b(\d{1,2})\s*([ap])\.?m\.?\b|\b(23:59|00:00)\b/i;
  function detectPageTz(text) {
    const sentence = text.match(/\ball\s+(?:deadlines?|times?|dates?)\b[^.\n]{0,100}/i);
    if (sentence) {
      const tz = findTz(sentence[0]);
      if (tz) {
        const c = sentence[0].match(CLOCK_RE);
        let time = null;
        if (c) {
          if (c[1]) time = to24(Number(c[1]), Number(c[2]), c[3]);
          else if (c[4]) time = to24(Number(c[4]), 0, c[5]);
          else if (c[6]) time = c[6];
        }
        return { tz, time };
      }
    }
    if (AOE_RE.test(text)) return { tz: "AoE", time: null };
    return null;
  }

  // src/lib/llm.ts
  var SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["name", "dates"],
    properties: {
      name: { type: ["string", "null"] },
      dates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "date", "time", "timezone", "start_date", "start_time", "raw_phrase"],
          properties: {
            type: { type: "string", enum: DATE_TYPES.filter((t) => t !== "window_start") },
            date: { type: "string" },
            time: { type: ["string", "null"] },
            timezone: { type: ["string", "null"] },
            start_date: { type: ["string", "null"] },
            start_time: { type: ["string", "null"] },
            raw_phrase: { type: "string" }
          }
        }
      }
    }
  };
  function buildMessages(snap, excerpt, now2) {
    const today2 = `${now2.getUTCFullYear()}-${pad(now2.getUTCMonth() + 1)}-${pad(now2.getUTCDate())}`;
    const system = [
      "You extract dates from the text of a web page about an opportunity such as a hackathon, paper call, grant, fellowship or event.",
      'Reply with JSON only, in this shape: {"name": string|null, "dates": [{"type", "date", "time", "timezone", "start_date", "start_time", "raw_phrase"}]}.',
      "Rules:",
      "1. Report only dates the text states. Never guess and never calculate a date.",
      "2. raw_phrase must be copied exactly from the text. Use the shortest span that holds the date, and the time and time zone when they are written next to it.",
      "3. date and start_date use YYYY-MM-DD. time and start_time use 24 hour HH:mm, or null when the text gives no time.",
      '4. timezone is an IANA name, "AoE", or "UTC+HH:MM", exactly as the text implies. Use null if the text does not say.',
      "5. When something runs over a period, put the end in date and the start in start_date. Otherwise start_date is null.",
      `6. type is one of: ${DATE_TYPES.filter((t) => t !== "window_start").join(", ")}.`,
      "7. name is the name of the opportunity, short and meaningful, without the website name.",
      "8. If the page has no deadline and no event date, return an empty dates list.",
      `Today is ${today2}. If a date has no year, use its next occurrence.`
    ].join("\n");
    const user = `URL: ${snap.url}
Page title: ${snap.title}

Text:
${excerpt}`;
    return [
      { role: "system", content: system },
      { role: "user", content: user }
    ];
  }
  function parseLlmJson(raw) {
    if (!raw) return null;
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    try {
      return JSON.parse(s);
    } catch {
      const a = s.indexOf("{");
      const b = s.lastIndexOf("}");
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(s.slice(a, b + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  function ymdOf(c) {
    return `${c.get("year")}-${pad(c.get("month"))}-${pad(c.get("day"))}`;
  }
  function normalizeLlmOutput(obj, pageText, now2) {
    const o = obj ?? {};
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
    const dates = [];
    const list = Array.isArray(o.dates) ? o.dates : [];
    let n = 0;
    for (const raw of list) {
      const r = raw ?? {};
      const type = r.type;
      if (!DATE_TYPES.includes(type)) continue;
      const date = typeof r.date === "string" ? r.date : "";
      if (!isValidDate(date)) continue;
      const phrase = typeof r.raw_phrase === "string" ? r.raw_phrase.trim() : "";
      if (!phrase || !containsPhrase(pageText, phrase)) continue;
      const time = typeof r.time === "string" && isValidTime(r.time) ? r.time : null;
      const startDate = typeof r.start_date === "string" && isValidDate(r.start_date) ? r.start_date : null;
      const startTime = startDate && typeof r.start_time === "string" && isValidTime(r.start_time) ? r.start_time : null;
      const tz = typeof r.timezone === "string" ? normalizeTz(r.timezone) : null;
      const flags = [];
      const check = en_exports.parse(phrase, now2, { forwardDate: true });
      const hit = check.find((c) => c.start.isCertain("day") && c.start.isCertain("month"));
      if (!hit) {
        flags.push("llm_date_unverified");
      } else {
        const last = hit.end ?? hit.start;
        if (ymdOf(last) !== date && ymdOf(hit.start) !== date) flags.push("date_mismatch");
      }
      dates.push({
        id: `l${++n}`,
        type,
        label: defaultLabel(type, !!startDate),
        date,
        time,
        tz,
        startDate,
        startTime,
        rawPhrase: phrase,
        source: "llm",
        flags,
        selected: false
      });
    }
    return { name, dates };
  }
  function responseFormat(mode) {
    if (mode === "json_schema") {
      return { response_format: { type: "json_schema", json_schema: { name: "captivum", strict: true, schema: SCHEMA } } };
    }
    if (mode === "json_object") return { response_format: { type: "json_object" } };
    return {};
  }
  var LlmError = class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
    status;
  };
  async function callProvider(p, messages, fetchImpl, mode = p.jsonMode, timeoutMs = 3e4) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${p.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({ model: p.model, temperature: 0, messages, ...responseFormat(mode) }),
        signal: ctrl.signal
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.text()).slice(0, 200);
        } catch {
        }
        throw new LlmError(`${p.name} answered ${res.status}. ${detail}`.trim(), res.status);
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LlmError(`${p.name} returned no content.`, 0);
      return content;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      const aborted = e?.name === "AbortError";
      throw new LlmError(aborted ? `${p.name} timed out.` : `${p.name} could not be reached.`, 0);
    } finally {
      clearTimeout(timer);
    }
  }
  async function callWithDowngrade(p, messages, f) {
    try {
      return await callProvider(p, messages, f);
    } catch (e) {
      if (e instanceof LlmError && e.status === 400 && p.jsonMode !== "none") {
        return await callProvider(p, messages, f, "none");
      }
      throw e;
    }
  }
  async function runLlm(providers, snap, excerpt, now2, fetchImpl = fetch) {
    const usable = providers.filter((p) => p.enabled && p.apiKey.trim() && p.baseUrl.trim() && p.model.trim());
    const errors = [];
    const calls = [];
    if (!usable.length) throw new LlmError("No AI provider is set up.", 0);
    const messages = buildMessages(snap, excerpt, now2);
    for (const p of usable) {
      try {
        const raw = await callWithDowngrade(p, messages, fetchImpl);
        const parsed = parseLlmJson(raw);
        if (!parsed) {
          calls.push({ providerId: p.id, ok: false });
          errors.push(`${p.name} did not return valid JSON.`);
          continue;
        }
        calls.push({ providerId: p.id, ok: true });
        const out = normalizeLlmOutput(parsed, snap.text, now2);
        return { ...out, provider: p.name, errors, calls };
      } catch (e) {
        calls.push({ providerId: p.id, ok: false });
        errors.push(e.message);
      }
    }
    const err = new LlmError(errors.join(" "), 0);
    err.calls = calls;
    throw err;
  }
  async function pingProvider(p, fetchImpl = fetch) {
    const raw = await callWithDowngrade(
      p,
      [
        { role: "system", content: "Reply with JSON only." },
        { role: "user", content: 'Return {"ok": true}.' }
      ],
      fetchImpl
    );
    const parsed = parseLlmJson(raw);
    return parsed?.ok ? "Working." : "Reached the provider, but the reply was not the expected JSON.";
  }

  // src/lib/validate.ts
  var DERIVED = ["already_passed", "bad_order", "no_timezone"];
  function applyDerivedFlags(d, now2, defaultTz) {
    const flags = d.flags.filter((f) => !DERIVED.includes(f));
    const hasTime = !!(d.time || d.startTime);
    if (hasTime && !resolveTz(d.tz)) flags.push("no_timezone");
    if (isValidDate(d.date) && isPast(d, now2, defaultTz)) flags.push("already_passed");
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

  // src/lib/parser.ts
  var SPECIFIC_NOUNS = [
    ["abstract", /\babstracts?\b/g],
    ["full_paper", /\b(?:full[- ]?papers?|camera[- ]?ready|final (?:paper|version)|manuscripts?)\b/g],
    ["application", /\b(?:applications?|apply|applying|applicants?)\b/g],
    ["registration", /\b(?:registration|register|registering|sign[- ]?up|rsvp)\b/g],
    ["proposal", /\b(?:proposals?|letters? of intent|loi|pre-?proposals?|concept notes?)\b/g]
  ];
  var GENERIC_NOUN = /\b(?:submissions?|submit|submitted|papers?|entries|entry)\b/g;
  var NOTIFY = /\b(?:notifications?|notified|decisions?|acceptance|accepted|results?|announced|announcements?|winners?)\b/g;
  var START = /\b(?:opens?|opening|starts?|starting|begins?|beginning|from|launch(?:es)?|available from|kick[- ]?off)\b/g;
  var END = /\b(?:deadline|due|closes?|closing|ends?|ending|by|until|till|cut-?off|last date|no later than|before|expires?)\b/g;
  var EVENT = /\b(?:held|takes? place|event dates?|conference dates?|hackathon dates?|will run|runs|hackathon|summit|symposium|conference|festival|meetup|workshop)\b/g;
  var MAIN_PRIORITY = [
    "application_deadline",
    "submission_deadline",
    "proposal_deadline",
    "full_paper_deadline",
    "registration_closes",
    "abstract_deadline",
    "event_dates"
  ];
  function lastIdx(re, s) {
    let last = -1;
    for (const m of s.matchAll(re)) last = m.index ?? last;
    return last;
  }
  function contextBefore(text, index) {
    const start = Math.max(0, index - 160);
    const seg = text.slice(start, index);
    const nl = seg.lastIndexOf("\n");
    let line = nl >= 0 ? seg.slice(nl + 1) : seg;
    const cut = Math.max(line.lastIndexOf(". "), line.lastIndexOf("! "), line.lastIndexOf("? "), line.lastIndexOf("; "));
    if (cut >= 0) line = line.slice(cut + 2);
    if (nl >= 0 && line.replace(/[\s:\u2013\u2014\-|\u2022\u00B7*]/g, "").length < 2) {
      const prev = seg.slice(0, nl).split("\n").reverse().find((l) => l.trim());
      if (prev) line = prev + " " + line;
    }
    return line;
  }
  function contextAfter(text, end) {
    const seg = text.slice(end, end + 70);
    const nl = seg.indexOf("\n");
    return nl >= 0 ? seg.slice(0, nl) : seg;
  }
  function kindOf(ctx) {
    let best = null;
    let bestPos = -1;
    for (const [kind, re] of SPECIFIC_NOUNS) {
      const p = lastIdx(re, ctx);
      if (p > bestPos) {
        bestPos = p;
        best = kind;
      }
    }
    if (best) return best;
    return lastIdx(GENERIC_NOUN, ctx) >= 0 ? "submission" : null;
  }
  function classify(ctx) {
    const c = ctx.toLowerCase();
    const pos = {
      notify: lastIdx(NOTIFY, c),
      start: lastIdx(START, c),
      end: lastIdx(END, c),
      event: lastIdx(EVENT, c)
    };
    let role = null;
    let best = -1;
    for (const r of ["notify", "start", "end", "event"]) {
      if (pos[r] > best) {
        best = pos[r];
        role = r;
      }
    }
    const kind = kindOf(c);
    if (role === "event" && kind) role = "end";
    if (!role && kind) role = "end";
    return { role, kind };
  }
  function typeFor(role, kind) {
    if (role === "notify") return "notification_date";
    if (role === "event") return "event_dates";
    if (role === "start") return "window_start";
    switch (kind) {
      case "abstract":
        return "abstract_deadline";
      case "full_paper":
        return "full_paper_deadline";
      case "application":
        return "application_deadline";
      case "registration":
        return "registration_closes";
      case "proposal":
        return "proposal_deadline";
      default:
        return "submission_deadline";
    }
  }
  var TRAILING_TIME = /^[\s,(\u2013\u2014\-@]*(?:at\s+)?(?:(\d{1,2}):(\d{2})\s*([ap])\.?m\.?|(\d{1,2})\s*([ap])\.?m\.?)/i;
  function trailingTime(after) {
    const m = after.match(TRAILING_TIME);
    if (!m) return null;
    if (m[1]) return to24(Number(m[1]), Number(m[2]), m[3]);
    return to24(Number(m[4]), 0, m[5]);
  }
  function ymd(c) {
    return `${c.get("year")}-${pad(c.get("month"))}-${pad(c.get("day"))}`;
  }
  function hm(c) {
    if (!c.isCertain("hour")) return null;
    return `${pad(c.get("hour"))}:${pad(c.get("minute") ?? 0)}`;
  }
  function endsAtDeadline(t) {
    return t.endsWith("_deadline") || t === "registration_closes";
  }
  function dedupe(dates) {
    const seen = /* @__PURE__ */ new Set();
    return dates.filter((d) => {
      const k = `${d.type}|${d.startDate}|${d.date}|${d.time}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  function chooseMain(dates) {
    const out = dates.map((d) => ({ ...d, selected: false }));
    const live = (d) => !d.flags.includes("already_passed") && !d.flags.includes("bad_order");
    for (const type of MAIN_PRIORITY) {
      const hits = out.filter((d) => d.type === type && live(d));
      if (hits.length) {
        hits.sort((a, b) => a.date.localeCompare(b.date));
        hits[0].selected = true;
        break;
      }
    }
    return out;
  }
  function parseDates(text, opts = {}) {
    const now2 = opts.now ?? /* @__PURE__ */ new Date();
    const defaultTz = opts.defaultTz ?? "UTC";
    const page = detectPageTz(text);
    const results = en_exports.parse(text, now2, { forwardDate: true });
    const matchIndexes = [];
    const cands = [];
    let n = 0;
    for (const r of results) {
      const s = r.start;
      if (!s.isCertain("day") || !s.isCertain("month")) continue;
      matchIndexes.push(r.index);
      const endIdx = r.index + r.text.length;
      const before = contextBefore(text, r.index);
      const after = contextAfter(text, endIdx);
      let { role, kind } = classify(before);
      if (!role) {
        const a = classify(after.replace(/\b(?:by|from|before|until|till)\b/gi, " "));
        role = a.role;
        kind = a.kind;
      }
      if (!role) continue;
      const e = r.end ?? null;
      const last = e ?? s;
      const yearCertain = s.isCertain("year") || !!e?.isCertain("year");
      let time = hm(last);
      if (!time) time = trailingTime(after);
      let startTime = e ? hm(s) : null;
      const tz = findTz(r.text + " " + after.slice(0, 30)) ?? null;
      const type = typeFor(role, kind);
      const isRange = !!e && (ymd(s) !== ymd(e) || !!startTime && !!time);
      const date = isRange ? ymd(e) : ymd(last);
      if (!isRange) startTime = null;
      const d = {
        id: `d${++n}`,
        type,
        label: defaultLabel(type, isRange),
        date,
        time,
        tz,
        startDate: isRange ? ymd(s) : null,
        startTime: isRange ? startTime : null,
        rawPhrase: r.text,
        source: "parser",
        flags: yearCertain ? [] : ["year_inferred"],
        selected: false
      };
      cands.push({ index: r.index, role, kind, d });
    }
    const consumed = /* @__PURE__ */ new Set();
    for (const s of cands.filter((c) => c.role === "start" && !c.d.startDate)) {
      const e = cands.find(
        (c) => c.index > s.index && c.role === "end" && !c.d.startDate && !consumed.has(c) && c.d.date >= s.d.date && (s.kind === null || c.kind === null || c.kind === "submission" || c.kind === s.kind)
      );
      if (!e) continue;
      e.d.startDate = s.d.date;
      e.d.startTime = s.d.time;
      e.d.startPhrase = s.d.rawPhrase;
      e.d.label = defaultLabel(e.d.type, true);
      consumed.add(s);
    }
    let dates = dedupe(cands.filter((c) => !consumed.has(c)).map((c) => c.d));
    dates = dates.map((d) => {
      const out = { ...d };
      if (page) {
        if (!out.tz && (out.time || page.time && endsAtDeadline(out.type))) out.tz = page.tz;
        if (!out.time && page.time && endsAtDeadline(out.type)) out.time = page.time;
      }
      return out;
    });
    dates = dates.map((d) => applyDerivedFlags(d, now2, defaultTz));
    dates.sort((a, b) => (a.startDate ?? a.date).localeCompare(b.startDate ?? b.date));
    dates = chooseMain(dates);
    return { dates, pageTz: page?.tz ?? null, matchIndexes };
  }

  // src/lib/pipeline.ts
  var WALL = /(log ?in|sign ?in|authwall|checkpoint|captcha|challenge)/i;
  function isUnsure(dates, name) {
    const selected = dates.filter((d) => d.selected);
    if (!selected.length) return "no usable deadline";
    if (!name) return "no name";
    if (selected.some((d) => d.flags.includes("no_timezone"))) return "timed deadline with no time zone";
    if (selected.some((d) => d.flags.includes("year_inferred"))) return "year not stated";
    const live = dates.filter((d) => !d.flags.includes("already_passed") && d.type.endsWith("_deadline"));
    const byType = /* @__PURE__ */ new Map();
    for (const d of live) {
      const set = byType.get(d.type) ?? /* @__PURE__ */ new Set();
      set.add(`${d.startDate ?? ""}|${d.date}`);
      byType.set(d.type, set);
    }
    for (const set of byType.values()) if (set.size > 1) return "conflicting dates of the same kind";
    return null;
  }
  function merge(parser, llm) {
    const llmTypes = new Set(llm.map((d) => d.type));
    const out = [];
    for (const l of llm) {
      const twin = parser.find((p) => p.type === l.type && p.date === l.date && p.startDate === l.startDate);
      out.push(twin ? { ...twin, time: twin.time ?? l.time, tz: twin.tz ?? l.tz } : l);
    }
    for (const p of parser) if (!llmTypes.has(p.type)) out.push(p);
    return out;
  }
  async function extract(url, deps) {
    const now2 = deps.now();
    const notes = [];
    const snap = await deps.fetchPage(url);
    if (snap.text.trim().length < 200 || isBlockedTitle(snap.title) || WALL.test(new URL(snap.finalUrl || url).pathname)) {
      notes.push(
        "This page looks empty or blocked, maybe a sign in wall. Open the link in Chrome, sign in, then add it again."
      );
    }
    const parsed = parseDates(snap.text, { now: now2, defaultTz: deps.settings.defaultTz });
    const picked = pickName(snap);
    let name = picked.name;
    let titleSource = picked.source;
    let dates = parsed.dates;
    let usedLlm = false;
    let llmProvider;
    const why = isUnsure(dates, name);
    if (why) {
      if (deps.runLlm) {
        try {
          const excerpt = buildLlmExcerpt(snap.text, parsed.matchIndexes);
          const out = await deps.runLlm(snap, excerpt);
          usedLlm = true;
          llmProvider = out.provider;
          const merged = merge(parsed.dates, out.dates).map((d) => applyDerivedFlags(d, now2, deps.settings.defaultTz));
          merged.sort((a, b) => (a.startDate ?? a.date).localeCompare(b.startDate ?? b.date));
          dates = chooseMain(merged);
          if (!name && out.name) {
            name = out.name;
            titleSource = "ai";
          }
          if (out.errors.length) notes.push(`AI fallback used. ${out.errors.join(" ")}`);
        } catch (e) {
          notes.push(`The AI check failed (${e.message}). Showing what the parser found.`);
        }
      } else {
        notes.push(`Parser was unsure (${why}). Add an AI key in Settings to double check pages like this.`);
      }
    }
    if (!dates.length && !notes.length) notes.push("No dates found on this page. You can add one by hand.");
    return {
      name,
      titleSource,
      finalUrl: snap.finalUrl || url,
      dates,
      pageTz: parsed.pageTz,
      usedLlm,
      llmProvider,
      notes
    };
  }

  // src/lib/script.ts
  var RETRYABLE = /* @__PURE__ */ new Set(["network", "timeout", "rate_limited", "script_error", "server"]);
  async function callScript(settings, action, payload = {}, fetchImpl = fetch, timeoutMs = 45e3) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(settings.scriptUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, action, secret: settings.scriptSecret.trim() }),
        redirect: "follow",
        signal: ctrl.signal
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!json) {
        if (/<html|<!doctype/i.test(text)) {
          return {
            ok: false,
            code: "not_deployed",
            message: "Google returned a web page instead of data. In Apps Script, deploy as a web app that runs as you and that Anyone can access, then paste the new /exec URL.",
            retryable: false
          };
        }
        return { ok: false, code: res.status >= 500 ? "server" : "bad_reply", message: `Unexpected reply (${res.status}).`, retryable: res.status >= 500 };
      }
      if (json.ok === true) return { ok: true, data: json };
      const code = typeof json.error === "string" ? json.error : "script_error";
      return {
        ok: false,
        code,
        message: typeof json.message === "string" ? json.message : "The script reported an error.",
        retryable: RETRYABLE.has(code)
      };
    } catch (e) {
      const aborted = e?.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "timeout" : "network",
        message: aborted ? "The script did not answer in time." : "Could not reach Google. Check the connection.",
        retryable: true
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // src/lib/storage.ts
  var chromeStore = {
    async get(key, fallback) {
      const r = await chrome.storage.local.get(key);
      return r[key] ?? fallback;
    },
    async set(key, value) {
      await chrome.storage.local.set({ [key]: value });
    },
    async remove(key) {
      await chrome.storage.local.remove(key);
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
  function llmReady(s) {
    return s.llmEnabled && s.providers.some((p) => p.enabled && p.apiKey.trim());
  }

  // src/lib/url.ts
  var TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src|ref_url|trk|trackingid|li_fat_id)$/i;
  function extractUrl(input) {
    if (!input) return null;
    const m = input.match(/https?:\/\/[^\s<>"')\]]+/i);
    let candidate = (m ? m[0] : input.trim()).replace(/[.,;:!?]+$/, "");
    if (!/^https?:\/\//i.test(candidate)) {
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(candidate)) candidate = "https://" + candidate;
      else return null;
    }
    try {
      const u = new URL(candidate);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const host = u.hostname.replace(/^www\./, "");
      const isX = host === "x.com" || host === "twitter.com";
      for (const key of [...u.searchParams.keys()]) {
        if (TRACKING.test(key) || isX && (key === "s" || key === "t")) u.searchParams.delete(key);
      }
      u.hash = "";
      return u.toString();
    } catch {
      return null;
    }
  }

  // src/lib/actions.ts
  function backoffMinutes(attempts) {
    return Math.min(60, 2 * 2 ** Math.max(0, attempts));
  }
  function createActions(deps) {
    const now2 = () => deps.now ? deps.now() : /* @__PURE__ */ new Date();
    const keep = (p) => deps.keepAlive ? deps.keepAlive(p) : p;
    const fetchImpl = deps.fetchImpl ?? ((i, init) => fetch(i, init));
    const { store, records: records2 } = deps;
    async function runExtract(id, url) {
      const settings = await loadSettings(store);
      try {
        const res = await extract(url, {
          settings,
          now: now2,
          fetchPage: deps.fetchPage,
          runLlm: llmReady(settings) ? async (snap, excerpt) => {
            try {
              const out = await runLlm(settings.providers, snap, excerpt, now2(), fetchImpl);
              for (const c of out.calls) await bumpLlm(store, c.providerId, c.ok, now2());
              return out;
            } catch (e) {
              const calls = e.calls ?? [];
              for (const c of calls) await bumpLlm(store, c.providerId, false, now2());
              throw e;
            }
          } : void 0
        });
        await records2.update(
          id,
          (r) => ({
            ...r,
            name: res.name,
            finalUrl: res.finalUrl,
            dates: res.dates,
            notes: res.notes,
            usedLlm: res.usedLlm,
            status: "pending",
            error: void 0
          }),
          now2()
        );
      } catch (e) {
        await records2.update(id, (r) => ({ ...r, status: "error", error: e.message }), now2());
      }
    }
    async function startExtract(input) {
      const url = extractUrl(input);
      if (!url) return { reply: { ok: false, error: "That does not look like a link." } };
      const existing = (await records2.list()).find(
        (r) => (r.url === url || r.finalUrl === url) && r.status !== "error" && r.status !== "cancelled"
      );
      if (existing) return { reply: { ok: true, id: existing.id, existing: true } };
      const rec = await records2.create(url, now2());
      const done = keep(runExtract(rec.id, url));
      return { reply: { ok: true, id: rec.id }, done };
    }
    async function reextract(id) {
      const rec = await records2.get(id);
      if (!rec) return { reply: { ok: false, error: "That item no longer exists." } };
      await records2.update(id, (r) => ({ ...r, status: "extracting", error: void 0 }), now2());
      return { reply: { ok: true, id }, done: keep(runExtract(id, rec.url)) };
    }
    async function saveDraft(id, name, dates) {
      const settings = await loadSettings(store);
      const rec = await records2.update(
        id,
        (r) => r.status === "pending" ? { ...r, name, dates: dates.map((d) => applyDerivedFlags(d, now2(), settings.defaultTz)) } : r,
        now2()
      );
      return rec ? { ok: true } : { ok: false, error: "That item no longer exists." };
    }
    function callFor(settings) {
      return (action, payload) => callScript(settings, action, payload, fetchImpl);
    }
    async function deliver(id) {
      const settings = await loadSettings(store);
      if (!isScriptConfigured(settings)) {
        return { ok: false, code: "not_configured", error: "Link your sender in Settings first." };
      }
      if (settings.senderEmail && settings.receiverEmail && settings.senderEmail.trim().toLowerCase() === settings.receiverEmail.trim().toLowerCase()) {
        return { ok: false, code: "same_address", error: "Sender and receiver must be different addresses." };
      }
      const rec = await records2.get(id);
      if (!rec) return { ok: false, error: "That item no longer exists." };
      const problems = validateForSend(rec);
      if (problems.length) return { ok: false, code: "invalid", error: problems.join(" ") };
      await records2.update(id, (r) => ({ ...r, status: "sending", error: void 0 }), now2());
      return keep(runDelivery(id, settings));
    }
    async function runDelivery(id, settings) {
      const rec = await records2.get(id);
      if (!rec) return { ok: false, error: "That item no longer exists." };
      const out = await deliverRecord(rec, settings, {
        call: callFor(settings),
        now: now2,
        onCreated: async () => {
          await bumpInvite(store, now2());
        },
        onQuota: async (left) => {
          await setScriptLeft(store, left, now2());
        }
      });
      const next = await records2.update(
        id,
        (r) => {
          const attempts = out.record.status === "queued" ? r.attempts + 1 : 0;
          return {
            ...r,
            delivered: out.record.delivered,
            status: out.record.status,
            error: out.record.error,
            errorCode: out.record.errorCode,
            attempts,
            nextRetryAt: out.record.status === "queued" ? new Date(now2().getTime() + backoffMinutes(attempts) * 6e4).toISOString() : void 0
          };
        },
        now2()
      );
      if (out.errors.length) {
        return { ok: false, code: out.errors[0].code, error: out.errors[0].message, status: next?.status };
      }
      return { ok: true, status: next?.status };
    }
    async function reopen(id) {
      const rec = await records2.update(id, (r) => ({ ...r, status: "pending", error: void 0, errorCode: void 0 }), now2());
      return rec ? { ok: true } : { ok: false, error: "That item no longer exists." };
    }
    async function cancelInvites(id) {
      const settings = await loadSettings(store);
      if (!isScriptConfigured(settings)) return { ok: false, code: "not_configured", error: "Link your sender in Settings first." };
      await records2.update(
        id,
        (r) => ({ ...r, dates: r.dates.map((d) => ({ ...d, selected: false })), status: "sending" }),
        now2()
      );
      return keep(runDelivery(id, settings));
    }
    async function retryQueued(force = false) {
      const settings = await loadSettings(store);
      if (!isScriptConfigured(settings)) return 0;
      const due = (await records2.list()).filter(
        (r) => r.status === "queued" && (force || !r.nextRetryAt || new Date(r.nextRetryAt).getTime() <= now2().getTime())
      );
      for (const r of due) {
        await records2.update(r.id, (x) => ({ ...x, status: "sending" }), now2());
        await runDelivery(r.id, settings);
      }
      return due.length;
    }
    async function scriptTest(sendInvite) {
      const settings = await loadSettings(store);
      if (!isScriptConfigured(settings)) return { ok: false, code: "not_configured", error: "Paste the web app URL and the secret first." };
      const res = await callScript(settings, "test", { sendInvite }, fetchImpl);
      if (!res.ok) return { ok: false, code: res.code, error: res.message };
      const d = res.data;
      if (typeof d.sender === "string" || typeof d.receiver === "string") {
        await saveSettings(store, {
          ...settings,
          senderEmail: typeof d.sender === "string" ? d.sender : settings.senderEmail,
          receiverEmail: typeof d.receiver === "string" ? d.receiver : settings.receiverEmail
        });
      }
      if (d.quota) await setScriptLeft(store, d.quota.left, now2());
      return { ok: true, ...d };
    }
    async function cancelTestInvite(eventId) {
      const settings = await loadSettings(store);
      const res = await callScript(settings, "cancel", { eventId }, fetchImpl);
      return res.ok || res.code === "not_found" ? { ok: true } : { ok: false, code: res.code, error: res.message };
    }
    async function llmTest(providerId) {
      const settings = await loadSettings(store);
      const p = settings.providers.find((x) => x.id === providerId);
      if (!p) return { ok: false, error: "Unknown provider." };
      if (!p.apiKey.trim()) return { ok: false, error: "Add the API key first." };
      try {
        const message = await pingProvider(p, fetchImpl);
        return { ok: true, message };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return { startExtract, reextract, saveDraft, deliver, reopen, cancelInvites, retryQueued, scriptTest, cancelTestInvite, llmTest, remove: (id) => records2.remove(id) };
  }

  // src/lib/pageFetch.ts
  var SPA_HOSTS = /(^|\.)(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.net)$/;
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitForLoad(tabId, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      };
      const listener = (id, info) => {
        if (id === tabId && info.status === "complete") finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId).then((t) => t.status === "complete" && finish(), finish);
    });
  }
  async function read(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["reader.js"] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__captivumRead()
    });
    return res?.result ?? null;
  }
  async function fetchPageViaTab(url) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error("That is not a valid link.");
    }
    if (/\.pdf($|\?)/i.test(url)) throw new Error("PDF links are not supported yet. Open the page that links to the PDF instead.");
    const tab = await chrome.tabs.create({ url, active: false });
    const tabId = tab.id;
    if (tabId === void 0) throw new Error("Chrome did not open the page.");
    try {
      await waitForLoad(tabId, 25e3);
      const spa = SPA_HOSTS.test(host);
      await sleep(spa ? 3500 : 1500);
      let snap = await read(tabId).catch((e) => {
        throw new Error(`Chrome would not let Captivum read this page. ${e.message}`);
      });
      if (spa && snap && snap.text.trim().length < 300) {
        await sleep(2500);
        snap = await read(tabId) ?? snap;
      }
      if (!snap) throw new Error("The page returned nothing to read.");
      const { href, ...rest } = snap;
      return { url, finalUrl: href || url, ...rest };
    } finally {
      chrome.tabs.remove(tabId).catch(() => void 0);
    }
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
      create(url, now2) {
        return lock(async () => {
          const all = await readAll();
          const iso = now2.toISOString();
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
      update(id, fn, now2 = /* @__PURE__ */ new Date()) {
        return lock(async () => {
          const all = await readAll();
          const i = all.findIndex((r) => r.id === id);
          if (i < 0) return void 0;
          const next = { ...fn(all[i]), id, updatedAt: now2.toISOString() };
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

  // src/background.ts
  var records = createRecords(chromeStore);
  function keepAlive(p) {
    const t = setInterval(() => void chrome.runtime.getPlatformInfo(), 2e4);
    return p.finally(() => clearInterval(t));
  }
  var actions = createActions({ store: chromeStore, records, fetchPage: fetchPageViaTab, keepAlive });
  async function handle(msg) {
    switch (msg.type) {
      case "extract": {
        const { reply } = await actions.startExtract(msg.input);
        return reply;
      }
      case "saveDraft":
        return actions.saveDraft(msg.id, msg.name, msg.dates);
      case "deliver":
        return actions.deliver(msg.id);
      case "reopen":
        return actions.reopen(msg.id);
      case "cancelInvites":
        return actions.cancelInvites(msg.id);
      case "delete":
        await actions.remove(msg.id);
        return { ok: true };
      case "scriptTest":
        return actions.scriptTest(msg.sendInvite);
      case "cancelTestInvite":
        return actions.cancelTestInvite(msg.eventId);
      case "llmTest":
        return actions.llmTest(msg.providerId);
      case "retryNow": {
        const n = await actions.retryQueued(true);
        return { ok: true, retried: n };
      }
      default:
        return { ok: false, error: "Unknown request." };
    }
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true;
  });
  async function refreshBadge() {
    const [counters, recs] = await Promise.all([getCounters(chromeStore), records.list()]);
    const queued = recs.filter((r) => r.status === "queued").length;
    const b = badgeFor(counters, queued);
    await chrome.action.setBadgeText({ text: b.text });
    await chrome.action.setBadgeBackgroundColor({ color: b.color });
  }
  function setup() {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => void 0);
    chrome.alarms.create("captivum-retry", { periodInMinutes: 5 });
    void refreshBadge();
  }
  chrome.runtime.onInstalled.addListener(setup);
  chrome.runtime.onStartup.addListener(setup);
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === "captivum-retry") void actions.retryQueued(false).then(refreshBadge);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.counters || changes.records)) void refreshBadge();
  });
  void (async () => {
    const stuck = (await records.list()).filter(
      (r) => (r.status === "extracting" || r.status === "sending") && Date.now() - Date.parse(r.updatedAt) > 9e4
    );
    for (const r of stuck) {
      await records.update(r.id, (x) => ({
        ...x,
        status: x.status === "extracting" ? "error" : "queued",
        error: "Interrupted. Try again."
      }));
    }
  })();
})();
