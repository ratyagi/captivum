import { hostOf } from '../../lib/url';
import { confirmButton, emptyState, fmtWhen, h, statusChip, type Ctx } from '../ui';

export function renderHistory(ctx: Ctx): HTMLElement {
  const wrap = h('div', {});
  if (ctx.flash) wrap.append(h('div', { class: `notice ${ctx.flash.kind}`, style: 'margin-top:0' }, ctx.flash.text));
  const items = ctx.records.filter((r) => r.status === 'sent' || r.status === 'cancelled');
  if (!items.length) {
    wrap.append(emptyState('sleepy', 'Nothing here yet. Invites you send will be listed here.'));
    return wrap;
  }
  for (const r of items) {
    const sent = r.dates.filter((d) => r.delivered[d.id]);
    const card = h('div', { class: 'card' });
    card.append(
      h(
        'div',
        { class: 'item-head' },
        h('a', { href: r.finalUrl || r.url, target: '_blank', rel: 'noreferrer' }, r.name || hostOf(r.url)),
        statusChip(r.status),
      ),
    );
    if (sent.length) {
      for (const d of sent) card.append(h('div', { class: 'small' }, h('strong', {}, d.label + ': '), fmtWhen(d)));
    } else {
      card.append(h('div', { class: 'small muted' }, 'No active invites.'));
    }
    card.append(h('div', { class: 'small muted' }, `${hostOf(r.url)} · ${new Date(r.updatedAt).toLocaleString()}`));
    const actions = h('div', { class: 'actions' });
    actions.append(
      h(
        'button',
        {
          onclick: async () => {
            await ctx.send({ type: 'reopen', id: r.id });
            ctx.drafts.delete(r.id);
            ctx.setTab('add');
          },
        },
        'Edit and resend',
      ),
    );
    if (sent.length) {
      actions.append(
        confirmButton('Cancel invites', async () => {
          const res = await ctx.send({ type: 'cancelInvites', id: r.id });
          ctx.flash = res.ok
            ? { kind: 'good', text: 'Invites cancelled. The calendar entry is removed for your receiver.' }
            : { kind: 'bad', text: res.error };
          ctx.rerender();
        }),
      );
    }
    actions.append(
      confirmButton('Remove from list', async () => {
        await ctx.send({ type: 'delete', id: r.id });
        ctx.rerender();
      }),
    );
    card.append(actions);
    wrap.append(card);
  }
  return wrap;
}
