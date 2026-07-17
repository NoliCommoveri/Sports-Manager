// communications.js — a small composer for the three broadcasts the admin
// sends: a weekly schedule digest (customizable per event type), a registration
// notice, and per-family overdue-fee notices. Below the composer sits the
// per-parent quick-contact table.
//
// Each message is drafted into an editable <textarea> (or, for fees, a mailto/
// sms built at click time) — the textarea is the single source of truth for the
// outgoing text, seeded once and thereafter owned by the admin's edits. Toggling
// a control (a type checkbox) re-seeds deliberately; a data change never
// clobbers an in-progress edit.
import {
  getParents, getSettings, getPlayerById,
  getPlayerParentsForPlayer, getParentById, subscribe
} from '../data.js';
import {
  buildWeeklyUpdateText, buildRegistrationText, buildOverdueFeeText,
  getUpcomingEventTypes, getAllParentEmails, mailtoLink, smsLink, copyToClipboard
} from '../messaging.js';
import { getPlayersWithBalance } from '../selectors.js';
import { eventTypeLabel } from '../event-types.js';
import { escapeHtml, centsToDollarsStr } from '../util.js';

const WEEKLY_DAYS = 7;

function teamName() { return getSettings().teamName?.trim() || 'Team'; }
function weeklySubject() { return `${teamName()} Updates`; }
function registrationSubject() { return `${teamName()} Registration`; }
function feesSubject() { return `${teamName()} — Outstanding Balance`; }

export function mount(container) {
  container.innerHTML = `
    <h2>Communications</h2>
    <div class="comms-tabs" role="tablist">
      <button type="button" class="comms-tab" data-mode="weekly" role="tab">Weekly Schedule</button>
      <button type="button" class="comms-tab" data-mode="registration" role="tab">Registration</button>
      <button type="button" class="comms-tab" data-mode="fees" role="tab">Overdue Fees</button>
    </div>

    <section class="comms-panel" id="panel-weekly" role="tabpanel">
      <h3>Weekly Schedule</h3>
      <fieldset class="type-filter">
        <legend>Include event types</legend>
        <div id="weekly-type-options"></div>
      </fieldset>
      <textarea id="weekly-text" rows="9"
        aria-label="Weekly update message — edit before sending"></textarea>
      <a id="weekly-email-btn" class="btn-link"></a>
      <button type="button" class="copy-btn" data-target="weekly-text">Copy Message</button>
      <span class="copy-feedback"></span>
    </section>

    <section class="comms-panel" id="panel-registration" role="tabpanel" hidden>
      <h3>Registration Notice</h3>
      <p class="muted">Announces your Registration events. Add them on the Schedule tab;
        edit the draft below before sending.</p>
      <textarea id="registration-text" rows="9"
        aria-label="Registration message — edit before sending"></textarea>
      <a id="registration-email-btn" class="btn-link"></a>
      <button type="button" class="copy-btn" data-target="registration-text">Copy Message</button>
      <span class="copy-feedback"></span>
    </section>

    <section class="comms-panel" id="panel-fees" role="tabpanel" hidden>
      <h3>Overdue Fees</h3>
      <p class="muted">Each family is notified privately about their own balance —
        amounts are never broadcast to the whole team.</p>
      <div class="table-scroll">
        <table class="contacts-table fees-table">
          <thead><tr><th>Player</th><th>Balance</th><th>Notify</th></tr></thead>
          <tbody id="fees-body"></tbody>
        </table>
      </div>
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

  const tabsEl = container.querySelector('.comms-tabs');
  const tabButtons = [...container.querySelectorAll('.comms-tab')];
  const panels = {
    weekly: container.querySelector('#panel-weekly'),
    registration: container.querySelector('#panel-registration'),
    fees: container.querySelector('#panel-fees')
  };
  const weeklyTypeOptions = container.querySelector('#weekly-type-options');
  const weeklyText = container.querySelector('#weekly-text');
  const weeklyEmailBtn = container.querySelector('#weekly-email-btn');
  const regText = container.querySelector('#registration-text');
  const regEmailBtn = container.querySelector('#registration-email-btn');
  const feesBody = container.querySelector('#fees-body');
  const contactsBody = container.querySelector('#contacts-body');

  // View-local UI state (not persisted — matches the roster/schedule pattern).
  let mode = 'weekly';
  // The admin's explicit opt-outs. Storing opt-outs (not opt-ins) means a newly
  // scheduled event type is included by default the moment it appears.
  const excludedTypes = new Set();

  // ---- Email-all button plumbing (shared by the two broadcast panels) ----
  function setEmailAllBtn(btn, subject, body) {
    const emails = getAllParentEmails();
    btn.href = mailtoLink(emails, subject, body);
    btn.classList.toggle('disabled', emails.length === 0);
    btn.textContent = emails.length
      ? `Email All Parents (${emails.length})`
      : 'Email All Parents (no parent emails on file)';
  }

  // ---- Weekly panel ----
  function includedWeeklyTypes() {
    return getUpcomingEventTypes(WEEKLY_DAYS).filter(t => !excludedTypes.has(t));
  }

  // (Re)draft the weekly message from the current type selection. Called on
  // first mount and whenever a type checkbox toggles — a deliberate re-seed.
  function seedWeekly() {
    weeklyText.value = buildWeeklyUpdateText({ daysAhead: WEEKLY_DAYS, types: includedWeeklyTypes() });
    setEmailAllBtn(weeklyEmailBtn, weeklySubject(), weeklyText.value);
  }

  function renderWeeklyTypes() {
    const present = getUpcomingEventTypes(WEEKLY_DAYS);
    if (!present.length) {
      weeklyTypeOptions.innerHTML =
        `<span class="muted">No events in the next ${WEEKLY_DAYS} days.</span>`;
      return;
    }
    weeklyTypeOptions.innerHTML = present.map(t => `
      <label class="check-label">
        <input type="checkbox" class="weekly-type" value="${escapeHtml(t)}"
          ${excludedTypes.has(t) ? '' : 'checked'} />
        ${escapeHtml(eventTypeLabel(t))}
      </label>`).join('');
  }

  weeklyTypeOptions.addEventListener('change', (e) => {
    if (!e.target.classList.contains('weekly-type')) return;
    const t = e.target.value;
    if (e.target.checked) excludedTypes.delete(t); else excludedTypes.add(t);
    seedWeekly();
  });

  weeklyText.addEventListener('input', () => {
    setEmailAllBtn(weeklyEmailBtn, weeklySubject(), weeklyText.value);
  });

  // ---- Registration panel ----
  function seedRegistration() {
    regText.value = buildRegistrationText();
    setEmailAllBtn(regEmailBtn, registrationSubject(), regText.value);
  }

  regText.addEventListener('input', () => {
    setEmailAllBtn(regEmailBtn, registrationSubject(), regText.value);
  });

  // ---- Overdue Fees panel ----
  function renderFees() {
    const players = getPlayersWithBalance();
    feesBody.innerHTML = players.map(p => {
      const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || '(unnamed)';
      const amount = centsToDollarsStr(p.outstandingBalanceCents);
      const parents = getPlayerParentsForPlayer(p.id)
        .map(pp => getParentById(pp.parentId)).filter(Boolean);

      const notify = parents.length
        ? parents.map(par => {
            const links = [];
            if (par.email) links.push(
              `<a href="#" data-action="fee-email" data-player="${p.id}" data-email="${escapeHtml(par.email)}">Email</a>`);
            if (par.phone) links.push(
              `<a href="#" data-action="fee-text" data-player="${p.id}" data-phone="${escapeHtml(par.phone)}">Text</a>`);
            const bits = links.length ? links.join(' · ') : '<span class="muted">no contact</span>';
            return `${escapeHtml(par.name)}: ${bits}`;
          }).join('<br>')
        : '<span class="muted">No parent linked</span>';

      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>$${amount}</td>
        <td>${notify}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="3">No outstanding balances. 🎉</td></tr>';
  }

  // Resolve the per-family fee link from the live balance at click time.
  feesBody.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-action]');
    if (!link) return;
    const player = getPlayerById(link.dataset.player);
    if (!player) return;
    const msg = buildOverdueFeeText(player);
    link.href = link.dataset.action === 'fee-email'
      ? mailtoLink(link.dataset.email, feesSubject(), msg)
      : smsLink(link.dataset.phone, msg);
  });

  // ---- Parent contacts (unchanged behavior) ----
  function renderContacts() {
    const parents = getParents();
    contactsBody.innerHTML = parents.map(p => `
      <tr>
        <td><div class="name-display">${escapeHtml(p.name)}</div></td>
        <td>${p.email ? `<a href="#" data-action="email" data-email="${escapeHtml(p.email)}">Email</a>` : '—'}</td>
        <td>${p.phone ? `<a href="#" data-action="text" data-phone="${escapeHtml(p.phone)}">Text</a>` : '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="3">No parents yet.</td></tr>';
  }

  // Per-parent links use the current weekly draft as the body (the message the
  // admin is most likely mid-composing), resolved at click time.
  contactsBody.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-action]');
    if (!link) return;
    const msg = weeklyText.value;
    link.href = link.dataset.action === 'email'
      ? mailtoLink(link.dataset.email, weeklySubject(), msg)
      : smsLink(link.dataset.phone, msg);
  });

  // ---- Tabs ----
  function applyMode() {
    tabButtons.forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    panels.weekly.hidden = mode !== 'weekly';
    panels.registration.hidden = mode !== 'registration';
    panels.fees.hidden = mode !== 'fees';
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.comms-tab');
    if (!btn) return;
    mode = btn.dataset.mode;
    applyMode();
  });

  // ---- Copy buttons (shared) ----
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const feedback = btn.parentElement.querySelector('.copy-feedback');
    const ok = await copyToClipboard(container.querySelector(`#${btn.dataset.target}`).value);
    if (feedback) {
      feedback.textContent = ok ? 'Copied!' : 'Copy failed — select the text above and copy manually.';
      setTimeout(() => { feedback.textContent = ''; }, 3000);
    }
  });

  // Data-change refresh: everything that reflects records, but NOT the textareas
  // (owned by the admin's edits after their one-time seed).
  function render() {
    renderWeeklyTypes();
    renderFees();
    renderContacts();
    setEmailAllBtn(weeklyEmailBtn, weeklySubject(), weeklyText.value);
    setEmailAllBtn(regEmailBtn, registrationSubject(), regText.value);
  }

  // One-time seeds, then the live render + subscription.
  seedWeekly();
  seedRegistration();
  applyMode();
  const unsub = subscribe(render);
  render();
  return () => unsub();
}
