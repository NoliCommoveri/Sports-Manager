// communications.js — weekly digest broadcast + per-parent quick contact.
import { getParents, subscribe } from '../data.js';
import { buildWeeklyUpdateText, getAllParentEmails, mailtoLink, smsLink, copyToClipboard } from '../messaging.js';
import { escapeHtml } from '../util.js';

const SUBJECT = 'Weekly Practice & Snack Schedule';

export function mount(container) {
  container.innerHTML = `
    <h2>Communications</h2>
    <section class="weekly-update">
      <h3>Weekly Update</h3>
      <textarea id="weekly-update-text" rows="8"
        aria-label="Weekly update message — edit before sending"></textarea>
      <a id="email-all-btn" class="btn-link"></a>
      <button type="button" id="copy-update-btn">Copy Message</button>
      <span id="copy-feedback"></span>
    </section>
    <section class="contacts-section">
      <h3>Parent Contacts</h3>
      <div class="table-scroll">
        <table class="contacts-table">
          <thead><tr><th>Name</th><th></th><th></th></tr></thead>
          <tbody id="contacts-body"></tbody>
        </table>
      </div>
    </section>
  `;

  const textarea = container.querySelector('#weekly-update-text');
  const emailAllBtn = container.querySelector('#email-all-btn');
  const copyBtn = container.querySelector('#copy-update-btn');
  const feedback = container.querySelector('#copy-feedback');
  const contactsBody = container.querySelector('#contacts-body');

  // The textarea is the single source of truth for the outgoing message.
  // It's seeded once from the schedule; edits are ephemeral for this mount.
  let messageSeeded = false;

  // Current message = whatever is in the box right now (edited or generated).
  function currentMessage() {
    return textarea.value;
  }

  function renderWeeklyUpdate() {
    // Seed once. Guard against a data-change re-render clobbering an edit —
    // in a single-device PWA this won't fire mid-edit, but the guard is free.
    if (!messageSeeded) {
      textarea.value = buildWeeklyUpdateText();
      messageSeeded = true;
    }

    const emails = getAllParentEmails();
    emailAllBtn.href = mailtoLink(emails, SUBJECT, currentMessage());
    emailAllBtn.classList.toggle('disabled', emails.length === 0);
    emailAllBtn.textContent = emails.length
      ? `Email All Parents (${emails.length})`
      : 'Email All Parents (no parent emails on file)';
  }

  function renderContacts() {
    const parents = getParents();
    // Recipient details live in data-* attributes; the message body is folded
    // in at click time (see delegated handler) so edits are always reflected.
    contactsBody.innerHTML = parents.map(p => `
      <tr>
        <td><div class="name-display">${escapeHtml(p.name)}</div></td>
        <td>${p.email ? `<a href="#" data-action="email" data-email="${escapeHtml(p.email)}">Email</a>` : '—'}</td>
        <td>${p.phone ? `<a href="#" data-action="text" data-phone="${escapeHtml(p.phone)}">Text</a>` : '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="3">No parents yet.</td></tr>';
  }

  function render() {
    renderWeeklyUpdate();
    renderContacts();
  }

  // Keep the "Email All" href current as the coach edits the message.
  textarea.addEventListener('input', () => {
    emailAllBtn.href = mailtoLink(getAllParentEmails(), SUBJECT, currentMessage());
  });

  // Per-parent links: resolve the href from the live message at click time,
  // just before the browser follows it.
  contactsBody.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-action]');
    if (!link) return;
    const msg = currentMessage();
    link.href = link.dataset.action === 'email'
      ? mailtoLink(link.dataset.email, SUBJECT, msg)
      : smsLink(link.dataset.phone, msg);
  });

  copyBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(currentMessage());
    feedback.textContent = ok ? 'Copied!' : 'Copy failed — select the text above and copy manually.';
    setTimeout(() => { feedback.textContent = ''; }, 3000);
  });

  const unsub = subscribe(render);
  render();
  return () => unsub();
}
