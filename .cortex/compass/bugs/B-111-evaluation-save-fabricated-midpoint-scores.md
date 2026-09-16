---
id: B-111
title: "Saving an evaluation recorded a midpoint score for every category the coach never touched"
type: missing-criterion
severity: high
status: resolved
affects:
  - frontend/apps/web/src/components/players/detail/AddEvaluationSheet.tsx
  - frontend/apps/mobile/src/features/players/add-evaluation-form.tsx
  - backend/padel_app/services/coach_service.py
proposed_fix: "Open a never-scored category unrated; post only the categories whose value changed in the form; the endpoint skips null values and scores equal to the latest one."
opened: 2026-09-16T14:56:00Z
---

# B-111 — Saving an evaluation fabricated midpoint scores

**Source:** weekly QA sweep 2026-09-13 (`docs/qa/reports/2026-09-13.md`, F-1/F-2, earlier FB-5),
carried since 2026-07-21. Ticket PAD-337. Bug number from Session E's reserved range
(unconfirmed until the coordinator confirms).

**What happened:** both evaluation forms (web sheet, iOS form) seeded every category with
`existing?.score ?? midpoint` on open and posted `categories.map(...)` on save. A coach who
touched nothing, or rated one skill, persisted a midpoint grade for every other category,
indistinguishable from a real one on the API and the card. The backend wrote one entry per
posted score, so re-posting an unchanged existing score also added a history row and moved
`evaluatedAt`.

**Why the spec did not catch it:** `evaluations.entries` said what a recorded score is, never
which categories a save records. No criterion said an untouched category stays unwritten, and
the forms had no unrated state to express "not scored".

**Fix (PAD-337):** rules 6-7 of `evaluations.entries`. Forms carry an unrated state and a reset
control, and post only changed categories. The endpoint ignores null values and scores equal to
the latest. Guarded by `backend/padel_app/tests/test_pad337_evaluation_entry_abstain.py`,
`apps/web/e2e/evaluation-tools/evaluation-untouched-categories.spec.ts`, and Maestro flow 57.

**Not fixed, by decision:** midpoint rows already in the database stay. Nothing tells them from
intended scores. App Store builds released before this fix still post every category. The
endpoint neutralises that for categories with a score, but a never-scored category still gets
the old build's midpoint until the build is updated.
