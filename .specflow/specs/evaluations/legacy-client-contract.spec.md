---
id: evaluations.legacy-client-contract
status: implemented
depends_on: [evaluations.categories, evaluations.entries]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: [R-047]
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.legacy-client-contract

### Intent
App Store iOS 1.0 (build 3) and 1.1.0 (build 4) call production and can never be changed. They
list every category the server returns and post a value for each one, unrated ones at the scale
midpoint. This leaf freezes the five endpoints they call so that the new competencies
(`evaluations.competencies`) are invisible and unwritable to them, and so that nothing they
already do changes. It is governed by compass rule **R-047**.

Vocabulary: a **legacy category** is an `evaluation_categories` row whose `competency_group IS
NULL` — everything created by the old settings editor, by these endpoints or by the import. Every
other row is a **non-legacy competency** (catalogue or custom, `evaluations.competencies`).

### Entities
- **READS:** EvaluationCategory (`competency_group`, `is_active` — columns specified in
  `evaluations.competencies`), EvaluationEntry, Association_CoachPlayer (the roster),
  CoachPlayerNote (strengths, weaknesses).
- **WRITES:** EvaluationEntry and EvaluationRecord, only through `evaluation_record_service`
  (`evaluations.records` rule 12); EvaluationCategory (legacy rows only); DeletionAudit (PAD-274).

### Rules
1. **The freeze is by endpoint, not by capability token (build default Q24).** The five endpoints
   below keep their request and response shape and handle legacy categories only —
   **unconditionally, whatever headers the client sends.** Declaring `X-LevApp-Capabilities:
   evaluations` on them changes nothing. New clients reach non-legacy competencies only through
   the new endpoints (`evaluations.competencies`, `evaluations.records`); a client that does not
   know those endpoints cannot reach a non-legacy competency at all. A catalogue competency is a
   row created only when a coach switches it on, so an unused one exists for no client.

   | Endpoint (all `/api/app`, JWT, `require_coach()`) | Shape that stays | Server-side behaviour |
   |---|---|---|
   | `GET /evaluation_categories` | `[{id:int, name, scaleMin, scaleMax}]` | lists legacy categories that are active; never a non-legacy row, never a switched-off one |
   | `POST /add_evaluation_entry` | `{playerId, scores:[{categoryId, value}], strengths, weaknesses}` → `{status:"ok", playerId}` | rule 3 |
   | `GET /player_profile/<id>` | `{playerId:str, evaluations:[…], strengths:[{id,text}], weaknesses:[{id,text}]}` | rule 4 |
   | `POST /add_evaluation_categories` | `[{name, scaleMin, scaleMax}]` → echoes the body | rule 5 |
   | `POST /delete/evaluation_category` | `{id}` → `{status}` | rule 6 |
2. **Listing.** `GET /evaluation_categories` returns the coach's rows with `competency_group IS
   NULL AND is_active`. A legacy category a coach switched off in the new editor disappears from
   the old builds' form; its scores stay (rule 4 still returns them).
3. **Accepting scores.** `POST /add_evaluation_entry` keeps `evaluations.entries` rule 7 in the
   legacy handler, in front of the record service, and these two server rules **must outlive
   those builds** — they are what keeps a save that posts every category harmless:
   - `value: null` → nothing is written;
   - a value equal to the category's latest score for that coach–player → nothing is written, and
     `evaluatedAt` does not move.
   A score posted for a non-legacy `categoryId` is **ignored with the same 200 response** — no
   entry, no record, no error. So is a score for a `categoryId` that does not exist or that
   belongs to another coach (`evaluations.entries` rule 8, B-145, PAD-370): before that fix an
   unknown id failed the save after earlier scores of the body had been kept, and another coach's
   id wrote a cross-coach row. Both builds only turn a non-2xx into a "save failed" toast, and a
   build holding a category deleted on another device sends an unknown id on every save, so
   ignoring is strictly kinder to them. **So is a score for a legacy category the coach has
   switched off** (`is_active` false): a build holding a list fetched before the switch-off still
   posts its midpoint (or a real grade) for it, and a switched-off category must not collect
   scores nobody chose to give there — ignored with the same 200, no entry, its `evaluatedAt`
   unmoved (Coordinator ruling, 2026-09-21). Every accepted score is written through
   `evaluation_record_service` into the day's class-less record with `evaluated_at = utcnow`
   (`evaluations.records` rules 2 and 12). Strengths and weaknesses keep travelling in this call.
4. **Returning scores.** `evaluations[]` in `GET /player_profile/<id>` holds the latest entry per
   **legacy** category and never an item for a non-legacy competency, whoever wrote it. Each item
   carries exactly `categoryId`, `categoryName`, `score`, `scaleMin`, `scaleMax`, `evaluatedAt`.
   `evaluatedAt` is never null and keeps exactly today's format: **naive ISO, no `Z`, no offset** —
   microseconds on rows written through the API (`2026-09-21T18:04:11.532871`), `T00:00:00` on
   imported rows (`2026-03-02T00:00:00`). Both builds call `parseISO(evaluatedAt)` unguarded and
   read it as device-local; a null throws on render and a zone suffix would shift every date they
   show. Every writer stamps `evaluated_at` as naive UTC, so the serialiser needs no branch. New
   clients also call this endpoint, for strengths and weaknesses only.
5. **Upserting.** `POST /add_evaluation_categories` stays a name-keyed upsert over the coach's
   legacy categories. It never creates, updates or collides into a non-legacy row: an item whose
   `name` equals a non-legacy competency's name is **skipped** (no insert, no update, no unique
   violation) and the response still echoes the body. **An item whose `name` equals a
   switched-off legacy category's name is skipped in exactly the same way** — no insert (it would
   hit the `(coach_id, name)` uniqueness), no update of its scale (that would silently edit a row
   the coach hid), **no reactivation**, body echoed (Coordinator ruling, 2026-09-21). Name
   matching is as the shipped upsert does it. Rows it creates are legacy (`competency_group`
   NULL, active).
6. **Deleting.** `POST /delete/evaluation_category` refuses a non-legacy id with **403**, so an old
   build cannot delete what it cannot see. For a legacy id it behaves as `evaluations.categories`
   rule 7 (cascade, one `deletion_audit` row) — **including a legacy category the coach has
   switched off**, deleted by id from a stale list: that stays allowed on purpose. Unlike a
   midpoint score it is an explicit coach act on their own category, and it is what 1.1.0 can
   already do to any legacy category; refusing it would buy symmetry with rules 3 and 5, not
   safety (Coordinator ruling, 2026-09-21). New clients delete through
   `DELETE /evaluation_competency/<id>` (`evaluations.competencies` rule 9), never through this.
7. **Pinned as-is by PAD-362 — the freeze must not "tidy" any of it:**
   - `playerId` is a **string** in `/player_profile` and is echoed **as sent** by
     `/add_evaluation_entry`;
   - a player not on the coach's roster → 404; a caller with no coach profile (a student) → 403;
   - a category absent from an upsert body is **not** deleted;
   - ~~the legacy save is **not atomic**~~ superseded by rule 10 (PAD-366, D120): every score is
     checked before any is written, so `[{Forehand: 5}, {Volley: numeric 0}]` is a 400 that
     writes nothing;
   - **B-125** — renaming through the upsert inserts a new category and leaves the old one with
     its scores (resolved for new clients by rename-by-id, `evaluations.competencies` rule 8);
   - ~~**B-126** — no server range check~~ superseded by rule 10 (PAD-366): after PAD-403 the old
     builds' midpoint is 3 on a 1–5 payload, so a range check no longer refuses their body;
   - **B-136 / PAD-367** — the shared form layer reads a falsy value as "not sent". On this
     endpoint rule 9 (the scale) and rule 10 (a score 0 is out of range, refused before the form
     layer) now decide both cases; the mechanism itself is not fixed.
8. **Retirement.** When neither 1.0 nor 1.1.0 is in use, the five endpoints may be retired or
   opened in one deliberate change; until then rules 1–7 hold whatever else ships.
9. **Legacy categories are 1–5 (PAD-403, `evaluations.legacy-conversion` rule 7, Option A).**
   After the conversion, the five endpoints serve every legacy category's stored scale, which is
   `scaleMin 1, scaleMax 5`, with the shapes of rules 2–4 unchanged. `POST /add_evaluation_categories`
   stores **and echoes** `scaleMin 1, scaleMax 5` for every item, whatever the body sends. That
   includes an item skipped under rule 5, whose stored scale is 1–5 too. So rule 5's "echoes the
   body" holds for every key except the two scale keys, and rule 7's B-136 bullet (`scaleMin: 0`
   stored as 1) no longer decides anything on this endpoint. The form-layer mechanism itself is
   still unfixed. The pins changed as an audited update under R-047 point 7: "R-047 pin update",
   commits `e9303b373` and `b6fd48408`, reviewed by Session-C.
10. **Scores are checked before any is written (PAD-366, B-126; rulings D120, D121).**
    `POST /add_evaluation_entry` works out which scores it would write (rules 3 and 8 unchanged:
    own active legacy categories only, `null` is an abstention). It checks them all before
    writing any. A value that is not a number (`"abc"`, `true`, NaN) is a 400 `score_invalid`.
    Then, **if any value is above 5**, the body comes from a form still on the old 1–10 scale:
    an App Store 1.0/1.1.0 dialog opened before PAD-403's migration refills stale scores on every
    reopen, while a 1–5 form clamps at 5. Every value in that body must lie in 0–10 and is
    converted with the migration's rule, `max(1, ceil(v / 2))`. Otherwise each value is **ceiled
    to a whole star** and must then lie in 1–5. Stored scores are whole stars. The pinned builds
    can post a non-integer (they step ±1 from `existing?.score`, `add-evaluation-form.tsx`
    :59-62, :68-71, so an imported 3.5 comes back untouched), and it must not loop on a 400.
    "Equal to latest" compares the value **as sent**, so an untouched 3.5 is not rewritten as 4. Anything else is a 400 `score_out_of_range`, and **nothing** from that body is written.
    The rule-5 "equal to latest" skip compares the converted value. The residual case is a stale
    1–10 body whose values are all ≤ 5, which is stored as stars. The conversion is retired with
    point 8. Pinned in `test_pad362_evaluation_contract.py` ("R-047 pin update, part 3").

### Touches
- `players.profile` — its rule on the profile payload must say `evaluations[]` is legacy-only
  and keeps the six keys (rule 4). The building slice (PAD-363) adds that sentence and a criterion.
- `evaluations.categories` / `evaluations.entries` — shipped behaviour; their "Planned" notes
  point here.

### Acceptance Criteria

The 2×2: (*a request shaped like an App Store build on the old endpoints* / *the new endpoints*) ×
(*non-legacy competencies exist for the coach* / *none exist*). Dataset: coach Ana; her player
Rui (player id 5); legacy categories Forehand (id 1, 1–10, Rui's latest 8) and Volley (id 2,
1–10, never scored).

#### Old endpoints, non-legacy competencies exist — they are invisible and unwritable
- **Given** Ana also holds the catalogue competency Bandeja (id 12, `technique`, 1–5) with Rui
  rated 4 on it through `PUT /evaluation_record`, and the custom competency "Saque cruzado"
  (id 13)
- **When** a client sends, with no `X-LevApp-Capabilities` header, `GET /evaluation_categories`,
  then `POST /add_evaluation_entry` with `{"playerId": "5", "scores": [{"categoryId": 1, "value":
  8}, {"categoryId": 2, "value": 6}, {"categoryId": 12, "value": 3}, {"categoryId": 13, "value":
  3}], "strengths": [], "weaknesses": []}`, then `GET /player_profile/5`
- **Then** the list is exactly `[{"id": 1, "name": "Forehand", "scaleMin": 1, "scaleMax": 10},
  {"id": 2, "name": "Volley", "scaleMin": 1, "scaleMax": 10}]`
- **And** the save answers 200 `{"status": "ok", "playerId": "5"}`; exactly one entry is written
  (Volley 6); no entry exists for id 12 or 13 with score 3 — no midpoint row reached a non-legacy
  competency — and Forehand's `evaluatedAt` did not move
- **And** `evaluations[]` has items for Forehand and Volley only; Bandeja's 4 is not in it
- **And** repeating all three calls with `X-LevApp-Capabilities: evaluations` gives the same answers

#### Old endpoints, no non-legacy competency exists — nothing changed
- **Given** Ana holds only Forehand and Volley
- **When** the five endpoints are exercised by PAD-362's pinning tests
- **Then** every pin passes unchanged: list shape, `playerId` string and echo, 404 for a roster
  miss, 403 for a student, null and equal-to-latest skips, absent-category-not-deleted, the
  non-atomic save, B-125, B-126 and B-136 as recorded in rule 7

#### New endpoints, non-legacy competencies exist — they are reachable only here
- **Given** the first criterion's competencies
- **When** Ana's current web or iOS client calls `GET /evaluation_competencies` and then
  `PUT /evaluation_record` with `{"playerId": 5, "classRef": null, "ratings": {"12": 5}}`
- **Then** `competencies` holds Forehand, Volley, Bandeja and "Saque cruzado"; the record holds
  Bandeja 5
- **And** `GET /player_profile/5` afterwards still returns no item for Bandeja

#### New endpoints, no non-legacy competency exists — legacy categories work on both sides
- **Given** Ana holds only Forehand and Volley
- **When** her current client sends `PUT /evaluation_record` with `{"playerId": 5, "classRef":
  null, "ratings": {"1": 7}}`
- **Then** the record holds Forehand 7, and `GET /player_profile/5` returns Forehand with `score`
  7 and an `evaluatedAt` matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$`

#### A colliding name is skipped by the legacy upsert (rule 5)
- **Given** Ana holds the catalogue competency Bandeja (id 12) and no legacy category of that name
- **When** a client posts `POST /add_evaluation_categories` with `[{"name": "Bandeja",
  "scaleMin": 0, "scaleMax": 10}]`
- **Then** the response is 200 echoing the body, Ana still holds exactly one row named "Bandeja",
  and its `scale_min`, `scale_max`, `competency_group` and `is_active` are unchanged

#### The legacy delete refuses a non-legacy id (rule 6)
- **Given** the catalogue competency Bandeja (id 12) with 3 scores
- **When** a client posts `POST /delete/evaluation_category` with `{"id": 12}`
- **Then** the response is 403, Bandeja and its 3 scores remain, and no `deletion_audit` row is written

#### A switched-off legacy category collects no score from a stale list (rule 3)
- **Given** Ana switched her legacy category Volley (id 2, never scored) off in the new editor,
  and an App Store build still holds the list it fetched before that
- **When** it posts `POST /add_evaluation_entry` with `{"playerId": "5", "scores": [{"categoryId":
  1, "value": 9}, {"categoryId": 2, "value": 6}], "strengths": [], "weaknesses": []}`
- **Then** the response is 200 `{"status": "ok", "playerId": "5"}`; exactly one entry is written
  (Forehand 9); no entry exists for Volley
- **And** `GET /evaluation_categories` afterwards lists Forehand only

#### The legacy upsert does not touch or revive a switched-off legacy category (rule 5)
- **Given** Ana's legacy category Volley (id 2, 1–10) is switched off
- **When** a client posts `POST /add_evaluation_categories` with `[{"name": "Volley", "scaleMin":
  1, "scaleMax": 5}]`
- **Then** the response is 200 echoing the body; Ana still holds exactly one row named "Volley";
  its `scale_max` is still 10 and `is_active` is still false; `GET /evaluation_categories` does
  not list it

#### An imported row keeps its midnight timestamp (rule 4)
- **Given** Rui's only Forehand entry was imported with `date` 2026-03-02
- **When** `GET /player_profile/5` is called
- **Then** `evaluations[0].evaluatedAt` is exactly `"2026-03-02T00:00:00"`

### Notes
- Test trap: Playwright's raw `request` helpers send only the auth header. That is irrelevant
  here by design — rule 1 makes the answer the same with or without any header — and the first
  criterion proves it both ways.
- The production counts (how many `scale_min = 0` rows B-136 has been eating) are pending; they
  bear on owner question Q1, not on this leaf.
