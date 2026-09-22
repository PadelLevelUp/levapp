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
