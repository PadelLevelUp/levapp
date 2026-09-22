---
id: B-136
title: "The form layer reads a numeric 0 as 'not sent': a 0-10 evaluation scale is stored 1-10, and a score of 0 cannot be saved"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - evaluations.categories
  - evaluations.entries
  - backend/padel_app/tools/input_tools.py
  - backend/padel_app/services/coach_service.py
  - backend/padel_app/services/import_service.py
proposed_fix: "Not on the legacy endpoints without an owner decision — it would change stored scales. PAD-364's new endpoints must not write through a path where a falsy value means 'absent'."
opened: 2026-09-21T18:22:40Z
---

# B-136: a zero that never arrives

**Source:** found by Session-C while pinning the evaluation contract (PAD-362) — a pin written
from Session-E's static map failed, and the failure was the code, not the fixture. Id from
Session-C's range (B-135–139), kept there at Session-B's request.

**What happens:** `Field.set_value` (`backend/padel_app/tools/input_tools.py`) keeps a value only
when it is truthy:

    request.form[self.name] if self.name in request.form and request.form[self.name] else None

`Integer` and `Float` fields take that branch, and `JsonRequestAdapter` does not turn JSON numbers
into strings. So a numeric `0` becomes `None` before it reaches the model, and `update_with_dict`
skips `None`.

**Evidence (origin/staging 00e53375f; sqlite 18:18–18:20 UTC, Postgres 18:21 UTC; all pinned in
`test_pad362_evaluation_contract.py`):**

| Call | Observed |
|---|---|
| `POST /add_evaluation_categories` `{name: "Smash", scaleMin: 0, scaleMax: 10}` (new) | stored **1–10**; the response echoes 0; the list then says 1 |
| same, for an existing 1–10 category with `scaleMin: 0, scaleMax: 5` | stored **1–5**: minimum ignored, maximum applied |
| import category row, `scale_min: 0` (number) | stored 1 |
| import category row, `scale_min: "0"` (string) | stored **0** |
| `POST /add_evaluation_entry` `value: 0` on a 0–10 category | `IntegrityError` — NOT NULL on `score` (`NotNullViolation` on Postgres); nothing written |
| same with `value: "0"` | 200, `0.0` written |
| `scores: [{Forehand: 5}, {Volley: 0}]` in one body | the request fails **and Forehand 5 stays written** — the save is not atomic |

Both settings editors default a new row to 0–10, so a coach who accepts the default has a 1–10
category that the editor showed as 0–10 until the list was refetched. The score half only bites
where a category really holds minimum 0 (a string from an import, the admin editor, older rows).

**Not checked:** whether the real web import and `ai_service` send numbers or strings; the HTTP
status production answers for the `IntegrityError` (the test client re-raises); how many
production categories hold `scale_min = 0`; whether other models' numeric fields are hit by the
same branch (they go through the same `set_value`, so probably — not run).

**The observation that selected the type:** `"0"` is stored and `0` is not, on the same endpoint
with the same column — that places the first wrong value at `set_value`, before any evaluation
code runs. `evaluations.categories` rule 2 says a category has a min/max scale and nothing says 0
is a legal minimum or what a falsy value means; an incomplete rule, surfaced by a form layer whose
"empty means absent" convention was written for HTML forms.

### Change Plan

**Not fixed in PAD-362, and not to be fixed on the legacy upsert without an owner decision**
(Session-B, 2026-09-21): honouring the 0 would change stored scales for every coach who re-saves
their settings, and App Store builds clamp their stepper to `scaleMin`.

- PAD-362 pins today's behaviour (four tests marked "DEFECT PINNED, NOT FIXED").
- PAD-364's new endpoints depend on falsy values meaning something — `isActive: false`,
  `sortOrder: 0`, `ratings: {id: null}`, `note: ""` — and must not write through `set_value`'s
  truthiness branch. Named as a constraint on PAD-364 by Session-B.
- A general fix to `set_value` (`is not None and != ""`) touches every model that uses the form
  layer; it needs its own ticket and its own sweep, not a line in an evaluations slice.

### Resolution

_Open — being resolved in six steps, one ticket and one PR each (children of PAD-367; design:
`docs/plans/2026-09-21-pad-367-absent-vs-present-design-note.md`). Status stays `triaged` until the
last lands._

- **Step 0 — PAD-385 (2026-09-21): the layer can tell absent from present-and-falsy; nobody uses
  it yet.** `JsonRequestAdapter(data, form, mode="present")` holds a key iff the JSON body held it;
  `Form.set_values` then answers only those keys ("" / null clear, 0 / false are values, an absent
  Boolean is left out, an empty password never clears); `update_with_dict(values, write_none=True)`
  sets a nullable column or ManyToOne to NULL and raises `NotNullableFieldError` — before anything
  is written — for one that cannot be NULL. `mode="legacy"` stays the default and is unchanged,
  proven cell by cell against a frozen copy of the old adapter. **No production caller was
  switched**: `test_pad385_adapter_call_sites.py` scans every call site and its `PRESENT` set is
  empty, so every symptom above still reproduces and every pin in
  `test_pad367_falsy_values_at_the_route.py` still passes unflipped. What the legacy characterisation
  proves (Session-B's F3): the ADAPTER is unchanged cell by cell; the setters' legacy path is pinned by
  the absolute cells, `test_input_tools.py` and the route pins, not by the frozen-copy comparison.
- **Binding for steps 1–5 (Session-B's F4/F5 on #366):** present mode writes every key it is given, so a
  step must rewrite its endpoint's payload BUILDER to copy only the keys the client sent, from a
  WHITELIST of that endpoint's editable keys — never a pass-through of the body. `calendar_blocks.user_id`
  (a nullable ManyToOne, `user`) must never be reachable from a client; `edit_player_service` emits
  `user: {name, email, phone}` with None for unchanged values and must stop; `_build_payload` invents
  `""` for title/description/recurrence_end and must stop. A 0/false into a String/Enum column is a
  dialect error, not a 400 — the route validates.
- **Step 1 — PAD-386 (2026-09-22): `PUT /calendar_block/<id>`, `PUT /availability_blockers/<id>`.** The
  edit payload is a whitelist of the nine body keys read in present mode (`_edit_block_payload`); the old
  builder's `""` inventions are gone (a coach can clear a title/description; an absent `isRecurring` leaves
  flag, rule and end alone by construction — #356's post-write patches replaced); missing/empty
  type/date/times → 400 (were 500s); a null end on a block that still recurs → 400 (D83: NULL = forever;
  drop the end by making it one-off); both edit sheets check the end before the request. The CREATE path
  keeps the legacy builder (nothing to keep). `calendar_blocks.user_id` and the PAD-93 flag unreachable, pinned.
- Step 2 — PAD-387: `POST /edit_class`. _Pending._
- Step 3 — PAD-388: `POST /edit_player` (web and iOS send null). _Pending._
- Step 4 — PAD-389: `POST /activate/user`. _Pending._
- Step 5 — PAD-390: `POST /add_class`, `POST /message`. _Pending._
- Not in this family: the frozen legacy evaluation endpoints (owner decision), attendance (B-152).
