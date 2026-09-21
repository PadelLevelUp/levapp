"""PAD-360 / B-135 — classes.class-requests rule 18: a hold never outlives its
request, however the request goes away.

Before PAD-360 only withdraw, decline and accept released the hold. These
tests were first run against origin/staging 00e53375f (2026-09-21 17:55 UTC)
as a reproduction: the three controls passed and every other path failed.
The controls stay here as the trigger-absent half of the 2×2.
"""
from datetime import time

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import DAY, _busy, _coach, _decide, _player, _request, _setup
from padel_app.tests.test_pad128_eligibility import _add_student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _hold_of(app, rid):
    from padel_app.models import ClassRequest

    with app.app_context():
        return db.session.get(ClassRequest, rid).hold_block_id


def _block_exists(app, block_id):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        return db.session.get(CalendarBlock, block_id) is not None


def _blocks_of_coach(app, ids):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        return CalendarBlock.query.filter_by(user_id=ids["coach_user_id"]).count()


def _state(app, rid):
    from padel_app.models import ClassRequest

    with app.app_context():
        row = db.session.get(ClassRequest, rid)
        if row is None:
            return None
        return {"status": row.status, "by": row.decided_by, "hold": row.hold_block_id,
                "decided": row.decided_at is not None, "invitees": row.invitee_player_ids}


def _messages(app):
    from padel_app.models import Message

    with app.app_context():
        return Message.query.count()


def _user_id_of_player(app, pid):
    from padel_app.models.players import Player

    with app.app_context():
        return db.session.get(Player, pid).user_id


def _delete_account(app, user_id):
    from padel_app.services.account_service import delete_account_service

    with app.app_context():
        delete_account_service(user_id)


def _root(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="root", username="root", password="x", status="active", is_superadmin=True)
        db.session.add(user)
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}


# ── controls: the transitions that always released the hold ──────────────────

def test_control_withdraw_releases_the_hold(app):
    from padel_app.services.class_request_service import withdraw_class_request_service

    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    assert hold is not None and _block_exists(app, hold)
    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))
    assert not _block_exists(app, hold)


def test_control_decline_releases_the_hold(app):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    _decide(app, ids, rid, "decline")
    assert not _block_exists(app, hold)


def test_control_accept_releases_the_hold(app):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    _decide(app, ids, rid, "accept")
    assert not _block_exists(app, hold)


# ── the row is deleted: both generic editor routes ───────────────────────────

def test_editor_api_delete_releases_the_hold_and_nothing_else(app, client):
    ids = _setup(app)
    _busy(app, ids, block_at=(time(15, 0), time(16, 0)))  # the coach's own block
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    assert _blocks_of_coach(app, ids) == 2

    res = client.delete(f"/api/editor/classrequest/{rid}", headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _state(app, rid) is None
    assert not _block_exists(app, hold), "hold block outlived its request"
    assert _blocks_of_coach(app, ids) == 1, "only the hold goes; the coach's own block stays"


def test_legacy_delete_route_releases_the_hold(app, client):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    res = client.post(f"/api/delete/classrequest/{rid}", headers=_root(app))

    assert res.status_code < 400, res.get_data(as_text=True)
    assert _state(app, rid) is None
    assert not _block_exists(app, hold), "hold block outlived its request"


def test_deleting_a_closed_request_still_works(app, client):
    """Trigger absent: a request with no hold left deletes as before."""
    ids = _setup(app)
    rid = _request(app, ids)
    _decide(app, ids, rid, "decline")
    assert _state(app, rid)["hold"] is None

    res = client.delete(f"/api/editor/classrequest/{rid}", headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _state(app, rid) is None


# ── the row is cascaded away ─────────────────────────────────────────────────

def test_deleting_the_player_releases_the_hold(app, client):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    res = client.delete(f"/api/editor/player/{ids['player_id']}", headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _state(app, rid) is None, "FK CASCADE should have taken the request"
    assert not _block_exists(app, hold), "hold block outlived its request"


def test_deleting_the_coach_releases_the_hold(app):
    """The Coach row goes; the coach's user — who owns the block — does not."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    with app.app_context():
        _coach(ids).delete()

    assert _state(app, rid) is None, "FK CASCADE should have taken the request"
    assert not _block_exists(app, hold), "hold block outlived its request"


# ── the person deletes their account ─────────────────────────────────────────

def test_student_account_deletion_withdraws_silently_and_releases_the_hold(app):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    sent = _messages(app)

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    state = _state(app, rid)
    assert not _block_exists(app, hold), "a deleted student still holds the coach's slot"
    assert (state["status"], state["by"], state["hold"], state["decided"]) == ("withdrawn", "student", None, True)
    assert _messages(app) == sent, "silent: no notification in either direction"


def test_coach_account_deletion_declines_silently(app):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    sent = _messages(app)

    _delete_account(app, ids["coach_user_id"])

    state = _state(app, rid)
    assert not _block_exists(app, hold)
    assert (state["status"], state["by"], state["hold"], state["decided"]) == ("declined", "coach", None, True)
    assert _messages(app) == sent, "silent: no notification in either direction"


def test_a_deleted_student_leaves_other_peoples_open_requests(app):
    from padel_app.models import ClassRequest

    ids = _setup(app)
    with app.app_context():
        carla = _add_student(ids["coach_id"], "carla", level_id=ids["level_ids"]["5"])
        db.session.commit()
    rid = _request(app, ids, pid=carla)
    with app.app_context():
        db.session.get(ClassRequest, rid).invitee_player_ids = [ids["player_id"]]
        db.session.commit()
    hold = _hold_of(app, rid)

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    state = _state(app, rid)
    assert state["status"] == "pending" and _block_exists(app, hold), "Carla's request is hers; it stays"
    assert not state["invitees"], "an accept must never enrol a deleted account"


def test_account_deletion_leaves_closed_requests_alone(app):
    """Trigger absent: history is not rewritten."""
    ids = _setup(app)
    declined = _request(app, ids, start="11:00", end="12:00")
    _decide(app, ids, declined, "decline")
    accepted = _request(app, ids, start="13:00", end="14:00")
    _decide(app, ids, accepted, "accept")

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert (_state(app, declined)["status"], _state(app, declined)["by"]) == ("declined", "coach")
    assert (_state(app, accepted)["status"], _state(app, accepted)["by"]) == ("accepted", "coach")


def test_account_deletion_without_requests_is_unchanged(app):
    """Trigger absent: a student who never asked for a class deletes as before."""
    from padel_app.models import User

    ids = _setup(app)
    user_id = _user_id_of_player(app, ids["player_id"])

    _delete_account(app, user_id)

    with app.app_context():
        assert db.session.get(User, user_id).status == "disabled"


def test_the_silent_close_refuses_to_run_unscoped(app):
    """Nobody named would mean every open request of every coach."""
    from padel_app.services.class_request_service import close_open_requests_silently

    ids = _setup(app)
    rid = _request(app, ids)
    with app.app_context():
        with pytest.raises(ValueError):
            close_open_requests_silently(status="declined", by="coach")
    assert _state(app, rid)["status"] == "pending"


def test_the_silent_close_touches_only_the_named_student(app):
    ids = _setup(app)
    with app.app_context():
        carla = _add_student(ids["coach_id"], "carla", level_id=ids["level_ids"]["5"])
        db.session.commit()
    mine = _request(app, ids, start="11:00", end="12:00")
    hers = _request(app, ids, start="13:00", end="14:00", pid=carla)

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert _state(app, mine)["status"] == "withdrawn"
    assert _state(app, hers)["status"] == "pending" and _block_exists(app, _hold_of(app, hers))


# ── left out on purpose (PAD-360 comment, owner decision pending) ────────────

def test_disconnecting_the_student_keeps_the_open_request_and_its_hold(app):
    """Pins today's behaviour so the follow-up changes it deliberately."""
    from padel_app.services.player_service import remove_player_service

    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    with app.app_context():
        remove_player_service({"coachId": ids["coach_id"], "playerId": ids["player_id"], "action": "disconnect"})

    assert _state(app, rid)["status"] == "pending"
    assert _block_exists(app, hold)


def test_day_is_in_the_future():
    """The fixtures book DAY (+10 days); a past DAY would make every request a refusal."""
    from padel_app.utils.dates import utcnow_naive

    assert DAY > utcnow_naive().date()
