# Football App: Current vs. Recommended Schema

This document compares the data model in the existing `Football/index.html` (a
league-wide manager, duplicated from the Softball app) against a recommended
schema for a **single-team, parent-focused** rebuild: one roster, one season
schedule, snack/fundraiser signups, a simple win-loss record, minimal
opponent info, and downloadable Excel/PDF handouts.

Both today and in the recommendation, storage is a single JSON blob in
`localStorage` (no backend) — the recommendation keeps that architecture,
it just reshapes what's inside the blob.

---

## 1. Current Schema (League Manager)

Storage key: `footballLeagueData`

### `Team`
| Field | Type | Notes |
|---|---|---|
| `id` | number | auto-increment |
| `name` | string | |
| `coach` | string | |
| `ageDivision` | string | free text, backed by `Division` list |
| `color` | string | |
| `rosterLimit` | number | used to compute `spotsRemaining` |
| `practiceLocation` | string | |

One row per team **in the whole league** — the app assumes you're managing
every team, not just your kid's.

### `Player`
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `firstName`, `lastName` | string | |
| `birthYear` | number | age is derived (`currentYear - birthYear`) |
| `teamId` | number\|null | FK → `Team` |
| `isMyPlayer` | boolean | added later; only way to mark "my kid" |

No contact info, no guardian/parent record at all.

### `Event` (game or practice)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `type` | `'game'` \| `'practice'` | |
| `date`, `startTime`, `endTime` | string | |
| `teamId` | number | FK → `Team` |
| `opponentType` | `'league'` \| `'external'` | only relevant to games |
| `opponentTeamId` | number\|null | FK → `Team`, only if opponent is in-league |
| `opponentName` | string\|null | free text, only if opponent is "external" — no persisted record |
| `field` | string | free text or picked from `Field` |
| `status` | `'scheduled'` \| `'completed'` \| `'cancelled'` | |
| `teamScore`, `opponentScore` | number\|null | only when completed |

### `Field`
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `name` | string | reusable location picklist |

### `Division`
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `name` | string | e.g. "U12" — exists purely to group teams |

### Derived values
- `getTeamStats(teamId)` → roster count, spots remaining (needs `rosterLimit`)
- `getTeamRecord(teamId)` → wins/losses/ties/win% computed by scanning all
  `Event` rows where `teamId` or `opponentTeamId` matches — this is the only
  "average"-like stat in the app, and it's team-level, not player-level.

### Why this doesn't fit a parent
- No `Guardian`/contact entity — nothing to hold parent name/phone/email.
- `Team`, `Division`, `Field` are all **collections** built for administering
  many teams; a parent only ever needs one team's worth of this data.
- Opponents are either a full in-league `Team` (overkill) or a name string
  with no persisted record (can't show an opponent's history).
- No snack or fundraiser concept anywhere.
- Exports are CSV/JSON only (`downloadCSV`, `downloadJSON`) — no Excel or
  PDF output, so nothing is really "email-ready."

---

## 2. Recommended Schema (Single-Team Parent Tracker)

Storage key: e.g. `teamTrackerData`. One JSON blob, same as today, but the
top-level shape changes from "many teams" to "my team + its opponents."

### `TeamProfile` (singleton — not a collection)
| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `coach` | string | |
| `ageDivision` | string | plain field, not a managed collection |
| `color` | string | |
| `season` | string | e.g. "Fall 2026" |
| `practiceLocation` | string | |

Only one of these ever exists, so it can be stored as a single object rather
than a `teams[]` array — drop `rosterLimit`/`spotsRemaining` unless you want
to keep a simple cap, which is optional for a parent.

### `Player` (roster of the one team)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `firstName`, `lastName` | string | |
| `birthYear` | number | age still derived |
| `jerseyNumber` | string\|null | new, optional |
| `position` | string\|null | new, optional |
| `guardianIds` | number[] | FK → `Guardian` (1–2 typical) |

Drop `teamId` (only one team exists) and `isMyPlayer` (every player here
*is* on my team — no more filter needed). If you want to flag "which one is
my actual kid" for a nicer dashboard, keep a single `myPlayerId` on
`TeamProfile` instead of a flag repeated per row.

### `Guardian` (new)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `playerId` | number | FK → `Player` |
| `name` | string | |
| `relationship` | string | "Mom", "Dad", "Guardian", etc. |
| `phone` | string\|null | |
| `email` | string\|null | |
| `isPrimaryContact` | boolean | for snack/fundraiser reminders |

This is the entity the current app is entirely missing.

### `Opponent` (replaces `opponentType`/`opponentTeamId`/`opponentName`)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `name` | string | |
| `contactName` | string\|null | optional, e.g. rival coach/manager |
| `contactPhone`, `contactEmail` | string\|null | optional |
| `notes` | string\|null | e.g. "away jersey: white" |

Every game opponent becomes a lightweight `Opponent` row instead of a
throwaway string, so you can see that team's record against you over the
season without having to build out their full roster like today's
`opponentType: 'league'` path requires.

### `Event` (game or practice)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `type` | `'game'` \| `'practice'` | |
| `date`, `startTime`, `endTime` | string | |
| `opponentId` | number\|null | FK → `Opponent`, only for games |
| `location` | string | plain text — drop the `Field` collection unless you want a simple recent-locations dropdown |
| `status` | `'scheduled'` \| `'completed'` \| `'cancelled'` | unchanged |
| `teamScore`, `opponentScore` | number\|null | unchanged |

Drops `teamId` (implicit — there's only one team) and the
`opponentType`/`opponentTeamId`/`opponentName` three-way split, replaced by
a single `opponentId`.

### `SnackSignup` (new)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `eventId` | number | FK → `Event` (typically a game) |
| `assignedGuardianId` | number\|null | FK → `Guardian` |
| `item` | string\|null | e.g. "orange slices + water" |
| `status` | `'needed'` \| `'confirmed'` \| `'reminder-sent'` | |

### `Fundraiser` (new)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `name` | string | e.g. "Spring Car Wash" |
| `description` | string\|null | |
| `startDate`, `endDate` | string | |
| `goalAmount` | number\|null | |
| `amountRaised` | number | |
| `status` | `'planned'` \| `'active'` \| `'complete'` | |

### `FundraiserTask` (new, sub-entity of `Fundraiser`)
| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `fundraiserId` | number | FK → `Fundraiser` |
| `assignedGuardianId` | number\|null | FK → `Guardian` |
| `description` | string | e.g. "Bring folding table" |
| `dueDate` | string\|null | |
| `status` | `'open'` \| `'done'` | |

### Derived values (unchanged concept, simpler scope)
- `getTeamRecord()` → wins/losses/ties/win% over all completed `Event`
  rows of `type: 'game'` — no `teamId` filter needed since there's only one
  team; this stays the season "average" equivalent.
- `getOpponentRecord(opponentId)` → same computation scoped to games
  against one `Opponent`, for a simple head-to-head view.

---

## 3. What's Dropped, Added, and Changed

| Current | Recommended | Why |
|---|---|---|
| `Team[]` (collection) | `TeamProfile` (singleton) | only one team ever exists |
| `Division[]` | plain `ageDivision` string on `TeamProfile` | no need to manage multiple divisions |
| `Field[]` | plain `location` string on `Event` | no need for a reusable-fields admin screen |
| `Player.teamId` | *(removed)* | implicit, only one team |
| `Player.isMyPlayer` | *(removed)*, optional `TeamProfile.myPlayerId` | every player is "on my team"; only need to flag the one that's mine |
| — | `Guardian` (new) | parent name/phone/email, the most-requested missing piece |
| `Event.opponentType` / `opponentTeamId` / `opponentName` | `Event.opponentId` → `Opponent` | one consistent, lightweight opponent record instead of a three-way branch |
| — | `Opponent` (new) | persists the other team's identity + record across the season |
| — | `SnackSignup` (new) | snack scheduling |
| — | `Fundraiser` / `FundraiserTask` (new) | fundraiser scheduling |
| CSV/JSON export only | Excel (.xlsx) + PDF export | see below |

---

## 4. Export Formats

Today: `downloadCSV()` / `downloadJSON()` produce a schedule CSV, a scores
CSV, a players CSV, and a full-data JSON backup — plain text, not something
you'd want to hand a parent as a polished document.

Recommended, still 100% client-side (no backend, matches the current
offline-first approach):

- **Excel (.xlsx)** via a bundled library like SheetJS (`xlsx.js`) — no
  server round-trip, just build a workbook in-browser and trigger a
  download. Good for: season schedule, roster + contact sheet, snack
  sign-up sheet, fundraiser tracker — anything the recipient might want to
  filter/sort themselves.
- **PDF** via a bundled library like `jsPDF` + `jspdf-autotable` (or a
  print-stylesheet + `window.print()` if you want to avoid another
  dependency) — good for: a one-page season schedule or snack calendar
  that's meant to be printed or read as-is, not edited.

Suggested downloadable documents for the new app:
1. Season Schedule (games + practices, with opponent and location)
2. Roster & Emergency Contact Sheet (player + guardian info)
3. Snack Schedule (by game date, assigned guardian, item)
4. Fundraiser Tracker (tasks, owners, due dates, amount raised vs. goal)
5. Standings/Record Summary (team record + head-to-head vs. each opponent)

Each of these is a natural export from one entity or a simple join
(`Event` + `Opponent`, `Player` + `Guardian`, etc.), so they map directly
onto the schema above rather than needing bespoke report logic.
