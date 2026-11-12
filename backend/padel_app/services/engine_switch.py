"""Which engine a session runs on (notifications.config rule 18, swap plan §7; PAD-917).

Each coach's ``NotificationConfig.engine_version`` is ``old`` until the coach is switched;
``engine_switched_at`` records when. A session runs on the new engine once it has an
``engine_sessions`` row, and that row is written here only: at the switch, and later by ``adopt_due``
for occurrences the app materialises after it. A session is adopted when its coach is on ``new``, the
old engine has not started it (no vacancy), and its invitation window had not opened at the switch.
Adopted is for good; anything else drains on the old engine until it starts (CONFIG-50). A coach on
``old`` is never adopted (CONFIG-51).

The old engine's start (``notification_service.trigger_invitations``) asks ``engine_for`` and skips a
new-engine session; its other entry points move behind the switch in swap step 6.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


def _window_opens(instance, config) -> datetime:
    """When the session's invitation window opens, naive UTC: the coach's invitation start
    (``scheduler._fire_time_utc``), or the occurrence's creation for ``none``."""
    from padel_app.scheduler import _compute_invite_start_dt

    opens = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
    return opens if opens is not None else instance.created_at


def engine_for(instance, config=None) -> str:
    """``new`` or ``old`` for one occurrence (rule 18)."""
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import coaches_for

    if db.session.get(EngineSession, instance.id) is not None:
        return "new"
    coach_ids = [c.id for c in coaches_for(instance)]
    if config is None or config.coach_id not in coach_ids:
        config = NotificationConfig.query.filter(NotificationConfig.coach_id.in_(coach_ids or [-1])).first()
    if config is None or config.engine_version != "new" or config.engine_switched_at is None:
        return "old"
    if Vacancy.query.filter_by(lesson_instance_id=instance.id).first() is not None:
        return "old"                                         # the old engine is inviting: it drains
    return "new" if _window_opens(instance, config) >= config.engine_switched_at else "old"


def _adopt(store, instance, coach_id: int, now: datetime) -> None:
    """The session's ``engine_sessions`` row and its regulars, placed (``TableStore.add_session``)."""
    from padel_app.models.presences import Presence

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
        store.add_session(session, store._level(instance.level_id), instance.effective_max_players,
                          instance.start_datetime, regulars, now)


def adopt_due(*, now: datetime | None = None, coach_ids=None) -> list[str]:
    """Adopt every switched coach's occurrence that has not started and that ``engine_for`` puts on
    the new engine but has no row yet. Returns the adopted session ids. Idempotent."""
    from padel_app.models import EngineSession
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_store import TableStore

    now = now or utcnow_naive()
    query = NotificationConfig.query.filter(NotificationConfig.engine_version == "new")
    if coach_ids is not None:
        query = query.filter(NotificationConfig.coach_id.in_(list(coach_ids) or [-1]))
    store = TableStore(clock=lambda: now)
    adopted = []
    for config in query.order_by(NotificationConfig.coach_id).all():
        instances = (LessonInstance.query
                     .join(Association_CoachLessonInstance,
                           Association_CoachLessonInstance.lesson_instance_id == LessonInstance.id)
                     .outerjoin(EngineSession, EngineSession.lesson_instance_id == LessonInstance.id)
                     .filter(Association_CoachLessonInstance.coach_id == config.coach_id,
                             EngineSession.lesson_instance_id.is_(None),
                             LessonInstance.status != "canceled",
                             LessonInstance.start_datetime > utc_to_wall_naive(now))
                     .order_by(LessonInstance.start_datetime, LessonInstance.id).all())
        for instance in instances:
            if engine_for(instance, config) == "new":
                _adopt(store, instance, config.coach_id, now)
                adopted.append(str(instance.id))
    return adopted


def switch_coach(coach_id: int, *, now: datetime | None = None) -> list[str]:
    """Switch the coach to the new engine (rule 18) and adopt the sessions whose window has not
    opened. Switching an already switched coach changes nothing. Returns the adopted session ids."""
    from padel_app.services.notification_service import get_or_create_config

    now = now or utcnow_naive()
    config = get_or_create_config(coach_id)
    if config.engine_version != "new":
        config.engine_version, config.engine_switched_at = "new", now
        db.session.commit()
    return adopt_due(now=now, coach_ids=[coach_id])
