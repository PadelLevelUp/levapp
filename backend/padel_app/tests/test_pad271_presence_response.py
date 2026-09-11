"""PAD-271 (audit M5): one presence response field — attendance.presence rule 7.

Decided 2026-09-11 (coordinator, owner informed): the `response` /
`responded_at` / `recorded_by` columns land in phase 1 (migration 7558c350c002);
`late_cancellation` is derived; the legacy booleans stay as shadow columns until
phase 2 moves the readers and both shells to `response`.
"""
from datetime import datetime
from unittest.mock import patch

import pytest

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

def _world(app):
    with app.app_context():
        coach = _create_coach(_create_user("Coach", "coach-271m5"))
        level = _create_level(coach)
        alice = _create_player(_create_user("Alice", "alice-271m5"))
        _create_coach_player(coach, alice, level)
        instance = _create_instance(coach, level, enrolled_players=[alice], max_players=2)
        _seed_notification_config(coach.id)
        return {"coach_id": coach.id, "instance_id": instance.id, "alice": alice.id,
                "alice_user": alice.user_id}


def _presence(ids):
    from padel_app.models import Presence
    return Presence.query.filter_by(lesson_instance_id=ids["instance_id"], player_id=ids["alice"]).one()


def test_a_reminder_yes_writes_response_confirmed_by_the_student(app):
    from padel_app.services.notification_service import respond_to_reminder

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(ids["instance_id"], "yes", ids["alice_user"])
        p = _presence(ids)
        assert p.response == "confirmed"
        assert p.recorded_by == "student"
        assert p.responded_at is not None
        assert p.status is None, "the coach's record is untouched"


def test_a_reminder_no_writes_response_declined(app):
    from padel_app.services.notification_service import respond_to_reminder

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(ids["instance_id"], "no", ids["alice_user"])
        p = _presence(ids)
        assert p.response == "declined"
        assert p.recorded_by == "student"


def test_a_cancel_writes_response_cancelled_and_a_proactive_decline_its_own_value(app):
    from padel_app.services.notification_service import cancel_attendance

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            out = cancel_attendance(ids["alice_user"], lesson_instance_id=ids["instance_id"])
        p = _presence(ids)
        assert p.response == ("proactive_decline" if out["proactive"] else "cancelled")
        assert p.recorded_by == "student"


def test_the_coach_attendance_mark_never_moves_response(app):
    from padel_app.services.lesson_service import add_presences

    ids = _world(app)
    with app.app_context():
        from padel_app.models import LessonInstance
        instance = db.session.get(LessonInstance, ids["instance_id"])
        p = _presence(ids)
        p.response = "confirmed"
        db.session.commit()
        add_presences(instance, [{"playerId": ids["alice"], "status": "absent", "justification": "unjustified"}])
        p = _presence(ids)
        assert p.status == "absent" and p.validated is True
        assert p.response == "confirmed", "was-there and intends-to-come are separate facts"
        assert p.recorded_by == "coach"


def test_the_payload_carries_the_answer_and_phase_1_keeps_the_shadow_booleans(app):
    """Phase 1 (decided 2026-09-11): `response` / `respondedAt` / `recordedBy` are
    served; `invited` / `confirmed` are still the stored shadow columns. Phase 2
    derives them from `response` and drops them."""
    from padel_app.serializers.presence import serialize_presence
    from padel_app.services.presence_response import record_response

    ids = _world(app)
    with app.app_context():
        p = _presence(ids)
        record_response(p, "declined", when=datetime(2026, 9, 11, 9, 0))
        db.session.commit()
        out = serialize_presence(_presence(ids))
        assert out["response"] == "declined"
        assert out["respondedAt"] == "2026-09-11T09:00:00"
        assert out["recordedBy"] == "student"
        assert out["lateCancellation"] is False, "a plain decline is never late"
        assert out["invited"] is True and out["confirmed"] is False, "phase 1: stored shadow flags"


@pytest.mark.parametrize(
    "flags, expected",
    [
        (dict(status="absent", justification="justified", validated=False, confirmed=True, late_cancellation=False), "declined"),
        (dict(status="absent", justification="justified", validated=False, confirmed=True, late_cancellation=True), "cancelled"),
        (dict(status=None, confirmed=True, validated=False), "confirmed"),
        (dict(status="absent", validated=True, confirmed=False), "none"),
        (dict(status=None, confirmed=False, validated=False), "none"),
    ],
)
def test_backfill_maps_the_legacy_flags_to_one_response(app, flags, expected):
    """attendance.presence rule 7: the migration's mapping, checked row by row."""
    from padel_app.services.presence_response import response_from_legacy_flags

    assert response_from_legacy_flags(**flags) == expected
