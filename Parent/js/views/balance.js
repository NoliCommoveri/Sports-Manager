// balance.js — this family's own child(ren) balance(s). Per-child rows plus
// a summed total when there's more than one child (PARENT-APP-SPEC.md §8.1).
import { getBundle } from '../store.js';
import { escapeHtml, centsToDollarsStr } from '../util.js';
import { emptyState, freshnessStamp } from './shared.js';

function childCard(c) {
  const name = escapeHtml(`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Player');
  const meta = escapeHtml([c.jerseyNumber ? `#${c.jerseyNumber}` : '', c.position || '']
    .filter(Boolean).join(' · '));
  const cents = c.balanceCents || 0;
  return `
    <div class="child-card">
      <div>
        <div class="child-name">${name}</div>
        ${meta ? `<div class="child-meta">${meta}</div>` : ''}
      </div>
      <div class="child-balance ${cents > 0 ? 'owed' : 'zero'}">$${centsToDollarsStr(cents)}</div>
    </div>`;
}

export function mount(container) {
  const bundle = getBundle();
  if (!bundle) { container.innerHTML = emptyState(); return () => {}; }

  const children = bundle.children || [];
  const total = children.reduce((sum, c) => sum + (c.balanceCents || 0), 0);

  container.innerHTML = `
    <h2>Balance</h2>
    ${freshnessStamp(bundle)}
    ${children.length ? children.map(childCard).join('') : '<p class="muted">No players linked to this family.</p>'}
    ${children.length > 1 ? `
      <div class="balance-total">
        <span>Total</span>
        <span>$${centsToDollarsStr(total)}</span>
      </div>` : ''}
    ${children.length && total === 0 ? '<p class="warning paid-up">✅ You\'re all paid up. Thank you!</p>' : ''}
  `;
  return () => {};
}
