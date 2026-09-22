---
id: B-158
title: "The iOS competency manager had no harness-level proof that an unsaved edit survives a new t or a list refetch"
type: missing-criterion
severity: low
status: resolved
affects:
  - evaluations.competency-manager
  - frontend/apps/mobile/src/features/evaluations/competency-manager/
  - frontend/apps/mobile/src/test/render-native.tsx
proposed_fix: "Port the deleted evaluation-categories-section harness test's shape onto the competency manager: mount the real leaves, edit, hand the tree a new t and a refetch, assert the edit survives; prove it with a [t]-dep mutant."
opened: 2026-09-22T13:30:00Z
resolved: 2026-09-22T15:28:00Z
---

# B-158 — the competency manager's missing harness proof

**Source:** the wave-3 integrator (Coordinator, 2026-09-22 ~13:25 UTC). Ticket PAD-399; id from
Session-D's range (B-157 was announced for PAD-394 the same morning).

**What happened:** the wave-3 assembly of #361 (PAD-373, deletes the iOS
`evaluation-categories-section` — the competency manager replaces it) and #375 (PAD-393, which
had added `evaluation-categories-section.test.tsx`, the harness proof that the section keeps an
unsaved edit when `t` changes identity) broke on a dead import — no conflict, mobile `tsc` and
vitest red on the assembled branch. The integrator deleted the orphaned test (the behaviour it
proved no longer existed on that component). That left the new manager as the one iOS section
without a harness-level proof against the PAD-392 / B-155 family.

**Read before writing (#361 @ 8f39740fd):** neither of the manager's effects depends on `t`
(the coach-only redirect on `[user, isCoach, router]`; the typed-name reset on
`[competency?.id]`), and the list is react-query with cache-first mutations. So the gap was a
missing PROOF, not a defect in the code: a criterion nobody had written down for the section that
replaced a tested one.

**Affected specs:**
- Dev: the evaluations competency-manager leaf (PAD-373's); the PAD-393 harness contract in
  `frontend/CLAUDE.md`.
- Business: none.

### Change Plan

Criterion: "an unsaved edit in the competency manager survives a language change and a list
refetch". Test on the PAD-393 harness, mutant beside it, no code change expected.

### Resolution

- Tests: `apps/mobile/src/features/evaluations/competency-manager/competency-manager.test.tsx`
  (4): a typed custom-competency name survives a new `t` (no create sent) and a list refetch (new
  row renders, list read exactly twice); a successful add DOES clear the field, by design
  (Session-C's caveat); a partly typed delete-confirmation name survives a new `t` (no delete
  sent). Mount: the real `CompetencyRow`, `AddCustomCompetency`, `DeleteCompetencyDialog` and
  `useEvaluationCompetencies`, wired by an in-file harness mirroring the screen's body — the
  screen's `Screen` wrapper reaches a native component the `react-native` stub lacks.
- Evidence, run by Session-D (the file was drafted by a sonnet subagent): 4/4 on the real code;
  with a scratch `React.useEffect(() => setName(""), [t])` in `add-custom-competency.tsx`, test 1
  red (`expected '' to be 'Maestro Cat'`), three green; reverted clean; tsc (CI's command) 0.
- Limits stated, not hidden: `@levelup/hooks` is shimmed — two React copies in the workspace
  (root 18.3.1, mobile 19.1.0, react-query hoisted to the root) make the real react-query hooks
  throw under react-test-renderer — filed as B-159 / PAD-400; the hooks are effect-free wrappers
  today (Session-B's #361 read). `rerender` must get a fresh element or React's props bailout
  makes it a silent no-op — documented at both call sites; a `cloneElement` guard in
  `render-native.tsx` is a PAD-393 follow-up (Session-B's #385 review).
- Code changes: none in the manager.
- Resolved: 2026-09-22 (PAD-399, PR #385).
