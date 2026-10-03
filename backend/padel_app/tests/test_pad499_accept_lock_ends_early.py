"""
PAD-499 (ledger B-261): the accept path can release the class lock before the winner is enrolled.

PAD-261 (invitations rule 10) decides a "yes" under the vacancy-then-class lock and says the lock
lasts until the enrolment's commit. `_close_vacancy` retires the other candidates' invitations, and
each retired message's save commits — so the lock ends after the close and before
`_add_player_to_instance`.

Cell (a) needs two real connections (Postgres only), forced: the first winner pauses after its close
has committed and before it enrols, while a second "yes" on ANOTHER vacancy of the same class runs.
Cell (b) runs on either database: the enrolment raises after the close, then the student retries.
"""
import contextlib
import os
import threading
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


def _io():
    stack = contextlib.ExitStack()
    for target in PATCHES:
        stack.enter_context(patch(target))
    return stack


def _two_open_spots_for_one_place(app):
    """One free place (2 places, 1 enrolled) but two open vacancies (a stale extra one, as the
    roster/vacancy drift of prod class 367). X and Z are invited for the first spot (Z's invitation
    has a message, so closing the spot retires it with a committing save); Y for the second."""
    from padel_app.models import Coach
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _send_system_message

    with app.app_context(), _io():
        instance_id, coach_id, _, (x, y, z) = _seed(enrolled=1, candidates=3, max_players=2)
        v1, v2 = (Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open",
                          current_round_number=1, current_batch_number=1, last_activity_at=NOW)
                  for _ in range(2))
        db.session.add_all([v1, v2])
        db.session.flush()
        coach_user = Coach.query.get(coach_id).user_id
        ids = {}
        for player, vacancy in ((x, v1), (z, v1), (y, v2)):
            event = NotificationEvent(coach_id=coach_id, lesson_instance_id=instance_id, player_id=player,
                                      vacancy_id=vacancy.id, type="auto", round_number=1, status="sent")
            db.session.add(event)
            db.session.flush()
            msg = _send_system_message(coach_user, Player.query.get(player).user_id, "a spot opened",
                                       message_type="notification_invite",
                                       msg_metadata={"notificationEventId": event.id, "lessonInstanceId": instance_id,
                                                     "vacancyId": vacancy.id, "responded": False})
            event.message_id = msg.id
            ids[player] = (event.id, Player.query.get(player).user_id)
        db.session.commit()
        return instance_id, ids, (x, y, z)


def _enrolled(app, instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        db.session.expire_all()
        instance = db.session.get(LessonInstance, instance_id)
        return instance.effective_filled_spots, instance.effective_max_players


@POSTGRES_ONLY
def test_cell_a_a_second_yes_on_another_spot_cannot_overfill_the_class(app, monkeypatch):
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, y, _z) = _two_open_spots_for_one_place(app)

    closed = threading.Event()   # the first winner's close has committed
    second_done = threading.Event()
    real_close, real_add = ns._close_vacancy, ns._add_player_to_instance

    def close(vacancy, filled_by_player_id, **kwargs):
        retired = real_close(vacancy, filled_by_player_id, **kwargs)
        if filled_by_player_id == x:
            closed.set()
        return retired

    def add(player_id, instance):
        if player_id == x:
            second_done.wait(timeout=5)   # with a lock that holds, the second "yes" cannot finish
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_close_vacancy", close)
    monkeypatch.setattr(ns, "_add_player_to_instance", add)

    def first():
        respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))

    def second():
        closed.wait(timeout=5)
        try:
            respond_to_notification(ids[y][0], "yes", ids[y][1], now=NOW + timedelta(minutes=1))
        finally:
            second_done.set()

    with _io():
        _race(app, [first, second])
    filled, places = _enrolled(app, instance_id)
    assert filled <= places, f"class overfilled: {filled} on {places} places"


def test_cell_b_an_enrolment_that_raises_after_the_close_leaves_no_confirmed_but_absent_winner(app, monkeypatch):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, _y, _z) = _two_open_spots_for_one_place(app)
    real_add = ns._add_player_to_instance
    calls = {"n": 0}

    def flaky(player_id, instance):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("enrolment failed")
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_add_player_to_instance", flaky)
    with app.app_context(), _io():
        with pytest.raises(RuntimeError):
            respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))
        db.session.rollback()
        respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=2))
        db.session.expire_all()
        from padel_app.models.lesson_instances import LessonInstance

        confirmed = db.session.get(NotificationEvent, ids[x][0]).status == "confirmed"
        enrolled = x in db.session.get(LessonInstance, instance_id).enrolled_player_ids
        assert confirmed == enrolled, f"confirmed={confirmed} but enrolled={enrolled}"


@pytest.mark.parametrize("where", ["enrolment", "commit"])
def test_cell_b2_a_failed_single_commit_changes_nothing_the_student_can_see(app, monkeypatch, where):
    """#527 review item 3: after the single commit fails — the enrolment raising, or the commit
    itself — nothing changed: no confirmation, no place, the spot open, and the invite bubble still
    unanswered (no "Accepted" badge, buttons back), so the student can answer again and win."""
    from padel_app.models import Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, _y, _z) = _two_open_spots_for_one_place(app)
    real_add = ns._add_player_to_instance
    calls = {"n": 0}

    def failing(player_id, instance):
        calls["n"] += 1
        if calls["n"] > 1:
            return real_add(player_id, instance)
        if where == "enrolment":
            raise RuntimeError("enrolment failed")
        real_commit = db.session.commit

        def boom():
            raise RuntimeError("commit failed")

        monkeypatch.setattr(db.session, "commit", boom)
        try:
            return real_add(player_id, instance)
        finally:
            monkeypatch.setattr(db.session, "commit", real_commit)

    monkeypatch.setattr(ns, "_add_player_to_instance", failing)
    with app.app_context(), _io():
        with pytest.raises(RuntimeError):
            respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))
        db.session.rollback()
        db.session.expire_all()
        event = db.session.get(NotificationEvent, ids[x][0])
        bubble = Message.query.get(event.message_id).msg_metadata
        assert (event.status, event.answer) == ("sent", None)
        assert bubble.get("responded") is False
        assert x not in db.session.get(LessonInstance, instance_id).enrolled_player_ids
        assert db.session.get(Vacancy, event.vacancy_id).status == "open"

        respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=2))
        db.session.expire_all()
        assert db.session.get(NotificationEvent, ids[x][0]).status == "confirmed"
        assert x in db.session.get(LessonInstance, instance_id).enrolled_player_ids


# ── #527 review item 2 / #526 review items 4, 5: the coach accept ───────────────────────────

def test_coach_a_refused_coach_yes_keeps_the_students_own_no(app, monkeypatch):
    """#526 review item 4: B said no; A took the spot; the coach then records yes on B's invitation.
    It is refused (spot filled) and must not overwrite B's "no" — rule 18 would re-admit B."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import coach_respond_to_notification, respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, y, z) = _two_open_spots_for_one_place(app)
    with app.app_context(), _io():
        respond_to_notification(ids[z][0], "no", ids[z][1], now=NOW + timedelta(minutes=1))
        respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=2))
        event = db.session.get(NotificationEvent, ids[z][0])
        result = coach_respond_to_notification(ids[z][0], "yes", event.coach_id, now=NOW + timedelta(minutes=3))
        db.session.expire_all()
        assert result["action"] in ("spot_filled", "declined")
        assert db.session.get(NotificationEvent, ids[z][0]).answer == "no"


def test_coach_a_failed_enrolment_changes_nothing_and_the_coach_can_retry(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, _y, _z) = _two_open_spots_for_one_place(app)
    real_add = ns._add_player_to_instance
    calls = {"n": 0}

    def failing(player_id, instance):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("enrolment failed")
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_add_player_to_instance", failing)
    with app.app_context(), _io():
        coach_id = db.session.get(NotificationEvent, ids[x][0]).coach_id
        with pytest.raises(RuntimeError):
            ns.coach_respond_to_notification(ids[x][0], "yes", coach_id, now=NOW + timedelta(minutes=1))
        db.session.rollback()
        db.session.expire_all()
        event = db.session.get(NotificationEvent, ids[x][0])
        assert (event.status, event.answer) == ("sent", None)
        assert db.session.get(Vacancy, event.vacancy_id).status == "open"
        assert ns.coach_respond_to_notification(ids[x][0], "yes", coach_id, now=NOW + timedelta(minutes=2))["action"] == "confirmed"
        db.session.expire_all()
        assert x in db.session.get(LessonInstance, instance_id).enrolled_player_ids


@POSTGRES_ONLY
def test_coach_a_coach_yes_and_a_student_yes_on_two_spots_cannot_overfill(app, monkeypatch):
    """#527 review item 2: the coach records X's yes on V1 while Y answers yes on V2, one place left.
    Forced: the coach pauses before enrolling until Y's answer has finished. With the class lock in
    the coach path Y waits on it and then finds the class full."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import coach_respond_to_notification, respond_to_notification
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, y, _z) = _two_open_spots_for_one_place(app)
    with app.app_context():
        coach_id = db.session.get(NotificationEvent, ids[x][0]).coach_id
    reached, second_done = threading.Event(), threading.Event()
    real_add = ns._add_player_to_instance

    def add(player_id, instance):
        if player_id == x:
            reached.set()
            second_done.wait(timeout=5)
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_add_player_to_instance", add)
    results = {}

    def coach():
        results["coach"] = coach_respond_to_notification(ids[x][0], "yes", coach_id, now=NOW + timedelta(minutes=1))

    def student():
        reached.wait(timeout=5)
        try:
            results["student"] = respond_to_notification(ids[y][0], "yes", ids[y][1], now=NOW + timedelta(minutes=1))
        finally:
            second_done.set()

    with _io():
        _race(app, [coach, student])
    filled, places = _enrolled(app, instance_id)
    assert filled <= places, f"class overfilled: {filled} on {places} places"
    assert results["coach"]["action"] == "confirmed"
    assert results["student"]["action"] == "spot_filled_waiting_list_offered"


@POSTGRES_ONLY
def test_join_an_accepted_join_request_and_a_student_yes_cannot_overfill(app, monkeypatch):
    """#527 review item 2: the coach accepts Z's join request while Y answers yes on V2, one place
    left. Forced: the join path pauses before enrolling until Y's answer has finished. With rule 10's
    lock in the join accept, Y waits on the class lock and then finds the class full."""
    from padel_app.models import Coach
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, y, z) = _two_open_spots_for_one_place(app)
    with app.app_context():
        coach_id = db.session.get(NotificationEvent, ids[x][0]).coach_id
        row = ClassJoinRequest(lesson_instance_id=instance_id, player_id=z, coach_id=coach_id, status="pending")
        db.session.add(row)
        db.session.commit()
        request_id = row.id
    reached, second_done = threading.Event(), threading.Event()
    real_add = ns._add_player_to_instance

    def add(player_id, instance):
        if player_id == z:
            reached.set()
            second_done.wait(timeout=5)
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_add_player_to_instance", add)
    results = {}

    def join():
        coach = Coach.query.get(coach_id)
        results["join"] = decide_join_request_service(request_id, coach, accept=True, confirm=True, now=NOW)

    def student():
        reached.wait(timeout=5)
        try:
            results["student"] = respond_to_notification(ids[y][0], "yes", ids[y][1], now=NOW + timedelta(minutes=1))
        finally:
            second_done.set()

    with _io():
        _race(app, [join, student])
    filled, places = _enrolled(app, instance_id)
    assert filled <= places, f"class overfilled: {filled} on {places} places"
    assert results["student"]["action"] == "spot_filled_waiting_list_offered"
