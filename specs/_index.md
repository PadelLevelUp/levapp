# LevelUp Spec Tree — Index

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
import ───── [players, classes, levels, evaluations] ────┤
dashboard ── [classes, messaging, notifications, players]┘
```

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
| auth | 4 | 6 | implemented |
| clubs | 2 | 3 | implemented |
| players | 3 | 10 | implemented (players.add-existing draft — never built) |
| classes | 3 | 10 | implemented (classes.join-requests draft) |
| calendar | 2 | 7 | implemented (calendar.student-blockers partial) |
| eligibility | 1 | 4 | draft |
| attendance | 2 | 5 | partial |
| levels | 2 | 4 | implemented |
| evaluations | 2 | 5 | implemented |
| messaging | 3 | 8 | implemented |
| notifications | 4 | 12 | implemented |
| training | 2 | 6 | implemented |
| import | 1 | 4 | implemented |
| dashboard | 1 | 2 | implemented |
| settings | 2 | 2 | draft |
