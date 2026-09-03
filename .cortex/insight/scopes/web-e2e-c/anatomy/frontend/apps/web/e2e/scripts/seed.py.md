---
path: frontend/apps/web/e2e/scripts/seed.py
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 3
size_lines: 856
size_tokens: 8746
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "39a5945edbb8f6cab8e758db4fd48a882b62d3ab761a7e2be83a5509bbb16776"
---

## Purpose

Populates the shared \`levelup_test\` Postgres database with every fixture the
whole E2E suite depends on: users/coaches/players, a club, coach levels, an
evaluation category, 27 "filler" players for pagination/search tests, and a
dozen purpose-built lessons/instances covering the primary seeded class, a
declined-count class (PAD-71), a recurring class (PAD-59), a pending-
confirmations class (PAD-78), attended history (PAD-114), missed history
(PAD-141), classes awaiting validation (PAD-140), notification config, and two
coach-student conversations with messages (including one dated "yesterday" for
PAD-98's day-label test). Run standalone (\`python seed.py\`) against the test
DB before the Playwright run; every spec in every scope that logs in as
\`e2e-coach\`/\`e2e-student\` depends on this file's exact fixture shapes,
counts, and dates.

## Main players

- \`_utcnow_naive()\` (lines 39-40) — critical: returns naive-UTC \`now\`, the
  datetime contract every timestamp in the file is built from (the backend
  stores naive UTC, not timezone-aware datetimes).
- Users block (lines 50-102) — critical: creates \`coach_user\` (\`e2e-coach\`,
  \`language="en"\`, \`is_superadmin=True\` so \`/editor\` is reachable for i18n
  Editor coverage), \`student_user\` (\`e2e-student\`), \`student2_user\`
  (\`e2e-student-2\`), \`ghost_user\` (inactive, no password — for invite-link
  tests), and \`nolevels_coach_user\` (\`e2e-coach-nolevels\`, PAD-29's
  empty-levels dropdown case, and \`security/*-authz.spec.ts\`'s "another coach"
  identity).
- Coach levels block (lines 138-146) — critical: \`level_intermediate\`
  (\`display_order=1\`, stronger) and \`level_beginner\` (\`display_order=2\`,
  weaker) — the ordering convention pinned by
  \`settings/coach-levels-ordering-hint.spec.ts\` and consumed by the backend's
  \`notification_service._level_ids_one_above\`.
- Filler players loop (lines 188-220) — critical: 27 players
  ("Filler Player 01".."27"), all at \`level_intermediate\` (deliberately NOT
  beginner, so they don't shadow \`e2e-student-2\` as the first eligible
  invitation-queue replacement); referenced by name across many specs (e.g.
  Filler 21/22 in \`ticket-pad-109-standing-waitlist-search.spec.ts\`, Filler
  26/27 in \`participant-count-effective.spec.ts\`, Filler 5-9 in the
  pending-confirmations block below).
- "E2E Academy Class" (lines 222-289) — critical: the primary seeded class,
  next Monday 10:00-11:00, 6 max, level=beginner, with \`e2e-student\` enrolled
  and an \`invited=True, confirmed=False\` \`Presence\` row. The single most
  widely depended-on fixture in the suite (found via \`findClassOnCalendar\` by
  many specs across scopes).
- "E2E Declined Count Class" (lines 291-357) — supporting: next Thursday
  16:00, max 4, 3 filler players enrolled with 2 already \`status="absent"\` —
  the PAD-71 effective-count fixture consumed by
  \`schedule-calendar/participant-count-effective.spec.ts\`.
- "E2E Recurring Class" (lines 359-402) — critical: weekly-on-Tuesday
  recurring lesson; \`daysOfWeek\` is deliberately converted from Python's
  \`date.weekday()\` to the app's JS \`getDay()\` convention
  (\`(next_tuesday.weekday() + 1) % 7\`) — the exact conversion whose historical
  absence was the PAD-59 bug that
  \`schedule-calendar/recurring-class-weekday.spec.ts\` and
  \`recurring-occurrence-delete.spec.ts\` pin against regressing.
- "E2E Pending Confirm Class" (lines 404-508) — supporting: tomorrow 18:00,
  uses \`NotificationEvent\` rows at three statuses (\`sent\` x2, \`confirmed\` x1,
  \`expired\` x1) to seed the dashboard's "pending confirmations" count at
  exactly 2; deliberately uses filler players, not real students, because the
  spec that actually fires \`send_manual_notifications\` would otherwise pollute
  the coach-student conversation the messaging specs depend on.
- Attended/Missed/Validation history blocks (lines 510-755) — supporting:
  three separate past-dated lesson/instance sets for \`e2e-student\`
  (\`status="present"\` x5, \`status="absent"\` x3 mixed justified/unjustified,
  and two not-yet-\`validated\` instances in the previous week) — each with an
  extensive comment explaining its date placement rules (always ≥8 days old so
  it never lands in the calendar's default current-week view; instance-only
  player attachment so it never appears in "my classes"; \`validated=True\`
  where applicable so it doesn't move the dashboard's "Pending validation" KPI;
  11:00 UTC to stay clear of PAD-33's midnight-boundary timezone flakiness).
- Conversations block (lines 764-834) — supporting: coach<->student
  conversation with 2 messages (1 unread for the coach, timed 1 second after
  \`coach_user\`'s \`last_read_at\`) for messaging specs US-57..US-64, plus a
  second coach<->student2 conversation with its last message dated to
  yesterday-noon for PAD-98's "Yesterday" day-label test.

## Insights

- Every fixture block carries an explicit comment justifying its exact
  placement (date offset, player selection, validation flag) in terms of
  which OTHER spec it must not perturb — this file is effectively the shared
  mutable state contract for the entire E2E suite, and changing any date,
  count, or player selection here risks silently breaking a spec in a
  completely different scope that depends on the old value.
- The Python-weekday-vs-JS-weekday conversion on line 375 is the single most
  load-bearing one-line fix in the file: getting it wrong regresses PAD-59
  silently (the class would still render, just under the wrong day).
- Filler players are deliberately kept off the primary "E2E Academy Class" and
  most other named fixtures specifically so that specs which enroll/decline/
  invite via the API (e.g. \`guest-list-dedupe.spec.ts\`,
  \`participant-count-effective.spec.ts\`) can safely mutate a filler player's
  state without touching a fixture another spec's assertions depend on.
- \`is_superadmin=True\` on the seeded coach (line 59) is scoped narrowly to
  reach \`/editor\` for the i18n Editor coverage spec elsewhere in the suite —
  not used by anything in this scope, but a reader debugging why \`e2e-coach\`
  can reach admin-only routes should look here first.

## File map

Lines 1-41: imports and \`_utcnow_naive()\` helper.
Lines 44-146: Users, Coach/Player rows, Club, Coach levels.
Lines 148-186: Evaluation category, Coach↔Player associations.
Lines 188-220: 27 filler players (pagination/search fixtures).
Lines 222-289: "E2E Academy Class" (primary seeded class).
Lines 291-357: "E2E Declined Count Class" (PAD-71 effective-count fixture).
Lines 359-402: "E2E Recurring Class" (PAD-59 weekday-convention fixture).
Lines 404-508: "E2E Pending Confirm Class" (PAD-78 dashboard KPI fixture).
Lines 510-586: "E2E Attended Class" history (PAD-114).
Lines 588-668: "E2E Missed Class" history (PAD-141).
Lines 670-755: "E2E Validation Class" (PAD-140, previous-week, unvalidated).
Lines 757-762: Notification config (auto-notify enabled).
Lines 764-834: Two coach-student conversations with messages.
Lines 835-856: Commit and diagnostic print summary.

## Connections

Uses: (imports backend models directly — outside this scope: \`padel_app.models.*\`, \`padel_app.sql_db.db\`, \`padel_app.create_app\`)

Used by: every spec across every E2E scope that logs in as \`e2e-coach\`,
\`e2e-student\`, \`e2e-student-2\`, or \`e2e-coach-nolevels\`, or that looks up a
named fixture ("E2E Academy Class", "E2E Recurring Class", "E2E Declined
Count Class", "Filler Player NN", etc.) — effectively the whole suite.

Semantically related (not imports): every backend model it writes to
(\`User\`, \`Coach\`, \`Player\`, \`Club\`, \`CoachLevel\`, \`EvaluationCategory\`,
\`Lesson\`, \`LessonInstance\`, \`Presence\`, \`NotificationConfig\`,
\`NotificationEvent\`, \`Conversation\`, \`Message\`, and the \`Association_*\` join
tables) and the \`reset-test-db.sh\` script that resets \`levelup_test\` before
this runs (present in \`e2e/scripts/\` but not part of this scope's file slice).

## Query pointers

If you need to add a new fixture, also read: the placement-rule comments on
the Attended/Missed/Validation blocks (lines 510-755) — every existing
fixture explains WHY it sits where it does, and a new one must clear the same
bar (doesn't crowd the current week, doesn't shift another spec's counts).
If you need to change dates or counts on an EXISTING fixture, read first: the
spec(s) named in that block's own comment (e.g. PAD-71, PAD-59, PAD-78,
PAD-114, PAD-141, PAD-140, PAD-98) to see exactly what they assert, then:
grep the whole E2E suite for the fixture's title string before changing it.
