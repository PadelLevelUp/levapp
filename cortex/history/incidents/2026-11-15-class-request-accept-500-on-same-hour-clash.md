---
about: Accepting a class request answered 500 when the same-hour refusal fired
permanence: stable
verified: "2026-11-15 (observed)"
origin:
  - commit:e34d14967
need:
  - backend/padel_app/services/class_request_service.py
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/modules/frontend_api.py
aliases:
  - B-729
  - B-729-class-request-accept-500-on-same-hour-clash
---

# B-729 — Accepting a class request answers 500 when the same-hour refusal fires

**Source:** the promotion gate's caveats (2026-11-15). Confirmed on `origin/staging` b6d320ae6 with a
test that reaches the refusal through both routes.

**What happened:** `POST /api/app/class-requests/<id>/accept` (the coach) and
`POST /api/app/class-requests/<id>/accept-proposal` (the student) create the class through
`lesson_service.add_class_service`. Its same-hour check (`classes.instance-enrollment` rule 15) raises
`BusySameHourError`, and nothing on either path catches it. The coach or the student gets a 500.

**What should happen:** the same `409 {code: "busy_same_hour", message, clashes}` that `/add_class`
answers. The request keeps its status and its hold, no class is created, and each screen names the clash
(`classes.class-requests` rule 4a).

**When it fired:** the accept's own slot check (rule 13, `_validated_slot` → `free_windows_for`) counts
the same going classes the same-hour check does, so a clash already present is refused `slot_taken`. The
500 needs a clash that lands between that check and the class's creation: another coach adds the
student, or the engine places them, in that window. It would also fire if the two "busy" definitions
ever drift apart.

**Root cause:** Type 1, a missing case. PAD-918 added the same-hour refusal inside `add_class_service`
and caught it only in the `/add_class` route. The class-request accept reaches the same service through
`_create_class_and_accept` and was never given the catch.

**Evidence:**
1. `lesson_service.py:1341`: `raise BusySameHourError(clashes)` inside `add_class_service`.
2. `frontend_api.py:1791`: the only `except BusySameHourError`, in `/add_class`.
3. `class_request_service.py:700`: `_create_class_and_accept` calls `add_class_service` with no catch.
   It is reached from `decide_class_request_service` (`:740`) and `answer_proposal_service` (`:613`),
   behind `frontend_api.py:2292` and `:2268`.
4. `tests/test_b729_class_request_accept_same_hour.py`, before the fix: both tests fail with
   `padel_app.services.lesson_service.BusySameHourError: busy same hour`, raised out of the route.
5. The request screens map refusals to `classRequests.refusal.<code>`, and neither locale has
   `busy_same_hour`. With `returnNull: false` (web `i18n.ts:99`, mobile `i18n.ts:173`), the 409 alone
   would show the raw key.

**Resolved (2026-11-15, `engine/b-729`, c944c5443):** `_create_class_and_accept` catches
`BusySameHourError`, rolls back and refuses `409 {code: "busy_same_hour", message, clashes}`, covering
both routes. The request screens on web and iOS show one line per clash through `@levelup/config`
`classRequestRefusalLines` (CLASSES-CLASS-REQUESTS-39 to 42). Released iOS builds that predate this
still look up `classRequests.refusal.busy_same_hour`, which they don't have.
