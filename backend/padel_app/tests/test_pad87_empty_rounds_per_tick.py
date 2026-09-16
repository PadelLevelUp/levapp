"""PAD-87 — empty invitation groups advance one round per engine tick
(notifications.invitations rule 3c), never all at once.

Before: `_send_invitation_batch` → no candidates → `_advance_round` →
`_send_invitation_batch` … synchronously, so with 8 groups of which the first
7 were empty the 8th group was notified in the same call as the trigger.
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
)

LEVEL_RULE = [{"attribute": "level", "operation": "same_as_vacancy"}]
EMPTY_THEN_EVERYONE = [{"id": str(i), "rules": LEVEL_RULE} for i in range(1, 8)] + [{"id": "8", "rules": []}]
ALL_EMPTY = [{"id": str(i), "rules": LEVEL_RULE} for i in range(1, 9)]


def _seed(app, groups, suffix):
    """A class at level B1 with one open spot; the only roster player is at a
    different level, so any `level same_as_vacancy` group is empty."""
    from padel_app.models.notification_config import NotificationConfig
    cu = _create_user("Coach", f"coach-87-{suffix}")
    coach = _create_coach(cu)
    class_level = _create_level(coach, label="Beg", code="B1")
    other_level = _create_level(coach, label="Adv", code="A1")
    pu = _create_user("Player", f"player-87-{suffix}")
    player = _create_player(pu)
    _create_coach_player(coach, player, level=other_level)
    instance = _create_instance(coach, class_level, max_players=1)
    cfg = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True, invitation_groups=groups)
    db.session.add(cfg)
    db.session.commit()
    return coach, instance


def _events(vacancy_id):
    from padel_app.models import NotificationEvent
    return NotificationEvent.query.filter_by(vacancy_id=vacancy_id).all()


def test_seven_empty_groups_reach_the_eighth_one_tick_at_a_time(app):
    from padel_app.models import Vacancy
    from padel_app.services.notification_service import (
        process_invitation_batches, trigger_invitations,
    )
    with app.app_context():
        coach, instance = _seed(app, EMPTY_THEN_EVERYONE, "a")
        t0 = datetime.utcnow()
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            notified = trigger_invitations(instance, coach.id, now=t0)
            vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).one()

            # The trigger itself sends nothing and stops after ONE advance.
            assert notified == []
            assert vacancy.current_round_number == 2
            assert vacancy.last_activity_at is not None
            assert _events(vacancy.id) == []

            # Ticks 1..6 each advance exactly one round, still sending nothing.
            for tick in range(1, 7):
                process_invitation_batches(now=t0 + timedelta(minutes=2 * tick))
                db.session.refresh(vacancy)
                assert vacancy.current_round_number == 2 + tick, f"tick {tick}"
                assert _events(vacancy.id) == [], f"tick {tick} must not invite"
                assert vacancy.status == "open"

            # Tick 7 runs round 8 (open to everyone): the invitation goes out.
            process_invitation_batches(now=t0 + timedelta(minutes=14))
            db.session.refresh(vacancy)
            events = _events(vacancy.id)
            assert [e.round_number for e in events] == [8]
            assert vacancy.status == "open"


def test_all_empty_groups_expire_after_the_last_tick_without_inviting(app):
    from padel_app.models import Vacancy
    from padel_app.services.notification_service import (
        process_invitation_batches, trigger_invitations,
    )
    with app.app_context():
        coach, instance = _seed(app, ALL_EMPTY, "b")
        t0 = datetime.utcnow()
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            trigger_invitations(instance, coach.id, now=t0)
            vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id).one()
            for tick in range(1, 9):
                process_invitation_batches(now=t0 + timedelta(minutes=2 * tick))
                db.session.refresh(vacancy)
                if vacancy.status == "expired":
                    break
            assert vacancy.status == "expired"
            assert tick == 7, "eight empty groups: round counter passes 8 on the 7th tick after the trigger's own advance"
            assert _events(vacancy.id) == []
