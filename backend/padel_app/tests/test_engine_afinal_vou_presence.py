"""engine-store rule 14: a No and "Afinal vou" on a new-engine class reach the presence as the old engine's
did (attendance.confirm rules 28-29): a No and a cancellation tell the coach (``presence_changed``); a
regular's return the engine places lands on coming; a return the engine does not place answers
``spot_filled``, never ``confirmed``.

``new_class`` (test_engine_reminder_yes_presence): one adopted class at START, its first student the
regular on the left, two more students who play the left; NOW is two hours before.
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_engine_reminder_yes_presence import (  # noqa: F401 — the fixture
    _instance,
    _presence,
    _presence_changed,
    _coach_user,
    new_class,
)
from padel_app.tests.test_pad916_engine_store import NOW

AT = NOW + timedelta(minutes=5)


def _say_no(session, student, at=AT):
    from padel_app.services.engine_entry import answer_attendance_request

    assert answer_attendance_request(_instance(session), _presence(session, student), "no", at) == {"action": "declined"}


def _yes(session, student, at=AT + timedelta(minutes=5)):
    from padel_app.services.engine_entry import answer_attendance_request

    return answer_attendance_request(_instance(session), _presence(session, student), "yes", at)


def _place_one_off(store, session, student, at=NOW):
    with store.unit((session,)):
        store.apply([fx.Placed(session, at, student, "L", "invitation")])


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-28")
def test_a_no_and_a_cancellation_tell_the_coach(new_class):
    from padel_app.models.players import Player
    from padel_app.services.notification_service import cancel_attendance

    store, session, (regular, one_off, _), sent = new_class
    _say_no(session, regular)

    p = _presence(session, regular)
    # Inside the cancellation deadline: the notice is late, so the student's "cancelled" (owner ruling D4).
    assert p.status == "absent" and p.response == "cancelled" and p.responded_at == AT
    assert p.justification is None                     # owner ruling D4: the engine records no justification
    assert [to for _, to in _presence_changed(sent, regular)] == [[_coach_user(store, session)]]

    _place_one_off(store, session, one_off)
    sent.clear()
    user_id = db.session.get(Player, int(one_off)).user_id
    assert cancel_attendance(user_id, lesson_instance_id=int(session), now=AT)["action"] == "declined"
    assert _presence(session, one_off).status == "absent"
    assert len(_presence_changed(sent, one_off)) == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-29")
def test_a_regulars_return_with_a_spot_lands_on_coming(new_class):
    store, session, (regular, *_), sent = new_class
    _say_no(session, regular)
    sent.clear()

    at = AT + timedelta(minutes=5)
    assert _yes(session, regular, at) == {"action": "confirmed"}
    p = _presence(session, regular)
    assert p.status is None and p.confirmed is True
    assert p.response == "confirmed" and p.responded_at == at
    assert regular in store.snapshot(session).confirmed
    assert len(_presence_changed(sent, regular)) == 1

    # The coach's "Não vai" (validated) before the class: the return clears the mark (rule 29).
    _say_no(session, regular, at + timedelta(minutes=5))
    p = _presence(session, regular)
    p.validated = True
    db.session.commit()
    assert _yes(session, regular, at + timedelta(minutes=10)) == {"action": "confirmed"}
    p = _presence(session, regular)
    assert p.validated is False
    assert p.attendance_state == "coming" and p.response == "confirmed"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-30")
def test_a_regulars_return_on_a_full_side_answers_spot_filled(new_class):
    store, session, (regular, a, b), sent = new_class
    _say_no(session, regular)
    _place_one_off(store, session, a)
    _place_one_off(store, session, b)                   # the left side is full again
    p = _presence(session, regular)
    p.decline_source = "availability_block"            # a No made from an availability block
    db.session.commit()
    before = p.response

    # Through the route, which also handles the block-decline reason (attendance.confirm rule 23).
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_reminder

    user_id = db.session.get(Player, int(regular)).user_id
    assert respond_to_reminder(int(session), "yes", user_id, now=AT + timedelta(minutes=5)) == {"action": "spot_filled"}
    p = _presence(session, regular)
    assert p.status == "absent" and p.response == before
    assert p.decline_source == "availability_block"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-31")
def test_a_non_regulars_return_answers_spot_filled(new_class):
    store, session, (_, one_off, _), sent = new_class
    _place_one_off(store, session, one_off)
    _say_no(session, one_off)

    assert _yes(session, one_off) == {"action": "spot_filled"}
    assert _presence(session, one_off).status == "absent"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-32")
def test_a_yes_never_writes_over_the_coachs_mark(new_class):
    from padel_app.tests.test_engine_reminder_yes_presence import _ask

    store, session, (regular, *_), sent = new_class
    _ask(session, regular)
    p = _presence(session, regular)
    p.status, p.validated = "present", True             # the coach's own mark, before the start
    db.session.commit()
    before = (p.confirmed, p.response, p.recorded_by)

    _yes(session, regular)
    p = _presence(session, regular)
    assert (p.confirmed, p.response, p.recorded_by) == before
    _yes(session, regular, AT + timedelta(minutes=20))  # the repeat (repair) leaves it too
    p = _presence(session, regular)
    assert (p.confirmed, p.response, p.recorded_by) == before
    assert _presence_changed(sent, regular) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-33")
def test_an_answered_yes_is_never_written_on_an_absent_presence(new_class):
    store, session, (regular, *_), sent = new_class
    _say_no(session, regular)
    p = _presence(session, regular)
    before = (p.confirmed, p.response)

    with store.unit((session,)):
        store.apply([fx.Answered(session, AT + timedelta(minutes=5), regular, "yes", "attendance_request")])
    p = _presence(session, regular)
    assert p.status == "absent" and (p.confirmed, p.response) == before
