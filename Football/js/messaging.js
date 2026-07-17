// messaging.js — mailto:/sms: link builders + broadcast/notice text. No localStorage access.
import {
  getEvents, getSnackAssignmentsForEvent, getParentById,
  getOpponentById, getParents, getSettings
} from './data.js';
import { todayStr, addDaysStr } from './selectors.js';
import { eventTypeLabel, orderEventTypes } from './event-types.js';
import { centsToDollarsStr } from './util.js';

const DEFAULT_WEEKLY_DAYS = 7;
const DEFAULT_REGISTRATION_DAYS = 60; // registration lands further out than a week

function teamName() {
  return getSettings().teamName?.trim() || 'Team';
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00')
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const byDateTime = (a, b) => a.date === b.date
  ? (a.startTime || '').localeCompare(b.startTime || '') : a.date.localeCompare(b.date);

// Non-canceled events in [today, today+daysAhead], sorted. `types`, when given,
// restricts to that set of type values (used by the customizable weekly digest).
function eventsInWindow(daysAhead, types = null) {
  const today = todayStr();
  const endDate = addDaysStr(today, daysAhead);
  return getEvents()
    .filter(e => e.date >= today && e.date <= endDate && e.status !== 'canceled'
      && (types == null || types.includes(e.type)))
    .sort(byDateTime);
}

// One digest line for an event. Games keep their opponent + snack detail;
// every other type renders from its registry label, so registration (and any
// future type) formats without a special case here.
function eventLine(e) {
  let line = `${fmtDate(e.date)} ${e.startTime}`;
  if (e.type === 'game') {
    const opp = e.opponentId ? getOpponentById(e.opponentId)?.name : null;
    line += ` — Game vs ${opp || 'TBD'}`;
  } else {
    line += ` — ${eventTypeLabel(e.type)}`;
  }
  if (e.location) line += ` @ ${e.location}`;
  if (e.type === 'game') {
    const snackNames = getSnackAssignmentsForEvent(e.id)
      .map(sa => getParentById(sa.parentId)?.name)
      .filter(Boolean);
    line += snackNames.length ? ` (Snacks: ${snackNames.join(', ')})` : ' (Snacks: unassigned)';
  }
  return line;
}

// The distinct event types actually present in the weekly window, in registry
// order. Lets Communications scope the digest's type toggles to what's there.
export function getUpcomingEventTypes(daysAhead = DEFAULT_WEEKLY_DAYS) {
  return orderEventTypes(eventsInWindow(daysAhead).map(e => e.type));
}

// Plain-text digest of upcoming events + snack assignments, default 7 days out.
// `types` (array of type values) scopes which event types are included; omit it
// to include every type in the window (original behavior).
export function buildWeeklyUpdateText({ daysAhead = DEFAULT_WEEKLY_DAYS, types = null } = {}) {
  const greeting = `Hello ${teamName()} Family, these are the important updates for this week:`;
  const upcoming = eventsInWindow(daysAhead, types);

  if (upcoming.length === 0) {
    return `${greeting}\n\nNothing scheduled in the next ${daysAhead} days.`;
  }
  return `${greeting}\n\n${upcoming.map(eventLine).join('\n')}`;
}

// Registration announcement. Lists any upcoming `registration` events; when
// none are scheduled yet, drops in an editable template the admin fills in.
export function buildRegistrationText({ daysAhead = DEFAULT_REGISTRATION_DAYS } = {}) {
  const greeting = `Hello ${teamName()} Family,`;
  const regs = eventsInWindow(daysAhead, ['registration']);

  if (regs.length === 0) {
    return `${greeting}\n\nIt's time to register for the upcoming season. Please complete your `
      + `registration as soon as possible.\n\n`
      + `[Add the registration date, location, cost, and sign-up link here.]`;
  }
  const lines = regs.map(e => {
    let line = `${fmtDate(e.date)} ${e.startTime} — Registration`;
    if (e.location) line += ` @ ${e.location}`;
    return line;
  });
  return `${greeting}\n\nRegistration is open — please complete it on the date(s) below:\n\n${lines.join('\n')}`;
}

// A blank broadcast: just the greeting, no data pulled. The admin types the
// rest. "Families" (plural) per the News tab's copy.
export function buildNewsText() {
  return `Hello ${teamName()} Families,\n\n`;
}

// Editable template for the per-family overdue-fees notice. `{player}` and
// `{amount}` are substituted per family at send time (see renderFeeTemplate),
// so the admin can reword the message once and it applies to every family.
export function buildOverdueFeeTemplate() {
  return `Hello ${teamName()} Family,\n\n`
    + `Our records show an outstanding balance of {amount} for {player}. `
    + `Please arrange payment at your earliest convenience, or reach out if you have any questions.\n\n`
    + `Thank you!`;
}

// Fill a fee template for one player. Mentions only this player's balance so
// the message can go to that player's own parents (I-9: never broadcast the
// whole team's balances, never exported).
export function renderFeeTemplate(template, player) {
  const name = `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'your player';
  const amount = `$${centsToDollarsStr(player.outstandingBalanceCents)}`;
  return String(template).replaceAll('{player}', name).replaceAll('{amount}', amount);
}

export function getAllParentEmails() {
  return getParents().map(p => p.email).filter(Boolean);
}

// NOTE: commas in the "to" portion of a mailto: URI must stay LITERAL for
// multi-recipient support — do not encodeURIComponent the address list,
// only the subject/body. Encoding the comma breaks multi-recipient parsing
// in most clients.
// NOTE: use encodeURIComponent, not URLSearchParams, for subject/body —
// URLSearchParams encodes spaces as "+" (application/x-www-form-urlencoded),
// but mailto: URIs use plain percent-encoding (RFC 6068), where "+" is a
// literal character. Mail clients render it literally instead of a space.
export function mailtoLink(emails, subject, body) {
  const to = Array.isArray(emails) ? emails.join(',') : emails;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// iOS wants `&` before body, Android/most others want `?` — this covers both.
export function smsLink(phone, body) {
  const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}

// Returns true/false rather than throwing — caller shows its own fallback UI.
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
