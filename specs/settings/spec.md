# settings — User Preferences & Internationalization

## settings.language

---
id: settings.language
status: draft
depends_on: [auth.login, notifications.reminders, notifications.message-templates]
---

### Intent
Provide internationalization (i18n) infrastructure supporting Portuguese (pt) and English (en), with each
coach able to choose their preferred language in Settings. The preference is persisted per user and drives
locale-aware formatting of auto-generated notification and reminder messages (weekday names, dates, times).
This is the root-cause fix for the mixed-language notification bug (PAD-38): manual weekday/date string
building is replaced with locale-aware formatting.

Scope: i18n INFRASTRUCTURE + NOTIFICATIONS/REMINDERS localization was delivered first (PAD-39). App-wide
UI localization (PAD-40) extends the same i18next infrastructure across the rest of the app UI so the
coach's language preference drives the entire interface, not just notifications. UI strings are
externalized into per-area i18next resource files (`src/locales/{pt,en}/*.json`) and rendered via
`react-i18next`'s `t()`; the coach's persisted `language` is applied globally on session restore and
login (not only while the Settings screen is mounted).

### Entities
- **User.language** (`users.language`): the user's preferred UI/notification locale. Enum-like string,
  one of `pt` | `en`. Defaults to `pt`. Extends the existing User entity (see auth.login).

### Rules
1. `users.language` stores the preferred locale (`pt` or `en`); default and fallback locale is `pt`.
2. The coach can read and update their language in Settings via the profile/settings API
   (`GET`/`PATCH` the current user), and the value is persisted on the User row.
3. Frontend i18n uses **i18next / react-i18next**; backend locale-aware date/time/weekday formatting uses
   **Flask-Babel**. Formatting is never manually string-built from English day/month names.
4. Fallback locale is `pt`: any missing translation key or unresolvable locale falls back to Portuguese —
   no broken strings, no raw English tokens, no unresolved placeholders in delivered output.
5. Auto-generated notification and reminder messages are rendered in the **recipient coach's** locale:
   the notification renderer resolves the recipient's `language` and formats weekday, date, time, and
   template strings accordingly.
6. Weekday, date, and time tokens in notification/reminder templates render in the resolved locale
   (e.g. `pt` → "quarta-feira"; `en` → "Wednesday"), using Flask-Babel, not hardcoded name tables.

### Acceptance Criteria

#### Default language is Portuguese
- **Given** a newly created coach with no explicit language set
- **When** their profile is read
- **Then** `language` is `pt`

#### Coach updates language
- **Given** an authenticated coach
- **When** they PATCH their profile/settings with `{"language": "en"}`
- **Then** the response succeeds and `language` is persisted as `en`
- **And** a subsequent profile read returns `language` = `en`

#### Reminder localized to coach locale (PT)
- **Given** a coach whose `language` is `pt` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "quarta-feira" (Portuguese), formatted via Flask-Babel
- **And** no raw English weekday token and no unresolved placeholder remains

#### Reminder localized to coach locale (EN)
- **Given** a coach whose `language` is `en` and a class instance on a Wednesday
- **When** a reminder is generated for that class
- **Then** the weekday renders as "Wednesday" (English), formatted via Flask-Babel

#### Missing translation falls back to PT
- **Given** a locale/key with no available translation
- **When** a message is rendered
- **Then** the Portuguese value is used and the output contains no raw token or unresolved placeholder

#### Coach language drives the whole UI (PAD-40)
- **Given** a coach whose `language` is `en`
- **When** they open any localized app screen (dashboard, calendar, players, settings, messages, training)
- **Then** the interface chrome (navigation, headings, buttons, labels) renders in English
- **And** switching their language to `pt` in Settings re-renders the same chrome in Portuguese without a full reload
- **And** the applied language survives a page reload (it is re-applied from the persisted preference on session restore, not only while Settings is mounted)

### Notes
- Source: ticket PAD-39
- Supersedes the PAD-38 tactical PT-weekday patch: locale-aware formatting is the root-cause fix.
- Follow-up: PAD-40 localizes the rest of the app UI.

---

## settings.profile

---
id: settings.profile
status: implemented
depends_on: [auth.login]
---

### Intent
Let a signed-in coach view and edit their own account profile — display name, abbreviation (the short
initials badge shown next to them across the app), email, and phone — from the Settings screen, and have
those edits actually persisted on the `users` row. Before PAD-81 the Settings "Profile" panel was purely
local component state seeded with hardcoded values: Save fired a success toast without ever calling the
backend, so the toast lied and every edit was lost on reload. The backend's `PATCH /api/auth/me` only
accepted `language`, so there was no way to persist the rest.

Scope: the coach's *own* profile only. Editing other users, avatar upload, bio, and password change are
out of scope (no backend support exists for them).

### Entities
- **User** (`users`) — extends auth.login's User entity:
  - `name` — display name, required, non-empty.
  - `abbreviation` (`users.abbreviation`, new): optional short badge label, max 4 characters, stored
    uppercased. When unset, the abbreviation is **derived** from the first letters of the first two words
    of `name` (existing behaviour of `serialize_user`).
  - `email` — optional, unique across users when set.
  - `phone` — optional free-text.

### Rules
1. `GET /api/auth/me` returns the signed-in user's `name`, `abbreviation`, `email`, and `phone` alongside
   the existing identity fields, so the Settings profile form can be populated from the server rather than
   from hardcoded defaults.
2. `PATCH /api/auth/me` accepts any subset of `name`, `abbreviation`, `email`, `phone` (still alongside
   `language`) and persists them on the `users` row. Fields not present in the payload are left untouched.
3. `name` must be a non-empty string after trimming; a blank or whitespace-only name is rejected with 400.
4. `email` must be syntactically valid when non-empty and must not already belong to another user —
   a duplicate is rejected with 409. An empty string clears the email to `NULL`.
5. `abbreviation` is trimmed, uppercased, and limited to 4 characters; an empty string clears the stored
   value and the response falls back to the derived initials of `name`.
6. `phone` is trimmed; an empty string clears it to `NULL`.
7. The success notification is only shown **after** the API confirms the write. A failed request shows an
   error notification and never a success one — no optimistic success toast.
8. After a successful save, a reload of the Settings screen shows the newly saved values (the form is
   hydrated from `GET /api/auth/me`, not from local defaults).

### Acceptance Criteria

#### Profile is loaded from the server
- **Given** an authenticated coach whose stored name is "E2E Coach"
- **When** they open Settings → Profile
- **Then** the Name field shows their real stored name, not a hardcoded placeholder

#### Coach edits and saves their profile
- **Given** an authenticated coach on Settings → Profile
- **When** they change name, abbreviation, email and phone and click Save
- **Then** the request `PATCH /api/auth/me` succeeds
- **And** a success notification is shown
- **And** after reloading the page the fields still show the newly saved values

#### Save failure does not report success
- **Given** an authenticated coach on Settings → Profile
- **When** the save request fails
- **Then** an error notification is shown
- **And** no success notification is shown

#### Blank name is rejected
- **Given** an authenticated coach
- **When** they PATCH `/api/auth/me` with `{"name": "   "}`
- **Then** the response status is 400
- **And** the stored name is unchanged

#### Duplicate email is rejected
- **Given** two users, where user B already has email `taken@example.com`
- **When** user A PATCHes `/api/auth/me` with `{"email": "taken@example.com"}`
- **Then** the response status is 409
- **And** user A's stored email is unchanged

#### Abbreviation falls back to initials
- **Given** an authenticated coach named "Ana Beatriz Costa" with no stored abbreviation
- **When** their profile is read
- **Then** `abbreviation` is `AB`
- **And** after they save the abbreviation "ABC", a subsequent read returns `ABC`

### Notes
- Source: ticket PAD-81
- The Settings Profile panel was removed from the web UI in the App Store readiness pass (commit
  `804cf5d`) precisely because it was fake; PAD-81 rebuilds it for real rather than leaving the gap.
- Avatar upload, bio, and password change remain unbuilt — they were mocked and stay out of the UI until
  backend support exists (see `found_issues.md` item 1).

---

## settings.role-scope

---
id: settings.role-scope
status: implemented
depends_on: [auth.login, settings.profile, settings.language, levels.coach-levels, evaluations.categories, calendar.seasons, import.data-import, clubs.coach-invitation]
---

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
   toggles and reason, see notifications.student-block-preferences) and **Account** (delete
   account, legal links). Note this is a *different* section from the coach-only **Notifications**
   engine configuration of rule 3: they must carry distinct section ids so that hiding the coach
   one can never hide the student one.
3. Coach-only Settings sections are: **Calendar** (seasons), **Notifications** (notification engine),
   **Import** (data import + history), **Club** (club details + coach invitations), and — inside
   Preferences — **skill levels** and **evaluation categories**.
4. The section list is defined **once** and drives both the desktop sidebar nav and the mobile
   section dropdown, so the two can never disagree about what a role may see.
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
- **Given** an authenticated student on `/settings`
- **When** the page renders
- **Then** the section list offers only Profile, Preferences, Notifications preferences and Account
- **And** no Calendar/Seasons, notification-engine, Import or Club section is offered
- **And** the Preferences panel shows language and theme but no skill-levels and no
  evaluation-categories management

#### Coach still sees every section
- **Given** an authenticated coach on `/settings`
- **When** the page renders
- **Then** Profile, Preferences, Calendar, Notifications, Import, Club and Account are all offered
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
- Source: ticket PAD-103 (reported by `tomasmpacheco` via Discord).
- The ticket mentions a "time format" preference as an example of a student-relevant option; no such
  setting exists in the app today, so nothing was added for it.
- The mobile Settings screen (`apps/mobile/app/settings.tsx`) already gated its coach sections on
  `user.roles.includes("coach")`; only the web shell leaked. Mobile is unchanged.
- Follow-ups found while auditing, NOT fixed here (each is outside the Settings surface):
  `POST /api/app/class_instance/training/confirm` carries no coach/ownership check at all, and the
  `exercises`, `exercise-groups`, `players`, `coach_players*` and `player_profile` routes still use
  bare `current_coach()` and so 500 rather than 403 for a student caller.
