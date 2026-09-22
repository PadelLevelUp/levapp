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


@pytest.mark.parametrize("cleared", [None, ""], ids=["null (what both shells send)", "empty-string"])
def test_calendar_edit_an_emptied_title_or_description_is_cleared(app, client, cleared):
    """FIXED in PAD-386 (B-136 step 1). Was: `_build_payload` sent `""` for an absent
    key too, so the two cases were indistinguishable and neither cleared. Both
    shells send `null` for an emptied box (EventDetailSheet / event-draft.ts)."""
    ids = _seed(app)
    block = _event(app, client, ids)

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "title": cleared, "description": cleared})

    assert (after["title"], after["description"]) == (None, None)


def _put_event(app, client, ids, block_id, body):
    return client.put(f"/api/app/calendar_block/{block_id}", json=body, headers=_headers(app, ids["coach_user_id"]))


def _block_row(app, block_id):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        row = db.session.get(CalendarBlock, block_id)
        return {"title": row.title, "type": row.type, "start": row.start_datetime.isoformat(), "user_id": row.user_id,
                "is_recurring": row.is_recurring, "rule": row.recurrence_rule, "end": str(row.recurrence_end),
                "auto": row.blocks_auto_invitations}


WEEKLY = {**EVENT, "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]}, "endDate": "2026-12-01"}


@pytest.mark.parametrize("end", [None, ""], ids=["null (what both edit sheets send when cleared)", "empty-string"])
def test_calendar_edit_cannot_remove_the_end_date_of_a_block_that_still_recurs(app, client, end):
    """PAD-386, D83 (Coordinator, 2026-09-22): a NULL recurrence_end means "forever"
    downstream (the feed expands 400 days ahead; reminders and blocked windows
    likewise) and nothing creates one on purpose — the create sheets default the end.
    The only way to drop the end is to make the block one-off (#356's rule)."""
    ids = _seed(app)
    block = _event(app, client, ids, **{k: v for k, v in WEEKLY.items() if k not in EVENT or k == "isRecurring"})
    before = _block_row(app, block["id"])

    res = _put_event(app, client, ids, block["id"], {**WEEKLY, "title": "Physio", "endDate": end})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["endDate"]}
    assert _block_row(app, block["id"]) == before, "nothing written, the title beside it included"


@pytest.mark.parametrize("missing", ["type", "date", "startTime", "endTime"])
def test_calendar_edit_without_a_required_key_is_refused_not_a_500(app, client, missing):
    """PAD-386: `_build_payload` hard-subscripted these (KeyError → 500); a cleared web
    date/time input sends "" (ValueError → 500). 400 naming the field, nothing written."""
    ids = _seed(app)
    block = _event(app, client, ids)
    before = _block_row(app, block["id"])
    body = {k: v for k, v in EVENT.items() if k != missing}

    for bad in (body, {**EVENT, missing: ""}, {**EVENT, missing: None}):
        res = _put_event(app, client, ids, block["id"], {**bad, "title": "Physio"})
        assert res.status_code == 400, res.get_data(as_text=True)
        assert res.get_json()["error"] == "invalid_fields" and missing in res.get_json()["fields"]
    assert _block_row(app, block["id"]) == before


def test_calendar_edit_a_recurring_block_keeps_its_rule_when_the_body_does_not_mention_it(app, client):
    """Session-B on #378: rule and end are judged the same way — a sent-empty value is
    refused, an absent one against the row. A weekly block edited with
    `isRecurring: true` and no rule key keeps its rule; with `recurrenceRule: null` it is refused."""
    ids = _seed(app)
    block = _event(app, client, ids, **{k: v for k, v in WEEKLY.items() if k not in EVENT or k == "isRecurring"})
    body = {k: v for k, v in WEEKLY.items() if k != "recurrenceRule"}

    after = _edit_event(app, client, ids, block["id"], {**body, "title": "Physio"})
    assert after["isRecurring"] is True
    assert "weekly" in _block_row(app, block["id"])["rule"]

    res = _put_event(app, client, ids, block["id"], {**WEEKLY, "recurrenceRule": None})
    assert res.status_code == 400 and res.get_json()["fields"] == ["recurrenceRule"]


def test_calendar_edit_ignores_what_is_not_the_blocks_own_form(app, client):
    """PAD-386 (the binding rule from #366's review): present mode writes every key it
    is given, so the whitelist is the guard — the owner (`user`, a nullable ManyToOne)
    and the PAD-93 flag must be unreachable from the body."""
    ids = _seed(app)
    block = _event(app, client, ids)
    before = _block_row(app, block["id"])

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "title": "Physio", "user": None, "user_id": 999,
                                                        "blocks_auto_invitations": True, "blocksAutoInvitations": True})

    assert after["title"] == "Physio"
    row = _block_row(app, block["id"])
    assert (row["user_id"], row["auto"]) == (before["user_id"], before["auto"])


def test_calendar_edit_a_new_title_and_description_are_written(app, client):
    ids = _seed(app)
    block = _event(app, client, ids)

    after = _edit_event(app, client, ids, block["id"], {**EVENT, "title": "Physio", "description": "knee"})

    assert (after["title"], after["description"]) == ("Physio", "knee")


def test_calendar_edit_recurring_to_one_off_leaves_the_rule_and_the_end_date_on_the_row(app, client):
    """FLIPPED by PAD-377 (B-150), by the fix's author — this pin asserted the DEFECT and went red when
    `edit_event_service` began clearing the rule on an explicit `isRecurring: false`. Was: DEFECT PINNED, NOT FIXED (B-136). `is_recurring` has its own Boolean handler
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
        assert row.recurrence_rule is None, "PAD-377: an explicit one-off clears the rule"
        assert row.recurrence_end is None, "PAD-377: and the end date with it"


def test_calendar_edit_a_block_made_one_off_still_repeats_in_the_calendar_feed(app, client):
    """FLIPPED by PAD-377 (B-150), by the fix's author — this pin asserted the DEFECT and went red when
    `edit_event_service` began clearing the rule on an explicit `isRecurring: false`. Was: DEFECT PINNED, NOT FIXED (B-150) — the user-visible end of the test above. The
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
    assert dentist_days() == [(weekly[0][0], False)], "PAD-377: and the calendar serves that ONE day, as a one-off"


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
def test_edit_player_an_emptied_note_side_or_phone_is_cleared(app, client, cleared):
    """FIXED in PAD-388 (B-136 step 3). Was: the route diffed `updates` against
    `player`, so an emptied field WAS a change and reached the form as "" — where
    it was dropped; a coach could not delete a note, only overwrite it. Both null
    and "" clear (decided 2026-09-21); the shells send null (this ticket)."""
    ids = _seed(app)
    _give_the_student_a_phone(app, ids)

    _edit_player(app, client, ids, {"notes": cleared, "side": cleared, "phone": cleared})

    row = _roster_row(app, ids)
    assert row == {"notes": None, "side": None, "phone": None, "email": "student@test.com", "name": "Test Student"}


def _make_placeholder(app, ids):
    """The seed's student is an account holder; a placeholder has never activated and has no password."""
    from padel_app.models import User

    with app.app_context():
        user = db.session.get(User, ids["student_user_id"])
        user.password = None
        user.status = "inactive"
        db.session.commit()


@pytest.mark.parametrize("cleared", ["", None], ids=["empty-string", "null"])
def test_edit_player_a_placeholders_email_is_the_coachs_to_clear(app, client, cleared):
    ids = _seed(app)
    _make_placeholder(app, ids)

    _edit_player(app, client, ids, {"email": cleared})

    assert _roster_row(app, ids)["email"] is None


@pytest.mark.parametrize("sent", ["", None, "   ", "other@test.com"],
                         ids=["empty-string", "null", "whitespace", "another-address"])
def test_edit_player_an_account_holders_email_is_the_students_own(app, client, sent):
    """Coordinator, 2026-09-22 (widened after Session-B's review): once a student has
    an account (a password) the e-mail is their login and password recovery — the
    student's own field. A coach may neither clear nor change it: 400, nothing
    written (the note sent beside it included). Whitespace is a clear."""
    ids = _seed(app)  # activated: password set
    before = _roster_row(app, ids)

    player = {"coachId": ids["coach_id"], "playerId": ids["student_id"], "name": "Test Student",
              "email": "student@test.com", "phone": None, "side": "right", "notes": "left-handed, bad knee"}
    res = client.post("/api/app/edit_player", json={"player": player, "updates": {"email": sent, "notes": "new note"}},
                      headers=_headers(app, ids["coach_user_id"]))

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["email"]}
    assert _roster_row(app, ids) == before


def test_edit_player_a_placeholders_email_may_be_changed_by_the_coach(app, client):
    ids = _seed(app)
    _make_placeholder(app, ids)

    _edit_player(app, client, ids, {"email": "corrected@test.com"})

    assert _roster_row(app, ids)["email"] == "corrected@test.com"


@pytest.mark.parametrize("zero", [0, False, "0"], ids=["zero", "false", "string-zero"])
def test_edit_player_a_zero_level_is_refused_before_anything_is_written(app, client, zero):
    """Session-B's F3 on #371: the old code read 0 as "not sent"; present mode would
    have handed it to set_roster_level after the user part had already committed —
    a rename persisted, then a 500 on the level's FK. Refused up front, with the
    name beside it not written."""
    ids = _seed(app)
    before = _roster_row(app, ids)

    player = {"coachId": ids["coach_id"], "playerId": ids["student_id"], "name": "Test Student",
              "email": "student@test.com", "phone": None, "side": "right", "notes": "left-handed, bad knee"}
    res = client.post("/api/app/edit_player", json={"player": player, "updates": {"name": "Renamed", "levelId": zero}},
                      headers=_headers(app, ids["coach_user_id"]))

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["level"]}
    assert _roster_row(app, ids) == before


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

    _edit_player(app, client, ids, {"username": "hacked", "status": "disabled", "is_admin": True, "is_superadmin": True,
                                    "generated_code": 4321, "password": "x", "user": {"is_admin": True, "email": "x@y"},
                                    "notes": "still just a note"})

    with app.app_context():
        user = db.session.get(User, ids["student_user_id"])
        assert (user.username, user.status, user.is_admin, user.password) == before
        assert (user.is_superadmin, user.email) == (False, "student@test.com")
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


def _add_class(client, world, **over):
    body = {**world["body"], "name": "Zero", "startTime": "20:00", "endTime": "21:00", **over}
    for key, value in list(over.items()):
        if value is ABSENT_KEY:
            body.pop(key)
    return client.post("/api/app/add_class", headers=world["headers"], json=body)


ABSENT_KEY = object()


def _lesson_count(app):
    from padel_app.models.lessons import Lesson

    with app.app_context():
        return Lesson.query.count()


@pytest.mark.parametrize("capacity", [0, None, "", "0", -1, "abc", 2.5, "6.0", True, ABSENT_KEY],
                         ids=["zero", "null", "empty", "string-zero", "negative", "text", "fraction", "string-float", "true", "absent"])
def test_add_class_a_capacity_that_is_not_a_positive_integer_is_refused(app, client, capacity):
    """FIXED in PAD-390 (B-136 step 5). Was: `maxPlayers: 0` read as "not sent" and
    `lessons.max_players` NOT NULL → an unhandled IntegrityError (a 500); an absent
    key → KeyError (a 500). 0 is not a legal capacity (decided 2026-09-21): 400
    naming the field, and no lesson row."""
    world = _class_world(app, client)
    before = _lesson_count(app)

    res = _add_class(client, world, maxPlayers=capacity)

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["max_players"]}
    assert _lesson_count(app) == before


@pytest.mark.parametrize("name", ["", "   ", None, ABSENT_KEY], ids=["empty", "blank", "null", "absent"])
def test_add_class_without_a_name_is_refused(app, client, name):
    """PAD-390: `lessons.title` is NOT NULL; an empty name used to reach the column
    as NULL (a 500), an absent key a KeyError. The same 400 the edit route gives."""
    world = _class_world(app, client)
    before = _lesson_count(app)

    res = _add_class(client, world, name=name)

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["title"]}
    assert _lesson_count(app) == before


def test_add_class_with_both_wrong_names_both_fields(app, client):
    world = _class_world(app, client)

    res = _add_class(client, world, name="", maxPlayers=0)

    assert res.status_code == 400
    assert res.get_json() == {"error": "invalid_fields", "fields": ["title", "max_players"]}


def test_add_class_a_capacity_sent_as_a_numeric_string_is_stored_as_the_number(app, client):
    """The control: what the shells send (an integer) and what an old build might
    (an integer string) both create the class with that capacity. "6.0" is refused
    above: the check parses exactly as the write does (Session-B, #373), so nothing
    it admits can fail to convert."""
    from padel_app.models.lessons import Lesson

    world = _class_world(app, client)
    assert _add_class(client, world, maxPlayers="6").status_code == 200
    assert _add_class(client, world, name="Seven", maxPlayers=7).status_code == 200

    with app.app_context():
        rows = Lesson.query.order_by(Lesson.id.desc()).limit(2).all()
        assert sorted(r.max_players for r in rows) == [6, 7]


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
    """FLIPPED by PAD-377 (B-150), by the fix's author — this pin asserted the DEFECT and went red when
    `edit_event_service` began clearing the rule on an explicit `isRecurring: false`. Was: DEFECT PINNED, NOT FIXED (B-150, the consequence that costs someone a class).
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
    assert blocked_on(19) is False, "PAD-377: two Mondays later they are free again"
    assert blocked_on(20) is False, "the control: a Tuesday was never blocked"


def test_a_students_blocker_edit_clears_an_emptied_title_and_refuses_a_null_end_while_recurring(app, client):
    """PAD-386: the blockers share edit_event_service. The shared client builder
    sends `title: null` for an emptied reason and never a null end while recurring
    (it defaults +3 months); the server rule is the same either way (D83)."""
    ids = _seed(app)
    headers = _headers(app, ids["student_user_id"])
    away = {"title": "Away", "date": "2026-10-05", "startTime": "18:00", "endTime": "20:00",
            "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]}, "endDate": "2026-12-01"}
    created = client.post("/api/app/availability_blockers", headers=headers, json=away)
    assert created.status_code == 201, created.get_data(as_text=True)
    blocker_id = created.get_json()["id"]

    edited = client.put(f"/api/app/availability_blockers/{blocker_id}", headers=headers, json={**away, "title": None})
    assert edited.status_code == 200, edited.get_data(as_text=True)
    assert edited.get_json()["title"] is None

    refused = client.put(f"/api/app/availability_blockers/{blocker_id}", headers=headers, json={**away, "endDate": None})
    assert refused.status_code == 400, refused.get_data(as_text=True)
    assert refused.get_json() == {"error": "invalid_fields", "fields": ["endDate"]}
    assert _block_row(app, blocker_id)["end"] == "2026-12-01"


def test_a_block_edit_that_OMITS_isRecurring_rots_the_flag_of_a_genuinely_weekly_block(app, client):
    """FLAG ASSERTION FLIPPED by PAD-377 (B-150), by the fix's author: an edit that OMITS `isRecurring` now
    leaves the flag alone as well as the rule and the end date. The rule-and-end-date assertions
    are UNCHANGED — an absent key must never clear them. The flag is still not a safe key for a
    bulk repair of rows written BEFORE the fix. Was: DEFECT PINNED, NOT FIXED — and the reason no bulk repair may use the flag.
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
    assert after["isRecurring"] is True, "PAD-377: a rename says nothing about repetition, so nothing about it changes"
    with app.app_context():
        row = db.session.get(CalendarBlock, block["id"])
        assert row.recurrence_rule is not None and row.recurrence_end.isoformat() == "2026-12-01"


# ── POST /api/app/message (messaging_service.create_message_service) ─────────

def _conversation(app, client):
    ids = _seed(app)
    headers = _headers(app, ids["coach_user_id"])
    conversation = client.post("/api/app/conversation", json={"otherParticipants": [ids["student_user_id"]]}, headers=headers)
    assert conversation.status_code == 201, conversation.get_data(as_text=True)
    return conversation.get_json()["id"], headers


def _message_texts(app):
    from padel_app.models import Message

    with app.app_context():
        return [m.text for m in Message.query.order_by(Message.id)]


@pytest.mark.parametrize("text", ["", None, "   ", ABSENT_KEY], ids=["empty", "null", "whitespace", "absent"])
def test_message_with_no_text_is_refused_and_nothing_is_written(app, client, text):
    """FIXED in PAD-390 (B-136 step 5). Was: `""` read as "not sent" and
    `messages.text` NOT NULL → an unhandled IntegrityError; an absent key a
    KeyError — a 500 either way where a 400 belongs. Whitespace-only is refused
    too, as every blank rule of this family does (both composers trim and block)."""
    conversation_id, headers = _conversation(app, client)
    body = {"conversationId": conversation_id, "text": text}
    if text is ABSENT_KEY:
        body.pop("text")

    res = client.post("/api/app/message", json=body, headers=headers)

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["text"]}
    assert _message_texts(app) == []


def test_message_a_text_that_is_there_is_stored_as_sent(app, client):
    """The control: "0" is a text, and a text is stored as sent (no trimming —
    what the message says is the sender's)."""
    conversation_id, headers = _conversation(app, client)
    for text in ("0", "hello", " spaced "):
        assert client.post("/api/app/message", json={"conversationId": conversation_id, "text": text},
                           headers=headers).status_code == 201

    assert _message_texts(app) == ["0", "hello", " spaced "]


@pytest.mark.parametrize("text", ["", None, "   ", ABSENT_KEY], ids=["empty", "null", "whitespace", "absent"])
def test_message_edit_with_no_text_is_refused_and_the_message_is_unchanged(app, client, text):
    """Session-B on #373: the same defect on the same column, three lines away —
    PUT /message/<id> with `""` hit the NOT NULL column, an absent key a KeyError."""
    conversation_id, headers = _conversation(app, client)
    created = client.post("/api/app/message", json={"conversationId": conversation_id, "text": "hello"}, headers=headers)
    assert created.status_code == 201
    message_id = created.get_json()["id"]
    body = {"text": text}
    if text is ABSENT_KEY:
        body = {}

    res = client.put(f"/api/app/message/{message_id}", json=body, headers=headers)

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": ["text"]}
    assert _message_texts(app) == ["hello"]

    assert client.put(f"/api/app/message/{message_id}", json={"text": "hello, edited"}, headers=headers).status_code == 200
    assert _message_texts(app) == ["hello, edited"]


# ── POST /api/app/class_instance/presences/confirm (lesson_service.add_presences) ──

def test_attendance_a_justification_cannot_be_cleared_and_a_mark_cannot_be_undone(app, client):
    """FIRST HALF FLIPPED by PAD-381 (B-152), by the fix's author: recording `present` now CLEARS the
    justification (a domain rule in `lesson_service.add_presences`, not the form layer), so the two
    `present` assertions expect `('present', None)`. The SECOND half is unchanged in meaning — a mark
    still cannot be un-marked (status stays `present`; an open product question) — but the
    justification those two assertions inherit is now None, because the step before them cleared
    it. The control is untouched. Was: DEFECT PINNED, NOT FIXED (B-136). Absent-and-justified, then present: the
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
        assert confirm(status="present", justification="") == ("present", None), "PAD-381: present clears it"
        assert confirm(status="present", justification=None) == ("present", None)
        assert confirm(status=None, justification=None) == ("present", None), "cannot be un-marked (unchanged); the justification it inherits is now None"
        assert confirm(status="", justification="") == ("present", None)
        assert confirm(status="absent", justification="unjustified") == ("absent", "unjustified"), "the control"


# ── POST /api/app/activate/user/<id> (user_service.activate_user_service) ────

def _inactive_user(app, **over):
    from padel_app.models import User
    from padel_app.tools.activation_token import activation_token_for

    with app.app_context():
        fields = dict(name="Invited", username="pending-abc", password=None, status="inactive",
                      email="coach-typed@test.com", phone="+351933333333")
        fields.update(over)
        user = User(**fields)
        db.session.add(user)
        db.session.commit()
        return user.id, activation_token_for(user)


def _user_row(app, user_id):
    from padel_app.models import User

    with app.app_context():
        row = db.session.get(User, user_id)
        return {"status": row.status, "name": row.name, "username": row.username, "email": row.email,
                "phone": row.phone, "has_password": row.password is not None}


ACTIVATION_BODY = {"name": "Invited Player", "username": "invited", "password": "S3cret-pass!"}


def test_activation_an_emptied_prefilled_phone_or_email_is_cleared(app, client):
    """FIXED in PAD-389 (B-136 step 4). The activation form is PRE-FILLED with what
    the coach typed (GET /register/user), so an emptied box is the student's intent
    (design note, step 4). Was: "" dropped, the coach's phone silently kept. Both
    shells send every key, "" when emptied; zod stops an empty e-mail on the client,
    so only the phone is reachable today — the e-mail rule is the server's own."""
    user_id, token = _inactive_user(app)

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **ACTIVATION_BODY, "email": "", "phone": ""})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _user_row(app, user_id) == {"status": "active", "name": "Invited Player", "username": "invited",
                                      "email": None, "phone": None, "has_password": True}


def test_activation_an_absent_key_keeps_what_the_coach_entered(app, client):
    """An omitted key still means keep — a body that does not mention the e-mail or
    phone (a partial client, or a future one that sends a diff) changes neither."""
    user_id, token = _inactive_user(app)

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **ACTIVATION_BODY})

    assert res.status_code == 200, res.get_data(as_text=True)
    row = _user_row(app, user_id)
    assert (row["status"], row["email"], row["phone"]) == ("active", "coach-typed@test.com", "+351933333333")


@pytest.mark.parametrize("bad,fields", [
    ({"name": ""}, ["name"]), ({"name": "   "}, ["name"]), ({"name": None}, ["name"]),
    ({"username": ""}, ["username"]), ({"username": "  "}, ["username"]),
    ({"password": ""}, ["password"]), ({"password": "   "}, ["password"]),
    ({"name": "", "password": ""}, ["name", "password"]),
], ids=["empty-name", "blank-name", "null-name", "empty-username", "blank-username", "empty-password",
        "blank-password", "two-at-once"])
def test_activation_a_blank_name_username_or_password_is_refused_and_nothing_is_written(app, client, bad, fields):
    """PAD-389: name and username are NOT NULL, and activation IS setting the password
    — an empty one used to leave the account active with no password at all. A
    whitespace-only name passes the shells' zod (min(2) on the untrimmed string)."""
    user_id, token = _inactive_user(app)

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **ACTIVATION_BODY, **bad, "phone": ""})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": fields}
    row = _user_row(app, user_id)
    assert (row["status"], row["name"], row["username"], row["phone"], row["has_password"]) == \
           ("inactive", "Invited", "pending-abc", "+351933333333", False), "nothing written, the phone included"


def test_activation_without_a_username_keeps_no_placeholder_login(app, client):
    """Session-B on #372: an ABSENT username would have activated the account under
    its generated `pending-…` placeholder — rule 10 blanks it in the form exactly so
    the student chooses one. A user who already chose a username may omit it."""
    user_id, token = _inactive_user(app)  # username "pending-abc": a placeholder
    body = {k: v for k, v in ACTIVATION_BODY.items() if k != "username"}

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **body})

    assert res.status_code == 400
    assert res.get_json() == {"error": "invalid_fields", "fields": ["username"]}
    assert _user_row(app, user_id)["status"] == "inactive"

    chosen_id, chosen_token = _inactive_user(app, username="chosen-already", email="c@test.com", phone=None)
    res = client.post(f"/api/app/activate/user/{chosen_id}", json={"token": chosen_token, **body})
    assert res.status_code == 200, res.get_data(as_text=True)
    assert _user_row(app, chosen_id)["username"] == "chosen-already"


def test_activation_stores_the_username_it_checked(app, client):
    user_id, token = _inactive_user(app)

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **ACTIVATION_BODY, "username": "  spaced  "})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _user_row(app, user_id)["username"] == "spaced"


def test_activation_without_a_password_is_refused(app, client):
    """PAD-389: an absent password is not "keep" — a placeholder has none to keep."""
    user_id, token = _inactive_user(app)
    body = {k: v for k, v in ACTIVATION_BODY.items() if k != "password"}

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **body})

    assert res.status_code == 400
    assert res.get_json() == {"error": "invalid_fields", "fields": ["password"]}
    assert _user_row(app, user_id)["status"] == "inactive"


def test_activation_with_a_taken_username_is_409_and_writes_nothing(app, client):
    """PAD-389: the same answer as invite-completion and self-signup give (was an
    IntegrityError on the unique index — a 500)."""
    _inactive_user(app, username="taken-one", email="other@test.com", phone=None)
    user_id, token = _inactive_user(app)

    res = client.post(f"/api/app/activate/user/{user_id}", json={"token": token, **ACTIVATION_BODY, "username": "taken-one"})

    assert res.status_code == 409, res.get_data(as_text=True)
    assert res.get_json()["error"] == "Username already taken"
    assert _user_row(app, user_id)["status"] == "inactive"


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
