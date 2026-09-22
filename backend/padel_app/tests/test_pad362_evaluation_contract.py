"""PAD-362 — evaluations slice 0: today's evaluation API contract, pinned.

App Store iOS 1.0 (build 3) and 1.1.0 (build 4) call these endpoints in
production and cannot change. The new evaluation system is rebuilt underneath
them, so every test here states what ships at origin/staging 00e53375f — AS IT
IS, defects included — and slice 1 is proven against it. A test that starts
failing means an old build sees something different; do not "fix" the assertion.

One section per frozen endpoint, numbered as on the ticket.
"""
import json
import re
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.evaluation_history import seed_evaluation_history
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student

ANCHOR = datetime(2026, 6, 15, 10, 30, 0)  # fixtures hang off this, never off the wall clock

# What date-fns `parseISO` gets from the old builds' `parseISO(ev.evaluatedAt)`:
# a naive timestamp, no offset and no "Z" — they read it as device-local time.
NAIVE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$")


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _seed(app):
    """One coach, one student on the roster, Forehand 1-5 and Volley 1-5 (PAD-403:
    every legacy category is converted to 1-5 stars)."""
    from padel_app.models import Association_CoachPlayer, EvaluationCategory

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"])
        forehand = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=5)
        volley = EvaluationCategory(coach_id=ids["coach_id"], name="Volley", scale_min=1, scale_max=5)
        db.session.add_all([rel, forehand, volley])
        db.session.commit()
        ids.update(rel_id=rel.id, forehand_id=forehand.id, volley_id=volley.id)
    return ids


def _other_coach(app):
    from padel_app.models import EvaluationCategory, User
    from padel_app.models.coaches import Coach

    with app.app_context():
        user = User(name="Other Coach", username="other-coach", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        category = EvaluationCategory(coach_id=coach.id, name="Serve", scale_min=1, scale_max=5)
        db.session.add(category)
        db.session.commit()
        return {"user_id": user.id, "coach_id": coach.id, "category_id": category.id}


def _coach_headers(app, ids):
    return _headers(app, ids["coach_user_id"])


def _save(app, client, ids, scores, strengths=(), weaknesses=()):
    return client.post(
        "/api/app/add_evaluation_entry",
        json={"playerId": ids["student_id"], "scores": scores,
              "strengths": list(strengths), "weaknesses": list(weaknesses)},
        headers=_coach_headers(app, ids),
    )


def _profile(app, client, ids):
    res = client.get(f"/api/app/player_profile/{ids['student_id']}", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _rows(app, ids, category_key):
    from padel_app.models import EvaluationEntry

    with app.app_context():
        rows = EvaluationEntry.query.filter_by(
            coach_player_id=ids["rel_id"], category_id=ids[category_key]
        ).order_by(EvaluationEntry.id).all()
        return [(row.score, row.evaluated_at) for row in rows]


def _history(app, ids, category_key, points):
    with app.app_context():
        seed_evaluation_history(ids["rel_id"], ids[category_key], points, anchor=ANCHOR)
        db.session.commit()


# ── 1. GET /api/app/evaluation_categories ────────────────────────────────────

def test_1_evaluation_categories_lists_exactly_id_name_scalemin_scalemax(app, client):
    ids = _seed(app)

    res = client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids))

    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, list)
    assert sorted(body, key=lambda c: c["name"]) == [
        {"id": ids["forehand_id"], "name": "Forehand", "scaleMin": 1, "scaleMax": 5},
        {"id": ids["volley_id"], "name": "Volley", "scaleMin": 1, "scaleMax": 5},
    ]
    assert all(type(c["id"]) is int for c in body), "the id is a JSON number, whatever the TS type says"


def test_1_evaluation_categories_lists_only_the_callers_own(app, client):
    ids = _seed(app)
    _other_coach(app)

    body = client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids)).get_json()

    assert sorted(c["name"] for c in body) == ["Forehand", "Volley"]


def test_1_evaluation_categories_is_coach_only(app, client):
    ids = _seed(app)

    res = client.get("/api/app/evaluation_categories", headers=_headers(app, ids["student_user_id"]))

    assert res.status_code == 403


# ── 2. GET /api/app/player_profile/<id> ──────────────────────────────────────

def test_2_player_profile_shape_is_exact(app, client):
    ids = _seed(app)
    _history(app, ids, "forehand_id", [(30, 4)])
    assert _save(app, client, ids, [], strengths=[{"id": "tmp", "text": "Fast feet"}],
                 weaknesses=["Backhand volley"]).status_code == 200

    body = _profile(app, client, ids)

    assert sorted(body) == ["evaluations", "playerId", "strengths", "weaknesses"]
    assert body["playerId"] == str(ids["student_id"]), "a string, unlike the category id"
    (evaluation,) = body["evaluations"]
    assert sorted(evaluation) == ["categoryId", "categoryName", "evaluatedAt", "scaleMax", "scaleMin", "score"]
    assert evaluation == {
        "categoryId": ids["forehand_id"], "categoryName": "Forehand", "score": 4.0,
        "scaleMin": 1, "scaleMax": 5, "evaluatedAt": "2026-05-16T10:30:00",
    }
    assert [sorted(note) for note in body["strengths"] + body["weaknesses"]] == [["id", "text"], ["id", "text"]]
    assert [note["text"] for note in body["strengths"]] == ["Fast feet"]
    assert [note["text"] for note in body["weaknesses"]] == ["Backhand volley"]
    assert all(type(note["id"]) is int for note in body["strengths"] + body["weaknesses"])


def test_2_player_profile_serves_only_the_latest_row_per_category(app, client):
    ids = _seed(app)
    _history(app, ids, "forehand_id", [(90, 2), (60, 3), (30, 5)])
    _history(app, ids, "volley_id", [(45, 2)])

    evaluations = {e["categoryName"]: e for e in _profile(app, client, ids)["evaluations"]}

    assert sorted(evaluations) == ["Forehand", "Volley"]
    assert (evaluations["Forehand"]["score"], evaluations["Forehand"]["evaluatedAt"]) == (5.0, "2026-05-16T10:30:00")
    assert evaluations["Volley"]["score"] == 2.0


def test_2_player_profile_omits_a_category_that_was_never_scored(app, client):
    """What makes the old builds' midpoint gap possible (section 3)."""
    ids = _seed(app)
    _history(app, ids, "forehand_id", [(10, 3)])

    assert [e["categoryName"] for e in _profile(app, client, ids)["evaluations"]] == ["Forehand"]


def test_2_evaluated_at_is_a_naive_iso_timestamp_for_every_kind_of_row(app, client):
    """Old builds call `parseISO(ev.evaluatedAt)` unguarded: a row that does not
    parse throws on render. Three writers: the API (utcnow, microseconds), the
    import (midnight of `date`), and the PAD-273 backfill (`created_at` copied)."""
    from padel_app.models import Coach, EvaluationCategory, EvaluationEntry
    from padel_app.services.import_service import bulk_create_evaluation_entries

    ids = _seed(app)
    with app.app_context():
        lob = EvaluationCategory(coach_id=ids["coach_id"], name="Lob", scale_min=1, scale_max=5)
        db.session.add(lob)
        db.session.commit()
        ids["lob_id"] = lob.id
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 5}]).status_code == 200
    with app.app_context():
        result = bulk_create_evaluation_entries(
            [{"player_name": "Test Student", "date": "2026-03-01", "Volley": 4}], db.session.get(Coach, ids["coach_id"]))
        assert result["imported"] == 1, result
        backfilled = EvaluationEntry(coach_player_id=ids["rel_id"], category_id=ids["lob_id"], score=2.0)
        db.session.add(backfilled)
        db.session.flush()
        backfilled.evaluated_at = backfilled.created_at or ANCHOR  # COALESCE(created_at, now())
        db.session.commit()

    evaluations = {e["categoryName"]: e["evaluatedAt"] for e in _profile(app, client, ids)["evaluations"]}

    assert sorted(evaluations) == ["Forehand", "Lob", "Volley"]
    assert evaluations["Volley"] == "2026-03-01T00:00:00"
    for name, value in evaluations.items():
        assert NAIVE_ISO.match(value), f"{name}: {value!r} is not the naive ISO shape the old builds parse"
        datetime.fromisoformat(value)


def test_2_player_profile_is_coach_only_and_roster_scoped(app, client):
    ids = _seed(app)
    other = _other_coach(app)

    as_student = client.get(f"/api/app/player_profile/{ids['student_id']}", headers=_headers(app, ids["student_user_id"]))
    as_stranger = client.get(f"/api/app/player_profile/{ids['student_id']}", headers=_headers(app, other["user_id"]))

    assert as_student.status_code == 403, "a student cannot read their own evaluations today"
    assert as_stranger.status_code == 404, "a coach without this player on the roster"


# ── 3. POST /api/app/add_evaluation_entry ────────────────────────────────────

def test_3_add_evaluation_entry_answers_status_ok_and_the_player_id_it_was_sent(app, client):
    ids = _seed(app)

    res = _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 5}])

    assert res.status_code == 200
    assert res.get_json() == {"status": "ok", "playerId": ids["student_id"]}, "echoed as sent: an int here"


def test_3_a_null_value_writes_nothing(app, client):
    ids = _seed(app)

    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": None}]).status_code == 200

    assert _rows(app, ids, "forehand_id") == []


def test_3_a_value_equal_to_the_latest_writes_nothing_and_does_not_move_evaluated_at(app, client):
    ids = _seed(app)
    _history(app, ids, "forehand_id", [(30, 5)])

    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 5}]).status_code == 200

    assert len(_rows(app, ids, "forehand_id")) == 1
    (evaluation,) = _profile(app, client, ids)["evaluations"]
    assert evaluation["evaluatedAt"] == "2026-05-16T10:30:00"


def test_3_five_three_five_is_three_rows(app, client):
    ids = _seed(app)

    for value in (5, 3, 5):
        assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": value}]).status_code == 200

    assert [score for score, _ in _rows(app, ids, "forehand_id")] == [5.0, 3.0, 5.0]


def test_3_strengths_and_weaknesses_are_add_only_and_deduped_by_text(app, client):
    ids = _seed(app)
    assert _save(app, client, ids, [], strengths=[{"id": "a", "text": "Fast feet"}], weaknesses=["Lob"]).status_code == 200

    # The same text again (object or bare string), one new one, and an empty list for weaknesses.
    assert _save(app, client, ids, [], strengths=["Fast feet", {"id": "b", "text": "Calm"}], weaknesses=[]).status_code == 200

    body = _profile(app, client, ids)
    assert [n["text"] for n in body["strengths"]] == ["Fast feet", "Calm"]
    assert [n["text"] for n in body["weaknesses"]] == ["Lob"], "an empty list removes nothing"


def test_3_an_old_build_body_is_harmless_for_scored_categories_and_writes_the_midpoint_for_unscored_ones(app, client):
    """App Store 1.0 / 1.1.0 post EVERY category: the ones the profile returned at
    their latest score, the rest at the scale midpoint, with empty note lists.
    `evaluations.entries` rule 7: the first is skipped server-side; the second is
    the known gap (PAD-351 removes it in the next build). Asserted, not fixed."""
    ids = _seed(app)
    _history(app, ids, "forehand_id", [(30, 4)])
    volley_midpoint = 3  # Math.round((1 + 5) / 2)

    res = _save(app, client, ids, [
        {"categoryId": ids["forehand_id"], "value": 4},
        {"categoryId": ids["volley_id"], "value": volley_midpoint},
    ])

    assert res.status_code == 200
    assert len(_rows(app, ids, "forehand_id")) == 1, "re-posting the latest score writes nothing"
    assert [score for score, _ in _rows(app, ids, "volley_id")] == [3.0], "the known gap: a midpoint nobody chose"

    # The same body again: now Volley holds 3, so the old build is harmless from here on.
    assert _save(app, client, ids, [
        {"categoryId": ids["forehand_id"], "value": 4},
        {"categoryId": ids["volley_id"], "value": volley_midpoint},
    ]).status_code == 200
    assert len(_rows(app, ids, "volley_id")) == 1


def test_3_the_server_enforces_no_score_range(app, client):
    """DEFECT PINNED, NOT FIXED (B-126). `evaluations.entries` rule 4 says a score
    falls within the category's scale; only the client controls enforce it. Any
    number is written, and a non-integer too."""
    ids = _seed(app)  # Volley is 1-5

    for value in (99, -3, 2.5):
        assert _save(app, client, ids, [{"categoryId": ids["volley_id"], "value": value}]).status_code == 200

    assert [score for score, _ in _rows(app, ids, "volley_id")] == [99.0, -3.0, 2.5]
    assert _profile(app, client, ids)["evaluations"][0]["score"] == 2.5, "and the profile serves it"


def test_3_a_numeric_score_of_zero_cannot_be_saved(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). JSON `0` is falsy, the form layer reads it
    as "not sent", the NOT NULL `score` column refuses the row and the request
    fails. The string "0" goes through. Reachable on any category whose minimum is
    0: the import creates those (the settings API cannot, section 4), and every
    client posts a number, so a coach who scores 0 there gets a failed save."""
    from sqlalchemy.exc import IntegrityError

    ids = _seed(app)  # Volley is 1-5

    with pytest.raises(IntegrityError):  # the test client re-raises what production answers as a 500
        _save(app, client, ids, [{"categoryId": ids["volley_id"], "value": 0}])
    with app.app_context():
        db.session.rollback()
    assert _rows(app, ids, "volley_id") == []

    assert _save(app, client, ids, [{"categoryId": ids["volley_id"], "value": "0"}]).status_code == 200
    assert [score for score, _ in _rows(app, ids, "volley_id")] == [0.0]


def test_3_a_save_is_not_atomic_the_scores_before_a_failing_one_stay_written(app, client):
    """Each score is its own commit. When one fails (here B-136's numeric 0), the
    request fails and the scores before it are already saved — which is why a
    range check must never be added to this endpoint while old builds post every
    category in one body (B-126)."""
    from sqlalchemy.exc import IntegrityError

    ids = _seed(app)

    with pytest.raises(IntegrityError):
        _save(app, client, ids, [
            {"categoryId": ids["forehand_id"], "value": 5},
            {"categoryId": ids["volley_id"], "value": 0},
        ])
    with app.app_context():
        db.session.rollback()

    assert [score for score, _ in _rows(app, ids, "forehand_id")] == [5.0]
    assert _rows(app, ids, "volley_id") == []


def test_3_add_evaluation_entry_is_coach_only_and_roster_scoped(app, client):
    ids = _seed(app)
    other = _other_coach(app)
    body = {"playerId": ids["student_id"], "scores": [{"categoryId": ids["forehand_id"], "value": 5}],
            "strengths": [], "weaknesses": []}

    as_student = client.post("/api/app/add_evaluation_entry", json=body, headers=_headers(app, ids["student_user_id"]))
    as_stranger = client.post("/api/app/add_evaluation_entry", json=body, headers=_headers(app, other["user_id"]))

    assert (as_student.status_code, as_stranger.status_code) == (403, 404)
    assert _rows(app, ids, "forehand_id") == []


# ── 4. POST /api/app/add_evaluation_categories ───────────────────────────────

def test_4_add_evaluation_categories_upserts_by_name_and_echoes_the_request(app, client):
    """evaluations.legacy-conversion rule 5: the legacy endpoint always stores and
    echoes scale_min=1, scale_max=5, whatever the request body says."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    request_body = [
        {"name": "Forehand", "scaleMin": 2, "scaleMax": 5},   # exists: same row, new scale
        {"name": "Smash", "scaleMin": 1, "scaleMax": 7},      # new
    ]

    res = client.post("/api/app/add_evaluation_categories", json=request_body, headers=_coach_headers(app, ids))

    assert res.status_code == 200
    assert res.get_json() == [
        {"name": "Forehand", "scaleMin": 1, "scaleMax": 5},
        {"name": "Smash", "scaleMin": 1, "scaleMax": 5},
    ], "the echo is always 1-5, whatever the body says; it still carries no ids: 1.1.0 refetches the list"
    with app.app_context():
        rows = {c.name: c for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).all()}
        assert sorted(rows) == ["Forehand", "Smash", "Volley"], "a category left out of the body is not deleted"
        assert rows["Forehand"].id == ids["forehand_id"]
        assert (rows["Forehand"].scale_min, rows["Forehand"].scale_max) == (1, 5)
        assert (rows["Smash"].scale_min, rows["Smash"].scale_max) == (1, 5)


def test_4_a_scale_minimum_of_zero_is_dropped_and_the_echo_hides_it(app, client):
    """B-136's mechanism is still unfixed: the form layer reads a falsy value as
    "not sent" (`input_tools.Field.set_value`). On this endpoint it no longer
    decides anything, because evaluations.legacy-conversion rule 5 (PAD-403)
    stores and echoes every legacy category at 1-5 whatever the body says. Both
    settings editors still default a new row to 0-10; that 0 is neither stored
    nor echoed. This pin asserts rule 5. Before PAD-403 it pinned the 0 echo
    against the 1 stored."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    request_body = [
        {"name": "Forehand", "scaleMin": 0, "scaleMax": 5},   # exists at 1-5
        {"name": "Smash", "scaleMin": 0, "scaleMax": 10},     # new, the editors' default
    ]

    res = client.post("/api/app/add_evaluation_categories", json=request_body, headers=_coach_headers(app, ids))

    # PAD-403 (evaluations.legacy-conversion rule 5): the upsert normalises every
    # legacy category to 1-5, so the echo no longer shows the editors' 0 either.
    assert res.get_json() == [
        {"name": "Forehand", "scaleMin": 1, "scaleMax": 5},
        {"name": "Smash", "scaleMin": 1, "scaleMax": 5},
    ], "the response says 1-5"
    with app.app_context():
        rows = {c.name: c for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).all()}
        assert (rows["Forehand"].scale_min, rows["Forehand"].scale_max) == (1, 5), "stored 1-5"
        assert (rows["Smash"].scale_min, rows["Smash"].scale_max) == (1, 5), "stored 1-5"
    listed = {c["name"]: c for c in client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids)).get_json()}
    assert listed["Smash"]["scaleMin"] == 1


def test_4_renaming_a_category_creates_a_new_one_and_strands_the_old_scores(app, client):
    """DEFECT PINNED, NOT FIXED (B-125). The upsert is keyed on `name` and ids are
    never sent, so a rename in Settings is an insert: the old category stays, with
    every score recorded in it, and the renamed one starts empty."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    _history(app, ids, "forehand_id", [(30, 4)])

    # What the settings editor posts after the coach renames "Forehand": the whole list, by name.
    res = client.post("/api/app/add_evaluation_categories", headers=_coach_headers(app, ids), json=[
        {"name": "Forehand drive", "scaleMin": 1, "scaleMax": 10},
        {"name": "Volley", "scaleMin": 1, "scaleMax": 10},
    ])

    assert res.status_code == 200
    with app.app_context():
        names = sorted(c.name for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).all())
    assert names == ["Forehand", "Forehand drive", "Volley"], "the rename is an insert; the old name survives"
    assert [score for score, _ in _rows(app, ids, "forehand_id")] == [4.0], "the scores stay under the old name"
    assert [e["categoryName"] for e in _profile(app, client, ids)["evaluations"]] == ["Forehand"]


def test_4_add_evaluation_categories_is_coach_only(app, client):
    ids = _seed(app)

    res = client.post("/api/app/add_evaluation_categories", json=[{"name": "X", "scaleMin": 0, "scaleMax": 10}],
                      headers=_headers(app, ids["student_user_id"]))

    assert res.status_code == 403


# ── 5. POST /api/app/delete/evaluation_category ──────────────────────────────

def test_5_delete_with_only_an_id_and_no_impact_call_deletes_cascades_and_audits_once(app, client):
    """Exactly what 1.1.0 sends: `{id}`, no impact read, no typed-name step."""
    from padel_app.models import EvaluationCategory, EvaluationEntry
    from padel_app.models.deletion_audit import DeletionAudit

    ids = _seed(app)
    _history(app, ids, "forehand_id", [(60, 3), (30, 5)])
    _history(app, ids, "volley_id", [(30, 4)])

    res = client.post("/api/app/delete/evaluation_category", json={"id": ids["forehand_id"]},
                      headers=_coach_headers(app, ids))

    assert res.status_code == 200
    assert sorted(res.get_json()) == ["status"]
    with app.app_context():
        assert db.session.get(EvaluationCategory, ids["forehand_id"]) is None
        assert EvaluationEntry.query.filter_by(category_id=ids["forehand_id"]).count() == 0
        assert EvaluationEntry.query.filter_by(category_id=ids["volley_id"]).count() == 1
        (audit,) = DeletionAudit.query.all()
        assert (audit.entity, audit.entity_id, audit.action, audit.label) == (
            "evaluation_category", ids["forehand_id"], "deleted", "Forehand")


def test_5_deleting_another_coachs_category_is_403_and_deletes_nothing(app, client):
    from padel_app.models import EvaluationCategory
    from padel_app.models.deletion_audit import DeletionAudit

    ids = _seed(app)
    other = _other_coach(app)

    res = client.post("/api/app/delete/evaluation_category", json={"id": other["category_id"]},
                      headers=_coach_headers(app, ids))

    assert res.status_code == 403
    with app.app_context():
        assert db.session.get(EvaluationCategory, other["category_id"]) is not None
        assert DeletionAudit.query.count() == 0


# ── 6. bulk_create_evaluation_entries (the import) ───────────────────────────

def _import(app, ids, rows):
    from padel_app.models import Coach
    from padel_app.services.import_service import bulk_create_evaluation_entries

    with app.app_context():
        return bulk_create_evaluation_entries(rows, db.session.get(Coach, ids["coach_id"]))


def test_6_an_imported_category_keeps_a_zero_minimum_only_when_it_arrives_as_a_string(app, client):
    """B-136's mechanism is still unfixed: `bulk_create_evaluation_categories`
    goes through the same form layer as the settings upsert, which reads the
    number 0 as "not sent". Since PAD-403 (evaluations.legacy-conversion rule 5)
    the import normalises every legacy category it creates to 1-5, so neither a
    string "0" nor a number 0 nor a 10 reaches the listing. The name records the
    pre-PAD-403 behaviour, when the string "0" survived and was listed as 0.
    Existing categories are still found by name and never updated."""
    from padel_app.models import Coach
    from padel_app.services.import_service import bulk_create_evaluation_categories

    ids = _seed(app)
    with app.app_context():
        result = bulk_create_evaluation_categories([
            {"name": "Lob", "scale_min": "0", "scale_max": "10"},
            {"name": "Smash", "scale_min": 0, "scale_max": 10},
            {"name": "Serve", "scale_max": 5},
            {"name": "Forehand", "scale_min": 0, "scale_max": 3},   # exists: found, never updated
        ], db.session.get(Coach, ids["coach_id"]))

    assert (result["imported"], result["errors"]) == (3, [])
    listed = {c["name"]: (c["scaleMin"], c["scaleMax"])
              for c in client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids)).get_json()}
    assert listed == {
        "Lob": (1, 5),         # sent "0"/"10": normalised to 1-5 (rule 5)
        "Smash": (1, 5),       # sent 0/10: normalised to 1-5 (rule 5)
        "Serve": (1, 5),       # sent max 5 only: 1-5
        "Forehand": (1, 5),    # an existing category's scale is never touched by the import
        "Volley": (1, 5),      # written directly by the fixture
    }


def test_6_import_wide_rows_one_entry_per_category_column(app):
    ids = _seed(app)

    result = _import(app, ids, [
        {"player_name": "Test Student", "date": "2026-02-01", "Forehand": 3, "Volley": "3.5"},
        {"player_name": "Test Student", "date": "2026-03-01", "Forehand": 4, "Volley": ""},
    ])

    assert (result["imported"], result["errors"]) == (2, []), "imported counts ROWS that wrote something"
    assert len(result["created_ids"]["evaluation_entries"]) == 3
    assert _rows(app, ids, "forehand_id") == [(3.0, datetime(2026, 2, 1)), (4.0, datetime(2026, 3, 1))]
    assert _rows(app, ids, "volley_id") == [(3.5, datetime(2026, 2, 1))], "a blank cell is skipped; a string number is a float"


def test_6_import_normalized_rows_one_entry_per_row(app):
    ids = _seed(app)

    result = _import(app, ids, [
        {"player_name": "Test Student", "date": "2026-02-01", "category_name": "Forehand", "score": 5},
        {"player_name": "Test Student", "date": "2026-02-01", "category_name": "Volley", "score": 4},
    ])

    assert (result["imported"], result["errors"]) == (2, [])
    assert _rows(app, ids, "forehand_id") == [(5.0, datetime(2026, 2, 1))]
    assert _rows(app, ids, "volley_id") == [(4.0, datetime(2026, 2, 1))]


def test_6_import_matches_the_player_by_display_name_and_the_category_by_exact_name(app):
    ids = _seed(app)

    result = _import(app, ids, [
        {"player_name": "test-student", "date": "2026-02-01", "Forehand": 6},   # the username, not the name
        {"player_name": "Test Student", "date": "2026-02-01", "forehand": 6},   # wrong case
        {"player_name": "Test Student", "date": "2026-02-01", "Forehand": "n/a"},
    ])

    assert result["imported"] == 0
    assert [(e["row"], e["error"]) for e in result["errors"]] == [
        (0, "Player not found: 'test-student'"),
        (1, "Category not found: 'forehand'"),
        (2, "Invalid score for 'Forehand': 'n/a'"),
    ]
    assert _rows(app, ids, "forehand_id") == []


def test_6_the_import_revert_deletes_what_the_import_created_and_nothing_else(app):
    from padel_app.models import Coach
    from padel_app.models.bulk_import import BulkImport
    from padel_app.services.import_service import revert_import

    ids = _seed(app)
    _history(app, ids, "forehand_id", [(30, 5)])  # hand-entered before the import
    result = _import(app, ids, [{"player_name": "Test Student", "date": "2026-02-01", "Forehand": 3, "Volley": 4}])
    with app.app_context():
        # What the import route records (frontend_api: BulkImport(record_ids=json.dumps(all_created_ids))).
        record = BulkImport(coach_id=ids["coach_id"], filename="scores.xlsx", status="active",
                            summary=json.dumps({"Evaluations": 1}), record_ids=json.dumps(result["created_ids"]))
        db.session.add(record)
        db.session.commit()

        reverted = revert_import(record.id, db.session.get(Coach, ids["coach_id"]))

    assert reverted == {"deleted": {"evaluation_entries": 2}, "status": "reverted"}
    assert [score for score, _ in _rows(app, ids, "forehand_id")] == [5.0]
    assert _rows(app, ids, "volley_id") == []


# ── the history helper (pytest and the E2E seed share it) ────────────────────

def test_the_history_helper_hangs_every_date_off_the_anchor_it_is_given(app):
    ids = _seed(app)
    with app.app_context():
        created = seed_evaluation_history(ids["rel_id"], ids["forehand_id"], [(7, 5), (120, 2), (30, 4)], anchor=ANCHOR)
        db.session.commit()
        with pytest.raises(TypeError):
            seed_evaluation_history(ids["rel_id"], ids["forehand_id"], [(1, 1)], anchor="2026-06-15")

    assert len(created) == 3
    assert _rows(app, ids, "forehand_id") == [
        (2.0, datetime(2026, 2, 15, 10, 30)),   # oldest first, whatever order the points came in
        (4.0, datetime(2026, 5, 16, 10, 30)),
        (5.0, datetime(2026, 6, 8, 10, 30)),
    ]
