# Parent App — Specification

**Status:** draft spec, pre-implementation.
**Companion to:** `Football/DESIGN.md` (the admin app's source of truth).
**Scope:** a new read-only **Parent App**, plus the **changes to the admin
(Football) app** needed to feed it.

If code and this document ever disagree once built, the code wins — but fix
this document in the same change.

---

## 1. What we're building & why

The admin app (`Football/`) is a single-admin PWA: one team parent/coach runs
the whole team from their phone, all data in `localStorage`, no backend. Parents
today receive information only as ad-hoc SMS/email digests.

We want each **parent** to have a small companion app on their own phone that
shows a **read-only** view of:

- the team schedule (games + practices),
- **their own child's outstanding balance**,
- which dates **they** have snack duty,
- fundraiser progress.

The admin generates a **per-parent link** and sends it to that parent over the
channels the admin app already uses (SMS/email). The parent taps it; the Parent
App opens and imports the data. No backend, no login, no accounts.

### 1.1 Core design decisions (already settled)

| # | Decision | Rationale |
|---|---|---|
| **D-1** | **Per-parent scope**, not team-wide. Each bundle contains exactly one family's data. | Makes the privacy boundary the payload itself: no other family's contacts or balances are ever present to leak. |
| **D-2** | **Tappable link**, not QR. | Reuses the admin's existing SMS/email delivery; no camera, no vendored QR lib; no scan-size budget, so the full schedule fits in one self-contained link. |
| **D-3** | **Payload rides in the URL `#hash` fragment.** | The fragment is never sent to the GitHub Pages host, so PII (name, balance) stays out of server logs. |
| **D-4** | **Balance is allowed** in a per-parent bundle. | A parent seeing *their own* child's balance is the goal, not a leak. Requires amending invariant I-9 (see §3.4). |
| **D-5** | Parent App is a **separate PWA** (`Parent/`), read-only, no mutation code. | Different origin-scope, different install, no risk of a parent editing team data. |

### 1.2 Non-goals

- No two-way sync. Data flows admin → parent only.
- No live/automatic updates. Each refresh is a new link the admin sends.
- No parent accounts, auth, or backend.
- No editing of any kind in the Parent App.

---

## 2. The bundle — the data contract between the two apps

This JSON object is the **only interface** between the apps. Both sides must
agree on it exactly.

### 2.1 Shape

```jsonc
{
  "bundleVersion": 1,          // Parent-App payload format. Independent of the
                               // admin's SCHEMA_VERSION. Bump on any shape change.
  "schemaVersion": 3,          // admin store schema the bundle was built from,
                               // so the Parent App can refuse a too-new bundle.
  "generatedAt": "2026-07-17T15:00:00.000Z",

  "team":   { "name": "Wildcats", "season": "Fall 2026" },
  "parent": { "name": "Jenah Carson" },

  "children": [                // this parent's players only (via playerParents)
    {
      "firstName": "Sam", "lastName": "Carson",
      "jerseyNumber": "12", "position": "WR",
      "balanceCents": 4500     // THIS child's balance only — integer cents (I-4)
    }
  ],

  "schedule": [                // team-wide, non-canceled, sorted by date/time
    {
      "date": "2026-09-05", "type": "game",
      "startTime": "10:00", "endTime": "11:30",
      "opponent": "Hawks", "location": "City Field",
      "status": "scheduled", "score": null,
      "isMySnackDuty": false   // snack duty flattened onto the event for THIS parent
    }
  ],

  "fundraisers": [             // team-wide progress, shareable
    {
      "name": "Fall Raffle", "kind": "general",
      "raisedCents": 82000, "goalCents": 150000,
      "start": "2026-09-01", "end": "2026-10-01"
    }
  ]
}
```

### 2.2 What is deliberately **absent**

- `parents[]` / other families' `phone` / `email`.
- `playerParents[]` (the join graph). Snack duty is denormalized to the
  `isMySnackDuty` boolean instead — reveals nothing about who else has duty.
- Any other player's data.
- Private `notes` fields.
- The admin's mutation-oriented `meta` block (`changesSinceBackup`, etc.).

### 2.3 Field notes

- **Money is integer cents** everywhere (mirrors admin invariant I-4). The
  Parent App converts to dollars only at display.
- `score` is a pre-formatted string (`"14–7"`) or `null`; only present for
  completed games.
- `opponent` / `location` are already FK-resolved to display strings by the
  admin during export, so the Parent App needs no opponent table and can't hit
  a missing-FK case (mirrors admin invariant I-7).
- A family may have **more than one child** on the team; `children` is an array.
  The Parent App shows a per-child balance (and, if >1, a summed total).

---

## 3. Changes to the admin app (`Football/`)

### 3.1 New: `exportParentBundle(parentId)` in `js/data.js`

A pure read from `getData()` that assembles the §2 object for one parent. Lives
in `data.js` alongside `exportBackup()` because it reads the store (invariant
I-1: only `data.js` touches storage; this only *reads*, and stays here for
consistency).

Responsibilities:

1. Resolve the parent's children via `playerParents`.
2. Collect that parent's `snackAssignments` into a set of event IDs.
3. Build the schedule from non-canceled `events`, sorted by date then start
   time (reuse the ordering already in `export.js` / `messaging.js`), resolving
   `opponentId` → name and flagging `isMySnackDuty`.
4. Summarize fundraisers (name, kind, raised/goal cents, span from occurrences).
5. Stamp `bundleVersion`, `schemaVersion` (from the store), `generatedAt`.

It **must not** include any field listed in §2.2. Throws on an unknown
`parentId`.

### 3.2 New: `bundleToHashUrl(bundle, baseUrl)` transport helper

Serialize → compress → base64url → append as `#b=…`.

- Compress with the built-in **`CompressionStream('deflate-raw')`** — no
  third-party origin, honoring invariant **I-2** (zero third-party origins at
  runtime).
- Encode as **base64url** (`+`→`-`, `/`→`_`, strip `=`) so it's URL-safe in the
  fragment.
- `baseUrl` is the deployed Parent App URL (relative-safe per I-5); the payload
  goes in the `#hash` (D-3).

No QR library is added.

### 3.3 New UI: "Send family link" in the Parents view (`js/views/parents.js`)

Per parent row/detail, a button that:

1. Calls `exportParentBundle(parent.id)` → `bundleToHashUrl(...)`.
2. Opens the composer via the **existing** `messaging.js` builders:
   `smsLink(parent.phone, "Your <team> info: <url>")` or
   `mailtoLink(parent.email, subject, body)`.

Reuses the app's established SMS/email pattern (the admin already texts parents,
including balances via the overdue-fee templates in `messaging.js`), so this
introduces no new delivery mechanism or new class of data exposure.

Include the app's standard private-info caution in the button's helper copy,
consistent with the backup warning in `settings.js`.

### 3.4 Invariant amendment (`DESIGN.md` §2)

Invariant **I-9** currently reads: *"`Player.outstandingBalanceCents` appears in
**no** export format."* This blocks D-4. Change it to:

> **I-9** `Player.outstandingBalanceCents` appears in **no team-wide export**
> (schedule .xlsx/.pdf, digests). It may appear in a **per-parent bundle**, and
> then **only for that parent's own child(ren)**. The team-wide schedule
> exports in `export.js` still must never include it.

This amendment ships **in the same change** as `exportParentBundle`, and the
export function is the enforcement point.

### 3.5 No schema bump required

The bundle is a **derived, outbound** format; it does not change the stored
shape, so `SCHEMA_VERSION` and `migrate()` are untouched. The bundle carries its
own `bundleVersion` (§4).

---

## 4. Versioning & compatibility

- **`bundleVersion`** (starts at `1`) versions the Parent-App payload format.
  Bump it on any shape change to §2. The Parent App refuses a bundle whose
  `bundleVersion` is greater than it understands (forward-safe, never guesses).
- **`schemaVersion`** is copied from the admin store so a future Parent App can
  reason about provenance and refuse a too-new bundle — the same guard
  `importBackup()` already applies (`data.js`, "newer version" branch).
- The two apps ship independently; a parent may hold an older Parent App than
  the admin's exporter. `bundleVersion` is what keeps that safe.

---

## 5. The Parent App (`Parent/`) — new PWA

### 5.1 Purpose & shape

A stripped, **read-only** sibling of the admin app. Same vanilla-ES-module,
no-build, no-framework, offline-first approach. It imports one per-parent bundle
and renders it. It has **no** add/update/delete code.

### 5.2 File layout

Mirrors `Football/` but much smaller:

```
/Parent/
  index.html                 shell: header, mount point, bootstrap
  manifest.webmanifest       PWA manifest (relative start_url/scope/icons)
  sw.js                      precache shell + offline
  css/styles.css             styling (can share tokens with admin, copied in)
  icons/                     its own icon set (distinct from admin)
  js/
    store.js                 THE ONLY file that touches localStorage
    import.js                hash → decode → validate → store
    util.js                  escapeHtml, cents↔dollars (copied from admin)
    router.js                hash routing + mount/unmount
    views/
      schedule.js            team schedule, with "your snack duty" flagged
      balance.js             this family's balance(s)
      fundraisers.js         fundraiser progress
```

### 5.3 Storage

- Key e.g. `stm-parent:v1`, separate from the admin's `stm:v1`.
- Stores the **last imported bundle** verbatim (plus an import timestamp).
- **Invariant (inherited I-1):** only `store.js` touches `localStorage`.

### 5.4 Import flow (`js/import.js`)

On load (and whenever the app is opened via a link):

1. Read `location.hash`; if it starts with `#b=`, take the payload.
2. base64url-decode → **`DecompressionStream('deflate-raw')`** → JSON.parse.
3. **Validate** before storing (mirror `isValidStore` in `data.js`):
   - is an object; has numeric `bundleVersion` ≤ supported max;
   - has `team`, `children[]`, `schedule[]`, `fundraisers[]`.
   - On `bundleVersion` too new → refuse with a clear "update this app" message,
     leave any existing store untouched (mirrors `importBackup`'s refusal).
4. On success, replace the stored bundle and **clear the hash** from the URL
   (`history.replaceState`) so the PII isn't left sitting in the address bar or
   history.
5. If there's no hash but a stored bundle exists, render that (offline reopen).
6. If neither, show an empty "ask your team admin for your link" state.

### 5.5 Rendering & security

- **Invariant (inherited I-3):** every bundle-derived string interpolated into
  `innerHTML` — including inside `href`/`mailto:`/`sms:` — passes through
  `escapeHtml()`. **The imported bundle is untrusted input.**
- **Invariant (inherited I-2):** zero third-party origins at runtime. No CDN,
  fonts, analytics. Nothing is fetched; everything arrives in the link.
- **Invariant (inherited I-5):** all paths relative (`./…`) — imports,
  manifest, SW cache list — so it survives the Pages subpath and the
  `/Parent/` nesting.
- **Invariant (inherited I-10):** the SW `SHELL_FILES` list matches reality and
  `CACHE_NAME` bumps whenever a cached file changes.

### 5.6 Views (read-only)

- **Schedule:** all events, date-ordered; each row shows type/opponent/time/
  location/status/score; rows where `isMySnackDuty` is true get a clear "🍎 Your
  snack duty" marker.
- **Balance:** per child, `balanceCents` → dollars; a summed total if the family
  has more than one child; a friendly "You're all paid up" state at zero.
- **Fundraisers:** name, kind, raised-of-goal with a progress bar, date span.
- A small **"updated <generatedAt>"** stamp so parents know how fresh the data
  is, plus copy explaining they'll get a new link when things change.

### 5.7 PWA / manifest

- Own `manifest.webmanifest` with distinct `name` ("Team — Family View" or
  similar), `short_name`, and **its own icon set** so it's visually distinct
  from the admin app on a home screen.
- `display: standalone`, relative `start_url`/`scope` (I-5).

---

## 6. Delivery UX & the iOS caveat

- **Happy path (Android / desktop):** admin taps "Send family link" → SMS/email
  composer opens pre-filled → parent taps link → Parent App opens and imports →
  parent optionally installs it to the home screen.
- **iOS caveat (must be handled in copy):** on iPhone, tapping a link opens
  **Safari**, whose storage is *separate* from a home-screen-installed PWA —
  the same split the admin app already documents (`settings.js`, "the Home
  Screen app and the Safari tab are separate"). Guidance for parents:
  1. **Tap the link first**, then Share → **Add to Home Screen** — this carries
     the just-imported data into the installed app.
  2. For later updates, tap the new link in Safari; the Parent App should show a
     "you're viewing this in the browser — reinstall/update your home-screen app
     to sync it" hint when it detects it's not running standalone.
- **Re-sends:** every update is just a fresh link. Importing overwrites the
  stored bundle.

---

## 7. Privacy & security summary

- **Scope is the boundary (D-1):** a bundle physically cannot leak another
  family because their data was never put in it.
- **Fragment keeps PII off the host (D-3):** `#hash` payloads aren't sent to
  GitHub Pages. Data does traverse the SMS/email carrier — identical to the
  admin app's existing fee-notice texts, so no new exposure class.
- **Hash is cleared after import (§5.4)** so the payload doesn't linger in the
  address bar / browser history.
- **Untrusted-input hardening (§5.5)** carries over the admin's I-3 XSS
  discipline to the Parent App's import path.
- **No accounts, no backend, no third-party origins** — the property that makes
  the whole system cheap and private is preserved end to end.

---

## 8. Open decisions

1. **Multi-child balance display:** per-child rows plus a summed total (assumed
   in §5.6) — confirm this matches how you think about a family that owes on two
   kids.
2. **Contact channel default:** does "Send family link" default to SMS
   (`parent.phone`) or email (`parent.email`), and what's the fallback when the
   preferred field is empty?
3. **Schedule breadth:** whole season vs. a rolling window (e.g. next 60 days)
   in the bundle — affects link length, though tappable links have generous
   headroom so whole-season is the default assumption.
4. **Parent App naming/branding & icon set** (distinct from the admin app).

---

## 9. Build order & rough effort

1. **Admin: `exportParentBundle` + I-9 amendment** — ~0.5 day. Enforcement
   point for the privacy scope.
2. **Admin: `bundleToHashUrl` + "Send family link" button** — ~0.5 day. Wires
   into existing `messaging.js`.
3. **Parent App scaffold** (`index.html`, `store.js`, `import.js`, router, PWA
   shell, SW) — ~1 day.
4. **Parent App views** (schedule, balance, fundraisers) — ~1 day.
5. **iOS install/update copy + empty/error states** — ~0.5 day.

**Total ≈ 3–3.5 days**, no new infrastructure, no ongoing cost.
