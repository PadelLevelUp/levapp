# Specs — engineering index

**Read this when:** you are about to implement, change, or review behaviour — find the
governing leaf spec and its dependencies before touching code.

**What's here:** developer specs (`*.spec.md`), one leaf per behaviour, grouped by domain
(no capability folders yet). Only leaf specs are implementable. Every leaf `implements:` exactly one persona-journey business spec in `../specs-business/`.

## Domains

- `attendance/` — Presence & Attendance Tracking (6 leaves)
- `auth/` — Authentication & User Management (14 leaves; `auth.account-deletion` added 2026-09-10, PAD-268; `auth.register` rewritten and `auth.coach-approval` added 2026-09-06, PAD-210; `auth.landing-page` and `auth.email-verification` added 2026-09-07; `auth.password-recovery` added 2026-09-09, PAD-139; `auth.parental-consent` added 2026-09-10, PAD-198)
- `auth/` — Authentication & User Management (13 leaves; `auth.account-profiles` added 2026-09-10, PAD-260; `auth.register` rewritten and `auth.coach-approval` added 2026-09-06, PAD-210; `auth.landing-page` and `auth.email-verification` added 2026-09-07; `auth.password-recovery` added 2026-09-09, PAD-139)
- `calendar/` — Calendar View & Blocks (8 leaves; `calendar.mobile-views` added 2026-09-08, phone Dia/Semana/Mês restyle)
- `classes/` — Lessons & Instances (12 leaves; `classes.class-requests` added 2026-09-10, PAD-104; `classes.availability` added 2026-09-17, PAD-357)
- `clubs/` — Club Management (4 leaves)
- `dashboard/` — Dynamic Dashboard (2 leaves)
- `eligibility/` — Who May Join a Class (4 leaves)
- `evaluations/` — Player Evaluation System (13 leaves: 4 implemented, 9 draft; `evaluations.legacy-client-contract`, `.competencies`, `.records`, `.class-panel`, `.history`, `.evolution`, `.sharing`, `.student-view`, `.reminders` drafted 2026-09-21 from the "Sistema de Avaliações" canvas ingest, and the four shipped leaves corrected for drift the same day; sharing, student-view and reminders are owner-pending)
- `import/` — Bulk Data Import (4 leaves)
- `levels/` — Coach-Defined Skill Levels (2 leaves)
- `messaging/` — Real-Time Messaging (9 leaves)
- `mobile/` — Mobile Platform Runtime (3 leaves; `mobile.android-runtime` drafted 2026-09-11, PAD-298 — Android wave B; `mobile.release-build-target` drafted 2026-09-16, PAD-351; `mobile.status-bar` added 2026-09-24, PAD-419)
- `notifications/` — Notification Engine (14 leaves)
- `players/` — Player Management (12 leaves, 1 deprecated)
- `settings/` — User Preferences & Internationalization (7 leaves; `settings.admin-editor` added 2026-09-10, PAD-175/PAD-267; `settings.coach-working-hours` added 2026-09-17, PAD-357; `settings.unsaved-edits` added 2026-09-22, PAD-394)
- `training/` — Exercise Library & Training Planning (6 leaves; `training.tactical-board` drafted 2026-09-08)

## Tooling Manifest
- **Backend**: Flask 2.3 + SQLAlchemy 1.4 + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Auth**: Flask-JWT-Extended (Bearer tokens, 30-day expiry, silent refresh via X-New-Token header)
- **Real-time**: Server-Sent Events (in-memory pub/sub)
- **Push**: Web Push via VAPID keys
- **Scheduler**: APScheduler (BackgroundScheduler)
- **Testing**: pytest (backend), Playwright (E2E), vitest (frontend, minimal)
- **AI**: OpenAI SDK (import analysis)

## Dependency Graph

```
auth ──────────────────────────────────┐
clubs ─────────────────────────────────┤
levels ────────────────────────────────┤
players ──── [auth, clubs, levels] ────┤
classes ──── [clubs, players, levels] ─┤
calendar ─── [classes] ────────────────┤
attendance ─ [classes, players] ────────┤
evaluations ─ [players, levels] ───────┤
messaging ── [auth] ───────────────────┤
notifications [classes, players, messaging, attendance] ─┤
eligibility  [notifications, levels, players, attendance, classes] ─┤
training ─── [classes] ────────────────┤
settings ─── [notifications, calendar] ┤
import ───── [players, classes, levels, evaluations] ────┤
dashboard ── [classes, messaging, notifications, players]┘
```

Registration & connections (decision 2026-09-06): `auth.coach-approval` → `auth.register`;
`clubs.join-request` → `auth.register`, `auth.coach-approval`;
`players.join-token` → `auth.register`; `players.claim` → `players.invite-completion`,
`messaging.conversations`, `attendance.presence`; `messaging.direct-by-username` →
`messaging.block-and-report`. `players.add-existing` is deprecated and out of the build order.

The draft `evaluations` leaves (2026-09-21) reach beyond the domain box above at leaf level: `evaluations.records` → `classes.instances`; `evaluations.class-panel` → `classes.detail-visibility`, `attendance.presence`; `evaluations.history` → `players.notes`; `evaluations.sharing` → `messaging.messages`; `evaluations.student-view` → `dashboard.blocks`; `evaluations.reminders` → `notifications.config`, `attendance.presence`. Nothing outside `evaluations` and `import` depends on an evaluations leaf.

`mobile.android-runtime` depends on `calendar.mobile-views`, `messaging.push-notifications` and
`training.tactical-board` (the screens whose Android behaviour it pins); nothing depends on it.

`eligibility` is consumed by three domains — `notifications` (rounds are capped at the bar),
`calendar` (a student sees open spots they qualify for) and `classes` (join requests). It stores its
rules on `NotificationConfig` and its overrides on `Lesson`/`LessonInstance`.

**The `classes ↔ eligibility` and `notifications ↔ eligibility` edges are bidirectional at domain
level and acyclic at leaf level** — trace impact on the leaves, never on the domain boxes:
- `eligibility.rules` → `notifications.config`; `eligibility.cascade` → `classes.{instances,edit,recurrence}`;
  `eligibility.open-spot-visibility` → `calendar.view`
- `notifications.invitations` → `eligibility.rules`; `notifications.waiting-list` → `eligibility.rules`;
  `classes.join-requests` → `eligibility.{open-spot-visibility,enforcement}`

**Status values:** `implemented` (built and in production), `draft` (specified, not built),
`partial` (some rules built, some not — the spec carries a status-correction block naming which).

## Domains

| Domain | Capabilities | Leaf Specs | Status |
|--------|-------------|------------|--------|
| auth | 5 | 9 | implemented (auth.email-verification draft) |
| clubs | 3 | 4 | implemented |
| players | 3 | 11 (+1 deprecated) | implemented |
| classes | 3 | 11 | implemented (classes.join-requests draft; classes.class-requests implemented) |
| calendar | 2 | 8 | implemented (calendar.student-blockers partial; calendar.mobile-views draft) |
| eligibility | 1 | 4 | draft |
| attendance | 2 | 5 | partial |
| levels | 2 | 4 | implemented |
| evaluations | 2 | 13 | implemented (4 shipped leaves); 9 draft leaves from the 2026-09-21 canvas ingest |
| messaging | 4 | 9 | implemented |
| notifications | 4 | 13 | implemented |
| training | 2 | 6 | implemented |
| import | 1 | 4 | implemented |
| dashboard | 1 | 2 | implemented |
| settings | 2 | 4 | partial (settings.tutorials implemented; settings.language draft) |


## Build Order

Foundations first, then the domains that read them; consumers of eligibility and messaging last.

1. auth, clubs, levels
2. players
3. classes, calendar
4. attendance, evaluations, messaging
5. notifications, eligibility
6. training, import, settings
7. dashboard
