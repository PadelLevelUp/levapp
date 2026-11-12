"""Which engine a session runs on (notifications.config rule 18, swap plan §7; PAD-917).

Each coach's ``NotificationConfig.engine_version`` is ``old`` until the coach is switched;
``engine_switched_at`` records when. **A session runs on the new engine exactly when it has an
``engine_sessions`` row** (``engine_for``); no row is the old engine. Nothing else is recomputed later,
so a session is never on both engines or on neither: every failure to adopt leaves it on the old
engine, which still runs it.

A class belongs to its primary coach (``lesson_service.primary_coach``, the coach the old engine runs it
on): the switch reads only that coach's ``engine_version`` (CONFIG-51).

The row is written once, here only:
- at the switch, for the coach's future occurrences that existed then, when the old engine had not
  started inviting for them and their invitation window had not opened (CONFIG-50, CONFIG-61). An old
  vacancy that never invited does not count as started; adoption closes it;
- by ``on_occurrence_created`` when the app creates an occurrence after the switch, whatever its window
  (CONFIG-63); a failure there is logged and leaves the occurrence on the old engine;
- by ``adopt_due``, which retries every post-switch occurrence still without a row (a failed hook, a
  creation path without the hook). The new engine's tick calls it (swap step 6).
An occurrence that existed at the switch and was not adopted then drains on the old engine for good.

The old engine skips a new-engine session where it would start one (``trigger_invitations``) or open
a vacancy for it (``notification_service._on_new_engine``); its other entry points move behind the
switch in swap step 6.
"""
from __future__ import annotations

import logging
from datetime import datetime

from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

log = logging.getLogger(__name__)


def engine_for(instance) -> str:
    """``new`` or ``old`` for one occurrence (rule 18): its ``engine_sessions`` row, nothing else."""
    from padel_app.models import EngineSession

    return "new" if db.session.get(EngineSession, instance.id) is not None else "old"


def _switched_config(instance):
    """The primary coach's config when that coach is on the new engine, else ``None``."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.lesson_service import primary_coach

    coach = primary_coach(instance)
    if coach is None:
        return None
    config = NotificationConfig.query.filter_by(coach_id=coach.id).first()
    if config is None or config.engine_version != "new" or config.engine_switched_at is None:
        return None
    return config


def _window_opens(instance, config) -> datetime:
    """When the session's invitation window opens, naive UTC: the coach's invitation start
    (``scheduler._fire_time_utc``), or the occurrence's creation for ``none``."""
    from padel_app.scheduler import _compute_invite_start_dt

    opens = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
    return opens if opens is not None else instance.created_at


def _started_vacancies(instance):
    """The old engine's vacancies that have invited or asked the coach (CONFIG-61): filled, any send
    (``last_activity_at``), or a semi-automatic approval asked or given. An open, never-sent vacancy (an
    absence before the window) is not a start."""
    from padel_app.models.vacancy import Vacancy

    return Vacancy.query.filter(
        Vacancy.lesson_instance_id == instance.id,
        (Vacancy.status == "filled") | Vacancy.last_activity_at.isnot(None)
        | Vacancy.approval_status.in_(("pending", "approved")),
    )


def _due_at_switch(instance, config) -> bool:
    """An occurrence that existed at the switch: adopted only when nothing had started inviting for it."""
    return (_started_vacancies(instance).first() is None
            and _window_opens(instance, config) >= config.engine_switched_at)


def _adopt(store, instance, coach_id: int, now: datetime) -> bool:
    """The session's ``engine_sessions`` row and its regulars, placed (``TableStore.add_session``), in one
    unit; the old engine's unstarted vacancies are closed in it. Returns whether it wrote the row."""
    from padel_app.models import EngineSession
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.level_ladder import ladder_index_map

    if Association_CoachLessonInstance.query.filter_by(lesson_instance_id=instance.id).first() is None:
        # add_session reads the coach from the occurrence's own coach row (PAD-916); without one it
        # stays on the old engine until the store reads the lesson's coach too.
        log.warning("engine_switch: occurrence %s has no coach row; left on the old engine", instance.id)
        return False
    roster = [p for p in Presence.query.filter_by(lesson_instance_id=instance.id).all()
              if p.enrolment_source == "roster"]
    students = store._students(coach_id, [], {}, extra=[p.player_id for p in roster])
    regulars = []
    for p in roster:
        student = students[str(p.player_id)]
        side = {"left": "L", "right": "R"}.get(p.assigned_side) or (
            next(iter(student.sides)) if len(student.sides) == 1 else None)
        regulars.append((student, side))
    session = str(instance.id)
    with store.unit((session,)):
        if store.has_session(session):                     # adopted meanwhile, under the same lock
            return False
        for vacancy in Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open").all():
            vacancy.status = "expired"                     # never invited (CONFIG-61): the old tick keeps off
        store.add_session(session, store._level(ladder_index_map(coach_id), instance.level_id),
                          instance.effective_max_players, instance.start_datetime, regulars, now)
        db.session.get(EngineSession, instance.id).coach_id = coach_id   # the primary coach (CONFIG-51)
    return True


def on_occurrence_created(instance, *, now: datetime | None = None) -> bool:
    """Rule 18 (CONFIG-63): the path that creates an occurrence assigns it. For a primary coach on
    ``new`` the session row is written now, inside the creator's unit of work when one is open. A
    failure is logged and leaves the occurrence on the old engine (``adopt_due`` retries it); creating
    the occurrence never fails on it. Returns whether it was adopted."""
    from padel_app.services.engine_store import TableStore
    from padel_app.tools.unit_of_work import active

    config = _switched_config(instance)
    if config is None or engine_for(instance) == "new":
        return False
    now = now or utcnow_naive()
    store = TableStore(clock=lambda: now)
    savepoint = db.session.begin_nested() if active() else None
    try:
        adopted = _adopt(store, instance, config.coach_id, now)
        if savepoint is not None:
            savepoint.commit()
        return adopted
    except Exception:
        if savepoint is not None:
            savepoint.rollback()
        log.exception("engine_switch: adopting occurrence %s failed; it stays on the old engine", instance.id)
        return False


def _future_occurrences(coach_id: int, now: datetime, *, created_since: datetime | None = None):
    """The coach's occurrences that have not started, are not cancelled and have no row, whose primary
    coach is ``coach_id``; with ``created_since``, only those created at or after it."""
    from padel_app.models import EngineSession
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import primary_coach

    own = db.session.query(Association_CoachLessonInstance.lesson_instance_id).filter(
        Association_CoachLessonInstance.coach_id == coach_id)
    via_lesson = db.session.query(Association_CoachLesson.lesson_id).filter(Association_CoachLesson.coach_id == coach_id)
    query = (LessonInstance.query
             .outerjoin(EngineSession, EngineSession.lesson_instance_id == LessonInstance.id)
             .filter(EngineSession.lesson_instance_id.is_(None),
                     LessonInstance.status != "canceled",
                     LessonInstance.start_datetime > utc_to_wall_naive(now),
                     LessonInstance.id.in_(own) | LessonInstance.lesson_id.in_(via_lesson)))
    if created_since is not None:
        query = query.filter(LessonInstance.created_at >= created_since)
    return [inst for inst in query.order_by(LessonInstance.start_datetime, LessonInstance.id).all()
            if getattr(primary_coach(inst), "id", None) == coach_id]


def _adopt_each(instances, coach_id: int, now: datetime) -> list[str]:
    """Adopt each in its own unit; one failure is logged and leaves that one on the old engine."""
    from padel_app.services.engine_store import TableStore

    store = TableStore(clock=lambda: now)
    adopted = []
    for instance in instances:
        try:
            if _adopt(store, instance, coach_id, now):
                adopted.append(str(instance.id))
        except Exception:
            db.session.rollback()
            log.exception("engine_switch: adopting occurrence %s failed; it stays on the old engine", instance.id)
    return adopted


def adopt_due(*, now: datetime | None = None, coach_ids=None) -> list[str]:
    """Adopt every switched coach's occurrence created since the switch that has no row yet (a failed or
    missing creation hook). Occurrences that existed at the switch are never re-evaluated. Returns the
    adopted session ids. Idempotent."""
    from padel_app.models.notification_config import NotificationConfig

    now = now or utcnow_naive()
    query = NotificationConfig.query.filter(NotificationConfig.engine_version == "new",
                                            NotificationConfig.engine_switched_at.isnot(None))
    if coach_ids is not None:
        query = query.filter(NotificationConfig.coach_id.in_(list(coach_ids) or [-1]))
    adopted = []
    for config in query.order_by(NotificationConfig.coach_id).all():
        due = _future_occurrences(config.coach_id, now, created_since=config.engine_switched_at)
        adopted += _adopt_each(due, config.coach_id, now)
    return adopted


def switch_coach(coach_id: int, *, now: datetime | None = None) -> list[str]:
    """Switch the coach to the new engine (rule 18): the switch is one way. The coach's occurrences that
    exist now are assigned once, here; any created since are left to ``adopt_due``. Switching an already
    switched coach adopts nothing more from before its switch. Returns the adopted session ids."""
    from padel_app.services.notification_service import get_or_create_config

    now = now or utcnow_naive()
    config = get_or_create_config(coach_id)
    if config.engine_version == "new":
        return adopt_due(now=now, coach_ids=[coach_id])
    config.engine_version, config.engine_switched_at = "new", now
    db.session.commit()
    existing = [inst for inst in _future_occurrences(coach_id, now)
                if inst.created_at is None or inst.created_at < now]
    return _adopt_each([inst for inst in existing if _due_at_switch(inst, config)], coach_id, now)
