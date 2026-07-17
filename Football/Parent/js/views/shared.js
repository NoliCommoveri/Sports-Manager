// shared.js — small render helpers reused by every view.

export function emptyState() {
  return `
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <h2>No family info yet</h2>
      <p>Ask your team admin for your family link, then open it on this device.</p>
    </div>`;
}

// `generatedAt` is an admin-produced ISO timestamp, formatted via the
// platform Date/Intl APIs — never interpolated raw, so no escaping needed.
export function freshnessStamp(bundle) {
  const d = new Date(bundle.generatedAt);
  if (isNaN(d)) return '';
  const stamp = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `<p class="freshness-stamp">Updated ${stamp} — you'll get a new link when things change</p>`;
}
