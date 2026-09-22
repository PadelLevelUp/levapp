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


def test_calendar_edit_a_block_made_one_off_still_repeats_in_the_calendar_feed(app, client):
    """DEFECT PINNED, NOT FIXED (B-150) — the user-visible end of the test above. The
    feed expands `recurrence_rule` (serializers/calendar_event.py), and the rule was
    never cleared, so a block the user made one-off is still served every week."""
    ids = _seed(app)
    headers = _headers(app, ids["coach_user_id"])
    block = _event(app, client, ids, isRecurring=True,
                   recurrenceRule={"frequency": "weekly", "daysOfWeek": [1]}, endDate="2026-12-01")

    def dentist_days():
        feed = client.get("/api/app/calendar?from=2026-10-05&to=2026-11-02", headers=headers).get_json()
        return [(e["date"], e["isRecurring"]) for e in feed if e.get("title") == "Dentist"]

    weekly = [("2026-10-05", True), ("2026-10-12", True), ("2026-10-19", True), ("2026-10-26", True)]
    assert dentist_days() == weekly

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "isRecurring": False})

    assert after["isRecurring"] is False, "the edit's own response says one-off"
    assert dentist_days() == weekly, "and the calendar goes on repeating it"


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


@pytest.mark.parametrize("cleared", ["", None], ids=["empty-string", "null"])
def test_edit_player_an_emptied_note_side_phone_or_email_is_cleared(app, client, cleared):
    """FIXED in PAD-388 (B-136 step 3). Was: the route diffed `updates` against
    `player`, so an emptied field WAS a change and reached the form as "" — where
    it was dropped; a coach could not delete a note, only overwrite it. Both null
    and "" clear (decided 2026-09-21); the shells send null (this ticket)."""
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _edit_player(app, client, ids, {"notes": cleared, "side": cleared, "phone": cleared, "email": cleared})

    row = _roster_row(app, ids)
    assert row == {"notes": None, "side": None, "phone": None, "email": None, "name": "Test Student"}


def test_edit_player_a_cleared_level_is_no_level_and_writes_no_history_row(app, client):
    """PAD-388: `levelId: null` clears through the one writer (players.level-history
    rule 1): history records assignments, so a clear writes no row."""
    from padel_app.models import Association_CoachPlayer, CoachLevel, PlayerLevelHistory

    ids = _seed(app)
    with app.app_context():
        level = CoachLevel(coach_id=ids["coach_id"], label="Five", code="L5", display_order=5)
        db.session.add(level)
        db.session.flush()
        rel = db.session.get(Association_CoachPlayer, ids["rel_id"])
        rel.level_id = level.id
        db.session.commit()
        level_id = level.id
        rows_before = PlayerLevelHistory.query.filter_by(coach_id=ids["coach_id"], player_id=ids["student_id"]).count()

    _edit_player(app, client, ids, {"levelId": None}, levelId=str(level_id))

    with app.app_context():
        assert db.session.get(Association_CoachPlayer, ids["rel_id"]).level_id is None
        assert PlayerLevelHistory.query.filter_by(coach_id=ids["coach_id"], player_id=ids["student_id"]).count() == rows_before


@pytest.mark.parametrize("emptied", ["", None, "   "], ids=["empty-string", "null", "blank"])
def test_edit_player_an_emptied_name_is_refused_and_nothing_is_written(app, client, emptied):
    """PAD-388: users.name is NOT NULL — 400 naming the field, before any write; the
    note sent beside it is not written either. No shell can send this (Save is
    disabled on an empty name); it is the route's own guarantee."""
    ids = _seed(app)
    before = _roster_row(app, ids)
    player = {"coachId": ids["coach_id"], "playerId": ids["student_id"], "name": "Test Student",
              "email": "student@test.com", "phone": None, "side": "right", "notes": "left-handed, bad knee"}
    res = client.post("/api/app/edit_player", json={"player": player, "updates": {"name": emptied, "notes": "new note"}},
                      headers=_headers(app, ids["coach_user_id"]))

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["name"]}
    assert _roster_row(app, ids) == before


def test_edit_player_an_old_build_body_with_omitted_keys_keeps_everything(app, client):
    """PAD-388: App Store 1.0 / 1.1.0 (and the current shells before this ticket)
    send the FULL form with every emptied box OMITTED — an omitted key still
    means keep, so those builds go on working unchanged."""
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)
    before = _roster_row(app, ids)

    # what the old build sends after the coach emptied the note box: name and the untouched
    # fields, `notes` dropped by JSON.stringify
    _edit_player(app, client, ids, {"name": "Test Student", "userId": ids["student_user_id"],
                                    "email": "student@test.com", "phone": "+351900000000", "side": "right"})

    assert _roster_row(app, ids) == before


def test_edit_player_nothing_on_the_user_form_beyond_name_email_phone_is_reachable(app, client):
    """PAD-388: present mode writes every key it is given, so the whitelist is the
    guard — `username`, `status`, `is_admin` are on the user form and must not be."""
    from padel_app.models import User

    ids = _seed(app)
    with app.app_context():
        user = db.session.get(User, ids["student_user_id"])
        before = (user.username, user.status, user.is_admin, user.password)

    _edit_player(app, client, ids, {"username": "hacked", "status": "disabled", "is_admin": True,
                                    "password": "x", "notes": "still just a note"})

    with app.app_context():
        user = db.session.get(User, ids["student_user_id"])
        assert (user.username, user.status, user.is_admin, user.password) == before
    assert _roster_row(app, ids)["notes"] == "still just a note"


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


@pytest.mark.parametrize("updates,field", [
    ({"name": ""}, "title"), ({"maxPlayers": 0}, "max_players"), ({"maxPlayers": None}, "max_players"),
], ids=["empty-name", "zero-capacity", "null-capacity"])
def test_edit_class_an_emptied_not_null_value_is_refused_and_nothing_is_written(app, client, updates, field):
    """FIXED in PAD-387 (B-136 step 2): an empty name and a 0/null capacity are answered
    400 naming the field, not silently ignored (was 201 + no change). 0 is not a legal
    capacity — Coordinator's decision, 2026-09-21."""
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])

    res = _edit_class(client, world, {**updates, "color": "#abcdef"})  # a legal change beside it

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": [field]}
    assert _class_row(app, world["lesson_id"]) == before, "nothing beside it was written either"


@pytest.mark.parametrize("updates,column", [
    ({"levelId": None}, "level"), ({"levelId": ""}, "level"),
    ({"color": ""}, "color"), ({"color": None}, "color"),
], ids=["null-level", "empty-level", "empty-color", "null-color"])
def test_edit_class_an_emptied_nullable_value_clears_it(app, client, updates, column):
    """FIXED in PAD-387 (B-136 step 2): a coach CAN take the level off a class ("all
    levels") or its colour — both null and "" clear (decided 2026-09-21). Was: 201 and
    nothing changed. The end date is the exception: see the next test."""
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])
    assert before[column] not in (None, "None"), "the seed gives the column a value to clear"

    assert _edit_class(client, world, updates).status_code == 201

    after = _class_row(app, world["lesson_id"])
    assert after[column] in (None, "None")
    untouched = [k for k in ("title", "max_players", "level", "color", "recurrence_end") if k != column]
    assert {k: after[k] for k in untouched} == {k: before[k] for k in untouched}


@pytest.mark.parametrize("cleared", ["", None], ids=["empty-string (a cleared web date input)", "null"])
def test_edit_class_refuses_to_empty_the_end_date_of_a_recurring_class(app, client, cleared):
    """Session-B's review of #368: a NULL recurrence_end means "recurs forever"
    downstream, the create path refuses to make one (PAD-90) and calendar.seasons
    rule 10 forbids it on a flagged lesson — so the edit route must not become
    the one way to make an unbounded series. The exact web body: ClassDetailSheet's
    native date input yields "" when cleared or half-typed, and the diff sends it."""
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])
    assert before["has_rule"] and before["recurrence_end"] != "None"

    res = _edit_class(client, world, {"recurrenceEnd": cleared, "color": "#abcdef"})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["recurrence_end"]}
    assert _class_row(app, world["lesson_id"]) == before


def test_edit_class_an_explicit_end_date_is_the_coachs_and_the_season_no_longer_caps_it(app, client):
    """Session-B's F2 on #368: the legacy path reset `recurs_until_season_end` on
    every edit by accident (PAD-93's family); present mode leaves it alone — so an
    edit that SETS an end date must clear the flag on purpose, or the next season
    save re-caps the coach's date (season_service.recap_flagged_lessons)."""
    from padel_app.models.lessons import Lesson

    world = _class_world(app, client)
    with app.app_context():
        db.session.get(Lesson, world["lesson_id"]).recurs_until_season_end = True
        db.session.commit()

    assert _edit_class(client, world, {"recurrenceEnd": "2027-01-15"}).status_code == 201

    with app.app_context():
        row = db.session.get(Lesson, world["lesson_id"])
        assert (str(row.recurrence_end), row.recurs_until_season_end, row.is_recurring) == ("2027-01-15", False, True)


def test_edit_class_single_scope_a_cleared_level_makes_the_occurrence_inherit_the_series_level(app, client):
    """Session-B's F3 on #368 (classes.edit rule 7 as narrowed): an occurrence has
    no colour, end date or court of its own, and a NULL level on it INHERITS the
    series' (rule 4) — so on `single` a cleared level is not "all levels"."""
    from padel_app.models.lesson_instances import LessonInstance

    world = _class_world(app, client)
    series = _class_row(app, world["lesson_id"])
    single = {"event": {"model": "Lesson", "originalId": world["lesson_id"], "date": world["day"].isoformat()},
              "scope": "single"}
    res = client.post("/api/app/edit_class", headers=world["headers"],
                      json={**single, "updates": {"levelId": None, "color": ""}})
    assert res.status_code == 201, res.get_data(as_text=True)

    with app.app_context():
        instance = LessonInstance.query.filter_by(lesson_id=world["lesson_id"]).one()
        assert instance.level_id is None
        assert instance.effective_level_id == series["level"]
    assert _class_row(app, world["lesson_id"]) == series, "a single-scope edit never touches the series"


def test_edit_class_leaves_the_booleans_it_was_not_sent_alone(app, client):
    """FIXED in PAD-387 (B-136's sibling): an edit no longer writes `is_recurring = False`
    (and `recurs_until_season_end = False`) because the form saw no such key."""
    from padel_app.models.lessons import Lesson

    world = _class_world(app, client)
    with app.app_context():
        row = db.session.get(Lesson, world["lesson_id"])
        row.recurs_until_season_end = True
        db.session.commit()
    assert _class_row(app, world["lesson_id"])["is_recurring"] is True

    assert _edit_class(client, world, {"name": "Thursday group B"}).status_code == 201

    row = _class_row(app, world["lesson_id"])
    assert (row["is_recurring"], row["has_rule"]) == (True, True)
    with app.app_context():
        assert db.session.get(Lesson, world["lesson_id"]).recurs_until_season_end is True


def test_edit_class_single_scope_without_a_name_keeps_the_occurrence_title_override(app, client):
    """PAD-387: in present mode a key that is not sent is left alone — including the
    instance's title override, which the helper used to recompute from an absent title."""
    from padel_app.models.lesson_instances import LessonInstance

    world = _class_world(app, client)
    day = world["day"].isoformat()
    single = {"event": {"model": "Lesson", "originalId": world["lesson_id"], "date": day}, "scope": "single"}
    res = client.post("/api/app/edit_class", headers=world["headers"], json={**single, "updates": {"name": "Just today"}})
    assert res.status_code == 201, res.get_data(as_text=True)  # the occurrence is materialised by this edit
    with app.app_context():
        instance = LessonInstance.query.filter_by(lesson_id=world["lesson_id"]).one()
        assert instance.overwrite_title == "Just today"
        instance_id = instance.id

    res = client.post("/api/app/edit_class", headers=world["headers"], json={
        "event": {"model": "LessonInstance", "originalId": instance_id, "date": day}, "scope": "single",
        "updates": {"maxPlayers": 6}})
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        assert (instance.overwrite_title, instance.max_players) == ("Just today", 6)


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


# ── POST / PUT /api/app/availability_blockers (a student's unavailability) ───

def test_a_students_unavailability_made_one_off_still_excludes_them_from_invitations_every_week(app, client):
    """DEFECT PINNED, NOT FIXED (B-150, the consequence that costs someone a class).
    Same service as the calendar edit above. The notification engine's own
    predicate, `user_is_blocked_for_window`, expands the leftover rule: two weeks
    after the ONE day the student said they were away, they are still "blocked"."""
    from datetime import datetime

    from padel_app.services.student_availability_service import user_is_blocked_for_window

    ids = _seed(app)
    headers = _headers(app, ids["student_user_id"])
    away = {"title": "Away", "date": "2026-10-05", "startTime": "18:00", "endTime": "20:00"}
    created = client.post("/api/app/availability_blockers", headers=headers, json={
        **away, "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]}, "endDate": "2026-12-01"})
    assert created.status_code == 201, created.get_data(as_text=True)

    edited = client.put(f"/api/app/availability_blockers/{created.get_json()['id']}", headers=headers,
                        json={**away, "isRecurring": False})
    assert edited.status_code == 200 and edited.get_json()["isRecurring"] is False

    def blocked_on(day):
        with app.app_context():
            return user_is_blocked_for_window(ids["student_user_id"], datetime(2026, 10, day, 18, 30), datetime(2026, 10, day, 19, 30))

    assert blocked_on(5) is True, "the day they asked for"
    assert blocked_on(19) is True, "and, wrongly, every Monday after it"
    assert blocked_on(20) is False, "the control: a Tuesday was never blocked"


def test_a_block_edit_that_OMITS_isRecurring_rots_the_flag_of_a_genuinely_weekly_block(app, client):
    """DEFECT PINNED, NOT FIXED — and the reason no bulk repair may use the flag.
    `_build_payload` reads `data.get("isRecurring", False)`: a client that edits only
    the title and leaves the key out produces EXACTLY the row a deliberate one-off
    produces (`is_recurring` False, rule and end date still there). On production
    the two are indistinguishable, so "flag false and rule present" cannot tell a
    block the user made one-off from a weekly block that is still meant to be weekly."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = _seed(app)
    block = _event(app, client, ids, isRecurring=True,
                   recurrenceRule={"frequency": "weekly", "daysOfWeek": [1]}, endDate="2026-12-01")
    body = {k: v for k, v in EVENT.items() if k != "isRecurring"}   # a rename, nothing about repetition

    after = _edit_event(app, client, ids, block["id"], {**body, "title": "Dentist (new clinic)"})

    assert after["title"] == "Dentist (new clinic)"
    assert after["isRecurring"] is False, "the user never asked for that"
    with app.app_context():
        row = db.session.get(CalendarBlock, block["id"])
        assert row.recurrence_rule is not None and row.recurrence_end.isoformat() == "2026-12-01"


# ── POST /api/app/message (messaging_service.create_message_service) ─────────

def test_message_an_empty_text_fails_on_the_not_null_column_and_blank_or_zero_are_stored(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). Nothing validates the text: `""` is read as
    "not sent" and `messages.text` is NOT NULL — an unhandled IntegrityError where
    a 400 belongs. A whitespace-only text and the text "0" are truthy strings and
    are stored as sent."""
    from sqlalchemy.exc import IntegrityError

    from padel_app.models import Message

    ids = _seed(app)
    headers = _headers(app, ids["coach_user_id"])
    conversation = client.post("/api/app/conversation", json={"otherParticipants": [ids["student_user_id"]]}, headers=headers)
    assert conversation.status_code == 201, conversation.get_data(as_text=True)
    conversation_id = conversation.get_json()["id"]

    with pytest.raises(IntegrityError):  # the test client re-raises what production answers as a 500
        client.post("/api/app/message", json={"conversationId": conversation_id, "text": ""}, headers=headers)
    with app.app_context():
        db.session.rollback()
    for text in ("   ", "0", "hello"):
        assert client.post("/api/app/message", json={"conversationId": conversation_id, "text": text},
                           headers=headers).status_code == 201

    with app.app_context():
        assert [m.text for m in Message.query.order_by(Message.id)] == ["   ", "0", "hello"]


# ── POST /api/app/class_instance/presences/confirm (lesson_service.add_presences) ──

def test_attendance_a_justification_cannot_be_cleared_and_a_mark_cannot_be_undone(app, client):
    """DEFECT PINNED, NOT FIXED (B-136). Absent-and-justified, then present: the
    empty justification is dropped, so the row reads `present` + `justified`.
    Un-marking (status null or "") answers 200 and leaves the mark. Whether a
    client offers un-marking, and whether any statistic reads `justification`
    without `status`, was not checked."""
    from padel_app.models import Presence
    from padel_app.tests.test_semi_auto_approval import _patched_io, _seed_world

    with app.app_context():
        world = _seed_world("pad367", n_candidates=1, enrolled=2)
        instance, (_, player) = world["instance"], world["enrolled"][0]
        instance_id, lesson_id, player_id = instance.id, instance.lesson_id, player.id
        headers = _headers(app, world["coach_user"].id)

        def confirm(**item):
            with _patched_io():
                res = client.post("/api/app/class_instance/presences/confirm", headers=headers, json={
                    "classInstance": {"parentClassId": lesson_id, "originalId": instance_id},
                    "presences": [{"playerId": player_id, **item}]})
            assert res.status_code == 200, res.get_data(as_text=True)
            db.session.expire_all()
            row = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
            return row.status, row.justification

        assert confirm(status="absent", justification="justified") == ("absent", "justified")
        assert confirm(status="present", justification="") == ("present", "justified")
        assert confirm(status="present", justification=None) == ("present", "justified")
        assert confirm(status=None, justification=None) == ("present", "justified"), "cannot be un-marked"
        assert confirm(status="", justification="") == ("present", "justified")
        assert confirm(status="absent", justification="unjustified") == ("absent", "unjustified"), "the control"


# ── POST /api/app/activate/user/<id> (user_service.activate_user_service) ────

def test_activation_an_empty_field_keeps_what_the_coach_entered(app, client):
    """The falsy rule doing something arguably useful: a student who activates with
    an empty phone or e-mail box does NOT wipe what the coach typed when adding
    them. A fix that honours "" would start wiping it — the activation form has to
    be read (what does it send for an untouched box?) before this route changes."""
    from padel_app.models import User
    from padel_app.tools.activation_token import activation_token_for

    with app.app_context():
        user = User(name="Invited", username="pending-abc", password="x", status="inactive",
                    email="coach-typed@test.com", phone="+351933333333")
        db.session.add(user)
        db.session.commit()
        user_id, token = user.id, activation_token_for(user)

    res = client.post(f"/api/app/activate/user/{user_id}", json={
        "token": token, "name": "Invited Player", "username": "invited", "password": "S3cret-pass!",
        "email": "", "phone": ""})

    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        row = db.session.get(User, user_id)
        assert (row.status, row.username, row.name) == ("active", "invited", "Invited Player")
        assert (row.email, row.phone) == ("coach-typed@test.com", "+351933333333")


# ── POST /api/app/add_coach_level (coach_service.upsert_coach_levels) ────────

def test_coach_levels_a_display_order_of_zero_means_unordered_by_design(app, client):
    """NOT affected: `level_ladder.is_unordered` defines 0 (and None) as "nobody
    told us where this goes" and the ladder is renumbered 1..N. Run, not read."""
    from padel_app.models.coach_levels import CoachLevel

    ids = _seed(app)
    res = client.post("/api/app/add_coach_level", headers=_headers(app, ids["coach_user_id"]), json=[
        {"code": "A", "label": "Advanced", "displayOrder": 0},
        {"code": "B", "label": "Beginner", "displayOrder": 0},
    ])

    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        orders = sorted(l.display_order for l in CoachLevel.query.filter_by(coach_id=ids["coach_id"]).all())
        assert orders == list(range(1, len(orders) + 1)) and 0 not in orders


# ── POST /api/edit/<model>/<id> — the legacy admin editor (HTML form body) ────

def test_legacy_html_editor_a_zero_survives_as_a_string_and_an_empty_box_cannot_clear(app, client):
    """The same form layer, fed by an HTML form: every value is a string, so "0" is
    truthy and IS written — which is how a category can hold a minimum of 0 at all —
    while an emptied box is still read as "not sent" (DEFECT PINNED, NOT FIXED, B-136).
    The JSON branch of this same route skips the form, like PATCH /api/editor."""
    from padel_app.models import Association_CoachPlayer, EvaluationCategory

    ids = _seed(app)
    root = _root_headers(app)
    with app.app_context():
        category = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=10)
        db.session.add(category)
        db.session.commit()
        category_id = category.id

    zero = client.post(f"/api/edit/evaluationcategory/{category_id}", headers=root,
                       data={"name": "Forehand", "scale_min": "0", "scale_max": "10"})
    emptied = client.post(f"/api/edit/association_coachplayer/{ids['rel_id']}", headers=root,
                          data={"notes": "", "side": ""})

    assert (zero.status_code, emptied.status_code) == (200, 200), zero.get_data(as_text=True) + emptied.get_data(as_text=True)
    with app.app_context():
        assert db.session.get(EvaluationCategory, category_id).scale_min == 0
        rel = db.session.get(Association_CoachPlayer, ids["rel_id"])
        assert (rel.notes, rel.side) == ("left-handed, bad knee", "right")
