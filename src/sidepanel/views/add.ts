import type { CaptivumRecord, ExtractedDate } from '../../types';
import { isScriptConfigured } from '../../lib/storage';
import { buildEventTitle } from '../../lib/title';
import { defaultLabel } from '../../lib/title';
import { applyDerivedFlags, validateForSend } from '../../lib/validate';
import { hostOf } from '../../lib/url';
import { resolveZoneInput } from '../../lib/tz';
import { BAD_FLAGS, FLAG_TEXT, cat, confirmButton, emptyState, ensureTzList, h, type Ctx } from '../ui';

const ACTIVE = new Set(['extracting', 'pending', 'sending', 'queued', 'failed', 'error']);

export function renderAdd(ctx: Ctx): HTMLElement {
  const wrap = h('div', {});

  if (!isScriptConfigured(ctx.settings)) {
    wrap.append(
      h(
        'div',
        { class: 'notice' },
        'Your sender is not linked yet, so invites cannot be sent. ',
        h('button', { class: 'link', onclick: () => ctx.setTab('settings') }, 'Set it up'),
      ),
    );
  }
  if (ctx.flash) wrap.append(h('div', { class: `notice ${ctx.flash.kind}` }, ctx.flash.kind === 'good' ? cat('happy', 40) : null, ctx.flash.text));

  const input = h('input', {
    type: 'text',
    placeholder: 'Paste a link and press Enter',
    value: ctx.addDraft,
    'aria-label': 'Link',
    autofocus: true,
  });
  input.addEventListener('input', () => (ctx.addDraft = input.value));
  const errorBox = h('div', { class: 'small', style: 'color:var(--bad);margin-top:6px' });

  let busy = false;
  const submit = async () => {
    errorBox.textContent = '';
    if (busy || !input.value.trim()) return;
    busy = true;
    input.disabled = true;
    const res = await ctx.send({ type: 'extract', input: input.value });
    busy = false;
    input.disabled = false;
    if (!res.ok) {
      errorBox.textContent = res.error;
      return;
    }
    ctx.addDraft = '';
    ctx.flash = res.existing ? { kind: 'warn', text: 'That link is already in your list.' } : null;
    ctx.rerender();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  // A pasted web address is read straight away, so there is no button to press.
  input.addEventListener('paste', () =>
    setTimeout(() => {
      if (/^https?:\/\/\S+$/i.test(input.value.trim())) void submit();
    }, 0),
  );
  wrap.append(input, errorBox);

  const active = ctx.records.filter((r) => ACTIVE.has(r.status));
  if (!active.length && !ctx.flash) {
    wrap.append(
      emptyState(
        'idle',
        'Paste a link from LinkedIn, X, a forum or an organisation site. I will read it, show you the deadline to check, and send the invite when you confirm.',
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
        h('div', { class: 'row' }, cat('look', 44), `Reading ${hostOf(r.url)}...`),
        h('div', { class: 'actions' }, h('button', { class: 'link', onclick: async () => (await ctx.send({ type: 'delete', id: r.id }), ctx.rerender()) }, 'Cancel')),
      );
    case 'sending':
      return h('div', { class: 'card' }, h('div', { class: 'row' }, cat('look', 44), `Sending the invite for ${r.name || hostOf(r.url)}...`));
    case 'error':
      return h(
        'div',
        { class: 'card' },
        h('h3', {}, hostOf(r.url)),
        h('div', { class: 'notice bad' }, cat('dizzy', 40), r.error ?? 'Could not read this page.'),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'primary', onclick: () => ctx.send({ type: 'extract', input: r.url }).then(() => ctx.rerender()) }, 'Try again'),
          h('button', { class: 'link', onclick: async () => (await ctx.send({ type: 'delete', id: r.id }), ctx.rerender()) }, 'Remove'),
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
          r.errorCode === 'not_configured' || r.errorCode === 'bad_secret'
            ? h('button', { class: 'link', onclick: () => ctx.setTab('settings') }, 'Fix sender')
            : h('button', { class: 'link', onclick: async () => (await ctx.send({ type: 'reopen', id: r.id }), ctx.rerender()) }, 'Edit'),
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
    nameInput,
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
      class: 'link',
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
    '+ Add a date',
  );

  const confirm = h('button', { class: 'primary wide' }, 'Send invite');
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
    datesBox,
    h('div', { class: 'actions' }, addDate),
    errors,
    confirm,
    h(
      'div',
      { class: 'center' },
      confirmButton(
        'Discard',
        async () => {
          ctx.drafts.delete(r.id);
          await ctx.send({ type: 'delete', id: r.id });
          ctx.rerender();
        },
        'link danger',
      ),
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

  const tz = h('input', { type: 'text', value: d.tz ?? '', list: 'tzlist', placeholder: `Default (${ctx.settings.defaultTz}). Try a city, like London`, 'aria-label': 'Time zone' });
  tz.addEventListener('change', () => {
    const raw = tz.value.trim();
    const res = raw ? resolveZoneInput(raw) : { tz: null as string | null };
    // "London" becomes Europe/London. Unknown text is kept so the card can warn about it.
    d.tz = res.tz ?? (raw || null);
    if (res.tz) tz.value = res.tz;
    touch(true);
  });

  // The start date lives under "More". Fill it in and the entry becomes a period.
  const startInput = h('input', { type: 'date', value: d.startDate ?? '' });
  startInput.addEventListener('change', () => {
    const wasPlain = d.label === defaultLabel(d.type, d.startDate !== null);
    d.startDate = startInput.value || null;
    if (!d.startDate) d.startTime = null;
    if (wasPlain) d.label = defaultLabel(d.type, d.startDate !== null);
    label.value = d.label;
    touch(true);
  });
  const startTime = timeInput(d.startTime, (v) => (d.startTime = v));
  const more = h(
    'details',
    { class: 'more' },
    h('summary', {}, 'More'),
    h(
      'div',
      { class: 'stack', style: 'margin-top:8px' },
      h('div', { class: 'grid2' }, field('Starts (for a period)', startInput), field('Start time', startTime)),
      field('Time zone', tz),
      d.rawPhrase ? h('div', { class: 'quote' }, d.startPhrase ? `"${d.startPhrase}" ... ` : '', `"${d.rawPhrase}"`) : null,
    ),
  );
  if (d.startDate || d.tz || d.flags.includes('no_timezone')) more.open = true;

  const parts: Array<Node | null> = [
    h('div', { class: 'row' }, check, label),
    h('div', { class: 'grid2' }, field(d.startDate ? 'Ends' : 'Date', dateInput(d.date, (v) => (d.date = v))), field('Time (optional)', timeInput(d.time, (v) => (d.time = v)))),
    chips,
    h('div', { class: 'title-preview', 'data-title-for': d.id }, buildEventTitle(draft.name, d)),
    more,
  ];
  row.append(...(parts.filter(Boolean) as Node[]));
  paintChips();

  ensureTzList([ctx.settings.defaultTz]);
  return row;
}
