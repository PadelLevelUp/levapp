"""PAD-378 (B-151): a hold the coach has retitled is theirs — closing or removing the request
clears the pointer and leaves the block.

`classes.class-requests` rule 18. The 2×2 is block (retitled / untouched) × every path a request
lets go of its hold: withdraw, decline, accept, the ORM delete, an edit that closes it, the
cascade from deleting the player, and a counter-proposal that re-places the hold. An untouched
hold must still go on every path (B-135's fix); a moved one keeps the hold title, so it is still
the hold and goes too.
"""
from datetime import time

import pytest
from flask_jwt_extended import create_access_token

from padel_app.tests.test_pad104_class_requests import DAY, _decide, _free, _player, _request, _setup
from padel_app.tests.test_pad360_request_hold_release import (  # noqa: F401
    _block_exists,
    _blocks_of_coach,
    _hold_of,
    _jwt_secret,
    _root,
    _state,
)


def _edit_block(app, client, ids, block_id, *, title=None, start="11:00", end="12:00"):
    """The coach edits the hold through the calendar route, as the event editor does."""
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.sql_db import db

    with app.app_context():
        current = db.session.get(CalendarBlock, block_id).title
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}
    res = client.put(f"/api/app/calendar_block/{block_id}", headers=headers, json={
        "type": "personal", "title": title or current, "date": DAY.isoformat(),
        "startTime": start, "endTime": end, "isRecurring": False})
    assert res.status_code == 200, res.get_data(as_text=True)


def _block_title(app, block_id):
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.sql_db import db

    with app.app_context():
        block = db.session.get(CalendarBlock, block_id)
        return None if block is None else block.title


def _withdraw(app, client, ids, rid):
    from padel_app.services.class_request_service import withdraw_class_request_service

    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))


def _decline(app, client, ids, rid):
    _decide(app, ids, rid, "decline")


def _accept(app, client, ids, rid):
    _decide(app, ids, rid, "accept")


def _editor_delete(app, client, ids, rid):
    assert client.delete(f"/api/editor/classrequest/{rid}", headers=_root(app)).status_code == 200


def _editor_close(app, client, ids, rid):
    res = client.patch(f"/api/editor/classrequest/{rid}", json={"values": {"status": "declined"}}, headers=_root(app))
    assert res.status_code == 200, res.get_data(as_text=True)


def _delete_player(app, client, ids, rid):
    assert client.delete(f"/api/editor/player/{ids['player_id']}", headers=_root(app)).status_code == 200


PATHS = {
    "withdraw": _withdraw,
    "decline": _decline,
    "accept": _accept,
    "editor-delete": _editor_delete,
    "editor-close": _editor_close,
    "player-cascade": _delete_player,
}


@pytest.mark.parametrize("path", sorted(PATHS))
def test_a_retitled_hold_stays_as_the_coachs_block(app, client, path):
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    _edit_block(app, client, ids, hold, title="Physio", start="11:30", end="12:30")

    PATHS[path](app, client, ids, rid)

    assert _block_title(app, hold) == "Physio", f"{path} deleted the coach's event"
    state = _state(app, rid)
    assert state is None or state["hold"] is None, "the request must let go of the block"


@pytest.mark.parametrize("path", sorted(PATHS))
def test_an_untouched_hold_still_goes(app, client, path):
    """The other column of the 2×2: B-135's fix stands on every path."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)

    PATHS[path](app, client, ids, rid)

    assert not _block_exists(app, hold), f"{path} left the hold behind"


def test_a_hold_the_coach_only_moved_is_still_the_hold(app, client):
    """Rule 18: moving keeps the hold title, so the block is still recognisably a hold."""
    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    _edit_block(app, client, ids, hold, start="11:30", end="12:30")

    _withdraw(app, client, ids, rid)

    assert not _block_exists(app, hold)


def test_a_counter_proposal_keeps_the_retitled_block_as_busy_time_and_holds_the_new_slot(app, client):
    """`_place_hold` releases before placing: the coach's block stays, a fresh hold is placed,
    and free-blocks counts the coach's block as ordinary busy time."""
    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    hold = _hold_of(app, rid)
    _edit_block(app, client, ids, hold, title="Physio")

    assert _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00") == "countered"

    new_hold = _hold_of(app, rid)
    assert _block_title(app, hold) == "Physio"
    assert new_hold is not None and new_hold != hold
    assert _blocks_of_coach(app, ids) == 2
    assert _free(app, ids) == [("08:00", "11:00"), ("12:00", "15:00"), ("16:00", "22:00")]


def test_releasing_the_players_holds_keeps_a_retitled_block_of_an_open_request(app, client):
    """`release_holds_of_players` (import revert, rule 18) on an OPEN request."""
    from padel_app.services.class_request_service import release_holds_of_players
    from padel_app.sql_db import db

    ids = _setup(app)
    rid = _request(app, ids)
    hold = _hold_of(app, rid)
    _edit_block(app, client, ids, hold, title="Physio")

    with app.app_context():
        assert release_holds_of_players([ids["player_id"]]) == 0
        db.session.commit()

    assert _block_title(app, hold) == "Physio"
    assert _state(app, rid)["hold"] is None
