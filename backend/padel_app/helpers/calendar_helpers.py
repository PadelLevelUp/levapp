from sqlalchemy import and_, or_
from sqlalchemy.orm import selectinload

from padel_app.tools.calendar_tools import ensure_utc, expand_occurrences
from padel_app.models import (
    Lesson,
    LessonInstance,
    CalendarBlock,
    Association_CoachLesson,
    Association_CoachLessonInstance,
    Association_PlayerLesson,
    Presence,
)
from padel_app.serializers.calendar_event import serialize_calendar_event


# ----------------------------
# Coach
# ----------------------------
def load_lessons_for_coach(coach_id, range_start, range_end):
    return (
        Lesson.query
        .join(Lesson.coaches_relations)
        .filter(
            Association_CoachLesson.coach_id == coach_id,
            Lesson.start_datetime <= range_end,
            Lesson.status == "active",
            (
                Lesson.recurrence_rule.is_(None)
                | (Lesson.recurrence_end.is_(None))
                | (Lesson.recurrence_end >= range_start.date())
            ),
        )
        .all()
    )


def load_lesson_instances_for_coach(coach_id, range_start, range_end):
    # PAD-262 (audit H9, dashboard.blocks rule 8): the coach filter runs in SQL.
    # An instance belongs to the coach through its own coach junction, or —
    # when it has none — through its lesson's. Before this the query loaded
    # EVERY coach's instances in range and dropped the others in Python.
    instances = (
        LessonInstance.query
        .join(Lesson)
        # PAD-71: the serialized event's participantCount reads
        # LessonInstance.effective_filled_spots, which walks both
        # players_relations and presences — eager-load them so a week of
        # classes stays at a constant number of queries. PAD-262 adds the
        # lesson, its coaches and the instance's own coaches, which the
        # serializer and the coach index below otherwise lazy-load per row.
        .options(
            selectinload(LessonInstance.presences),  # PAD-259: the roster
            selectinload(LessonInstance.coaches_relations),
            selectinload(LessonInstance.lesson).selectinload(Lesson.coaches_relations),
        )
        .filter(
            LessonInstance.start_datetime >= range_start,
            LessonInstance.start_datetime <= range_end,
            or_(
                LessonInstance.coaches_relations.any(
                    Association_CoachLessonInstance.coach_id == coach_id
                ),
                and_(
                    ~LessonInstance.coaches_relations.any(),
                    Lesson.coaches_relations.any(Association_CoachLesson.coach_id == coach_id),
                ),
            ),
        )
        .all()
    )

    indexed = {}
    for instance in instances:
        indexed[(instance.lesson_id, instance.original_lesson_occurence_date)] = instance

    return indexed


# ----------------------------
# Player
# ----------------------------
def load_lessons_for_player(player_id, range_start, range_end, *, only_active: bool = True):
    """
    Return base Lesson objects that the player is associated with (recurring templates).

    This uses the player<->lesson association (Association_PlayerLesson).
    """
    q = (
        Lesson.query
        .join(Lesson.players_relations)  # expects Lesson.players_relations relationship
        .filter(
            Association_PlayerLesson.player_id == player_id,
            Lesson.start_datetime <= range_end,
        )
    )

    if only_active:
        q = q.filter(Lesson.status == "active")

    # Keep recurrence filtering consistent with coach
    q = q.filter(
        (Lesson.recurrence_rule.is_(None))
        | (Lesson.recurrence_end.is_(None))
        | (Lesson.recurrence_end >= range_start.date())
    )

    return q.all()


def load_lesson_instances_for_player(
    player_id,
    range_start,
    range_end,
    *,
    include_invited: bool = True,
    include_confirmed_only: bool = False,
):
    """
    Return a dict indexed by (lesson_id, original_lesson_occurence_date) -> LessonInstance
    for instances relevant to this player.

    Source of truth: the Presence rows — the per-occurrence enrolment (PAD-259,
    classes.instance-enrollment rule 1).
    """
    indexed = {}

    pres_q = (
        Presence.query
        .join(LessonInstance, Presence.lesson_instance_id == LessonInstance.id)
        .filter(
            Presence.player_id == player_id,
            LessonInstance.start_datetime >= range_start,
            LessonInstance.start_datetime <= range_end,
        )
    )

    if include_confirmed_only:
        pres_q = pres_q.filter(Presence.confirmed == True)  # noqa: E712
    elif not include_invited:
        pres_q = pres_q.filter(Presence.invited == False)  # noqa: E712

    presences = pres_q.all()

    for p in presences:
        instance = p.lesson_instance
        if not instance:
            continue
        indexed[(instance.lesson_id, instance.original_lesson_occurence_date)] = instance

    return indexed


def build_lesson_events(lessons, instances_by_key, range_start, range_end):
    events = []

    rendered_instance_ids = set()
    for lesson in lessons:
        # PAD-275 rule 7: the lesson expands itself (exclusions honoured).
        occurrences = lesson.occurrences_between(range_start, range_end)

        for occ_start in occurrences:
            occ_date = occ_start.date()
            key = (lesson.id, occ_date)
            instance = instances_by_key.get(key)

            if instance:
                events.append(serialize_calendar_event(instance))
                rendered_instance_ids.add(instance.id)
            else:
                events.append(
                    serialize_calendar_event(
                        lesson,
                        override_id=f"lesson-{lesson.id}-{occ_date}",
                        override_date=occ_date.isoformat(),
                    )
                )

    for instance in instances_by_key.values():
        if instance.id not in rendered_instance_ids:
            events.append(serialize_calendar_event(instance))

    return events


def load_calendar_blocks_for_user(user_id, range_start, range_end):
    return (
        CalendarBlock.query
        .filter(
            CalendarBlock.user_id == user_id,
            CalendarBlock.start_datetime <= range_end,
            (
                CalendarBlock.recurrence_rule.is_(None)
                | (CalendarBlock.recurrence_end.is_(None))
                | (CalendarBlock.recurrence_end >= range_start.date())
            ),
        )
        .all()
    )


def build_block_events(blocks, range_start, range_end):
    events = []

    for block in blocks:
        occurrences = expand_occurrences(
            block.start_datetime,
            block.recurrence_rule,
            block.recurrence_end,
            range_start,
            range_end,
        )

        for occ_start in occurrences:
            occ_date = occ_start.date()
            events.append(
                serialize_calendar_event(
                    block,
                    override_id=f"block-{block.id}-{occ_start}",
                    override_date=occ_date.isoformat(),
                )
            )

    return events

def build_coach_calendar_events(coach_id, user_id, range_start, range_end, *, include_blocks: bool = True):
    lessons = load_lessons_for_coach(coach_id, range_start, range_end)
    instances_by_key = load_lesson_instances_for_coach(coach_id, range_start, range_end)
    lesson_events = build_lesson_events(lessons, instances_by_key, range_start, range_end)

    if not include_blocks:
        return lesson_events

    blocks = load_calendar_blocks_for_user(user_id, range_start, range_end)
    block_events = build_block_events(blocks, range_start, range_end)
    return lesson_events + block_events


def build_player_calendar_events(player_id, user_id, range_start, range_end, *, include_blocks: bool = True):
    lessons = load_lessons_for_player(player_id, range_start, range_end)
    instances_by_key = load_lesson_instances_for_player(player_id, range_start, range_end)
    lesson_events = build_lesson_events(lessons, instances_by_key, range_start, range_end)

    if not include_blocks:
        return lesson_events

    blocks = load_calendar_blocks_for_user(user_id, range_start, range_end)
    block_events = build_block_events(blocks, range_start, range_end)
    return lesson_events + block_events


# ── PAD-130: open spots a student could ask for (eligibility.open-spot-visibility) ──


def load_open_spot_events_for_player(player_id, range_start, range_end, *, now=None):
    """Discoverable classes for a student, as calendar events flagged ``openSpot``.

    Rules 1, 4–7 and 10 of ``eligibility.open-spot-visibility``: every future,
    non-canceled class of a coach the student is on the roster of that is
    *visible* (the coach's toggle, cascaded per rule 3), has an *empty spot*
    (the calendar's own capacity measure, rule 4) and that the student is
    *eligible* for (``eligibility.cascade``), minus the classes they are
    already in. Computed at read time from the same loaders and serializer the
    calendar uses — nothing is materialised or written (rule 5).
    """
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_open_spots_visible,
        passes_eligibility,
    )
    from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

    # PAD-256 (R-023): stored class times and the route's bounds are Lisbon
    # wall-clock, labelled UTC by ensure_utc so they compare with each other.
    # `now` is a UTC instant, so it moves to the club's clock before it meets them.
    now = now or utcnow_naive()
    now_utc = ensure_utc(now)
    now_wall = ensure_utc(utc_to_wall_naive(now))
    range_start, range_end = ensure_utc(range_start), ensure_utc(range_end)
    horizon_start = max(range_start, now_wall)
    if horizon_start > range_end:
        return []

    # What the student is already in — those are theirs, not offers (rule 1).
    own_lessons = {l.id for l in load_lessons_for_player(player_id, range_start, range_end)}
    own_instances = {
        inst.id for inst in load_lesson_instances_for_player(player_id, range_start, range_end).values()
    }

    events = []
    for cp in Association_CoachPlayer.query.filter_by(player_id=player_id).all():
        coach_id = cp.coach_id
        config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        lessons = load_lessons_for_coach(coach_id, horizon_start, range_end)
        instances_by_key = load_lesson_instances_for_coach(coach_id, horizon_start, range_end)
        rendered = set()

        def consider(obj, *, override_id=None, override_date=None, occ_start=None):
            start = ensure_utc(occ_start or obj.start_datetime)
            if start is None or start < now_wall:
                return
            if getattr(obj, "status", None) in ("canceled", "completed"):
                return
            if not effective_open_spots_visible(obj, coach_id, config):
                return
            if obj.model_name == "LessonInstance":
                filled = obj.effective_filled_spots
            else:
                filled = len(obj.players_relations)
            if obj.effective_max_players is None or filled >= obj.effective_max_players:
                return
            if not passes_eligibility(cp, obj, coach_id, effective_eligibility(obj, coach_id, config)):
                return
            event = serialize_calendar_event(obj, override_id=override_id, override_date=override_date, now=now_utc.replace(tzinfo=None))
            event["openSpot"] = True
            event["coachName"] = cp.coach.user.name if cp.coach and cp.coach.user else None
            events.append(event)

        for lesson in lessons:
            if lesson.id in own_lessons:
                continue
            for occ_start in lesson.occurrences_between(horizon_start, range_end):
                occ_date = occ_start.date()
                instance = instances_by_key.get((lesson.id, occ_date))
                if instance is not None:
                    rendered.add(instance.id)
                    if instance.id in own_instances:
                        continue
                    consider(instance)
                else:
                    consider(
                        lesson,
                        override_id=f"lesson-{lesson.id}-{occ_date}",
                        override_date=occ_date.isoformat(),
                        occ_start=occ_start,
                    )

        for instance in instances_by_key.values():
            if instance.id in rendered or instance.id in own_instances:
                continue
            if instance.lesson_id in own_lessons:
                continue
            consider(instance)

    return events
