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


# ── POST /api/app/add_class and /api/app/edit_class (lesson_service) ─────────

def _class_world(app, client):
    from padel_app.models.lessons import Lesson
    from padel_app.tests.test_pad104_class_requests import DAY, _setup

    ids = _setup(app)  # a coach with a club, which a class needs
    headers = _headers(app, ids["coach_user_id"])
    body = {"name": "Thursday group", "classType": "academy", "maxPlayers": 4, "color": "#112233",
            "levelId": ids["level_ids"]["5"], "date": DAY.isoformat(), "startTime": "18:00", "endTime": "19:00",
            "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [DAY.isoweekday() % 7]},
            "endDate": "2027-03-01", "playerIds": []}
    res = client.post("/api/app/add_class", json=body, headers=headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        lesson_id = Lesson.query.order_by(Lesson.id.desc()).first().id
    return {"ids": ids, "headers": headers, "body": body, "lesson_id": lesson_id, "day": DAY}


def _class_row(app, lesson_id):
    from padel_app.models.lessons import Lesson

    with app.app_context():
        row = db.session.get(Lesson, lesson_id)
        return {"title": row.title, "max_players": row.max_players, "level": row.default_level_id, "color": row.color,
                "recurrence_end": str(row.recurrence_end), "is_recurring": row.is_recurring,
                "has_rule": bool(row.recurrence_rule)}


def _edit_class(client, world, updates):
    return client.post("/api/app/edit_class", headers=world["headers"], json={
        "event": {"model": "Lesson", "originalId": world["lesson_id"], "date": world["day"].isoformat()},
        "scope": "future", "updates": updates})


def test_add_class_with_a_capacity_of_zero_fails_on_the_not_null_column(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). `maxPlayers: 0` is read as "not sent" and
    `lessons.max_players` is NOT NULL: an unhandled IntegrityError, not a 400 and
    not a stored 0. Whether 0 is a legal capacity is a product question; a 500 is not."""
    from sqlalchemy.exc import IntegrityError

    world = _class_world(app, client)

    with pytest.raises(IntegrityError):  # the test client re-raises what production answers as a 500
        client.post("/api/app/add_class", headers=world["headers"],
                    json={**world["body"], "name": "Zero", "maxPlayers": 0, "startTime": "20:00", "endTime": "21:00"})
    with app.app_context():
        db.session.rollback()


def test_edit_class_absent_keys_are_kept(app, client):
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])

    assert _edit_class(client, world, {"name": "Thursday group B"}).status_code == 201

    after = _class_row(app, world["lesson_id"])
    assert after["title"] == "Thursday group B", "the control: a truthy value is written"
    assert {k: after[k] for k in ("max_players", "level", "color", "recurrence_end")} == \
           {k: before[k] for k in ("max_players", "level", "color", "recurrence_end")}


@pytest.mark.parametrize("updates", [
    {"name": ""}, {"maxPlayers": 0}, {"levelId": None}, {"recurrenceEnd": None}, {"color": ""},
], ids=["empty-name", "zero-capacity", "null-level", "null-end-date", "empty-color"])
def test_edit_class_a_falsy_value_is_answered_201_and_changes_nothing(app, client, updates):
    """DEFECT PINNED, NOT FIXED (B-136). The consequences that matter: a coach cannot
    take the level off a class ("all levels") or remove a series' end date, and is
    told it worked. An empty name being ignored is arguably right — for the wrong reason."""
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])

    assert _edit_class(client, world, updates).status_code == 201

    after = _class_row(app, world["lesson_id"])
    assert {k: after[k] for k in ("title", "max_players", "level", "color", "recurrence_end")} == \
           {k: before[k] for k in ("title", "max_players", "level", "color", "recurrence_end")}


def test_edit_class_any_edit_clears_is_recurring_while_the_rule_stays(app, client):
    """DEFECT PINNED, NOT FIXED — B-136's sibling: the form writes every Boolean on
    every submit, and an ABSENT boolean is False (PAD-93 fixed this for the calendar
    block's `blocks_auto_invitations`, and backfilled `lessons.is_recurring` once).
    The calendar feed still says recurring — it reads the rule, not the column."""
    from datetime import timedelta

    world = _class_world(app, client)
    assert _class_row(app, world["lesson_id"])["is_recurring"] is True

    assert _edit_class(client, world, {"name": "Thursday group B"}).status_code == 201

    row = _class_row(app, world["lesson_id"])
    assert (row["is_recurring"], row["has_rule"]) == (False, True)
    day = world["day"]
    feed = client.get(f"/api/app/calendar?from={day.isoformat()}&to={(day + timedelta(days=8)).isoformat()}",
                      headers=world["headers"]).get_json()
    served = [e["isRecurring"] for e in feed if e.get("title") == "Thursday group B" or e.get("name") == "Thursday group B"]
    assert served and all(served), "what clients see is unaffected — today"


# ── POST /api/app/add_player (player_service.create_player_helper) ───────────

def _add_player(client, world, **fields):
    body = {"coachId": world["ids"]["coach_id"], "name": "New Player", **fields}
    return client.post("/api/app/add_player", json=body, headers=world["headers"])


def _new_players(app):
    from padel_app.models import Association_CoachPlayer, User

    with app.app_context():
        users = User.query.filter(User.name.like("New Player%")).order_by(User.id).all()
        out = []
        for user in users:
            rel = Association_CoachPlayer.query.filter_by(player_id=user.player.id).first()
            out.append({"email": user.email, "phone": user.phone, "notes": rel.notes, "side": rel.side})
        return out


def test_add_player_empty_strings_are_stored_as_null_and_two_of_them_do_not_collide(app, client):
    """NOT a defect — the behaviour a fix must KEEP on create. `email: ""` reaches the
    column as NULL, so any number of players without an email can exist. A fix that
    "honours the empty string" on create would store "" and (where the column is
    unique) refuse the second one."""
    world = _class_world(app, client)

    first = _add_player(client, world, email="", phone="", notes="", side="")
    second = _add_player(client, world, name="New Player 2", email="", phone="", notes="", side="")

    assert (first.status_code, second.status_code) == (200, 200), second.get_data(as_text=True)
    assert _new_players(app) == [{"email": None, "phone": None, "notes": None, "side": None}] * 2


def test_add_player_absent_keys_and_real_values(app, client):
    world = _class_world(app, client)

    assert _add_player(client, world).status_code == 200
    assert _add_player(client, world, name="New Player 2", email="np2@test.com", phone="+351922222222",
                       notes="serves well", side="left").status_code == 200

    assert _new_players(app) == [
        {"email": None, "phone": None, "notes": None, "side": None},
        {"email": "np2@test.com", "phone": "+351922222222", "notes": "serves well", "side": "left"},
    ]


# ── POST /api/app/add_coach_note — validates before the form; a control ──────

def test_add_coach_note_refuses_an_empty_text_itself(app, client):
    ids = _seed(app)
    headers = _headers(app, ids["coach_user_id"])

    empty = client.post("/api/app/add_coach_note", headers=headers,
                        json={"playerId": ids["student_id"], "type": "strength", "text": "   "})
    real = client.post("/api/app/add_coach_note", headers=headers,
                       json={"playerId": ids["student_id"], "type": "strength", "text": "Fast feet"})

    assert (empty.status_code, empty.get_json()) == (400, {"error": "text is required"})
    assert real.status_code == 200 and real.get_json()["text"] == "Fast feet"


# ── PATCH /api/editor/<model>/<id> — JSON admin editor, NOT on the form layer ─

def _root_headers(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="root", username="root", password="x", status="active", is_superadmin=True)
        db.session.add(user)
        db.session.commit()
        return _headers(app, user.id)


def test_json_admin_editor_can_clear_a_text_and_write_a_zero(app, client):
    """The second control: this route hands the JSON body to `update_with_dict`
    without `Field.set_value`, so "" and 0 arrive as themselves. Only `None` is
    skipped (by `update_with_dict`), so `null` still cannot clear."""
    from padel_app.models import Association_CoachPlayer, EvaluationCategory

    ids = _seed(app)
    root = _root_headers(app)
    with app.app_context():
        category = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=10)
        db.session.add(category)
        db.session.commit()
        category_id = category.id

    notes = client.patch(f"/api/editor/association_coachplayer/{ids['rel_id']}", json={"values": {"notes": ""}}, headers=root)
    zero = client.patch(f"/api/editor/evaluationcategory/{category_id}", json={"values": {"scale_min": 0}}, headers=root)
    null = client.patch(f"/api/editor/association_coachplayer/{ids['rel_id']}", json={"values": {"side": None}}, headers=root)

    assert (notes.status_code, zero.status_code, null.status_code) == (200, 200, 200), notes.get_data(as_text=True)
    with app.app_context():
        rel = db.session.get(Association_CoachPlayer, ids["rel_id"])
        assert rel.notes == "", "cleared — to an empty string, not NULL"
        assert rel.side == "right", "null is skipped by update_with_dict: still not a way to clear"
        assert db.session.get(EvaluationCategory, category_id).scale_min == 0
