"""notifications.engine-store rule 4 (STORE-22): the class's level the engine reads is the occurrence's
effective level, its own when set, else its lesson's default level.

A normal recurring occurrence has no level of its own (``LessonInstance.level_id`` NULL): it inherits
the lesson's. The store used to hand the engine that raw NULL, so the engine read every such class as
having no level and applied no level rule, and level-based groups collapsed into one.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_engine_switch import LATER, NOW, QUIET, _instance
from padel_app.tests.test_switch_keeps_lists import _snapshot, _switchable


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        patches = [patch(target) for target in QUIET]
        for p in patches:
            p.start()
        pin_clock(monkeypatch, NOW)
        yield
        for p in patches:
            p.stop()


def _inheriting(app):
    """A coach on the old engine with a two-rung ladder (N2 above N3) and one future occurrence whose own
    level is NULL and whose lesson's default level is N3. Students: the regular and ``same`` at N3,
    ``above`` at N2 (one level better than the class). Returns (coach id, session, same, above, positions)."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.services.level_ladder import ladder_index_map

    coach_id, (session,), (_, same, above) = _switchable(app, players=3, capacity=4)
    inst = _instance(session)
    n3 = inst.lesson.default_level_id
    n2 = CoachLevel(coach_id=coach_id, label="N2", code="N2", display_order=2)
    db.session.add(n2)
    db.session.flush()
    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=above).one().level_id = n2.id
    inst.level_id = None                                  # inherits the lesson's level, as a recurring one does
    db.session.commit()
    ladder = ladder_index_map(coach_id)
    return coach_id, session, str(same), str(above), (ladder[n2.id] + 1, ladder[n3] + 1)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-22")
def test_an_inherited_level_reaches_the_engine_at_adoption_and_in_every_snapshot(app):
    from padel_app.services.engine_store import TableStore
    from padel_app.services.engine_switch import engine_for, switch_coach

    coach_id, session, same, above, (n2, n3) = _inheriting(app)
    assert (n2, n3) == (1, 2)
    assert _instance(session).level_id is None

    with patch.object(TableStore, "add_session", autospec=True, side_effect=TableStore.add_session) as add:
        switch_coach(coach_id, now=NOW)
    db.session.expire_all()

    assert engine_for(_instance(session)) == "new"
    adopted = [c.args for c in add.call_args_list if c.args[1] == session]
    assert len(adopted) == 1
    assert adopted[0][2] == n3                            # the level adoption hands the store: the lesson's
    for at in (NOW, LATER - timedelta(hours=23), LATER - timedelta(hours=1)):
        snap = _snapshot(session, at)
        assert snap.level == n3
        assert {s.id: s.level for s in snap.pool} == {same: n3, above: n2}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-22")
def test_an_inherited_level_keeps_the_level_groups_in_order(app):
    from padel_app.invitation_engine.planner import spot_counts, spot_types, tier_for
    from padel_app.invitation_engine.settings import EngineSettings, Tier
    from padel_app.services.engine_switch import switch_coach

    coach_id, session, same, above, (n2, n3) = _inheriting(app)
    switch_coach(coach_id, now=NOW)
    db.session.expire_all()

    # The coach's groups: the class's level first, one level better second.
    settings = EngineSettings(tiers=(Tier("pool", "any", 0), Tier("pool", "any", 1)))
    snap = _snapshot(session, LATER - timedelta(hours=23))
    counts = spot_counts(snap, settings)
    spot_type = next(t for t, n in spot_types(snap, counts) if n)
    students = {s.id: s for s in snap.pool}
    assert tier_for(students[same], spot_type, counts, snap, settings) == 0
    assert tier_for(students[above], spot_type, counts, snap, settings) == 1   # not asked with the same-level ones


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-23")
def test_state_stored_with_no_level_reads_as_the_sessions_level(app):
    """The transition: a session adopted before the fix holds spot types stored with no level."""
    from padel_app.invitation_engine import effects as fx
    from padel_app.invitation_engine.planner import decide, spot_types
    from padel_app.invitation_engine.settings import EngineSettings, Tier
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.models import EngineSession
    from padel_app.services.engine_store import TableStore, _encode
    from padel_app.services.engine_switch import switch_coach

    coach_id, session, same, above, (n2, n3) = _inheriting(app)
    switch_coach(coach_id, now=NOW)
    db.session.expire_all()
    at = LATER - timedelta(hours=23)

    def unlevelled(spot_type):
        return SpotType(spot_type.side, None)

    def stored(**columns):
        es = db.session.get(EngineSession, int(session))
        es.alerted, es.pending, es.dismissed_groups = [], [], []
        for name, value in columns.items():
            setattr(es, name, value)
        db.session.commit()
        db.session.expire_all()
        return _snapshot(session, at)

    def kinds(effects, *types):
        return [type(e).__name__ for e in effects if isinstance(e, types)]

    # A coach alert ("no candidate": no group takes anyone) stored with no level.
    nobody = EngineSettings(tiers=(Tier("pool", "any", 5),))
    snap = stored()
    alerts = [e for e in decide(snap, nobody, at).effects if isinstance(e, fx.CoachAlert)]
    assert alerts and all(e.spot_type.level == n3 for e in alerts)
    snap = stored(alerted=[[e.spot_type.side, None, e.spots] for e in alerts])
    assert kinds(decide(snap, nobody, at).effects, fx.CoachAlert, fx.AlertCleared) == []

    # A dismissed group whose spot counts were stored with no level.
    semi = EngineSettings(tiers=(Tier("pool", "any", 0), Tier("pool", "any", 1)), invitation_mode="semi_automatic")
    snap = stored()
    counts = [[_encode(unlevelled(t)), n] for t, n in spot_types(snap)]
    snap = stored(dismissed_groups=[[0, counts]])
    assert kinds(decide(snap, semi, at).effects, fx.GroupReopened) == []

    # A pending approval request whose queues were stored with no level.
    snap = stored()
    asks = [e for e in decide(snap, semi, at).effects if isinstance(e, fx.ApprovalRequest)]
    assert asks
    pending = [{"tier": e.tier, "request": e.request, "message_id": None,
                "queues": _encode(tuple((unlevelled(t), ids) for t, ids in e.queues))} for e in asks]
    snap = stored(pending=pending)
    assert kinds(decide(snap, semi, at).effects, fx.ApprovalRequest, fx.ApprovalWithdrawn) == []

    # An alert raised again for a new count replaces the one stored with no level.
    snap = stored(alerted=[[e.spot_type.side, None, e.spots + 1] for e in alerts])
    store = TableStore(clock=lambda: at)
    again = [e for e in decide(snap, nobody, at).effects if isinstance(e, (fx.CoachAlert, fx.AlertCleared))]
    with store.unit((session,)):
        store.apply(again)
    db.session.expire_all()
    assert {tuple(a) for a in db.session.get(EngineSession, int(session)).alerted} == {
        (e.spot_type.side, n3, e.spots) for e in alerts}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-24")
def test_the_card_and_the_admin_coverage_read_a_no_level_spot_type_at_the_sessions_level(app):
    """The transition outside the snapshot: an approval request queued before the fix and sent after, and
    the admin coverage of invitations offered before the fix."""
    from types import SimpleNamespace

    from padel_app.invitation_engine.planner import spot_types
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.services.admin.engine_health import _level_names, _open_spots
    from padel_app.services.engine_outbox import card
    from padel_app.services.engine_switch import switch_coach

    coach_id, session, same, above, (n2, n3) = _inheriting(app)
    switch_coach(coach_id, now=NOW)
    db.session.expire_all()
    at = LATER - timedelta(hours=23)
    types = [t for t, n in spot_types(_snapshot(session, at)) if n]
    assert types and all(t.level == n3 for t in types)

    def row(level):
        queues = [[[t.side, level], [same, above]] for t in types]
        return SimpleNamespace(lesson_instance_id=int(session), payload={"request": "r", "tier": 0, "queues": queues})

    levelled = card(row(n3))
    assert all(t["count"] > 0 and t["levelLabel"] == "N3" for t in levelled["spotTypes"])
    assert card(row(None)) == levelled

    def offers(level):
        return [SimpleNamespace(session=int(session), tier=0, counting=True,
                                offer_types={SpotType(t.side, level) for t in types})]

    names = _level_names(coach_id)
    _, uncovered_levelled = _open_spots(session, coach_id, names, offers(n3), at)
    _, uncovered_no_level = _open_spots(session, coach_id, names, offers(None), at)
    assert uncovered_no_level == uncovered_levelled
