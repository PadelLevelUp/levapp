---
id: B-177
title: "Web Presences: the validation queue can show stale state after two quick undos (last-resolved response wins)"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - attendance.validation
  - frontend/apps/web/src/pages/PresencesPage.tsx
proposed_fix: "Add a rule that the queue always reflects the latest issued request; guard loadQueue with a request sequence (or move it onto TanStack Query as iOS does); pin with an E2E cell that holds the first of two undo responses."
opened: 2026-09-23T09:25:58Z
---

# B-177 — two quick undos can leave a reopened class shown as validated (PAD-413)

**Source:** found by Session-B while diagnosing B-176 (PAD-412).

**What happens:** on **Presenças → Validar aulas**, a coach undoes two validated classes in quick
succession. Each undo button is disabled only for its own class, so this is possible. If the
first undo's queue response resolves after the second's, the page shows **one** class back and
the other still under "validated this week", while the server has **both** reopened. It stays
that way until the next action or a reload.

**What should happen:** the queue shows the server's state after the latest action, whatever
order the responses resolve in.

**Root cause:** `attendance.validation` has no rule about the queue's consistency when refreshes
overlap. The code follows the gap: `PresencesPage.loadQueue` (`PresencesPage.tsx:104-124`) calls
`setQueue(list)` whenever its own response resolves, so the last response to *resolve* wins,
not the last one *issued*. The bulk run, validate and undo all call it (:198, :217).

**Evidence (Phase 1, directed trigger, staging `8dc17185d`, isolated stack, 2026-09-23):**
- The probe clicks undo twice in quick succession. It fetches the first undo's list at once, so
  the server answers with the state after one undo, and delivers it 3 s late.
- Repeat 1: the cards went **2 → 1** when the held response landed (t+5 s), and stayed at 1 at
  t+7 s.
- Repeat 2: no regression. The first request had reached the server after the second undo was
  written.
- A trigger that delayed the *request* instead of the response could not reproduce it, which is
  expected.
- **iOS** (`features/presences/hooks.ts:51/63`) uses TanStack Query, which replaces an in-flight
  fetch on refetch. So iOS is very likely immune. That is read from the code, not probed.

**Affected specs:**
- Dev: `attendance.validation`.
- Business: `coach-finalizes-attendance-records`. It is unaffected, since the outcome is right
  and only the presentation lags.

### Change Plan (Type 2: incomplete rule)
**Add to `attendance.validation`:** "The validation queue shows the server's state after the
latest action. A refresh issued earlier never replaces one issued later, whatever order their
responses arrive in."
**Criterion:**
- **Given** three validated classes,
- **When** the coach undoes two of them in quick succession and the first undo's refresh
  answers last,
- **Then** both classes show in the queue and neither shows under "validated this week".

Then:
1. Write the E2E cell (the directed trigger above) and watch it fail.
2. Guard `loadQueue` with a request sequence, or move it onto TanStack Query.
3. Run the cell green, then the presences regression.
4. Confirm iOS with the same two-undo journey.

### Resolution
[Open. Ticket PAD-413, next wave.]
