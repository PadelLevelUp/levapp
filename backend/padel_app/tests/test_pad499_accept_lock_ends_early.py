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

    results = {}

    def first():
        results["x"] = respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))

    def second():
        closed.wait(timeout=5)
        try:
            results["y"] = respond_to_notification(ids[y][0], "yes", ids[y][1], now=NOW + timedelta(minutes=1))
        finally:
            second_done.set()

    with _io():
        _race(app, [first, second])
    filled, places = _enrolled(app, instance_id)
    assert filled <= places, f"class overfilled: {filled} on {places} places"
    # #527 item 8: who got what, and the second spot's end state.
    assert results["x"]["action"] == "confirmed", results
    assert results["y"]["action"] == "spot_filled_waiting_list_offered", results
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy

    with app.app_context(), _io():
        v2_id = db.session.get(NotificationEvent, ids[y][0]).vacancy_id
        invitations = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count()
        # Y held V2 while X's enrolment reconciled, so that reconcile passed it over (rule 10); Y then
        # found the class full. PAD-552 (rule 13a; coordinator, 2026-10-07): Y's refusal closes V2
        # itself, under Y's own locks, instead of leaving it to the next tick. (Before PAD-552 this
        # cell pinned V2 still open here.) The tick then has nothing to do and invites nobody.
        assert db.session.get(Vacancy, v2_id).status != "open"
        ns.process_invitation_batches(now=NOW + timedelta(minutes=3))
        db.session.expire_all()
        assert db.session.get(Vacancy, v2_id).status != "open"
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count() == invitations


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


# ── #527 review item 1 (B-284): the reminder return ─────────────────────────────────────────

def _cancelled_then_back(app):
    """A full class (2 places, R and S enrolled) and one other student I. R cancels from the class
    screen: R's reminder is answered, R is absent, R's vacancy opens and I is invited for it. R's
    later "yes" (on the reminder, from a stale screen or the class page) takes the place back — the
    return path. (A pending reminder on an absent student has no real path: the "no" and the
    cancellation both answer it, and a re-add clears "absent".)"""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import cancel_attendance, send_class_reminders

    with app.app_context(), _io():
        instance_id, coach_id, (r_user, _s_user), (i,) = _seed(enrolled=2, candidates=1, max_players=2)
        send_class_reminders(instance_id, now=NOW)
        cancel_attendance(r_user, lesson_instance_id=instance_id, now=NOW + timedelta(minutes=1))
        invite = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=i).one()
        return instance_id, r_user, invite.id, Player.query.get(i).user_id


@POSTGRES_ONLY
# PAD-570 (attendance.confirm rule 28): the return race test that lived here is gone with the
# come-back it pinned — a yes after a cancellation is refused before any lock is taken.


def test_reconcile_locks_only_the_vacancy_it_closes(app, monkeypatch):
    """Two open vacancies for one free place: the reconcile closes one. While it is closing it, an
    answer on the OTHER spot must be able to lock that spot — the reconcile has no business holding
    it. Probed with NOWAIT from a second connection."""
    from sqlalchemy import text

    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, _ids, _players = _two_open_spots_for_one_place(app)
    with app.app_context():
        v1, v2 = [v.id for v in Vacancy.query.filter_by(lesson_instance_id=instance_id).order_by(Vacancy.id)]
    closing, probed = threading.Event(), threading.Event()
    real_close = ns._close_vacancy
    closed_ids, probe = [], {}

    def close(vacancy, *args, **kwargs):
        closed_ids.append(vacancy.id)
        result = real_close(vacancy, *args, **kwargs)
        closing.set()
        probed.wait(timeout=5)
        return result

    monkeypatch.setattr(ns, "_close_vacancy", close)

    def reconcile():
        ns.reconcile_vacancies(LessonInstance.query.get(instance_id))

    def other_answer():
        closing.wait(timeout=5)
        try:
            other = v2 if closed_ids == [v1] else v1
            try:
                db.session.execute(text("SELECT id FROM vacancies WHERE id = :id FOR UPDATE NOWAIT"), {"id": other})
                probe["locked"] = True
            except Exception as exc:  # noqa: BLE001 — LockNotAvailable is the finding
                probe["locked"] = type(exc.orig).__name__ if hasattr(exc, "orig") else repr(exc)
            db.session.rollback()
        finally:
            probed.set()

    with _io():
        _race(app, [reconcile, other_answer])
    assert len(closed_ids) == 1, closed_ids
    assert probe["locked"] is True, f"the reconcile held the vacancy it did not close: {probe}"


# ── #527 review item 4: a failed single commit on the waiting-list fill and the join accept ──

def _fails_once(monkeypatch):
    from padel_app.services import notification_service as ns

    real_add = ns._add_player_to_instance
    calls = {"n": 0}

    def failing(player_id, instance):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("enrolment failed")
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_add_player_to_instance", failing)


def test_waiting_list_a_failed_enrolment_changes_nothing_and_the_yes_can_be_given_again(app, monkeypatch):
    """PAD-446: a waiting-list student's yes to their group-0 invitation closes the spot (retiring
    Caio's invitation), settles the entry and enrols Bea in one commit. If the enrolment raises, the
    spot is still open, Caio's invitation still live and Bea still on the list; her yes then works."""
    from padel_app.models import LessonInstance, NotificationEvent, Vacancy, WaitingListEntry
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _message_is_actionable, _open_vacancy, _world

    ids = _world(app)
    _fails_once(monkeypatch)
    with app.app_context(), patch(INT_PATCHES[0]), patch(INT_PATCHES[1]):
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        caio = _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent")
        bea = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        NotificationEvent.query.get(bea).round_number = 0  # group 0
        entry = WaitingListEntry(lesson_instance_id=ids["instance_id"], player_id=ids["bea"],
                                 coach_id=ids["coach_id"], is_active=True)
        db.session.add(entry)
        db.session.commit()
        entry_id = entry.id

        with pytest.raises(RuntimeError):
            respond_to_notification(bea, "yes", ids["bea_user_id"])
        db.session.rollback()
        db.session.expire_all()
        assert Vacancy.query.get(vacancy_id).status == "open"
        assert NotificationEvent.query.get(caio).status == "sent"
        assert _message_is_actionable(caio)
        assert db.session.get(WaitingListEntry, entry_id).is_active is True
        assert ids["bea"] not in LessonInstance.query.get(ids["instance_id"]).enrolled_player_ids

        assert respond_to_notification(bea, "yes", ids["bea_user_id"])["action"] == "confirmed"
        db.session.expire_all()
        assert ids["bea"] in LessonInstance.query.get(ids["instance_id"]).enrolled_player_ids
        assert db.session.get(WaitingListEntry, entry_id).is_active is False


def test_join_a_failed_enrolment_changes_nothing_and_the_coach_can_accept_again(app, monkeypatch):
    """The join accept closes the spot (retiring the candidate's invitation) and enrols the asker in
    one commit. If the enrolment raises, the request is still pending and the spot still open."""
    from padel_app.models import ClassJoinRequest, LessonInstance, NotificationEvent, Vacancy
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad128_eligibility import _seed as _seed128
    from padel_app.tests.test_pad131_join_requests import _config, _decide, _request, _student
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _message_is_actionable, _open_vacancy

    ids = _seed128(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    asker = _student(app, ids, "asker-499b")
    candidate = _student(app, ids, "candidate-499b")
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"])
        invite = _invite(ids["instance_id"], ids["coach_id"], candidate, vacancy_id, "sent")
    request_id, _, _ = _request(app, ids, asker)
    _fails_once(monkeypatch)
    with patch(INT_PATCHES[0]), patch(INT_PATCHES[1]):
        with pytest.raises(RuntimeError):
            _decide(app, ids, request_id, accept=True)
        with app.app_context():
            assert db.session.get(ClassJoinRequest, request_id).status == "pending"
            assert Vacancy.query.get(vacancy_id).status == "open"
            assert NotificationEvent.query.get(invite).status == "sent"
            assert _message_is_actionable(invite)
            assert asker not in LessonInstance.query.get(ids["instance_id"]).enrolled_player_ids
        assert _decide(app, ids, request_id, accept=True) == "accepted"
        with app.app_context():
            assert asker in LessonInstance.query.get(ids["instance_id"]).enrolled_player_ids


# ── #527 final read item 5: the waiting-list fill re-checks the student under its lock ──────

@pytest.mark.parametrize("meanwhile", ["declined", "left_the_list", "enrolled"])
def test_waiting_list_invitation_rechecks_the_student_under_its_lock(app, monkeypatch, meanwhile):
    """PAD-446 (waiting-list rule 13): the batch picks the waiting list (`_waiting_list_candidates`)
    before the per-student vacancy lock. A "no" to this class (rule 18), the student leaving the
    waiting list, or the student being enrolled by another path, landing between the pick and the
    lock must stop the invitation. The change is written by ANOTHER connection, as a
    concurrent request would: a commit in this session would expire and reload `entry` by itself
    and hide a missing re-read (final read of #527, F1)."""
    from padel_app.models import LessonInstance, NotificationEvent, Vacancy, WaitingListEntry
    from padel_app.services import notification_service as ns
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _open_vacancy, _world

    ids = _world(app)
    with app.app_context(), patch(INT_PATCHES[0]), patch(INT_PATCHES[1]):
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        entry = WaitingListEntry(lesson_instance_id=ids["instance_id"], player_id=ids["bea"],
                                 coach_id=ids["coach_id"], is_active=True)
        db.session.add(entry)
        db.session.commit()
        entry_id = entry.id
        real_conversation = ns._get_or_create_direct_conversation

        def conversation(coach_user_id, player_user_id):
            # just before the per-student lock: what another request committed, on its own connection
            from sqlalchemy.orm import Session as OtherSession

            from padel_app.models.presences import Presence

            with OtherSession(db.engine) as other:
                if meanwhile == "declined":
                    other.add(NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"],
                                                player_id=ids["bea"], type="manual", round_number=1,
                                                status="expired", answer="no"))
                elif meanwhile == "left_the_list":
                    other.query(WaitingListEntry).filter_by(id=entry_id).update({"is_active": False})
                else:
                    other.add(Presence(player_id=ids["bea"], lesson_instance_id=ids["instance_id"]))
                other.commit()
            return real_conversation(coach_user_id, player_user_id)

        monkeypatch.setattr(ns, "_get_or_create_direct_conversation", conversation)
        sent = ns._send_invitation_batch(
            Vacancy.query.get(vacancy_id), LessonInstance.query.get(ids["instance_id"]),
            ns.get_or_create_config(ids["coach_id"]), ids["coach_id"])
        db.session.expire_all()
        assert str(ids["bea"]) not in [row["id"] for row in sent]
        assert NotificationEvent.query.filter_by(player_id=ids["bea"], round_number=0).count() == 0
        if meanwhile != "enrolled":
            assert ids["bea"] not in LessonInstance.query.get(ids["instance_id"]).enrolled_player_ids
        assert Vacancy.query.get(vacancy_id).status == "open"
