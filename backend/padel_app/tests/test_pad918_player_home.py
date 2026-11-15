"""dashboard.blocks new-engine reading (PAD-918, swap plan §3.2): a student's open new-engine
invitation is a `vacancy_invite` on their home, keyed by `invitationId` (the answer route's key)."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.mark.criterion("DASHBOARD-BLOCKS-54")
def test_an_open_engine_invitation_is_the_students_vacancy_invite(app):
    from padel_app.helpers.dashboard.player_home import _vacancy_invite_items
    from padel_app.models import EngineInvitation

    with app.app_context():
        store, (s,), (_, invited, answered) = _seed(app, starts=(START + timedelta(days=2),))
        level = store.snapshot(s).level
        with store.unit((s,)):
            store.apply([fx.Invited(s, NOW, p, frozenset({SpotType("R", level)}), None, 2, NOW + timedelta(minutes=20))
                         for p in (invited, answered)])
            store.apply([fx.Answered(s, NOW, answered, "no", "invitation")])
        row = EngineInvitation.query.filter_by(player_id=int(invited)).one()

        items = _vacancy_invite_items(player_id=int(invited), now=NOW)
        assert [(i["kind"], i["id"], i["invitationId"], i["lessonInstanceId"]) for i in items] == [
            ("vacancy_invite", f"invitation-{row.id}", row.id, int(s))]
        assert "notificationEventId" not in items[0]
        assert _vacancy_invite_items(player_id=int(answered), now=NOW) == []
