"""The engine's per-minute run stays cheap (notifications.config rule 18, notifications.engine-store rule 7).

Prod, 25 Nov 2026: with every coach switched to the new engine, ``engine_tick`` (every
``ENGINE_RUN_EVERY``) ran 1-2 minutes and about half its fires were skipped. Its adoption pass read every
class of every switched coach one by one, with all their past occurrences, and its cutover pass asked
the primary coach of every occurrence a coach ever had, every minute. SQL statements are counted with
SQLAlchemy's ``before_cursor_execute``.
"""
import json
import logging
import re
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from padel_app.sql_db import db

#: Wednesday 25 Nov 2026, 10:00 UTC (winter: Lisbon wall clock is UTC).
NOW = datetime(2026, 11, 25, 10, 0)
PLAYERS = 8
#: STORE-21: an idle listed session's statements in one run (measured 34 after the fix, about 110 before).
STATEMENTS_PER_IDLE_SESSION = 40


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app import scheduler
    from padel_app.services import engine_switch
    from padel_app.utils import dates
    from padel_app.utils.dates import utc_to_wall_naive

    for module in (dates, scheduler, engine_switch):
        monkeypatch.setattr(module, "utcnow_naive", lambda: NOW)
    monkeypatch.setattr(scheduler, "club_now_naive", lambda: utc_to_wall_naive(NOW))
    with app.app_context():
        yield


def _coach(n, *, first_invite=None, reminder_hours=24):
    """A coach switched a day before ``NOW`` (invitations 48 h before unless ``first_invite`` says
    otherwise, the attendance request ``reminder_hours`` before), with ``PLAYERS`` students. Returns
    (coach id, club id, level id, player ids)."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player

    cu = User(name=f"Coach {n}", username=f"load_c{n}", password="x", status="active")
    db.session.add(cu)
    db.session.flush()
    coach, club = Coach(user_id=cu.id), Club(name=f"Club {n}", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="N3", code="N3", display_order=3)
    db.session.add(level)
    db.session.flush()
    pids = []
    for k in range(PLAYERS):
        u = User(name=f"S{n}_{k}", username=f"load_s{n}_{k}", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id,
                                                side="left" if k % 2 else "right"))
        pids.append(p.id)
    config = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True)
    config.invitation_start_timing = first_invite or {"type": "hours_before", "value": 48}
    config.reminder_type, config.reminder_value = "hours_before", reminder_hours
    config.engine_version, config.engine_switched_at = "new", NOW - timedelta(days=1)
    db.session.add(config)
    db.session.commit()
    return coach.id, club.id, level.id, pids


def _weekly(coach, first, *, past_weeks=0, regulars=2):
    """A weekly class of ``coach`` whose first occurrence is ``first`` (wall clock), with
    ``past_weeks`` of its occurrences before ``NOW`` materialised (before the switch, no engine row)."""
    from padel_app.models import Lesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.lesson_instances import LessonInstance

    coach_id, club_id, level_id, pids = coach
    lesson = Lesson(title="Weekly", start_datetime=first, end_datetime=first + timedelta(hours=1), is_recurring=True,
                    recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(first.weekday() + 1) % 7]}),
                    recurrence_end=(NOW + timedelta(weeks=30)).date(), type="academy", max_players=4,
                    color="#000", status="active", club_id=club_id, default_level_id=level_id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    for k in range(regulars):
        db.session.add(Association_PlayerLesson(player_id=pids[(lesson.id + k) % len(pids)], lesson_id=lesson.id))
    for w in range(past_weeks):
        start = first + timedelta(weeks=w)
        if start >= NOW:
            break
        db.session.add(LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                      original_lesson_occurence_date=start.date(), max_players=4, status="scheduled",
                                      level_id=level_id, created_at=start - timedelta(days=2)))
    db.session.commit()
    return lesson


def _classes(coach, count, weeks):
    """``count`` weekly classes of ``coach``, spread over the week, each started ``weeks`` ago."""
    base = datetime.combine((NOW - timedelta(weeks=weeks)).date(), datetime.min.time())
    for i in range(count):
        _weekly(coach, base + timedelta(days=i % 7, hours=9 + (i // 7) % 10), past_weeks=weeks)


def _occurrences(lesson):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_switch import engine_for

    rows = LessonInstance.query.filter_by(lesson_id=lesson.id).order_by(LessonInstance.start_datetime).all()
    assert all(engine_for(r) == "new" for r in rows)
    return [r.start_datetime for r in rows]


class _Statements:
    def __init__(self):
        self.n = 0

    def __call__(self, *args, **kwargs):
        self.n += 1

    def __enter__(self):
        event.listen(db.engine, "before_cursor_execute", self)
        return self

    def __exit__(self, *exc):
        event.remove(db.engine, "before_cursor_execute", self)


def _passes(now):
    """The SQL statements of the run's adoption and cutover passes at ``now``."""
    from padel_app.services.engine_switch import adopt_due, cutover_pass

    with _Statements() as count:
        adopt_due(now=now)
        cutover_pass(now=now)
    return count.n


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-85")
def test_the_runs_queries_do_not_grow_with_classes_or_history():
    """Two drained, switched coaches, 10 weekly classes each with 4 weeks of past occurrences; then 30
    more classes each with 30 weeks of past occurrences. At a minute where nothing becomes due, the
    adoption and cutover passes issue the same number of statements both times."""
    from padel_app.models import EngineSession
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services import engine_runner

    coaches = [_coach(n) for n in range(2)]
    for coach in coaches:
        _classes(coach, 10, 4)
    engine_runner.run_tick(NOW)                           # what is due now is made and adopted
    small = _passes(NOW + timedelta(minutes=1))

    for coach in coaches:
        _classes(coach, 30, 30)
    engine_runner.run_tick(NOW + timedelta(minutes=2))
    made = LessonInstance.query.filter(LessonInstance.start_datetime > NOW).count()
    assert made > 0 and EngineSession.query.count() == made          # the due ones exist, all adopted
    large = _passes(NOW + timedelta(minutes=3))

    assert LessonInstance.query.count() > 1800
    assert large == small


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-86")
def test_every_due_occurrence_is_still_materialised_at_its_run():
    """Invitations 9 days before: a minute before an occurrence's due minute it is not materialised, at
    its due minute it is, and adopted, the series' second occurrence included. An attendance request
    earlier than the invitation start materialises by the request. ``first_invite`` none materialises
    every occurrence of the scheduling window."""
    from padel_app.services import engine_runner
    from padel_app.utils.dates import wall_to_utc_naive

    nine_days = _coach(0, first_invite={"type": "hours_before", "value": 216})
    by_request = _coach(1, first_invite={"type": "hours_before", "value": 24}, reminder_hours=72)
    at_creation = _coach(2, first_invite={"type": "none"})
    first = datetime(2026, 12, 3, 19, 0)                   # a Thursday, wall clock (UTC in winter)
    long_lead = _weekly(nine_days, first)
    early_ask = _weekly(by_request, first + timedelta(hours=1))
    open_now = _weekly(at_creation, first + timedelta(hours=2))

    first_due = wall_to_utc_naive(first) - timedelta(hours=216)
    second_due = wall_to_utc_naive(first + timedelta(weeks=1)) - timedelta(hours=216)
    assert first_due < NOW < second_due
    ask_due = wall_to_utc_naive(first + timedelta(hours=1)) - timedelta(hours=72)
    assert NOW < ask_due < second_due
    engine_runner.run_tick(NOW)                            # the first is past its due minute
    assert _occurrences(long_lead) == [first]
    assert len(_occurrences(open_now)) == 8                # every occurrence of the 60-day window
    engine_runner.run_tick(ask_due - timedelta(minutes=1))
    assert _occurrences(early_ask) == []
    engine_runner.run_tick(ask_due)
    assert _occurrences(early_ask) == [first + timedelta(hours=1)]

    engine_runner.run_tick(second_due - timedelta(minutes=1))
    assert _occurrences(long_lead) == [first]
    engine_runner.run_tick(second_due)
    assert _occurrences(long_lead) == [first, first + timedelta(weeks=1)]


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-87")
def test_one_coachs_failure_in_the_adoption_pass_does_not_stop_the_run(monkeypatch, caplog):
    """Two switched coaches, each with an occurrence created after the switch and no engine row. The
    first coach's adoption pass raises outside one occurrence's adoption: the second's occurrence is
    adopted, the cutover pass and the sessions' tick still run, and the failure is logged."""
    from padel_app.models import EngineSession
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services import engine_runner, engine_switch
    from padel_app.services.engine_switch import engine_for

    broken, fine = _coach(0), _coach(1)
    lessons = {c[0]: _weekly(c, datetime(2026, 11, 26, 19, 0)) for c in (broken, fine)}
    engine_runner.run_tick(NOW)                            # both materialised (due 48 h before)
    EngineSession.query.delete()                           # as if each creation hook had failed
    db.session.commit()

    real_future = engine_switch._future_occurrences

    def failing(coach_id, now, **kw):
        if coach_id == broken[0]:
            raise RuntimeError("boom")
        return real_future(coach_id, now, **kw)

    ran = []
    real_cutover, real_tick = engine_switch.cutover_pass, engine_runner.tick_sessions
    monkeypatch.setattr(engine_switch, "_future_occurrences", failing)
    monkeypatch.setattr(engine_switch, "cutover_pass", lambda **kw: ran.append("cutover") or real_cutover(**kw))
    monkeypatch.setattr(engine_runner, "tick_sessions", lambda *a, **kw: ran.append("tick") or real_tick(*a, **kw))
    caplog.set_level(logging.ERROR)
    engine_runner.run_tick(NOW + timedelta(minutes=1))

    def occurrence(coach):
        return LessonInstance.query.filter_by(lesson_id=lessons[coach[0]].id).one()

    assert engine_for(occurrence(fine)) == "new"
    assert engine_for(occurrence(broken)) == "old"
    assert ran == ["cutover", "tick"]
    assert any(f"coach {broken[0]}" in r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-20")
def test_each_run_logs_its_duration_and_counts(caplog):
    """One switched coach with one occurrence due: the run logs one INFO line with its total ms, each
    pass's ms, and the materialised, adopted, sessions, effects and sent counts."""
    from padel_app.services import engine_runner

    coach = _coach(0)
    _weekly(coach, datetime(2026, 11, 26, 19, 0))         # tomorrow: due (48 h before) at this run
    caplog.set_level(logging.INFO, logger="padel_app.services.engine_runner")
    engine_runner.run_tick(NOW)
    [line] = [r.getMessage() for r in caplog.records
              if r.name == "padel_app.services.engine_runner" and r.levelno == logging.INFO
              and r.getMessage().startswith("engine_tick:")]
    assert re.search(r"\bms=\d+\b", line), line
    for phase in ("adopt", "cutover", "sessions", "outbox"):
        assert re.search(rf"\b{phase}_ms=\d+\b", line), line
    counts = dict(re.findall(r"\b(materialised|adopted|listed|effects|sent)=(\d+)\b", line))
    assert set(counts) == {"materialised", "adopted", "listed", "effects", "sent"}, line
    assert (counts["materialised"], counts["listed"]) == ("1", "1"), line


def _history(lesson, weeks, *, before):
    """``weeks`` more past occurrences of ``lesson`` (before ``before``), each with its regulars' presences."""
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    regulars = [r.player_id for r in Association_PlayerLesson.query.filter_by(lesson_id=lesson.id).all()]
    for w in range(1, weeks + 1):
        start = before - timedelta(weeks=w)
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              original_lesson_occurence_date=start.date(), max_players=4, status="scheduled",
                              level_id=lesson.default_level_id, created_at=start - timedelta(days=2))
        db.session.add(inst)
        db.session.flush()
        for k, pid in enumerate(regulars):
            db.session.add(Presence(lesson_instance_id=inst.id, player_id=pid, enrolment_source="roster",
                                    status="absent" if (w + k) % 3 == 0 else "present",
                                    justification="justified" if (w + k) % 6 == 0 else None))
    db.session.commit()


class _Reads(_Statements):
    """Statements, the largest number of bound parameters of one statement, and ORM rows loaded."""

    def __init__(self):
        super().__init__()
        self.params = 0
        self.loaded = 0

    def __call__(self, conn, cursor, statement, parameters, context, executemany):
        self.n += 1
        self.params = max(self.params, len(parameters or ()))

    def _load(self, *args):
        self.loaded += 1

    def __enter__(self):
        event.listen(db.Model, "load", self._load, propagate=True)
        return super().__enter__()

    def __exit__(self, *exc):
        event.remove(db.Model, "load", self._load)
        return super().__exit__(*exc)


def _sessions_tick(now):
    from padel_app.services import engine_runner
    from padel_app.services.engine_store import TableStore

    store = TableStore(clock=lambda: now)
    listed = len(store.sessions())
    snapshots = []
    real = store.snapshot
    store.snapshot = lambda s: snapshots.append(s) or real(s)
    with _Reads() as reads:
        effects = engine_runner.tick_sessions(now, store)
    return listed, len(snapshots), effects, reads


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-21")
def test_a_session_with_nothing_due_reads_a_bounded_amount_whatever_the_history():
    """Switched coaches' listed sessions with nothing due: one snapshot each, at most
    ``STATEMENTS_PER_IDLE_SESSION`` statements each, and the same statements, ORM rows and largest
    bound-parameter list with 4 weeks of past classes as with 30 more, and another coach's classes."""
    from padel_app.models import Lesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.services import engine_runner

    coaches = [_coach(n) for n in range(2)]
    for coach in coaches:
        _classes(coach, 14, 0)
    lessons = Lesson.query.all()
    for lesson in lessons:
        _history(lesson, 4, before=lesson.start_datetime)
    engine_runner.run_tick(NOW)
    engine_runner.run_tick(NOW + timedelta(minutes=1))     # what fell due is sent; nothing is due after
    listed, snapshots, effects, small = _sessions_tick(NOW + timedelta(minutes=2))
    assert listed > 5 and effects == [] and snapshots == listed
    assert small.n <= STATEMENTS_PER_IDLE_SESSION * listed + 2

    for lesson in lessons:
        _history(lesson, 26, before=lesson.start_datetime - timedelta(weeks=4))
    other = _coach(9)                                      # another coach's classes and their history
    _classes(other, 8, 0)
    for row in Association_CoachLesson.query.filter_by(coach_id=other[0]).all():
        lesson = db.session.get(Lesson, row.lesson_id)
        _history(lesson, 30, before=lesson.start_datetime)
    listed_after, _, effects, large = _sessions_tick(NOW + timedelta(minutes=3))
    assert effects == [] and listed_after == listed          # the other coach's classes are on no engine row
    assert (large.n, large.loaded, large.params) == (small.n, small.loaded, small.params)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-85")
def test_the_cutover_pass_reads_the_jobs_once_and_asks_only_their_coaches(live_scheduler):
    """Old-engine jobs still armed for one undrained coach's old occurrence: the cutover pass reads the
    scheduler's jobs once and issues the same statements whether or not three more drained coaches,
    with classes and history but no old job, are switched too; once that occurrence has started and the
    coach is drained, its jobs are removed."""
    from apscheduler.triggers.date import DateTrigger

    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services import engine_runner
    from padel_app.services.engine_switch import cutover_pass

    undrained = _coach(0)
    lesson = _weekly(undrained, datetime(2026, 11, 25, 9, 0))
    start = datetime(2026, 11, 26, 18, 0)                  # existed at the switch, never adopted: old engine
    old = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                         original_lesson_occurence_date=start.date(), max_players=4, status="scheduled",
                         level_id=lesson.default_level_id, created_at=NOW - timedelta(days=3))
    db.session.add(old)
    db.session.commit()
    sched = live_scheduler._scheduler
    for job_id in (f"reminder_{old.id}", f"invite_start_{old.id}", f"reminder_lesson_{lesson.id}_{start.date()}"):
        sched.add_job(print, DateTrigger(run_date=start + timedelta(days=30)), id=job_id)
    reads = []
    real_get = sched.get_jobs
    sched.get_jobs = lambda *a, **k: reads.append(1) or real_get(*a, **k)

    def cutover(now):
        reads.clear()
        with _Statements() as count:
            assert cutover_pass(now=now) == {}
        assert len(reads) == 1
        return count.n

    alone = cutover(NOW)
    for n in range(1, 4):
        coach = _coach(n)
        _classes(coach, 6, 4)
    engine_runner.run_tick(NOW + timedelta(minutes=1))     # their due occurrences made and adopted: drained
    assert cutover(NOW + timedelta(minutes=2)) == alone

    removed = cutover_pass(now=start + timedelta(minutes=1))   # the old occurrence has started: drained
    assert sorted(removed[undrained[0]]) == sorted(
        [f"reminder_{old.id}", f"invite_start_{old.id}", f"reminder_lesson_{lesson.id}_{start.date()}"])


def _old_occurrence(coach, lesson):
    """An occurrence of ``lesson`` that existed at the switch and was never adopted (old engine), with
    its three old-engine jobs armed. Returns (occurrence, start, job ids)."""
    from apscheduler.triggers.date import DateTrigger

    from padel_app import scheduler
    from padel_app.models.lesson_instances import LessonInstance

    start = datetime(2026, 11, 26, 18, 0)
    old = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                         original_lesson_occurence_date=start.date(), max_players=4, status="scheduled",
                         level_id=lesson.default_level_id, created_at=NOW - timedelta(days=3))
    db.session.add(old)
    db.session.commit()
    ids = [f"reminder_{old.id}", f"invite_start_{old.id}", f"reminder_lesson_{lesson.id}_{start.date()}"]
    for job_id in ids:
        scheduler._scheduler.add_job(print, DateTrigger(run_date=start + timedelta(days=30)), id=job_id)
    return old, start, ids


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-85")
def test_a_co_coached_class_keeps_its_jobs_with_its_primary_coach(live_scheduler):
    """A class of an undrained coach that a drained coach also coaches: the job belongs to the primary
    coach only, so the drained co-coach's cutover removes nothing, and the primary coach's drain does."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.services.engine_switch import cutover_pass

    primary, other = _coach(0), _coach(1)
    lesson = _weekly(primary, datetime(2026, 11, 25, 9, 0))
    db.session.add(Association_CoachLesson(coach_id=other[0], lesson_id=lesson.id))   # second junction row
    db.session.commit()
    _, start, ids = _old_occurrence(primary, lesson)

    assert cutover_pass(now=NOW) == {}                       # the co-coach has no other class: drained
    assert sorted(j.id for j in live_scheduler._scheduler.get_jobs()) == sorted(ids)
    removed = cutover_pass(now=start + timedelta(minutes=1))
    assert list(removed) == [primary[0]] and sorted(removed[primary[0]]) == sorted(ids)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-88")
def test_a_failure_of_the_cutover_passs_shared_reads_does_not_stop_the_run(live_scheduler, monkeypatch, caplog):
    """Old-engine jobs armed and the owner lookup raises: the failure is logged, the session tick and the
    outbox still run, and the database session is usable afterwards."""
    from padel_app.models.coaches import Coach
    from padel_app.services import engine_runner, engine_switch

    coach = _coach(0)
    _old_occurrence(coach, _weekly(coach, datetime(2026, 11, 25, 9, 0)))

    def boom(keys):
        db.session.execute(db.text("select * from no_such_table"))   # leaves the transaction failed

    ran = []
    monkeypatch.setattr(engine_switch, "_old_job_owners", boom)
    monkeypatch.setattr(engine_runner, "tick_sessions", lambda *a, **kw: ran.append("tick") or [])
    monkeypatch.setattr(engine_runner, "send_outbox", lambda: ran.append("outbox") or 0)
    caplog.set_level(logging.ERROR)
    engine_runner.run_tick(NOW + timedelta(minutes=1))

    assert ran == ["tick", "outbox"]
    assert any("shared reads failed" in r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR)
    assert Coach.query.count() == 1                           # the session was rolled back, not left failed
