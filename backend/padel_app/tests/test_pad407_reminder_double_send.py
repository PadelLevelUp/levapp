"""PAD-407: every automatic class reminder went out 2-3x (prod, since 2026-09-16).

Since PAD-331 the occurrence job materialises the class, every roster enrolment arms
an ask pass due "now", and those passes ran `send_class_reminders` at the same moment
as the job's own pass. The only guard was count-then-insert, so concurrent passes all
counted 0 and all sent; each sender then re-armed its own retry chain, and prod's
`apscheduler_jobs` still holds those doubled chains.

The fix, pinned here:
- one pass at a time per occurrence (a Postgres advisory lock held for the whole pass);
- a SCHEDULED pass skips a student reminded less than `hoursBetweenReminders` ago, so a
  duplicate chain's twin sends nothing and re-arms nothing (the coach's manual send is
  unchanged);
- the occurrence job's materialisation arms no ask passes (its own pass asks everyone);
  a student added after the chain stopped is still asked (PAD-331).

The race cells need two real connections: they run on Postgres only
(`LEVAPP_TEST_DB=postgres`). The race is forced, not hoped for: a gate inside
`count_attempts` holds the first pass until the second has counted too — without the
lock both count 0 every time; with it the second pass waits on the lock and the gate
times out.
"""
import contextlib
import os
import threading
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db

IO_PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
)
GATE_SECONDS = 1.5

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


@contextlib.contextmanager
def _io_patched():
    with contextlib.ExitStack() as stack:
        for target in IO_PATCHES:
            stack.enter_context(patch(target))
        yield


@pytest.fixture
def live_scheduler(app):
    """A real APScheduler on a memory store, never started: jobs only run by hand."""
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler

    from padel_app import scheduler as sched

    sched._scheduler = BackgroundScheduler(jobstores={"default": MemoryJobStore()}, timezone="UTC")
    sched._app = app
    try:
        yield sched
    finally:
        sched._scheduler = None
        sched._app = None


def _seed(app, *, reminder_count, hours_between=2.0, n_players=3):
    """A coach, a one-off class tomorrow with `n_players` on its roster, not materialised."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.users import User
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        cu = User(name="Coach 407", username="coach_407", email="coach-407@test.com",
                  password="x", status="active")
        db.session.add(cu)
        db.session.flush()
        coach = Coach(user_id=cu.id)
        club = Club(name="Club 407", description="", location="x")
        db.session.add_all([coach, club])
        db.session.flush()
        start = (datetime.utcnow() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        lesson = Lesson(title="Aula 407", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, recurrence_rule=None, type="academy", max_players=8,
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        player_ids = []
        for i in range(n_players):
            su = User(name=f"Aluno {i}", username=f"aluno_407_{i}", email=f"aluno-407-{i}@test.com",
                      password="x", status="active")
            db.session.add(su)
            db.session.flush()
            player = Player(user_id=su.id)
            db.session.add(player)
            db.session.flush()
            db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson.id))
            player_ids.append(player.id)
        db.session.commit()
        # As in prod, each student already has a conversation with the coach — otherwise
        # two unlocked passes collide on creating it and the OLD cell fails for that instead.
        from padel_app.services.notification_service import _get_or_create_direct_conversation

        for pid in player_ids:
            _get_or_create_direct_conversation(cu.id, db.session.get(Player, pid).user_id)
        db.session.commit()
        cfg = get_or_create_config(coach.id)
        cfg.reminder_count = reminder_count
        cfg.hours_between_reminders = float(hours_between)
        db.session.commit()
        return {"coach_id": coach.id, "lesson_id": lesson.id, "date": start.date(),
                "date_str": start.date().isoformat(), "player_ids": player_ids,
                "hours": float(hours_between)}


def _materialise(app, ids):
    """The occurrence, materialised with no ask pass armed (setup, not under test)."""
    from padel_app.models.lessons import Lesson
    from padel_app.scheduler import _asks_suppressed
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context():
        with _asks_suppressed():
            instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson_id"]), ids["date"])
        db.session.commit()
        return instance.id


def _attempts(app, instance_id):
    """{(player_id, number): rows} — any value above 1 is a double send."""
    from padel_app.models import ReminderAttempt

    with app.app_context():
        out = {}
        for row in ReminderAttempt.query.filter_by(lesson_instance_id=instance_id).all():
            out[(row.player_id, row.number)] = out.get((row.player_id, row.number), 0) + 1
        return out


def _reminder_messages(app, instance_id):
    from padel_app.models import Message

    with app.app_context():
        return [m for m in Message.query.filter_by(message_type="notification_reminder").all()
                if (m.msg_metadata or {}).get("lessonInstanceId") == instance_id]


def _backdate_attempts(app, instance_id, hours):
    """Time passing for the spacing guard: every attempt so far happened `hours` ago."""
    from padel_app.models import ReminderAttempt

    with app.app_context():
        for row in ReminderAttempt.query.filter_by(lesson_instance_id=instance_id).all():
            row.sent_at = row.sent_at - timedelta(hours=hours)
        db.session.commit()


@contextlib.contextmanager
def _forced_interleave(monkeypatch):
    """Hold each thread's FIRST `count_attempts` at a two-party gate: without a lock
    both passes have counted before either inserts; with one, the gate times out."""
    from padel_app.services import reminder_attempt_service as attempts

    real = attempts.count_attempts
    gate = threading.Barrier(2)
    seen = threading.local()

    def gated(instance_id, player_id):
        if not getattr(seen, "done", False):
            seen.done = True
            try:
                gate.wait(timeout=GATE_SECONDS)
            except threading.BrokenBarrierError:
                pass
        return real(instance_id, player_id)

    monkeypatch.setattr(attempts, "count_attempts", gated)
    yield


def _race(app, targets):
    """Run each callable in its own thread with its own app context; re-raise failures."""
    errors = []

    def wrap(fn):
        def run():
            try:
                with app.app_context():
                    fn()
                    db.session.remove()
            except BaseException as exc:  # noqa: BLE001 — surfaced below
                errors.append(exc)
        return threading.Thread(target=run)

    threads = [wrap(fn) for fn in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "a pass never finished (lock never released?)"
    assert not errors, errors


# ── the race: old code × new code, two passes at once ───────────────────────


@POSTGRES_ONLY
@pytest.mark.parametrize("reminder_count", [1, 3])
def test_two_passes_at_once_send_each_student_one_reminder(app, monkeypatch, reminder_count):
    from padel_app.services.notification_service import send_class_reminders

    ids = _seed(app, reminder_count=reminder_count)
    iid = _materialise(app, ids)
    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [lambda: send_class_reminders(iid, scheduled=True)] * 2)

    assert _attempts(app, iid) == {(pid, 1): 1 for pid in ids["player_ids"]}
    assert len(_reminder_messages(app, iid)) == len(ids["player_ids"])


@POSTGRES_ONLY
def test_without_the_lock_the_same_race_double_sends(app, monkeypatch):
    """The OLD cell: the harness has teeth — no lock, no spacing, and both passes send."""
    from padel_app.services import notification_service
    from padel_app.services.notification_service import send_class_reminders

    monkeypatch.setattr(notification_service, "_reminder_pass_lock", lambda _iid: contextlib.nullcontext())
    ids = _seed(app, reminder_count=1)
    iid = _materialise(app, ids)
    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [lambda: send_class_reminders(iid, scheduled=False)] * 2)

    assert set(_attempts(app, iid).values()) == {2}, "every student got the first reminder twice"


@POSTGRES_ONLY
def test_the_doubled_retry_chains_already_in_prod_send_the_follow_up_once(app, monkeypatch, live_scheduler):
    """Prod holds `reminder_<inst>_retry_*` AND `reminder_lesson_<L>_<date>_retry_*` for the
    same second. Both fire together: one follow-up each, and only one chain goes on."""
    from padel_app import scheduler as sched

    ids = _seed(app, reminder_count=3, hours_between=2)
    iid = _materialise(app, ids)
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context(), _io_patched():
        send_class_reminders(iid, scheduled=True)          # the first reminder, once
    live_scheduler._scheduler.remove_all_jobs()
    _backdate_attempts(app, iid, ids["hours"])             # the retries' moment has come

    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [
            lambda: sched._run_send_reminders(iid),
            lambda: sched._run_reminder_for_lesson_occurrence(ids["lesson_id"], ids["date_str"]),
        ])

    got = _attempts(app, iid)
    assert got == {**{(pid, 1): 1 for pid in ids["player_ids"]},
                   **{(pid, 2): 1 for pid in ids["player_ids"]}}, got
    retries = [j.id for j in live_scheduler._scheduler.get_jobs() if "_retry_" in j.id]
    assert len(retries) == 1, f"the twin chain must end, not re-arm: {retries}"


# ── the spacing guard, sequential (SQLite and Postgres) ─────────────────────


def test_a_scheduled_pass_right_after_another_sends_nothing(app):
    """A duplicate chain's twin, one after the other: nothing to send, nothing to re-arm."""
    from padel_app.services.notification_service import send_class_reminders

    ids = _seed(app, reminder_count=3)
    iid = _materialise(app, ids)
    with app.app_context(), _io_patched():
        first = send_class_reminders(iid, scheduled=True)
        twin = send_class_reminders(iid, scheduled=True)
    assert first["sent"] == 3 and first["more_due"] is True
    assert twin == {"sent": 0, "more_due": False, "blocked": []}
    assert _attempts(app, iid) == {(pid, 1): 1 for pid in ids["player_ids"]}


def test_a_scheduled_pass_after_the_gap_sends_the_follow_up(app):
    from padel_app.services.notification_service import send_class_reminders

    ids = _seed(app, reminder_count=3)
    iid = _materialise(app, ids)
    with app.app_context(), _io_patched():
        send_class_reminders(iid, scheduled=True)
    _backdate_attempts(app, iid, ids["hours"])
    with app.app_context(), _io_patched():
        second = send_class_reminders(iid, scheduled=True)
    assert second["sent"] == 3
    assert all(n in (1, 2) for (_pid, n) in _attempts(app, iid))


def test_the_coachs_manual_send_is_unchanged(app):
    """`POST /send_reminders` is not scheduled: it still sends the next reminder at once."""
    from padel_app.services.notification_service import send_class_reminders

    ids = _seed(app, reminder_count=3)
    iid = _materialise(app, ids)
    with app.app_context(), _io_patched():
        send_class_reminders(iid, scheduled=True)
        manual = send_class_reminders(iid)
    assert manual["sent"] == 3


# ── the arming: the occurrence job arms no ask passes; a late add still does ─


def test_the_occurrence_job_arms_no_ask_passes_and_sends_once(app, live_scheduler):
    from padel_app import scheduler as sched

    ids = _seed(app, reminder_count=1)
    with _io_patched():
        sched._run_reminder_for_lesson_occurrence(ids["lesson_id"], ids["date_str"])
    asks = [j.id for j in live_scheduler._scheduler.get_jobs() if j.id.startswith("ask_")]
    assert asks == [], f"materialising inside the job armed ask passes: {asks}"
    with app.app_context():
        from padel_app.models import LessonInstance

        iid = LessonInstance.query.filter_by(lesson_id=ids["lesson_id"]).one().id
    assert _attempts(app, iid) == {(pid, 1): 1 for pid in ids["player_ids"]}


def test_a_student_added_after_the_chain_stopped_is_still_asked(app, live_scheduler):
    """PAD-331 stands: outside the occurrence job, an enrolment arms its ask pass."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed(app, reminder_count=1)
    iid = _materialise(app, ids)
    with app.app_context(), _io_patched():
        send_class_reminders(iid, scheduled=True)
        live_scheduler._scheduler.remove_all_jobs()
        late, _uid = _second_student(app, ids["coach_id"], "late407")
        enrol(late, db.session.get(LessonInstance, iid), "coach")
    asks = [j for j in live_scheduler._scheduler.get_jobs() if j.id.startswith(f"ask_{iid}_{late}_")]
    assert len(asks) == 1
    with _io_patched():
        asks[0].func(*asks[0].args)
    assert _attempts(app, iid).get((late, 1)) == 1


def test_a_returning_student_reminded_minutes_ago_is_still_asked(app, live_scheduler):
    """PAD-318 stands: the spacing reads only COUNTED attempts. A student re-added after
    cancelling had their earlier reminder voided a moment ago; the scheduled pass asks them."""
    from padel_app.models import LessonInstance, Presence
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import send_class_reminders

    ids = _seed(app, reminder_count=3)
    iid = _materialise(app, ids)
    back = ids["player_ids"][0]
    with app.app_context(), _io_patched():
        send_class_reminders(iid, scheduled=True)                      # everyone asked, just now
        presence = Presence.query.filter_by(lesson_instance_id=iid, player_id=back).one()
        presence.status = "absent"                                     # they gave the seat up
        db.session.commit()
        enrol(back, db.session.get(LessonInstance, iid), "coach")      # the coach puts them back
        assert attempts.count_attempts(iid, back) == 0, "the earlier round is void"
        again = send_class_reminders(iid, scheduled=True)
    assert again["sent"] == 1, "only the returning student is asked; the others are inside the gap"
    with app.app_context():
        assert attempts.count_attempts(iid, back) == 1
