"""PAD-367 / B-136 — what a falsy value means today, pinned AT THE ROUTE.

The shared form layer (`tools/input_tools.py` `Field.set_value`) keeps a value
only when it is truthy, and `JsonRequestAdapter` fills every field a body lacks
with `''`. So by the time a value reaches the model, "the key was absent" and
"the key was present and empty / zero" are the same thing. Before anyone changes
that, every endpoint that writes through it gets three cases:

    absent            the key is not in the body
    present, falsy    "" / 0 / null, where the client can legally send it
    present, truthy   the control

Every test states what ships at origin/staging 00e53375f — AS IT IS. Tests
marked DEFECT PINNED, NOT FIXED assert a wrong behaviour on purpose: an App
Store build may depend on it, and the fix is scoped from these pins, not before
them. Pins enter at the HTTP route: a service-level probe said a user could not
clear their phone, and the route (`PATCH /api/auth/me`) never used that service.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _seed(app):
    from padel_app.models import Association_CoachPlayer

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"],
                                     notes="left-handed, bad knee", side="right")
        db.session.add(rel)
        db.session.commit()
        ids["rel_id"] = rel.id
    return ids


# ── PUT /api/app/calendar_block/<id> (calendar_service.edit_event_service) ───

EVENT = {"type": "personal", "title": "Dentist", "description": "bring x-rays", "date": "2026-10-05",
         "startTime": "10:00", "endTime": "11:00", "isRecurring": False}


def _event(app, client, ids, **over):
    res = client.post("/api/app/add_event", json={**EVENT, **over}, headers=_headers(app, ids["coach_user_id"]))
    assert res.status_code == 201, res.get_data(as_text=True)
    return res.get_json()


def _edit_event(app, client, ids, block_id, body):
    res = client.put(f"/api/app/calendar_block/{block_id}", json=body, headers=_headers(app, ids["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def test_calendar_edit_absent_title_and_description_are_kept(app, client):
    ids = _seed(app)
    block = _event(app, client, ids)
    body = {k: v for k, v in EVENT.items() if k not in ("title", "description")}

    after = _edit_event(app, client, ids, block["id"], {**body, "startTime": "12:00", "endTime": "13:00"})

    assert (after["title"], after["description"]) == ("Dentist", "bring x-rays")
    assert after["startTime"] == "12:00", "the control: a truthy value is written"


def test_calendar_edit_an_empty_title_or_description_cannot_clear_it(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). `_build_payload` sends `""` for an absent
    key too, so today the two cases are indistinguishable — which is also why a
    naive fix would wipe both fields on every edit that omits them."""
    ids = _seed(app)
    block = _event(app, client, ids)

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "title": "", "description": ""})

    assert (after["title"], after["description"]) == ("Dentist", "bring x-rays")


def test_calendar_edit_a_new_title_and_description_are_written(app, client):
    ids = _seed(app)
    block = _event(app, client, ids)

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "title": "Physio", "description": "knee"})

    assert (after["title"], after["description"]) == ("Physio", "knee")


def test_calendar_edit_recurring_to_one_off_leaves_the_rule_and_the_end_date_on_the_row(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). `is_recurring` has its own Boolean handler
    and flips; `recurrence_rule: ""` and `recurrence_end: ""` are falsy and dropped."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = _seed(app)
    block = _event(app, client, ids, isRecurring=True,
                   recurrenceRule={"frequency": "weekly", "daysOfWeek": [1]}, endDate="2026-12-01")
    assert block["isRecurring"] is True

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "isRecurring": False})

    assert after["isRecurring"] is False
    with app.app_context():
        row = db.session.get(CalendarBlock, block["id"])
        assert row.recurrence_rule is not None and "weekly" in row.recurrence_rule
        assert row.recurrence_end is not None and row.recurrence_end.isoformat() == "2026-12-01"


# ── POST /api/app/edit_player (player_service.edit_player_helper) ────────────

def _edit_player(app, client, ids, updates, **player_over):
    player = {"coachId": ids["coach_id"], "playerId": ids["student_id"], "name": "Test Student",
              "email": "student@test.com", "phone": "+351900000000", "side": "right",
              "notes": "left-handed, bad knee", **player_over}
    res = client.post("/api/app/edit_player", json={"player": player, "updates": updates},
                      headers=_headers(app, ids["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)


def _roster_row(app, ids):
    from padel_app.models import Association_CoachPlayer, User

    with app.app_context():
        rel = db.session.get(Association_CoachPlayer, ids["rel_id"])
        user = db.session.get(User, ids["student_user_id"])
        return {"notes": rel.notes, "side": rel.side, "name": user.name, "phone": user.phone, "email": user.email}


def _give_the_student_a_phone(app, ids):
    from padel_app.models import User

    with app.app_context():
        db.session.get(User, ids["student_user_id"]).phone = "+351900000000"
        db.session.commit()


def test_edit_player_absent_fields_are_kept(app, client):
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _edit_player(app, client, ids, {"name": "Test Student Jr"})

    row = _roster_row(app, ids)
    assert row == {"notes": "left-handed, bad knee", "side": "right", "name": "Test Student Jr",
                   "phone": "+351900000000", "email": "student@test.com"}


def test_edit_player_empty_notes_side_and_phone_cannot_be_cleared(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). The route diffs `updates` against `player`,
    so an emptied field IS a change and reaches the form as `""` — where it is
    dropped. A coach cannot delete a note about a player, only overwrite it."""
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _edit_player(app, client, ids, {"notes": "", "side": "", "phone": ""})

    row = _roster_row(app, ids)
    assert (row["notes"], row["side"], row["phone"]) == ("left-handed, bad knee", "right", "+351900000000")


def test_edit_player_new_values_are_written(app, client):
    ids = _seed(app)

    _edit_player(app, client, ids, {"notes": "now right-handed", "side": "left", "phone": "+351911111111"})

    row = _roster_row(app, ids)
    assert (row["notes"], row["side"], row["phone"]) == ("now right-handed", "left", "+351911111111")


# ── PATCH /api/auth/me — NOT on the form layer; the control for the whole family ──

def _patch_me(app, client, ids, body):
    res = client.patch("/api/auth/me", json=body, headers=_headers(app, ids["student_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _me(app, ids):
    from padel_app.models import User

    with app.app_context():
        user = db.session.get(User, ids["student_user_id"])
        return {"name": user.name, "phone": user.phone, "email": user.email}


def test_own_profile_absent_keys_are_kept(app, client):
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _patch_me(app, client, ids, {"name": "Renamed"})

    assert _me(app, ids) == {"name": "Renamed", "phone": "+351900000000", "email": "student@test.com"}


def test_own_profile_an_empty_phone_clears_it(app, client):
    """NOT affected by B-136: this handler tests `"phone" in data`, so absent and
    present-and-empty are different things. The pattern the adapter fix needs."""
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _patch_me(app, client, ids, {"phone": ""})

    assert _me(app, ids)["phone"] in (None, "")
    assert _me(app, ids)["name"] == "Test Student"
