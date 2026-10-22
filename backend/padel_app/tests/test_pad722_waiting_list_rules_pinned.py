"""PAD-722 (PAD-669 R1 + R3, owner-confirmed): two waiting-list rules the code already keeps, pinned.

- R1: a standing (coach-wide) entry reaches every class of the coach, but a student is asked only
  for the classes whose eligibility bar they pass — checked when the invitation is sent, not when
  the entry fans out (`_waiting_list_candidates` → `evaluate_candidates(("waiting_list", 0))`).
- R3: a group-0 invitation counts toward the student's daily invitation limit like any other.

Each "not asked" cell sits beside one that is (R-032).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad446_waiting_list_group_zero import NOW, _entry, _invites, _io, _seed, _standing, _trigger


def _second_class(instance_id, coach_id, *, level_id=None):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance

    a = db.session.get(LessonInstance, instance_id)
    b = LessonInstance(lesson_id=a.lesson_id, start_datetime=a.start_datetime + timedelta(days=7),
                       end_datetime=a.end_datetime + timedelta(days=7), max_players=a.max_players,
                       status="scheduled", level_id=level_id or a.level_id, notifications_enabled=True)
    db.session.add(b)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=b.id))
    db.session.commit()
    return b.id


@pytest.mark.parametrize("eligible", [True, False])
def test_a_standing_student_is_asked_only_where_they_pass_the_bar(app, monkeypatch, eligible):
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
        config.eligibility_rules = [{"attribute": "level", "operation": "same_as_class"}]
        other_level = CoachLevel(coach_id=coach_id, label="A", code="A1", display_order=0)
        db.session.add(other_level)
        db.session.commit()
        if not eligible:
            from padel_app.models.lesson_instances import LessonInstance

            db.session.get(LessonInstance, instance_id).level_id = other_level.id  # Bea is B1
            db.session.commit()
        standing = _standing(coach_id, bea, NOW - timedelta(days=1))
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)  # the fanned row
        _trigger(instance_id, coach_id)
        asked_from_list = [p for p, round_number in _invites(instance_id) if round_number == 0]
        assert asked_from_list == ([bea] if eligible else [])


@pytest.mark.parametrize("limit,asked_again", [(1, False), (2, True)])
def test_a_waiting_list_invitation_counts_toward_the_daily_limit(app, monkeypatch, limit, asked_again):
    """Bea is asked from class A's waiting list. With a daily limit of 1 that was her invitation for
    the day: class B's groups do not ask her. With 2, they do."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
        config.restrictions = {**config.restrictions,
                               "maxInvitesPerStudentPerDay": {"enabled": True, "value": limit}}
        db.session.commit()
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1))
        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(bea, 0)]
        other = _second_class(instance_id, coach_id)
        _trigger(other, coach_id)
        assert (bea in [p for p, _ in _invites(other)]) is asked_again
