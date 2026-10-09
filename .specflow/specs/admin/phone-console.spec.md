---
id: admin.phone-console
status: draft
depends_on: [admin.foundation, admin.approvals-and-users, admin.clubs-and-switches, admin.engine-health]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-013, R-021, R-024]
---

# admin.phone-console

> Linear: PAD-572. Draft 2026-10-09 (Session E, wave 13). Builds on `admin.foundation` rule 15,
> which this leaf amends: the console stays web-only, and from now on it also works from a phone
> browser.

### Intent
Staff open the console from a phone as often as from a desk: approving a coach from the court,
looking up a user while on the phone with them, flipping a switch during an incident. Today the
console is a fixed 240 px sidebar beside a page that assumes a desktop width, so on a phone the
sidebar eats the screen, tables overflow the page sideways and controls are too small to tap.
Every console page must be usable at 375 px wide and up, from mobile Safari and mobile Chrome,
with nothing lost: the same navigation, the same badges, the same actions.

### Surfaces
- **Web app** `frontend/apps/admin` only. The console has no iOS or Android counterpart
  (`admin.foundation` rule 15, R-024 exception recorded there and in rule 9 below). "Phone" here
  means the phone's browser.
- **Backend** — no change. No new endpoint, no new field.

### Entities
- **READS:** none beyond what each console page already reads.
- **WRITES:** none.

### Rules

1. **Phone width.** Every console route (`/`, `/approvals`, `/users`, `/users/:userId`,
   `/settings`, `/roles`, `/audit`, `/engine-health`, `/clubs`, `/clubs/:clubId`, `/switches`, and
   the sign-in page) renders at a viewport 375 px wide and up with **no horizontal page scroll**:
   `document.documentElement.scrollWidth` never exceeds the viewport width. Pages scroll vertically
   only.
2. **Navigation collapses on a phone.** Below Tailwind's `md` breakpoint (768 px) the sidebar
   (`admin-sidebar`) is not rendered. In its place a top bar (`admin-topbar`) shows the console
   title, the pending-approvals count when non-zero (`admin-nav-approvals-count`) and a menu button
   (`admin-menu-button`). The button opens a drawer (`admin-nav-drawer`) holding, in this order,
   the same nine navigation items as the sidebar (same labels, icons and `to`), the session email
   (`admin-session-email`), the role badge (and the read-only badge for `support`), the language
   picker and sign-out (`admin-sign-out`). Choosing a navigation item navigates and closes the
   drawer; a close control (`admin-menu-close`, 44 px) and tapping the backdrop close it too. At
   `md` and above the sidebar renders exactly as before this leaf and the top bar does not.
3. **Tables fit a phone.** Each data table (users `admin-users-table`, audit log
   `admin-audit-table`, roles `admin-roles-table`, clubs `clubs-table`, approvals, switches, the
   engine-health lists, the club's courts) does one of two things below `md`, chosen per table:
   - **stacked cards** — one card per row, column labels rendered as captions inside the card, the
     row's primary action (open the user, approve/reject, change or revoke a role, open the club,
     delete a court, toggle a switch) visible without scrolling sideways; the row keeps its
     `data-testid` (`admin-user-row-<id>`, `admin-audit-row-<id>`, `admin-role-row-<id>`,
     `club-row-<id>`) so existing tests keep finding it; or
   - **own-scroll container** — the table scrolls horizontally inside a wrapper
     (`data-testid="<table-testid>-scroll"`, `overflow-x: auto`) while the page itself does not
     (rule 1), and the first column (the row's identity: when/who, name, email) stays readable at
     the left edge.
   The users list, approvals and roles use cards (they carry actions); the audit log and the
   engine-health tables may use the own-scroll container (they are read-only, many columns).
4. **Tap targets.** Below `md`, every interactive control the finger reaches — navigation items,
   the menu button, buttons (`Button`), inputs and selects (`Input`, `Select`), row links and
   row actions — has a hit area at least **44 × 44 CSS px** (`min-h-11`/`min-w-11` or padding).
   Desktop sizes (`h-9`) are unchanged at `md` and above.
5. **Dialogs fit.** Any dialog, sheet or confirmation the console renders is no wider than the
   viewport minus 32 px, scrolls internally when taller than the viewport, and its primary and
   cancel actions are reachable without zooming. Native `window.confirm` dialogs (switches off,
   court delete) satisfy this by nature and are allowed to stay.
6. **Sign-in on a phone.** The sign-in card renders inside a 375 px viewport with the Google
   button slot (`admin-google-button`) fully visible, and signing in with Google completes in
   mobile Safari and mobile Chrome. The console uses the rendered Google button only (no One Tap,
   no FedCM requirement), so nothing desktop-only is on the path; the staff account must still be
   a listed test user (`admin.foundation` rule 13) and the origin must be in the Google client's
   authorised origins. Verified by hand on a phone once per release that touches sign-in.
7. **Playwright at phone viewport.** The console gains its own Playwright setup,
   `frontend/apps/admin/playwright.config.ts` and `frontend/apps/admin/e2e/`, modelled on the web
   app's (same isolation variables for the backend database and ports, backend started the same
   way, the console served by Vite on its own port, `E2E_ADMIN_PORT`, default 8090). One project,
   device `iPhone 13` (390 × 844; rule 1 is asserted at 375 × 667 explicitly in the spec). Sign-in
   in E2E does not go through Google: global setup seeds an `admin_roles` row for a staff email
   and mints a console token with the backend's own issuer (the function `/admin/api/auth/google`
   calls after it has verified the Google credential), and the test puts it in `sessionStorage`
   before the first navigation. No test-only auth endpoint is added to the backend. Two specs ship
   with this leaf: `phone-navigation.spec.ts` (rules 1–2) and `phone-users-table.spec.ts` (rules
   1, 3, 4). Names follow R-021; locators follow R-013 (test ids above, roles otherwise). The specs run in CI through `.github/workflows/admin-e2e.yaml` on every PR into `staging` that touches the console or its backend. (the console has no story ids, so names carry the ticket: `PAD-572: …`)
8. **Language.** Every new string (menu, close, column captions where they are not the existing
   column labels) exists in `apps/admin/src/locales/en.json` and `pt.json` with identical key sets
   (`i18n.test.ts` keeps enforcing it).
9. **Web only, by design (R-024 exception).** This leaf changes the console's web app only. There
   is no iOS or Android console and none is planned; phone support means the phone's browser.
   The reason is recorded here and in `admin.foundation` rule 15; the PR body repeats it.
10. **Nothing else changes.** Desktop layout, routes, API calls, page content and existing test
    ids are unchanged at `md` and above; the existing vitest suites (`operations.test.tsx`,
    `clubs-and-switches.test.tsx`, `EngineHealthPage.test.tsx`, …) keep passing without edits
    other than new test ids.

### Acceptance Criteria

#### Every page fits 375 px with no horizontal page scroll (rule 1)
- **Given** a signed-in `operator` session and a viewport of 375 × 667
- **When** each of `/`, `/approvals`, `/users`, `/users/1`, `/settings`, `/roles`, `/audit`,
  `/engine-health`, `/clubs`, `/clubs/1`, `/switches` is opened and settles
- **Then** `document.documentElement.scrollWidth` is 375 on every one of them, `admin-topbar` is
  visible and `admin-sidebar` is not in the DOM

#### The drawer carries everything the sidebar carried (rule 2)
- **Given** a signed-in `operator` session with 2 pending coach approvals, at 375 × 667
- **When** `admin-menu-button` is tapped
- **Then** `admin-nav-drawer` is visible and contains nine navigation links (Home, Approvals with
  the count "2", Users, Settings, Roles, Audit log, Engine health, Clubs, Switches), the session
  email, the "Operator" role badge, the language select and `admin-sign-out`
- **When** the "Users" link is tapped
- **Then** the URL is `/users` and `admin-nav-drawer` is hidden

#### Support sees the read-only badge in the drawer (rule 2)
- **Given** a signed-in `support` session at 375 × 667
- **When** the drawer is opened
- **Then** it shows the "Support" role badge and the read-only badge

#### Desktop is unchanged (rule 2)
- **Given** a signed-in `operator` session at 1280 × 800
- **When** `/users` is opened
- **Then** `admin-sidebar` is visible, and neither `admin-topbar` nor `admin-menu-button` is in
  the DOM

#### Users results are cards with a tappable name (rules 3, 4)
- **Given** 375 × 667, a signed-in `operator`, and users "Ana Silva" (id 11, active, verified) and
  "Ana Costa" (id 12, disabled, unverified) in the database
- **When** "ana" is submitted in `admin-users-search`
- **Then** `admin-user-row-11` and `admin-user-row-12` render as stacked cards showing name,
  username, email with the verified/unverified badge, roles and the status badge, with no
  horizontal page scroll, and the bounding box of `admin-user-link-11` is at least 44 px tall
- **When** `admin-user-link-11` is tapped
- **Then** the URL is `/users/11`

#### The audit log scrolls inside its own container (rule 3)
- **Given** 375 × 667, a signed-in `operator`, and 3 audit rows
- **When** `/audit` is opened
- **Then** `admin-audit-table-scroll` has `scrollWidth` greater than its `clientWidth`,
  `document.documentElement.scrollWidth` is 375, and `admin-audit-row-<id>` is visible for each
  row

#### Approvals keep both actions reachable (rules 3, 4)
- **Given** 375 × 667, a signed-in `operator`, and one pending coach "Rui Pires"
- **When** `/approvals` is opened
- **Then** the approve and reject controls for that coach are visible without horizontal scroll
  and each bounding box is at least 44 × 44 px

#### Tap targets in the drawer and on the users page (rule 4)
- **Given** 375 × 667 and the drawer open on `/users` with results
- **When** every `button`, `a`, `select` and `input` inside `admin-nav-drawer` and the users page
  is measured
- **Then** each bounding box is at least 44 px tall

#### The sign-in card fits a phone (rule 6)
- **Given** no session, at 375 × 667, with `/admin/api/auth/config` answering a client id
- **When** the console is opened
- **Then** `admin-sign-in` is at most 343 px wide, `admin-google-button` is inside the viewport,
  and `document.documentElement.scrollWidth` is 375

#### Google sign-in works on a phone (rule 6, manual)
- **Given** a staff account listed as a Google test user, an iPhone with Safari and with Chrome
- **When** the staff member opens the staging console and taps the Google button in each browser
- **Then** they land on the Home page signed in, in both browsers; the verifier records the date
  and the console build (deployed SHA) in the PR

#### Playwright phone specs exist and pass (rule 7)
- **Given** the admin Playwright config and the two specs named in rule 7
- **When** `npx playwright test` runs in `frontend/apps/admin` with the project `iPhone 13`
- **Then** `phone-navigation.spec.ts` and `phone-users-table.spec.ts` pass, and the sign-in used a
  token minted by the backend issuer, not a Google credential

#### Locales stay in step (rule 8)
- **Given** `apps/admin/src/locales/en.json` and `pt.json`
- **When** `i18n.test.ts` runs
- **Then** both files have the same key set and every new key (`admin.shell.menu`,
  `admin.shell.closeMenu`, any card caption) is present in both

### Notes
- Layout approach: Tailwind responsive classes (`md:` prefixes) on the existing `Shell`, a drawer
  state in `Shell` only (no router change), card/table dual rendering per page with the row
  `data-testid` on the card element. Tailwind's default `md` = 768 px is the only breakpoint.
- The engine-health page and the club detail page have several small tables; the own-scroll
  container is the cheap option there. The users, approvals and roles lists carry actions and
  become cards.
- Native `confirm()` dialogs are kept (rule 5); a later leaf may replace them.
- Why not reuse the product web app's `AppLayout` phone menu: the console must not import from
  `apps/web` (`admin.foundation` rule 14, guard test). The drawer is written in `apps/admin`.
- OPEN: none. The owner's sign-in check on a phone (rule 6) is a manual step at release time.
