---
path: frontend/apps/web/e2e/settings/student-notification-blocks.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 3
size_lines: 364
size_tokens: 3253
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0cb87ddfa4cca894253ee29adfae3d877441bb84cda6c9b00993ad1db67e2068"
---

## Purpose

PAD-112: a student can block class-vacancy invitation notifications from their
own Settings, at three independent levels (auto-invitations, manual
invitations, everything), with a free-text reason the coach can read.
Deliberately organized into three halves: the STUDENT UI half (the section is
offered, the three toggles persist independently across a reload, and
"block everything" is gated behind a confirmation dialog that names the
unjustified-absence consequence and can be cancelled without writing
anything); the SUPPRESSION half — described in the file's own header comment
as "the decisive one" — which asserts against the live stack via direct API
calls that a blocked student is actually skipped by \`notify/manual\` and
reported BY NAME, not merely that a checkbox stayed checked; and the COACH UI
half (the "notifications cut" badge and the student's own reason appear on
the player record). Every test restores the student to "receives everything"
in \`afterEach\`, since a student left blocked would silently suppress
invitations in the notification-engine specs that share the seed DB.

## Main players

- \`setStudentPrefs(request, prefs)\` (lines 58-69) — critical: logs the student in
  and \`PATCH\`es \`/auth/me\` directly with a partial preferences object; the sole
  write path used both to arrange test state and to restore \`CLEARED\` state in
  \`afterEach\` (line 80-82).
- \`CLEARED\` (lines 51-56) — the canonical "fully unblocked" preferences object,
  reused as both the reset target and (implicitly) the expected baseline.
- \`openMyNotifications(page)\` (lines 71-77) — critical: navigates Settings and
  clicks the \`settings-nav-myNotifications\` testid, waiting for the
  \`student-notification-blocks\` panel testid.
- \`seededInstanceRef(request, token)\` (lines 216-237, inside the suppression
  \`describe\`) — critical: locates the seeded "E2E Academy Class" through the
  coach's own \`/app/calendar\` (wide ±365-day window) rather than a hardcoded
  id/date, so the fixture keeps working across re-seeds.
- \`studentPlayerId(request, coachToken)\` (lines 239-248) — resolves
  \`STUDENT_USERNAME\`'s \`playerId\` from \`/coach_players\` by matching on
  \`username\`.

## Insights

- The suppression tests (lines 250-294) are the ticket's real regression
  guard: a toggle that persists in the DB but doesn't actually stop
  \`notify/manual\` from sending is the exact failure mode PAD-112 exists to
  prevent, so those two tests assert \`body.sent === 0\` and
  \`body.blocked[0].reason\` — not just that the API call succeeded.
- Line 191's comment explicitly calls out "the PAD-93 boolean trap": a partial
  \`PATCH\` that sets a boolean back to \`false\` must actually persist \`false\`,
  not be silently treated as "no value supplied" and left at its previous
  \`true\`. The "explicit un-block is persisted" test (lines 175-198) exists
  specifically to catch a regression of that trap.
- The three block levels are asserted to be independent of each other
  (blocking AUTO only still lets a manual invite through, line 276-294) — a
  service that conflated the three flags would pass most other tests here but
  fail this one specifically.
- \`GET /auth/me\` is asserted to expose all four block-related fields
  (lines 296-313) even for a student caller, which is what the Student UI half
  reads from to render toggle state on load.

## Connections

Uses:
- ../helpers/auth: \`loginAsCoach\`, \`loginAsStudent\`, \`COACH_USERNAME\`/\`COACH_PASSWORD\`, \`STUDENT_USERNAME\`/\`STUDENT_PASSWORD\`
- ../helpers/navigation: \`openSettings\`, \`openPlayers\`
- ../helpers/api: \`API_ROOT\`

Used by: —

Semantically related (not imports): the suppression half exercises the same
\`notify/manual\` route as \`schedule-calendar/guest-list-dedupe.spec.ts\`; the
coach-UI half's player-record badge is the counterpart surface to
\`settings/student-settings-scope.spec.ts\`'s PAD-142 "My notifications" tab
visibility rules (both gate a student-only feature's visibility by role).
Component: \`StudentNotificationBlocks\` (testid
\`student-notification-blocks\`).

## Query pointers

If you need to change what fields \`PATCH /auth/me\` accepts for a student,
also read: \`setStudentPrefs\` (this file) and
\`settings/student-settings-scope.spec.ts\` (asserts the same endpoint stays
open to students for other fields).
If you need to touch the "block everything" confirmation flow, read first:
the \`student-notif-confirm-all\`/\`-cancel\`/\`-accept\` testid block
(lines 138-173), then: the suppression tests to confirm the write path is
unaffected.
