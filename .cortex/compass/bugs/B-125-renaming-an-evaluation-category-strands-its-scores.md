---
id: B-125
title: "Renaming an evaluation category in Settings creates a new category and strands the old one's scores"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - evaluations.categories
  - backend/padel_app/services/coach_service.py
proposed_fix: "Rename by id on the new PATCH /evaluation_competency/<id> (PAD-364). The legacy name-keyed upsert stays exactly as it is while App Store 1.0 / 1.1.0 live."
opened: 2026-09-21T18:22:40Z
---

# B-125: a rename is an insert

**Source:** read from code by Session-E (static, `docs/reference/evaluations-current-state.md` §3),
never run. Reproduced by Session-C in PAD-362 before filing. Id reserved from Session-B's range.

**What happens:** the settings editor posts the whole category list to
`POST /api/app/add_evaluation_categories` as `[{name, scaleMin, scaleMax}]` — ids are never sent —
and `upsert_evaluation_categories` matches on `(coach, name)`. A renamed category matches nothing,
so it is inserted; the row under the old name stays, with every score recorded in it.

**Evidence (origin/staging 00e53375f, 2026-09-21 18:19 UTC sqlite and 18:21 UTC Postgres,
`test_pad362_evaluation_contract.py::test_4_renaming_a_category_creates_a_new_one_and_strands_the_old_scores`):**
a coach with `Forehand` (one score, 7) and `Volley` posts `[Forehand drive, Volley]`. After the
200: the coach holds `Forehand`, `Forehand drive` and `Volley`; the score is still under
`Forehand`; `/player_profile` still shows it as `Forehand`; `Forehand drive` is empty.

**The observation that selected the type:** `evaluations.categories` rule 4 says the upsert exists
and rule 6 says it matches on the name; no rule says what a rename is. The code does what the
rules say. An incomplete rule, not a wrong implementation.

**What should happen:** renaming a category keeps its identity and its scores.

**Affected specs:** Dev `.specflow/specs/evaluations/categories.spec.md`; business
`.specflow/specs-business/evaluations/` (unchanged).

### Change Plan

**Not fixed in PAD-362, on purpose.** App Store 1.1.0 posts exactly this name-keyed body and
cannot change; making the legacy upsert guess at renames would change what that build stores.

- The fix is rename-by-id on the new `PATCH /evaluation_competency/<id>` (PAD-364, Session-B's
  decision 2026-09-21). The legacy `POST /add_evaluation_categories` stays name-keyed, and the
  PAD-362 pin keeps it that way until those builds are retired.
- Spec: PAD-362 appends a criterion stating today's behaviour; the rule for the new endpoint
  belongs to PAD-364's spec.
- Data already stranded on production (a renamed category's old twin) is not counted here.

### Resolution

_Open — resolved by PAD-364._
