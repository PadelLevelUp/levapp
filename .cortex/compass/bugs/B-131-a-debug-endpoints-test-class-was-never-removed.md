---
id: B-131
title: "A reminder debug endpoint's test class was never removed, so on Tuesday afternoons three cards overlapped the participant-count fixture and its count went compact"
type: test-defect
severity: low
status: resolved
affects:
  - backend/padel_app/modules/notification_engine_api.py
  - frontend/apps/web/e2e/notification-engine/waiting-list-offer.spec.ts
  - frontend/apps/web/e2e/notification-engine/auto-reminder.spec.ts
  - frontend/apps/web/e2e/notification-engine/blank-template-fallback.spec.ts
  - frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts
  - frontend/apps/web/e2e/dashboard/student-dashboard-home.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/participant-count-effective.spec.ts
proposed_fix: "Give the debug creator a cleanup counterpart (POST .../schedule_reminder_test/cleanup, gated and scoped identically) built on the existing remove_class_service, and have every calling spec call it in an afterAll."
opened: 2026-09-22T15:29:20Z
resolved: 2026-09-22T15:45:56Z
---

# B-131 — a debug endpoint's test class was never removed

**Source.** Session-C's four-cell reproduction on staging `87823c5e5`, 15:18–15:28 UTC. The full
shard 3 in wave-3 order ran green at 15:18 because the leaked classes from that run landed at
17:19 — after the participant-count spec had already run, so no overlap existed yet that day. A
planted-filler probe (seeding extra classes onto the fixture's slot by hand, the same shape a
leak would take) reproduced the byte-identical `Received` string the flake report carried. The
same probe with the fillers removed came back green. The spec alone, run repeatedly under load
(iterations 25–28), was green throughout — the failure only appears with three or more cards
sharing the slot, which a solo run of the file cannot produce on its own.

**Mechanism.** `POST /api/app/notify/debug/schedule_reminder_test`
(`backend/padel_app/modules/notification_engine_api.py`, `debug_schedule_reminder_test`, ~line
548) creates a one-hour Lesson + LessonInstance titled "E2E Auto-Reminder Test" at
`club_now_naive() + 48h`, and nothing in the route or its five callers ever removed it. `today +
48h` lands on the seed's "next Thursday" slot specifically when the call is made on a Tuesday,
and only overlaps the seed's own "E2E Declined Count Class" (next Thursday 16:00) when the call
lands roughly 13:00–15:00 UTC, the window that puts the 48h-out instant inside that hour. Once
three or more classes shared the slot, `CalendarGrid.tsx:333` — `compact = parseFloat(height) <
56 || group.length > 2` — rendered every card in that group compact, which hides the
`filled/capacity` line entirely. `participant-count-effective.spec.ts`'s `toContainText("1/4")`
then failed on a card carrying only the bare title/chip: a rendering-mode symptom that reads
like a wrong capacity value.

**Fix (this PR).** The creator route gets a sibling, `POST
/api/app/notify/debug/schedule_reminder_test/cleanup` — same blueprint, same
`E2E_DEBUG_ENDPOINTS`/JWT gate, same coach lookup — that deletes every Lesson titled
`REMINDER_TEST_CLASS_TITLE` (the title constant, now shared by both routes) belonging to the
calling coach, through `remove_class_service` (the same scope-aware removal the app's own
"remove class" action uses), so instances, presences, coach associations and scheduler jobs are
cleaned up exactly as a real delete would be. The creator's response now also carries
`lessonId`. The five specs that call the creator
(`waiting-list-offer`, `auto-reminder`, `blank-template-fallback`, `reminder-flow`,
`dashboard/student-dashboard-home`) each call the new
`helpers/reminder-test-class.ts::cleanupReminderTestClasses` in a `test.afterAll`.
`security/frontend-api-auth.spec.ts` only probes the route anonymously (expects 401) and never
reaches the creation logic, so it needed no change.
`schedule-calendar/participant-count-effective.spec.ts` gets an explanatory comment above its
first test — not a test change — pointing back at the compact-card mechanism so a future red
here is diagnosed against the card count, not `maxPlayers`.

**Runs.** **Runs (Session-B, 2026-09-22, branch from staging `87823c5e5`, worktree wt-a, isolated stack `levelup_e2e_e8c37758` / :5284 / :8284 reseeded before every run, `--workers=1`, times from `date -u`):**
- Backend `test_b131_reminder_test_class_cleanup.py` alone → 3 passed (15:41:15Z); the subagent's run with `test_frontend_api_authz.py` → 61 passed.
- Cell A, cleanup ON: `waiting-list-offer.spec.ts` → 2 passed (15:41:59–15:42:31Z); `select count(*) from lessons where title = 'E2E Auto-Reminder Test'` → **0**.
- Cell B, the spec's `afterAll` call neutralised (sed, restored after): 2 passed (→15:43:02Z); the same count → **2** — the leak, made visible; the fix's absence is what the count measures.
- Session-C's planted-filler probe (never committed), fillers PRESENT over the Thursday slot: 1 failed at 15:43:55Z with `Received string: "E2E Declined Count ClassI1"` — byte-identical to wave 3's — and three cards on screen (`["E2E Declined Count Class\n\nI1","B131 Overlap Filler A","B131 Overlap Filler B"]`); fillers REMOVED (`B131_CLEAN=1`): 1 passed at 15:44:25Z, the one card reading `… 16:00 – 17:00 … 1/4`.
- Not run: the full E2E suite, shard 3 in wave-3 order (Session-C ran it green at 15:18–15:25Z on 87823c5e5, before this fix, because the leaked classes landed at 17:19 that hour — no overlap), Maestro.

**The general rule.** A debug endpoint that creates rows must offer the way to remove them, and
every spec that calls it removes what it created (R-040: an E2E spec puts the shared database
back).
