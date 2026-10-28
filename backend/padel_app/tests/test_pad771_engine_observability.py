"""
PAD-771 (engine half): on prod, spot 1189 ran its eight invitation groups in 14 minutes with nobody
invited and expired, and it could not be explained afterwards. The engine logged nothing about an
empty round, the coach's configuration keeps no history, and two rollouts erased the container logs.

invitations rule 3d: an empty round logs one INFO line with the stage counts of its wave (stage names
and counts only). config rule 16: a save that changes the invitation groups, the eligibility rules or
the invitation start writes one `notification_config_changes` row per changed key, before and after.
"""
import logging
import re
from datetime import datetime
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
)

LEVEL_RULE = [{"attribute": "level", "operation": "same_as_vacancy"}]


def _seed_empty_round():
    """A class at level B1 with one free place of two. The roster: one student enrolled in the class
    and one at another level, so a `level same_as_vacancy` group admits nobody."""
    from padel_app.models.notification_config import NotificationConfig

    coach = _create_coach(_create_user("Coach", "coach-771"))
    class_level = _create_level(coach, label="Beg", code="B1")
    other_level = _create_level(coach, label="Adv", code="A1")
    enrolled = _create_player(_create_user("Enrolled Student", "student-771-in"))
    elsewhere = _create_player(_create_user("Other Level Student", "student-771-out"))
    _create_coach_player(coach, enrolled, level=class_level)
    _create_coach_player(coach, elsewhere, level=other_level)
    instance = _create_instance(coach, class_level, enrolled_players=(enrolled,), max_players=2)
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True,
        invitation_groups=[{"id": "1", "rules": LEVEL_RULE}, {"id": "2", "rules": LEVEL_RULE}],
    ))
    db.session.commit()
    return coach, instance, (enrolled, elsewhere)


def _empty_round_lines(caplog):
    return [r for r in caplog.records if r.getMessage().startswith("empty round:")]


def test_an_empty_round_logs_its_stage_counts_and_no_student(app, caplog):
    from padel_app.models import NotificationEvent, Vacancy
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context():
        coach, instance, students = _seed_empty_round()
        caplog.set_level(logging.INFO)
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            trigger_invitations(instance, coach.id, now=datetime.utcnow())

        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).one()
        assert vacancy.current_round_number == 2
        assert NotificationEvent.query.filter_by(vacancy_id=vacancy.id).count() == 0

        (record,) = _empty_round_lines(caplog)
        assert record.levelno == logging.INFO
        message = record.getMessage()
        assert message == (
            f"empty round: vacancy {vacancy.id} round 1 stages "
            "{'already_enrolled': 1, 'no_round_matched': 1}"
        )
        for student in students:
            assert student.user.name not in message
            assert student.user.username not in message


def test_a_round_that_invites_logs_no_empty_round_line(app, caplog):
    from padel_app.models import NotificationEvent, Vacancy
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context():
        coach, instance, _ = _seed_empty_round()
        NotificationConfig.query.filter_by(coach_id=coach.id).one().invitation_groups = [
            {"id": "1", "rules": []},
        ]
        db.session.commit()
        caplog.set_level(logging.INFO)
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            trigger_invitations(instance, coach.id, now=datetime.utcnow())

        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).one()
        assert NotificationEvent.query.filter_by(vacancy_id=vacancy.id).count() == 1
        assert _empty_round_lines(caplog) == []


# --- config rule 16 -----------------------------------------------------------------------------


def _coach_with_config(**columns):
    from padel_app.models.notification_config import NotificationConfig

    coach = _create_coach(_create_user("Coach", f"coach-771-cfg-{len(columns)}-{id(columns)}"))
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True, **columns))
    db.session.commit()
    return coach


def _changes(coach_id):
    from padel_app.models.notification_config_change import NotificationConfigChange

    return NotificationConfigChange.query.filter_by(coach_id=coach_id).order_by(
        NotificationConfigChange.id
    ).all()


def test_a_saved_invitation_start_is_recorded_and_a_template_is_not(app):
    from padel_app.services.notification_service import update_config

    with app.app_context():
        coach = _coach_with_config(
            invitation_start_type="days_before_at_time", invitation_start_value=7,
            invitation_start_time="19:00",
        )
        with patch("padel_app.scheduler.reschedule_all_future_jobs"):
            update_config(coach.id, {
                "invitationStartTiming": {"type": "days_before_at_time", "days": 2, "time": "19:00"},
                "messageTemplates": {"pt": {"reminder_declined": "Combinado."}},
            })

        (row,) = _changes(coach.id)
        assert (row.key, row.before, row.after) == ("invitation_start_value", 7, 2)
        assert row.changed_at is not None


def test_groups_and_rules_record_their_before_and_after(app):
    from padel_app.services.notification_service import update_config

    old_groups = [{"id": "1", "rules": LEVEL_RULE}]
    new_groups = [{"id": "1", "rules": []}]
    new_rules = [{"attribute": "level", "operation": "within_n_above_class", "value": 2}]
    with app.app_context():
        coach = _coach_with_config(invitation_groups=old_groups)
        update_config(coach.id, {"invitationGroups": new_groups, "eligibilityRules": new_rules})

        rows = {r.key: (r.before, r.after) for r in _changes(coach.id)}
        assert rows == {
            "invitation_groups": (old_groups, new_groups),
            "eligibility_rules": (None, new_rules),
        }


def test_a_save_that_changes_nothing_recorded_writes_nothing(app):
    from padel_app.services.notification_service import update_config

    groups = [{"id": "1", "rules": LEVEL_RULE}]
    rules = [{"attribute": "level", "operation": "within_n_above_class", "value": 2}]
    with app.app_context():
        coach = _coach_with_config(invitation_groups=groups, eligibility_rules=rules)
        update_config(coach.id, {"invitationGroups": groups, "eligibilityRules": rules,
                                 "autoNotifyEnabled": False})

        assert _changes(coach.id) == []


def test_a_refused_save_records_nothing(app):
    from werkzeug.exceptions import BadRequest

    from padel_app.services.notification_service import update_config

    with app.app_context():
        coach = _coach_with_config(invitation_groups=[{"id": "1", "rules": LEVEL_RULE}])
        try:
            update_config(coach.id, {
                "invitationGroups": [{"id": "1", "rules": []}],
                "eligibilityRules": "not a list",
            })
        except BadRequest:
            db.session.rollback()
        else:
            raise AssertionError("an invalid eligibilityRules must be refused")

        assert _changes(coach.id) == []


def test_the_rows_hold_no_student_name():
    """Rule 16: rules and timings only. The recorded keys are a closed list."""
    from padel_app.services.notification_service import RECORDED_CONFIG_KEYS

    assert RECORDED_CONFIG_KEYS == (
        "invitation_groups", "eligibility_rules",
        "invitation_start_type", "invitation_start_value", "invitation_start_time",
    )
    assert not any(re.search("player|student|excluded", key) for key in RECORDED_CONFIG_KEYS)
