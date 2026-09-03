---
path: frontend/apps/web/e2e/notification-engine/proactive-decline.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 3
size_lines: 422
size_tokens: 4508
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e27d6781b47e05a6bf6c1624b5d6ef0f1717cabccbbfe0ca2c3f7b000c8929c4"
---

## Purpose

Full coverage of PAD-73 (students proactively declining a future class before
their attendance reminder ever fires), implementing `.specflow/specs/attendance/confirm.spec.md`
rules 10-16. The organizing idea: the SAME endpoint
(`POST /api/app/notify/cancel_attendance`) now serves both a "late"/"reminder
already fired" decline AND a "proactive"/"before the reminder instant"
decline, and the SERVER classifies which one happened and reports it back as
`{action, proactive}` — none of this is client-computed.

## Main players

- `token`/`studentToken`/`student2Token`/`coachToken` (lines 45-60) —
  supporting login helpers, local to this file.
- `getConfig` (lines 62-68) — supporting, `GET /notify/config` wrapper.
- `setReminderHoursBefore` (lines 80-97) — critical. The test-determinism
  linchpin: rather than relying on the coach's default 48h reminder timing
  (which would make proactive-vs-not flip depending on which day the suite
  happens to run, since the seeded class is "next Monday", 1-7 days out), it
  directly pins `reminderTiming.firstReminder` to an explicit hours-before
  value — `1` puts the reminder instant safely in the future (window OPEN,
  decline is proactive), `10000` (~14 months) puts it safely in the past
  (window CLOSED, decline is a normal/non-proactive decline). Returns the
  PREVIOUS `reminderTiming` for restoration.
- `restoreReminderTiming` (lines 99-108), `resetStudentPresence` (lines
  111-117, calls the `notify/debug/reset_presence` E2E-only endpoint) —
  supporting, both called in every test's `finally` block for shared-DB
  hygiene.
- `presenceForStudent` (lines 119-135), `studentClassPayload` (lines 137-145)
  — supporting read helpers used across multiple tests to assert on presence
  status and the student's own view of the class-instance payload
  respectively.
- US-73-01 (lines 151-183) — critical. Reminder instant in the future →
  decline is `proactive: true`, and produces the SAME auto-justified
  (`absent`/`justified`/`lateCancellation: false`) presence state a reminder
  decline would.
- US-73-02 (lines 189-214) — critical. Reminder instant in the past → the
  SAME endpoint still succeeds but reports `proactive: false` — proving the
  classification is instant-relative, not a hardcoded interval.
- US-73-03 (lines 220-251) — critical. The class payload itself exposes
  `proactiveDeclineDeadline` (an ISO instant) and `canDeclineProactively`
  (boolean), and the deadline demonstrably TRACKS the coach's reminder
  config — shifting `firstReminder` from 1h to 5h moves the deadline back by
  exactly 4 hours (asserted to the millisecond:
  `deadlineAt1h - deadlineAt5h === 4 * 60 * 60 * 1000`), and pushing the
  reminder instant into the past flips `canDeclineProactively` to false.
- US-73-04 (lines 257-345) — critical, the most involved test. Proves a
  proactive decline frees the calendar spot IMMEDIATELY (`participantCount`
  drops by exactly 1 on the very next calendar read, no batch tick needed)
  while invitation TIMING is genuinely unaffected — explicitly arms
  `autoNotifyEnabled: true` first (with a comment noting that without this,
  the "no invites yet" assertion would be vacuously true since
  `trigger_invitations` bails before ever consulting the invitation-start
  window), then confirms the invitation count is unchanged even after an
  EXPLICIT engine tick (`POST /notify/process_rounds`) — the invitation-start
  window (24h before start by default) genuinely hasn't opened for a class
  ~a week out.
- US-73-05 (lines 351-368) — critical, authorization (PAD-88/PAD-115). A
  student not enrolled in a class gets 403 trying to decline it — checked in
  BOTH directions (student-2 declining student-1's class, and vice versa via
  a separate `FOREIGN_INSTANCE_ID`), proving the check is enrolment-based, not
  merely "is authenticated as a student".
- US-73-06 (lines 374-421) — critical, UI. The proactive-decline affordance
  lives on the student's OWN row in the participants section (button matching
  `/can'?t attend|não vou poder ir/i`), and the declined state survives a full
  page reload — proving it's derived from serialized presence, not transient
  client state.

## Insights

- This file is the canonical example in the scope of the "shared-DB config
  mutation needs restoration" discipline: EVERY test pins/mutates
  `reminderTiming` and/or presence via debug endpoints, and EVERY test's
  `finally` restores both, specifically because "the seed DB is shared with
  every other spec" (stated explicitly in the file's header comment).
- US-73-04's "the invitation engine must actually be ARMED for the assertion
  to mean anything" comment is a load-bearing test-design insight: a
  seemingly-strict assertion (no invites sent) can be accidentally vacuous if
  the precondition that would make invites POSSIBLE isn't itself verified
  first.
- `CAL_FROM`/`CAL_TO` (lines 42-43) are computed as `[-2 days, +14 days]` from
  `Date.now()`, "wide enough to always contain the seeded class ('next
  Monday', 1-7 days out)" — a deliberately generous, self-documenting window
  rather than a narrower one that would need updating if the seed's class
  placement logic ever changed.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`); `helpers/auth`
  (`loginAsStudent`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point; not imported elsewhere)
- Semantically related (not imports): exercises `cancel_attendance`'s
  server-side proactive/non-proactive classification and the
  `proactiveDeclineDeadline`/`canDeclineProactively` payload fields in
  `notification_service.py` / `notification_engine_api.py`, plus the
  invitation-engine's `trigger_invitations` / `process_rounds` timing logic;
  covers `.specflow/specs/attendance/confirm.spec.md` rules 10-16 in full.

## Query pointers

- If you need to change the cancel_attendance classification rule, also read:
  `cancel-attendance.spec.ts` and `cancel-attendance-class-view.spec.ts` (the
  non-proactive/late-decline siblings of the same endpoint) in this scope.
- If you need to touch invitation TIMING (invitation-start window,
  `process_rounds`), read first: US-73-04 here, then:
  `semi-auto-approval.spec.ts` (a different `invitationMode` branch of the
  same invitation engine).
