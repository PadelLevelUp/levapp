---
id: B-240
title: "Web class detail, edit mode: the count subtracted a declined student the coach had unticked"
type: missing-criterion
severity: low
status: resolved
affects:
  - calendar.event-detail
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
proposed_fix: "calendar.event-detail rule 5 states that edit mode counts the draft's students only; effectiveFilledSpotsOf (@levelup/config) subtracts declines among the listed participants only, used at both web count sites."
opened: 2026-10-01T19:03:19Z
resolved: 2026-10-01T19:03:19Z
---

# B-240: the web edit count subtracted an unticked declined student

**Source:** found by Session-B's craft review of PAD-474 (#487), where the iOS port had the same arithmetic. The
coordinator asked for a web-only fix in its own PR. It has no Linear ticket; this entry is the record.

**What happens:** a class whose saved roster is Ana (declined, `status=absent`) and Bruno (coming). In edit mode the
coach unticks Ana. The capacity card and the "Participants (X/Y)" header both show **0**, while Bruno is listed and
coming.

**What should happen:** 1. `calendar.event-detail` rule 5 says a not-coming student is "out of every count". Ana is
neither listed nor counted, so her decline must not be subtracted either.

**Root cause (observed):**
- `ClassDetailSheet.tsx:1017` and `:1258` call `effectiveFilledSpots(active.participants.length, active.presences)`.
- `active` is `draft ?? classInstance` (`:372`). The draft's `participants` change as the coach ticks; its `presences`
  are the saved ones.
- `effectiveFilledSpots` (`packages/config/src/capacity.ts:27`) subtracts every `absent` presence.
- Reproduced with the real helper: `effectiveFilledSpots(1, [{1, absent}, {2, present}])` = 0.
- Outside edit mode the two lists describe the same students, so nothing is wrong there.

**Classification:** rule 5 is right and has no criterion for edit mode, where the list and the presences diverge
(type 1, missing criterion).

**Drift check:** the business spec `calendar.coach-views-and-manages-schedule` says nothing about counts in edit mode.
No drift.

**iOS:** fixed in #487 (PAD-474), which counts only the presences of the draft's students (`presencesOfParticipants`).

### Change Plan

1. `calendar.event-detail` rule 5: one sentence saying that while editing, the count is over the draft's students
   and only their declines are subtracted; plus a criterion.
2. `@levelup/config` `effectiveFilledSpotsOf(participants, presences)` with unit tests, red first.
3. Use it at both web sites. A source test pins both call sites.

### Resolution

- Spec: `calendar.event-detail` rule 5 gains the edit-mode sentence and a criterion.
- Tests: `packages/config/src/capacity.test.ts` (`effectiveFilledSpotsOf`, red first: 0 instead of 1, and 1 instead of 2) and `apps/web/src/components/calendar/ClassDetailSheet.count.test.ts` (both call sites, red first).
- Code: `effectiveFilledSpotsOf` in `@levelup/config`, used at both `ClassDetailSheet` count sites. PR #490.
- Not affected: `CalendarPage.tsx:312` counts the saved instance, whose `participants` are built from its own `presences` (`serializers/lesson.py:197-203`), so the two cannot diverge there.
