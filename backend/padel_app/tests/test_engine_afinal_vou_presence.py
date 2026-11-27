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
def test_a_non_regulars_return_with_no_place_answers_spot_filled(new_class):
    store, session, (_, one_off, other), sent = new_class
    _place_one_off(store, session, one_off)
    _say_no(session, one_off)                            # a cancellation: left_reason cancel
    _place_one_off(store, session, other, at=AT + timedelta(minutes=1))   # the left side is full again
    p = _presence(session, one_off)
    p.decline_source = "availability_block"
    db.session.commit()
    before = (p.response, p.decline_source)

    assert _yes(session, one_off) == {"action": "spot_filled"}
    p = _presence(session, one_off)
    assert p.status == "absent" and (p.response, p.decline_source) == before


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


# --- a non-regular's return takes a free place (engine-store rules 15, 16) ---------------------------

LATER = AT + timedelta(minutes=30)


@pytest.fixture
def wide_class(app, monkeypatch):
    """``new_class`` with six students: the regular on the left, five more who play the left; the coach's
    messages and pushes recorded as sent (``notes``: (kind, user, payload))."""
    from padel_app import realtime
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import notification_service
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad916_engine_store import _seed
    from padel_app.utils import expo_push, push_notifications

    import padel_app.services.engine_entry  # noqa: F401 — loaded before the pin, so it reads the pinned clock

    app.config["JWT_SECRET_KEY"] = "test-secret"
    notes = []
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(notification_service, "send_push_notification",
                        lambda **kw: notes.append(("push", kw["user_id"], kw)))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user",
                        lambda uid, **kw: notes.append(("expo", uid, kw)))
    sent = []
    monkeypatch.setattr(realtime, "publish", lambda event, user_ids: sent.append((event, list(user_ids))))
    monkeypatch.setattr(notification_service, "publish", lambda event, user_ids: sent.append((event, list(user_ids))))
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), pids = _seed(app, players=6, capacity=4, side="left")
        db.session.add(NotificationConfig(coach_id=store.coach_of(session), auto_notify_enabled=True,
                                          open_spots_visible=True, engine_version="new",
                                          engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()
        sent.clear()
        yield store, session, pids, sent, notes


def _post_yes(client, session, student):
    from flask_jwt_extended import create_access_token

    from padel_app.models.players import Player

    token = create_access_token(identity=str(db.session.get(Player, int(student)).user_id))
    res = client.post("/api/app/notify/respond_reminder", json={"lessonInstanceId": int(session), "action": "yes"},
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.get_data(as_text=True)
    db.session.expire_all()
    return res.get_json()


def _invite(store, session, student, at=NOW):
    from padel_app.models import EngineInvitation
    from padel_app.tests.test_pad916_engine_store import _invited

    if EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).first() is None:
        with store.unit((session,)):
            store.apply([_invited(session, student, at)])


def _open_invitation(session, student):
    from padel_app.models import EngineInvitation

    row = EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()
    return row.answer is None and row.closed_at is None and row.sorry_at is None


def _coach_notes(notes, store, session):
    """The pushes the class's coach received (the planner's invitations push their students too)."""
    coach = _coach_user(store, session)
    return [(k, uid, kw) for k, uid, kw in notes if uid == coach]


def _return_notices(session, student):
    from padel_app.models import Message
    from padel_app.models.players import Player

    uid = db.session.get(Player, int(student)).user_id
    return [m for m in Message.query.filter_by(sender_id=uid).all()
            if (m.msg_metadata or {}).get("comeBack") and (m.msg_metadata or {}).get("lessonInstanceId") == int(session)]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-34")
def test_a_non_regulars_return_with_a_place_lands_on_coming(wide_class, client, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.tests.helpers import pin_clock

    store, session, (regular, rui, bia, *_), sent, notes = wide_class
    # Rui waits on a standing entry with two credits, so his placement from its row leaves one.
    standing = StandingWaitingListEntry(coach_id=store.coach_of(session), player_id=int(rui), credits_total=2,
                                        credits_used=0, expires_at=NOW + timedelta(days=30), is_active=True)
    db.session.add(standing)
    db.session.flush()
    db.session.add(WaitingListEntry(lesson_instance_id=int(session), player_id=int(rui), coach_id=standing.coach_id,
                                    standing_entry_id=standing.id, is_active=True, added_by="student", joined_at=NOW))
    db.session.commit()
    _place_one_off(store, session, rui)
    assert db.session.get(StandingWaitingListEntry, standing.id).credits_used == 1
    _invite(store, session, bia)                          # Bia holds an open invitation for the left place
    _say_no(session, rui)                                 # Rui cancels
    assert _presence(session, rui).left_reason == "cancel"
    sent.clear()

    pin_clock(monkeypatch, LATER)
    assert _post_yes(client, session, rui) == {"action": "confirmed"}

    p = _presence(session, rui)
    assert p.status is None and p.confirmed is True and p.response == "confirmed" and p.responded_at == LATER
    assert (p.enrolment_source, p.placed_how, p.assigned_side) == ("fill", "returns", "left")
    assert p.validated is False and p.decline_source is None
    snap = store.snapshot(session)
    assert rui in snap.confirmed
    from padel_app.invitation_engine import messages
    from padel_app.services.engine_store import settings_for

    assert not [e for e in messages.due(snap, settings_for(session), LATER) if e.student == rui]
    assert db.session.get(StandingWaitingListEntry, standing.id).credits_used == 1      # no credit spent
    assert len(_presence_changed(sent, rui)) == 1
    assert _open_invitation(session, bia)                 # D4: Bia's invitation stays open

    before = (p.status, p.confirmed, p.response, p.responded_at)
    pin_clock(monkeypatch, LATER + timedelta(minutes=1))
    assert _post_yes(client, session, rui) == {"action": "confirmed", "duplicate": True}
    p = _presence(session, rui)
    assert (p.status, p.confirmed, p.response, p.responded_at) == before


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-34")
def test_a_return_places_on_a_class_whose_notifications_are_off(wide_class):
    """Rule 17: a student's own return is the acting student's request; it still lands, nothing is planned."""
    from padel_app.models import EngineInvitation

    store, session, (regular, rui, *_), sent, notes = wide_class
    _place_one_off(store, session, rui)
    _say_no(session, rui)
    inst = _instance(session)
    inst.notifications_enabled = False
    db.session.commit()
    invitations = EngineInvitation.query.filter_by(lesson_instance_id=int(session)).count()

    assert _yes(session, rui, LATER) == {"action": "confirmed"}
    assert _presence(session, rui).status is None
    assert EngineInvitation.query.filter_by(lesson_instance_id=int(session)).count() == invitations


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-35")
def test_a_place_that_went_before_the_tap_answers_spot_filled(wide_class):
    from padel_app.models import ReminderAttempt
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import student_come_back

    store, session, (regular, rui, other, *_), sent, notes = wide_class
    _place_one_off(store, session, rui)
    _say_no(session, rui)
    assert student_come_back(_presence(session, rui), _instance(session), player_id=int(rui),
                             now=LATER) == "rejoin"              # served while one left place is free
    _place_one_off(store, session, other, at=AT + timedelta(minutes=1))   # then another student takes it
    db.session.expire_all()

    def state():
        p = _presence(session, rui)
        attempts = [(a.response, a.responded_at) for a in ReminderAttempt.query.filter_by(
            lesson_instance_id=int(session), player_id=int(rui)).all()]
        lists = [(w.is_active, w.added_by) for w in WaitingListEntry.query.filter_by(
            lesson_instance_id=int(session), player_id=int(rui)).all()]
        return (p.status, p.response, p.responded_at, p.confirmed, p.left_reason), attempts, lists

    before = state()
    assert student_come_back(_presence(session, rui), _instance(session), player_id=int(rui),
                             now=LATER) == "waiting_list"
    assert _yes(session, rui, LATER) == {"action": "spot_filled"}
    assert state() == before
    assert _return_notices(session, rui) == [] and _coach_notes(notes, store, session) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-35")
def test_a_return_beaten_at_the_same_hour_answers_spot_filled(app, monkeypatch):
    """The store's same-hour guard refusing a return's placement (a race the snapshot did not see) answers
    spot_filled, never a 409 or a 500, and records nothing: a regular whose return the engine places while
    they are going to another of the coach's classes at that hour."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad916_engine_store import START, _seed
    from padel_app.utils import expo_push, push_notifications

    import padel_app.services.engine_entry  # noqa: F401

    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (a, b), (regular, *_) = _seed(app, starts=(START, START), players=3, capacity=4)
        db.session.add(NotificationConfig(coach_id=store.coach_of(a), auto_notify_enabled=True,
                                          engine_version="new", engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()
        _say_no(a, regular)                              # the regular is still going to b, at the same hour
        before = (_presence(a, regular).status, _presence(a, regular).response)

        assert _yes(a, regular, LATER) == {"action": "spot_filled"}
        assert (_presence(a, regular).status, _presence(a, regular).response) == before


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-36")
def test_every_return_tells_the_coach_once(wide_class, client, monkeypatch):
    from padel_app.models.players import Player
    from padel_app.tests.helpers import pin_clock

    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    store, session, (regular, one_off, *_), sent, notes = wide_class
    coach_user = _coach_user(store, session)
    # The coach calls the one-off student by a nickname: the push uses it, the message keeps the real name.
    link = Association_CoachPlayer.query.filter_by(coach_id=store.coach_of(session), player_id=int(one_off)).one()
    link.nickname, link.nickname_as_name = "Tó", True
    db.session.commit()
    _place_one_off(store, session, one_off)
    _say_no(session, regular)
    _say_no(session, one_off)
    sent.clear()

    for student, minute in ((regular, 1), (one_off, 2)):
        pin_clock(monkeypatch, LATER + timedelta(minutes=minute))
        notes.clear()
        sent.clear()
        assert _post_yes(client, session, student) == {"action": "confirmed"}
        name = db.session.get(Player, int(student)).user.name
        (msg,) = _return_notices(session, student)
        assert msg.text.startswith(f"{name} afinal vai a ")                 # the coach's locale: PT
        assert msg.msg_metadata == {"comeBack": True, "lessonInstanceId": int(session)}
        created = [e for e, to in sent if e["type"] == "message_created" and e["payload"]["id"] == msg.id]
        assert len(created) == 1
        coach_notes = _coach_notes(notes, store, session)
        assert [(k, uid) for k, uid, _ in coach_notes] == [("push", coach_user), ("expo", coach_user)]
        assert coach_notes[0][2]["title"] == "Afinal vai"
        shown = "Tó" if student == one_off else name
        assert coach_notes[0][2]["body"].startswith(f"{shown} afinal vai a ")
        assert not [e for e, to in sent if "reminder_confirmed" in str(e)]

        notes.clear()
        sent.clear()
        pin_clock(monkeypatch, LATER + timedelta(minutes=minute, seconds=30))
        assert _post_yes(client, session, student)["action"] == "confirmed"        # the repeat
        assert len(_return_notices(session, student)) == 1 and _coach_notes(notes, store, session) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-37")
def test_a_return_not_placed_tells_the_coach_nothing(wide_class, monkeypatch):
    from padel_app.services import engine_store

    store, session, (regular, one_off, a, b, *_), sent, notes = wide_class
    _place_one_off(store, session, one_off)
    _say_no(session, one_off)
    _place_one_off(store, session, a, at=AT + timedelta(minutes=1))     # the left side is full
    assert _yes(session, one_off, LATER) == {"action": "spot_filled"}
    assert _return_notices(session, one_off) == [] and _coach_notes(notes, store, session) == []

    # A return whose unit rolls back after its Placed is applied: nothing reaches the coach.
    _say_no(session, regular, AT + timedelta(minutes=2))
    _say_no(session, a, AT + timedelta(minutes=3))                       # a left place is free again
    real = engine_store.TableStore._write

    def failing(self, e):
        real(self, e)
        if isinstance(e, fx.Placed) and e.how in ("returns", "regular_returns"):
            raise engine_store.SameHourConflict("rolled back after the placement")
    monkeypatch.setattr(engine_store.TableStore, "_write", failing)
    assert _yes(session, regular, LATER + timedelta(minutes=1)) == {"action": "spot_filled"}
    assert _presence(session, regular).status == "absent"
    assert _return_notices(session, regular) == [] and _coach_notes(notes, store, session) == []


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-33")
def test_an_invitee_who_cancelled_and_came_back_reads_accepted(wide_class):
    """ND1: "answered yes and placed" is still the row of an invitee whose return placed them again."""
    from padel_app.services.engine_entry import respond_to_invitation
    from padel_app.services.engine_readers import engine_invitees
    from padel_app.tests.test_pad916_engine_store import _invited
    from padel_app.models import EngineInvitation

    store, session, (regular, rui, *_), sent, notes = wide_class
    with store.unit((session,)):
        store.apply([_invited(session, rui)])
    row = EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(rui)).one()
    from padel_app.models.players import Player

    user = db.session.get(Player, int(rui)).user_id
    assert respond_to_invitation(row.id, "yes", user, now=AT)["action"] == "confirmed"
    _say_no(session, rui, AT + timedelta(minutes=1))

    def outcome():
        return next(r["outcome"] for r in engine_invitees(_instance(session), now=LATER) if r["playerId"] == rui)

    assert outcome() == "cancelled"
    assert _yes(session, rui, LATER) == {"action": "confirmed"}
    assert outcome() == "accepted"
