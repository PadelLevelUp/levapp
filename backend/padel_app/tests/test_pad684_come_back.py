"""PAD-684 (attendance.confirm rules 28-29): "Afinal vou".

A student who said "Não vou" - or whom the coach marked "Não vai" - may take their place back
while the class has room, and otherwise may join the occurrence's waiting list. The decision is
taken at the tap, under the rule-10 lock order (own open vacancy, then the class), before
anything is recorded. Every test pins "now" and the fixture class
([[pinned-now-tests-must-pin-their-fixtures]]).
"""
import os
import threading
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

START = datetime(2026, 11, 17, 18, 0)  # club wall clock, as stored (winter: no DST edge)
NOW = START - timedelta(hours=30)  # a day and a half before the class
PUSH = "padel_app.services.notification_service.send_push_notification"
EXPO = "padel_app.utils.expo_push.send_expo_push_to_user"
PUBLISH = "padel_app.services.notification_service.publish"


def _seed(max_players=4, students=("ana", "bruno", "carla", "dina")):
    """A coach, a class on START with ``max_players`` places and the named students enrolled;
    Eve is a student who is not in the class. Returns ids."""
    from padel_app.models import Association_CoachPlayer
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.users import User
    from padel_app.services.lesson_service import enrol

    def user(name):
        u = User(name=f"{name.title()} Silva", username=f"p684{name}", email=f"p684{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("coach").id)
    club = Club(name="P684", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    lesson = Lesson(title="Quinta 18h", start_datetime=START, end_datetime=START + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=max_players, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=START,
                          end_datetime=START + timedelta(hours=1), max_players=max_players,
                          status="scheduled", notifications_enabled=True,
                          original_lesson_occurence_date=START.date())
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    ids = {"coach_id": coach.id, "coach_user_id": coach.user_id, "instance_id": inst.id,
           "lesson_id": lesson.id}
    for name in (*students, "eve"):
        u = user(name)
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
        if name != "eve":
            enrol(p.id, inst, "roster")
        ids[name] = p.id
        ids[f"{name}_user"] = u.id
    db.session.commit()
    return ids


def _row(ids, name):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=ids["instance_id"], player_id=ids[name]).one()


def _instance(ids):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, ids["instance_id"])


def _no(ids, name, now=NOW):
    """The student's reminder "no": the row goes not_coming and its vacancy opens."""
    from padel_app.services.notification_service import respond_to_reminder

    with patch(PUBLISH), patch(PUSH):
        assert respond_to_reminder(ids["instance_id"], "no", ids[f"{name}_user"], now=now)["action"] == "declined"
    db.session.expire_all()


def _yes(ids, name, now=NOW):
    from padel_app.services.notification_service import respond_to_reminder

    return respond_to_reminder(ids["instance_id"], "yes", ids[f"{name}_user"], now=now)


def _come_back(ids, name):
    from padel_app.serializers.lesson import serialize_class_instance

    db.session.expire_all()
    return serialize_class_instance(_instance(ids), viewer_player_id=ids[name])["comeBack"]


def _open_vacancy(ids, name):
    from padel_app.models import Vacancy

    return Vacancy.query.filter_by(lesson_instance_id=ids["instance_id"],
                                   original_player_id=ids[name], status="open").first()


def _invite(ids, name, vacancy):
    """An open invitation to ``name`` for ``vacancy`` (its message is the bubble)."""
    from padel_app.models import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    conv = _get_or_create_direct_conversation(ids["coach_user_id"], ids[f"{name}_user"])
    msg = Message(text="invite", sender_id=ids["coach_user_id"], conversation_id=conv.id,
                  message_type="class_invitation", msg_metadata={"responded": False})
    db.session.add(msg)
    db.session.flush()
    ev = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"],
                           player_id=ids[name], type="auto", status="sent",
                           message_id=msg.id, vacancy_id=vacancy.id)
    db.session.add(ev)
    db.session.commit()
    return ev.id, msg.id


@pytest.fixture
def clock(monkeypatch):
    return pin_clock(monkeypatch, NOW)


def test_afinal_vou_with_a_spot_seats_the_student_and_tells_the_coach(app, clock):
    from padel_app.models import Message, Vacancy
    from padel_app.models.notification_event import NotificationEvent

    with app.app_context():
        ids = _seed()
        _no(ids, "ana")
        vacancy = _open_vacancy(ids, "ana")
        assert vacancy is not None
        ev_id, msg_id = _invite(ids, "eve", vacancy)
        assert _come_back(ids, "ana") == "rejoin"
        before = {p.id for p in Message.query.all()}

        with patch(PUBLISH), patch(PUSH) as push, patch(EXPO) as expo:
            assert _yes(ids, "ana") == {"action": "confirmed"}
        db.session.expire_all()

        row = _row(ids, "ana")
        assert row.attendance_state == "coming"
        assert row.status is None and row.justification is None and row.validated is False
        assert db.session.get(Vacancy, vacancy.id).status == "filled"
        assert db.session.get(Vacancy, vacancy.id).filled_by_player_id == ids["ana"]
        event = db.session.get(NotificationEvent, ev_id)
        assert event.status == "expired"
        assert db.session.get(Message, msg_id).msg_metadata.get("response") == "spot_filled"
        assert _instance(ids).effective_filled_spots == 4
        assert _come_back(ids, "ana") is None

        notices = [m for m in Message.query.all()
                   if m.id not in before and (m.msg_metadata or {}).get("comeBack")]
        assert len(notices) == 1
        assert notices[0].sender_id == ids["ana_user"]
        assert notices[0].text.startswith("Ana Silva ") and "Quinta 18h" in notices[0].text
        assert notices[0].msg_metadata["lessonInstanceId"] == ids["instance_id"]
        assert push.call_args.kwargs["user_id"] == ids["coach_user_id"]
        assert expo.call_args.args[0] == ids["coach_user_id"]

        # a repeat tap is the existing duplicate answer
        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana") == {"action": "confirmed", "duplicate": True}


def test_no_spot_the_waiting_list_and_a_yes_records_nothing(app, clock):
    from padel_app.models import WaitingListEntry
    from padel_app.services.academy_class_service import join_class_waiting_list_service
    from padel_app.models.players import Player
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        ids = _seed()
        _no(ids, "ana")
        enrol(ids["eve"], _instance(ids), "fill", confirmed=True)  # Eve took Ana's place
        db.session.commit()
        assert _instance(ids).effective_filled_spots == 4
        assert _come_back(ids, "ana") == "waiting_list"

        with patch(PUBLISH), patch(PUSH), patch(EXPO) as expo:
            assert _yes(ids, "ana") == {"action": "spot_filled"}
        db.session.expire_all()
        assert expo.call_count == 0, "nothing is sent to the coach for a refused tap"
        row = _row(ids, "ana")
        assert row.attendance_state == "not_coming" and row.response == "declined"

        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            entry, created = join_class_waiting_list_service(
                db.session.get(Player, ids["ana"]), "LessonInstance", ids["instance_id"], None, now=NOW
            )
        assert created is True and entry.is_active
        assert WaitingListEntry.query.filter_by(player_id=ids["ana"]).count() == 1
        assert _come_back(ids, "ana") == "on_waiting_list"


def test_the_coachs_nao_vai_can_be_undone_by_the_student(app, clock):
    with app.app_context():
        ids = _seed()
        row = _row(ids, "ana")
        row.status, row.justification, row.validated = "absent", "unjustified", True
        db.session.commit()
        assert row.attendance_state == "missed"
        assert _come_back(ids, "ana") == "rejoin"

        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana") == {"action": "confirmed"}
        db.session.expire_all()
        row = _row(ids, "ana")
        assert row.attendance_state == "coming"
        assert row.status is None and row.justification is None and row.validated is False


def test_a_coach_mark_present_still_answers_already_marked(app, clock):
    with app.app_context():
        ids = _seed()
        row = _row(ids, "ana")
        row.status, row.validated = "present", True
        db.session.commit()
        assert _come_back(ids, "ana") is None
        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana") == {"action": "already_marked"}
        assert _row(ids, "ana").attendance_state == "attended"


def test_once_the_class_has_started_nothing_is_offered_and_the_yes_is_refused(app, monkeypatch):
    started = START + timedelta(minutes=5)
    pin_clock(monkeypatch, started)
    with app.app_context():
        ids = _seed()
        row = _row(ids, "ana")
        row.status, row.justification, row.confirmed = "absent", "justified", True
        db.session.commit()
        assert _come_back(ids, "ana") is None
        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana", now=started) == {"action": "expired"}
        assert _row(ids, "ana").attendance_state == "not_coming"


def test_a_coach_viewer_gets_no_come_back(app, clock):
    from padel_app.serializers.lesson import serialize_class_instance

    with app.app_context():
        ids = _seed()
        _no(ids, "ana")
        assert serialize_class_instance(_instance(ids))["comeBack"] is None


def test_the_dashboard_rows_serve_the_same_predicate(app, clock):
    from padel_app.helpers.dashboard.confirmation import ask_state

    with app.app_context():
        ids = _seed()
        _no(ids, "ana")
        state = ask_state(ids["ana"], [ids["instance_id"]], START - timedelta(hours=30))
        assert state[ids["instance_id"]]["comeBack"] == "rejoin"
        assert state[ids["instance_id"]]["attendanceState"] == "not_coming"


def test_a_pending_approval_prompt_for_the_vacancy_goes_stale(app, clock):
    from padel_app.models import ReplacementApprovalPrompt

    with app.app_context():
        ids = _seed()
        _no(ids, "ana")
        vacancy = _open_vacancy(ids, "ana")
        db.session.add(ReplacementApprovalPrompt(
            coach_id=ids["coach_id"], vacancy_id=vacancy.id, bundle_id="b684",
            declined_player_id=ids["ana"], waiting_list_player_id=None))
        db.session.commit()

        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana") == {"action": "confirmed"}
        db.session.expire_all()
        prompt = ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).one()
        assert prompt.status == "stale" and prompt.decided_at is not None


def test_only_this_occurrence_comes_back(app, clock):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    with app.app_context():
        ids = _seed()
        nxt = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=START + timedelta(days=7),
                             end_datetime=START + timedelta(days=7, hours=1), max_players=4,
                             status="scheduled", notifications_enabled=True)
        db.session.add(nxt)
        db.session.flush()
        db.session.add(Presence(player_id=ids["ana"], lesson_instance_id=nxt.id, invited=True,
                                enrolment_source="roster"))
        db.session.commit()
        _no(ids, "ana")
        with patch(PUBLISH), patch(PUSH), patch(EXPO):
            assert _yes(ids, "ana") == {"action": "confirmed"}
        db.session.expire_all()
        other = Presence.query.filter_by(lesson_instance_id=nxt.id, player_id=ids["ana"]).one()
        assert other.attendance_state == "planned" and other.response == "none"


# ── the race (Postgres only: SQLite has one writer) ──────────────────────────────────────


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="needs two real connections",
)
def test_two_students_one_spot_exactly_one_is_seated(app, monkeypatch):
    """Both POST yes at once. The hold is placed right AFTER each thread reads the class's
    filled count, so both have counted one free place before either records. The lock makes the
    second wait before it counts (the hold then times out alone); without it both are seated and
    the class is over capacity."""
    from padel_app.services import notification_service as svc

    with app.app_context():
        ids = _seed(max_players=3, students=("ana", "bruno", "carla", "dina"))
        _no(ids, "ana")
        _no(ids, "bruno")
        assert _instance(ids).effective_filled_spots == 2  # Carla and Dina: one free place

    gate = threading.Barrier(2)
    seen = threading.local()
    real = svc._effective_filled_spots

    def _held_after_counting(instance):
        value = real(instance)
        if not getattr(seen, "held", False):
            seen.held = True
            try:
                gate.wait(timeout=3)
            except threading.BrokenBarrierError:
                pass
        return value

    monkeypatch.setattr(svc, "_effective_filled_spots", _held_after_counting)
    answers, errors = {}, []

    def tap(name):
        try:
            with app.app_context(), patch(PUBLISH), patch(PUSH), patch(EXPO):
                answers[name] = _yes(ids, name)["action"]
        except BaseException as exc:  # noqa: BLE001 - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=tap, args=(n,)) for n in ("ana", "bruno")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads)
    assert not errors, errors

    with app.app_context():
        db.session.expire_all()
        assert sorted(answers.values()) == ["confirmed", "spot_filled"], answers
        assert _instance(ids).effective_filled_spots == 3, "never over capacity"
