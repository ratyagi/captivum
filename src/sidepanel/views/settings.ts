import type { Provider } from '../../types';
import { browserTz } from '../../lib/time';
import { isScriptConfigured } from '../../lib/storage';
import { h, type Ctx } from '../ui';

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

  const check = h('button', {}, 'Check connection');
  check.addEventListener('click', async () => {
    check.disabled = true;
    show('good', 'Checking...');
    const res = await ctx.send({ type: 'scriptTest', sendInvite: false });
    check.disabled = false;
    if (!res.ok) return show('bad', res.error);
    show('good', `Connected. Sender ${res.sender}, receiver ${res.receiver}. Calendar: ${res.calendar}.`);
  });
  const test = h('button', {}, 'Send a test invite');
  test.addEventListener('click', async () => {
    test.disabled = true;
    show('good', 'Sending...');
    const res = await ctx.send({ type: 'scriptTest', sendInvite: true });
    test.disabled = false;
    if (!res.ok) return show('bad', res.error);
    show('good', `Test invite sent to ${res.receiver}. Open Outlook on the web and look for Accept and Decline. `, String(res.eventId ?? ''));
  });
  paint();

  wrap.append(
    h('h2', {}, 'Sender (your Gmail)'),
    h(
      'div',
      { class: 'stack' },
      textField('Web app URL', s.scriptUrl, (v) => ctx.saveSettings({ scriptUrl: v }), {
        placeholder: 'https://script.google.com/macros/s/.../exec',
      }),
      textField('Secret', s.scriptSecret, (v) => ctx.saveSettings({ scriptSecret: v }), { type: 'password' }),
      h('div', { class: 'small muted' }, s.senderEmail ? `Sender: ${s.senderEmail}. Receiver: ${s.receiverEmail}.` : 'Sender and receiver show up here after you check the connection.'),
      h('div', { class: 'row' }, check, test),
      result,
    ),
  );

  // Time zone
  wrap.append(
    h('h2', {}, 'Time zone'),
    textField('Default time zone', s.defaultTz, (v) => ctx.saveSettings({ defaultTz: v || browserTz() }), {
      help: 'Used when a page gives a time but no zone. Example: America/New_York.',
    }),
  );

  // AI
  const llmToggle = h('input', { type: 'checkbox', checked: s.llmEnabled });
  llmToggle.addEventListener('change', () => ctx.saveSettings({ llmEnabled: llmToggle.checked }));
  wrap.append(
    h('h2', {}, 'AI check'),
    h('p', { class: 'muted small', style: 'margin-top:0' }, 'The parser reads most pages on its own. The AI is only asked when the parser is unsure. It reads public page text only. Providers are tried in order.'),
    h('label', { class: 'check' }, llmToggle, 'Use AI when the parser is unsure'),
  );
  for (const p of s.providers) wrap.append(providerBox(ctx, p));

  // About
  wrap.append(
    h('h2', {}, 'Usage'),
    h('div', { class: 'small muted' }, `${ctx.counters.totalInvites} invites sent in total.`),
  );
  void isScriptConfigured;
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
  const test = h('button', {}, 'Test key');
  test.addEventListener('click', async () => {
    test.disabled = true;
    out.textContent = 'Testing...';
    const res = await ctx.send({ type: 'llmTest', providerId: p.id });
    test.disabled = false;
    out.textContent = res.ok ? String(res.message) : res.error;
  });
  return h(
    'div',
    { class: 'card' },
    h('label', { class: 'check' }, on, h('strong', {}, p.name)),
    h(
      'div',
      { class: 'stack', style: 'margin-top:8px' },
      textField('API key', p.apiKey, (v) => save({ apiKey: v }), { type: 'password' }),
      textField('Model', p.model, (v) => save({ model: v })),
      textField('Base URL', p.baseUrl, (v) => save({ baseUrl: v })),
      h('label', { class: 'field' }, 'Structured output mode', mode),
      h('div', { class: 'row' }, test),
      out,
    ),
  );
}
