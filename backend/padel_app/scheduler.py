"""
APScheduler integration for the LevelUp notification engine.

Architecture
------------
- Module-level singletons: ``_app`` and ``_scheduler`` are set once by
  ``init_scheduler()`` and reused by all public functions.  Job runner
  functions look them up at *call time* rather than receiving them as
  pickled arguments — the Flask app object is not picklable.

Jobs
----
- ``reminder_lesson_{lesson_id}_{YYYY-MM-DD}`` — DateTrigger — fires _run_reminder_for_lesson_occurrence()
- ``invite_start_lesson_{lesson_id}_{YYYY-MM-DD}`` — DateTrigger — fires _run_invite_start_for_lesson_occurrence()
                                                 (PAD-540, invitations rule 1c: a never-filled place of an
                                                 occurrence not yet materialised)
- ``reminder_{instance_id}``                   — DateTrigger — fires send_class_reminders() (legacy, for already-materialized instances)
- ``invite_start_{instance_id}``               — DateTrigger — fires trigger_invitations()
- ``process_batches``                          — IntervalTrigger (2 min) — fires process_invitation_batches()
- ``extend_schedule_window``                   — IntervalTrigger (1 day) — extends 60-day reminder horizon
                                                 and re-derives any missing lesson reminder jobs

Public API (no ``app`` argument needed)
---------------------------------------
- ``init_scheduler(app, test_config=None)``
- ``schedule_lesson_reminder_jobs(lesson_id, coach_id, horizon_days=60)``
- ``cancel_lesson_reminder_jobs(lesson_id, from_date=None)``
- ``cancel_lesson_occurrence_job(lesson_id, date_str)``
- ``schedule_instance_jobs(instance_id, coach_id)``
- ``cancel_instance_jobs(instance_id)``
- ``reschedule_all_future_jobs(coach_id)``

Convenience hooks for lesson_service (safe no-ops when scheduler is absent)
---------------------------------------------------------------------------
- ``_maybe_schedule_instance(instance)``
- ``_maybe_cancel_instance(instance_id)``
"""

from __future__ import annotations

import atexit
import contextvars
import os
import sys
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

# PAD-134: wall-clock times a coach types into Settings ("send at 18:00") are
# CLUB-LOCAL, not UTC. PAD-144 moved the constant itself into `utils.dates` so
# scheduler, student_availability_service and notification_service share ONE
# definition instead of three drifting copies.
from padel_app.utils.dates import CLUB_TZ, club_now_naive, utc_to_wall_naive, utcnow_naive, wall_to_utc_naive

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_app = None        # Flask application instance — set by init_scheduler()
_scheduler = None  # BackgroundScheduler instance — set by init_scheduler()


# ---------------------------------------------------------------------------
# Context helper
# ---------------------------------------------------------------------------

@contextmanager
def _app_ctx():
    """Push an app context only when one isn't already active.

    When scheduler job functions are called from APScheduler's background
    thread there is no active Flask context, so we push one.  When the same
    function is called from a request handler (e.g. update_config →
    reschedule_all_future_jobs) a context is already active; creating a
    *nested* one would cause its teardown handler to fire on exit, which
    calls db.session.remove() and detaches objects from the outer request.
    """
    from flask import has_app_context
    if has_app_context():
        yield
    else:
        with _app.app_context():
            yield


# ---------------------------------------------------------------------------
# Timing helpers (pure functions — no Flask dependency)
# ---------------------------------------------------------------------------

def _fire_time_utc(wall_start: datetime | None, timing_config: dict | None) -> datetime | None:
    """PAD-256 (R-023): when a timing config fires, as a naive UTC instant.

    ``wall_start`` is a class time as stored: the Lisbon wall clock the coach
    typed. ``hours_before: N`` counts N real hours back from the class's real
    start, even across a daylight-saving change. The ``days_before`` variants
    take the class's OWN wall date minus N days and fire at HH:MM on the club's
    clock, so a 23:30 class gets its day-before reminder on the day before.

    Reminders, the proactive-decline deadline and the invitation start all use
    this (``notifications.reminders`` rule 15, ``attendance.confirm`` rule 10,
    ``notifications.invitations`` rule 11).
    """
    if not timing_config or wall_start is None:
        return None

    t = timing_config.get("type")

    if t == "hours_before":
        value = int(timing_config.get("value", 24))
        return wall_to_utc_naive(wall_start) - timedelta(hours=value)

    if t in ("days_before", "days_before_at_time"):
        days = int(timing_config.get("days", 1))
        time_str = timing_config.get("time", "09:00")
        try:
            hour, minute = (int(p) for p in time_str.split(":"))
        except (ValueError, AttributeError):
            hour, minute = 9, 0
        target_date = wall_start.date() - timedelta(days=days)
        return wall_to_utc_naive(
            datetime(target_date.year, target_date.month, target_date.day, hour, minute)
        )

    return None


def _compute_invite_start_dt(instance, timing_config: dict) -> datetime | None:
    # PAD-256 (notifications.invitations rule 11): a UTC instant, stored as
    # `Vacancy.invite_not_before` and compared with UTC now.
    return _fire_time_utc(instance.start_datetime, timing_config)


def _lesson_primary_coach_id(lesson_id: int) -> int | None:
    """The lesson's primary coach: the first coach assigned to it (junction id ascending),
    the same order `lesson_service.coaches_for` uses for an occurrence with no coach row."""
    from padel_app.models import Association_CoachLesson

    row = (
        Association_CoachLesson.query
        .filter_by(lesson_id=lesson_id)
        .order_by(Association_CoachLesson.id.asc())
        .first()
    )
    return row.coach_id if row is not None else None


_RESCHEDULE_LOCKS: dict[int, threading.RLock] = {}
_RESCHEDULE_LOCKS_GUARD = threading.Lock()
_RESCHEDULE_LOCK_TIMEOUT_S = 30.0


def _coach_reschedule_lock(coach_id: int):
    """The lock that serialises every derivation of the jobs of classes whose PRIMARY coach
    is ``coach_id`` (PAD-478, ``notifications.config`` rule 10e). Process-level: the jobs
    live in this process's scheduler (prod runs one worker for that reason)."""
    with _RESCHEDULE_LOCKS_GUARD:
        return _RESCHEDULE_LOCKS.setdefault(int(coach_id), _CountingRLock())


class _CountingRLock:
    """An RLock that can say whether it is held (``threading.RLock`` cannot)."""

    def __init__(self):
        self._lock = threading.RLock()
        self._depth = 0

    def acquire(self, timeout: float = -1) -> bool:
        got = self._lock.acquire(timeout=timeout) if timeout >= 0 else self._lock.acquire()
        if got:
            self._depth += 1
        return got

    def release(self) -> None:
        self._depth -= 1
        self._lock.release()

    def locked(self) -> bool:
        return self._depth > 0


@contextmanager
def _derivation_lock(coach_id: int):
    """Hold the primary coach's lock for one derivation. Whoever derives a class's jobs, a
    settings save, the startup pass or the daily pass, takes it and reads the configuration
    INSIDE it, so the last derivation to run arms what is saved at that moment.

    Bounded: a derivation that hangs must not block that coach's later saves for ever. The
    one that gives up raises, and a save reports it like any failed reschedule (rule 10c).
    """
    lock = _coach_reschedule_lock(coach_id)
    if not lock.acquire(timeout=_RESCHEDULE_LOCK_TIMEOUT_S):
        raise RuntimeError(
            f"the jobs of coach {coach_id} have been locked by another derivation for over "
            f"{_RESCHEDULE_LOCK_TIMEOUT_S} s"
        )
    try:
        yield
    finally:
        lock.release()


def _saved_config(coach_id: int):
    """The coach's configuration AS SAVED NOW, for deriving jobs. Call it inside
    ``_derivation_lock``.

    Read again from the database: a pass that loaded the row before a save committed would
    otherwise arm the old time after that save's own reschedule had finished. And read
    WITHOUT creating: a derivation triggered by a co-coach must not write a configuration
    row for the primary coach. A coach with no row gets an unsaved one, which answers with
    the defaults.
    """
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.sql_db import db

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        return NotificationConfig(coach_id=coach_id)
    db.session.refresh(config)
    return config


def _armed_fire_time(job_id: str) -> datetime | None:
    """The naive-UTC instant job ``job_id`` is armed for, or None when it is not armed."""
    job = _scheduler.get_job(job_id)
    run_date = getattr(getattr(job, "trigger", None), "run_date", None)
    if run_date is None:
        return None
    return run_date.astimezone(timezone.utc).replace(tzinfo=None) if run_date.tzinfo else run_date


def _reconcile_date_job(job_id: str, fire_dt: datetime | None, cutoff: datetime, *, func, args) -> str:
    """Make ``job_id`` the job the saved configuration implies (PAD-478, B-249;
    ``notifications.config`` rule 10a). Returns what it did.

    - ``fire_dt`` in the future: the job is armed there, replacing whatever was armed.
    - ``fire_dt`` past, or None (a timing of type ``none``): the configuration implies no
      job. A job armed at ANOTHER time came from a previous or an intermediate value and is
      removed; it used to be left in place, and it fired.
    - A job armed at exactly ``fire_dt`` is the implied job itself, merely due: it is left
      to fire or to expire inside its grace time. Removing it would turn a restart that
      lands inside that window into a suppressed reminder.

    Nothing here sends. Every caller (a settings change, a class edit, the startup re-arm,
    the daily window pass) therefore sends nothing by reconciling.
    """
    from apscheduler.triggers.date import DateTrigger

    if fire_dt is not None and fire_dt > cutoff:
        _scheduler.add_job(
            func=func,
            args=args,
            trigger=DateTrigger(run_date=fire_dt, timezone="UTC"),
            id=job_id,
            replace_existing=True,
            misfire_grace_time=300,
        )
        return "armed"

    armed_for = _armed_fire_time(job_id)
    if armed_for is None:
        return "none"
    if fire_dt is not None and abs((armed_for - fire_dt).total_seconds()) <= 1:
        return "kept"
    try:
        _scheduler.remove_job(job_id)
    except Exception:  # noqa: BLE001 — it ran or was removed in between: the goal is met
        return "none"
    if _app is not None:
        _app.logger.info(
            "reconcile: removed %s armed for %s — the configuration now implies %s",
            job_id, armed_for, fire_dt if fire_dt is not None else "no job",
        )
    return "removed"


# ---------------------------------------------------------------------------
# Job runner functions
# (called by APScheduler on its background thread — no app arg, use _app)
# ---------------------------------------------------------------------------

def _maybe_rearm_reminder(instance, *, func, args, base_job_id, result) -> None:
    """Schedule a follow-up reminder pass when students still owe reminders.

    Called from a reminder job runner after ``send_class_reminders``. If the
    service reports ``more_due`` and the class start is still in the future,
    schedule a one-shot DateTrigger job ``get_hours_between_reminders()`` from
    now that re-invokes the same runner. The fire time is never at/after the
    class start. A timestamp-suffixed job id keeps each attempt unique.
    """
    if _scheduler is None:
        return
    if not (result and result.get("more_due")):
        return

    from apscheduler.triggers.date import DateTrigger
    from padel_app.services.lesson_service import primary_coach

    # PAD-478: the spacing is the PRIMARY coach's, like every other reminder setting of the
    # class. This used to read the occurrence's own coach rows only (unordered), so a class
    # coached through its lesson never got a follow-up armed.
    coach = primary_coach(instance)
    if coach is None:
        return

    config = _saved_config(coach.id)
    hours = config.get_hours_between_reminders()
    next_dt = utcnow_naive() + timedelta(hours=hours)

    # Never fire at/after the class start.
    # PAD-256: the class time is wall-clock, so compare instants.
    if instance.start_datetime is not None and next_dt >= wall_to_utc_naive(instance.start_datetime):
        return

    retry_id = f"{base_job_id}_retry_{int(next_dt.timestamp())}"
    _scheduler.add_job(
        func=func,
        args=args,
        trigger=DateTrigger(run_date=next_dt, timezone="UTC"),
        id=retry_id,
        replace_existing=True,
        misfire_grace_time=300,
    )
    if _app is not None:
        _app.logger.info(
            "reminder re-armed: %s to fire at %s (hours_between=%s)",
            retry_id, next_dt, hours,
        )


def _run_reminder_for_lesson_occurrence(lesson_id: int, date_str: str) -> None:
    """Materialize a lesson occurrence (if needed) and send reminders.

    This is the primary reminder runner — works directly from the Lesson
    template without requiring a LessonInstance to exist beforehand.
    """
    app = _app
    if app is None:
        return
    with app.app_context():
        from datetime import date as _date
        from padel_app.models import Lesson
        from padel_app.services.lesson_service import get_or_materialize_instance
        from padel_app.services.notification_service import send_class_reminders
        try:
            app.logger.info(
                "reminder_for_lesson_occurrence: lesson=%s date=%s — starting",
                lesson_id, date_str,
            )
            lesson = Lesson.query.get(lesson_id)
            if not lesson:
                app.logger.warning(
                    "reminder_for_lesson_occurrence: lesson %s not found — skipping",
                    lesson_id,
                )
                return
            date = _date.fromisoformat(date_str)
            if date in lesson.excluded_date_set():
                # PAD-275 rule 7: the date was removed from the series after
                # this job was armed; nothing to materialise or remind.
                app.logger.info(
                    "reminder_for_lesson_occurrence: lesson=%s date=%s is excluded — skipping",
                    lesson_id, date_str,
                )
                return
            # PAD-407: this job's own pass asks the whole roster a moment from now, so the
            # roster enrolments of the materialisation must not each arm an ask pass of
            # their own (PAD-331) — those passes raced this one and double-sent.
            with _asks_suppressed():
                instance = get_or_materialize_instance(lesson, date)
            if instance.status in ("canceled", "completed"):
                app.logger.info(
                    "reminder_for_lesson_occurrence: instance %s status=%s — skipping",
                    instance.id, instance.status,
                )
                return
            result = send_class_reminders(instance.id, scheduled=True)
            _maybe_rearm_reminder(
                instance,
                func=_run_reminder_for_lesson_occurrence,
                args=[lesson_id, date_str],
                base_job_id=f"reminder_lesson_{lesson_id}_{date_str}",
                result=result,
            )
            app.logger.info(
                "reminder_for_lesson_occurrence: lesson=%s date=%s instance=%s — done",
                lesson_id, date_str, instance.id,
            )
        except Exception as exc:
            app.logger.error(
                "reminder_for_lesson_occurrence(%s, %s) failed: %s",
                lesson_id, date_str, exc,
            )


def _run_invite_start_for_lesson_occurrence(lesson_id: int, date_str: str) -> None:
    """PAD-540 / B-301 (notifications.invitations rule 1c): the invitation window of an occurrence
    that is not materialised yet has opened. Materialise it and start its never-filled places.

    The reminder job used to be the only thing that materialised an occurrence, so a window that
    opened before the reminder (or with reminders off) found no instance, and the instance-level
    ``invite_start_<id>`` job, derived at materialisation, was already in the past and armed
    nothing. Materialising here arms the instance's jobs (``_maybe_schedule_instance``) and removes
    this occurrence's lesson-level pair, so the two start jobs never both fire.
    ``trigger_invitations`` keeps every gate: the engine switch, automatic invitations per class,
    semi-automatic approval, the restrictions and the start-once claim.
    """
    app = _app
    if app is None:
        return
    with app.app_context():
        from datetime import date as _date
        from padel_app.models import Lesson
        from padel_app.services.lesson_service import get_or_materialize_instance, primary_coach
        from padel_app.services.notification_service import trigger_invitations
        try:
            lesson = Lesson.query.get(lesson_id)
            if not lesson:
                return
            date = _date.fromisoformat(date_str)
            if date in lesson.excluded_date_set():
                return
            # The roster enrolments of this materialisation arm no ask of their own
            # (`arm_ask_for_student`, PAD-331): with the reminder still ahead they would arm
            # nothing anyway, and with reminders off they would ask every roster student the
            # instant the window opened. This job is about the never-filled places only; the
            # roster is asked by the reminder, as before.
            with _asks_suppressed():
                instance = get_or_materialize_instance(lesson, date)
            if instance.status in ("canceled", "completed"):
                return
            coach = primary_coach(instance)
            if coach is None:
                return
            trigger_invitations(instance, coach.id)
            app.logger.info(
                "invite_start_for_lesson_occurrence: lesson=%s date=%s instance=%s — done",
                lesson_id, date_str, instance.id,
            )
        except Exception as exc:
            app.logger.error(
                "invite_start_for_lesson_occurrence(%s, %s) failed: %s", lesson_id, date_str, exc,
            )


#: PAD-540 (invitations rule 1c): the two per-occurrence job families of a lesson that is not
#: materialised yet, by id prefix, with the runner each fires. Every routine that cancels, moves
#: or prunes "the occurrence jobs" of a lesson walks this table, so the pair stays a pair.
_OCCURRENCE_JOB_FAMILIES = (
    ("reminder_lesson_", _run_reminder_for_lesson_occurrence),
    ("invite_start_lesson_", _run_invite_start_for_lesson_occurrence),
)


def _occurrence_job_ids(lesson_id: int, date_str: str) -> list[str]:
    return [f"{prefix}{lesson_id}_{date_str}" for prefix, _ in _OCCURRENCE_JOB_FAMILIES]


_ASKS_SUPPRESSED = contextvars.ContextVar("levapp_asks_suppressed", default=False)


@contextmanager
def _asks_suppressed():
    """PAD-407: inside this block `arm_ask_for_student` arms nothing. Used only where a
    reminder pass for the same occurrence runs right after (the occurrence job)."""
    token = _ASKS_SUPPRESSED.set(True)
    try:
        yield
    finally:
        _ASKS_SUPPRESSED.reset(token)


def arm_ask_for_student(instance, player_id, *, now=None) -> bool:
    """Make sure a late arrival is actually asked whether they are coming.

    PAD-331 / PAD-318. The reminder chain is spent once a pass reports no more
    due, so a student who joins afterwards is never asked by anything. This arms
    one pass at the moment the service says is permitted — now, or the end of
    quiet hours — and returns whether it armed one.

    It schedules a PASS rather than a bespoke message: `send_class_reminders`
    already skips everyone who has answered or had their reminders, so the pass
    reaches exactly the people who still owe an answer and nobody else. One
    job id per (instance, student, instant) keeps a repeated add idempotent.
    """
    if _scheduler is None or _ASKS_SUPPRESSED.get():
        return False
    from apscheduler.triggers.date import DateTrigger
    from padel_app.services.notification_service import next_ask_time

    when = next_ask_time(instance, player_id, now=now)
    if when is None:
        return False

    _scheduler.add_job(
        func=_run_send_reminders,
        args=[instance.id],
        trigger=DateTrigger(run_date=when, timezone="UTC"),
        id=f"ask_{instance.id}_{player_id}_{int(when.timestamp())}",
        replace_existing=True,
        misfire_grace_time=300,
    )
    return True


def run_reminder_pass(instance_id: int) -> dict:
    """One ordinary scheduled reminder pass for a materialised class, and the follow-up it
    owes: what a reminder job does when it fires. Returns the pass's result. The caller
    holds an app context. PAD-478's "send now" runs this, so a confirmed past-due reminder
    is the same pass, with the same guards, as one the scheduler fired."""
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import send_class_reminders

    result = send_class_reminders(instance_id, scheduled=True)
    instance = LessonInstance.query.get(instance_id)
    if instance is not None:
        _maybe_rearm_reminder(
            instance,
            func=_run_send_reminders,
            args=[instance_id],
            base_job_id=f"reminder_{instance_id}",
            result=result,
        )
    return result


def _run_send_reminders(instance_id: int) -> None:
    """Legacy runner for already-materialized LessonInstance reminders."""
    app = _app
    if app is None:
        return
    with app.app_context():
        try:
            # admin.engine-health rule 3 (PAD-534): a pass that finds its class already started
            # sends nothing (as before) and says so in the incident log.
            from padel_app.models import LessonInstance
            from padel_app.services.notification_service import _instance_is_over

            instance = LessonInstance.query.get(instance_id)
            if instance is not None and _instance_is_over(instance):
                from padel_app.services import delivery_incidents
                delivery_incidents.record("reminder_skipped_past_due", "scheduler",
                                          subject_type="lesson_instance", subject_id=instance_id,
                                          detail="the class had started when the pass ran")
                return
            run_reminder_pass(instance_id)
            app.logger.info("Reminder sent for instance %s", instance_id)
        except Exception as exc:
            app.logger.error("send_class_reminders(%s) failed: %s", instance_id, exc)


PAST_DUE_GRACE_SECONDS = 6 * 3600


def past_due_job_id(instance_id: int) -> str:
    return f"pastdue_{instance_id}"


def arm_past_due_pass(instance_id: int, when: datetime) -> None:
    """PAD-478 (notifications.config rule 10f): the coach said yes inside quiet hours, so the
    pass is armed for their end. One job per class: a repeated yes replaces it. Its own id,
    not the class's ``reminder_<id>``: that one is derived from the configuration, and a
    startup or daily pass would remove a job sitting at a time the configuration does not
    imply. ``schedule_instance_jobs`` removes this job when it arms the ordinary reminder again."""
    if _scheduler is None:
        return
    from apscheduler.triggers.date import DateTrigger

    _scheduler.add_job(
        func=_run_send_reminders,
        args=[instance_id],
        trigger=DateTrigger(run_date=when, timezone="UTC"),
        id=past_due_job_id(instance_id),
        replace_existing=True,
        # The coach said yes. If the scheduler is down when quiet hours end, the ordinary
        # 5 minutes of grace would drop that silently; this one may run up to six hours
        # late. The pass still refuses a class that has started.
        misfire_grace_time=PAST_DUE_GRACE_SECONDS,
    )


def _run_trigger_invitations(instance_id: int, coach_id: int) -> None:
    app = _app
    if app is None:
        return
    with app.app_context():
        from padel_app.models import LessonInstance
        from padel_app.services.notification_service import trigger_invitations
        try:
            instance = LessonInstance.query.get(instance_id)
            if instance:
                trigger_invitations(instance, coach_id)
        except Exception as exc:
            app.logger.error("trigger_invitations(%s) failed: %s", instance_id, exc)


def _run_process_batches() -> None:
    app = _app
    if app is None:
        return
    with app.app_context():
        from padel_app.services.notification_service import process_invitation_batches
        try:
            process_invitation_batches()
        except Exception as exc:
            app.logger.error("process_invitation_batches failed: %s", exc)


def _missed_reminder_subject(job_id: str):
    """``(subject_type, subject_id)`` for a missed reminder-family job, or None for any other."""
    if job_id.startswith("reminder_lesson_"):
        lesson_part = job_id[len("reminder_lesson_"):].rpartition("_")[0]
        return ("lesson", int(lesson_part)) if lesson_part.isdigit() else ("lesson", None)
    for prefix in ("pastdue_", "reminder_"):
        if job_id.startswith(prefix):
            rest = job_id[len(prefix):].split("_", 1)[0]
            return ("lesson_instance", int(rest)) if rest.isdigit() else ("lesson_instance", None)
    return None


def _on_job_missed(event) -> None:
    """admin.engine-health rule 3 (PAD-534): APScheduler dropped a reminder-family job past its
    grace time (the process was down). Recorded; never raises into the scheduler."""
    try:
        subject = _missed_reminder_subject(getattr(event, "job_id", "") or "")
        if subject is None or _app is None:
            return
        with _app_ctx():
            from padel_app.services import delivery_incidents
            delivery_incidents.record("reminder_skipped_past_due", "scheduler",
                                      subject_type=subject[0], subject_id=subject[1],
                                      detail=f"missed job {event.job_id}")
    except Exception:  # noqa: BLE001
        pass


def _run_prune_delivery_incidents() -> None:
    app = _app
    if app is None:
        return
    with app.app_context():
        try:
            from padel_app.services import delivery_incidents
            delivery_incidents.prune()
        except Exception as exc:  # noqa: BLE001
            app.logger.error("prune_delivery_incidents failed: %s", exc)


def _run_extend_schedule_window() -> None:
    """Extend the rolling 60-day reminder horizon for all coaches.

    Runs daily so that lesson occurrences entering the 60-day window are always
    covered, even for long-running recurring series.

    This doubles as the safety net for scheduling gaps: it re-derives jobs for
    every active lesson of every coach, so a lesson that somehow ends up with no
    reminder jobs (PAD-121: a "this and all future" edit split a series into a
    new Lesson without scheduling it) recovers on the next pass. It ran weekly
    until PAD-121, which meant such a gap could silence a class for up to 7 days
    before self-healing. Re-scheduling is idempotent — job ids are deterministic
    and added with ``replace_existing=True``, and reminders already in the past
    are skipped rather than re-fired.
    """
    app = _app
    if app is None:
        return
    with app.app_context():
        try:
            from padel_app.models import Coach
            total = 0
            # PAD-478: per coach, so one failure does not end the pass for everyone after.
            for coach_id in [coach.id for coach in Coach.query.all()]:
                try:
                    total += _schedule_lesson_occurrences_for_coach(coach_id)
                except Exception as exc:  # noqa: BLE001 — logged; tomorrow's pass derives again
                    app.logger.error("extend_schedule_window failed for coach %s: %s", coach_id, exc)
            app.logger.info(
                "extend_schedule_window: scheduled %d lesson occurrence reminder jobs",
                total,
            )
        except Exception as exc:
            app.logger.error("extend_schedule_window failed: %s", exc)



# ---------------------------------------------------------------------------
# Scheduler initialisation
# ---------------------------------------------------------------------------

def init_scheduler(app, test_config=None) -> None:
    """Create and start the APScheduler BackgroundScheduler.

    Skipped in these contexts:
    - Tests:             ``test_config`` is not None
    - Flask CLI:         ``flask db upgrade``, ``flask shell``, etc., whether run as
                         the ``flask`` script or ``python -m flask`` (PAD-264)
    - Werkzeug watcher:  outer watcher process (``WERKZEUG_RUN_MAIN`` set but ≠ "true")
    """
    global _app, _scheduler

    # Skip during pytest / test runs
    if test_config is not None:
        return

    # Skip every Flask CLI process except `flask run` (PAD-264, audit H12;
    # notifications.reminders rule 16). The production entrypoint runs
    # `python -m flask --app app.py db upgrade`, and under `python -m`
    # sys.argv[0] is ".../flask/__main__.py". The old basename check
    # ("flask"/"flask.exe") missed that, so APScheduler started inside every
    # deploy's migration. Options are skipped when looking for the command, so
    # `flask --app app.py run` is recognised as `run` (the old argv[1] check
    # read "--app" and skipped it).
    from padel_app.config import is_migration_invocation

    argv = sys.argv or [""]
    if is_migration_invocation(argv):
        return
    argv0 = argv[0].replace("\\", "/")
    is_flask_cli = (
        os.path.basename(argv0) in ("flask", "flask.exe")
        or argv0.endswith("flask/__main__.py")
    )
    command_args = [a for a in argv[1:] if not a.startswith("-")]
    if is_flask_cli and "run" not in command_args:
        return

    # Werkzeug dev-reloader spawns two processes:
    #   outer watcher  → WERKZEUG_RUN_MAIN is set but not "true"  → skip
    #   inner worker   → WERKZEUG_RUN_MAIN == "true"              → proceed
    # Production / gunicorn → WERKZEUG_RUN_MAIN not set at all    → proceed
    werkzeug_run_main = os.environ.get("WERKZEUG_RUN_MAIN")
    if app.debug and werkzeug_run_main is not None and werkzeug_run_main != "true":
        return

    _app = app

    from apscheduler.events import EVENT_JOB_MISSED
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger

    test_mode = os.environ.get("TEST_MODE", "").lower() == "true"

    if test_mode:
        # Tests drop/recreate the DB on every run. SQLAlchemyJobStore would hold
        # stale connections to the old apscheduler_jobs table and silently fail.
        # Use MemoryJobStore so the scheduler is fully isolated from DB lifecycle.
        from apscheduler.jobstores.memory import MemoryJobStore
        jobstores = {"default": MemoryJobStore()}
    else:
        from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
        db_url = app.config["SQLALCHEMY_DATABASE_URI"]
        jobstores = {
            "default": SQLAlchemyJobStore(
                url=db_url,
                engine_options={
                    "pool_pre_ping": True,   # survive DB restart
                    "pool_recycle": 300,     # proactively recycle idle connections
                    "pool_size": 2,          # scheduler needs few connections
                    "max_overflow": 1,
                },
            )
        }

    sched = BackgroundScheduler(jobstores=jobstores, timezone="UTC")

    # TEST_MODE shortens the batch interval for E2E verification
    batch_seconds = 30 if test_mode else 120

    sched.add_job(
        func=_run_process_batches,
        trigger=IntervalTrigger(seconds=batch_seconds),
        id="process_batches",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=60,
    )

    sched.add_job(
        func=_run_extend_schedule_window,
        trigger=IntervalTrigger(days=1),
        id="extend_schedule_window",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )

    # admin.engine-health (PAD-534): incidents are kept 30 days (R-010: fixed id).
    sched.add_job(
        func=_run_prune_delivery_incidents,
        trigger=IntervalTrigger(days=1),
        id="prune_delivery_incidents",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    sched.add_listener(_on_job_missed, EVENT_JOB_MISSED)

    sched.start()
    _scheduler = sched
    app.extensions["scheduler"] = sched

    # Graceful shutdown when the process exits
    atexit.register(lambda: sched.shutdown(wait=False))

    # Re-schedule all future jobs in case the server restarted and jobs were lost
    _startup_reschedule(app)


def _startup_reschedule(app) -> None:
    """Idempotently re-schedule all future reminder/invite jobs at startup.

    In production we swallow errors (e.g. transient DB issues during deploy)
    so the server can keep serving requests. In TEST_MODE we re-raise so test
    failures point at the real cause instead of bubbling up later as
    "class not found on calendar".
    """
    test_mode = os.environ.get("TEST_MODE", "").lower() == "true"
    try:
        with app.app_context():
            from padel_app.models import Coach
            instance_total = 0
            lesson_total = 0
            # PAD-478: one coach's failure (a derivation lock that timed out, a broken row)
            # must not cost the coaches after it their re-arm.
            for coach_id in [coach.id for coach in Coach.query.all()]:
                try:
                    instance_total += _reschedule_for_coach(coach_id)
                    lesson_total += _schedule_lesson_occurrences_for_coach(coach_id)
                except Exception as exc:  # noqa: BLE001 — logged; the daily pass derives again
                    app.logger.warning(
                        "APScheduler startup rescheduling failed for coach %s: %s", coach_id, exc,
                    )
                    if test_mode:
                        raise
            app.logger.info(
                "APScheduler started — rescheduled %d instance jobs + %d lesson occurrence jobs across all coaches.",
                instance_total,
                lesson_total,
            )
    except Exception as exc:
        app.logger.warning("APScheduler startup rescheduling failed: %s", exc)
        if test_mode:
            raise


def ensure_scheduler_ready() -> None:
    """Raise if the scheduler did not initialise successfully.

    Exposed so endpoints (and tests) can fail loudly instead of letting
    a silently-broken scheduler leak into downstream errors.
    """
    if _scheduler is None:
        raise RuntimeError("APScheduler is not initialised — init_scheduler() did not run")
    if not _scheduler.running:
        raise RuntimeError("APScheduler is initialised but not running")


def _reschedule_for_coach(coach_id: int) -> int:
    """Schedule/replace jobs for all future non-cancelled instances of a coach.

    Returns the number of instances processed.
    """
    if _scheduler is None or _app is None:
        return 0

    with _app_ctx():
        from padel_app.models import Association_CoachLessonInstance, LessonInstance

        now = club_now_naive()  # PAD-256: class times are wall-clock (R-023)
        instances = (
            LessonInstance.query
            .join(
                Association_CoachLessonInstance,
                LessonInstance.id == Association_CoachLessonInstance.lesson_instance_id,
            )
            .filter(
                Association_CoachLessonInstance.coach_id == coach_id,
                LessonInstance.start_datetime > now,
                LessonInstance.status != "canceled",
            )
            .all()
        )

        for instance in instances:
            schedule_instance_jobs(instance.id, coach_id)

        return len(instances)


def _schedule_lesson_occurrences_for_coach(coach_id: int) -> int:
    """Schedule lesson-level reminder jobs for all active lessons of a coach.

    Returns the total number of jobs scheduled.
    """
    if _scheduler is None or _app is None:
        return 0

    with _app_ctx():
        from padel_app.models import Association_CoachLesson, Lesson

        lessons = (
            Lesson.query
            .join(Association_CoachLesson, Lesson.id == Association_CoachLesson.lesson_id)
            .filter(
                Association_CoachLesson.coach_id == coach_id,
                Lesson.status == "active",
            )
            .all()
        )

        total = 0
        for lesson in lessons:
            total += schedule_lesson_reminder_jobs(lesson.id, coach_id)
        return total


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def schedule_lesson_reminder_jobs(
    lesson_id: int,
    coach_id: int,
    *,
    horizon_days: int = 60,
    now: datetime | None = None,
) -> int:
    """Schedule DateTrigger reminder jobs for all upcoming occurrences of a lesson
    within the next ``horizon_days``.

    Works for both recurring and non-recurring lessons.  When the job fires it
    materializes the LessonInstance (if not already done) and sends reminders.

    Returns the number of jobs scheduled.
    """
    if _scheduler is None or _app is None:
        return 0

    with _app_ctx():
        from padel_app.models import Lesson

        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            return 0

        # PAD-478: an occurrence that is not materialised yet is reminded under the LESSON's
        # primary coach (the first coach assigned to it), whoever triggered this walk.
        coach_id = _lesson_primary_coach_id(lesson_id) or coach_id
        cutoff = now or utcnow_naive()
        # PAD-256: occurrences are wall-clock like the lesson's start, so the
        # expansion window is too. ``cutoff`` stays the UTC instant the fire
        # times are compared with below.
        wall_cutoff = utc_to_wall_naive(cutoff)
        horizon = wall_cutoff + timedelta(days=horizon_days)

        # PAD-275 (classes.recurrence rule 7): the lesson expands itself, so an
        # excluded date never gets a job.
        occurrences = lesson.occurrences_between(wall_cutoff, horizon)

        # PAD-347 (notifications.reminders rule 20, B-097): a date that already
        # has a LessonInstance belongs to the instance job, never to an
        # occurrence job. Keyed the way get_or_materialize_instance looks an
        # instance up — original_lesson_occurence_date, falling back to the
        # start date for legacy rows where the column is unset.
        from padel_app.models import LessonInstance

        materialised = {}
        for inst in LessonInstance.query.filter_by(lesson_id=lesson.id).all():
            key = inst.original_lesson_occurence_date or (
                inst.start_datetime.date() if inst.start_datetime else None
            )
            if key is not None:
                materialised[key] = inst

        scheduled = 0
        # Materialised dates belong to their instance job, which is derived from the
        # INSTANCE's primary coach under that coach's lock. They are handled after this
        # lesson's lock is released, so two coaches' locks are never held at once.
        materialised_instances = []
        with _derivation_lock(coach_id):
            config = _saved_config(coach_id)
            for occ_dt in occurrences:
                # expand_occurrences labels the wall-clock occurrence as UTC; drop the label.
                occ_dt_naive = occ_dt.replace(tzinfo=None) if occ_dt.tzinfo else occ_dt
                reminder_dt = _fire_time_utc(occ_dt_naive, config.get_reminder_timing())
                date_str = occ_dt_naive.date().isoformat()
                job_id = f"reminder_lesson_{lesson_id}_{date_str}"

                instance = materialised.get(occ_dt_naive.date())
                if instance is not None:
                    if instance.status in ("canceled", "completed"):
                        # Nothing to remind about; make sure no stale occurrence
                        # job from before the cancellation can fire either.
                        cancel_lesson_occurrence_job(lesson_id, date_str)
                        continue
                    # The instance job is the truth (its start_datetime survives a
                    # single-occurrence edit); arming it also removes the
                    # occurrence job for this date.
                    materialised_instances.append(instance.id)
                    scheduled += 1
                    continue

                # PAD-478 (B-249): past, or no timing at all, arms nothing AND removes a job
                # left over from another timing (it used to stay, and fire).
                outcome = _reconcile_date_job(
                    job_id, reminder_dt, cutoff,
                    func=_run_reminder_for_lesson_occurrence, args=[lesson_id, date_str],
                )
                # PAD-540 (invitations rule 1c): the occurrence's never-filled places start from
                # the coach's invitation-start instant, whether or not a reminder comes first.
                # Not counted in the return value, which has always been the reminder jobs.
                _reconcile_date_job(
                    f"invite_start_lesson_{lesson_id}_{date_str}",
                    _fire_time_utc(occ_dt_naive, config.get_invitation_start_timing()), cutoff,
                    func=_run_invite_start_for_lesson_occurrence, args=[lesson_id, date_str],
                )
                if outcome == "armed":
                    _app.logger.info(
                        "schedule_lesson_reminder_jobs: scheduled %s to fire at %s",
                        job_id, reminder_dt,
                    )
                    scheduled += 1
                elif reminder_dt:
                    _app.logger.warning(
                        "schedule_lesson_reminder_jobs: reminder for lesson %s on %s is in the past (%s) — skipping",
                        lesson_id, date_str, reminder_dt,
                    )

        for instance_id in materialised_instances:
            schedule_instance_jobs(instance_id, coach_id, now=cutoff)

        return scheduled


def cancel_lesson_reminder_jobs(lesson_id: int, from_date=None) -> None:
    """Remove all lesson-level reminder jobs for a lesson.

    If ``from_date`` (a ``datetime.date``) is given, only removes jobs for
    occurrences on or after that date.  Used when a recurrence is truncated.
    """
    if _scheduler is None:
        return

    prefixes = [f"{family}{lesson_id}_" for family, _ in _OCCURRENCE_JOB_FAMILIES]
    for job in list(_scheduler.get_jobs()):
        prefix = next((p for p in prefixes if job.id.startswith(p)), None)
        if prefix is None:
            continue
        if from_date is not None:
            try:
                from datetime import date as _date
                job_date = _date.fromisoformat(job.id[len(prefix):])
                if job_date < from_date:
                    continue
            except ValueError:
                pass
        try:
            job.remove()
        except Exception:
            pass


def cancel_lesson_occurrence_job(lesson_id: int, date_str: str) -> None:
    """Remove the occurrence jobs (reminder and, PAD-540, invitation start) of a single lesson
    occurrence. Materialising calls this, so the instance's jobs are the occurrence's only ones."""
    if _scheduler is None:
        return
    for job_id in _occurrence_job_ids(lesson_id, date_str):
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass


def move_lesson_reminder_jobs(old_lesson_id: int, new_lesson_id: int, from_date=None) -> int:
    """Re-key the reminder jobs of a series' occurrences from one lesson id to
    another (PAD-275, classes.recurrence rule 6): a fork takes its occurrences'
    jobs with it, same fire time, same misfire grace, instead of the caller
    rebuilding them from scratch. ``from_date`` limits the move to occurrences
    on or after that date. Returns the number of jobs moved."""
    if _scheduler is None:
        return 0
    from datetime import date as _date

    families = {f"{family}{old_lesson_id}_": (family, runner) for family, runner in _OCCURRENCE_JOB_FAMILIES}
    moved = 0
    for job in list(_scheduler.get_jobs()):
        prefix = next((p for p in families if job.id.startswith(p)), None)
        if prefix is None:
            continue
        family, runner = families[prefix]
        date_str = job.id[len(prefix):]
        if from_date is not None:
            try:
                if _date.fromisoformat(date_str) < from_date:
                    continue
            except ValueError:
                continue
        # A job on a scheduler that has not started yet is still "pending" and
        # has no next_run_time attribute at all; the DateTrigger keeps the instant.
        run_date = getattr(job, "next_run_time", None) or getattr(job.trigger, "run_date", None)
        try:
            job.remove()
        except Exception:
            pass
        if run_date is None:
            continue
        from apscheduler.triggers.date import DateTrigger

        _scheduler.add_job(
            func=runner,
            args=[new_lesson_id, date_str],
            trigger=DateTrigger(run_date=run_date, timezone="UTC"),
            id=f"{family}{new_lesson_id}_{date_str}",
            replace_existing=True,
            misfire_grace_time=job.misfire_grace_time or 300,
        )
        moved += 1
    return moved


def prune_lesson_reminder_jobs(lesson_id: int, *, horizon_days: int = 60, now: datetime | None = None) -> int:
    """Remove reminder jobs for dates the series no longer produces (an
    excluded date, or a date outside a moved fork's own recurrence). Returns
    the number removed. Jobs beyond the horizon are left alone."""
    if _scheduler is None or _app is None:
        return 0
    from datetime import date as _date

    with _app_ctx():
        from padel_app.models import Lesson

        lesson = Lesson.query.get(lesson_id)
        if lesson is None:
            return 0
        cutoff = utc_to_wall_naive(now or utcnow_naive())
        produced = {
            occ.date() for occ in lesson.occurrences_between(cutoff - timedelta(days=1), cutoff + timedelta(days=horizon_days))
        }
    prefixes = [f"{family}{lesson_id}_" for family, _ in _OCCURRENCE_JOB_FAMILIES]
    removed = 0
    for job in list(_scheduler.get_jobs()):
        prefix = next((p for p in prefixes if job.id.startswith(p)), None)
        if prefix is None:
            continue
        try:
            job_date = _date.fromisoformat(job.id[len(prefix):])
        except ValueError:
            continue
        if job_date in produced:
            continue
        try:
            job.remove()
            removed += 1
        except Exception:
            pass
    return removed


def schedule_instance_jobs(instance_id: int, coach_id: int, *, now: datetime | None = None) -> None:
    """Make the reminder + invitation-start jobs of a materialized instance the ones the
    coach's saved configuration implies (``_reconcile_date_job``, PAD-478).

    A fire time in the past arms nothing, and a job left over from another timing is
    removed. Pass ``now`` in tests to control the "future" boundary.
    """
    if _scheduler is None or _app is None:
        return

    with _app_ctx():
        from padel_app.models import LessonInstance

        instance = LessonInstance.query.get(instance_id)
        if not instance:
            return

        # PAD-478: ONE configuration decides a class's jobs, the one the send path honours:
        # its primary coach's. `coach_id` only says who triggered the derivation (a co-coach
        # through the startup loop or their own settings save, the lesson's coach through
        # the occurrence walk when the occurrence has a substitute). Deriving from the
        # caller removed the primary coach's job whenever the caller's time was past.
        from padel_app.services.lesson_service import primary_coach

        primary = primary_coach(instance)
        if primary is not None:
            coach_id = primary.id
        cutoff = now or utcnow_naive()

        with _derivation_lock(coach_id):
            config = _saved_config(coach_id)

            reminder_dt = _fire_time_utc(instance.start_datetime, config.get_reminder_timing())
            outcome = _reconcile_date_job(
                f"reminder_{instance_id}", reminder_dt, cutoff,
                func=_run_send_reminders, args=[instance_id],
            )
            if reminder_dt and outcome != "armed":
                _app.logger.warning(
                    "schedule_instance_jobs: reminder for instance %s is in the past (%s) — skipping",
                    instance_id, reminder_dt,
                )
            if outcome == "armed":
                # PAD-478 (rule 10f): the ordinary reminder is ahead again, so a pass the
                # coach had armed for the end of quiet hours would be a second, early one.
                try:
                    _scheduler.remove_job(past_due_job_id(instance_id))
                except Exception:  # noqa: BLE001 — there was none
                    pass

            # PAD-347 (notifications.reminders rule 20, B-097): once the instance
            # exists, its reminder job is the occurrence's ONLY reminder job. The
            # template-level reminder_lesson_<lesson>_<date> job fired at the same
            # instant and ran send_class_reminders a second time — two reminders in
            # one minute for any coach with reminder_count >= 2. Removed even when
            # the instance job was skipped as past, so a stale occurrence job cannot
            # fire later against a class whose own reminder time has gone.
            occ_date = instance.original_lesson_occurence_date or (
                instance.start_datetime.date() if instance.start_datetime else None
            )
            if occ_date is not None:
                cancel_lesson_occurrence_job(instance.lesson_id, occ_date.isoformat())

            # The invitation job carries the primary coach: `trigger_invitations` reads its
            # whole configuration (mode, groups, eligibility, auto-notify) from that id.
            invite_dt = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
            _reconcile_date_job(
                f"invite_start_{instance_id}", invite_dt, cutoff,
                func=_run_trigger_invitations, args=[instance_id, coach_id],
            )


def cancel_instance_jobs(instance_id: int) -> None:
    """Remove scheduled reminder + invitation-start jobs for an instance."""
    if _scheduler is None:
        return

    for job_id in (f"reminder_{instance_id}", f"invite_start_{instance_id}"):
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass  # job may not exist — that's fine


def _retry_job_instance(job_id: str):
    """The LessonInstance a follow-up job (``<base>_retry_<ts>``) belongs to, or None."""
    from datetime import date as _date

    from padel_app.models import LessonInstance

    base = job_id.rsplit("_retry_", 1)[0]
    if base.startswith("reminder_lesson_"):
        lesson_part, _, date_str = base[len("reminder_lesson_"):].rpartition("_")
        try:
            lesson_id, occ_date = int(lesson_part), _date.fromisoformat(date_str)
        except ValueError:
            return None
        for inst in LessonInstance.query.filter_by(lesson_id=lesson_id).all():
            key = inst.original_lesson_occurence_date or (
                inst.start_datetime.date() if inst.start_datetime else None
            )
            if key == occ_date:
                return inst
        return None
    if base.startswith("reminder_"):
        try:
            return LessonInstance.query.get(int(base[len("reminder_"):]))
        except ValueError:
            return None
    return None


def _retime_pending_followups(coach_id: int, config) -> None:
    """Move each pending follow-up of the coach's classes to where the SAVED spacing and
    count put it (PAD-478, B-250; ``notifications.config`` rule 10b).

    A follow-up job is armed ``hoursBetweenReminders`` after the pass that sent a reminder.
    Left at the old spacing after the spacing was raised, it fired inside the new window:
    the scheduled pass (PAD-407's guard) sent nothing and re-armed nothing, and the
    follow-up was lost. The anchor is the newest reminder SENT to any student who is still
    owed one, read from ``reminder_attempts``, never the job's own time. Only a settings
    change calls this; the startup and daily passes have no old spacing and touch nothing.
    """
    from apscheduler.jobstores.base import JobLookupError
    from apscheduler.triggers.date import DateTrigger

    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.lesson_service import primary_coach

    hours = config.get_hours_between_reminders()
    reminder_count = config.get_reminder_count()
    now = utcnow_naive()
    seen_instances: set[int] = set()

    for job in list(_scheduler.get_jobs()):
        if "_retry_" not in job.id or not job.id.startswith("reminder_"):
            continue
        instance = _retry_job_instance(job.id)
        if instance is None:
            continue
        coach = primary_coach(instance)
        if coach is None or coach.id != coach_id:
            continue

        # Follow-ups are one job per CLASS. Who is still owed a reminder, and the newest
        # reminder sent to any of them: at that instant plus the spacing every one of them
        # is outside the spacing window, so the pass skips nobody. (A student reminded
        # earlier than the newest waits longer than the spacing: the per-class limit.)
        owed = False
        anchor = None
        if instance.status not in ("canceled", "completed") and instance.id not in seen_instances:
            for presence in list(instance.presences):
                if presence.confirmed:
                    continue
                sent = attempts.count_attempts(instance.id, presence.player_id)
                if sent >= reminder_count:
                    continue
                owed = True
                last = attempts.latest_counted_attempt(instance.id, presence.player_id) if sent else None
                if last is not None and last.sent_at is not None:
                    anchor = last.sent_at if anchor is None else max(anchor, last.sent_at)

        if owed and anchor is None:
            # Owed only by students who have had no reminder yet (added after the first pass,
            # or blocked during it): there is no sent reminder to count the spacing from, and
            # this job is what will reach them. It stays where it is.
            seen_instances.add(instance.id)
            continue

        next_dt = None
        if anchor is not None:
            # Never earlier than now; never at or after the class start (the re-arm's rule).
            next_dt = max(anchor + timedelta(hours=hours), now + timedelta(minutes=1))
            if instance.start_datetime is None or next_dt >= wall_to_utc_naive(instance.start_datetime):
                next_dt = None

        try:
            if next_dt is None:
                # Nothing owed, no room before the class, or a twin of a job already re-timed.
                _scheduler.remove_job(job.id)
                _app.logger.info("retime: removed follow-up %s (none owed or no room)", job.id)
                continue
            _scheduler.reschedule_job(job.id, trigger=DateTrigger(run_date=next_dt, timezone="UTC"))
        except JobLookupError:
            # It fired (or was removed) between the listing and this line: the follow-up did
            # its job. Not a failed reschedule.
            continue
        seen_instances.add(instance.id)
        _app.logger.info("retime: follow-up %s moved to %s (hours_between=%s)", job.id, next_dt, hours)


def reschedule_all_future_jobs(coach_id: int) -> None:
    """Make every future job of a coach the one the SAVED configuration implies.

    Called when the coach updates reminder / invitation-start timing in settings. Each
    class is derived under its primary coach's lock, from the configuration read inside
    that lock (``_derivation_lock``, ``_saved_config``), so the result depends on what is
    saved and not on which request got here last (PAD-478, ``notifications.config`` rules
    10a and 10e). Exceptions propagate: the caller reports them (rule 10c).
    """
    if _scheduler is None or _app is None:
        return

    with _app_ctx():
        from padel_app.models import Association_CoachLessonInstance, LessonInstance

        now = club_now_naive()  # PAD-256: class times are wall-clock (R-023)
        instances = (
            LessonInstance.query
            .join(
                Association_CoachLessonInstance,
                LessonInstance.id == Association_CoachLessonInstance.lesson_instance_id,
            )
            .filter(
                Association_CoachLessonInstance.coach_id == coach_id,
                LessonInstance.start_datetime > now,
                LessonInstance.status != "canceled",
            )
            .all()
        )

        for instance in instances:
            schedule_instance_jobs(instance.id, coach_id)

        # Re-schedule lesson-level occurrence jobs with updated timing
        _schedule_lesson_occurrences_for_coach(coach_id)

        # B-250: pending follow-ups move with the spacing and the count.
        with _derivation_lock(coach_id):
            _retime_pending_followups(coach_id, _saved_config(coach_id))


# ---------------------------------------------------------------------------
# Convenience hooks for lesson_service
# (safe no-ops when the scheduler is not running: tests, CLI, etc.)
# ---------------------------------------------------------------------------

def _maybe_schedule_instance(instance) -> None:
    """Schedule jobs for an instance if the scheduler is running.

    Resolves the coach through the one helper (PAD-275, classes.coach-assignment
    rule 4): the occurrence's own coach rows when it has any, else the lesson's.
    Logs failures instead of silently swallowing them.
    """
    try:
        # PAD-275 (classes.coach-assignment rule 4): the instance's own coach
        # when it has one, else the lesson's — never coach-less.
        from padel_app.services.lesson_service import primary_coach

        coach = primary_coach(instance)
        if coach is not None:
            schedule_instance_jobs(instance.id, coach.id)
        else:
            if _app:
                _app.logger.warning(
                    "_maybe_schedule_instance: instance %s has no coach — skipping",
                    getattr(instance, "id", "?"),
                )
    except Exception as exc:
        if _app:
            _app.logger.warning(
                "_maybe_schedule_instance(%s) failed: %s",
                getattr(instance, "id", "?"),
                exc,
            )


def _maybe_schedule_lesson(lesson_id: int, coach_id: int) -> None:
    """Derive a lesson's occurrence jobs after the lesson was created or edited.

    The class is already committed when this runs, so a failure here (PAD-478: the
    derivation lock can time out) must not turn a saved change into an error response. It
    is logged, and the daily window pass derives the jobs again (rule 10c).
    """
    try:
        schedule_lesson_reminder_jobs(lesson_id, coach_id)
    except Exception as exc:  # noqa: BLE001 — logged; the change itself is saved
        if _app:
            _app.logger.error(
                "_maybe_schedule_lesson(lesson=%s, coach=%s) failed: %s — the daily pass will derive its jobs",
                lesson_id, coach_id, exc,
            )


def _maybe_cancel_instance(instance_id: int) -> None:
    """Cancel jobs for an instance if the scheduler is running.

    Silently ignores all errors.
    """
    try:
        cancel_instance_jobs(instance_id)
    except Exception:
        pass
