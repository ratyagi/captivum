import type { Provider } from '../../types';
import { resolveTz } from '../../lib/time';
import { nowIn, resolveZoneInput } from '../../lib/tz';
import { isScriptConfigured } from '../../lib/storage';
import { ensureTzList, h, type Ctx } from '../ui';

function textField(
  label: string,
  value: string,
  onChange: (v: string) => void,
  opts: { type?: string; placeholder?: string; help?: string } = {},
): HTMLElement {
  const i = h('input', { type: opts.type ?? 'text', value, placeholder: opts.placeholder, autocomplete: 'off', spellcheck: false });
  i.addEventListener('change', () => onChange(i.value.trim()));
  return h('label', { class: 'field' }, label, i, opts.help ? h('span', { class: 'small' }, opts.help) : null);
}

export function renderSettings(ctx: Ctx): HTMLElement {
  const s = ctx.settings;
  const wrap = h('div', {});

  // Sender
  const result = h('div', { class: 'small', style: 'margin-top:8px' });
  const paint = () => {
    const m = ctx.settingsMsg;
    if (!m) return result.replaceChildren();
    let extra: Node | null = null;
    if (m.testEventId) {
      const eventId = m.testEventId;
      const undo = h('button', { class: 'link' }, 'Remove the test invite');
      undo.addEventListener('click', async () => {
        const r = await ctx.send({ type: 'cancelTestInvite', eventId });
        ctx.settingsMsg = r.ok ? { kind: 'good', text: 'Test invite removed.' } : { kind: 'bad', text: r.error };
        paint();
      });
      extra = undo;
    }
    result.replaceChildren(h('div', { class: `notice ${m.kind}`, style: 'margin-top:0' }, m.text, extra));
  };
  const show = (kind: 'good' | 'bad', text: string, testEventId?: string) => {
    ctx.settingsMsg = { kind, text, testEventId };
    paint();
  };

  // Checks run by themselves when both boxes are filled, so there is no button for it.
  const verify = async () => {
    const cur = ctx.settings;
    if (!isScriptConfigured(cur) || !cur.scriptSecret) return;
    show('good', 'Checking...');
    const res = await ctx.send({ type: 'scriptTest', sendInvite: false });
    if (!res.ok) return show('bad', res.error);
    show('good', `Connected. Invites go from ${res.sender} to ${res.receiver}.`);
  };
  const test = h('button', { class: 'link' }, 'Send a test invite');
  test.addEventListener('click', async () => {
    test.disabled = true;
    show('good', 'Sending...');
    const res = await ctx.send({ type: 'scriptTest', sendInvite: true });
    test.disabled = false;
    if (!res.ok) return show('bad', res.error);
    show('good', `Test invite sent to ${res.receiver}. `, String(res.eventId ?? ''));
  });
  paint();

  const saveAndVerify = async (patch: Partial<typeof s>) => {
    await ctx.saveSettings(patch);
    await verify();
  };
  wrap.append(
    h('h2', {}, 'Sender (your Gmail)'),
    h(
      'div',
      { class: 'stack' },
      textField('Web app URL', s.scriptUrl, (v) => saveAndVerify({ scriptUrl: v }), {
        placeholder: 'https://script.google.com/macros/s/.../exec',
      }),
      textField('Secret', s.scriptSecret, (v) => saveAndVerify({ scriptSecret: v }), { type: 'password' }),
      h('div', { class: 'small muted' }, 'You only enter these once. They stay in this browser.'),
      result,
      isScriptConfigured(s) ? h('div', {}, test) : null,
    ),
  );

  // Time zone
  const tzInput = h('input', { type: 'text', value: s.defaultTz, list: 'tzlist', placeholder: 'A city, like London', autocomplete: 'off', spellcheck: false });
  const tzNote = h('div', { class: 'small' });
  const paintTz = (tz: string) => {
    const when = nowIn(tz);
    tzNote.textContent = when ? `Using ${tz}. It is ${when} there now.` : '';
    tzNote.className = 'small muted';
  };
  paintTz(s.defaultTz);
  tzInput.addEventListener('change', async () => {
    const r = resolveZoneInput(tzInput.value);
    if (!r.tz || !resolveTz(r.tz)) {
      tzNote.textContent = 'Not recognised. Try a city (London, Tokyo, New York), an abbreviation (IST, CET) or a name like Europe/London.';
      tzNote.className = 'small';
      tzNote.style.color = 'var(--bad)';
      return;
    }
    tzNote.style.color = '';
    tzInput.value = r.tz;
    paintTz(r.tz);
    await ctx.saveSettings({ defaultTz: r.tz });
  });
  ensureTzList();
  wrap.append(
    h('h2', {}, 'Time zone'),
    h(
      'label',
      { class: 'field' },
      'Default time zone',
      tzInput,
      h('span', { class: 'small' }, 'Used when a page gives a time but no zone. Any city or zone in the world works.'),
    ),
    tzNote,
  );

  // AI, tucked away because most pages never need it.
  const llmToggle = h('input', { type: 'checkbox', checked: s.llmEnabled });
  llmToggle.addEventListener('change', () => ctx.saveSettings({ llmEnabled: llmToggle.checked }));
  const ai = h(
    'details',
    { class: 'more', style: 'margin-top:18px' },
    h('summary', {}, 'AI help (optional)'),
    h('p', { class: 'muted small' }, 'The parser reads most pages on its own. The AI is only asked when the parser is unsure. It sees public page text only.'),
    h('label', { class: 'check' }, llmToggle, 'Use AI when the parser is unsure'),
  );
  for (const p of s.providers) ai.append(providerBox(ctx, p));
  if (s.llmEnabled || s.providers.some((p) => p.apiKey)) ai.open = true;
  wrap.append(ai);

  // About
  wrap.append(
    h('h2', {}, 'Usage'),
    h('div', { class: 'small muted' }, `${ctx.counters.totalInvites} invites sent in total.`),
  );
  return wrap;
}

function providerBox(ctx: Ctx, p: Provider): HTMLElement {
  const save = (patch: Partial<Provider>) =>
    ctx.saveSettings({ providers: ctx.settings.providers.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
  const on = h('input', { type: 'checkbox', checked: p.enabled });
  on.addEventListener('change', () => save({ enabled: on.checked }));
  const mode = h('select', {}, ...(['json_object', 'json_schema', 'none'] as const).map((m) => h('option', { value: m, selected: m === p.jsonMode }, m)));
  mode.addEventListener('change', () => save({ jsonMode: mode.value as Provider['jsonMode'] }));
  const out = h('div', { class: 'small' });
  const test = async () => {
    out.textContent = 'Testing the key...';
    const res = await ctx.send({ type: 'llmTest', providerId: p.id });
    out.textContent = res.ok ? String(res.message) : res.error;
  };
  return h(
    'div',
    { class: 'card' },
    h('label', { class: 'check' }, on, h('strong', {}, p.name)),
    h(
      'div',
      { class: 'stack', style: 'margin-top:8px' },
      textField('API key', p.apiKey, async (v) => { await save({ apiKey: v }); if (v) await test(); }, { type: 'password' }),
      h('details', { class: 'more' }, h('summary', {}, 'Advanced'),
        h('div', { class: 'stack', style: 'margin-top:8px' },
          textField('Model', p.model, (v) => save({ model: v })),
          textField('Base URL', p.baseUrl, (v) => save({ baseUrl: v })),
          h('label', { class: 'field' }, 'Structured output mode', mode))),
      out,
    ),
  );
}
