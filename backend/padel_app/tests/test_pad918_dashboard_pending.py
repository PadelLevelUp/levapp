"""dashboard.blocks rules 6–7 for a new-engine session (PAD-918, swap plan §3.2): the coach's
"pending confirmations" for tomorrow count the engine's open invitations, and the nudge pushes the
invitation each student already holds again."""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import _seed

#: 1 Nov 2026 is a Sunday: tomorrow's class is Monday's.
SUNDAY = datetime(2026, 11, 1, 10, 0)
MONDAY = datetime(2026, 11, 2, 20, 0)


@pytest.mark.criterion("DASHBOARD-BLOCKS-6")
def test_tomorrows_open_engine_invitations_are_pending_and_nudged(app):
    from padel_app.helpers.dashboard.pending import count_pending_confirmations, notify_pending_confirmations
    from padel_app.models import EngineInvitation
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        store, (s,), (_, open_a, open_b, answered) = _seed(app, starts=(MONDAY,), players=4)
        level = store.snapshot(s).level
        with store.unit((s,)):
            store.apply([fx.Invited(s, SUNDAY, p, frozenset({SpotType("R", level)}), None, 2,
                                    SUNDAY + timedelta(minutes=20)) for p in (open_a, open_b, answered)])
            store.apply([fx.Answered(s, SUNDAY, answered, "no", "invitation")])
        coach_id = store.coach_of(s)
        coach_user = db.session.get(Coach, coach_id).user_id
        for p in (open_a, open_b):                      # each open invitation's bubble
            msg = _send_system_message(coach_user, db.session.get(Player, int(p)).user_id, "Join?",
                                       message_type="notification_invite", push=False,
                                       msg_metadata={"engine": "new", "lessonInstanceId": int(s)})
            row = EngineInvitation.query.filter_by(lesson_instance_id=int(s), player_id=int(p)).one()
            row.message_ids = [msg.id]
        db.session.commit()

        assert count_pending_confirmations(coach_id=coach_id, now=SUNDAY) == 2
        with patch("padel_app.services.notification_service._push_message") as pushed:
            result = notify_pending_confirmations(coach_id=coach_id, now=SUNDAY)
        assert result == {"instances": 1, "sent": 2} and pushed.call_count == 2
