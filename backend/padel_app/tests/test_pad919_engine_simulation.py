"""PAD-919: the invite simulation and the replacement approval on the new engine (swap plan §4, §8
step 7; notifications.invite-simulation and semi-auto-approval, new-engine sections).

A session the new engine runs (an ``engine_sessions`` row) answers the tutorial from the engine's own
dry run (``planner.evaluate``) on a hypothetical snapshot, and its approval is the session's
``ApprovalRequest``. The sessions are seeded through the table store's own test helper.
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import planner
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import START, _seed

PLAN_AT = START - timedelta(hours=6)            # inside the default window, outside quiet hours


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _rows():
    from padel_app.models import EngineEffect, EngineInvitation
    from padel_app.models.presences import Presence
    from padel_app.models.waiting_list_entry import WaitingListEntry

    return (EngineEffect.query.count(), EngineInvitation.query.count(), Presence.query.count(),
            WaitingListEntry.query.count())


@pytest.mark.criterion("NOTIFICATIONS-INVITE-SIMULATION-19")
def test_the_simulation_runs_the_engines_dry_run_and_writes_nothing(app):
    """TIERS-9: the verdicts and queues are ``planner.evaluate``'s on the hypothetical snapshot, per
    student per open spot type, through the same ``simulate_vacancy`` the endpoint calls; nothing is
    written."""
    from padel_app.services.engine_simulation import hypothetical_snapshot
    from padel_app.services.engine_store import TableStore
    from padel_app.services.invite_simulation_service import simulate_vacancy

    store, (a,), (reg, x, y) = _seed(app, players=3)
    coach_id = store.coach_of(a)
    before = _rows()
    sim = simulate_vacancy(_instance(a), coach_id, int(reg), now=PLAN_AT)
    assert _rows() == before

    dry = planner.evaluate(hypothetical_snapshot(TableStore(clock=lambda: PLAN_AT), a, reg), EngineSettings(), PLAN_AT)
    expected = {((v.spot_type.side, v.spot_type.level), v.student): (v.stage, v.tier) for v in dry.verdicts}
    got = {((t["side"], t["level"]), v["playerId"]): (v["stage"], v["tier"]) for t in sim["spotTypes"] for v in t["verdicts"]}
    assert got == expected and expected
    assert {(t["side"], t["level"]): [q["playerId"] for q in t["queue"]] for t in sim["spotTypes"]} == {
        (st.side, st.level): list(q) for st, q in dry.queues.items()}
    assert sim["engine"] == "new" and "rounds" not in sim


@pytest.mark.criterion("NOTIFICATIONS-INVITE-SIMULATION-20")
def test_the_leaver_is_not_going_in_the_hypothetical_snapshot(app):
    """The departing student is no longer going; a regular counts as absent, as their No would leave
    them; an invitee simply leaves; the store's own snapshot is unchanged."""
    from padel_app.services.engine_simulation import hypothetical_snapshot

    store, (a,), (reg, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([fx.Placed(a, PLAN_AT, x, "L", "invitation")])
    as_regular = hypothetical_snapshot(store, a, reg)
    assert reg not in {p.student for p in as_regular.going} and reg in as_regular.absent
    as_invitee = hypothetical_snapshot(store, a, x)
    assert x not in {p.student for p in as_invitee.going} and x not in as_invitee.absent
    assert {p.student for p in store.snapshot(a).going} == {reg, x}


@pytest.mark.criterion("NOTIFICATIONS-INVITE-SIMULATION-21")
def test_a_student_out_of_the_pool_is_explained_by_the_apps_gate(app):
    """``not_in_pool`` carries the caller's reasons, from the same gates the store builds the pool
    with: excluded for the session, ``excludedPlayers``, the student's own block, and the eligibility
    bar's structured failures."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.services.engine_simulation import simulate

    store, (a,), (reg, session_out, listed_out, blocker, unranked, free) = _seed(app, players=6)
    coach_id = store.coach_of(a)
    with store.unit((a,)):
        store.exclude(a, session_out)
    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, eligibility_rules=[
        {"attribute": "level", "operation": "within_n_above_class", "value": 0}])
    config.restrictions = {"excludedPlayers": {"enabled": True, "playerIds": [listed_out]},
                           "noSameDayClass": {"enabled": False}}
    db.session.add(config)
    db.session.get(User, db.session.get(Player, int(blocker)).user_id).notif_block_all = True
    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(unranked)).one().level_id = None
    db.session.commit()

    sim = simulate(_instance(a), coach_id, reg, now=PLAN_AT)
    for t in sim["spotTypes"]:
        out = {v["playerId"]: [r["code"] for r in v["reasons"]] for v in t["verdicts"] if v["stage"] == "not_in_pool"}
        assert out == {session_out: ["excluded_for_session"], listed_out: ["excluded_players"],
                       blocker: ["blocks_all"], unranked: ["eligibility"]}
        eligibility = next(v for v in t["verdicts"] if v["playerId"] == unranked)["reasons"][0]
        assert eligibility["failures"] and eligibility["failures"][0]["attribute"] == "level"
        assert free in {v["playerId"] for v in t["verdicts"] if v["stage"] != "not_in_pool"}


@pytest.mark.criterion("NOTIFICATIONS-INVITE-SIMULATION-22")
def test_the_gates_are_the_dry_runs_may_plan(app):
    """The gates are the store's listing (the coach's and the class's switches) and the dry run's "may
    plan now": the invitation window, quiet hours, ``last_invite_before``, and a class already started.
    There is no ``max_total_reached``."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_simulation import simulate

    store, (a,), (reg, _, _) = _seed(app)
    inst = _instance(a)

    def codes(now):
        return [g["code"] for g in simulate(inst, store.coach_of(a), reg, now=now)["gates"]]

    assert codes(PLAN_AT) == ["auto_notify_disabled"]
    db.session.add(NotificationConfig(coach_id=store.coach_of(a), auto_notify_enabled=True))
    db.session.commit()
    assert codes(PLAN_AT) == []
    assert codes(START - timedelta(days=3)) == ["invitation_window"]
    assert codes(START - timedelta(hours=1)) == ["last_invite_before"]
    assert codes(START.replace(hour=3)) == ["quiet_hours"]
    assert codes(START + timedelta(minutes=1)) == ["class_over"]
    inst.auto_invites = False
    db.session.commit()
    assert codes(PLAN_AT) == ["class_auto_invites_off"]


@pytest.mark.criterion("NOTIFICATIONS-INVITE-SIMULATION-23")
def test_explain_gives_one_entry_per_open_spot_type(app):
    """Explaining one student gives their verdict for each open spot type of the simulation: a class
    of four with one regular on the left has a left and a right type."""
    from padel_app.services.engine_simulation import explain, simulate

    store, (a,), (reg, x, _) = _seed(app)
    coach_id = store.coach_of(a)
    sim = simulate(_instance(a), coach_id, None, now=PLAN_AT)
    out = explain(_instance(a), coach_id, None, x, now=PLAN_AT)
    assert [(e["side"], e["level"]) for e in out["spotTypes"]] == [(t["side"], t["level"]) for t in sim["spotTypes"]]
    assert len(out["spotTypes"]) == 2
    for entry, t in zip(out["spotTypes"], sim["spotTypes"]):
        assert entry["stage"] == next(v["stage"] for v in t["verdicts"] if v["playerId"] == x)
    assert explain(_instance(a), coach_id, None, 10 ** 6, now=PLAN_AT) is None
