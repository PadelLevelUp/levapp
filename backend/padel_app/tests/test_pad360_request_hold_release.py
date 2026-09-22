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


# ── #345 review (Session-B, 2026-09-21): each finding verified by running it ──

def _spy_on_every_channel(monkeypatch):
    """Silent means nothing on ANY channel, not only no Message row (review F6)."""
    calls = []
    import padel_app.realtime as realtime
    import padel_app.utils.expo_push as expo_push
    import padel_app.utils.push_notifications as web_push

    monkeypatch.setattr(realtime, "publish", lambda *a, **k: calls.append(("sse", a)))
    monkeypatch.setattr(web_push, "send_push_notification", lambda *a, **k: calls.append(("web-push", k)))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: calls.append(("expo", k)))
    return calls


def _weekly_request(app, ids):
    from datetime import timedelta

    from padel_app.services.class_request_service import create_class_request_service

    with app.app_context():
        row = create_class_request_service(_player(ids["player_id"]), {
            "coachId": ids["coach_id"], "date": DAY.isoformat(), "startTime": "11:00", "endTime": "12:00",
            "recurrence": {"weekdays": [DAY.isoweekday()], "startDate": DAY.isoformat(),
                           "endDate": (DAY + timedelta(days=28)).isoformat()},
        })
        return row.id, row.hold_block_id


def _second_coach_for_the_student(app, ids):
    from padel_app.models import Association_CoachClub, Association_CoachPlayer, Club, Coach, User

    with app.app_context():
        user = User(name="Coach B", username="coach-b", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=Club.query.first().id))
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=ids["player_id"]))
        db.session.commit()
        return {"coach_id": coach.id, "coach_user_id": user.id}


def _import_record(app, ids, *, players, users=(), coach_players=()):
    import json

    from padel_app.models.bulk_import import BulkImport

    with app.app_context():
        record = BulkImport(coach_id=ids["coach_id"], filename="roster.xlsx", status="active", summary="{}",
                            record_ids=json.dumps({"coach_players": list(coach_players), "players": list(players),
                                                   "users": list(users)}))
        db.session.add(record)
        db.session.commit()
        return record.id


def _revert(app, ids, import_id):
    from padel_app.models import Coach
    from padel_app.services.import_service import revert_import

    with app.app_context():
        return revert_import(import_id, db.session.get(Coach, ids["coach_id"]))


def test_F1_reverting_an_import_releases_the_holds_of_the_students_it_deletes(app):
    """An imported student activates in place (same Player id) and asks for a
    class; the revert bulk-deletes the Player — no ORM hook — and the database
    cascades the request away. Observed before the fix (18:37 UTC, 9ecd238a2):
    request gone, hold still on the calendar."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    import_id = _import_record(app, ids, players=[ids["player_id"]], users=[_user_id_of_player(app, ids["player_id"])])

    result = _revert(app, ids, import_id)

    assert result["status"] == "reverted"
    assert _state(app, rid) is None
    assert not _block_exists(app, hold), "hold block outlived its request"


def test_F1_reverting_an_import_with_no_requests_touches_no_calendar_block(app):
    """Trigger absent."""
    ids = _setup(app)
    _busy(app, ids, block_at=(time(15, 0), time(16, 0)))
    import_id = _import_record(app, ids, players=[ids["player_id"]], users=[_user_id_of_player(app, ids["player_id"])])

    assert _revert(app, ids, import_id)["status"] == "reverted"

    assert _blocks_of_coach(app, ids) == 1


def test_F3_a_malformed_invitee_list_elsewhere_cannot_fail_an_account_deletion(app):
    """Observed before the fix: ValueError from int('abc') aborted the deletion."""
    from padel_app.models import ClassRequest

    ids = _setup(app)
    with app.app_context():
        carla = _add_student(ids["coach_id"], "carla", level_id=ids["level_ids"]["5"])
        db.session.commit()
    hers = _request(app, ids, pid=carla)
    with app.app_context():
        db.session.get(ClassRequest, hers).invitee_player_ids = ["abc", str(ids["player_id"])]
        db.session.commit()

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert _state(app, hers)["invitees"] == ["abc"], "the deleted student is gone; what we cannot read is left alone"


def test_F7_an_editor_edit_that_closes_a_request_releases_its_hold(app, client):
    """Observed before the fix: PATCH status=declined left the hold in place."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    res = client.patch(f"/api/editor/classrequest/{rid}", json={"values": {"status": "declined"}}, headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    state = _state(app, rid)
    assert (state["status"], state["hold"]) == ("declined", None)
    assert not _block_exists(app, hold)


def test_F7_an_editor_edit_that_leaves_a_request_open_keeps_its_hold(app, client):
    """Trigger absent: the hook must not fire on every update of an open request."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    res = client.patch(f"/api/editor/classrequest/{rid}", json={"values": {"note": "edited by an admin"}}, headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert (_state(app, rid)["status"], _state(app, rid)["hold"]) == ("pending", hold)
    assert _block_exists(app, hold)


def test_F6_silent_means_no_channel_at_all(app, monkeypatch):
    ids = _setup(app)
    rid = _request(app, ids)
    calls = _spy_on_every_channel(monkeypatch)  # after the request, whose own notice is not under test

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert _state(app, rid)["status"] == "withdrawn"
    assert calls == [], f"something was sent: {calls}"


def test_F6_a_deleting_coach_leaves_the_students_request_to_another_coach_alone(app):
    from padel_app.services.class_request_service import create_class_request_service

    ids = _setup(app)
    other = _second_coach_for_the_student(app, ids)
    to_a = _request(app, ids, start="11:00", end="12:00")
    with app.app_context():
        to_b = create_class_request_service(_player(ids["player_id"]), {
            "coachId": other["coach_id"], "date": DAY.isoformat(), "startTime": "13:00", "endTime": "14:00"}).id
    hold_b = _hold_of(app, to_b)

    _delete_account(app, ids["coach_user_id"])

    assert _state(app, to_a)["status"] == "declined"
    assert _state(app, to_b)["status"] == "pending" and _block_exists(app, hold_b)


def test_F6_a_countered_request_and_a_weekly_hold_are_closed_and_released_too(app):
    ids = _setup(app)
    countered = _request(app, ids, start="11:00", end="12:00")
    _decide(app, ids, countered, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00")
    assert _state(app, countered)["status"] == "countered"
    countered_hold = _hold_of(app, countered)

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert (_state(app, countered)["status"], _state(app, countered)["by"]) == ("withdrawn", "student")
    assert not _block_exists(app, countered_hold)
    assert _blocks_of_coach(app, ids) == 0


def test_F6_a_weekly_requests_recurring_hold_is_released_by_account_deletion(app):
    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    assert _block_exists(app, hold)

    _delete_account(app, _user_id_of_player(app, ids["player_id"]))

    assert _state(app, rid)["status"] == "withdrawn"
    assert _blocks_of_coach(app, ids) == 0


def test_F2_a_moved_occurrence_of_a_weekly_hold_is_refused_so_nothing_outlives_the_request(app):
    """Review F2, closed by PAD-372 (B-138). This pin used to record the defect: moving one
    occurrence of a recurring hold went through `calendar_service._clone_block`, the
    clone copied the title and no request pointed at it, so no release path deleted it
    (2 blocks then 1; after PAD-371's split 3 then 2 — two unlinked clones outliving
    the request under the student's name).

    Decided as REFUSAL: on accept the class is built from the REQUEST's recurrence and a
    proposal moves the SERIES, so a `single`/`future` change to a live hold alters
    nothing the product honours. The service now raises 409 `HOLD_OCCURRENCE_LOCKED`,
    the hold is untouched, and withdraw leaves the coach's calendar empty. The route-level
    2×2 lives in `test_pad372_hold_occurrence_change_is_refused.py`.

    What still holds for any cleanup: a hold-titled block that no request references may
    be a clone left by the OLD code on production — never delete one on its title alone
    (PAD-360's v2 count reports those separately)."""
    from datetime import timedelta

    import pytest
    from werkzeug.exceptions import Conflict

    from padel_app.services.calendar_service import reschedule_block_service
    from padel_app.services.class_request_service import withdraw_class_request_service

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    moved = (DAY + timedelta(days=14)).isoformat()
    with app.app_context():
        with pytest.raises(Conflict, match="HOLD_OCCURRENCE_LOCKED"):
            reschedule_block_service(hold, ids["coach_user_id"], {
                "occDate": moved, "newDate": moved, "newStartTime": "15:00", "newEndTime": "16:00", "scope": "single"})
        db.session.rollback()
    assert _blocks_of_coach(app, ids) == 1, "the hold alone: nothing split, nothing cloned"

    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))

    assert not _block_exists(app, hold)
    assert _blocks_of_coach(app, ids) == 0, "nothing outlives the request"


# ── #345 review, 2nd round: a coach can make a hold their own (rule 3) ────────
#
# Run at the route: PUT /api/app/calendar_block/<hold> answers 200 to the coach —
# new title, new time — and the request still points at the block. So a CLOSED
# request's leftover pointer (a pre-PAD-360 row) must not take a repurposed block
# with it when the hooks meet it later. Safe by construction, not by a count.

def _a_closed_request_that_still_points_at_its_block(app, client, ids, *, repurposed):
    """A pre-PAD-360 row. Raw SQL closes it, so no hook runs and the pointer stays."""
    from sqlalchemy import text

    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    if repurposed:
        with app.app_context():
            headers = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}
        res = client.put(f"/api/app/calendar_block/{hold}", headers=headers, json={
            "type": "personal", "title": "Physio", "description": "mine now", "date": DAY.isoformat(),
            "startTime": "11:30", "endTime": "12:30", "isRecurring": False})
        assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        db.session.execute(text("UPDATE class_requests SET status = 'declined' WHERE id = :id"), {"id": rid})
        db.session.commit()
    assert (_state(app, rid)["status"], _state(app, rid)["hold"]) == ("declined", hold)
    return rid, hold


@pytest.mark.parametrize("repurposed, block_survives", [(True, True), (False, False)],
                         ids=["a-block-the-coach-made-their-own-stays", "an-untouched-hold-is-cleaned-up"])
def test_a_later_edit_of_an_already_closed_request(app, client, repurposed, block_survives):
    ids = _setup(app)
    rid, hold = _a_closed_request_that_still_points_at_its_block(app, client, ids, repurposed=repurposed)

    res = client.patch(f"/api/editor/classrequest/{rid}", json={"values": {"note": "edited later"}}, headers=_root(app))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _block_exists(app, hold) is block_survives
    assert _state(app, rid)["hold"] is None, "either way the stale pointer goes"


@pytest.mark.parametrize("repurposed, block_survives", [(True, True), (False, False)],
                         ids=["a-block-the-coach-made-their-own-stays", "an-untouched-hold-is-cleaned-up"])
def test_deleting_an_already_closed_request(app, client, repurposed, block_survives):
    ids = _setup(app)
    rid, hold = _a_closed_request_that_still_points_at_its_block(app, client, ids, repurposed=repurposed)

    assert client.delete(f"/api/editor/classrequest/{rid}", headers=_root(app)).status_code == 200

    assert _state(app, rid) is None
    assert _block_exists(app, hold) is block_survives


def test_deleting_the_player_of_an_already_closed_request_keeps_a_block_the_coach_made_their_own(app, client):
    ids = _setup(app)
    rid, hold = _a_closed_request_that_still_points_at_its_block(app, client, ids, repurposed=True)

    assert client.delete(f"/api/editor/player/{ids['player_id']}", headers=_root(app)).status_code == 200

    assert _state(app, rid) is None
    assert _block_exists(app, hold)


def test_reverting_an_import_keeps_a_block_the_coach_made_their_own_on_a_closed_request(app, client):
    ids = _setup(app)
    rid, hold = _a_closed_request_that_still_points_at_its_block(app, client, ids, repurposed=True)
    import_id = _import_record(app, ids, players=[ids["player_id"]], users=[_user_id_of_player(app, ids["player_id"])])

    assert _revert(app, ids, import_id)["status"] == "reverted"

    assert _block_exists(app, hold)


def test_an_open_requests_retitled_block_stays_when_it_closes(app, client):
    """Rule 18 (PAD-378, B-151; this was the REFERENCE pin of the old behaviour, which
    deleted it). A hold the coach retitled is theirs: closing the request clears the pointer
    and leaves the block. Every path is in test_pad378_retitled_hold_is_the_coachs.py."""
    from padel_app.services.class_request_service import withdraw_class_request_service

    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}
    assert client.put(f"/api/app/calendar_block/{hold}", headers=headers, json={
        "type": "personal", "title": "Physio", "date": DAY.isoformat(), "startTime": "11:30", "endTime": "12:30",
        "isRecurring": False}).status_code == 200

    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))

    assert _block_exists(app, hold)
    assert _state(app, rid)["hold"] is None
