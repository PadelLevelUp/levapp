from datetime import datetime, timedelta, time
import json

from flask import current_app
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db
from padel_app.tools.unit_of_work import commit_or_flush, unit_of_work
from padel_app.models import (
    Lesson,
    LessonInstance,
    Presence,
    Association_CoachLesson,
    Association_PlayerLesson,
    Association_PlayerLessonInstance,
    Association_CoachLessonInstance,
)
from padel_app.tools.request_adapter import JsonRequestAdapter
from padel_app.tools.calendar_tools import build_datetime, _format_time, _format_date
from padel_app.helpers.calendar_helpers import (
    load_lessons_for_coach,
    load_lesson_instances_for_coach,
    build_lesson_events,
)


# ---------------------------------------------------------------------------
# Enrolment (PAD-259, classes.instance-enrollment rules 1-4, 9)
# ---------------------------------------------------------------------------

def _get_or_insert(model, build, **key):
    """Check-then-insert made race-safe by the unique pair itself (rule 4): the
    insert runs in a SAVEPOINT, and a concurrent winner's IntegrityError rolls
    only that savepoint back and re-reads the row (the B-046 step-4 shape).
    Works the same on SQLite (tests) and Postgres."""
    row = model.query.filter_by(**key).first()
    if row is not None:
        return row
    savepoint = db.session.begin_nested()
    try:
        row = build()
        db.session.add(row)
        db.session.flush()
        savepoint.commit()
        return row
    except IntegrityError:
        savepoint.rollback()
        return model.query.filter_by(**key).one()


def enrol(player_id, instance, source, *, invited=True, confirmed=False, validated=False):
    """Put a player on one occurrence. THE single writer (rule 4).

    The `Presence` row is the enrolment (rule 1). Idempotent: an existing row is
    returned untouched — its response and attendance are never reset. Phase 1
    also writes the shadow `player_in_lesson_instance` row, which nothing reads
    and phase 2 drops.

    Transactions (PAD-272): flushes inside a unit of work and commits outside
    one, so a caller that enrols a whole roster under ``with unit_of_work():``
    gets one commit, and the PAD-261 accept path keeps its row lock until its
    own commit.
    """
    from padel_app.models.presences import ENROLMENT_SOURCES

    if source not in ENROLMENT_SOURCES:
        raise ValueError(f"unknown enrolment_source {source!r}")
    player_id = int(player_id)
    key = dict(player_id=player_id, lesson_instance_id=instance.id)

    created = Presence.query.filter_by(**key).first() is None
    presence = _get_or_insert(
        Presence,
        lambda: Presence(
            invited=invited, confirmed=confirmed, validated=validated,
            enrolment_source=source, **key,
        ),
        **key,
    )
    _get_or_insert(
        Association_PlayerLessonInstance,
        lambda: Association_PlayerLessonInstance(**key),
        **key,
    )
    db.session.expire(instance, ["players_relations", "presences"])

    # PAD-316: a re-enrolment of someone who gave their spot up is a RETURN, not
    # a no-op. The row already existed, so `created` is False, and before this
    # the idempotent branch handed it back untouched: the absence stayed, the
    # class went on not counting them, and their vacancy went on being offered —
    # the coach's re-add silently did nothing. Only the coach's own validated
    # record is left alone; that is theirs to change on the attendance sheet.
    returning = (
        not created
        and presence.status == "absent"
        and not presence.validated
    )
    if returning:
        presence.status = None
        presence.justification = None
        presence.late_cancellation = False
        # Their previous answer is void: it recorded a "no" to a seat they no
        # longer hold, and nobody has asked them about this one. So the caller's
        # value stands — a coach's re-add leaves them un-answered (`planned`),
        # an engine fill arrives already confirmed. Claiming they said yes would
        # be the same over-reach as `confirmed` meaning "coming".
        presence.confirmed = confirmed

    if created or returning:
        # PAD-271 (notifications.invitations rule 13): a spot was taken, so a
        # vacancy the capacity no longer supports closes in the same unit of
        # work. PAD-316: a returning player also reclaims their OWN vacancy,
        # whose premise — that they left — is void, and which capacity alone
        # would not close while the class has spare room.
        from padel_app.services.notification_service import (
            _close_vacancy, _open_vacancy_for, reconcile_vacancies,
        )

        if returning:
            own = _open_vacancy_for(instance.id, player_id)
            if own is not None:
                _close_vacancy(own, player_id)
        reconcile_vacancies(instance, filled_by_player_id=player_id)
    commit_or_flush()
    db.session.expire(instance, ["players_relations", "presences"])
    return presence


def unenrol(player_id, instance) -> bool:
    """Take a player off one occurrence: the presence row goes, the shadow row
    goes, and any reminder still waiting for their answer is retired so the
    bubble shows no live Yes/No (rule 7). Returns whether a row existed."""
    from padel_app.services import reminder_attempt_service as attempts

    player_id = int(player_id)
    existed = False
    for attempt in attempts.pending_attempts(instance.id, player_id):
        attempts.mark_superseded(attempt)
    presence = Presence.query.filter_by(
        player_id=player_id, lesson_instance_id=instance.id
    ).first()
    if presence is not None:
        db.session.delete(presence)
        existed = True
    shadow = Association_PlayerLessonInstance.query.filter_by(
        player_id=player_id, lesson_instance_id=instance.id
    ).first()
    if shadow is not None:
        db.session.delete(shadow)
    commit_or_flush()
    db.session.expire(instance, ["players_relations", "presences"])
    return existed


def reconcile_enrolment(instance_id=None) -> list:
    """Junction pairs (player_id, lesson_instance_id) that have NO presence
    (rule 9). One-directional on purpose: a presence with no shadow row is what
    option A is for and never needs one; a shadow row with no presence would be
    an enrolment the code cannot see. Empty is the phase-2 gate."""
    q = (
        db.session.query(
            Association_PlayerLessonInstance.player_id,
            Association_PlayerLessonInstance.lesson_instance_id,
        )
        .outerjoin(
            Presence,
            (Presence.player_id == Association_PlayerLessonInstance.player_id)
            & (Presence.lesson_instance_id == Association_PlayerLessonInstance.lesson_instance_id),
        )
        .filter(Presence.id.is_(None))
    )
    if instance_id is not None:
        q = q.filter(Association_PlayerLessonInstance.lesson_instance_id == instance_id)
    return sorted(tuple(r) for r in q.all())


def parse_event_target(model, original_id, date):
    """The object a calendar event's (model, originalId, date) names:
    ``("lessoninstance", instance, None)`` or ``("lesson", lesson, occ_date)``.
    Shared by the join-request and cancel paths (they diverge after this)."""
    from dateutil import parser
    from flask import abort

    kind = (model or "").lower()
    if kind == "lessoninstance":
        return kind, LessonInstance.query.get_or_404(original_id), None
    if kind != "lesson":
        abort(400, "model must be Lesson or LessonInstance")
    lesson = Lesson.query.get_or_404(original_id)
    if not date:
        abort(400, "date is required for a Lesson")
    try:
        occ_date = parser.isoparse(str(date)).date()
    except (TypeError, ValueError):
        abort(400, "date must be an ISO date")
    return kind, lesson, occ_date


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class NoSeasonCoversDateError(ValueError):
    """Raised when "recurs until season end" cannot be resolved to a season.

    PAD-90 — fail closed. If no season of the coach covers the class's start
    date there is no end to snapshot into ``lessons.recurrence_end``, and a
    NULL ``recurrence_end`` means "recurs forever" everywhere downstream
    (``helpers/calendar_helpers.py`` treats it as an open range). Rather than
    silently creating an unbounded class, the create is rejected and the coach
    is told to set a season or pick an explicit end date.
    """

    #: Machine-readable discriminator the web client keys its message off.
    code = "no_season_covers_date"

    def __init__(self, on_date=None):
        self.on_date = on_date
        super().__init__(
            "No season covers this date. Set a season in Settings, or choose "
            "an end date for the recurrence."
        )


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------

def update_recurrence_weekday(lesson, old_date, new_date):
    if not lesson.recurrence_rule:
        return

    rule = json.loads(lesson.recurrence_rule)
    days = set(rule.get("daysOfWeek", []))

    old_wd = old_date.weekday() + 1
    new_wd = new_date.weekday() + 1

    if old_wd in days:
        days.remove(old_wd)

    days.add(new_wd)
    rule["daysOfWeek"] = sorted(days)
    return json.dumps(rule)


def transform_to_datetime(obj, data):
    date = data.get('date')
    start_time = data.get('start_time') if data.get('start_time') else _format_time(obj.start_datetime)
    end_time = data.get('end_time') if data.get('end_time') else _format_time(obj.end_datetime)

    data["start_datetime"] = build_datetime(date, start_time)
    data["end_datetime"] = build_datetime(date, end_time)
    return data


# ---------------------------------------------------------------------------
# Lesson instance helpers
# ---------------------------------------------------------------------------

def _log_exception(msg, *args):
    """Log at ERROR with a traceback, tolerating a missing app context.

    Materialization also runs from scheduler jobs, so this must never be the
    thing that raises inside an exception handler.
    """
    from flask import current_app, has_app_context

    if has_app_context():
        current_app.logger.exception(msg, *args)
    else:
        import logging
        logging.getLogger(__name__).exception(msg, *args)


def get_or_materialize_instance(lesson: Lesson, date):
    # An occurrence's identity is (lesson_id, occurrence date), NOT the parent
    # lesson's time-of-day. A "this occurrence only" edit can move an instance's
    # start_datetime off the parent's time; keying the lookup on
    # datetime.combine(date, lesson.start_datetime.time()) then misses and
    # materializes a duplicate LessonInstance for the same date, with a fresh set
    # of unconfirmed Presence rows — the reminder-double-send path in PAD-85/69.
    #
    # Match on original_lesson_occurence_date (the canonical occurrence key, same
    # as calendar_helpers), falling back to any instance whose start_datetime
    # lands on that calendar day for legacy rows where the column is unset.
    from sqlalchemy import and_, or_

    day_start = datetime.combine(date, time.min)
    day_end = day_start + timedelta(days=1)

    def _lookup():
        return (
            LessonInstance.query
            .filter(LessonInstance.lesson_id == lesson.id)
            .filter(
                or_(
                    LessonInstance.original_lesson_occurence_date == date,
                    and_(
                        LessonInstance.original_lesson_occurence_date.is_(None),
                        LessonInstance.start_datetime >= day_start,
                        LessonInstance.start_datetime < day_end,
                    ),
                )
            )
            .order_by(LessonInstance.id.asc())
            .first()
        )

    instance = _lookup()
    if instance:
        return instance

    # PAD-261 (classes.instances rule 8): materialisation is serialised per
    # series. A found occurrence takes no lock. A missing one locks the parent
    # lesson row and is looked up again: a concurrent caller that got here first
    # has committed its instance by the time the lock is ours.
    from padel_app.models.lessons import Lesson as _Lesson

    db.session.query(_Lesson.id).filter(_Lesson.id == lesson.id).with_for_update().one()
    instance = _lookup()
    if instance:
        db.session.commit()  # release the lock
        return instance

    instance = create_lesson_instance_helper({'date':date, 'original_lesson_occurence_date': date}, lesson)

    instance.add_to_session()
    instance.flush()

    # PAD-259 (classes.instance-enrollment rule 4): the roster is copied onto
    # the occurrence through the single writer; create_lesson_instance_helper
    # already enrolled every roster player, so this is idempotent. One unit of
    # work (PAD-272): the roster lands in one commit, not N+1.
    with unit_of_work():
        for rel in lesson.players_relations:
            enrol(rel.player_id, instance, "roster")
        instance.save()

    # Schedule reminder + invitation-start jobs for this new instance
    from padel_app.scheduler import _maybe_schedule_instance
    _maybe_schedule_instance(instance)

    # Fan out standing waiting list entries to this new instance.
    #
    # Best-effort step (spec classes.instances rule 5): `instance` is already
    # committed above, so a failure here must never fail the caller's request.
    # A SAVEPOINT keeps a DB failure (e.g. migration not yet run) from poisoning
    # the outer transaction and breaking unrelated operations like presence
    # confirmation.
    #
    # PAD-117: `begin_nested()` is opened OUTSIDE the try on purpose. Inside it,
    # a failure to open the savepoint left `sp` unassigned and the handler's
    # `sp.rollback()` raised `UnboundLocalError`, masking the real cause.
    sp = db.session.begin_nested()
    try:
        from padel_app.services.notification_service import _sync_standing_entries_for_new_instance
        if lesson.coaches_relations:
            coach_id = lesson.coaches_relations[0].coach_id
            _sync_standing_entries_for_new_instance(instance, coach_id)
        sp.commit()
    except Exception:
        # Containment is not silent: reaching here means a callee misbehaved, and
        # PAD-108 showed how hard that is to diagnose after the fact.
        _log_exception(
            "get_or_materialize_instance: standing waiting list sync failed for "
            "instance %s — contained, instance stands",
            instance.id,
        )
        try:
            sp.rollback()
        except Exception:
            # PAD-117: the guarded block committed before failing, which ended
            # this savepoint (and the outer transaction) out from under us. The
            # handle is dead, so rolling it back raises the SAME error — which
            # used to escape as an HTTP 500, the very failure this guard exists
            # to prevent. Recover at the session level instead, so the rest of
            # the request runs on a usable session. `instance` was committed
            # before the guarded block ran, so it survives (rule 7); any waiting
            # list rows staged inside the savepoint are reconciled by the next
            # materialization call, which is idempotent (rule 3).
            _log_exception(
                "get_or_materialize_instance: savepoint rollback failed for "
                "instance %s — transaction was closed by the guarded block; "
                "recovering the session",
                instance.id,
            )
            db.session.rollback()

    return instance


# ---------------------------------------------------------------------------
# Coaches of an occurrence (PAD-275, classes.coach-assignment rule 4)
# ---------------------------------------------------------------------------

def coaches_for(instance):
    """Who coaches this occurrence (classes.coach-assignment rule 4): the
    instance's own coach rows when it has any, else the lesson's — each in
    assignment order (junction id ascending), so `primary_coach` is the coach
    assigned first and every engine read agrees on it. The junction stays
    (decision 2026-09-11); this is the one reader, so an occurrence with no
    junction row is never coach-less. A plain read: it never creates config."""
    from padel_app.models.coaches import Coach

    instance_id = getattr(instance, "id", None)
    if isinstance(instance_id, int):
        own = (
            db.session.query(Coach)
            .join(Association_CoachLessonInstance, Association_CoachLessonInstance.coach_id == Coach.id)
            .filter(Association_CoachLessonInstance.lesson_instance_id == instance_id)
            .order_by(Association_CoachLessonInstance.id.asc())
            .all()
        )
        if own:
            return own
        lesson_id = getattr(instance, "lesson_id", None)
        if isinstance(lesson_id, int):
            return (
                db.session.query(Coach)
                .join(Association_CoachLesson, Association_CoachLesson.coach_id == Coach.id)
                .filter(Association_CoachLesson.lesson_id == lesson_id)
                .order_by(Association_CoachLesson.id.asc())
                .all()
            )
    # A stub without a real row (unit tests with MagicMock instances): fall back
    # to the relationships, in their id order.
    try:
        rels = sorted(
            (r for r in list(getattr(instance, "coaches_relations", None) or []) if r.coach is not None),
            key=lambda r: getattr(r, "id", 0) or 0,
        )
        own = [r.coach for r in rels]
    except TypeError:
        own = []
    if own:
        return own
    lesson = getattr(instance, "lesson", None)
    if lesson is None:
        return []
    try:
        rels = sorted(
            (r for r in list(getattr(lesson, "coaches_relations", None) or []) if r.coach is not None),
            key=lambda r: getattr(r, "id", 0) or 0,
        )
    except TypeError:
        return []
    return [r.coach for r in rels]


def primary_coach(instance):
    """The coach the engine and the calendar treat as "the coach" of an
    occurrence — the first of ``coaches_for``; None when nobody coaches it."""
    coaches = coaches_for(instance)
    return coaches[0] if coaches else None


def coach_instance_ids(coach_id):
    """Ids of every occurrence ``coach_id`` coaches: through its own junction
    row, or — when the occurrence has none — through its lesson's."""
    from sqlalchemy import and_, exists

    own = {
        row.lesson_instance_id
        for row in Association_CoachLessonInstance.query.filter_by(coach_id=coach_id).all()
    }
    no_junction = ~exists().where(
        Association_CoachLessonInstance.lesson_instance_id == LessonInstance.id
    )
    inherited = (
        db.session.query(LessonInstance.id)
        .join(Lesson, Lesson.id == LessonInstance.lesson_id)
        .join(Association_CoachLesson, Association_CoachLesson.lesson_id == Lesson.id)
        .filter(and_(Association_CoachLesson.coach_id == coach_id, no_junction))
        .all()
    )
    return own | {row[0] for row in inherited}


def create_lesson_instance_helper(data, parent_lesson=None):
    if not parent_lesson and not data.get('lesson_id'):
        raise ValueError('Need connection to parent lesson')
    if not parent_lesson:
        parent_lesson = Lesson.query.get_or_404(data.get('lesson_id'))

    data = data or {}
    instance_data = parent_lesson.data_for_instance()
    instance_data.update(data)
    instance_data = transform_to_datetime(parent_lesson, instance_data)
    instance_data['lesson'] = parent_lesson.id
    instance_data['max_players'] = (
        instance_data.get('max_players') or parent_lesson.max_players
    )
    # PAD-275 (classes.edit rule 4): overrides are nullable, NULL inherits.
    # A title equal to the parent's is not an override.
    _title = instance_data.get('title')
    instance_data['overwrite_title'] = (
        _title if _title and _title != parent_lesson.title else None
    )
    # Same for the level: an explicit level equal to the lesson's default is
    # not an override (the form adapter drops None, so NULL inherits).
    _lvl = instance_data.get('level') or instance_data.get('level_id')
    _lvl = int(_lvl) if _lvl not in (None, '') else None
    instance_data['level'] = (
        _lvl if _lvl is not None and _lvl != parent_lesson.default_level_id else None
    )
    instance_data.pop('level_id', None)

    lesson_instance = LessonInstance()
    form = lesson_instance.get_create_form()

    fake_request = JsonRequestAdapter(instance_data, form)
    values = form.set_values(fake_request)

    lesson_instance.update_with_dict(values)
    lesson_instance.create()

    add_ids = {
        int(pid)
        for pid in instance_data.get('add_player_ids', [])
        if pid is not None
    }

    remove_ids = {
        int(pid)
        for pid in instance_data.get('remove_player_ids', [])
        if pid is not None
    }

    existing_ids = [
        int(player_id)
        for player_id in instance_data.get('player_ids', [])
        if player_id is not None
    ]

    seen = set()
    player_ids = [
        pid for pid in existing_ids + list(add_ids)
        if pid not in remove_ids and not (pid in seen or seen.add(pid))
    ]

    # PAD-259: the presence row is the enrolment. Players copied from the
    # series roster are `roster`; anyone else on the form is `coach`.
    roster_ids = {r.player_id for r in parent_lesson.players_relations}
    with unit_of_work():
        for pid in player_ids:
            enrol(pid, lesson_instance, "roster" if pid in roster_ids else "coach")

    for coach_id in instance_data.get('coach_ids', []):
        Association_CoachLessonInstance(
            coach_id=coach_id,
            lesson_instance_id=lesson_instance.id,
        ).create()

    return lesson_instance


def edit_lesson_instance_helper(data, lesson_instance=None):
    if not lesson_instance and not data.get("lesson_instance_id"):
        raise ValueError("Need lesson_instance or lesson_instance_id")

    if not lesson_instance:
        lesson_instance = LessonInstance.query.get_or_404(
            data.get("lesson_instance_id")
        )

    data = transform_to_datetime(lesson_instance, data)
    # PAD-275 (classes.edit rule 4): a title equal to the lesson's is not an
    # override; the form adapter drops None, so the clear happens below.
    _title = data.get('title')
    _parent_title = lesson_instance.lesson.title if lesson_instance.lesson else None
    _clears_title = bool(_title) and _title == _parent_title
    data['overwrite_title'] = _title if _title and not _clears_title else None

    form = lesson_instance.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson_instance.update_with_dict(values)
    if _clears_title:
        lesson_instance.overwrite_title = None
    # PAD-275 (classes.edit rule 4): a level equal to the lesson's default is
    # not an override either.
    _lvl = data.get('level') or data.get('level_id')
    if _lvl not in (None, '') and lesson_instance.lesson is not None \
            and int(_lvl) == lesson_instance.lesson.default_level_id:
        # The form set the relationship; clear it too or the flush re-syncs level_id.
        lesson_instance.level = None
        lesson_instance.level_id = None
    lesson_instance.save()

    # PAD-259 (classes.instance-enrollment rules 4 and 7): one writer, and a
    # removal also retires the player's pending reminder bubble.
    for player_id in data.get("add_player_ids", []):
        enrol(player_id, lesson_instance, "coach")

    for player_id in data.get("remove_player_ids", []):
        unenrol(player_id, lesson_instance)

    # Reschedule reminder/invite jobs — start_datetime may have changed
    from padel_app.scheduler import _maybe_schedule_instance
    _maybe_schedule_instance(lesson_instance)

    return lesson_instance


def add_presences(lesson_instance, payload):
    created_presences = []

    for item in payload:
        player_id = item.get('playerId')
        lesson_instance_id = lesson_instance.id

        existing = Presence.query.filter_by(
            lesson_instance_id=lesson_instance_id,
            player_id=player_id,
        ).first()

        # Attendance marking only owns status/justification. The reminder-flow
        # flags (invited/confirmed) and late_cancellation are deliberately NOT
        # routed through the form layer: every Boolean form field is written on
        # every submit, so a payload that merely omits them — or a coercion bug
        # like PAD-69 — would silently reset the student's reminder answer.
        # They are left exactly as the reminder flow set them.
        data = {
            "status": item.get('status'),
            "justification": item.get('justification'),
        }

        if existing:
            presence_obj = existing
            form = presence_obj.get_edit_form()
        else:
            # No presence row yet means this player was not on the instance's
            # roster — a walk-in the coach is adding after the fact (PAD-140).
            # They also need the instance association, because
            # `effective_filled_spots` counts `players_relations`, not
            # presences: without it the walk-in occupies a spot that the
            # calendar badge, the class-detail capacity field and the
            # invitation engine all fail to see (`calendar.view` rule 9 makes
            # that field the single source of truth, so it cannot be patched
            # per-surface). This mirrors what the vacancy-fill path already
            # does in `notification_service._add_player_to_instance`.
            # PAD-259: the presence row IS the enrolment, so the walk-in is
            # enrolled through the single writer and then marked (rule 4).
            presence_obj = enrol(player_id, lesson_instance, "walk_in", invited=False)
            form = presence_obj.get_edit_form()

        fake_request = JsonRequestAdapter(data, form)
        values = form.set_values(fake_request)

        for reminder_flag in ("invited", "confirmed", "late_cancellation"):
            values.pop(reminder_flag, None)
        # Attendance was explicitly recorded by the coach.
        values["validated"] = True

        was_absent = presence_obj.status == "absent"
        presence_obj.update_with_dict(values)
        presence_obj.save()

        # PAD-316: the coach reversing their own absent mark is a return too.
        # Marking someone absent frees their spot and the engine opens a vacancy
        # for it; marking them present again restored the count but left that
        # vacancy standing, so the engine went on offering a seat the class no
        # longer had. Capacity alone will not close it while the class has spare
        # room — the vacancy names a player who is no longer absent, and that is
        # what makes it stale, not the arithmetic.
        if was_absent and presence_obj.status != "absent":
            from padel_app.services.notification_service import (
                _close_vacancy, _open_vacancy_for, reconcile_vacancies,
            )

            own = _open_vacancy_for(lesson_instance.id, player_id)
            if own is not None:
                _close_vacancy(own, player_id)
            reconcile_vacancies(lesson_instance, filled_by_player_id=player_id)

        created_presences.append(presence_obj)

    return created_presences


# ---------------------------------------------------------------------------
# Lesson helpers
# ---------------------------------------------------------------------------

def create_lesson_helper(data):
    lesson = Lesson()
    form = lesson.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson.update_with_dict(values)
    lesson.create()

    if data.get("coach"):
        Association_CoachLesson(
            coach_id=data["coach"],
            lesson_id=lesson.id,
        ).create()

    if data.get("player_ids"):
        for player_id in data.get("player_ids"):
            Association_PlayerLesson(
                player_id=player_id,
                lesson_id=lesson.id,
            ).create()

    return lesson


def edit_lesson_helper(data, lesson=None):
    if not lesson and not data.get("lesson_id"):
        raise ValueError("Need lesson or lesson_id")

    if not lesson:
        lesson = Lesson.query.get_or_404(data.get("lesson_id"))

    data = transform_to_datetime(lesson, data)
    if data.get("event_date") and data.get("date"):
        new_date = datetime.strptime(data["date"], "%Y-%m-%d").date()

        recurrence_rule = update_recurrence_weekday(
            lesson,
            old_date=data["event_date"],
            new_date=new_date,
        )
        data['recurrence_rule'] = recurrence_rule

    form = lesson.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson.update_with_dict(values)
    # clubs.courts rule 6 (PAD-194): an explicit null clears the court — the
    # form adapter drops None values, so it never reaches update_with_dict.
    if "court" in data and data["court"] in (None, "", "null"):
        lesson.court_id = None
    lesson.save()

    """ if "coach" in data:
        Association_CoachLesson.query.filter_by(
            lesson_id=lesson.id
        ).delete()

        if data["coach"]:
            Association_CoachLesson(
                coach_id=data["coach"],
                lesson_id=lesson.id,
            ).create() """

    for player_id in data.get("add_player_ids", []):
        Association_PlayerLesson(
            player_id=player_id,
            lesson_id=lesson.id,
        ).create()

    for player_id in data.get("remove_player_ids", []):
        Association_PlayerLesson.query.filter_by(
            player_id=player_id,
            lesson_id=lesson.id,
        ).delete()

    return lesson


def duplicate_lesson_helper(old_lesson):
    """Copy a lesson row — every mapped column except the identity and the
    timestamps (classes.recurrence rule 6, PAD-275). Built from the mapper so a
    column added later cannot be forgotten (the hand list used to drop
    `description` and `notifications_enabled`). The caller sets the recurrence
    bounds it changes."""
    from sqlalchemy import inspect as sa_inspect

    skip = {"id", "created_at", "updated_at"}
    columns = {
        attr.key: getattr(old_lesson, attr.key)
        for attr in sa_inspect(Lesson).column_attrs
        if attr.key not in skip
    }
    new_lesson = Lesson(**columns)

    new_lesson.create()

    if old_lesson.coaches:
        for rel in old_lesson.coaches_relations:
            Association_CoachLesson(
                coach_id=rel.coach_id,
                lesson_id=new_lesson.id,
            ).create()

    if old_lesson.players_relations:
        for rel in old_lesson.players_relations:
            Association_PlayerLesson(
                player_id=rel.player_id,
                lesson_id=new_lesson.id,
            ).create()

    return new_lesson


def delete_future_instances(lesson, cutoff):
    """Delete a series' occurrences from ``cutoff`` on, in ONE statement.

    PAD-274 (audit M15): this used to load every instance and delete it with a
    commit each. The database already cascades every child of an occurrence
    (presences, links, vacancies, invitations, waiting lists, reminder
    attempts, join requests, training), so one bulk DELETE leaves exactly the
    rows the per-instance loop left, atomically. Scheduler jobs are still
    cancelled per occurrence, which is not database state.
    """
    from padel_app.scheduler import _maybe_cancel_instance

    query = LessonInstance.query.filter(
        LessonInstance.lesson_id == lesson.id,
        LessonInstance.start_datetime >= cutoff,
    )
    instance_ids = [row.id for row in query.with_entities(LessonInstance.id).all()]
    for instance_id in instance_ids:
        _maybe_cancel_instance(instance_id)
    if instance_ids:
        LessonInstance.query.filter(LessonInstance.id.in_(instance_ids)).delete(
            synchronize_session=False
        )
        db.session.commit()
        db.session.expire_all()
    return True


def split_lesson(lesson, date, remove_current_date=False):
    recurrence_start = date + timedelta(days=1) if remove_current_date else date
    original_recurrence_end = lesson.recurrence_end

    new_start = datetime.combine(recurrence_start, lesson.start_datetime.time())
    new_end = datetime.combine(recurrence_start, lesson.end_datetime.time())

    new_lesson = duplicate_lesson_helper(lesson)

    # recurrence_end is INCLUSIVE — a bare date is coerced to end-of-day
    # (ensure_utc → time.max), so an occurrence on that date is still
    # projected. When the current date is being removed, the "before" lesson
    # must end the day BEFORE it, otherwise the occurrence resurrects on
    # reload (PAD-65). When splitting for an edit (date stays), end on `date`.
    lesson.recurrence_end = (date - timedelta(days=1)) if remove_current_date else date

    new_lesson.start_datetime = new_start
    new_lesson.end_datetime = new_end
    new_lesson.recurrence_end = original_recurrence_end

    instances_to_move = [
        inst for inst in lesson.instances
        if inst.start_datetime.date() >= recurrence_start
    ]

    for instance in instances_to_move:
        instance.lesson = new_lesson

    lesson.save()
    new_lesson.save()

    return lesson, new_lesson


# ---------------------------------------------------------------------------
# Route-level service functions
# ---------------------------------------------------------------------------

def edit_lesson_from_data(lesson, data):
    """Applies form-data edits to a Lesson, including datetime and recurrence fields."""
    form = lesson.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    lesson.update_with_dict(values)

    if "startDate" in data and "defaultStartTime" in data:
        lesson.start_datetime = datetime.fromisoformat(
            f'{data["startDate"]}T{data["defaultStartTime"]}'
        )

    if "startDate" in data and "defaultEndTime" in data:
        lesson.end_datetime = datetime.fromisoformat(
            f'{data["startDate"]}T{data["defaultEndTime"]}'
        )

    if "endDate" in data:
        lesson.recurrence_end = (
            datetime.fromisoformat(data["endDate"])
            if data["endDate"]
            else None
        )

    lesson.save()
    return lesson


def add_class_service(data, coach, club):
    """Builds a lesson payload from frontend add_class data and creates the lesson."""
    lesson_payload = {
        "title": data["name"],
        "type": data["classType"],
        "status": "active",
        "color": data.get("color"),
        "max_players": data["maxPlayers"],
        "level": data.get("levelId"),
        "is_recurring": data.get("isRecurring", False),
        "start_datetime": build_datetime(data["date"], data["startTime"]),
        "end_datetime": build_datetime(data["date"], data["endTime"]),
        "club": club.id,
        "coach": coach.id,
        "player_ids": data.get("playerIds", []),
    }

    # clubs.courts rule 6 (PAD-194): an optional court of the class's club.
    if "courtId" in data:
        from padel_app.services.court_service import resolve_court_for_club

        court = resolve_court_for_club(club.id, data.get("courtId"))
        lesson_payload["court"] = court.id if court else None

    if data.get("isRecurring"):
        lesson_payload["recurrence_rule"] = json.dumps(data.get("recurrenceRule"))
        lesson_payload["recurrence_end"] = data.get("endDate")

        if data.get("recursUntilSeasonEnd"):
            from padel_app.services import season_service

            lesson_payload["recurs_until_season_end"] = True
            start_date = datetime.strptime(data["date"], "%Y-%m-%d").date()
            season_end = season_service.resolve_season_end_for_coach(coach, start_date)
            # PAD-90 — fail closed. Falling through with recurrence_end unset
            # would leave it NULL, which every downstream reader interprets as
            # "no end": the class would recur forever and materialise instances
            # and reminder jobs indefinitely, with nothing shown to the coach.
            if season_end is None:
                raise NoSeasonCoversDateError(start_date)
            lesson_payload["recurrence_end"] = season_end

    lesson = create_lesson_helper(lesson_payload)

    if lesson_payload.get("recurs_until_season_end"):
        lesson.recurs_until_season_end = True
        lesson.save()

    if data.get("notificationsEnabled") is not None:
        lesson.notifications_enabled = data["notificationsEnabled"]
        lesson.save()

    # Schedule reminder jobs for all upcoming occurrences within the 60-day horizon
    if lesson.coaches_relations:
        from padel_app.scheduler import schedule_lesson_reminder_jobs
        schedule_lesson_reminder_jobs(lesson.id, lesson.coaches_relations[0].coach_id)

    return lesson


def confirm_presences_service(class_instance_data, presences_data):
    """Materialises an instance if needed and records presences.

    ``originalId`` lives in two different id-spaces depending on the event:
    for a materialized ``LessonInstance`` it is the *instance* id, for a
    (recurring or single) ``Lesson`` occurrence it is the *lesson* id. The
    field that reliably distinguishes the two is the calendar-event ``id`` —
    ``"lessoninstance-<id>"`` for a materialized instance vs
    ``"lesson-<id>-<date>"`` for a projected lesson occurrence (see
    ``build_lesson_events`` / ``serialize_calendar_event``). When a caller
    omits ``id`` (legacy/synthetic payloads), a truthy ``parentClassId`` is
    used as the fallback signal that ``originalId`` is an instance id.

    The previous check — ``'parentClassId' in class_instance_data.keys()`` —
    was wrong: ``parentClassId`` is added by ``serialize_class_instance``
    whenever the detail endpoint resolves to an *instance*, even when the
    frontend's event (and therefore ``originalId``) is still a recurring
    *Lesson* (e.g. a stale calendar whose occurrence was materialized after
    it loaded). That sent a Lesson id into ``LessonInstance.get_or_404`` →
    404 "Failed to save attendance". Branching on the event id prefix always
    routes a lesson occurrence through materialization instead.
    """
    original_id = class_instance_data.get('originalId')
    event_id = str(class_instance_data.get('id') or '')

    if event_id.startswith('lessoninstance-'):
        is_instance = True
    elif event_id.startswith('lesson-'):
        is_instance = False
    else:
        # Legacy/synthetic payloads without a calendar-event id: a truthy
        # parentClassId means originalId is a materialized LessonInstance id.
        is_instance = bool(class_instance_data.get('parentClassId'))

    if is_instance:
        # Already a materialized LessonInstance — originalId is the instance ID
        instance = LessonInstance.query.get_or_404(original_id)
    else:
        # Recurring or single Lesson occurrence — originalId is the Lesson ID.
        # Materialize (or reuse) the instance for the occurrence's date.
        lesson = Lesson.query.get_or_404(original_id)
        from datetime import datetime as _dt
        date = _dt.strptime(class_instance_data['date'], '%Y-%m-%d').date()
        instance = get_or_materialize_instance(lesson, date)

    return add_presences(instance, presences_data)


def update_lesson_status_service(lesson_id, data):
    """Materialises an instance for the given date and sets its status."""
    lesson = Lesson.query.get_or_404(lesson_id)
    date = datetime.fromisoformat(data["date"]).date()
    instance = get_or_materialize_instance(lesson, date)
    instance.status = data["status"]  # canceled | completed
    instance.save()

    # Cancel scheduled notification jobs when a class is canceled
    if data.get("status") == "canceled":
        from padel_app.scheduler import _maybe_cancel_instance
        _maybe_cancel_instance(instance.id)

    return instance


def get_lesson_instances_in_range(coach, range_start, range_end):
    """Returns serialised lesson events for a coach in the given date range."""
    lessons = load_lessons_for_coach(coach.id, range_start, range_end)
    instances_by_key = load_lesson_instances_for_coach(coach.id, range_start, range_end)
    return build_lesson_events(lessons, instances_by_key, range_start, range_end)


# ---------------------------------------------------------------------------
# edit_class internals
# ---------------------------------------------------------------------------

def _reassign_future_instances(*, old_lesson, new_lesson, boundary_dt):
    (
        LessonInstance.query
        .filter(LessonInstance.lesson_id == old_lesson.id)
        .filter(LessonInstance.start_datetime >= boundary_dt)
        .update({LessonInstance.lesson_id: new_lesson.id}, synchronize_session=False)
    )
    db.session.commit()


def _apply_future_edit_to_lesson(*, lesson, event_date, new_date, payload):
    from_date = new_date or event_date
    from_dt = datetime.combine(from_date, time.min)

    if event_date != lesson.start_datetime.date():
        lesson_to_edit = duplicate_lesson_helper(lesson)

        split_date = from_date - timedelta(days=1)
        lesson.recurrence_end = split_date
        lesson.save()

        _reassign_future_instances(
            old_lesson=lesson,
            new_lesson=lesson_to_edit,
            boundary_dt=from_dt,
        )
    else:
        lesson_to_edit = lesson

    payload_for_lesson = dict(payload)
    payload_for_lesson["event_date"] = event_date

    lesson_to_edit = edit_lesson_helper(data=payload_for_lesson, lesson=lesson_to_edit)
    lesson_to_edit.save()

    return lesson_to_edit, from_date


def _edit_future_instances_for_lesson(*, lesson, from_date, payload):
    from_dt = datetime.combine(from_date, time.min)
    instances = (
        LessonInstance.query
        .filter(LessonInstance.lesson_id == lesson.id)
        .filter(LessonInstance.start_datetime >= from_dt)
        .all()
    )

    for inst in instances:
        inst_payload = dict(payload)
        inst_payload["date"] = inst.start_datetime.date().strftime("%Y-%m-%d")
        edit_lesson_instance_helper(inst_payload, inst)


def _ensure_date(payload, date_obj):
    payload["date"] = payload.get("date") or date_obj.strftime("%Y-%m-%d")
    return payload


def _normalize_eligibility_override(value):
    """A tier's incoming bar: ``None`` clears the tier; a list is stored as-is
    (``[]`` = everyone); anything else is treated as "clear" rather than
    letting a malformed payload lock a class."""
    return value if isinstance(value, list) else None


def edit_class_service(data):
    """Scope-aware class edit. Returns (result_dict, http_status_code)."""
    event = data.get("event")
    scope = data.get("scope")
    updates = data.get("updates", {})

    if not event or not scope:
        return {"error": "Invalid payload"}, 400

    notifications_enabled = updates.get("notificationsEnabled")
    # PAD-129 (eligibility.cascade rules 5, 8): absent = untouched, None = clear
    # this tier, [] = everyone, a list = that bar. `scope` picks the tier.
    eligibility_touched = "eligibilityRules" in updates
    eligibility_rules = _normalize_eligibility_override(updates.get("eligibilityRules"))
    # PAD-130: same tri-state contract for the open-spot toggle (None = inherit).
    visibility_touched = "openSpotsVisible" in updates
    open_spots_visible = updates.get("openSpotsVisible")
    if open_spots_visible is not None:
        open_spots_visible = bool(open_spots_visible)

    event_date = datetime.strptime(event["date"], "%Y-%m-%d").date()
    date_str = updates.get("date")
    new_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else None

    payload = {
        "title": updates.get("name", ""),
        "color": updates.get("color", ""),
        "max_players": updates.get("maxPlayers", None),
        "level": updates.get("levelId", None),
        "date": updates.get("date", None),
        "start_time": updates.get("startTime", None),
        "end_time": updates.get("endTime", None),
        "recurrence_end": updates.get("recurrenceEnd", None),
        "add_player_ids": updates.get("addPlayers", []),
        "remove_player_ids": updates.get("removePlayers", []),
    }

    model = event.get("model")
    original_id = event.get("originalId")

    # clubs.courts rule 6 (PAD-194): null clears the court, omitted leaves it.
    # Validated against the class's club before anything is written.
    if "courtId" in updates:
        from padel_app.services.court_service import resolve_court_for_club

        target = LessonInstance.query.get_or_404(original_id).lesson if model == "LessonInstance" else Lesson.query.get_or_404(original_id)
        court = resolve_court_for_club(target.club_id, updates.get("courtId"))
        payload["court"] = court.id if court else None

    if model == "LessonInstance":
        instance = LessonInstance.query.get_or_404(original_id)

        if scope == "single":
            _ensure_date(payload, event_date)
            edit_lesson_instance_helper(payload, instance)
            if notifications_enabled is not None:
                instance.notifications_enabled = notifications_enabled
                instance.save()
            if eligibility_touched:
                instance.eligibility_rules = eligibility_rules
                instance.save()
            if visibility_touched:
                instance.open_spots_visible = open_spots_visible
                instance.save()
            return {"id": instance.id}, 200

        if scope == "future":
            parent_lesson = instance.lesson
            _ensure_date(payload, event_date)
            # Cancel the parent's occurrence jobs from the split boundary before
            # the split: _apply_future_edit_to_lesson truncates the parent's
            # recurrence to `boundary - 1 day`, so any job at/after the boundary
            # would fire for an occurrence the parent no longer produces.
            # The boundary is `new_date or event_date` — mirroring the `from_date`
            # that _apply_future_edit_to_lesson computes. Using event_date here
            # would wrongly cancel jobs in [event_date, new_date) whenever the
            # edit moves the date, and those occurrences DO survive on the parent.
            from padel_app.scheduler import (
                cancel_lesson_reminder_jobs,
                schedule_lesson_reminder_jobs,
            )
            cancel_lesson_reminder_jobs(
                parent_lesson.id, from_date=new_date or event_date
            )
            lesson_to_edit, from_date = _apply_future_edit_to_lesson(
                lesson=parent_lesson,
                event_date=event_date,
                new_date=new_date,
                payload=payload,
            )
            _edit_future_instances_for_lesson(
                lesson=lesson_to_edit,
                from_date=from_date,
                payload=payload,
            )
            if notifications_enabled is not None:
                lesson_to_edit.notifications_enabled = notifications_enabled
                lesson_to_edit.save()
            if eligibility_touched:
                # The series tier — on the forked master when the edit started
                # mid-series (rule 6), so earlier occurrences keep the old bar.
                lesson_to_edit.eligibility_rules = eligibility_rules
                lesson_to_edit.save()
            if visibility_touched:
                lesson_to_edit.open_spots_visible = open_spots_visible
                lesson_to_edit.save()
            # A "this and future" edit off a materialized occurrence splits the
            # series into a *new* Lesson (duplicate_lesson_helper). Without this
            # the new lesson carries no reminder jobs at all, so its classes
            # silently send no reminders until the weekly extend_schedule_window
            # pass happens to pick it up — up to 7 days later, and never
            # retroactively for the occurrences missed in between.
            # Best-effort (PAD-10): the edit is already committed, so a scheduler
            # failure must not turn a successful edit into a false error response.
            try:
                if lesson_to_edit.coaches_relations:
                    schedule_lesson_reminder_jobs(
                        lesson_to_edit.id,
                        lesson_to_edit.coaches_relations[0].coach_id,
                    )
            except Exception:
                current_app.logger.exception(
                    "edit_class_service: failed to schedule reminder jobs for lesson %s",
                    lesson_to_edit.id,
                )
            return {"id": lesson_to_edit.id}, 201

        return {"error": "Invalid scope"}, 400

    lesson = Lesson.query.get_or_404(original_id)

    if scope == "single":
        payload["original_lesson_occurence_date"] = event_date.strftime("%Y-%m-%d")
        _ensure_date(payload, event_date)
        instance = create_lesson_instance_helper(data=payload, parent_lesson=lesson)
        if notifications_enabled is not None:
            instance.notifications_enabled = notifications_enabled
            instance.save()
        if eligibility_touched:
            instance.eligibility_rules = eligibility_rules
            instance.save()
        if visibility_touched:
            instance.open_spots_visible = open_spots_visible
            instance.save()
        # Schedule reminder/invite jobs for this newly materialized instance
        from padel_app.scheduler import _maybe_schedule_instance
        _maybe_schedule_instance(instance)
        return {"id": instance.id}, 201

    if scope == "future":
        _ensure_date(payload, event_date)
        # Cancel old lesson occurrence jobs from the split boundary. The boundary
        # is `new_date or event_date` — the same `from_date` that
        # _apply_future_edit_to_lesson truncates the parent's recurrence at.
        from padel_app.scheduler import cancel_lesson_reminder_jobs, schedule_lesson_reminder_jobs
        cancel_lesson_reminder_jobs(lesson.id, from_date=new_date or event_date)
        lesson_to_edit, _ = _apply_future_edit_to_lesson(
            lesson=lesson,
            event_date=event_date,
            new_date=new_date,
            payload=payload,
        )
        if notifications_enabled is not None:
            lesson_to_edit.notifications_enabled = notifications_enabled
            lesson_to_edit.save()
        if eligibility_touched:
            lesson_to_edit.eligibility_rules = eligibility_rules
            lesson_to_edit.save()
        if visibility_touched:
            lesson_to_edit.open_spots_visible = open_spots_visible
            lesson_to_edit.save()
        # Schedule reminder jobs for the resulting lesson (may be same or new)
        if lesson_to_edit.coaches_relations:
            schedule_lesson_reminder_jobs(lesson_to_edit.id, lesson_to_edit.coaches_relations[0].coach_id)
        return {"id": lesson_to_edit.id}, 201

    return {"error": "Invalid scope"}, 400


# ---------------------------------------------------------------------------
# remove_class internals
# ---------------------------------------------------------------------------

def _truncate_lesson_future(*, lesson, from_date):
    lesson.recurrence_end = from_date - timedelta(days=1)
    lesson.save()
    delete_future_instances(lesson, from_date)
    # Cancel lesson-level reminder jobs for occurrences that no longer exist
    try:
        from padel_app.scheduler import cancel_lesson_reminder_jobs
        cancel_lesson_reminder_jobs(lesson.id, from_date=from_date)
    except Exception:
        pass


def _remove_single_occurrence_from_lesson(*, lesson, date):
    from padel_app.scheduler import cancel_lesson_occurrence_job
    cancel_lesson_occurrence_job(lesson.id, date.isoformat())
    if not lesson.recurrence_rule:
        lesson.delete()
        return
    _, new_lesson = split_lesson(lesson, date, remove_current_date=True)
    # Schedule reminder jobs for the new lesson (post-split occurrences).
    # Wrapped in try-except: DB changes are already committed by split_lesson,
    # so a scheduler failure must not cause a false error response (PAD-10).
    try:
        if new_lesson and new_lesson.coaches_relations:
            from padel_app.scheduler import schedule_lesson_reminder_jobs
            schedule_lesson_reminder_jobs(new_lesson.id, new_lesson.coaches_relations[0].coach_id)
    except Exception:
        pass


def remove_class_service(data):
    """Scope-aware class removal. Returns (result_dict, http_status_code).

    PAD-75: before removing the class, snapshot the enrolled students + coach so
    that, once the removal succeeds, every enrolled student is notified the class
    was cancelled — reusing the notification-engine's message/push channel. The
    notification is best-effort: it must never turn a successful removal into an
    error response.
    """
    models_map = {
        "Lesson": Lesson,
        "LessonInstance": LessonInstance,
    }

    event = data.get("event", {}) or {}
    scope = data.get("scope")
    model_name = event.get("model")
    class_id = event.get("originalId")

    if not model_name or model_name not in models_map or not class_id:
        return {"error": "Invalid payload"}, 400

    if "date" not in event:
        return {"error": "Invalid payload"}, 400

    event_date = datetime.strptime(event["date"], "%Y-%m-%d").date()

    obj = models_map[model_name].query.get_or_404(class_id)

    # Snapshot cancellation recipients BEFORE removal — the roster/coach relations
    # are cascade-deleted as part of the removal below.
    cancellation_recipients = []
    try:
        from padel_app.services.notification_service import (
            collect_cancellation_recipients,
        )
        cancellation_recipients = collect_cancellation_recipients(obj)
    except Exception:
        cancellation_recipients = []

    result, status = _dispatch_remove_class(obj, model_name, scope, event_date)

    if 200 <= status < 300 and cancellation_recipients:
        try:
            from padel_app.services.notification_service import (
                notify_students_of_cancellation,
            )
            notify_students_of_cancellation(cancellation_recipients)
        except Exception:
            pass  # never fail a successful removal because notification failed

    return result, status


def _dispatch_remove_class(obj, model_name, scope, event_date):
    """Execute the scope-aware removal for a resolved class object (PAD-75 split).

    Extracted verbatim from ``remove_class_service`` so the notification snapshot
    can wrap it without threading through every early return.
    """
    from padel_app.scheduler import _maybe_cancel_instance

    if model_name == "LessonInstance":
        if scope == "single" or not scope:
            parent_lesson = obj.lesson
            # The date this instance overrides in the parent recurrence — the
            # ORIGINAL occurrence date, not the (possibly edited) instance date.
            occ_date = obj.original_lesson_occurence_date or obj.start_datetime.date()
            _maybe_cancel_instance(obj.id)
            obj.delete()
            # When the instance overrides a recurring parent, deleting it is not
            # enough: the parent series would re-project that occurrence (with
            # its pre-edit values) on reload. Exclude the date from the parent
            # recurrence, mirroring the Lesson scope="single" path (PAD-65).
            if parent_lesson is not None and parent_lesson.recurrence_rule:
                _remove_single_occurrence_from_lesson(
                    lesson=parent_lesson, date=occ_date
                )
                return {"status": "single_removed"}, 200
            return {"status": "deleted"}, 200

        if scope == "future":
            parent_lesson = obj.lesson
            _maybe_cancel_instance(obj.id)
            obj.delete()
            delete_future_instances(parent_lesson, event_date)
            _truncate_lesson_future(lesson=parent_lesson, from_date=event_date)
            return {"status": "recurrence_truncated"}, 200

        return {"error": "Invalid request"}, 400

    if model_name == "Lesson":
        if scope == "future":
            _truncate_lesson_future(lesson=obj, from_date=event_date)
            return {"status": "recurrence_truncated"}, 200

        if scope == "single":
            _remove_single_occurrence_from_lesson(lesson=obj, date=event_date)
            return {"status": "single_removed"}, 200

    return {"error": "Invalid request"}, 400
