/**
 * Captivum sender.
 *
 * Runs as your personal Gmail account. The Captivum extension posts a request here.
 * The script creates an event on a calendar called "Captivum" and adds your university
 * address as a guest. Google emails the invite, and Outlook shows Accept and Decline.
 *
 * Setup: see SETUP.md. You need two Script properties (Project Settings):
 *   SECRET    a long random string, also pasted into the extension
 *   RECEIVER  the university email address that should get the invites
 * Optional properties:
 *   CALENDAR_ID    use a specific calendar, or "primary" for your main one
 *   CALENDAR_NAME  name of the dedicated calendar (default "Captivum")
 *   DAILY_LIMIT    your own cap on invites per day (default 100)
 */

var VERSION = '0.1.0';
var DEFAULT_DAILY_LIMIT = 100;
var HOURLY_CREATE_LIMIT = 30;

function CaptivumError_(code, message) {
  this.code = code;
  this.message = message;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  return json_({ ok: false, error: code, message: message });
}

function ok_(extra) {
  var out = { ok: true, version: VERSION, quota: quota_() };
  for (var k in extra) out[k] = extra[k];
  return json_(out);
}

/**
 * Run this once from the editor (pick "authorize" in the function list, then Run).
 * It touches Calendar so Google asks for the calendar permission up front.
 */
function authorize() {
  var cal = calendarId_();
  Logger.log('Calendar ready: ' + Calendar.Calendars.get(cal).summary + '. Sender: ' + Session.getEffectiveUser().getEmail());
}

/** Opening the /exec link in a browser answers with this. It reveals nothing private. */
function doGet() {
  return json_({ ok: true, service: 'captivum', version: VERSION });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret) return fail_('setup_incomplete', 'Add SECRET and RECEIVER in Project Settings, under Script properties.');
    if (!req.secret || req.secret !== secret) return fail_('bad_secret', 'The secret does not match the one in the script.');
    switch (req.action) {
      case 'test':
        return handleTest_(req);
      case 'create':
        return handleCreate_(req);
      case 'update':
        return handleUpdate_(req);
      case 'cancel':
        return handleCancel_(req);
      case 'quota':
        return ok_({});
      default:
        return fail_('bad_request', 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof CaptivumError_) return fail_(err.code, err.message);
    return fail_('script_error', String((err && err.message) || err));
  }
}

// ---------- configuration ----------

function config_() {
  var props = PropertiesService.getScriptProperties();
  var receiver = String(props.getProperty('RECEIVER') || '').trim().toLowerCase();
  var sender = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!receiver) throw new CaptivumError_('setup_incomplete', 'Add RECEIVER in Script properties.');
  if (receiver === sender) {
    throw new CaptivumError_('same_address', 'The sender and the receiver are the same address. Use two different accounts.');
  }
  return { sender: sender, receiver: receiver };
}

function calendarId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CALENDAR_ID');
  if (id) return id;
  var name = props.getProperty('CALENDAR_NAME') || 'Captivum';
  var found = CalendarApp.getCalendarsByName(name).filter(function (c) {
    return c.isOwnedByMe();
  });
  var cal = found.length ? found[0] : CalendarApp.createCalendar(name);
  props.setProperty('CALENDAR_ID', cal.getId());
  return cal.getId();
}

// ---------- limits ----------

function dayKey_() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
}

function quota_() {
  var props = PropertiesService.getScriptProperties();
  var limit = Number(props.getProperty('DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
  var used = Number(props.getProperty('q:' + dayKey_())) || 0;
  return { used: used, limit: limit, left: Math.max(0, limit - used) };
}

function bumpQuota_() {
  var props = PropertiesService.getScriptProperties();
  var key = 'q:' + dayKey_();
  var keys = props.getKeys();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('q:') === 0 && keys[i] !== key) props.deleteProperty(keys[i]);
  }
  props.setProperty(key, String((Number(props.getProperty(key)) || 0) + 1));
}

function guard_() {
  if (quota_().left <= 0) {
    throw new CaptivumError_('quota', 'The daily invite limit is used up. It resets tomorrow.');
  }
  var cache = CacheService.getScriptCache();
  var key = 'rate:' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key)) || 0;
  if (n >= HOURLY_CREATE_LIMIT) {
    throw new CaptivumError_('rate_limited', 'Too many invites this hour. Captivum will try again later.');
  }
  cache.put(key, String(n + 1), 3700);
}

// ---------- events ----------

var DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;

function validate_(p) {
  if (!p.requestId) throw new CaptivumError_('bad_request', 'Missing requestId.');
  if (!p.title || !String(p.title).trim()) throw new CaptivumError_('bad_request', 'Missing title.');
  if (p.allDay) {
    if (!DATE_RE_.test(p.startDate || '') || !DATE_RE_.test(p.endDate || '') || p.endDate <= p.startDate) {
      throw new CaptivumError_('bad_request', 'Bad all-day dates.');
    }
  } else {
    var s = new Date(p.startDateTime);
    var e = new Date(p.endDateTime);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) throw new CaptivumError_('bad_request', 'Bad start or end time.');
  }
}

function eventResource_(p, receiver) {
  var res = {
    summary: String(p.title).slice(0, 250),
    description: String(p.description || '').slice(0, 8000),
    attendees: [{ email: receiver }],
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    transparency: 'transparent',
    extendedProperties: { private: { captivumRequest: String(p.requestId) } },
  };
  if (p.sourceUrl && /^https?:\/\//i.test(p.sourceUrl)) {
    res.source = { title: 'Original page', url: String(p.sourceUrl) };
  }
  if (p.allDay) {
    res.start = { date: p.startDate };
    res.end = { date: p.endDate };
  } else {
    res.start = { dateTime: new Date(p.startDateTime).toISOString(), timeZone: 'UTC' };
    res.end = { dateTime: new Date(p.endDateTime).toISOString(), timeZone: 'UTC' };
  }
  return res;
}

function isNotFound_(err) {
  return /not found|404|deleted|410|gone/i.test(String((err && err.message) || err));
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function createEvent_(p, cfg) {
  var cal = calendarId_();
  var existing = Calendar.Events.list(cal, {
    privateExtendedProperty: 'captivumRequest=' + p.requestId,
    maxResults: 1,
    showDeleted: false,
  });
  // A retry of a request that already went through returns the same event.
  if (existing.items && existing.items.length) return { eventId: existing.items[0].id, duplicate: true };
  guard_();
  var ev = Calendar.Events.insert(eventResource_(p, cfg.receiver), cal, { sendUpdates: 'all' });
  bumpQuota_();
  return { eventId: ev.id, htmlLink: ev.htmlLink };
}

function handleTest_(req) {
  var cfg = config_();
  var cal = calendarId_();
  var out = { sender: cfg.sender, receiver: cfg.receiver, calendar: Calendar.Calendars.get(cal).summary };
  if (req.sendInvite) {
    var day = new Date(Date.now() + 3 * 86400000);
    var start = Utilities.formatDate(day, 'UTC', 'yyyy-MM-dd');
    var end = Utilities.formatDate(new Date(day.getTime() + 86400000), 'UTC', 'yyyy-MM-dd');
    var made = withLock_(function () {
      return createEvent_(
        {
          requestId: 'test:' + Date.now(),
          title: 'Captivum test invite',
          description: 'If you can see Accept and Decline in Outlook, Captivum is set up correctly. You can delete this.',
          allDay: true,
          startDate: start,
          endDate: end,
        },
        cfg,
      );
    });
    out.eventId = made.eventId;
  }
  return ok_(out);
}

function handleCreate_(req) {
  var cfg = config_();
  validate_(req);
  var made = withLock_(function () {
    return createEvent_(req, cfg);
  });
  return ok_(made);
}

function handleUpdate_(req) {
  var cfg = config_();
  validate_(req);
  if (!req.eventId) throw new CaptivumError_('bad_request', 'Missing eventId.');
  try {
    var ev = Calendar.Events.patch(eventResource_(req, cfg.receiver), calendarId_(), req.eventId, { sendUpdates: 'all' });
    return ok_({ eventId: ev.id });
  } catch (err) {
    if (isNotFound_(err)) throw new CaptivumError_('not_found', 'That calendar event no longer exists.');
    throw err;
  }
}

function handleCancel_(req) {
  config_();
  if (!req.eventId) throw new CaptivumError_('bad_request', 'Missing eventId.');
  try {
    Calendar.Events.remove(calendarId_(), req.eventId, { sendUpdates: 'all' });
    return ok_({});
  } catch (err) {
    if (isNotFound_(err)) return ok_({ alreadyGone: true });
    throw err;
  }
}
