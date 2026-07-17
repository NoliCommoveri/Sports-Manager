// fundraisers.js — team-wide fundraiser progress (shareable, no per-family data).
import { getBundle } from '../store.js';
import { escapeHtml, formatMoney, fmtDate } from '../util.js';
import { emptyState, freshnessStamp } from './shared.js';

function fundraiserCard(f) {
  const goal = f.goalCents || 0;
  const raised = f.raisedCents || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : null;
  const money = goal > 0
    ? `${formatMoney(raised)} of ${formatMoney(goal)} raised`
    : `${formatMoney(raised)} raised`;
  const dates = (f.start && f.end)
    ? `${escapeHtml(fmtDate(f.start))} – ${escapeHtml(fmtDate(f.end))}`
    : 'Dates TBD';
  return `
    <div class="fundraiser-card">
      <h3>${escapeHtml(f.name)}</h3>
      <p class="fundraiser-stats">${escapeHtml(money)}</p>
      ${pct != null ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
      <p class="fundraiser-dates">${dates}</p>
    </div>`;
}

export function mount(container) {
  const bundle = getBundle();
  if (!bundle) { container.innerHTML = emptyState(); return () => {}; }

  const fundraisers = bundle.fundraisers || [];
  container.innerHTML = `
    <h2>Fundraisers</h2>
    ${freshnessStamp(bundle)}
    ${fundraisers.length ? fundraisers.map(fundraiserCard).join('') : '<p class="muted">No fundraisers to show right now.</p>'}
  `;
  return () => {};
}
