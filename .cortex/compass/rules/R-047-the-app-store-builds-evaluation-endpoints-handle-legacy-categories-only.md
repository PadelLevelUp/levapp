---
id: R-047
title: "The five evaluation endpoints the App Store builds call handle legacy categories only, whatever the client sends"
source:
  - ../../archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
governs:
  - "backend/padel_app/modules/frontend_api.py"
  - "backend/padel_app/services/coach_service.py"
  - "backend/padel_app/services/player_service.py"
  - "backend/padel_app/services/evaluation_record_service.py"
check:
  kind: grep
  pattern: "evaluation_categories|add_evaluation_entry|player_profile|add_evaluation_categories|delete/evaluation_category"
confidence: MEASURED
status: active
---

# R-047 — The five evaluation endpoints the App Store builds call handle legacy categories only, whatever the client sends

Number from Session-B's reserved range, confirmed by the Coordinator (2026-09-21), who also read the wording.

App Store iOS 1.0 (build 3) and 1.1.0 (build 4) call production and cannot be changed. They
offer every category `GET /api/app/evaluation_categories` returns, post a value for **each** of
them on every save — a never-scored one at the scale midpoint — match categories to scores by
name, and call `parseISO(evaluatedAt)` unguarded, reading it as device-local time. A competency
they can see is a competency they fill with scores nobody gave. The spec is
`evaluations.legacy-client-contract`; what those builds send and parse is pinned by
`backend/padel_app/tests/test_pad362_evaluation_contract.py`.

A **legacy category** is an `evaluation_categories` row with `competency_group IS NULL`. Every
other row — catalogue or custom — is a non-legacy competency.

1. **Five endpoints are frozen, by name:** `GET /api/app/evaluation_categories`,
   `POST /api/app/add_evaluation_entry`, `GET /api/app/player_profile/<id>` (its
   `evaluations[]`), `POST /api/app/add_evaluation_categories`,
   `POST /api/app/delete/evaluation_category`. Their request and response shapes do not change
   while either build is in use.
2. **The freeze is by endpoint, never by header.** These five answer the same whatever
   `X-LevApp-Capabilities` a client declares. A capability token fails open the day a shell
   forgets to declare it or an old build is given the header by a proxy; an endpoint a client
   has never heard of cannot be reached by it. New clients get non-legacy competencies through
   new endpoints only. Do not "simplify" by teaching one of the five to serve both kinds behind
   a flag, a header, a query parameter or a version field.
3. **They list, return, accept, upsert and delete legacy categories only.**
   - List: legacy **and active**. Never a non-legacy row, never a switched-off one.
   - Accept: a score for a category that is non-legacy, switched off, unknown, or another
     coach's is **ignored with the same 200** — no entry, no record, no error, `evaluatedAt`
     unmoved. Never answer it with a 4xx: those builds turn any non-2xx into "save failed" for
     the whole form.
   - Return: `evaluations[]` holds legacy categories only, each item exactly `categoryId`,
     `categoryName`, `score`, `scaleMin`, `scaleMax`, `evaluatedAt`.
   - Upsert: a name that collides with a non-legacy competency **or with a switched-off legacy
     category** is skipped — no insert, no update, no reactivation — and the body is echoed.
   - Delete: a non-legacy id is refused (403).
4. **`evaluatedAt` is never null and stays naive ISO** — no `Z`, no offset; microseconds on rows
   written through the API, `T00:00:00` on imported rows. A null throws on render in those
   builds; a zone suffix shifts every date they show. Do not route this field through a
   serializer that normalises datetimes.
5. **Two server rules outlive those builds:** `value: null` writes nothing; a value equal to the
   category's latest score for that coach–player writes nothing and does not move
   `evaluatedAt`. They are what makes a post-everything save harmless for categories that
   already hold a score.
6. **Defects pinned on these endpoints are not tidied there.** B-125 (a rename through the
   name-keyed upsert inserts a new category), B-126 (no server range check), B-136 / PAD-367
   (the shared form layer reads a falsy value as "not sent") and the non-atomic save are what
   those builds were written against. A range check could start refusing their midpoint body; a
   falsy fix changes what they store. Each is resolved on the **new** endpoints
   (`evaluations.records`, `evaluations.competencies`). Changing one on a frozen endpoint is a
   compatibility decision with its own ticket and an App Store compat audit — never a drive-by.
7. **Proof is a 2×2, and it stays in the suite:** (a request shaped like an App Store build on
   the five endpoints / the new endpoints) × (non-legacy competencies exist for the coach / none
   exist). With them, the old-shaped client neither sees nor writes a row — in particular not a
   midpoint row — into a non-legacy competency; without them, PAD-362's pins pass unchanged.
   Tests: `backend/padel_app/tests/test_pad363_legacy_freeze.py`. A change to any governed handler that touches evaluations re-runs both
   files; a change that needs a pin edited is a change to this rule, reviewed as one.
8. **Retirement is one deliberate act, resting on a measurement of use and the owner's word.**
   Once the new clients have shipped, no current client calls `GET /api/app/evaluation_categories`,
   `POST /api/app/add_evaluation_entry`, `POST /api/app/add_evaluation_categories` or
   `POST /api/app/delete/evaluation_category` (the new UI is tested to call none of them; only
   `GET /api/app/player_profile/<id>` stays shared, for strengths and weaknesses). So any request
   to one of those four paths comes from an old build, and plain path-level production request
   logs can answer the question without knowing which headers were sent. When those logs show
   **no request to any of the four over a stated window** (name the window and the log source in
   the PR), **and the owner decides so**, the five may be opened or removed in a single change
   that retires this rule in the same PR. The upload-time build pins tell you what those builds
   send; they are not evidence that nobody runs them. If the logs cannot be read for a long
   enough window, the owner's decision alone retires the rule — never an inference.
