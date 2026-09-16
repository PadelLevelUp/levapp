---
id: settings.role-scope
status: implemented
depends_on: [auth.login, settings.profile, settings.language, levels.coach-levels, evaluations.categories, calendar.seasons, import.analyze, clubs.coach-invitation]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.role-scope


### Intent
The Settings screen is shared by both roles, but most of what it contains is coach configuration.
Until PAD-103 the web `/settings` route was only `ProtectedRoute` (any authenticated user) and the
page rendered every section unconditionally, so a student who reached `/settings` — the avatar
dropdown links there for everyone, and the URL is directly navigable — saw and could operate the
coach's seasons (épocas), skill levels (níveis), evaluation scoring categories, notification engine,
data import and club/coach-invitation panels.

The UI leak was the visible half. The authorization half was that the coach-only endpoints behind
those panels derived the acting coach with `current_coach()`, which returns `None` for a student and
was then dereferenced — so a student caller got a 500 (an unhandled `AttributeError`) rather than a
403. `require_coach()` already existed from PAD-92 but had only been applied to the `delete/*` routes.

Scope: which Settings sections each role sees, and the server-side role check on the endpoints behind
them. Cross-coach ownership (coach A vs coach B) is already covered by PAD-92 and unchanged here.

### Rules
1. Settings is reachable by **both** roles. A student is never bounced off `/settings`; they get a
   reduced page, not a 404. (Removing student access entirely would contradict `settings.profile`
   and `settings.language`, which are per-user, not per-coach.)
2. Student-visible Settings sections are exactly: **Profile**, **Preferences** (language + theme
   only), **Notifications preferences** (PAD-112 — the student's own class-invitation block
   toggles and reason, see notifications.student-block-preferences), **My connections** and
   **Account** (delete account, legal links). Note this is a *different* section from the
   coach-only **Notifications** engine configuration of rule 3: they must carry distinct section
   ids so that hiding the coach one can never hide the student one.
   **(PAD-287) My connections** (section id `connections`, both roles, placed just before
   Account) is where a person's links to other people live, and nothing about it is new
   behaviour — it regroups what used to sit under Account (owner decision 2026-09-11: the
   2026-09-06 connections model stands; no pending friend requests, no player↔player links):
   - a student sees their pending **claim requests** (`players.claim` rule 4) and the
     **"Connect with a coach"** entry (`players.join-token` rule 8: username, link or QR);
   - a coach sees **"Add students by link or QR"**, which opens the Players page's existing
     invite dialog (`players.join-token` rule 7) — a way in, not a second copy of it;
   - both see **Blocked users** (`messaging.block-and-report` rule 10).
   Account keeps only account deletion and the legal links. On web the avatar menu also offers
   "My connections" directly (`/settings?tab=connections`); on iOS the initials open Settings,
   where the section is in the list.
3. Coach-only Settings sections are: **Calendar** (seasons), **Notifications** (notification engine),
   **Tutorials** (interactive walkthroughs, see `settings.tutorials`), **Import** (data import +
   history), **Club** (club details + coach invitations), and — inside Preferences — **skill
   levels** and **evaluation categories**. A coach also sees the shared **My connections** and
   **Account** sections of rule 2.
4. The section list is defined **once per shell** and drives both that shell's nav and the pane
   it renders, so the two can never disagree about what a role may see. Each entry states its
   audience explicitly — `everyone` / `coach` / `student`, one total field rather than independent
   `coachOnly` / `studentOnly` booleans, which would make "visible to nobody" representable and
   leave "everyone" true only by convention. Web: `SETTINGS_TABS` in `SettingsPage.tsx` (PAD-142).
   iOS: `SETTINGS_SECTIONS` in `apps/mobile/src/features/settings/settings-sections.ts` (PAD-169,
   pinned by `settings-sections.test.ts`).
5. If the active section is not permitted for the caller's role, the page falls back to a permitted
   section rather than rendering a coach-only panel.
6. Hiding a section in the UI is never the authorization boundary. Every endpoint behind a coach-only
   section must derive the acting coach from the JWT via `require_coach()` and reject a caller with
   no coach profile with **403**, before any query, write or file read happens.
7. A student caller on a coach-only endpoint gets **403**, never a 500 and never a silent success.
   A 500 is treated as a failure of this rule, not as "access denied by accident".
8. Endpoints that are genuinely per-user (`GET`/`PATCH /api/auth/me`, account deletion) stay open to
   both roles and must not be swept up by the coach check.
9. Student-facing endpoints that branch on role (`/calendar`, `/dashboard`, `/class_instance`,
   `/lesson_instance/<id>/presences`, `/calendar_event`, `/availability_blockers`) keep their
   existing `current_coach() is None` student branch — they are not coach-only and must not be
   hardened with `require_coach()`.

### Acceptance Criteria

#### Student sees only student-relevant sections
- **Given** an authenticated student on `/settings` (web) or the Settings tab (iOS)
- **When** the page renders
- **Then** the section list offers only Profile, Preferences, Notifications preferences and Account
- **And** no Calendar/Seasons, notification-engine, Import or Club section is offered
- **And** the Preferences panel shows language and theme but no skill-levels and no
  evaluation-categories management

#### Coach does not see the student's own notification preferences
- **Given** an authenticated coach on Settings, on either shell
- **When** the section list renders
- **Then** no "My notifications" section is offered — a coach never receives a class-vacancy
  invitation, so the controls could not affect their account (PAD-142 on web, PAD-169 on iOS)

#### Coach still sees every section
- **Given** an authenticated coach on `/settings`
- **When** the page renders
- **Then** Profile, Preferences, Calendar, Notifications, Tutorials, Import, Club and Account are all offered
- **And** the Preferences panel still shows skill levels and evaluation categories

#### Coach-only reads reject a student with 403
- **Given** an authenticated student
- **When** they call `GET /api/app/coach_levels`, `GET /api/app/seasons`,
  `GET /api/app/evaluation_categories`, `GET /api/app/coach`, `GET /api/app/import/history`,
  or `GET /api/app/club/<id>/coach-invitations`
- **Then** each response status is exactly 403
- **And** no 500 is produced

#### Coach-only writes reject a student with 403 and write nothing
- **Given** an authenticated student
- **When** they call `POST /api/app/add_coach_level`, `POST /api/app/add_seasons`,
  `POST /api/app/delete/season`, `POST /api/app/add_evaluation_categories`,
  `POST /api/app/import/analyze`, `POST /api/app/import/confirm`,
  `POST /api/app/import/confirm/stream`, `POST /api/app/import/<id>/revert`,
  `POST /api/app/club/<id>/coach-invitations`, or `POST /api/app/coach-invitations/<token>/revoke`
- **Then** each response status is exactly 403
- **And** the targeted coach's rows are unchanged

#### The notification engine already fails closed
- **Given** an authenticated student
- **When** they call any `/api/app/notify/*` endpoint
- **Then** the response status is 403 (pre-existing behaviour, pinned by test)

#### Coach access is unaffected
- **Given** an authenticated coach
- **When** they call the same coach-only endpoints for their own data
- **Then** each responds 2xx exactly as before

#### Per-user settings stay open to students
- **Given** an authenticated student
- **When** they `GET /api/auth/me` and `PATCH /api/auth/me` with `{"language": "en"}`
- **Then** both succeed and the preference is persisted

### Notes
- **[DEC 2026-09-04, PAD-171 §1]** Settings stays off the bottom tab bar / bottom nav on both
  platforms — it is reached from the account avatar in the header, as iOS already does
  (`AccountAvatar` in `apps/mobile/app/(tabs)/_layout.tsx`). Web wires the avatar entry point in
  PAD-183; iOS's tab-bar count dropped from seven to six in PAD-193, which moved the screen out
  of the tab group to `apps/mobile/app/settings.tsx` (same `/settings` route, now pushed onto the
  root stack) and made `AccountAvatar` the control that opens it. This
  is a navigation-entry-point decision, not a change to this spec's role-scoped section list —
  see `.cortex/atlas/decisions/2026-09-04-ios-tab-bar-and-theme.md` for the full record, since no
  dev spec governs the main app's tab bar/sidebar structure itself.
- **[2026-09-10 batch, PAD-104 × PAD-183]** The coach's "Class requests" inbox (PAD-104) is kept off
  the web mobile bottom bar, by the same filter that drops Settings, because PAD-183 budgets that bar
  at 390px and the extra item overflowed it in Portuguese (428px). It stays in the desktop sidebar
  and the mobile drawer; iOS reaches it from Settings (`settings-sections.ts`).
- **[DEC 2026-09-04, PAD-171 §2, DIV]** iOS stays light-only — an intentional divergence from
  web's dark mode (rule 2/64's "language and theme" toggle still applies to web; on iOS the theme
  preference has no visible effect). Revisit only on user demand. See the same atlas decision file.
- Source: ticket PAD-103 (reported by `tomasmpacheco` via Discord).
- The ticket mentions a "time format" preference as an example of a student-relevant option; no such
  setting exists in the app today, so nothing was added for it.
- The mobile Settings screen (`apps/mobile/app/(tabs)/settings.tsx`) already gated its coach
  sections on `user.roles.includes("coach")`; only the web shell leaked at PAD-103 time.
- **[PAD-169]** iOS had the coach-only half of rule 3 but none of the student-only half of rule 2:
  `myNotifications` simply did not exist in `settings-sections.ts`, so a student could be opted out
  of class-vacancy invitations with no way to change it from the phone. PAD-169 ported the panel
  and widened mobile's gating from a `COACH_ONLY_SECTIONS` list to the `audience` field of rule 4.
- Follow-ups found while auditing, NOT fixed here (each is outside the Settings surface):
  `POST /api/app/class_instance/training/confirm` carries no coach/ownership check at all, and the
  `exercises`, `exercise-groups`, `players`, `coach_players*` and `player_profile` routes still use
  bare `current_coach()` and so 500 rather than 403 for a student caller.
