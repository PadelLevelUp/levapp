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
