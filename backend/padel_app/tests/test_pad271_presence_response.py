"""PAD-271 (audit M5): one presence response field — attendance.presence rule 7.

HELD: the `response` / `responded_at` / `recorded_by` columns and their migration
wait for the owner's answers to decisions 6-8 (2026-09-11). The tests are the
contract, written now so the shape is on record; they are skipped, not red,
until the column exists.
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

HELD = "PAD-271 M5 held: column and migration wait for the owner's decisions 6-8 (2026-09-11)"


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


@pytest.mark.skip(reason=HELD)
def test_a_reminder_yes_writes_response_confirmed_by_the_student(app):
    from padel_app.services.notification_service import respond_to_reminder

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(ids["instance_id"], ids["alice_user"], "yes")
        p = _presence(ids)
        assert p.response == "confirmed"
        assert p.recorded_by == "student"
        assert p.responded_at is not None
        assert p.status is None, "the coach's record is untouched"


@pytest.mark.skip(reason=HELD)
def test_a_reminder_no_writes_response_declined(app):
    from padel_app.services.notification_service import respond_to_reminder

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(ids["instance_id"], ids["alice_user"], "no")
        p = _presence(ids)
        assert p.response == "declined"
        assert p.recorded_by == "student"


@pytest.mark.skip(reason=HELD)
def test_a_cancel_writes_response_cancelled_and_a_proactive_decline_its_own_value(app):
    from padel_app.services.notification_service import cancel_attendance

    ids = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            out = cancel_attendance(ids["alice_user"], lesson_instance_id=ids["instance_id"])
        p = _presence(ids)
        assert p.response == ("proactive_decline" if out["proactive"] else "cancelled")
        assert p.recorded_by == "student"


@pytest.mark.skip(reason=HELD)
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


@pytest.mark.skip(reason=HELD)
def test_legacy_booleans_are_derived_from_response_on_read(app):
    from padel_app.serializers.presence import serialize_presence

    ids = _world(app)
    with app.app_context():
        p = _presence(ids)
        p.response = "declined"
        db.session.commit()
        out = serialize_presence(_presence(ids))
        assert out["invited"] is True
        assert out["confirmed"] is True, "confirmed = response != none"


@pytest.mark.skip(reason=HELD)
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
