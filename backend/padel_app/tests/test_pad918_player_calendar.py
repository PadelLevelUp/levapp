"""Swap plan §3.2 (PAD-918): the student's calendar shows a new-engine class they hold an open
invitation to as `invited`, as it does an old-engine one; a sorry is not an open invitation."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_an_open_engine_invitation_shows_on_the_students_calendar(app):
    from padel_app.helpers.calendar_helpers import load_relation_events_for_player

    with app.app_context():
        store, (s,), (_, invited, sorry) = _seed(app, starts=(START + timedelta(days=2),))
        level = store.snapshot(s).level
        with store.unit((s,)):
            store.apply([fx.Invited(s, NOW, p, frozenset({SpotType("R", level)}), None, 2, NOW + timedelta(minutes=20))
                         for p in (invited, sorry)])
            store.apply([fx.Sorry(s, NOW, sorry)])

        def relations(player):
            events = load_relation_events_for_player(int(player), NOW, NOW + timedelta(days=7), now=NOW)
            return [e["studentRelation"] for e in events]

        assert relations(invited) == ["invited"]
        assert relations(sorry) == []
