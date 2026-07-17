// util.js — shared render helpers. Every bundle-derived string interpolated
// into innerHTML must pass through escapeHtml() first (inherited I-3) — the
// imported bundle is untrusted input.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function centsToDollarsStr(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function formatMoney(cents) {
  return `$${centsToDollarsStr(cents)}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00')
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTime(startTime, endTime) {
  return endTime ? `${startTime}–${endTime}` : startTime;
}

// Local-calendar 'YYYY-MM-DD', not toISOString() (UTC) — matches the admin
// app's selectors.js todayStr() so "today" agrees with the device's own
// clock rather than rolling over early/late across timezones.
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
