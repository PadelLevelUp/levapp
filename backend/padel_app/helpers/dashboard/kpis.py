from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func

from padel_app.sql_db import db
from padel_app.models import Presence, LessonInstance, Association_CoachPlayer, Association_CoachLesson, Lesson

@dataclass(frozen=True)
class CoachKpis:
    total_players: int
    pending_validations: int
    monthly_revenue: int
    scheduled_count: int

@dataclass(frozen=True)
class PlayerKpis:
    lessons_attended: int
    lessons_missed: int
    upcoming_lessons: int
    invites_to_confirm: int


def compute_player_kpis(*, player_id: int) -> PlayerKpis:
    """
    Compute player KPIs based on Presence + LessonInstance.

    Uses LessonInstance.start_datetime as the start timestamp.
    """
    now = datetime.now(timezone.utc)

    P = Presence
    LI = LessonInstance

    lessons_attended = (
        db.session.query(func.count(P.id))
        .filter(P.player_id == player_id)
        .filter(P.status == "present")
        .scalar()
    ) or 0

    lessons_missed = (
        db.session.query(func.count(P.id))
        .filter(P.player_id == player_id)
        .filter(P.status == "absent")
        .scalar()
    ) or 0

    upcoming_lessons = (
        db.session.query(func.count(P.id))
        .join(LI, LI.id == P.lesson_instance_id)
        .filter(P.player_id == player_id)
        .filter(P.confirmed == True)  # noqa: E712
        .filter(LI.start_datetime >= now)
        .scalar()
    ) or 0

    invites_to_confirm = (
        db.session.query(func.count(P.id))
        .join(LI, LI.id == P.lesson_instance_id)
        .filter(P.player_id == player_id)
        .filter(P.invited == True)    # noqa: E712
        .filter(P.confirmed == False) # noqa: E712
        .filter(LI.start_datetime >= now)
        .scalar()
    ) or 0

    return PlayerKpis(
        lessons_attended=int(lessons_attended),
        lessons_missed=int(lessons_missed),
        upcoming_lessons=int(upcoming_lessons),
        invites_to_confirm=int(invites_to_confirm),
    )

def compute_coach_kpis(*, coach_id: int, scheduled_count: int) -> CoachKpis:
    """
    Compute KPIs for coach dashboard.

    Args:
        coach_id: Coach id.
        scheduled_count: Number of scheduled classes in the selected range.

    Returns:
        CoachKpis: KPI container.
    """
    total_players = (
        db.session.query(func.count(Association_CoachPlayer.id))
        .filter(Association_CoachPlayer.coach_id == coach_id)
        .scalar()
    ) or 0

    ACL = Association_CoachLesson

    pending_validations = (
        db.session.query(func.count(Presence.id))
        .join(LessonInstance, Presence.lesson_instance_id == LessonInstance.id)
        .join(Lesson, LessonInstance.lesson_id == Lesson.id)
        .join(ACL, ACL.lesson_id == Lesson.id)
        .filter(ACL.coach_id == coach_id)
        .filter(Presence.validated == False)
        .scalar()
    ) or 0

    monthly_revenue = 0

    return CoachKpis(
        total_players=int(total_players),
        pending_validations=int(pending_validations),
        monthly_revenue=int(monthly_revenue),
        scheduled_count=int(scheduled_count),
    )
