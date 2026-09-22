"""
PAD-372 / bug B-138 — a LIVE class-request hold cannot have one occurrence moved or
removed: the server refuses it (409), because nothing the product honours would follow.

On accept the class is built from the REQUEST's recurrence (`_create_class_and_accept`
→ `add_class_service` with `row.recurrence`); the hold blocks are never read, and a
proposal moves the SERIES (`classes.class-requests` rule 16). So a `single` or `future`
change to one occurrence of the hold changes nothing the product will honour — it only
manufactures rows no release path can find: with PAD-371's split, a middle move leaves
the truncated hold, the one-off AND the resumed series, and two unlinked clones outlive
the request (the F2 pin in test_pad360 counts them). Design decided as REFUSAL by the
coordinator on 2026-09-21 (lineage was rejected: a migration to preserve a gesture with
no effect, colliding with PAD-378's "a retitled block is the coach's").

What stays exactly as rule 3 says: the coach may delete the WHOLE hold, and may retitle
it to make it their own (PAD-378).

Every case goes through the routes the two shells call, as the coach. Written RED BY
DESIGN on dfb802152 (every gesture answered 204 and left clones behind); the refusal in
`calendar_service._refuse_if_live_hold` turns them green.

Covered spec: classes.class-requests rule 3 (narrowed) and rule 18.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import DAY, _setup
from padel_app.tests.test_pad360_request_hold_release import _blocks_of_coach, _weekly_request


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _coach_headers(app, ids):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}


def _middle(ids):
    from datetime import timedelta

    return (DAY + timedelta(days=14)).isoformat()


def _move(client, app, ids, hold, scope):
    d = _middle(ids)
    return client.post(
        f"/api/app/reschedule_block/{hold}",
        headers=_coach_headers(app, ids),
        json={"occDate": d, "newDate": d, "newStartTime": "15:00", "newEndTime": "16:00", "scope": scope},
    )


def _delete(client, app, ids, hold, scope):
    return client.delete(
        f"/api/app/calendar_block/{hold}",
        headers=_coach_headers(app, ids),
        json={"occDate": _middle(ids), "scope": scope},
    )


def _hold_row(app, hold):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        b = CalendarBlock.query.get(hold)
        return None if b is None else (b.start_datetime.date(), b.recurrence_end)


# ── the four refused gestures ────────────────────────────────────────────────

@pytest.mark.parametrize("gesture,scope", [("move", "single"), ("move", "future"), ("delete", "single"), ("delete", "future")])
def test_a_scoped_change_to_a_live_hold_is_refused_and_changes_nothing(client, app, gesture, scope):
    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    before = (_blocks_of_coach(app, ids), _hold_row(app, hold))

    res = _move(client, app, ids, hold, scope) if gesture == "move" else _delete(client, app, ids, hold, scope)

    assert res.status_code == 409, res.get_data(as_text=True)
    # The blueprint's HTTPException handler carries an abort()'s code as `error`
    # (`NO_CLUB`, `COACH_NOT_APPROVED` travel the same way); the shells branch on it.
    assert res.get_json().get("error") == "HOLD_OCCURRENCE_LOCKED"
    assert (_blocks_of_coach(app, ids), _hold_row(app, hold)) == before, "nothing was split or cloned"


# ── what rule 3 keeps ────────────────────────────────────────────────────────

def test_the_whole_hold_can_still_be_deleted_by_the_coach(client, app):
    """Rule 3: a plain block the coach may see and even delete — deleting it does not decide the request."""
    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    res = client.delete(f"/api/app/calendar_block/{hold}", headers=_coach_headers(app, ids), json={})
    assert res.status_code == 204, res.get_data(as_text=True)
    assert _hold_row(app, hold) is None


def test_a_scoped_change_to_an_ordinary_block_is_still_allowed(client, app):
    """The refusal is about holds. A block that no open request points at keeps PAD-371's split."""
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.class_request import ClassRequest

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    with app.app_context():
        # Make it an ordinary block: the request no longer points at it.
        row = ClassRequest.query.get(rid)
        row.hold_block_id = None
        db.session.commit()
    res = _move(client, app, ids, hold, "single")
    assert res.status_code == 204, res.get_data(as_text=True)
    with app.app_context():
        assert CalendarBlock.query.filter_by(user_id=ids["coach_user_id"]).count() == 3, "truncated + one-off + resumed (PAD-371)"


def test_a_closed_requests_former_hold_is_an_ordinary_block(client, app):
    """Once the request is withdrawn the hold is gone (rule 18); a block that survives is nobody's hold."""
    from padel_app.services.class_request_service import withdraw_class_request_service
    from padel_app.tests.test_pad104_class_requests import _player

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))
    assert _hold_row(app, hold) is None


# ── what the shells are told: `requestHoldOf` on the block detail and on feed items ──

def _detail(client, app, ids, block_id):
    res = client.get(f"/api/app/calendar_block/{block_id}", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _feed_items(client, app, ids, block_id):
    from datetime import timedelta

    res = client.get(
        f"/api/app/calendar?from={DAY.isoformat()}T00:00:00&to={(DAY + timedelta(days=35)).isoformat()}T23:59:59",
        headers=_coach_headers(app, ids),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    return [e for e in res.get_json() if e.get("type") == "block" and e.get("originalId") == block_id]


def test_a_live_hold_says_which_request_it_holds_on_detail_and_on_every_feed_item(client, app):
    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    assert _detail(client, app, ids, hold)["requestHoldOf"] == rid
    items = _feed_items(client, app, ids, hold)
    assert len(items) == 5, "one recurring hold, five Thursdays"
    assert {e["requestHoldOf"] for e in items} == {rid}


def test_a_retitled_hold_is_the_coachs_and_says_so(client, app):
    """PAD-378: a retitled block is the coach's even while the request still points at it."""
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    with app.app_context():
        CalendarBlock.query.get(hold).title = "Gym"
        db.session.commit()
    assert _detail(client, app, ids, hold)["requestHoldOf"] is None
    assert {e["requestHoldOf"] for e in _feed_items(client, app, ids, hold)} == {None}
    assert _move(client, app, ids, hold, "single").status_code == 204, "and it is not refused"


def test_an_ordinary_block_and_a_closed_requests_leftover_pointer_say_null(client, app):
    """A block nobody points at, and a pre-PAD-360 row (closed, pointer never cleared —
    written with raw SQL so no hook runs): neither is a live hold."""
    from sqlalchemy import text

    ids = _setup(app)
    rid, hold = _weekly_request(app, ids)
    with app.app_context():
        db.session.execute(text("UPDATE class_requests SET status = 'declined' WHERE id = :rid"), {"rid": rid})
        db.session.commit()
    assert _detail(client, app, ids, hold)["requestHoldOf"] is None
    assert {e["requestHoldOf"] for e in _feed_items(client, app, ids, hold)} == {None}
