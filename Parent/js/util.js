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

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00')
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
