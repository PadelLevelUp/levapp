# Spec Tree Report — Presences Feature Investigation

Root: `/Users/pedropacheco1/Documents/Projetos/padel_app/levelup/specs` (NOT under git).

## 1. Structure

`specs/_index.md` is the tree's root document. It contains:
- A **Tooling Manifest** (Flask/SQLAlchemy/Postgres backend, React/TS/Vite/Tailwind/shadcn frontend, Flask-JWT-Extended auth, SSE realtime, Web Push/VAPID, APScheduler, pytest/Playwright/vitest testing, OpenAI SDK for import).
- A **Dependency Graph** (ASCII) showing domain-level `depends_on` edges.
- A prose note on the `eligibility` domain being consumed bidirectionally by `notifications`/`calendar`/`classes`, with a rule that impact must be traced at leaf level, not domain level, because those specific edges are cyclic at the domain level but acyclic at the leaf level.
- A **Status values** legend: `implemented` / `draft` / `partial` (partial specs carry an inline status-correction block naming exactly which rules are/aren't built).
- A **Domains table**: domain name, capability count, leaf-spec count, overall status.

Every feature directory (`specs/<domain>/spec.md`, one file per domain — **not** one file per leaf):

| Domain | One-line summary |
|---|---|
| `auth/spec.md` | Login/logout/registration/activation/token-refresh/push-subscription — JWT-based authentication. |
| `clubs/spec.md` | Clubs as the organizational container for lessons/players/coaches; membership; coach-invitation tokens. |
| `players/spec.md` | Player CRUD, invite-completion (self-onboarding via token), duplicate-name check, notes, level history, add-existing-by-username. |
| `classes/spec.md` | Lessons (templates) and their materialized `LessonInstance` occurrences: create/edit/delete, recurrence, enrollment (lesson- and instance-level), coach assignment, role-scoped detail payload, join-requests (draft). |
| `calendar/spec.md` | Unified calendar view (instances + blocks), event/class detail sheet, drag-drop, slot-click creation, seasons, student availability blockers. |
| `eligibility/spec.md` | **(draft, whole domain)** The minimum bar (level/absences) a student must clear to join a class; cascading overrides (coach→lesson→instance); hard-gate for automatic engine actions vs. warn-only for manual coach actions; open-spot visibility on the student calendar. |
| `attendance/spec.md` | Presence tracking per instance (invited/confirmed/status/justification/validated), player confirm/decline/cancel (incl. proactive decline), attendance stats for the notification engine, a student/coach-facing "Attendance" history page, and (draft) its "Absences" counterpart. |
| `levels/spec.md` | Coach-defined skill-level ladders and player level assignment. |
| `evaluations/spec.md` | Custom scoring categories, entries, player-facing view, bulk import. |
| `messaging/spec.md` | Conversations, messages, reactions, read-tracking, SSE realtime, push notifications, conversation detail. |
| `notifications/spec.md` | The notification engine: config, reminders, multi-round invitations, semi-automatic approval (draft), manual sends, standing waiting list (credits), activity log, per-class toggle, manual reminders, invitation groups, message templates, student block preferences. |
| `training/spec.md` | Exercise library, exercise groups, court diagrams, lesson planning, exercise view. |
| `import/spec.md` | Excel upload → AI (OpenAI) column-mapping analysis → preview → confirm → revert. |
| `dashboard/spec.md` | Server-driven block-based dashboard (KPI grid, class list, messages overview, notification activity) with deep-link navigation rules. |
| `settings/spec.md` | **(draft, whole domain)** i18n (pt/en) infrastructure + language switch, profile settings, role-scoped settings visibility. |

### File / spec skeleton convention (verified against multiple files, e.g. `players/spec.md`, `attendance/spec.md`, `eligibility/spec.md`)

One `spec.md` per domain directory. Inside it, each **leaf capability** is a `##`-level section named `<domain>.<capability>`, separated from its neighbors by a trailing `---` horizontal rule. This is a real, working convention that **diverges from the generic template** shipped in the Specflow skills (see §4 below) — the generic template says "one markdown file per leaf spec" with a bullet-list frontmatter; the actual repo does neither.

Representative skeleton, quoted from `specs/attendance/spec.md:1-37`:

```
# attendance — Presence & Attendance Tracking

## attendance.presence

---
id: attendance.presence
status: implemented
depends_on: [classes.instances, players.create]
---

### Intent
Track player attendance for each class instance, including invitation, confirmation, and validation status.

### Entities
- **Presence** (`presences`): lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool)
- Unique constraint: (player_id, lesson_instance_id)

### Rules
1. Presences are auto-created when an instance is materialized (invited=True, confirmed=False)
2. Players confirm attendance via reminders (confirmed=True)
3. Coach marks final attendance: status=present or status=absent
4. Absent players can be marked justified or unjustified
5. `validated=True` means the coach has finalized the attendance record

### Acceptance Criteria

#### Auto-create presences
- **Given** a class with players Alice and Bob
- **When** the instance for April 20 is materialized
- **Then** two Presence records are created with invited=True, confirmed=False, status=null

#### Mark attendance
- **Given** an instance with 4 presences
- **When** coach POSTs to `/api/app/lesson_instance/{id}/confirm_presences` with status for each player
- **Then** each presence.status is updated (present or absent)
- **And** absent players have justification set

---
```

Conventions confirmed across the tree:
- Top-of-file `# <domain> — <Title>` heading, once per file.
- Leaf header `## <domain>.<capability>` (dot-notation ID also duplicated inside the frontmatter `id:` field).
- YAML-ish frontmatter block delimited by `---` immediately under the leaf header: `id`, `status` (`implemented|draft|partial`), `depends_on` (bracketed list of other dot-notation IDs, or omitted/empty for none).
- `### Intent` — 1–3 sentence prose.
- `### Entities` — only present when the leaf **introduces** a new table/column; otherwise omitted and the entity is just referenced by name (e.g. `classes.instance-enrollment` reuses `Association_PlayerLessonInstance` without redefining it). Entities are bullet lists `**Name** (`table`): field, field, field` — no markdown table, unlike the generic skill template.
- `### Rules` — numbered, plain-language, sometimes with sub-numbering (`11a`) when a later ticket amends an earlier rule in place (`dashboard/spec.md:75`, `attendance/spec.md:199-202`).
- `### Frontend rules` — an optional second numbered list (continuing the same numbering) used when a leaf spec has substantial frontend-only rules, e.g. i18n requirements, routes, test-id conventions (`attendance/spec.md:244-263`).
- `### Acceptance Criteria` — one `####`-level sub-heading per named scenario, then Given/When/Then/And bullets in **bold-keyword** style, concrete values.
- `### Notes` — optional, used to cite the source ticket (`- Source: ticket PAD-114.`) and/or flag open assumptions (`classes/spec.md:454-456`).
- Leaf specs end with a trailing `---` before the next leaf header (final leaf in a file has no trailing `---`).
- **Superseding pattern**: when a later ticket changes an earlier spec's meaning, the older spec is edited in place with an inline note citing the ticket, rather than silently rewritten — e.g. `attendance/spec.md:199-202` ("(PAD-141) This spec previously added... That was a statement about what did not exist yet... The surviving constraint is...") and `dashboard/spec.md:75-80` ("This supersedes the previous rule...").

## 2. Attendance / Presence Coverage (detailed)

### `attendance.presence` (implemented) — `specs/attendance/spec.md:3-37`
Core entity and the base "mark attendance" flow.
- Entity **Presence** (`presences` table): `lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool)`; unique on `(player_id, lesson_instance_id)`.
- Rule 1: presences are auto-created on instance materialization (`invited=True, confirmed=False`).
- Rule 2: players confirm via reminders (`confirmed=True`).
- Rule 3: **coach marks final attendance**: `status=present` or `status=absent` — this is the direct precedent for "coach retroactively validates a class and marks each player present/absent."
- Rule 4: absent players can be marked `justified`/`unjustified`.
- Rule 5: `validated=True` means the coach has **finalized** the attendance record — this is the closest existing concept to "retroactive validation," but it is currently just a boolean flag with no dedicated acceptance criteria, no endpoint spec beyond `confirm_presences`, and no rule describing when/how it flips, who can flip it, or what UI exposes it. It is effectively an unspecified/dangling field today.
- AC "Mark attendance" (`:32-36`): `POST /api/app/lesson_instance/{id}/confirm_presences` with per-player status; absentees get justification set. No AC exists for `validated`.

### `attendance.confirm` (implemented) — `specs/attendance/spec.md:40-164`
Player-side confirm/decline/cancel flows, including PAD-73 "proactive decline."
- Player confirms (`yes`) or declines (`no`) via `POST /api/app/notify/respond_reminder`.
- Player can cancel a confirmed attendance **before class start** via `POST /api/app/notify/cancel_attendance` (rule 4); blocked once `now >= instance.start_datetime` (AC `:99-102`, 409).
- **Cancellation deadline** (`cancellationDeadlineHours`, default 24, part of `notifications.config`) distinguishes an on-time cancellation from a **late cancellation** (`Presence.late_cancellation=True`), which is allowed but flagged and triggers a coach notification distinguishing lateness (rules 6–9).
- **Proactive decline** (PAD-73, rules 10–16): a decline made before the reminder would have fired is classified server-side (never client-side) as `proactive: true`; it auto-justifies the absence, frees the vacancy immediately, but respects invitation-timing via `Vacancy.invite_not_before`.
- Authorization: `cancel_attendance` requires the caller to hold the `Association_PlayerLessonInstance` for that instance (rule 14) — 403 otherwise (AC `:153-157`).
- This whole leaf is entirely about **student-initiated, pre-class** state changes. It contains **no** coach-initiated retroactive/post-class rule.

### `attendance.stats` (implemented) — `specs/attendance/spec.md:167-184`
- `_attendance_stats(player_id)` → `(attendance_rate, justified_miss_rate)`.
- `_unjustified_absence_count(player_id, coach_id)`.
- `_has_makeups(player_id, coach_id)` → `True` if justified absences > accepted invitations. **Note**: despite the name, this is not a "make-up class" feature — there is no make-up-class entity or booking flow anywhere in the tree; it's a boolean used only as a notification-engine input signal.
- These feed the notification engine's ranking/tiebreakers and `eligibility.rules`' absence-based bar.

### `attendance.history` (implemented) — `specs/attendance/spec.md:186-313`
Student/coach-facing chart+list of **attended** classes only (PAD-114).
- `GET /api/app/attendance_history` (`playerId?`, `from?`, `to?`, `granularity?`).
- **Attendance predicate**: `Presence.status == "present"` — explicitly the same predicate as `compute_player_kpis().lessons_attended` (rule 2), so the page and the dashboard KPI can never disagree.
- Authorization: self-service for players; coaches need `Association_CoachPlayer` (`require_own_roster_relation`), self-case resolved before coach-case (rule 3).
- Bucketing by day/month/year auto-selected from span, gap-filled contiguous series (rules 4–5), default range = current month (rule 6).
- `sessions[]` list with deep-link `href` = `/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>` (rule 8, per `dashboard.navigation` rule 8).
- Routes: `/attendance` (self) and `/players/:playerId/attendance` (coach view).
- Explicitly states (rule/Intent, `:195-202`) the page shows **attendance only**, never present-vs-absent on one surface — the counterpart page (`attendance.absences`) exists for the missed side.

### `attendance.absences` (**draft**) — `specs/attendance/spec.md:314-413`
Mirror of `attendance.history` for **missed** classes (PAD-141).
- `GET /api/app/absence_history`, predicate `Presence.status == "absent"` (rule 2), matches `compute_player_kpis().lessons_missed`.
- Rule 3: **both justified and unjustified absences count toward the total**; justification is shown per-row but never filters the set — this is the one existing spec that treats "justified" as a *display* attribute, not a filter, which is relevant precedent if a new Presences feature wants to expose justification differently.
- Reuses `attendance.history`'s chart/range/list components; own `absences-*` test ids.
- Routes: `/absences` and `/players/:playerId/absences`.
- Supersedes `dashboard.navigation`'s old "Missed KPI stays inert" rule — now links to `/absences`.

### Related coverage outside `attendance/spec.md`

- **`classes.instances`** (`classes/spec.md:104-184`) — Instances are lazily materialized (never pre-created); materialization creates the `LessonInstance` row + Presences (`invited=True, confirmed=False`) + scheduler jobs, is idempotent, and has an elaborate containment spec for a best-effort waiting-list sync side-effect (SAVEPOINT rollback semantics, dead-session recovery). Status transitions on `LessonInstance.status`: `scheduled → completed`, `scheduled → canceled`, `scheduled → rescheduled` (rule 4) — there is a manual status-update AC (`POST /api/app/lesson_instance/10/status {"status":"completed"}`, `:160-163`), separate from the Presence-level `confirm_presences` flow. **These are two independent state machines today**: instance-level `status` and per-player `Presence.status`. Nothing in the tree specifies that marking attendance also transitions the instance to `completed`, or vice versa.
- **`calendar.view`** (`calendar/spec.md:1-70`) — `LessonInstance.effective_filled_spots` = enrolled minus `status=="absent"` presences, floored at 0 (rule 8), is the **single source of truth** for capacity everywhere (calendar card, class-detail "capacity" field, invitation-engine capacity checks — rule 9). Also defines `status: completed|scheduled` on the calendar **event** as purely a function of `now` vs. `end_datetime` (rule 11) — computed, not stored/settable — distinct from the `LessonInstance.status` enum in `classes.instances`.
- **`calendar.event-detail`** (`calendar/spec.md:223-278`) — `ClassDetailSheet` exposes "Mark attendance" as one of its actions (rule 4, `:238`) alongside Edit/Delete/Notify/Training planning; "capacity" field = effective filled spots (rule 5); invited-list de-duplication rules (per-student, tie-broken `confirmed > expired > sent > queued`). **No rule here elaborates what "Mark attendance" actually does** beyond naming the button — the behavioral spec lives entirely in `attendance.presence`'s `confirm_presences` AC.
- **`classes.detail-visibility`** (`classes/spec.md:269-322`, PAD-36) — role-scoping of the class-instance detail payload: coach sees everyone's presences/participants/invitations; a student sees only their own presence row and their own entry in `participants`. Directly relevant: any new Presences UI/endpoint must respect this same student-vs-coach payload split.
- **`classes.join-requests`** (draft, `classes/spec.md:325-456`) — student-initiated join flow; on accept, enrolls "through the same path the invitation engine uses," consumes a `StandingWaitingListEntry` credit if one exists (rule 8, flagged as the one open-question rule). Confirms: **credits** in this codebase = pre-paid waiting-list slots (`notifications.waiting-list`), not an attendance/make-up-class concept.
- **`eligibility.rules`** (draft, `eligibility/spec.md:1-113`) — v1 eligibility parameters are `level` and `unjustified_absences|justified_absences|attendance_rate` (rule 3), computed "the student's record with this coach, exactly as `notifications.invitations` already computes them" — i.e. it consumes `attendance.stats`' numbers as an eligibility bar input. This is the domain that will most directly consume any new Presence writes.
- **`eligibility.enforcement`** rule 8 (`eligibility/spec.md:237-238`): *"Eligibility governs joining, never staying. No retroactive evaluation, no auto-removal, no expiry of existing enrolments."* — **note on terminology**: "retroactive" here means "eligibility changes are never applied backward to already-enrolled students," which is a different sense of "retroactive" than "a coach retroactively validating a past class's attendance." Worth flagging so the new feature's naming/spec language doesn't collide with this existing usage (see §6).
- **`dashboard.blocks`** (`dashboard/spec.md:3-38`) — `kpi_grid` block includes "attendance rate" as one of 4 KPI items (rule 3); the KPI values are `compute_player_kpis().lessons_attended` / `lessons_missed`, which both `attendance.history` and `attendance.absences` are contractually pinned to match.
- **No spec anywhere** covers: make-up classes/credits tied to attendance, class cancellation as a *coach-initiated bulk-attendance* action (cancellation exists only in `classes.delete`, which is about deleting the occurrence, not marking a completed class's attendance), or a statistics/reporting surface beyond the two per-student history pages and the dashboard KPI grid.

## 3. Domain Vocabulary (canonical terms, with definitions)

| Term used | NOT used | Where defined |
|---|---|---|
| **Presence** (entity/table `presences`) | "Attendance record" as an entity name | `attendance/spec.md:15` — the row-level record per player per instance |
| **attendance** (domain name, feature name "Attendance history") | "presence" as a page/feature name | Domain dir `attendance/`; page routes `/attendance`, `attendance.history` |
| **player** (entity/table `players`, `Player`) | "student" is used, but only informally/UI-facing | Both terms appear throughout, but **`player`/`Player` is the canonical entity/model name** (`players/spec.md`, `Association_PlayerLesson`, `Presence.player_id`, etc.). "Student" is used in prose/Intent sections and user-facing copy (e.g. `attendance/spec.md:194` "give a student a visual... history", `eligibility.rules` Intent "a student must satisfy") interchangeably with "player" — there is no separate Student entity. Role name in auth/permission checks is "player" (a `Player` linked to a `User`). |
| **coach** | "teacher"/"instructor" | `Coach` entity, `Association_CoachLesson`, `Association_CoachPlayer`; consistent throughout |
| **class** / **Lesson** (template) vs. **class instance** / **LessonInstance** (occurrence) | "session," "occurrence" alone, "lesson occurrence" | `classes/spec.md:1-13` — "Classes are the template; instances are the actual scheduled occurrences." `Lesson` = the DB/template noun, `LessonInstance` = the DB/occurrence noun; **user-facing/prose noun for both is "class"** (e.g. "class detail," "class-instance detail," `/api/app/class_instance`). "Class instance" is the standard compound when disambiguating from the template. |
| **materialize / materialization** | "instantiate," "generate," "create instance" | `classes.instances` rule 1 — the specific term for lazily creating a `LessonInstance` row (+ presences + jobs) from a recurring `Lesson` template on first need |
| **status** (on `Presence`): `present` / `absent` / `null` | "attended" / "missed" as enum values (those are used only as *page names*, e.g. "Attended KPI," "Missed KPI," "attendance history" vs "absence history") | `attendance/spec.md:15` |
| **justification** (on `Presence`): `justified` / `unjustified` / `null` | "excused" | `attendance/spec.md:15`; also "Faltas" is the Portuguese product name for the absences page (`attendance/spec.md:365`) |
| **validated** (bool on `Presence`) | — | `attendance/spec.md:15,23` — "the coach has finalized the attendance record." Currently an unspecified/dangling flag (see §2). This is the field most likely relevant to a "coach retroactively validates a class" feature. |
| **vacancy** / **Vacancy** (entity) | "open spot" as an entity name (that phrase is used only in `eligibility.open-spot-visibility`'s feature name, referring to the same underlying vacancy concept) | `notifications/spec.md` (waiting-list/invitations), `attendance.confirm` rules 5, 13, 15 |
| **enrollment** / **enrolled** | "registration," "sign-up" | `classes.enrollment`, `classes.instance-enrollment` — American spelling "enrollment" used in spec prose; "enrolment"/"enrolled" (British spelling) appears interchangeably in `eligibility`/`classes.join-requests` prose (e.g. `eligibility/spec.md:238` "expiry of existing enrolments," `classes/spec.md:356` "enrolment association"). **Inconsistent spelling in the existing tree** — not a hard convention either way.
| **eligibility** / **the bar** | "requirements," "qualification" | `eligibility/spec.md:1-6` — "the minimum bar a student must meet to join a class" |
| **credit(s)** (on `StandingWaitingListEntry`) | "make-up credit," "attendance credit" | `notifications/spec.md:499-513` — pre-paid waiting-list slots, unrelated to attendance/make-up classes |
| **capacity** / **effective filled spots** | "occupancy" | `calendar.view` rule 8-9, `calendar.event-detail` rule 5 — `effective_filled_spots` is the canonical computed field name; "capacity" is the UI label |

**Recommendation for a new feature**: name it around **"Presence"** (matches the entity) or **"Attendance"** (matches the existing domain directory and page name), and refer to the actor as **"coach"** and **"player"** in Entities/Rules (reserve "student" for Intent/UI-copy prose, matching existing usage). Avoid introducing a new "retroactive" vocabulary term without disambiguating it from `eligibility.enforcement` rule 8's existing use of that word.

## 4. Global Rules / Cross-Cutting Constraints

- **i18n**: every leaf spec with frontend rules mandates all user-facing copy goes through `src/locales/{pt,en}/<namespace>.json`, **default locale `pt`**, no hardcoded strings. Explicitly restated per-feature: `attendance/spec.md:73, 263-264, 364-365`; also the whole `settings.language` domain (`settings/spec.md:3-85`, draft) specifies the underlying i18n infrastructure itself.
- **Auth / role model**: `@jwt_required()` on all app endpoints; two roles at the domain level, **coach** and **player**, resolved via `Association_CoachPlayer` (roster relation, not global permission) — `require_own_roster_relation` is the standard decorator/helper name (`attendance.history` rule 3, `classes.detail-visibility`). The self-case is always resolved before the coach-case so a dual-profile user is never 403'd on their own data (repeated verbatim in `attendance.history` rule 3 and implied in `attendance.absences` rule 4).
- **Authorization is enforced server-side on the endpoint, never only on the frontend route** — explicitly called out with "PAD-88 / PAD-115 precedent" in `attendance.history` rule 3, `attendance.confirm` rule 14, and `attendance.absences` rule 4. Any new Presences endpoints must re-derive authorization identically.
- **Role-scoped payloads**: `classes.detail-visibility` — a student never sees other students' presence/participant/invitation data in a class-instance payload; only their own row. A new feature exposing per-player Presence data (e.g. a coach "validate class" screen listing every player) is coach-only by this precedent, and any student-facing surface of the same data must filter to self.
- **Single source of truth / no parallel recomputation**: `calendar.view` rule 9 explicitly forbids any surface recomputing `effective_filled_spots` independently — "computed in exactly one place." `attendance.history`/`attendance.absences` similarly pin their totals to `compute_player_kpis()` so the two can never disagree (rule 2 in both). This is a strong repo-wide norm: a new Presences feature that touches counts/rates must reuse the existing helper(s), not add a parallel calculation.
- **Draft-ahead-of-ticket marking convention**: `calendar.view`'s Intent block (`:14-16`) shows the pattern for specifying behavior "ahead of" the ticket that will build it — a `> **Forward-looking rules:**` callout naming which rules are not yet built and which ticket will build them. Useful if the new Presences spec needs to reference not-yet-built eligibility/calendar hooks.
- **`_index.md` dependency-graph discipline**: any new capability that depends on another domain must be reflected in the ASCII dependency graph and the domain's row in the Domains table (capability/leaf counts, status). The graph explicitly documents which domain-level edges are bidirectional-but-acyclic-at-leaf-level (`eligibility`) — a precedent to follow if Presences ends up in a similarly entangled position (it plausibly would, sitting between `attendance` and `eligibility`/`classes`).
- **Status semantics**: `implemented` (built, in prod) / `draft` (specced, not built) / `partial` (some rules built, named explicitly in-spec which). A new Presences feature starts life as `draft`.

### Specflow tooling conventions (from `.claude/skills/`, not from the specs themselves)

- `specflow-change-router` (`.claude/skills/specflow-change-router/SKILL.md`) is the **mandatory entry point** for any request in this project — it classifies the request into Standalone / Bug / Spec Change / New Feature / Spec Gap / Exploration / Ambiguous **before any code is written**, and requires human confirmation before executing. A "Presences" import is squarely **Category 4: New Feature** (or **Category 5: Spec Gap** for the parts of it that patch `attendance.presence`'s existing-but-unspecified `validated` field).
- Its **New Feature** action flow: determine where in the tree it belongs, draft new leaf spec(s) per the schema, set `depends_on`, run a coherence check, present for approval, then implement.
- **Schema note (important divergence)**: the schema referenced by the skill (`.claude/skills/specflow-new-project/references/spec-schema.md`, also mirrored in `specflow-onboard-codebase`) describes a **generic** template — one markdown file *per leaf spec*, frontmatter as a plain bullet list (`- **id:** ...`), Entities as a markdown table. **This is not what the actual `specs/` tree does.** The real, working convention (verified across every domain file) is one `spec.md` **per domain**, `##`-level leaf headers, and a `---`-delimited YAML-ish frontmatter block, as documented in §1 above. Any new Presences spec should follow the **actual tree convention**, not the generic skill template, to stay consistent with its neighbors.
- Per the root `CLAUDE.md` (`/Users/pedropacheco1/Documents/Projetos/padel_app/levelup/.claude/CLAUDE.md`): "This repo has a `specs/` tree, so `specflow-change-router` runs first and the skill classifies against the specs before writing code." Also: "If something is ambiguous, make a reasonable decision and document it in the commit message." Ticket branches are `feature/pad-<id>`; commits are Conventional Commits referencing the ticket.
- **`specs/` is confirmed NOT under git** (per the task and independently verified: `specs/` has no `.git` and the umbrella `levelup/` root itself is not a git repo — only the three sub-repos are). This matches the existing memory note `specs-tree-not-under-git.md`: any spec-driven workflow can never `git commit` spec edits directly; the PR body for the implementing repo (most likely `levelup_backend` and/or `levelup_frontend`) must reproduce the spec changes/rules in its description since there is no spec commit to point to.

## 5. Where a New "Presences" Feature Spec Would Slot In

**Recommendation: extend the existing `attendance/` domain, not create a new domain directory.**

Reasoning:
1. The domain already exists and is exactly about this subject — `attendance/spec.md`'s own title is "Presence & Attendance Tracking," its core entity is literally named `Presence`, and its first leaf (`attendance.presence`) already contains a `validated` field described as "the coach has finalized the attendance record" but never elaborated with rules or acceptance criteria. A feature where "a coach retroactively validates a past class and marks each player present/absent" reads as the **missing specification for that exact `validated=True` semantics**, not a new concept.
2. `_index.md`'s dependency graph already lists `attendance` as consumed by `notifications` and `eligibility`; adding a new top-level `presences` domain would force re-plumbing those edges for what is functionally the same data.
3. The domain-vocabulary analysis (§3) shows "Presence" is already the canonical entity name — introducing a sibling domain called "Presences" would create two domains with near-identical names/subject matter (`attendance/` and `presences/`), which is exactly the kind of drift `specflow-change-router`'s coherence check exists to catch.
4. Concretely, this would land as a **new leaf spec** inside `attendance/spec.md`, something like `attendance.validate-class` (or `attendance.retroactive-validation`), `depends_on: [attendance.presence, classes.instances]`, extending/clarifying the existing `validated` field and the existing `confirm_presences` endpoint (or a new endpoint) rather than reinventing the Presence entity. It would sit right after `attendance.presence` (`:3-37`) and before `attendance.confirm` (`:40`), or as a new final leaf — either is consistent with file ordering elsewhere (e.g. `attendance.absences` was appended at the end of the file for PAD-141).
5. This is a **New Feature** by `specflow-change-router`'s classification (no existing acceptance criteria cover "coach validates a *past* class," "locking" attendance after validation, or per-player retroactive present/absent marking as a distinct step from the existing `confirm_presences` flow) — but it is a spec-gap-flavored new feature, since it's filling in a field (`validated`) the schema already reserved for exactly this. Worth explicitly framing it that way when routing.

## 6. Conflicts / Tensions to Flag

For a feature where **"a coach retroactively validates a past class and marks each player present/absent":**

1. **No outright contradiction, but two things need reconciling with `attendance.presence` rule 3 and its existing AC.** Rule 3 already says "Coach marks final attendance: status=present or status=absent," and the existing AC uses `POST /api/app/lesson_instance/{id}/confirm_presences`. A new spec must either (a) explicitly state that this new "validate" action is the same endpoint/flow plus setting `validated=True`, or (b) introduce a distinct endpoint/flow and explain why `confirm_presences` doesn't already satisfy this need — otherwise the tree ends up with two undifferentiated ways to do the same thing, which `specflow-change-router`'s coherence check is meant to prevent (`specflow-change-router/SKILL.md`, "Rules This Skill Enforces" §3-4).

2. **Two independent "completed" concepts already exist and neither is coach-settable in the way "retroactively validating a past class" implies:**
   - `LessonInstance.status` (`classes.instances` rule 4, entity list `:116`): `scheduled → completed | canceled | rescheduled`, with an existing manual-update AC (`POST /api/app/lesson_instance/10/status {"status":"completed"}`).
   - The **calendar event's** `status` (`calendar.view` rule 11): explicitly `completed`/`scheduled` computed **purely from `now` vs. `end_datetime`** — "An event is completed once its end datetime has passed... the comparison uses the real end datetime." This is explicitly *not* a coach action; it's a derived read-time value.
   A "coach retroactively validates a class" feature needs to state clearly which of these (if either) it interacts with, and must not silently make the calendar's derived `completed` status coach-settable, since `calendar.view` rule 11 currently guarantees it is purely time-derived — an outright rule violation if a new feature lets a coach flip it directly.

3. **Terminology collision with `eligibility.enforcement` rule 8's "retroactive."** That rule states "No **retroactive** evaluation, no auto-removal, no expiry of existing enrolments" — meaning eligibility-bar changes are never applied backward. A Presences feature that is itself described as "retroactive" (validating a *past* class) uses the same word for an unrelated concept (temporal direction of the action vs. temporal direction of a *different* rule's applicability). Not a logical conflict, but worth choosing distinct spec language (e.g. "post-class validation" or "late attendance marking") to avoid a reader conflating the two "retroactive"s when grepping the tree.

4. **`attendance.stats` / `eligibility.rules` consume live Presence data with no "locking" concept.** `_attendance_stats`, `_unjustified_absence_count`, and `eligibility.rules`' absence-based bar (`eligibility/spec.md:37`, "computed exactly as `notifications.invitations` already computes them") are described as evaluated "fresh at the moment it is needed... never snapshotted" (`eligibility.rules` rule 8). If "validating" a class is meant to **lock** its Presence rows from further edits (a natural reading of "retroactively validates... and marks each player"), that's a new constraint nothing in the tree currently enforces — Presence rows today appear freely mutable via `confirm_presences` with no rule limiting how many times or how long after the class it can be called again. The new spec needs to either explicitly allow re-marking after validation (status quo) or introduce a lock, and if it introduces a lock, that's a **new rule on an existing entity** that must be checked against every existing consumer of `Presence.status`/`justification` (`attendance.confirm`'s decline/cancel paths, `attendance.history`/`attendance.absences`, `attendance.stats`, `eligibility.rules`) for whether any of them ever need to write to a Presence row for a class that has already started/ended — e.g. `attendance.confirm` rule 4 explicitly forbids cancellation only *after class start*, but nothing forbids the reminder-decline (`respond_reminder` `no`) or a coach's `confirm_presences` call from touching a Presence row on an already-past class, so a lock introduced by the new feature could silently break those existing paths if not scoped carefully.

5. **No conflict found regarding capacity/credits/make-up classes** — because none of those concepts intersect attendance validation in the existing tree (credits are pre-paid waiting-list slots unrelated to marking attendance; there is no make-up-class booking flow at all), a Presences feature is free to introduce net-new rules there without needing to reconcile against existing specs — but should not silently borrow the word "credit" for anything attendance-related, since it already has a specific, different meaning (§3).

## Notes on method
- All quotes above are `file:line` verified from the current on-disk contents of `specs/` and `.claude/skills/`. No file was modified; this was a read-only investigation.
- Not quoted in full: `auth/spec.md`, `clubs/spec.md`, `levels/spec.md`, `evaluations/spec.md`, `messaging/spec.md`, `training/spec.md`, `import/spec.md` — these were surveyed for structure/Intent lines only (§1 table) since they have no attendance/presence overlap; happy to go deeper on any of them on request.
