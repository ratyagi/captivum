import type { CaptivumRecord, ExtractedDate } from '../../types';
import { isScriptConfigured } from '../../lib/storage';
import { buildEventTitle } from '../../lib/title';
import { defaultLabel } from '../../lib/title';
import { applyDerivedFlags, validateForSend } from '../../lib/validate';
import { hostOf } from '../../lib/url';
import { BAD_FLAGS, FLAG_TEXT, confirmButton, h, type Ctx } from '../ui';

const TZ_OPTIONS = [
  'AoE',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const ACTIVE = new Set(['extracting', 'pending', 'sending', 'queued', 'failed', 'error']);

export function renderAdd(ctx: Ctx): HTMLElement {
  const wrap = h('div', {});

  if (!isScriptConfigured(ctx.settings)) {
    wrap.append(
      h(
        'div',
        { class: 'notice' },
        'Your sender is not linked yet, so invites cannot be sent. ',
        h('button', { class: 'link', onclick: () => ctx.setTab('settings') }, 'Open Settings'),
      ),
    );
  }
  if (ctx.flash) wrap.append(h('div', { class: `notice ${ctx.flash.kind}` }, ctx.flash.text));

  const input = h('input', {
    type: 'text',
    placeholder: 'Paste a link to a deadline or event',
    value: ctx.addDraft,
    'aria-label': 'Link',
  });
  input.addEventListener('input', () => (ctx.addDraft = input.value));
  const errorBox = h('div', { class: 'small', style: 'color:var(--bad);margin-top:6px' });
  const add = h('button', { class: 'primary' }, 'Add');

  const submit = async () => {
    errorBox.textContent = '';
    if (!input.value.trim()) return;
    add.disabled = true;
    const res = await ctx.send({ type: 'extract', input: input.value });
    add.disabled = false;
    if (!res.ok) {
      errorBox.textContent = res.error;
      return;
    }
    ctx.addDraft = '';
    ctx.flash = res.existing ? { kind: 'warn', text: 'That link is already in your list.' } : null;
    ctx.rerender();
  };
  add.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());

  const paste = h(
    'button',
    {
      title: 'Paste from clipboard',
      onclick: async () => {
        try {
          const t = await navigator.clipboard.readText();
          input.value = t.trim();
          ctx.addDraft = input.value;
          input.focus();
        } catch {
          errorBox.textContent = 'Chrome did not allow reading the clipboard. Paste with Ctrl+V or Cmd+V instead.';
        }
      },
    },
    'Paste',
  );
  wrap.append(h('div', { class: 'row' }, input, paste, add), errorBox);

  const active = ctx.records.filter((r) => ACTIVE.has(r.status));
  if (!active.length && !ctx.flash) {
    wrap.append(
      h(
        'p',
        { class: 'muted' },
        'Paste a link from LinkedIn, X, a forum or an organisation site. Captivum reads the page, shows you the deadline to check, and sends the invite when you confirm.',
      ),
    );
  }
  for (const r of active) wrap.append(renderCard(ctx, r));
  return wrap;
}

function renderCard(ctx: Ctx, r: CaptivumRecord): HTMLElement {
  switch (r.status) {
    case 'extracting':
      return h(
        'div',
        { class: 'card' },
        h('div', { class: 'row' }, h('span', { class: 'spinner' }), `Reading ${hostOf(r.url)}...`),
        h('div', { class: 'actions' }, h('button', { onclick: async () => (await ctx.send({ type: 'delete', id: r.id }), ctx.rerender()) }, 'Cancel')),
      );
    case 'sending':
      return h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'spinner' }), `Sending the invite for ${r.name || hostOf(r.url)}...`));
    case 'error':
      return h(
        'div',
        { class: 'card' },
        h('h3', {}, hostOf(r.url)),
        h('div', { class: 'notice bad' }, r.error ?? 'Could not read this page.'),
        h(
          'div',
          { class: 'actions' },
          h('button', { onclick: () => ctx.send({ type: 'extract', input: r.url }).then(() => ctx.rerender()) }, 'Try again'),
          h('button', { onclick: async () => (await ctx.send({ type: 'delete', id: r.id }), ctx.rerender()) }, 'Remove'),
        ),
      );
    case 'queued':
    case 'failed':
      return h(
        'div',
        { class: 'card' },
        h('div', { class: 'item-head' }, h('h3', {}, r.name || hostOf(r.url)), h('span', { class: `chip ${r.status === 'failed' ? 'bad' : 'warn'}` }, r.status === 'failed' ? 'Failed' : 'Will retry')),
        h('div', { class: `notice ${r.status === 'failed' ? 'bad' : ''}` }, r.error ?? 'Something went wrong.', r.status === 'queued' ? ' Captivum will try again automatically.' : ''),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'primary', onclick: async () => (await ctx.send({ type: 'deliver', id: r.id }), ctx.rerender()) }, 'Try now'),
          h('button', { onclick: async () => (await ctx.send({ type: 'reopen', id: r.id }), ctx.rerender()) }, 'Edit'),
          r.errorCode === 'not_configured' || r.errorCode === 'bad_secret' ? h('button', { onclick: () => ctx.setTab('settings') }, 'Settings') : null,
        ),
      );
    default:
      return reviewCard(ctx, r);
  }
}

function draftOf(ctx: Ctx, r: CaptivumRecord) {
  let d = ctx.drafts.get(r.id);
  if (!d) {
    d = { name: r.name, dates: structuredClone(r.dates) };
    ctx.drafts.set(r.id, d);
  }
  return d;
}

function reviewCard(ctx: Ctx, r: CaptivumRecord): HTMLElement {
  const draft = draftOf(ctx, r);
  const card = h('div', { class: 'card' });
  const nameInput = h('input', { type: 'text', value: draft.name, 'aria-label': 'Opportunity name', placeholder: 'Name of the opportunity' });
  const errors = h('div', { class: 'notice bad', style: 'display:none' });
  const datesBox = h('div', {});

  const refreshTitles = () => card.querySelectorAll<HTMLElement>('[data-title-for]').forEach((el) => {
    const d = draft.dates.find((x) => x.id === el.dataset.titleFor);
    if (d) el.textContent = buildEventTitle(draft.name, d);
  });

  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value;
    refreshTitles();
    ctx.scheduleSave(r.id);
  });

  card.append(
    h('label', { class: 'field' }, 'Name', nameInput),
    h('div', { class: 'small muted', style: 'margin-top:4px' }, `From ${hostOf(r.finalUrl || r.url)}`, r.usedLlm ? ' (checked with AI)' : ''),
  );
  for (const n of r.notes) card.append(h('div', { class: 'notice' }, n));

  const renderDates = () => {
    datesBox.replaceChildren();
    if (!draft.dates.length) datesBox.append(h('p', { class: 'muted' }, 'No dates were found. Add one below.'));
    for (const d of draft.dates) datesBox.append(dateRow(ctx, r, draft, d, refreshTitles));
  };
  renderDates();

  const addDate = h(
    'button',
    {
      onclick: () => {
        const base: ExtractedDate = {
          id: `m${Date.now().toString(36)}`,
          type: 'submission_deadline',
          label: defaultLabel('submission_deadline', false),
          date: '',
          time: null,
          tz: null,
          startDate: null,
          startTime: null,
          rawPhrase: '',
          source: 'parser',
          flags: [],
          selected: true,
        };
        draft.dates.push(base);
        ctx.scheduleSave(r.id);
        renderDates();
      },
    },
    'Add a date',
  );

  const confirm = h('button', { class: 'primary' }, 'Confirm and send');
  confirm.addEventListener('click', async () => {
    const probs = validateForSend({ name: draft.name, dates: draft.dates });
    if (probs.length) {
      errors.style.display = '';
      errors.textContent = probs.join(' ');
      return;
    }
    errors.style.display = 'none';
    confirm.disabled = true;
    await ctx.flushSave(r.id);
    const res = await ctx.send({ type: 'deliver', id: r.id });
    ctx.drafts.delete(r.id);
    if (res.ok) {
      ctx.flash = { kind: 'good', text: `Sent. Check your university inbox or calendar for "${draft.name}".` };
    } else if (res.code === 'not_configured') {
      ctx.settingsMsg = { kind: 'bad', text: res.error };
      ctx.setTab('settings');
      return;
    } else {
      ctx.flash = null;
    }
    ctx.rerender();
  });

  card.append(
    h('h2', {}, 'Dates'),
    datesBox,
    h('div', { class: 'actions' }, addDate),
    errors,
    h(
      'div',
      { class: 'actions' },
      confirm,
      confirmButton('Discard', async () => {
        ctx.drafts.delete(r.id);
        await ctx.send({ type: 'delete', id: r.id });
        ctx.rerender();
      }),
    ),
  );
  return card;
}

function dateRow(
  ctx: Ctx,
  r: CaptivumRecord,
  draft: { name: string; dates: ExtractedDate[] },
  d: ExtractedDate,
  refreshTitles: () => void,
): HTMLElement {
  const row = h('div', { class: 'date' });
  const chips = h('div', { class: 'row', style: 'flex-wrap:wrap' });

  const paintChips = () => {
    chips.replaceChildren();
    for (const f of d.flags) {
      chips.append(h('span', { class: `chip ${BAD_FLAGS.includes(f) ? 'bad' : 'warn'}`, title: FLAG_TEXT[f] }, FLAG_TEXT[f]));
    }
  };
  const touch = (recompute: boolean) => {
    if (recompute) {
      const next = applyDerivedFlags(d, new Date(), ctx.settings.defaultTz);
      d.flags = next.flags;
      paintChips();
    }
    refreshTitles();
    ctx.scheduleSave(r.id);
  };

  const check = h('input', { type: 'checkbox', checked: d.selected, 'aria-label': 'Send this date' });
  check.addEventListener('change', () => {
    d.selected = check.checked;
    touch(false);
  });
  const label = h('input', { type: 'text', value: d.label, 'aria-label': 'Label' });
  label.addEventListener('input', () => {
    d.label = label.value;
    touch(false);
  });

  const field = (text: string, el: HTMLElement) => h('label', { class: 'field' }, text, el);
  const dateInput = (value: string | null, set: (v: string) => void) => {
    const i = h('input', { type: 'date', value: value ?? '' });
    i.addEventListener('change', () => {
      set(i.value);
      touch(true);
    });
    return i;
  };
  const timeInput = (value: string | null, set: (v: string | null) => void) => {
    const i = h('input', { type: 'time', value: value ?? '' });
    i.addEventListener('change', () => {
      set(i.value || null);
      touch(true);
    });
    return i;
  };

  const hasStart = !!d.startDate;
  const windowToggle = h('label', { class: 'check small muted' });
  const wt = h('input', { type: 'checkbox', checked: hasStart });
  windowToggle.append(wt, 'This runs over a period');
  wt.addEventListener('change', () => {
    if (wt.checked) {
      d.startDate = d.date || null;
      d.label = defaultLabel(d.type, true);
    } else {
      d.startDate = null;
      d.startTime = null;
      d.label = defaultLabel(d.type, false);
    }
    touch(true);
    const repl = dateRow(ctx, r, draft, d, refreshTitles);
    row.replaceWith(repl);
  });

  const tz = h('input', { type: 'text', value: d.tz ?? '', list: 'tzlist', placeholder: `Default (${ctx.settings.defaultTz})`, 'aria-label': 'Time zone' });
  tz.addEventListener('change', () => {
    d.tz = tz.value.trim() || null;
    touch(true);
  });

  const parts: Array<Node | null> = [
    h('div', { class: 'row' }, check, label),
    d.startDate !== null
      ? h(
          'div',
          { class: 'grid2' },
          field('Starts', dateInput(d.startDate, (v) => (d.startDate = v || null))),
          field('Start time (optional)', timeInput(d.startTime, (v) => (d.startTime = v))),
        )
      : null,
    h(
      'div',
      { class: 'grid2' },
      field(d.startDate !== null ? 'Ends' : 'Date', dateInput(d.date, (v) => (d.date = v))),
      field('Time (optional)', timeInput(d.time, (v) => (d.time = v))),
    ),
    field('Time zone', tz),
    windowToggle,
    chips,
    d.rawPhrase
      ? h('div', { class: 'quote' }, d.startPhrase ? `"${d.startPhrase}" ... ` : '', `"${d.rawPhrase}"`)
      : null,
    h('div', { class: 'small muted' }, 'Event title'),
    h('div', { class: 'title-preview', 'data-title-for': d.id }, buildEventTitle(draft.name, d)),
    confirmButton('Remove this date', () => {
      const i = draft.dates.indexOf(d);
      if (i >= 0) draft.dates.splice(i, 1);
      ctx.scheduleSave(r.id);
      row.remove();
    }),
  ];
  row.append(...(parts.filter(Boolean) as Node[]));
  paintChips();

  if (!document.getElementById('tzlist')) {
    const dl = h('datalist', { id: 'tzlist' });
    for (const t of new Set([ctx.settings.defaultTz, ...TZ_OPTIONS])) dl.append(h('option', { value: t }));
    document.body.append(dl);
  }
  return row;
}
