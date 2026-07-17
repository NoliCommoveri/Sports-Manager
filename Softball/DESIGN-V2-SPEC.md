# Softball League Manager — v2 Design & Overhaul Spec

**Status:** draft spec, pre-implementation. Nothing here is built yet.
**Companions:** `../Football/DESIGN.md` (the single-team admin app we're borrowing
from) and `../PARENT-APP-SPEC.md` (the hashed-link companion pattern we're
generalizing).
**Scope:** a full re-architecture of the Softball app from one `index.html` into a
modular, offline-first PWA, plus the new feature set (contacts, communications,
role-scoped coach/parent links, fundraisers, richer export) that the overhaul
unlocks.

If code and this document ever disagree once built, the code wins — but fix this
document in the same change so the next instance isn't misled.

---

## 0. TL;DR — what this overhaul is

Today's Softball app is a solid **league scheduler**: divisions → teams → players,
games/practices with scores, reusable fields, a win/loss record engine, CSV
reports, JSON backup. It's one 2,815-line `index.html` with a `LeagueManager`
class over `localStorage`.

It has **no contact information anywhere** (a coach is a bare name string; a player
has no guardian), and therefore no way to *communicate* — which is where all the
value of the Football app lives. This spec proposes:

1. **Split the monolith** into vanilla ES modules mirroring `Football/`'s proven
   layout, with the same hard invariants (one storage module, escaping, cents
   money, schema migrations, offline SW).
2. **Add a contacts layer** — coaches and guardians with email/phone — the missing
   foundation everything else needs.
3. **Add league-scoped communications** — the Football composer, re-targeted so a
   broadcast can address the whole league, a division, one team, or one team's
   families.
4. **Generalize the hashed-link companion app** into a **role-scoped** bundle:
   one read-only PWA that renders a **coach view** or a **parent view** depending
   on the link.
5. **Borrow the rest of the durability/UX kit** — PWA install, xlsx/pdf export,
   backup nudge, first-run wizard — adapted to a league.

The central design tension throughout is **league scope vs. single-team scope**:
Football assumes one team; Softball has many. Every borrowed feature gets a
scoping dimension it didn't have before.

---

## 1. Current schema (v1) — documented as-built

Reverse-engineered from `Softball/index.html`'s `LeagueManager` class. This is the
baseline `migrate()` must upgrade from.

**Storage key:** `leagueData` (a single JSON object). **No version field.**
**IDs are auto-increment integers** (`nextTeamId`, etc.), not UUIDs.

```jsonc
{
  "teams": [
    { "id": 1,
      "name": "Red Sox",
      "coach": "Jane Smith",          // NAME STRING ONLY — no contact info
      "ageDivision": "U12",           // free text; also mirrored into divisions[]
      "color": "Red",
      "rosterLimit": 12,
      "practiceLocation": "Central Park" }
  ],
  "players": [
    { "id": 1,
      "firstName": "Sam", "lastName": "Jones",
      "birthYear": 2014,
      "age": 12,                      // DERIVED (currentYear - birthYear), stored
      "teamId": 1 }                   // null = unassigned; no guardian link
  ],
  "events": [
    { "id": 1,
      "type": "game" | "practice",
      "date": "2026-09-05",           // "YYYY-MM-DD"
      "startTime": "10:00", "endTime": "11:30",
      "teamId": 1,
      "opponentType": "league" | "external",
      "opponentTeamId": 2,            // when opponentType === "league"
      "opponentName": "Hawks",        // when opponentType === "external"
      "field": "Field A",             // string (from fields[] or custom)
      "status": "scheduled" | "completed" | "cancelled",
      "teamScore": 5, "opponentScore": 3 }
  ],
  "fields":    [ { "id": 1, "name": "Central Park - Field A" } ],
  "divisions": [ { "id": 1, "name": "U12" } ]
}
```

**Known v1 characteristics (some become v2 problems to fix):**

- **No contact data at all.** `team.coach` is a name; players have no parent.
- **No escaping.** `renderTeams`, `viewTeamDetail`, the calendar, etc. interpolate
  `team.coach`, player names, and custom field names straight into `innerHTML`.
  The JSON/CSV **import path is untrusted** → this is a latent XSS, exactly the
  bug class Football hardened against (its invariant I-3).
- **No money.** No balances/fees anywhere.
- **`age` is stored, not derived on read** — it silently goes stale each January.
- **Money-free, so no cents discipline** — but any fee feature must adopt it.
- **No schema version, no `migrate()`.** The first shape change risks corrupting
  existing saved leagues on import.
- **Integer auto-increment IDs.** Fine within one device, but they collide the
  moment two data sources merge (e.g. a coach's bundle merged back). v2 moves to
  string UUIDs.
- **No PWA** (no manifest, SW, or icons) — not installable, not offline.
- Opponent can be a **league team** (FK) or an **external** free-text name — a nice
  league-aware touch Football lacks; keep it.

---

## 2. Principles borrowed from Football (the invariants)

These are the load-bearing rules the overhaul adopts wholesale. Numbered to match
`Football/DESIGN.md` §2 where they carry over directly.

| # | Invariant (adapted for a league) |
|---|---|
| **I-1** | `localStorage` is touched **only** inside `js/data.js`. No view/helper reads or writes it directly. |
| **I-2** | **Zero third-party origins at runtime.** No CDN/fonts/analytics. Vendored libs (xlsx, jsPDF) load from `./js/vendor/` only. Compression uses the built-in `CompressionStream`. |
| **I-3** | **Every record-derived string interpolated into `innerHTML` passes through `escapeHtml()`** — including inside `href`/`mailto:`/`sms:` attributes. The import path (backup files **and** coach/parent bundles) is untrusted. *(New to Softball — closes the current XSS gap.)* |
| **I-4** | **Money is integer cents** in storage and memory. Convert at the display/input boundary only, via `util.js`. *(New — needed the moment fees exist.)* |
| **I-5** | **All paths relative (`./…`)** — imports, manifest `start_url`/`scope`/icons, SW cache list — so the app survives the GitHub Pages subpath and `/Softball/` nesting. |
| **I-6** | **Every view honors the mount contract:** `mount(container)` subscribes and returns an unmount that unsubscribes. |
| **I-7** | **Missing foreign keys never throw.** A deleted team/opponent/guardian renders as a placeholder (`(deleted)`, `TBD`, `(unassigned)`). |
| **I-8** | **All load paths route through `migrate()`**, and `SCHEMA_VERSION` matches what `migrate()` produces from every older version — **including the un-versioned v1 store** (see §6). Any stored-shape change bumps `SCHEMA_VERSION` and adds a `migrate()` branch. |
| **I-9** | **A player's `outstandingBalanceCents` never appears in a league-wide or team-wide export/broadcast.** It may appear in a **per-family parent bundle** (that family's own child only) and in a **coach bundle** (that coach's own team only, since running the team is the coach's job). Never division- or league-wide. |
| **I-10** | The SW `SHELL_FILES` list matches reality and `CACHE_NAME` bumps on every cached-file change. Because all sports share one `github.io` origin, Softball uses **distinct storage keys and a distinct `CACHE_NAME` prefix** from Football (see §7.3). |

---

## 3. The scoping model (league vs. team) — read this first

Football is **single-team**: "the team" is implicit, every parent belongs to it,
one weekly digest covers everyone. Softball is a **league**, so every borrowed
feature gains a *scope selector*. The scopes, from widest to narrowest:

```
League  ─┬─ Division (e.g. "U12")
         │      └─ Team (e.g. "Red Sox")  ─┬─ Player ── Guardian(s)
         │                                 └─ Coach(es)
         └─ (league-wide announcements, league-wide fundraisers)
```

Consequences that recur throughout the spec:

- **Communications** target a scope: whole league, one division, one team, "all
  coaches", or "one team's families".
- **The companion link** is scoped: a **coach** link carries one team; a **parent**
  link carries one child's team + that child's private data.
- **Standings/records** exist at division and league level (Softball already
  computes cross-team records — a real advantage over Football).
- **Fundraisers** can be **league-wide** or **team-scoped** (`teamId` nullable).
- **Announcements** can be **league-wide** or **team-scoped**.

---

## 4. Target architecture & file layout

Mirror `Football/`, nested one level down for per-sport isolation and to match the
companion-app nesting the Football spec established.

```
/Softball/
  index.html                 admin shell: header nav, mount points, module bootstrap
  manifest.webmanifest       PWA manifest (relative start_url/scope/icons)
  sw.js                      service worker: precache shell + offline
  DESIGN.md                  post-build source of truth (this spec graduates into it)
  css/
    styles.css               all styling (keep v1's warm-green theme tokens)
  icons/                     full PWA icon set 16→512 + maskable  (NEW — none today)
  js/
    data.js                  THE ONLY file that touches localStorage; migrate() lives here
    util.js                  escapeHtml, cents↔dollars, uuid
    selectors.js             pure derived reads: records, standings, next event, staleness, balances
    event-types.js           event-type registry (game/practice/registration/tournament…)
    router.js                hash routing + mount/unmount lifecycle
    seed.js                  first-run defaults
    messaging.js             mailto/sms builders + league/team digest text
    league-link.js           bundle → compressed #hash URL  (generalized parent-link.js)
    export.js                date-range .xlsx / .pdf export
    nudge.js                 backup-reminder banner
    hygiene.js               stale-items banner
    wizard.js / wizard-content.js   first-run tour
    vendor/
      xlsx.full.min.js       SheetJS, pinned, vendored
      jspdf.umd.min.js       jsPDF, pinned, vendored
    views/
      dashboard.js           league "this week" landing (default route)
      players.js             league players; filter by team/division/assignment
      teams.js               teams; roster, record, coach contact
      schedule.js            games+practices; week / calendar / list views (KEEP v1's — they're good)
      fields.js              reusable fields
      contacts.js            coaches + guardians directory  (NEW)
      communications.js      league-scoped broadcast composer  (NEW)
      fundraisers.js         league/team fundraisers  (NEW, from Football)
      standings.js           division/league standings  (formalize v1's record engine)
      reports.js             xlsx/pdf/CSV export
      settings.js            league info, backup/restore, links, help, danger zone

/Softball/Companion/         read-only role-scoped PWA  (NEW — see §8)
  index.html  manifest.webmanifest  sw.js  css/  icons/
  js/
    store.js                 THE ONLY companion file that touches localStorage
    import.js                #hash → decode → validate → store
    util.js                  escapeHtml, cents↔dollars (copied from admin)
    router.js
    views/
      coach/  parent/        role-specific view sets (see §8.4)
```

**Architecture in one paragraph** (unchanged from Football's proven model): the
shell loads the two vendored libs as classic scripts, then a module bootstrap that
seeds, inits the router + banners + wizard, and registers the SW. All state lives
in one in-memory object mirroring the single `localStorage` entry. Views never keep
their own copy — they read through `data.js` getters, mutate through `data.js`
helpers, and re-render when `data.js` notifies subscribers. One-way loop:
read → mutate helper → `saveData` → notify → re-render.

---

## 5. Recommended v2 schema

**Storage key:** `sm-softball:v1` (namespaced away from Football's `stm:v1` on the
shared origin — see §7.3). **`SCHEMA_VERSION`: `1`** (first *versioned* Softball
store; `migrate()` treats the un-versioned legacy `leagueData` blob as "v0").

### 5.0 Universal record rules

- Every record has a string **`id`** from `uuid()` (`crypto.randomUUID()` +
  Math.random fallback for `file://`). *(Migration maps old integer IDs → UUIDs and
  rewrites every FK; see §6.)*
- Every record has an **`updatedAt`** ISO string, stamped only by `data.js`
  mutation helpers.
- **Dates are `"YYYY-MM-DD"`, times `"HH:MM"`** strings, compared lexicographically.
- **Money fields end in `Cents`, integers.**

### 5.1 Root object

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "lastModifiedAt": "ISO | null",
    "lastBackupAt":   "ISO | null",
    "changesSinceBackup": 0
  },
  "settings": {
    "leagueName":  "",             // free text, e.g. "Springfield Youth Softball"
    "season":      "",             // free text, e.g. "Spring 2026"
    "hasSeenWizard": false,
    "leagueAnnouncement": ""       // league-wide, shown on every companion app; "" hides
  },

  "divisions":   [ /* Division */ ],
  "teams":       [ /* Team */ ],
  "players":     [ /* Player */ ],
  "coaches":     [ /* Coach */ ],
  "guardians":   [ /* Guardian */ ],
  "guardianLinks":[ /* GuardianLink (player↔guardian join) */ ],
  "events":      [ /* Event */ ],
  "fields":      [ /* Field */ ],

  "snackAssignments":      [ /* SnackAssignment */ ],
  "fundraiserPlatforms":   [ /* FundraiserPlatform */ ],
  "fundraisers":           [ /* Fundraiser */ ],
  "fundraiserOccurrences": [ /* FundraiserOccurrence */ ]
}
```

### 5.2 Entities

**Division**
```jsonc
{ "id","name","updatedAt" }        // was {id:int,name}; gains id/updatedAt
```

**Team**
```jsonc
{ "id","name",
  "divisionId": "Division.id | null",   // was ageDivision:string — now an FK (backfilled)
  "color": "",
  "rosterLimit": 12,
  "practiceLocation": "",
  "teamAnnouncement": "",               // team-scoped note; shows on this team's companion apps
  "updatedAt" }
// NOTE: `coach` string is GONE — replaced by Coach records linked via coach.teamIds.
```

**Coach**  *(NEW — the contact the whole comms/coach-link story depends on)*
```jsonc
{ "id","name",
  "email": "",                          // may be ""
  "phone": "",                          // may be ""
  "role":  "head" | "assistant" | "manager",   // free-text tolerated
  "teamIds": [ "Team.id", ... ],        // a coach can help >1 team
  "updatedAt" }
```

**Player**
```jsonc
{ "id","firstName","lastName",
  "birthYear": 2014,                    // KEEP; age is derived on read, never stored
  "teamId": "Team.id | null",           // null = unassigned
  "jerseyNumber": "",                   // string (allows "" and legacy values)
  "outstandingBalanceCents": 0,         // int cents; export rules per I-9
  "updatedAt" }
// `age` field DROPPED from storage — selectors.playerAge(birthYear) computes it live.
```

**Guardian**  *(NEW — a parent/guardian with contact info)*
```jsonc
{ "id","name","email":"","phone":"","updatedAt" }
```

**GuardianLink**  *(NEW — many-to-many player↔guardian, mirrors Football's playerParents)*
```jsonc
{ "id","playerId","guardianId","relationship":"","updatedAt" }
```

**Event**  *(games / practices / registrations / tournaments share one collection,
discriminated by `type` via `event-types.js`)*
```jsonc
{ "id",
  "type": "game" | "practice" | "registration" | "tournament",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM", "endTime": "" | "HH:MM",
  "teamId": "Team.id",
  "opponentType": "league" | "external" | null,   // games only
  "opponentTeamId": "Team.id | null",              // when league
  "opponentName": "",                              // when external
  "fieldId": "Field.id | null",                    // was `field` string — now FK (custom still allowed via location)
  "location": "",                                  // free-text fallback / non-field venues
  "status": "scheduled" | "completed" | "cancelled",
  "finalScoreUs": null | number,                   // renamed from teamScore for clarity; integer runs
  "finalScoreOpponent": null | number,             // renamed from opponentScore
  "notes": "",                                     // private; never leaves in a bundle
  "updatedAt" }
```
> Field-naming note: v1 used `teamScore`/`opponentScore` and a `field` string.
> v2 renames scores to `finalScoreUs`/`finalScoreOpponent` (matches Football, so
> `selectors`/`export`/`messaging` port cleanly) and promotes `field` to a `fieldId`
> FK with a `location` free-text fallback. `migrate()` handles both renames.

**Field**
```jsonc
{ "id","name","updatedAt" }
```

**SnackAssignment**  *(NEW — per-game snack/volunteer duty; league version is per-team)*
```jsonc
{ "id","eventId","guardianId","notes":"","updatedAt" }
```

**FundraiserPlatform / Fundraiser / FundraiserOccurrence**  *(NEW — from Football,
plus a nullable `teamId` for team-scoped vs. league-wide fundraisers)*
```jsonc
// Platform
{ "id","name","url":"","updatedAt" }
// Fundraiser
{ "id",
  "teamId": "Team.id | null",           // null = league-wide fundraiser
  "kind": "uniforms" | "equipment" | "tournament_travel" | "general" | "<custom>",
  "name": "",
  "platformId": "FundraiserPlatform.id | null",
  "goalAmountCents": 0, "raisedAmountCents": 0,
  "status": "planned" | "active" | "completed" | "canceled",
  "notes": "", "updatedAt" }
// Occurrence
{ "id","fundraiserId","startDate","endDate","location":"","notes":"","updatedAt" }
```

### 5.3 Referential integrity — delete strategies (owned by `data.js`)

| Delete | Strategy |
|---|---|
| `deleteDivision` | **nullify** `team.divisionId` on teams in it (keep the teams); remove division |
| `deleteTeam` | **nullify** `player.teamId` (players become unassigned); **remove** `coach.teamIds` entry; **nullify** `event.teamId`/`opponentTeamId` or cascade its events (decision §10); remove team |
| `deletePlayer` | **cascade** `guardianLinks`; **drop** the player's snack assignments; remove player |
| `deleteCoach` | remove coach (no dependents) |
| `deleteGuardian` | **cascade** `guardianLinks`; **drop** the guardian's `snackAssignments`; remove guardian |
| `deleteEvent` | **cascade** its `snackAssignments`; remove event |
| `deleteField` | **nullify** `event.fieldId` (keep the game, fall back to `location`); remove field |
| `deleteFundraiser` | **cascade** its `fundraiserOccurrences`; remove fundraiser |
| `deletePlatform` | **nullify** `fundraiser.platformId`; remove platform |

Anything *nullified* must render tolerantly at every read site (I-7).

---

## 6. Migration v1 → v2 (the un-versioned blob problem)

The legacy store is under a **different key** (`leagueData`) with **no version
field** and **integer IDs**. The v2 boot sequence:

1. On first load, `data.js` looks for `sm-softball:v1`. If absent, it looks for the
   **legacy `leagueData`** key.
2. If legacy data is found, run a **one-time import migration**:
   - Treat it as **"v0"**. Build a fresh v2 store.
   - **Re-key every record to a UUID**, building an `oldIntId → newUuid` map per
     entity, then rewrite all FKs (`player.teamId`, `event.teamId`,
     `event.opponentTeamId`, `team.ageDivision → divisionId`, `event.field →
     fieldId`) through the map.
   - **`team.coach` (string) → a `Coach` record** with that `name`, empty
     email/phone, `teamIds:[team.id]`. (No contact info existed to preserve, but
     the name carries over so nothing is lost.)
   - **`ageDivision` string → `divisionId`** by matching/creating in `divisions[]`.
   - **Drop stored `age`** (computed live thereafter).
   - **Rename** `teamScore`/`opponentScore` → `finalScoreUs`/`finalScoreOpponent`;
     `field` string → `fieldId` (match `fields[]` by name, else keep as `location`).
   - Default all new fields (`outstandingBalanceCents:0`, `jerseyNumber:""`,
     announcements `""`, empty `coaches`-beyond-migrated / `guardians` /
     `guardianLinks` / `snackAssignments` / fundraiser collections).
   - Stamp `schemaVersion:1`, fresh `meta`.
   - **Write to `sm-softball:v1`.** Leave `leagueData` in place (don't destroy the
     user's old data on first run) but stop reading it once v2 exists.
3. Thereafter `migrate(data)` follows Football's pattern: defend missing containers,
   then `if (schemaVersion < N)` branches for each future bump. `importBackup()`
   refuses a backup whose `schemaVersion > SCHEMA_VERSION`, validates shape before
   touching the live store, and routes through `migrate()`.

**Validation before store** (`isValidStore`, mirrors Football): a corrupt/truncated
backup or a `[null]` array leaves existing data untouched with a clear error.

---

## 7. Cross-cutting: security, money, dates, PWA

### 7.1 Escaping (I-3) — the current gap, closed
`util.js` `escapeHtml(s)` escapes `& < > " '`. Every record-derived value in an
`innerHTML` template is wrapped — including attribute values and both import paths
(backup **and** companion bundles). This is net-new to Softball and should land in
the very first module split, since the monolith already has the latent XSS.

### 7.2 Money (I-4) & dates
Cents storage + `centsToDollarsStr`/`dollarsToCents` at the boundary. Date fields
are `"YYYY-MM-DD"` strings; never `new Date('2026-09-05')` (UTC trap — v1 already
learned this and ships `parseLocalDate`; formalize it as `selectors.todayStr()` /
`addDaysStr()` and `new Date(d + 'T00:00')` for rendering). Ranges inclusive.

### 7.3 PWA & the shared-origin trap
Add a full `manifest.webmanifest` (relative `start_url`/`scope`/icons), a `sw.js`
(cache-first shell, network-first navigations), and an icon set — none exist today.
**Because every sport's app shares the `…github.io` origin:**
- Softball's storage key is `sm-softball:v1` (never `stm:v1`).
- Softball's `CACHE_NAME` uses its own prefix, e.g. `sm-shell-v1` (never
  `stm-shell-*`), or the two apps' SW `activate` handlers evict each other's cache.
- Same rule for the companion app (§8.5).

### 7.4 Backup durability
Port `nudge.js` (`backupNudgeDue()`: edits since last backup **and** (>3 days **or**
>25 changes)) and the Settings backup/restore + "keeping your data safe" help copy.
`localStorage` is a cache, not a database — this is first-class, not polish.

---

## 8. The role-scoped companion app (coach + parent links)

This is the direct answer to *"can we adapt the parent hashed-link to a coach and a
parent link/view too?"* — **yes.** The Football transport is reused verbatim; we add
a **`role`** discriminator to the bundle and render different views per role.

### 8.1 What's identical to Football (reused, not reinvented)
- **Transport:** `exportBundle(...)` → JSON → `CompressionStream('deflate-raw')` →
  base64url → `#b=…` fragment (`league-link.js`, generalized from `parent-link.js`).
  Payload never hits the host (D-3); no QR lib; no backend; no accounts (D-2, D-5).
- **Companion PWA shell:** read-only, no mutation code, own SW/manifest/icons, hash
  → decode → **validate** → store → clear hash (`history.replaceState`) → render.
- **Security:** inherited I-2/I-3/I-5/I-10. The imported bundle is untrusted input.
- **iOS caveat copy:** tap link in Safari → Add to Home Screen carries the imported
  data in; later updates are fresh links. Same guidance the Football spec details.

### 8.2 What's new: the `role` discriminator
```jsonc
{
  "bundleVersion": 1,
  "schemaVersion": 1,
  "generatedAt": "ISO",
  "role": "coach" | "parent",     // ← the switch that selects the view set & scope
  "league": { "name": "Springfield Youth Softball", "season": "Spring 2026" },
  "leagueAnnouncement": "",       // league-wide, admin-authored
  ...role-specific block (§8.3)...
}
```
The companion validates `role` is one of the known values and renders the matching
view set; an unknown/too-new `bundleVersion` is refused with an "update your app"
message, existing store untouched.

### 8.3 The two bundle shapes

**Parent bundle** — scoped to ONE child's team (generalizes Football's per-parent
bundle; the league twist is that the schedule is the child's **team**'s, not the
whole league's):
```jsonc
{ "role": "parent",
  "team": { "name": "Red Sox", "division": "U12" },
  "guardian": { "name": "Jenah Carson" },
  "teamAnnouncement": "",
  "record": { "wins": 4, "losses": 2, "ties": 0 },
  "standings": [ /* this team's division table, names + W-L only */ ],
  "children": [
    { "firstName": "Sam", "lastName": "Carson", "jerseyNumber": "12",
      "balanceCents": 4500 } ],           // THIS family's child(ren) only (I-9)
  "schedule": [                            // this team's non-canceled events, flattened
    { "date","type","startTime","endTime","opponent","location","status","score",
      "isMySnackDuty": false } ],
  "fundraisers": [ /* team + league-wide, name/kind/raised/goal/span */ ]
}
```

**Coach bundle** — scoped to ONE team, but *richer*: a coach runs the team, so they
get the **full roster and every family's contacts** for their team (this is not a
leak — it's the coach's job), plus balances for their own team (I-9 permits own-team):
```jsonc
{ "role": "coach",
  "team": { "name": "Red Sox", "division": "U12", "practiceLocation": "Central Park" },
  "coach": { "name": "Jane Smith" },
  "teamAnnouncement": "",
  "record": { "wins": 4, "losses": 2, "ties": 0 },
  "standings": [ /* this team's division table */ ],
  "roster": [                              // FULL team roster + contacts (coach scope)
    { "firstName","lastName","jerseyNumber","balanceCents",
      "guardians": [ { "name","phone","email" } ] } ],
  "schedule": [                            // full team schedule + who has snack duty
    { "date","type","startTime","endTime","opponent","location","status","score",
      "snackGuardian": "name | null" } ],
  "fundraisers": [ /* team + league-wide */ ]
}
```

**Scope boundary is the payload (D-1):** a parent bundle physically cannot contain
another family; a coach bundle physically cannot contain another team. No division-
or league-wide balances ever leave (I-9).

### 8.4 Companion views per role
- **Parent role:** Home (record, next game/practice, registration banner, league +
  team announcements), Schedule (with "🥎 your snack duty"), Balance (own child[ren],
  summed total, "all paid up" zero-state), Fundraisers, Standings.
- **Coach role:** Home (record, next events, announcements), Roster (players +
  tap-to-call/email each guardian, balances), Schedule (+ snack assignments),
  Standings, Fundraisers. The roster contact links reuse `mailto:`/`sms:` builders.

The in-UI title is dynamic per bundle: `"{team.name} — Coach"` / `"{team.name}
Parent App"`. Manifest identity stays static (`SoftballCompanion`).

### 8.5 Admin side — generating the links
- `exportCoachBundle(coachId, teamId)` and `exportParentBundle(guardianId, playerId
  /* or teamId */)` in `data.js` — pure reads that assemble §8.3, enforcing the I-9
  scope at the build site (the enforcement point).
- **"Send link" buttons** in the Contacts/Teams views, wired to the existing
  `messaging.js` `smsLink`/`mailtoLink` builders (default SMS → phone, fall back to
  email; disabled with a tooltip when neither exists). Rendered as a real `<a href>`
  the admin taps (the post-`await` iOS user-activation gotcha the Football spec
  documents).
- Companion storage key `sm-softball-companion:v1`, own `CACHE_NAME` prefix (§7.3).

### 8.6 Honest limitation: links are read-only
A coach would *love* to edit their roster or post scores from their phone. The
hashed-link mechanism is **one-way (admin → recipient)** and has no backend, so v2
coach access is **read-only**, same as parent. True two-way coach editing needs
either a backend (the deferred Firebase/Supabase swap Football notes) or a
"coach generates a return-link bundle the admin imports and merges" flow — the
latter is feasible with the same transport but is a **v3** consideration (it forces
the UUID IDs in §5.0 to matter for conflict-free merges — which is partly *why* v2
adopts UUIDs now). Flag this expectation explicitly in the coach link's copy.

---

## 9. Communications (league-scoped composer)

Port `communications.js` + `messaging.js`, re-targeted for a league. The composer
gains a **scope selector** (League / Division / Team / All Coaches / One Team's
Families) above the existing tab set:

- **Weekly Schedule** — digest of a **team's** upcoming games/practices (a league-
  wide weekly digest is noisy; default the weekly tab to a chosen team, with an
  option to send per-team). Type toggles as in Football.
- **Registration** — league- or division-wide registration notice.
- **News** — blank broadcast at the chosen scope.
- **Fundraisers** — progress at the chosen scope (team or league-wide fundraisers).
- **Overdue Fees** — per-family, own-child balance only (I-9), same private
  per-family link pattern; scoped to a team's families.
- **Contacts table** below the composer lists coaches and/or guardians for the
  chosen scope, each with Email/Text using the active draft.

Recipient resolution: `getEmailsForScope(scope)` / `getPhonesForScope(scope)` gather
from `coaches` and/or `guardians` in the selected division/team. `mailtoLink` keeps
the literal-comma multi-recipient rule and `%20` encoding (load-bearing — don't
"simplify"). `smsLink` keeps the iOS `&`-vs-`?` detection.

---

## 10. Open decisions (need a human call before build)

1. **Coach identity model.** `Coach` as its own entity with `teamIds[]` (chosen
   above) vs. a generic `Person` with roles. Recommendation: keep `Coach` and
   `Guardian` separate and simple; revisit only if a person is frequently both.
2. **`deleteTeam` and its events.** Nullify `event.teamId` (orphan games, keep
   history) vs. cascade-delete the team's events. Recommendation: **cascade** —
   a game with no team is meaningless in a league; standings recompute cleanly.
3. **Weekly digest default scope.** Per-team (recommended) vs. an opt-in league-wide
   mega-digest. Recommendation: per-team default, since families care about their
   own team.
4. **One companion app or two.** One PWA switching on `bundle.role` (recommended —
   less duplication, one install story) vs. separate Coach and Parent apps (matches
   Football's admin/parent split more literally). Recommendation: **one** companion
   app, role-driven.
5. **Coach write-back (v3).** Whether to invest in the return-link merge flow later.
   Recommendation: defer, but adopt UUIDs now (§5.0) so it stays possible.
6. **Guardian de-dup across siblings.** One guardian ↔ many players via
   `guardianLinks` (chosen) — confirm the UI supports linking an existing guardian
   to a second child rather than re-entering them.

---

## 11. Build order & rough phasing

Each phase is shippable on its own; later phases depend on earlier ones.

1. **Split the monolith + adopt invariants** — extract `data.js` (with `migrate()`
   from the legacy blob), `util.js` (escapeHtml/cents/uuid), `selectors.js`,
   `router.js`, and the existing views into modules; wire the subscribe/render loop.
   Net behavior unchanged, but escaping (I-3) and versioning (I-8) land here. Also
   add the PWA shell (manifest/SW/icons). **Biggest, highest-value step.**
2. **Contacts layer** — `Coach`/`Guardian`/`GuardianLink` entities + the Contacts
   view + migrate `team.coach` → a `Coach`. Foundation for everything below.
3. **Player fees** — `outstandingBalanceCents` + balance UI + "mark paid", cents
   discipline. (Enables fee notices and balances in bundles.)
4. **Communications** — league-scoped composer + `messaging.js`.
5. **Companion app** — the role-scoped read-only PWA (parent role first, then coach
   role) + admin "Send link" buttons.
6. **Fundraisers + Snacks** — league/team fundraisers, per-team snack duty.
7. **Richer export + standings view** — xlsx/pdf, formalized division/league
   standings, backup nudge, first-run wizard.

---

## 12. What Softball already does better than Football (keep, don't regress)

The overhaul borrows heavily *from* Football, but Softball has genuinely better
pieces to preserve — and these could flow back the other way:

- **Multi-view schedule:** week / calendar / list toggle. Football only has a flat
  upcoming/past split.
- **Cross-team standings engine:** `getTeamRecord` already handles both sides of a
  league game and computes win%. Formalize it into a division/league standings view.
- **Divisions & reusable fields** as first-class entities.
- **League opponent model:** a game's opponent can be a league team (FK) or an
  external name — keep this; it's more capable than Football's single-opponent list.

---

*End of spec. This document graduates into `Softball/DESIGN.md` (the code's source
of truth) as each phase lands — keep it in lockstep with the code once building
starts.*
