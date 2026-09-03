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
