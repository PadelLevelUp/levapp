---
id: B-186
title: "A competency created from the class panel's manager did not appear in the open form until a reload"
type: missing-criterion
severity: high
status: resolved
affects:
  - evaluations.competencies
  - frontend/packages/hooks/src/evaluations.ts
proposed_fix: "Every competency mutation's re-list also invalidates queryKeys.classEvaluations() (the prefix), so an open class panel re-reads its competency list; a rule-12 criterion for the class panel, pinned by a hooks unit test and E2E US-376e."
opened: 2026-09-24T18:27:29Z
resolved: 2026-09-25T14:52:34Z
---

# B-186: a competency change left the open class panel stale

**Source:** PAD-422, a coach's report. They were in class, about to evaluate a player, and added a competency. The new one did not appear until they refreshed the website.

**What happens:** `useCompetencyCache().relist` invalidated only `queryKeys.evaluationCompetencies`. The player drawer reads that key, so it updated. The class evaluation panel builds each row's form from **the class read's own `competencies`** (`classRowCompetencies(read.data.competencies, …)`, stored under `queryKeys.classEvaluations(ref)`), and no competency mutation marked that key stale. So a competency created, switched on, renamed, switched off or deleted from the panel's "Gerir competências" never reached the form open underneath. iOS's `class-evaluations-screen.tsx` uses the same `@levelup/hooks`, so it had the same gap.

**What should happen:** "applies when made" (rule 12) covers every evaluation surface already open.

**Root cause:** Type 1, a missing criterion. Rule 12's only criterion covered the *player page* and the *next* form. Nothing covered a class panel already open, and the hooks' own comment ("every evaluation form shows the same set") assumed a single key.

**Evidence (Phase 1, 2026-09-25):**
- **Hooks unit test** (`competencyCache.test.tsx`, jsdom, with a class read cached as fresh): on staging `86a9ab42f`, all four mutations leave it un-invalidated (4 failed, "expected false to be true"). The pre-mutation precondition passed.
- **E2E US-376e** (`class-evaluations.spec.ts`), with today's class, E2E Student's form open, the panel's manager, a custom competency created and "Concluído" pressed: on staging it fails at the last line only. `evaluation-row-3` is not in the still-open form, and the POST returned 201.
- The subagent's first data-flow map traced the legacy `EvaluationCategoriesSection`/`AddEvaluationSheet`, which are no longer imported. It was discarded, and the live path was traced by hand.

### Change Plan (Type 1)
1. `evaluations.competencies`: rule 12 gains "includes every evaluation surface already open…", plus the criterion "A competency created from the class panel appears in its open form".
2. Red first: the hooks unit test (4 mutations) and E2E US-376e.
3. `packages/hooks/src/evaluations.ts`: `relist` also invalidates `queryKeys.classEvaluations()` (the prefix; every class read). One shared hook covers web and iOS.
4. Run `evaluation-tools/` E2E, the full `npm test`, and tsc.

### Resolution
- **Spec changes:** `evaluations.competencies` rule 12 covers surfaces already open, plus the new class-panel criterion.
- **Tests added:**
  - `packages/hooks/src/competencyCache.test.tsx`: 4 cells, one per mutation. All 4 are red on staging and green with the fix.
  - E2E `class-evaluations.spec.ts` US-376e: red on staging at its last line, green with the fix.
- **Code changes:** `useCompetencyCache().relist` also invalidates `queryKeys.classEvaluations()`. It lives in `@levelup/hooks`, which web and iOS share.
- **Regression:** `evaluation-tools/` 23/24.
  - The miss is `player-notes` US-44, which timed out in the login helper (`waitForURL` off `/auth`) with the load average around 390. Login is not on this change's path.
  - US-376d's intermittent failure predates this change: it also failed at `4732da3d9`, and its trace shows the page makes no competency request.
- **Resolved:** 2026-09-25T14:52:34Z, commit `1a58ac94e` (PAD-422).
