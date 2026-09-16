"""PAD-271 (audit M4, B-072): vacancies follow capacity — notifications.invitations rule 13.

A Vacancy is a promise that a spot is open. Every enrolment closes one the
capacity no longer supports, and the two-minute tick reconciles before sending,
so a coach add, a walk-in or an import never leaves the engine inviting for a
full class. Four criteria, one test each.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import (
    PATCHES,
    _create_coach,
    _create_coach_player,
    _create_instance,
    _create_level,
    _create_player,
    _create_user,
    _seed_notification_config,
)


def _world(app, *, max_players, enrolled_names, extra_names=()):
    """A coach with a config, `enrolled_names` on the class, `extra_names` on the roster only."""
    with app.app_context():
        coach = _create_coach(_create_user("Coach", "coach-271"))
        level = _create_level(coach)
        enrolled = [_create_player(_create_user(n, f"{n.lower()}-271")) for n in enrolled_names]
        extra = [_create_player(_create_user(n, f"{n.lower()}-271")) for n in extra_names]
        for p in enrolled + extra:
            _create_coach_player(coach, p, level)
        instance = _create_instance(coach, level, enrolled_players=enrolled, max_players=max_players)
        _seed_notification_config(coach.id)
        return {
            "coach_id": coach.id,
            "instance_id": instance.id,
            **{n.lower(): p.id for n, p in zip(enrolled_names, enrolled)},
            **{n.lower(): p.id for n, p in zip(extra_names, extra)},
        }


def _vacancy(instance_id, coach_id, *, original_player_id=None, approval_status="not_required"):
    from padel_app.models import Vacancy

    v = Vacancy(
        lesson_instance_id=instance_id, coach_id=coach_id,
        original_player_id=original_player_id, status="open",
        approval_status=approval_status,
    )
    db.session.add(v)
    db.session.commit()
    return v.id


def _sent_invite(instance_id, coach_id, player_id, vacancy_id):
    from padel_app.models import NotificationEvent

    ev = NotificationEvent(
        coach_id=coach_id, lesson_instance_id=instance_id, player_id=player_id,
        type="auto", round_number=1, status="sent", vacancy_id=vacancy_id,
    )
    db.session.add(ev)
    db.session.commit()
    return ev.id


def _decline(instance_id, player_id):
    from padel_app.models import Presence

    p = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
    p.status = "absent"
    p.justification = "justified"
    p.confirmed = True
    db.session.commit()


def test_a_coach_add_closes_the_open_vacancy(app):
    """Rule 13: Bob declined (vacancy open, Carol invited); the coach adds Dave →
    Bob's vacancy is filled by Dave, Carol's invitation expires, next tick sends nothing."""
    from padel_app.models import NotificationEvent, Vacancy
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import process_invitation_batches

    ids = _world(app, max_players=2, enrolled_names=["Alice", "Bob"], extra_names=["Carol", "Dave"])
    with app.app_context():
        _decline(ids["instance_id"], ids["bob"])
        vacancy_id = _vacancy(ids["instance_id"], ids["coach_id"], original_player_id=ids["bob"])
        event_id = _sent_invite(ids["instance_id"], ids["coach_id"], ids["carol"], vacancy_id)

        from padel_app.models import LessonInstance
        instance = db.session.get(LessonInstance, ids["instance_id"])
        with patch(PATCHES[0]), patch(PATCHES[1]):
            enrol(ids["dave"], instance, "coach")

        vacancy = db.session.get(Vacancy, vacancy_id)
        assert vacancy.status == "filled"
        assert vacancy.filled_by_player_id == ids["dave"]
        assert vacancy.filled_at is not None
        assert db.session.get(NotificationEvent, event_id).status == "expired"

        before = NotificationEvent.query.count()
        with patch(PATCHES[0]), patch(PATCHES[1]):
            process_invitation_batches(now=datetime.utcnow())
        assert NotificationEvent.query.count() == before, "no batch for a closed vacancy"


def test_the_tick_closes_a_vacancy_the_engine_would_keep_inviting_for(app):
    """Rule 13: a full class (2/2) with a structural vacancy nobody closed → the
    tick fills it (no player) and sends no invitation."""
    from padel_app.models import NotificationEvent, Vacancy
    from padel_app.services.notification_service import process_invitation_batches

    ids = _world(app, max_players=2, enrolled_names=["Alice", "Bob"], extra_names=["Carol"])
    with app.app_context():
        vacancy_id = _vacancy(ids["instance_id"], ids["coach_id"])
        with patch(PATCHES[0]), patch(PATCHES[1]):
            process_invitation_batches(now=datetime.utcnow())
        vacancy = db.session.get(Vacancy, vacancy_id)
        assert vacancy.status == "filled"
        assert vacancy.filled_by_player_id is None
        assert NotificationEvent.query.filter_by(vacancy_id=vacancy_id).count() == 0


def test_only_as_many_vacancies_close_as_spots_were_taken(app):
    """Rule 13: 1/3 enrolled, two structural vacancies (as many as the open spots);
    the coach adds Bob → exactly one closes, one stays open."""
    from padel_app.models import LessonInstance, Vacancy
    from padel_app.services.lesson_service import enrol

    ids = _world(app, max_players=3, enrolled_names=["Alice"], extra_names=["Bob"])
    with app.app_context():
        v1 = _vacancy(ids["instance_id"], ids["coach_id"])
        v2 = _vacancy(ids["instance_id"], ids["coach_id"])
        instance = db.session.get(LessonInstance, ids["instance_id"])
        with patch(PATCHES[0]), patch(PATCHES[1]):
            enrol(ids["bob"], instance, "coach")
        statuses = sorted(db.session.get(Vacancy, v).status for v in (v1, v2))
        assert statuses == ["filled", "open"]


def test_a_dismissed_vacancy_closes_only_when_the_class_is_full(app):
    """Rule 13 + semi-auto rule 7: a dismissed vacancy stays open on the tick while
    a spot is free; the coach add that fills the class closes it, approval kept."""
    from padel_app.models import LessonInstance, Vacancy
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import process_invitation_batches

    ids = _world(app, max_players=2, enrolled_names=["Alice", "Bob"], extra_names=["Carol"])
    with app.app_context():
        _decline(ids["instance_id"], ids["bob"])
        vacancy_id = _vacancy(
            ids["instance_id"], ids["coach_id"],
            original_player_id=ids["bob"], approval_status="dismissed",
        )
        with patch(PATCHES[0]), patch(PATCHES[1]):
            process_invitation_batches(now=datetime.utcnow())
        assert db.session.get(Vacancy, vacancy_id).status == "open"

        instance = db.session.get(LessonInstance, ids["instance_id"])
        with patch(PATCHES[0]), patch(PATCHES[1]):
            enrol(ids["carol"], instance, "coach")
        vacancy = db.session.get(Vacancy, vacancy_id)
        assert vacancy.status == "filled"
        assert vacancy.approval_status == "dismissed"
        assert vacancy.filled_by_player_id == ids["carol"]
