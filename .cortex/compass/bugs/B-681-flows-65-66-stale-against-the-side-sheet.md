---
id: B-681
title: "Maestro flows 65 and 66 wait for a status that only appears after the academy side sheet, which PAD-672 slice 1 put in front of both actions"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/mobile/.maestro/flows/65-academy-class-request.yaml
  - frontend/apps/mobile/.maestro/flows/66-academy-class-waitlist.yaml
proposed_fix: "Answer the side sheet in both flows (wait for class-side-sheet, tap class-side-left, tap class-side-send), and in 65 check the stored side through the student's request list."
opened: 2026-10-23T00:07:57Z
resolved: 2026-10-23T15:48:41Z
---

# B-681: flows 65 and 66 are stale against the academy side sheet

**Source:** Session H, promotion 19's gate (2026-10-22 night). Linear PAD-748.

**What happens:** at promotion 19's head `1ec24fd71`, both flows fail on their status wait, twice
each: 65 on `academy-class-status-requested`, 66 on `academy-class-status-waitlist`. Both pass on
prod main `5c29be542`.

**What should happen:** the flows answer the side sheet, and the status appears.

**Root cause:** #793 (PAD-672 slice 1, `classes.join-requests` rule 20) opens `ClassSideSheet` in
front of the academy step's "Send request" and "Join the waiting list" (`AcademyClassStep.tsx`,
`setSideFor`). The request or join is only made when the sheet's `class-side-send` is pressed, and
neither flow pressed it. H's probe copy of 66 with the three sheet steps passed 57/0 at
`1ec24fd71`, so the product works and the flows were stale. No other flow taps these two actions in
the UI: 67, 111 and 112 make their requests through the API.

**Found while fixing:** the academy list's `myJoinRequest` carries only `{id, status}`
(`academy_class_service.py`). The stored side (`left` in the DB, `side: 'left'` in the POST
response) is read from `GET /app/class-join-requests` instead. That isn't a defect, since no rule
puts the side on the academy row.

### Change plan (applied)

**Tests:**
- 65 and 66 wait for `class-side-sheet`, tap `class-side-left` explicitly (the seeded profile side
  is `right`, pre-selected as "Usual"), then tap `class-side-send`.
- 65 also asserts that the stored side is `left`.

No spec, rule or product change.

### Resolution

- Spec changes: none.
- Tests: flows 65 and 66. Runs at staging 01125fb09 plus the fix, fresh DB at `7a294b4a5a9c (head)`: 65 68/0/4 (clean) and 61 COMPLETED with 1 FAILED inside login.yaml's retry (the first launch after a Metro restart took the clearState branch; exit 0); 66 63/0/4 twice. All four exit 0.
- Resolved: 2026-10-23 (PAD-748 PR into staging).
