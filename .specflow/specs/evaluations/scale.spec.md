---
id: evaluations.scale
status: implemented
depends_on: [evaluations.competencies, evaluations.records, evaluations.evolution, evaluations.reminders, evaluations.legacy-client-contract]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: [R-047, R-048]
---

# evaluations.scale

### Intent

A coach chooses the scale they evaluate on (1–5, 1–10, 1–20 or 1–100) and can change it later,
without any existing score changing meaning. Partly reverses PAD-403's "1–5 stars everywhere"
(decision `2026-09-25-evaluation-scale-per-coach`, D147; PAD-423).

### Entities

- **READS:** NotificationConfig (the coach's scale), EvaluationCategory, EvaluationEntry
- **WRITES:** NotificationConfig (`evaluation_scale_max`), EvaluationCategory (`scale_min`,
  `scale_max` of the coach's non-legacy competencies), EvaluationEntry (`scale_min`,
  `scale_max`: the scale a score was given on)

### Rules

1. **The coach's scale.** `NotificationConfig.evaluation_scale_max` is one of 5, 10, 20, 100
   (the minimum is always 1), default 5, so nothing changes for a coach who never sets it.
   `GET/PUT /api/app/evaluation_scale` carries it as `{scaleMax}`; any other value (a string, a
   bool, null, absent) is **400** `invalid_scale`, and nothing is written. A GET never creates the
   coach's config row. It is a sibling of `evaluation_settings`, not a field on it, so PAD-404's
   exact `{reminder, everyN}` contract is unchanged and each setting saves on its own.
2. **Where it applies.** The coach's scale is the scale of every one of their **non-legacy**
   competencies (catalogue and custom, `evaluations.competencies`; non-legacy means
   `competency_group IS NOT NULL`, `EvaluationCategory.is_legacy` is false), active or not. Setting it
   updates their `scale_min`/`scale_max` in the same transaction; a competency created later is
   created on it. **Legacy categories keep their own scale, and the five R-047-frozen endpoints
   do not change in any way.**
3. **Each score keeps the scale it was given on.** `EvaluationEntry.scale_min`/`scale_max` are
   written on every save from the competency's scale at that moment. The migration adds them
   (guarded, idempotent: memory prod-schema-drift) and backfills every existing entry from its
   competency; an entry whose competency is gone keeps NULL and is read as 1–5. **No score is
   ever rewritten when the scale changes.** Re-scoring an existing entry writes the new score on
   the competency's current scale and updates the entry's snapshot with it.
4. **Validation.** A score is valid when `scale_min ≤ score ≤ scale_max` of the competency's
   **current** scale (`evaluations.records`'s existing check), else **400** `score_out_of_range`
   and nothing in the request is written. Whole numbers only.
5. **Figures on the current scale, on the server (R-048).** Wherever scores are combined (the
   class panel's and profile's means, the evolution series, its m1/m6/m12 means and change), each
   score is first placed on the competency's **current** scale by proportion:
   `v' = cmin + (v − smin) × (cmax − cmin) / (smax − smin)` (a 1–5 score of 4 is 7.75 on 1–10).
   The server sends the figures on the current scale with `scaleMin`/`scaleMax`; clients draw
   them and never recompute (R-048).
6. **Showing a single score** (history, a shared evaluation card, the student's evaluations) is
   the score on **its own** scale: "4/5" stays "4/5" after the coach moves to 1–10, beside a
   new "7/10". Each rating in those payloads carries the entry's own `scaleMin`/`scaleMax`.
7. **Input.** A competency on 1–5 is rated with the five stars, exactly as today. On 1–10, 1–20
   or 1–100 it is rated with a **slider**, whole steps from 1 to the maximum, showing the value
   ("7/10") beside it; an unrated competency's slider shows no value until touched. Web: the
   shadcn `ui/slider`; iOS: `@react-native-community/slider` (Expo SDK 54's bundled 5.0.1,
   autolinked by prebuild; no dev-client change). A slider drag is ONE input: the save fires
   once on release, like the stars' tap (`evaluations.records`'s one-request-per-input rule).
   Legacy categories keep 1–5 and their stars (every legacy category is 1–5 since PAD-403).
8. **The setting.** In Settings → Evaluations, beside "Frequência de avaliações", on web and
   iOS: "Escala de avaliações" with 1–5, 1–10, 1–20, 1–100. Changing it saves at once (like the
   frequency) and says that existing evaluations keep their own scale.
9. **Old clients (compat).** App Store 1.0 and 1.1.0 call only the five frozen endpoints
   (R-047), which serve legacy categories only, so a coach's scale never reaches them. Builds
   23–25 (1.2.0) use the current endpoints and draw a competency that is not 1–5 with the
   dormant `ScoreStepper`, bounds from the payload (`origin/main` `ac5b4f844`,
   `evaluation-form.tsx:109-115`, the source line those builds were archived from; each build's
   exact commit is pinned by the xcarchive/upload-time method, memory app-store-client-compat-
   audit, in the plan's compat task), so they can still rate, by taps: on 1–100 that is up to 99
   taps per competency. No capability token is needed: nothing an old client draws is wrong, only
   slower to use (D147 accepts that). The first iOS build with the slider retires that fallback
   for its users.

### Acceptance Criteria

#### A new coach evaluates on 1–5 stars, as today
- **Given** a coach who never set a scale
- **When** they GET `/api/app/evaluation_scale` and open a player's evaluation form
- **Then** `scaleMax` is 5 and every non-legacy competency is rated with five stars

#### Moving to 1–10 keeps every existing score's meaning
- **Given** a coach on 1–5 whose player has Bandeja rated 4 on 2026-09-01
- **When** they PUT `{scaleMax: 10}`
- **Then** Bandeja's scale is 1–10, the 2026-09-01 entry still reads 4 on 1–5 (history "4/5"),
  and a new rating of 7 is stored as 7 on 1–10 (history "7/10")
- **And** the profile mean for Bandeja is (7.75 + 7) / 2 = 7.375 on 1–10

#### The scale is one of four
- **When** a coach PUTs `{scaleMax: 7}`
- **Then** the response is 400 `invalid_scale` and the coach's scale is unchanged

#### A score outside the current scale is refused
- **Given** a coach on 1–10
- **When** they save 11 for a competency
- **Then** the response is 400 `score_out_of_range` and nothing is written

#### The slider is one input
- **Given** a coach on 1–20 with a player's form open
- **When** they drag a competency's slider from 1 to 14 and release
- **Then** exactly one save request is sent, with score 14, and the value reads "14/20"

#### Legacy is untouched
- **Given** a coach with a legacy category (1–5, since PAD-403) and catalogue competencies on 1–5
- **When** they set their scale to 20
- **Then** the catalogue competencies are 1–20, the legacy category stays 1–5 with its stars,
  and the five R-047 endpoints answer exactly as before

#### The backfill gives every existing entry its competency's scale
- **Given** a database with entries on 1–5 competencies and on a legacy (1–5) category
- **When** the migration runs, and runs again
- **Then** each entry's `scale_min`/`scale_max` equal its competency's, the second run changes
  nothing, and no `score` changes

#### Web and iOS both offer the setting and the slider
- **Given** a coach on web and on iOS
- **When** they set "Escala de avaliações" to 1–100 in Settings → Evaluations
- **Then** both shells show a slider (1–100) for their competencies in the evaluation form

### Notes

- Evolution's chart axis runs on the current scale (rule 5); `evaluations.evolution` rule 10 is
  amended to say so.
- **Bulk import is unchanged.** It creates LEGACY categories (no `competency_group`), pinned to
  1–5 (`legacy-conversion` rule 5, `import_service.py:205-216`), so they keep their stars, are
  untouched by the coach's scale (rule 2), and stay visible to App Store 1.0/1.1.0 (the frozen
  GET lists legacy only). Their entries snapshot 1–5 (rule 3).
- **PAD-403's guard is narrowed, not dropped.** `test_pad403_no_category_is_1_10.py`'s
  `NOT_1_5` counts every category; once a coach picks 1–10, non-legacy categories are legitimately
  off 1–5. It becomes a legacy-only count (`competency_group IS NULL`), and its four tests stay.
- Rule 3's "competency gone → NULL" is defensive: entries cascade with their category (PAD-274),
  so it should not occur.
