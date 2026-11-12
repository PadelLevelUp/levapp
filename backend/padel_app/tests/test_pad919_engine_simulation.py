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
    """TIERS-9: the verdicts (each naming its student, as a queue entry does) and queues are ``planner.evaluate``'s on the hypothetical snapshot with the
    coach's settings (``settings_for``), per student per open spot type, through the same ``simulate_vacancy`` the endpoint calls; nothing is
    written."""
    from padel_app.services.engine_simulation import _spot_type, hypothetical_snapshot
    from padel_app.services.engine_store import TableStore, settings_for
    from padel_app.services.level_ladder import get_level_ladder
    from padel_app.services.invite_simulation_service import simulate_vacancy

    store, (a,), (reg, x, y) = _seed(app, players=3)
    coach_id = store.coach_of(a)
    before = _rows()
    sim = simulate_vacancy(_instance(a), coach_id, int(reg), now=PLAN_AT)
    assert _rows() == before

    dry = planner.evaluate(hypothetical_snapshot(TableStore(clock=lambda: PLAN_AT), a, reg), settings_for(a), PLAN_AT)
    ladder = get_level_ladder(coach_id)

    def wire(st):
        w = _spot_type(st, ladder)
        return (w["side"], w["levelId"])

    expected = {(wire(v.spot_type), v.student): (v.stage, v.tier) for v in dry.verdicts}
    got = {((t["side"], t["levelId"]), v["playerId"]): (v["stage"], v["tier"]) for t in sim["spotTypes"] for v in t["verdicts"]}
    assert got == expected and expected
    assert {(t["side"], t["levelId"]): [q["playerId"] for q in t["queue"]] for t in sim["spotTypes"]} == {
        wire(st): list(q) for st, q in dry.queues.items()}
    assert {t["side"] for t in sim["spotTypes"]} <= {"left", "right", None}
    assert all({"playerId", "name", "nickname", "stage", "tier"} <= set(v)
               for t in sim["spotTypes"] for v in t["verdicts"])           # N2: a verdict names its student
    assert all(t["levelLabel"] for t in sim["spotTypes"])
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

    def gates(now):
        return simulate(inst, store.coach_of(a), reg, now=now)["gates"]

    def codes(now):
        return [g["code"] for g in gates(now) if g["blocked"]]

    assert codes(PLAN_AT) == ["auto_notify_disabled"]
    config = NotificationConfig(coach_id=store.coach_of(a), auto_notify_enabled=True)
    config.restrictions = {"minTimeBeforeClass": {"enabled": True, "value": 120},
                           "quietHours": {"enabled": True, "start": "00:00", "end": "07:00"}}
    db.session.add(config)
    db.session.commit()
    assert codes(PLAN_AT) == []
    assert codes(START - timedelta(days=3)) == ["invitation_window"]
    assert next(g for g in gates(START - timedelta(days=3)) if g["code"] == "invitation_window")["opensAt"]
    assert codes(START - timedelta(hours=1)) == ["last_invite_before"]
    assert codes(START.replace(hour=3)) == ["quiet_hours"]
    assert next(g for g in gates(START.replace(hour=3)) if g["code"] == "quiet_hours")["until"] == "07:00"
    assert codes(START + timedelta(minutes=1)) == ["class_over"]
    assert "max_total_reached" not in {g["code"] for g in gates(PLAN_AT)}
    assert all(set(g) >= {"code", "blocked"} for g in gates(PLAN_AT))
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
    assert [(e["side"], e["levelId"]) for e in out["spotTypes"]] == [(t["side"], t["levelId"]) for t in sim["spotTypes"]]
    assert len(out["spotTypes"]) == 2
    for entry, t in zip(out["spotTypes"], sim["spotTypes"]):
        assert entry["stage"] == next(v["stage"] for v in t["verdicts"] if v["playerId"] == x)
    assert explain(_instance(a), coach_id, None, 10 ** 6, now=PLAN_AT) is None


# --- the replacement approval (notifications.semi-auto-approval, new-engine section) -------------

@pytest.fixture()
def semi(monkeypatch):
    """The coach in semi-automatic mode, as the config mapping (PAD-917) gives it."""
    from padel_app.services import engine_store

    monkeypatch.setattr(engine_store, "settings_for", lambda session: EngineSettings(invitation_mode="semi_automatic"))


def _semi_session(app, players=4):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_approval import _engine

    store, (a,), ids = _seed(app, players=players)
    db.session.add(NotificationConfig(coach_id=store.coach_of(a), auto_notify_enabled=True))
    db.session.commit()
    _engine(PLAN_AT).plan(a, PLAN_AT)
    return store, a, ids


def _request(store, a, tier, queues, rid, minute=0):
    """The engine's ``ApprovalRequest`` for ``tier``, applied through the store as a run would."""
    with store.unit((a,)):
        store.apply([fx.ApprovalRequest(a, PLAN_AT + timedelta(minutes=minute), tier, queues, rid)])


def _two_types(x, y):
    from padel_app.invitation_engine.snapshot import SpotType

    return ((SpotType("L", 1), (x, y)), (SpotType("R", 1), ()))


@pytest.mark.criterion("NOTIFICATIONS-SEMI-AUTO-APPROVAL-37")
def test_the_approval_state_is_the_sessions_request(app, semi):
    """Semi-auto-approval N1: with pool group 1 approved, one student removed earlier and a request for
    pool group 2 over two spot types pending, the class state carries group 1 in ``approvedGroups``, the
    removed student, no dismissed group, and the request with its id, group 2 and its queue per type
    (``side``, ``levelId``, ``levelLabel``, ``count``); the empty type's ``emptyQueueReasons`` are the dry
    run's stage counts."""
    from padel_app.services.replacement_approval_service import instance_suggestions

    store, a, (reg, x, y, z) = _semi_session(app)
    coach_id = store.coach_of(a)
    with store.unit((a,)):
        store.apply([fx.GroupApproved(a, PLAN_AT + timedelta(minutes=1), 2, frozenset({z}))])
    _request(store, a, 3, _two_types(x, y), f"{a}:r2:3:h", 2)
    got = instance_suggestions(int(a), coach_id)
    assert got["engine"] == "new" and got["state"] == "pending" and got["semiAutomatic"]
    assert got["approvedGroups"] == [{"tierSource": "pool", "groupNumber": 1}]
    assert got["removed"] == [z] and got["dismissedGroups"] == []
    [request] = got["requests"]
    assert request["requestId"] == f"{a}:r2:3:h" and request["group"] == {"tierSource": "pool", "groupNumber": 2}
    assert [(t["side"], [q["playerId"] for q in t["queue"]]) for t in request["spotTypes"]] == [
        ("left", [x, y]), ("right", [])]
    assert all(t["levelId"] and t["levelLabel"] and "count" in t for t in request["spotTypes"])
    empty = request["spotTypes"][1]["emptyQueueReasons"]
    assert empty and all(r["count"] > 0 and r["stage"] for r in empty)


@pytest.mark.criterion("NOTIFICATIONS-SEMI-AUTO-APPROVAL-38")
def test_the_coach_approves_or_dismisses_the_pending_request(app, semi):
    """Semi-auto-approval N2: R2 replaced R1 for the same group. "Yes, at the window" is a 400; "Sim" on
    R1 answers ``stale`` and decides nothing; "Ignorar" on R2 dismisses its group (``DismissGroup``);
    "Sim" on the group's next request, removing one student, approves the group (``ApproveGroup``)."""
    from werkzeug.exceptions import BadRequest

    from padel_app.services.replacement_approval_service import respond_to_approval

    store, a, (reg, x, y, z) = _semi_session(app)
    coach_id = store.coach_of(a)
    _request(store, a, 3, _two_types(x, y), f"{a}:r1:3:h", 1)
    _request(store, a, 3, _two_types(x, y), f"{a}:r2:3:h", 2)
    with pytest.raises(BadRequest):
        respond_to_approval(f"{a}:r2:3:h", "yes_at_window", coach_id)
    assert respond_to_approval(f"{a}:r1:3:h", "yes_now", coach_id, now=PLAN_AT + timedelta(minutes=3))["result"] == "stale"
    assert store.snapshot(a).approval.approved_groups == frozenset()
    out = respond_to_approval(f"{a}:r2:3:h", "dismiss", coach_id, now=PLAN_AT + timedelta(minutes=4))
    assert out["result"] == "dismissed" and 3 in dict(store.snapshot(a).approval.dismissed_groups)

    _request(store, a, 2, _two_types(x, y), f"{a}:r3:2:h", 5)
    out = respond_to_approval(f"{a}:r3:2:h", "yes_now", coach_id, removed=[int(y)], now=PLAN_AT + timedelta(minutes=6))
    approval = store.snapshot(a).approval
    assert out["result"] == "approved" and 2 in approval.approved_groups and y in approval.removed
    assert out["state"]["approvedGroups"] == [{"tierSource": "pool", "groupNumber": 1}]


def _semi_session_second(app):
    """A second coach's semi-automatic session (``_seed`` usernames are per call, so a new coach)."""
    from padel_app.models import User

    for u in User.query.filter(User.username.like("%916%")).all():
        u.username = f"old_{u.id}_{u.username}"
    db.session.commit()
    return _semi_session(app)


@pytest.mark.criterion("NOTIFICATIONS-SEMI-AUTO-APPROVAL-39")
def test_recompute_raises_a_fresh_request(app, semi, monkeypatch):
    """Semi-auto-approval N3: with a group dismissed, recomputing from the class reopens it
    (``ReopenGroup``) and plans at once, which asks for it again with the class as it is now; an
    automatic coach is refused."""
    from werkzeug.exceptions import Conflict

    from padel_app.services import engine_store
    from padel_app.services.replacement_approval_service import recompute_suggestions, respond_to_approval

    store, a, _ = _semi_session(app)
    coach_id = store.coach_of(a)
    [first] = store.snapshot(a).approval.pending
    respond_to_approval(first.request, "dismiss", coach_id, now=PLAN_AT + timedelta(minutes=1))
    assert dict(store.snapshot(a).approval.dismissed_groups).keys() == {first.tier}
    # Each run at its own instant: an effect equal in content to one already applied is a retry (STORE-1).
    out = recompute_suggestions(int(a), coach_id, now=PLAN_AT + timedelta(minutes=2))
    assert store.snapshot(a).approval.dismissed_groups == ()
    assert out["state"] == "pending" and out["requests"]
    assert store.snapshot(a).approval.pending_for(first.tier).request != first.request
    monkeypatch.setattr(engine_store, "settings_for", lambda session: EngineSettings())   # back to automatic
    with pytest.raises(Conflict):
        recompute_suggestions(int(a), coach_id, now=PLAN_AT + timedelta(minutes=3))


def _send(row):
    from padel_app.services.engine_approval import send_approval_request

    if row.kind == "ApprovalRequest":
        send_approval_request(row)


@pytest.mark.criterion("NOTIFICATIONS-SEMI-AUTO-APPROVAL-40")
def test_the_outbox_posts_the_request_to_the_coachs_assistant(app, semi, monkeypatch):
    """Semi-auto-approval N4: the outbox posts one ``replacement_approval`` message for a request over two
    spot types in the coach's Assistant conversation (the request id, the class, its group, ``responded``
    false, each type's side, level and queue), its text in Portuguese for a ``pt`` coach, and pushes it
    once; sending again adds nothing."""
    from padel_app.models import Coach, Message
    from padel_app.services.engine_store import dispatch
    from padel_app.utils import push_notifications

    pushes = []
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: pushes.append(kw["user_id"]))
    store, a, (reg, x, y, z) = _semi_session(app)
    dispatch(lambda row: None, now=PLAN_AT)                                  # the planner's own request, sent
    _request(store, a, 3, _two_types(x, y), f"{a}:r9:3:h", 1)
    dispatch(_send, now=PLAN_AT)
    msgs = Message.query.filter_by(message_type="replacement_approval").all()
    assert len(msgs) == 1
    meta = msgs[0].msg_metadata
    assert meta["requestId"] == f"{a}:r9:3:h" and meta["engine"] == "new" and meta["responded"] is False
    assert meta["lessonInstanceId"] == int(a) and meta["group"] == {"tierSource": "pool", "groupNumber": 2}
    assert len(meta["spotTypes"]) == 2
    assert all({"side", "levelId", "levelLabel", "count", "queue"} <= set(t) for t in meta["spotTypes"])
    assert msgs[0].text.startswith("Vou começar a convidar o grupo 2 para ") and msgs[0].text.endswith("Aprovas?")
    assert pushes == [db.session.get(Coach, store.coach_of(a)).user_id]
    assert dispatch(_send, now=PLAN_AT) == 0
    assert Message.query.filter_by(message_type="replacement_approval").count() == 1 and len(pushes) == 1


@pytest.mark.criterion("NOTIFICATIONS-SEMI-AUTO-APPROVAL-43")
def test_a_request_message_follows_it_when_it_stops_being_pending(app, semi, monkeypatch):
    """Semi-auto-approval N4: of three posted request messages, the first's request is replaced by a
    newer one, the second is approved and the third dismissed; their metadata reads ``replaced``,
    ``approved`` and ``dismissed``, each with ``responded`` true and its spot types' ``count``, each change
    published once as ``message_edited``."""
    from padel_app import realtime
    from padel_app.models import Message
    from padel_app.services.engine_store import dispatch

    edited = []
    monkeypatch.setattr(realtime, "publish",
                        lambda event, users: edited.append(event["payload"]["id"]) if event["type"] == "message_edited" else None)
    store, a, (reg, x, y, z) = _semi_session(app)
    dispatch(lambda row: None, now=PLAN_AT)                                  # the planner's own request, sent

    def posted(tier, rid, minute):
        _request(store, a, tier, _two_types(x, y), rid, minute)
        dispatch(_send, now=PLAN_AT)
        return Message.query.filter_by(message_type="replacement_approval").order_by(Message.id.desc()).first()

    first = posted(1, f"{a}:q1:1:h", 1)
    second = posted(2, f"{a}:q2:2:h", 2)
    third = posted(3, f"{a}:q3:3:h", 3)
    assert first.msg_metadata["state"] == "pending" and first.msg_metadata["spotTypes"][0]["count"] >= 1
    edited.clear()
    posted(1, f"{a}:q4:1:h", 4)                                             # replaces the first's request
    # The approval and dismissal as the engine's effects: an answer through respond re-plans the session,
    # and a run asks again for the group about to start, replacing these hand-made requests first.
    with store.unit((a,)):
        store.apply([fx.GroupApproved(a, PLAN_AT + timedelta(minutes=5), 2, frozenset()),
                     fx.GroupDismissed(a, PLAN_AT + timedelta(minutes=6), 3, ())])
    for msg, expected in ((first, "replaced"), (second, "approved"), (third, "dismissed")):
        db.session.refresh(msg)
        assert (msg.msg_metadata["state"], msg.msg_metadata["responded"]) == (expected, True)
        assert all("count" in t for t in msg.msg_metadata["spotTypes"])
    assert sorted(m for m in edited if m in {first.id, second.id, third.id}) == sorted([first.id, second.id, third.id])
