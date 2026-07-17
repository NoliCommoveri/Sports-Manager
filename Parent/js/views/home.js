// home.js — landing dashboard: season record, next game/practice, an open-
// registration banner, and the admin's free-authored announcement.
import { getBundle } from '../store.js';
import { escapeHtml, fmtDate, fmtTime, todayStr } from '../util.js';
import { emptyState, freshnessStamp } from './shared.js';

function nextOfType(schedule, type, today) {
  return schedule.find(e => e.type === type && e.status === 'scheduled' && e.date >= today) || null;
}

function eventCard(e) {
  if (!e) return '<p class="muted">Nothing scheduled.</p>';
  const opponent = e.type === 'game' ? `<p class="vs-line">vs <strong>${escapeHtml(e.opponent || 'TBD')}</strong></p>` : '';
  return `
    ${opponent}
    <p class="when-line">${escapeHtml(fmtDate(e.date))} · ${escapeHtml(fmtTime(e.startTime, e.endTime))}</p>
    ${e.location ? `<p class="loc-line">${escapeHtml(e.location)}</p>` : ''}
  `;
}

function registrationBanner(schedule, today) {
  const open = schedule
    .filter(e => e.type === 'registration' && e.status === 'scheduled' && e.date >= today);
  if (!open.length) return '';
  const next = open[0];
  return `
    <section class="registration-banner">
      <h3>📝 Registration is open</h3>
      <p class="when-line">${escapeHtml(fmtDate(next.date))} · ${escapeHtml(fmtTime(next.startTime, next.endTime))}</p>
      ${next.location ? `<p class="loc-line">${escapeHtml(next.location)}</p>` : ''}
    </section>`;
}

function announcementSection(bundle) {
  const text = (bundle.announcement || '').trim();
  if (!text) return '';
  return `
    <section class="announcement-section">
      <h3>📣 Announcement</h3>
      <p class="announcement-text">${escapeHtml(text)}</p>
    </section>`;
}

export function mount(container) {
  const bundle = getBundle();
  if (!bundle) { container.innerHTML = emptyState(); return () => {}; }

  const today = todayStr();
  const schedule = bundle.schedule || [];
  const record = bundle.record || { wins: 0, losses: 0, ties: 0 };
  const recordLine = record.ties > 0
    ? `${record.wins}–${record.losses}–${record.ties}`
    : `${record.wins}–${record.losses}`;

  container.innerHTML = `
    ${freshnessStamp(bundle)}
    ${registrationBanner(schedule, today)}
    <div class="dashboard-cards">
      <section class="record-card">
        <h3>Record</h3>
        <p class="big-stat">${escapeHtml(recordLine)}</p>
      </section>
      <section class="next-game-card">
        <h3>Next Game</h3>
        ${eventCard(nextOfType(schedule, 'game', today))}
      </section>
      <section class="next-practice-card">
        <h3>Next Practice</h3>
        ${eventCard(nextOfType(schedule, 'practice', today))}
      </section>
    </div>
    ${announcementSection(bundle)}
  `;
  return () => {};
}
