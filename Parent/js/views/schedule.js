// schedule.js — the team schedule, with this family's snack duty flagged.
import { getBundle } from '../store.js';
import { escapeHtml, fmtDate } from '../util.js';
import { emptyState, freshnessStamp } from './shared.js';

const TYPE_LABELS = { game: 'Game', practice: 'Practice', registration: 'Registration' };
function typeLabel(t) { return TYPE_LABELS[t] || t; }

// Every bundle-derived field is escaped individually before concatenation
// (inherited I-3) — the imported bundle is untrusted input.
function eventRow(e) {
  const time = escapeHtml(e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime);
  const label = escapeHtml(typeLabel(e.type));
  const opponent = e.type === 'game' ? ` vs ${escapeHtml(e.opponent || 'TBD')}` : '';
  const score = e.score ? ` <span class="muted">(Final ${escapeHtml(e.score)})</span>` : '';
  return `
    <tr class="${e.isMySnackDuty ? 'snack-duty-row' : ''}">
      <td>${escapeHtml(fmtDate(e.date))}<br><span class="muted">${time}</span></td>
      <td>${label}${opponent}${score}</td>
      <td>${escapeHtml(e.location || '')}</td>
      <td>${e.isMySnackDuty ? '<span class="snack-duty-badge">🍎 Your snack duty</span>' : ''}</td>
    </tr>`;
}

export function mount(container) {
  const bundle = getBundle();
  if (!bundle) { container.innerHTML = emptyState(); return () => {}; }

  const rows = bundle.schedule || [];
  container.innerHTML = `
    <h2>Schedule</h2>
    ${freshnessStamp(bundle)}
    <div class="table-scroll">
      <table>
        <thead><tr><th>Date</th><th>Event</th><th>Location</th><th></th></tr></thead>
        <tbody>${rows.map(eventRow).join('') || '<tr><td colspan="4">Nothing scheduled.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  return () => {};
}
