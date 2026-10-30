"""PAD-803 (B-714; notifications.waiting-list rules 4e and 18–19): the coach adding a student to a
class's waiting list says which side the student waits for — right, left or both. The profile side
comes preselected; with no profile side the coach must pick. A client that sends no side (old
builds) gets the profile side. Rows already stored with no side stay as they are.

Before the fix `POST /api/app/notify/class_waiting_list` ignored `side`: every row it made, and the
standing entry a series add made, had no side ("any spot").
"""
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student
from padel_app.tests.test_pad358_academy_classes import _add_class, _setup
from padel_app.tests.test_pad547_coach_adds_to_class_waiting_list import _quiet


def _world(app, *, recurring=False, profile_side="left"):
    ids = _setup(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    cls = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1, recurring=recurring)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "p803", level_id=ids["level_ids"]["5"], side=profile_side)
        db.session.commit()
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}
    return ids, cls, pid, headers


CAPABLE = {"X-LevApp-Capabilities": "waiting-list-side"}  # the shells that ship the side picker


def _post(client, headers, cls, pid, **extra):
    body = {"model": "LessonInstance", "originalId": cls["instance_id"], "playerId": pid, **extra}
    return client.post("/api/app/notify/class_waiting_list", headers=headers, json=body)


def _row_side(app, instance_id, pid):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    with app.app_context():
        return WaitingListEntry.query.filter_by(lesson_instance_id=instance_id, player_id=pid).one().side


def test_the_side_the_coach_picks_is_stored(app, client, monkeypatch):
    """RED before the fix: stored None."""
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app)
    res = _post(client, headers, cls, pid, scope="occurrence", side="right")
    assert res.status_code == 201
    assert _row_side(app, cls["instance_id"], pid) == "right"


def test_an_old_client_sending_no_side_gets_the_profile_side(app, client, monkeypatch):
    """RED before the fix: stored None. (The default is pending the owner's answer.)"""
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app)
    assert _post(client, headers, cls, pid, scope="occurrence").status_code == 201
    assert _row_side(app, cls["instance_id"], pid) == "left"


def test_a_series_add_carries_the_side_to_the_standing_entry_and_its_rows(app, client, monkeypatch):
    """RED before the fix: the standing entry and its rows had no side."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry

    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app, recurring=True)
    assert _post(client, headers, cls, pid, scope="series", side="both").status_code == 201
    with app.app_context():
        entry = StandingWaitingListEntry.query.filter_by(player_id=pid, is_active=True).one()
        rows = WaitingListEntry.query.filter_by(standing_entry_id=entry.id, is_active=True).all()
        assert entry.side == "both"
        assert rows and {r.side for r in rows} == {"both"}


def test_with_no_profile_side_the_coach_must_pick_one(app, client, monkeypatch):
    """RED before the fix: 201, a row with no side. The picker's client declares `waiting-list-side`
    (rule 18a); an older one is the next test."""
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app, profile_side=None)
    headers = {**headers, **CAPABLE}
    res = _post(client, headers, cls, pid, scope="occurrence")
    assert res.status_code == 400
    assert _post(client, headers, cls, pid, scope="occurrence", side="both").status_code == 201
    assert _row_side(app, cls["instance_id"], pid) == "both"


def test_an_unknown_side_is_refused(app, client, monkeypatch):
    """RED before the fix: 201."""
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app)
    assert _post(client, headers, cls, pid, scope="occurrence", side="middle").status_code == 400


def test_an_older_client_adds_a_student_with_no_profile_side_as_before(app, client, monkeypatch):
    """Control: a build before the picker sends no side and no capability: 201, a row with no side."""
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app, profile_side=None)
    assert _post(client, headers, cls, pid, scope="occurrence").status_code == 201
    assert _row_side(app, cls["instance_id"], pid) is None


def test_the_class_list_returns_each_rows_side(app, client, monkeypatch):
    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app)
    _post(client, headers, cls, pid, scope="occurrence", side="right")
    with app.app_context():
        from padel_app.services.notification_service import get_waiting_list

        assert [r["side"] for r in get_waiting_list(cls["instance_id"])] == ["right"]


def test_a_change_of_scope_carries_the_rows_side_to_the_series_entry(app, client, monkeypatch):
    """Rule 22 with 18a: an occurrence row moved to the whole series keeps its side."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry

    _quiet(monkeypatch)
    ids, cls, pid, headers = _world(app, recurring=True)
    _post(client, headers, cls, pid, scope="occurrence", side="right")
    with app.app_context():
        row_id = WaitingListEntry.query.filter_by(lesson_instance_id=cls["instance_id"], player_id=pid).one().id
    res = client.patch(f"/api/app/notify/class_waiting_list/{row_id}", headers=headers, json={"scope": "series"})
    assert res.status_code == 200, res.get_json()
    with app.app_context():
        entry = StandingWaitingListEntry.query.filter_by(player_id=pid, is_active=True).one()
        rows = WaitingListEntry.query.filter_by(standing_entry_id=entry.id, is_active=True).all()
        assert entry.side == "right"
        assert rows and {r.side for r in rows} == {"right"}
