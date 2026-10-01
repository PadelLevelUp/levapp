---
id: B-239
title: "iOS class create and edit had no way to choose students; the web has had PlayerSelector in both"
type: incomplete-rule
severity: high
status: triaged
affects:
  - classes.create
  - classes.edit
  - frontend/apps/mobile/app/class/new.tsx
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "classes.create rule 10 and classes.edit rule 9: the coach chooses participants on create and edit, on web and iOS; port PlayerSelector to iOS and feed playerIds / addPlayers / removePlayers."
opened: 2026-10-01T18:12:54Z
---

# B-239: iOS class create and edit had no participant picker

**Source:** Linear PAD-474 (reported via Discord, 2026-09-30); the coordinator's triage on it, 2026-10-01.

**What happens:** on iOS (and Android, the same Expo screens) a coach creating a class has no field for
students, and the class is created empty. Opening an existing class and choosing Edit offers no way to
add or remove a student either. The only iOS route is the reverse one: player profile → "Adicionar a
aulas" (`AddToClassesDialog`).

**What should happen:** the same as the web. `AddClassSheet` (create) and `ClassDetailSheet` (edit)
both render `PlayerSelector`.

**Root cause (observed in source on origin/staging `439ae2088`):**
- `frontend/apps/mobile/app/class/new.tsx:274` hardcodes `playerIds: [] as string[]`. It has done so since
  `d1ff30d71` (2026-07-04), the first mobile build. The screen renders no picker.
- `frontend/apps/mobile/src/features/calendar/edit-class-diff.ts` exports `diffParticipants`, but nothing calls
  it. `app/class/[id].tsx` never reads or writes `draft.participants`, so the existing `addPlayers` branch in
  `commitEdit` is unreachable from the edit UI.
- Spec layer: `classes.create` rule 5 says players are linked through the junction table (the data), and
  `classes.create` rule 9 already describes a form choice "on web and iOS". But no rule in `classes.create` or
  `classes.edit` says the coach CHOOSES participants in the form, on either shell. The port followed the
  spec and the spec was silent, so the gap is an incomplete rule (type 2), not a code bug against a
  criterion.

**Not reproduced on the simulator at filing:** the absence is a missing control, read off the source. The
evidence is the hardcoded empty list and the zero callers. Maestro flows 125/126 will show the control
present.

**Drift check:** the business spec `classes.coach-schedules-recurring-classes` puts enrolment out of scope
and points to `classes.coach-runs-class-occurrences`. Neither business spec contradicts the dev layer. No
drift.

**Affected specs:**
- Dev: `.specflow/specs/classes/create.spec.md`, `.specflow/specs/classes/edit.spec.md`
- Business: none changed

### Change Plan

**Change type:** add a rule and criteria to each of two specs.
1. `classes.create` rule 10: participants are chosen in the create form, on web and iOS. It points to
   `calendar.student-blockers` rule 9 (the PAD-107 warning before saving). There is no eligibility check
   on create and no client cap at `maxPlayers`, the same as the web.
2. `classes.edit` rule 9: participants are added or removed in the edit form, on web and iOS, as
   `addPlayers`/`removePlayers`. It points to `eligibility.enforcement` rule 7d (warn on added students) and
   to rule 3's scope. A participants-only edit is a change.
3. Correct the stale `calendar.student-blockers` note that says `/notify/availability_conflicts` never landed
   (it is at `backend/padel_app/modules/notification_engine_api.py:294`).
4. Tests: a unit test, red first, that a participants-only edit yields a non-empty change set; a test that
   ids normalise; picker filter logic tests; Maestro flows 125 (create with a student) and 126 (edit
   add/remove).
5. Code: an RN `PlayerSelector` in `src/features/calendar/`, wired into `new.tsx` (with the PAD-107 warning)
   and `[id].tsx` edit mode.

### Resolution

(Filled in when PAD-474 lands.)
