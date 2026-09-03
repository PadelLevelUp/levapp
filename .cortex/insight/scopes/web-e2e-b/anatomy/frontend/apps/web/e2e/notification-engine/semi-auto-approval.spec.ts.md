---
path: frontend/apps/web/e2e/notification-engine/semi-auto-approval.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 3
size_lines: 491
size_tokens: 4737
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3cbf06bfcfd5e009264355e3e5ee6d0ddf38492a644fc69e804e2c5e3f0f119b"
---

## Purpose

TDD-authored (the file's own header states tests are "expected to FAIL until
the feature is implemented") coverage of `notifications.semi-auto-approval`:
a coach-configurable `invitationMode: "semi_automatic"` that, when a player is
marked absent during presence confirmation, WITHHOLDS automatic invitations
and instead surfaces a replacement-APPROVAL prompt (an inline bundled card
plus a persisted message in the coach's Assistant conversation) offering "Yes,
right now" / "Yes, at {window open time}" / "No".

## Main players

- `test.afterEach` (lines 55-68) — critical, suite-hygiene. Restores
  `autoNotifyEnabled: true, invitationMode: "automatic"` (the seed default)
  and deletes every class created by `createdClasses` — explicitly protecting
  LATER specs (`schedule-calendar`, `attendance`) from inheriting
  semi-automatic mode or a stray extra calendar entry.
- `getToken`/`setCoachConfig` (lines 70-97) — supporting, local login/config
  helpers (same shape as other notification-engine L3 files, not shared).
- `countInviteMessages` (lines 103-130) — critical. Counts
  `notification_invite`-typed messages across ALL of a user's conversations —
  used as a comparison BASELINE (not an absolute count) in every test,
  because invites sent by earlier specs in a full suite run are expected and
  must not produce false positives.
- `pollForNewInviteMessage` (lines 137-149) — critical. Polls
  `countInviteMessages` until it exceeds a given baseline.
- `nextMondayDate` (lines 156-165) — supporting. Independently reimplements
  the seed script's "next Monday" date logic (explicitly noted in the
  comment) so test-created classes land in the same predictable slot as the
  seeded one.
- `createApprovalTestClass` (lines 172-214) — critical. Creates a DEDICATED
  single class enrolling only "E2E Student", tracked in `createdClasses` for
  teardown. Both tests use their OWN class
  (`APPROVAL_CLASS_TITLE_A`/`APPROVAL_CLASS_TITLE_B`) rather than the shared
  seeded class, because the spec mandates ONE approval prompt per vacancy
  (idempotent) — reusing a vacancy already decided by the other test, or by
  `reminder-flow.spec.ts` running earlier in a full suite, could never
  produce a fresh pending prompt.
- `openClassDetail` (lines 217-230) — supporting, generalized (accepts a
  `title` param, unlike the fixed-title versions in other files) to work with
  either dedicated class.
- `markSeededStudentAbsentAndConfirm` (lines 236-253) — critical. Drives the
  ACTUAL trigger mechanism under test: enters attendance mode, marks the sole
  participant absent+unjustified, confirms — this is what should produce a
  semi-automatic approval prompt instead of an automatic invitation fan-out.
- `enableAutoInviteEngine` (lines 256-273) — supporting. Toggles the master
  switch only if currently off, waiting on the config-save POST.
- US-NSA-01 (lines 279-408) — critical, the full happy path. (1) ensures the
  engine is on via API, then drives the UI: opens Settings → Notifications,
  asserts an "Invitation mode" control EXISTS (the still-missing feature at
  time of writing), selects "semi-automatic" via a chain of `.or()` fallback
  locators (radio/button/option/label — defensive against whichever control
  type ships), and confirms the backend persisted
  `invitationMode: "semi_automatic"`; (2) creates a dedicated class, records
  an invite-count baseline for student-2; (3) marks the student absent and
  confirms — asserts the approval card shows BOTH the declining student AND
  the full ordered invite queue (student-2 as first eligible candidate), with
  "Yes, right now" and "No" actions, and crucially that NO invitation was
  sent yet (still at baseline); (4)-(5) clicks "Yes, right now", polls for a
  NEW invite message beyond baseline, then does a full UI round-trip logging
  in AS student-2 to visually confirm the invite with its "Yes" action
  renders in Messages.
- US-NSA-02 (lines 415-490) — critical, the dismissal path. Same setup via
  API this time (mode set directly, not through the UI), marks a SECOND
  dedicated class's student absent, clicks "No" on the approval card, asserts
  the card's actions disappear (terminal decision — no further "Yes, right
  now" button), waits 5s as a grace period and confirms invite count is
  STILL at baseline (no erroneous async send), then verifies the prompt
  itself is PERSISTED as a message in the coach's own "Assistant"
  conversation, referencing both the declining student and the ordered
  invite queue.

## Insights

- This is the only notification-engine L3 file whose header explicitly
  states its tests are expected to fail pre-implementation — a genuine
  TDD artifact rather than a regression-guard-after-the-fact, unlike every
  sibling file in this scope.
- The "one prompt per vacancy, idempotent" spec rule is why this file departs
  from `reminder-flow.spec.ts`'s pattern of reusing the shared seeded class:
  idempotency means a SECOND test against the same vacancy can never see a
  fresh prompt, so dedicated per-test classes are structurally required here,
  not just a style preference.
- `countInviteMessages`/baseline-diffing (rather than an absolute count) is
  the same defensive pattern `auto-reminder.spec.ts` and
  `blank-template-fallback.spec.ts` use for polling, applied specifically to
  handle invite pollution from `reminder-flow.spec.ts` when the full suite
  runs in one process.
- The locator fallback chain for the semi-automatic mode control
  (`.or(...).or(...).or(...)`) is itself evidence the exact control TYPE
  (radio vs button vs select option vs label) was undecided/unimplemented at
  authoring time — a TDD spec deliberately written to survive several
  plausible implementations.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`); `helpers/auth` (`loginAsCoach`,
  `STUDENT2_USERNAME`, `STUDENT2_PASSWORD`); `helpers/navigation`
  (`openCalendar`, `openSettings`, `openMessages`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point; not imported elsewhere)
- Semantically related (not imports): exercises
  `backend/padel_app/services/replacement_approval_service.py` (the
  semi-automatic approval-card/prompt logic) and the `invitationMode` config
  field in `notification_service.py` / `notification_engine_api.py`, plus
  `frontend/apps/web/src/components/notifications/ReplacementApprovalCard.tsx`;
  covers `.specflow/specs/notifications/semi-auto-approval.spec.md` and the
  `invitationMode` addition to `.specflow/specs/notifications/config.spec.md`
  in full.

## Query pointers

- If you need to change the AUTOMATIC (non-approval) invitation fan-out
  behaviour instead, read: `proactive-decline.spec.ts`'s US-73-04 (invitation
  timing under `invitationMode: "automatic"`, the default this file's
  `afterEach` restores).
- If you need the approval-card's persisted-message format in the Assistant
  conversation, read first: US-NSA-02 here, then:
  `replacement_approval_service.py`.
