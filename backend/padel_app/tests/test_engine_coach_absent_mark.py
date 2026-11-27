"""engine-store rule 19: the coach's absent mark before a new-engine class frees the seat and leaves the
student's answer alone (attendance.presence rule 7; the old path's ``add_presences`` never moved it).

Every mark goes through the coach's attendance sheet (``POST /api/app/class_instance/presences/confirm``)
on a class seeded by ``_seed`` (test_pad916_engine_store): one coach, a level-3 class of 4 at START, the
first student its regular on the left, the others playing the left. The clock is pinned before each step.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_engine_reminder_yes_presence import _coach_user, _instance, _presence, _presence_changed
from padel_app.tests.test_pad916_engine_store import START, _seed

TEN_HOURS_BEFORE = START - timedelta(hours=10)          # past the 24 h cancellation deadline
THREE_DAYS_BEFORE = START - timedelta(days=3)           # before it


@pytest.fixture
def world(app, monkeypatch):
    """A new-engine class of 4 (every switch on, a 24 h deadline) with six students: the regular, three
    placed for that class only (so the class is full) and two in the pool. Every live event and push is
    recorded; each ``presence_changed`` also records the presence's ``validated`` as the database holds
    it when the event is sent (after its commit)."""
    from sqlalchemy import text

    from padel_app import realtime
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import notification_service
    from padel_app.tests.helpers import pin_clock
    from padel_app.utils import expo_push, push_notifications

    import padel_app.services.engine_entry  # noqa: F401 — loaded before the pin, so it reads the pinned clock

    app.config["JWT_SECRET_KEY"] = "test-secret"
    log = {"sent": [], "pushes": [], "validated_at_send": []}

    def publish(event_, user_ids):
        if event_.get("type") == "presence_changed":
            p = event_["payload"]
            with db.engine.connect() as conn:          # what the commit left, read on its own connection
                row = conn.execute(text("SELECT validated FROM presences WHERE lesson_instance_id = :i "
                                        "AND player_id = :p"), {"i": p["lessonInstanceId"], "p": p["playerId"]}).first()
            log["validated_at_send"].append(bool(row[0]) if row else None)
        log["sent"].append((event_, list(user_ids)))

    monkeypatch.setattr(realtime, "publish", publish)
    monkeypatch.setattr(notification_service, "publish", publish)
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: log["pushes"].append(kw.get("user_id")))
    monkeypatch.setattr(notification_service, "send_push_notification",
                        lambda **kw: log["pushes"].append(kw.get("user_id")))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda uid, *a, **kw: log["pushes"].append(uid))

    with app.app_context():
        pin_clock(monkeypatch, THREE_DAYS_BEFORE - timedelta(hours=1))
        store, (session,), pids = _seed(app, players=6, capacity=4, side="left")
        db.session.add(NotificationConfig(coach_id=store.coach_of(session), auto_notify_enabled=True,
                                          open_spots_visible=True, engine_version="new",
                                          cancellation_deadline_hours=24,
                                          engine_switched_at=START - timedelta(days=10)))
        db.session.commit()
        regular, f1, f2, f3, _, p2 = pids
        for pid in (f2, f3, p2):                       # two a side: the regular and f1 left, f2 and f3 right
            Association_CoachPlayer.query.filter_by(coach_id=store.coach_of(session), player_id=int(pid)).one().side = "right"
        db.session.commit()
        placed_at = THREE_DAYS_BEFORE - timedelta(hours=1)
        with store.unit((session,)):
            store.apply([fx.Placed(session, placed_at, f1, "L", "invitation"),
                         fx.Placed(session, placed_at, f2, "R", "invitation"),
                         fx.Placed(session, placed_at, f3, "R", "invitation")])
        db.session.commit()
        log["sent"].clear()
        log["validated_at_send"].clear()
        yield store, session, pids, log


def _mark(client, store, session, student, at, monkeypatch, **mark):
    """The coach's sheet: ``mark`` is the row's body (``status``/``justification``, or ``clear``)."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, at)
    inst = db.session.get(LessonInstance, int(session))
    from padel_app.services.lesson_service import primary_coach

    token = create_access_token(identity=str(primary_coach(inst).user_id))
    res = client.post(
        "/api/app/class_instance/presences/confirm",
        headers={"Authorization": f"Bearer {token}"},
        json={"classInstance": {"id": f"lessoninstance-{inst.id}", "originalId": inst.id,
                                "parentClassId": inst.lesson_id},
              "presences": [{"playerId": int(student), **mark}]},
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    db.session.expire_all()
    (row,) = [p for p in res.get_json()["presences"] if p["playerId"] == int(student)]
    return row


def _asked_and_said_yes(session, student, asked_at, yes_at):
    from padel_app.models import ReminderAttempt
    from padel_app.services.engine_entry import answer_attendance_request

    db.session.add(ReminderAttempt(lesson_instance_id=int(session), player_id=int(student), number=1,
                                   sent_at=asked_at))
    db.session.commit()
    assert answer_attendance_request(_instance(session), _presence(session, student), "yes", yes_at) == {
        "action": "confirmed"}
    db.session.expire_all()


def _attempts(session, student):
    from padel_app.models import ReminderAttempt

    return [(a.number, a.sent_at, a.response, a.responded_at) for a in ReminderAttempt.query.filter_by(
        lesson_instance_id=int(session), player_id=int(student)).order_by(ReminderAttempt.id).all()]


def _told_student(log, store, session, student):
    """Anything that reached the student: a live event, a push, or an engine message to them."""
    from padel_app.models import EngineEffect
    from padel_app.models.players import Player

    uid = db.session.get(Player, int(student)).user_id
    events = [e["type"] for e, to in log["sent"] if uid in to]
    pushes = [p for p in log["pushes"] if p == uid]
    messages = EngineEffect.query.filter_by(lesson_instance_id=int(session), player_id=int(student),
                                            kind="Message").all()
    return events, pushes, messages


def _open_places(store, session):
    from padel_app.invitation_engine import planner

    return planner.spot_counts(store.snapshot(session)).class_empty


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-53")
def test_the_coachs_absent_mark_before_the_class_keeps_the_students_answer(world, client, monkeypatch):
    store, session, (regular, *_), log = world
    yes_at = THREE_DAYS_BEFORE
    _asked_and_said_yes(session, regular, asked_at=yes_at - timedelta(hours=1), yes_at=yes_at)
    before = _presence(session, regular)
    answer = (before.response, before.responded_at, before.confirmed)
    attempts = _attempts(session, regular)
    assert answer == ("confirmed", yes_at, True) and attempts[0][2] == "yes"
    log["sent"].clear()
    log["validated_at_send"].clear()

    row = _mark(client, store, session, regular, TEN_HOURS_BEFORE, monkeypatch,
                status="absent", justification="justified")

    p = _presence(session, regular)
    assert (p.status, p.justification, p.validated, p.recorded_by, p.left_reason) == (
        "absent", "justified", True, "coach", "regular_no")
    assert (p.response, p.responded_at, p.confirmed) == answer          # the student's Yes, as they left it
    assert row["response"] == "confirmed" and row["lateCancellation"] is False
    assert row["cancelledByStudent"] is False and row["attendanceState"] == "missed"
    assert _attempts(session, regular) == attempts                     # the reminder untouched
    assert not [e for e, _ in log["sent"] if e["type"] == "message_edited"]
    snap = store.snapshot(session)
    assert regular in snap.absent and regular not in {g.student for g in snap.going}
    assert _open_places(store, session) == 1                            # the seat is free
    assert any(e.kind == "Absence" and e.payload.get("by") == "coach" for e in _effects(session, regular))
    assert _told_student(log, store, session, regular) == ([], [], [])
    # One live event for the coach, after one commit that already holds the coach's mark.
    assert [to for _, to in _presence_changed(log["sent"], regular)] == [[_coach_user(store, session)]]
    assert log["validated_at_send"] == [True]


def _effects(session, student):
    from padel_app.models import EngineEffect

    return EngineEffect.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).all()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-53")
def test_a_regular_never_asked_keeps_no_answer(world, client, monkeypatch):
    store, session, (regular, *_), log = world
    assert _presence(session, regular).response == "none"

    row = _mark(client, store, session, regular, THREE_DAYS_BEFORE, monkeypatch,
                status="absent", justification="justified")

    p = _presence(session, regular)
    assert (p.status, p.validated, p.recorded_by, p.left_reason) == ("absent", True, "coach", "regular_no")
    assert (p.response, p.responded_at) == ("none", None)              # never proactive_decline
    assert row["lateCancellation"] is False and row["cancelledByStudent"] is False
    assert _attempts(session, regular) == []
    assert _open_places(store, session) == 1
    assert _told_student(log, store, session, regular) == ([], [], [])
    assert log["validated_at_send"] == [True]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-53")
def test_a_student_placed_for_the_class_only_keeps_their_answer(world, client, monkeypatch):
    store, session, (_, fill, *_), log = world
    before = _presence(session, fill)
    answer = (before.response, before.responded_at, before.confirmed)

    row = _mark(client, store, session, fill, TEN_HOURS_BEFORE, monkeypatch, status="absent",
                justification="unjustified")

    p = _presence(session, fill)
    assert (p.status, p.justification, p.validated, p.recorded_by, p.left_reason) == (
        "absent", "unjustified", True, "coach", "cancel")
    assert (p.response, p.responded_at, p.confirmed) == answer
    assert row["lateCancellation"] is False and row["cancelledByStudent"] is False
    assert _open_places(store, session) == 1
    # Nothing tells them they cancelled. What does reach them is the re-plan's invitation for the freed
    # place: having left by a cancellation they are in the pool again, as after their own cancel (rule 4,
    # the seat planned as today).
    events, pushes, messages = _told_student(log, store, session, fill)
    assert messages == [] and set(events) <= {"message_created"}
    invites = [e for e, _ in log["sent"] if e["type"] == "message_created"
               and e["payload"].get("messageType") == "notification_invite"]
    assert len(events) <= len(invites)
    assert len(_presence_changed(log["sent"], fill)) == 1 and log["validated_at_send"] == [True]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-28")
def test_the_students_own_no_still_records_their_answer(world, monkeypatch):
    """The control: the student's own No past the deadline is their late cancellation (rule 14, D4)."""
    from padel_app.services.engine_entry import answer_attendance_request

    store, session, (regular, *_), log = world
    _asked_and_said_yes(session, regular, asked_at=THREE_DAYS_BEFORE - timedelta(hours=1), yes_at=THREE_DAYS_BEFORE)
    assert answer_attendance_request(_instance(session), _presence(session, regular), "no", TEN_HOURS_BEFORE) == {
        "action": "declined"}
    p = _presence(session, regular)
    assert (p.status, p.response, p.responded_at, p.recorded_by, p.validated) == (
        "absent", "cancelled", TEN_HOURS_BEFORE, "student", False)
    assert any(e.kind == "Absence" and e.payload.get("by", "student") == "student" for e in _effects(session, regular))


def _invitations(session):
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter_by(lesson_instance_id=int(session)).order_by(EngineInvitation.id).all()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-54")
@pytest.mark.parametrize("give_back", [{"status": "present"}, {"clear": True}], ids=["present", "clear"])
def test_the_seat_the_coachs_mark_freed_is_planned_and_given_back(world, client, monkeypatch, give_back):
    from padel_app.models.players import Player
    from padel_app.services.engine_entry import respond_to_invitation
    from padel_app.services.engine_runner import run_tick

    store, session, (regular, *_), log = world
    _mark(client, store, session, regular, TEN_HOURS_BEFORE, monkeypatch, status="absent")
    invited = [r for r in _invitations(session) if r.closed_at is None]
    assert invited                                                       # the mark's own unit re-planned
    assert (_presence(session, regular).response, _presence(session, regular).responded_at) == ("none", None)

    _mark(client, store, session, regular, TEN_HOURS_BEFORE + timedelta(minutes=5), monkeypatch, **give_back)
    snap = store.snapshot(session)
    assert regular in {g.student for g in snap.going} and _open_places(store, session) == 0
    count = len(_invitations(session))
    run_tick(TEN_HOURS_BEFORE + timedelta(minutes=10))
    assert len(_invitations(session)) == count                          # nothing more for that seat
    still = [r for r in _invitations(session) if r.id in {i.id for i in invited}]
    assert all(r.closed_at is None for r in still)                      # D4: the ones out stay open
    first = still[0]
    uid = db.session.get(Player, first.player_id).user_id
    out = respond_to_invitation(first.id, "yes", uid, now=TEN_HOURS_BEFORE + timedelta(minutes=15))
    assert out["action"] == "sorry"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-55")
def test_a_student_the_coach_marked_absent_comes_back_while_a_place_is_free(world, client, monkeypatch):
    from padel_app.services.notification_service import student_come_back
    from padel_app.tests.test_engine_afinal_vou_presence import _post_yes, _return_notices

    store, session, (_, fill, *_), log = world
    _mark(client, store, session, fill, TEN_HOURS_BEFORE, monkeypatch, status="absent", justification="justified")
    assert student_come_back(_presence(session, fill), _instance(session), player_id=int(fill)) == "rejoin"
    log["sent"].clear()
    log["pushes"].clear()

    assert _post_yes(client, session, fill) == {"action": "confirmed"}

    p = _presence(session, fill)
    assert p.status != "absent" and p.validated is False and p.justification is None
    assert p.response == "confirmed" and p.attendance_state == "coming"
    assert len(_return_notices(session, fill)) == 1                     # the coach is told once (rule 16)
    assert len(_presence_changed(log["sent"], fill)) == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-53")
def test_on_an_old_engine_class_the_mark_is_as_before(world, client, monkeypatch):
    """Rule 19 is the new engine's: on an old-engine class the sheet's mark keeps the answer as it always
    did (``add_presences``), and the engine is not asked."""
    from padel_app.models import EngineEffect, EngineSession
    from padel_app.services.presence_response import record_response

    store, session, (regular, *_), log = world
    EngineEffect.query.filter_by(lesson_instance_id=int(session)).delete()
    db.session.delete(db.session.get(EngineSession, int(session)))
    p = _presence(session, regular)
    record_response(p, "confirmed", when=THREE_DAYS_BEFORE)
    p.confirmed = True
    db.session.commit()

    row = _mark(client, store, session, regular, TEN_HOURS_BEFORE, monkeypatch, status="absent",
                justification="justified")

    p = _presence(session, regular)
    assert (p.status, p.validated, p.recorded_by) == ("absent", True, "coach")
    assert (p.response, p.responded_at) == ("confirmed", THREE_DAYS_BEFORE)
    assert row["lateCancellation"] is False
    assert EngineEffect.query.filter_by(lesson_instance_id=int(session)).count() == 0
