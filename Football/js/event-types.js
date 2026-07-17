// event-types.js — the single registry of event types.
//
// Games and practices share one `events` collection discriminated by `type`
// (see DESIGN §5.2). This module is the one place that knows what type values
// exist and how they present, so the Schedule dropdowns, the Team dashboard
// labels, and the Communications digests all stay in lockstep. Adding a type
// here is enough for it to appear as a schedulable option and to flow into the
// weekly digest — no other file needs to enumerate the list.
//
// `hasOpponent`/`hasScore` mark the fields a type exposes; only games use them
// today, but keeping the flags on the record avoids scattering `=== 'game'`
// checks as more types arrive.

export const EVENT_TYPES = [
  { value: 'practice',     label: 'Practice',     hasOpponent: false, hasScore: false },
  { value: 'game',         label: 'Game',         hasOpponent: true,  hasScore: true  },
  { value: 'registration', label: 'Registration', hasOpponent: false, hasScore: false }
];

export const EVENT_TYPE_VALUES = EVENT_TYPES.map(t => t.value);

const BY_VALUE = Object.fromEntries(EVENT_TYPES.map(t => [t.value, t]));

// Tolerant of legacy/custom `type` strings not in the registry — falls back to
// the raw value so a hand-edited record never renders blank (cf. I-7).
export function eventTypeLabel(value) {
  return BY_VALUE[value]?.label || value;
}

export function eventTypeMeta(value) {
  return BY_VALUE[value] || null;
}

// Order a set of type values by the registry, then append any unknown values
// (in first-seen order) so custom types still surface, just last.
export function orderEventTypes(values) {
  const present = new Set(values);
  const known = EVENT_TYPE_VALUES.filter(v => present.has(v));
  const extras = [...present].filter(v => !BY_VALUE[v]);
  return [...known, ...extras];
}
