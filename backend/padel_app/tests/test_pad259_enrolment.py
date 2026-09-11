"""PAD-259 (audit H5, classes.instance-enrollment rules 1-9): the presence row is
the per-occurrence enrolment, written by one function, with the phase-1 shadow
junction kept in step. Owner decision 2026-09-11, option A."""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student


def _seed_roster_lesson(app, coach_id, player_ids, *, max_players=4):
    """A non-recurring lesson tomorrow with ``player_ids`` on its series roster."""
    from padel_app.models import Association_CoachLesson, Association_PlayerLesson, Club, Lesson

    with app.app_context():
        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        start = datetime.utcnow().replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
        lesson = Lesson(
            title="Roster class", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=max_players, color="#000",
            status="active", club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        for pid in player_ids:
            db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lesson.id))
        db.session.commit()
        return lesson.id, start.date()


def _extra_player(app, name):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name=name, username=name.lower(), email=f"{name.lower()}@t.com", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.commit()
        return player.id


def _materialise(app, lesson_id, day):
    from padel_app.models import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context(), patch("padel_app.scheduler._maybe_schedule_instance"):
        return get_or_materialize_instance(Lesson.query.get(lesson_id), day).id


def _edit_payload(instance):
    return {
        "date": instance.start_datetime.strftime("%Y-%m-%d"),
        "start_time": instance.start_datetime.strftime("%H:%M"),
        "end_time": instance.end_datetime.strftime("%H:%M"),
    }


def test_materialisation_writes_one_enrolment_per_roster_player(app):
    from padel_app.models import LessonInstance, Presence
    from padel_app.services.lesson_service import reconcile_enrolment

    ids = _seed_coach_and_student(app)
    bob = _extra_player(app, "Bob")
    lesson_id, day = _seed_roster_lesson(app, ids["coach_id"], [ids["student_id"], bob])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        rows = Presence.query.filter_by(lesson_instance_id=instance_id).order_by(Presence.player_id).all()
        assert [(r.player_id, r.invited, r.enrolment_source) for r in rows] == [
            (ids["student_id"], True, "roster"), (bob, True, "roster"),
        ]
        assert LessonInstance.query.get(instance_id).effective_filled_spots == 2
        assert reconcile_enrolment() == []


def test_a_coach_adds_a_player_to_one_occurrence(app):
    from padel_app.models import LessonInstance, Presence
    from padel_app.services.lesson_service import edit_lesson_instance_helper, reconcile_enrolment

    ids = _seed_coach_and_student(app)
    carol = _extra_player(app, "Carol")
    lesson_id, day = _seed_roster_lesson(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context(), patch("padel_app.scheduler._maybe_schedule_instance"):
        instance = LessonInstance.query.get(instance_id)
        edit_lesson_instance_helper({**_edit_payload(instance), "add_player_ids": [carol]}, instance)
        row = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=carol).one()
        assert row.enrolment_source == "coach"
        assert LessonInstance.query.get(instance_id).effective_filled_spots == 2
        assert reconcile_enrolment(instance_id) == []


def test_a_walk_in_on_the_attendance_sheet_becomes_an_enrolment(app):
    from padel_app.models import LessonInstance, Presence
    from padel_app.services.lesson_service import add_presences, reconcile_enrolment

    ids = _seed_coach_and_student(app)
    eve = _extra_player(app, "Eve")
    lesson_id, day = _seed_roster_lesson(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        instance = LessonInstance.query.get(instance_id)
        add_presences(instance, [{"playerId": eve, "status": "present"}])
        row = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=eve).one()
        assert (row.enrolment_source, row.validated, row.status) == ("walk_in", True, "present")
        assert LessonInstance.query.get(instance_id).effective_filled_spots == 2
        assert reconcile_enrolment(instance_id) == []


def test_removing_a_player_deletes_the_enrolment_and_retires_the_reminder(app):
    from padel_app.models import LessonInstance, Presence, ReminderAttempt
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.lesson_service import edit_lesson_instance_helper, reconcile_enrolment

    ids = _seed_coach_and_student(app)
    lesson_id, day = _seed_roster_lesson(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context(), patch("padel_app.scheduler._maybe_schedule_instance"):
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        attempts.record_attempt(message=None, instance_id=instance_id, player_id=ids["student_id"],
                                presence_id=presence.id, number=1)
        assert attempts.pending_attempts(instance_id, ids["student_id"])

        instance = LessonInstance.query.get(instance_id)
        edit_lesson_instance_helper({**_edit_payload(instance), "remove_player_ids": [ids["student_id"]]}, instance)

        assert Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).first() is None
        assert LessonInstance.query.get(instance_id).effective_filled_spots == 0
        assert attempts.pending_attempts(instance_id, ids["student_id"]) == []
        assert ReminderAttempt.query.filter_by(lesson_instance_id=instance_id).one().superseded is True
        assert reconcile_enrolment(instance_id) == []


def test_shadow_and_presences_agree_after_every_path(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import (
        add_presences, edit_lesson_instance_helper, enrol, reconcile_enrolment,
    )

    ids = _seed_coach_and_student(app)
    carol, dave, eve = (_extra_player(app, n) for n in ("Carol", "Dave", "Eve"))
    lesson_id, day = _seed_roster_lesson(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context(), patch("padel_app.scheduler._maybe_schedule_instance"):
        instance = LessonInstance.query.get(instance_id)
        edit_lesson_instance_helper({**_edit_payload(instance), "add_player_ids": [carol]}, instance)
        enrol(dave, instance, "fill", confirmed=True)
        add_presences(instance, [{"playerId": eve, "status": "present"}])
        edit_lesson_instance_helper({**_edit_payload(instance), "remove_player_ids": [carol]}, instance)
        assert reconcile_enrolment() == []
        assert LessonInstance.query.get(instance_id).enrolled_player_ids == {ids["student_id"], dave, eve}


# ── rule 4: the unique pair is the lock ──

def test_enrol_survives_a_concurrent_insert_of_the_same_pair(app):
    """Two callers pass the check for the same (player, instance); the loser's
    insert hits uq_presence_player_lesson_instance and enrol() re-reads the
    winner's row instead of raising. Simulated by a lookup that misses once
    while the row already exists."""
    from unittest.mock import patch

    from padel_app.models import LessonInstance, Presence
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.services import lesson_service
    from padel_app.tests.test_notification_reminder_flow import _seed_instance

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)

    class _MissOnce:
        """Presence, but the first ``query.filter_by(...).first()`` says None."""

        def __init__(self, real):
            self._real = real
            self.misses = 1

        def __getattr__(self, name):
            return getattr(self._real, name)

        def __call__(self, **kwargs):
            return self._real(**kwargs)

        @property
        def query(self):
            outer = self
            real_query = self._real.query

            class _Query:
                def filter_by(self, **key):
                    fq = real_query.filter_by(**key)

                    class _Result:
                        def first(self_):
                            if outer.misses:
                                outer.misses -= 1
                                return None
                            return fq.first()

                        def one(self_):
                            return fq.one()

                    return _Result()

            return _Query()

    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        existing = Presence.query.filter_by(
            player_id=ids["student_id"], lesson_instance_id=instance_id
        ).one()
        with patch.object(lesson_service, "Presence", _MissOnce(Presence)):
            returned = lesson_service.enrol(ids["student_id"], instance, "coach")
        assert returned.id == existing.id
        assert Presence.query.filter_by(player_id=ids["student_id"], lesson_instance_id=instance_id).count() == 1
        assert Association_PlayerLessonInstance.query.filter_by(
            player_id=ids["student_id"], lesson_instance_id=instance_id
        ).count() == 1
        assert lesson_service.reconcile_enrolment(instance_id) == []
        # The session is still usable after the rolled-back savepoint.
        db.session.commit()
