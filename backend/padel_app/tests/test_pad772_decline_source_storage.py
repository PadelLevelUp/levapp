"""PAD-772 wave 1: storage for CALENDAR-STUDENT-BLOCKERS-19 and ATTENDANCE-CONFIRM-42 — the nullable
`presences.decline_source`, its constant and the serialized `declineSource`. No criterion turns green
here; this pins the column, the CHECK and the key."""
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db


def _presence(app):
    from padel_app.models import Lesson, LessonInstance, Player, Presence, User

    with app.app_context():
        user = User(name="Ana", username="p772_s", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        from padel_app.models.clubs import Club

        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        lesson = Lesson(title="T", start_datetime=datetime(2026, 12, 2, 19), end_datetime=datetime(2026, 12, 2, 20),
                        is_recurring=False, type="academy", max_players=4, color="#000", status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=lesson.start_datetime, end_datetime=lesson.end_datetime,
                              max_players=4, status="scheduled", notifications_enabled=True)
        db.session.add(inst)
        db.session.flush()
        presence = Presence(lesson_instance_id=inst.id, player_id=player.id)
        db.session.add(presence)
        db.session.commit()
        return presence.id


def test_the_constant_is_the_specs(app):
    from padel_app.models.presences import DECLINE_SOURCE_AVAILABILITY_BLOCK

    assert DECLINE_SOURCE_AVAILABILITY_BLOCK == "availability_block"


def test_the_column_is_nullable_checked_and_serialized(app):
    from padel_app.models import Presence
    from padel_app.serializers.presence import serialize_presence

    pid = _presence(app)
    with app.app_context():
        presence = Presence.query.get(pid)
        assert presence.decline_source is None
        assert serialize_presence(presence)["declineSource"] is None
        presence.decline_source = "availability_block"
        db.session.commit()
        assert serialize_presence(Presence.query.get(pid))["declineSource"] == "availability_block"
        presence.decline_source = "something_else"
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
