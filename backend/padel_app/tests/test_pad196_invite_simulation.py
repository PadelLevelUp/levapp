"""
PAD-196 — notifications.invite-simulation: a read-only, stage-tagged dry run of
the invitation engine for a hypothetical vacancy, evaluated "as of now".

Covered spec: .specflow/specs/notifications/invite-simulation.spec.md (every
acceptance criterion, in order).

The load-bearing invariant is AGREEMENT with the real engine: the students the
simulation tags `invited` for a class and a departing player are exactly the
students the engine sends to for a real vacancy of that class — same people,
same order, same rounds. `test_matches_engine_*` compare against the engine's
actual send path (`_send_invitation_batch` writes NotificationEvents), not
against a helper the simulation shares, so a fork between the two would fail
here rather than hide behind a common function.

Run:
    PYTHONPATH="$PWD" python -m pytest padel_app/tests/test_pad196_invite_simulation.py -v
"""
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

from padel_app.tests.test_pad128_eligibility import _seed, _add_student


PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.replacement_approval_service.publish",
    "padel_app.services.replacement_approval_service.send_push_notification",
]


@contextmanager
def _patched_io():
    with ExitStack() as stack:
        for target in PATCHES:
            stack.enter_context(patch(target))
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enrol(player_id, instance_id):
    """Put a player IN the class: enrolment association + an unanswered presence."""
    from padel_app.models.Association_PlayerLessonInstance import (
        Association_PlayerLessonInstance,
    )
    from padel_app.models.presences import Presence

    db.session.add(Association_PlayerLessonInstance(
        player_id=player_id, lesson_instance_id=instance_id))
    db.session.add(Presence(
        player_id=player_id, lesson_instance_id=instance_id,
        invited=True, confirmed=False))
    db.session.flush()


def _config(coach_id, **fields):
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    for key, value in fields.items():
        setattr(config, key, value)
    db.session.commit()
    return config


def _set_class_level(ids, code):
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance

    instance = LessonInstance.query.get(ids["instance_id"])
    lesson = Lesson.query.get(ids["lesson_id"])
    instance.level_id = ids["level_ids"][code]
    lesson.default_level_id = ids["level_ids"][code]
    db.session.commit()


def _simulate(ids, departing, now=None):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.invite_simulation_service import simulate_vacancy

    instance = LessonInstance.query.get(ids["instance_id"])
    return simulate_vacancy(instance, ids["coach_id"], departing, now=now)


def _explain(ids, departing, player_id, now=None):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.invite_simulation_service import explain_player

    instance = LessonInstance.query.get(ids["instance_id"])
    return explain_player(instance, ids["coach_id"], departing, player_id, now=now)


def _queue_ids(simulation):
    """Ordered player ids across every simulated round."""
    return [
        c["playerId"]
        for r in simulation["rounds"]
        for c in r["candidates"]
    ]


def _round(simulation, number):
    return next(r for r in simulation["rounds"] if r["number"] == number)


def _real_vacancy(ids, departing):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import (
        _create_vacancy_for_absent_player,
    )

    instance = LessonInstance.query.get(ids["instance_id"])
    return _create_vacancy_for_absent_player(instance, ids["coach_id"], departing)


def _engine_first_batch_ids(ids, vacancy, now):
    """What the ENGINE actually sends for a real vacancy right now: the ordered
    player ids of the NotificationEvents `_send_invitation_batch` creates."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import (
        _send_invitation_batch, get_or_create_config,
    )

    instance = LessonInstance.query.get(ids["instance_id"])
    config = get_or_create_config(ids["coach_id"])
    with _patched_io():
        _send_invitation_batch(vacancy, instance, config, ids["coach_id"], now=now)
    events = (
        NotificationEvent.query.filter_by(vacancy_id=vacancy.id)
        .order_by(NotificationEvent.id.asc())
        .all()
    )
    return [str(e.player_id) for e in events]


def _engine_full_queue_ids(ids, vacancy):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import get_or_create_config
    from padel_app.services.replacement_approval_service import (
        compute_full_invite_queue,
    )

    instance = LessonInstance.query.get(ids["instance_id"])
    config = get_or_create_config(ids["coach_id"])
    return [e["id"] for e in compute_full_invite_queue(
        vacancy, instance, ids["coach_id"], config)]


def _mixed_roster(ids):
    """Six roster students at mixed levels/sides plus Alice (5/left) enrolled.

    Returns (alice_id, roster_ids). With max_players == enrolled count there is
    no structural vacancy, so the engine has exactly one spot to fill.
    """
    L = ids["level_ids"]
    alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
    roster = [
        _add_student(ids["coach_id"], "r_5_left", L["5"], "left"),
        _add_student(ids["coach_id"], "r_5_right", L["5"], "right"),
        _add_student(ids["coach_id"], "r_5_both", L["5"], "both"),
        _add_student(ids["coach_id"], "r_4_left", L["4"], "left"),
        _add_student(ids["coach_id"], "r_5minus_left", L["5-"], "left"),
        _add_student(ids["coach_id"], "r_nolevel", None, None),
    ]
    _enrol(alice, ids["instance_id"])
    db.session.commit()
    return alice, roster


def _no_batch_cap(coach_id):
    """Disable maxSimultaneous so the engine sends the whole round at once."""
    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS

    return _config(coach_id, restrictions={
        **DEFAULT_RESTRICTIONS,
        "maxSimultaneous": {"enabled": False, "value": 3},
    })


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


# ---------------------------------------------------------------------------
# Agreement with the engine (rule 5)
# ---------------------------------------------------------------------------

def test_matches_engine_unset_bar(app):
    """AC "The simulation invites exactly who the engine invites — unset bar"."""
    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, _ = _mixed_roster(ids)
        _no_batch_cap(ids["coach_id"])
        now = utcnow_naive()

        simulation = _simulate(ids, alice, now=now)
        simulated_round_1 = [c["playerId"] for c in _round(simulation, 1)["candidates"]]

        vacancy = _real_vacancy(ids, alice)
        # Full queue first: once the batch is sent those players are "already
        # invited" for this vacancy and the prompt's queue rightly drops them.
        assert _engine_full_queue_ids(ids, vacancy) == _queue_ids(simulation)
        assert _engine_first_batch_ids(ids, vacancy, now) == simulated_round_1
        assert simulated_round_1, "the fixture must produce at least one round-1 candidate"


def test_matches_engine_level_bar(app):
    """AC "The simulation invites exactly who the engine invites — level bar"."""
    bar = [{"attribute": "level", "operation": "within_n_of_class", "value": 1}]
    ids = _seed(app, eligibility_rules=bar, max_players=1)
    with app.app_context():
        _set_class_level(ids, "4")
        alice, roster = _mixed_roster(ids)
        _no_batch_cap(ids["coach_id"])
        now = utcnow_naive()
        two_steps_away = str(roster[4])  # r_5minus_left: 4 -> 5 -> 5- is two steps

        simulation = _simulate(ids, alice, now=now)
        vacancy = _real_vacancy(ids, alice)

        assert _engine_full_queue_ids(ids, vacancy) == _queue_ids(simulation)
        engine_first = _engine_first_batch_ids(ids, vacancy, now)
        assert engine_first == [c["playerId"] for c in _round(simulation, 1)["candidates"]]
        assert two_steps_away not in _queue_ids(simulation)
        assert two_steps_away not in engine_first


def test_matches_engine_legacy_rounds(app):
    """AC "The simulation invites exactly who the engine invites — legacy rounds"."""
    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, _ = _mixed_roster(ids)
        _config(ids["coach_id"], invitation_groups=[])  # [] -> engine uses get_rounds()
        _no_batch_cap(ids["coach_id"])
        now = utcnow_naive()

        simulation = _simulate(ids, alice, now=now)
        assert simulation["rounds"], "legacy rounds must be simulated"
        assert all(r["kind"] == "legacy" for r in simulation["rounds"])

        vacancy = _real_vacancy(ids, alice)
        assert _engine_full_queue_ids(ids, vacancy) == _queue_ids(simulation)
        assert _engine_first_batch_ids(ids, vacancy, now) == [
            c["playerId"] for c in _round(simulation, 1)["candidates"]
        ]


# ---------------------------------------------------------------------------
# No writes (rule 3)
# ---------------------------------------------------------------------------

def test_simulation_writes_nothing(app):
    """AC "The simulation writes nothing"."""
    from padel_app.models import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.vacancy import Vacancy
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, roster = _mixed_roster(ids)
        _config(ids["coach_id"], invitation_mode="semi_automatic")
        dora = roster[0]
        standing = StandingWaitingListEntry(
            coach_id=ids["coach_id"], player_id=dora, credits_total=3, credits_used=1,
            expires_at=utcnow_naive() - timedelta(days=1), is_active=True,
        )
        db.session.add(standing)
        db.session.flush()
        db.session.add(WaitingListEntry(
            lesson_instance_id=ids["instance_id"], player_id=dora,
            coach_id=ids["coach_id"], standing_entry_id=standing.id, is_active=True,
        ))
        db.session.commit()
        standing_id = standing.id

        def counts():
            return (
                Vacancy.query.count(),
                NotificationEvent.query.count(),
                Message.query.count(),
                ReplacementApprovalPrompt.query.count(),
                WaitingListEntry.query.count(),
                StandingWaitingListEntry.query.count(),
            )

        before = counts()
        simulation = _simulate(ids, alice)
        _explain(ids, alice, dora)
        db.session.commit()  # flush anything a careless path might have staged

        assert simulation["approvalRequired"] is True
        assert counts() == before
        standing = StandingWaitingListEntry.query.get(standing_id)
        assert standing.is_active is True, "dry run must not deactivate an expired entry"
        assert standing.credits_used == 1


# ---------------------------------------------------------------------------
# Who is never a candidate
# ---------------------------------------------------------------------------

def test_departing_and_enrolled_never_candidates(app):
    """AC "The missing player and the players still in the class are never candidates"."""
    ids = _seed(app, eligibility_rules=None, max_players=3)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        bob = _add_student(ids["coach_id"], "bob", L["5"], "left")
        carol = _add_student(ids["coach_id"], "carol", L["5"], "right")
        _add_student(ids["coach_id"], "outsider", L["5"], "left")
        for pid in (alice, bob, carol):
            _enrol(pid, ids["instance_id"])
        db.session.commit()

        simulation = _simulate(ids, alice)
        queue = _queue_ids(simulation)
        for pid in (alice, bob, carol):
            assert str(pid) not in queue

        assert _explain(ids, alice, alice)["stage"] == "departing_player"
        assert _explain(ids, alice, bob)["stage"] == "already_enrolled"


# ---------------------------------------------------------------------------
# Gates (rule 6)
# ---------------------------------------------------------------------------

def _gate(simulation, code):
    return next(g for g in simulation["gates"] if g["code"] == code)


def test_quiet_hours_gate_club_wall_clock(app):
    """AC "Quiet hours are reported on the club wall clock (PAD-136 style)"."""
    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, _ = _mixed_roster(ids)
        _config(ids["coach_id"], restrictions={
            **DEFAULT_RESTRICTIONS, "quietHours": {"enabled": True},
        })
        # The seeded class starts ~3 days from the real clock; both instants
        # below are earlier than that, so only the wall clock decides.
        summer_late = datetime(2026, 7, 15, 21, 30)   # 22:30 WEST
        summer_morning = datetime(2026, 7, 15, 6, 30)  # 07:30 WEST

        blocked = _simulate(ids, alice, now=summer_late)
        gate = _gate(blocked, "quiet_hours")
        assert gate["blocked"] is True
        assert gate["until"] == "07:00"
        assert blocked["rounds"] and _round(blocked, 1)["candidates"]

        clear = _simulate(ids, alice, now=summer_morning)
        assert _gate(clear, "quiet_hours")["blocked"] is False


def test_invitation_window_reported_not_applied(app):
    """AC "The invitation window is reported, not applied"."""
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, _ = _mixed_roster(ids)
        _config(ids["coach_id"], invitation_start_timing={"type": "hours_before", "value": 2})
        now = utcnow_naive().replace(microsecond=0)
        instance = LessonInstance.query.get(ids["instance_id"])
        # PAD-256: a class time is stored on the club's wall clock (R-023), so a
        # class "6 hours from now" is Lisbon now + 6 h.
        from padel_app.utils.dates import utc_to_wall_naive

        instance.start_datetime = utc_to_wall_naive(now) + timedelta(hours=6)
        instance.end_datetime = utc_to_wall_naive(now) + timedelta(hours=7)
        db.session.commit()

        simulation = _simulate(ids, alice, now=now)
        gate = _gate(simulation, "invitation_window")
        assert gate["blocked"] is True
        assert gate["opensAt"] == (now + timedelta(hours=4)).isoformat()
        assert simulation["evaluatedAt"] == now.isoformat()
        assert _round(simulation, 1)["candidates"]


# ---------------------------------------------------------------------------
# Semi-automatic mode (rule 7)
# ---------------------------------------------------------------------------

def test_semi_auto_reports_approval_with_prompt_list(app):
    """AC "Semi-automatic mode reports the approval step with the prompt's list"."""
    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        alice, _ = _mixed_roster(ids)
        _config(ids["coach_id"], invitation_mode="semi_automatic")

        simulation = _simulate(ids, alice)
        assert simulation["approvalRequired"] is True

        vacancy = _real_vacancy(ids, alice)
        assert _engine_full_queue_ids(ids, vacancy) == _queue_ids(simulation)


# ---------------------------------------------------------------------------
# Waiting list (rule 8)
# ---------------------------------------------------------------------------

def test_waiting_list_member_is_placed_not_invited(app):
    """AC "A waiting-list member who passes the bar is placed, not invited"."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry

    bar = [{"attribute": "level", "operation": "same_as_class"}]
    ids = _seed(app, eligibility_rules=bar, max_players=1)
    with app.app_context():
        alice, roster = _mixed_roster(ids)
        dora = roster[1]  # r_5_right: level 5 == class level 5
        standing = StandingWaitingListEntry(
            coach_id=ids["coach_id"], player_id=dora, credits_total=5, credits_used=0,
            expires_at=utcnow_naive() + timedelta(days=30), is_active=True,
        )
        db.session.add(standing)
        db.session.flush()
        db.session.add(WaitingListEntry(
            lesson_instance_id=ids["instance_id"], player_id=dora,
            coach_id=ids["coach_id"], standing_entry_id=standing.id, is_active=True,
        ))
        db.session.commit()

        simulation = _simulate(ids, alice)
        placement = simulation["waitingListPlacement"]
        assert placement is not None
        assert placement["playerId"] == str(dora)
        assert placement["standing"] is True
        assert str(dora) not in _queue_ids(simulation)


# ---------------------------------------------------------------------------
# Explain (rules 2, 12, 13)
# ---------------------------------------------------------------------------

def test_explain_names_eligibility_rule(app):
    """AC "Explain names the eligibility rule, in PAD-133's records"."""
    bar = [{"attribute": "level", "operation": "within_n_of_class", "value": 1}]
    ids = _seed(app, eligibility_rules=bar, max_players=1)
    with app.app_context():
        _set_class_level(ids, "4")
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["4"], "left")
        eve = _add_student(ids["coach_id"], "eve", L["5-"], "left")
        _enrol(alice, ids["instance_id"])
        db.session.commit()

        verdict = _explain(ids, alice, eve)
        assert verdict["stage"] == "eligibility"
        failures = verdict["details"]["failures"]
        assert len(failures) == 1
        record = failures[0]
        assert record["attribute"] == "level"
        assert record["operation"] == "within_n_of_class"
        assert record["threshold"] == 1
        assert record["ladder_distance"] == 2


def test_explain_reports_blocker(app):
    """AC "Explain reports an availability blocker"."""
    from padel_app.models import Player
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        frank = _add_student(ids["coach_id"], "frank", L["5"], "left")
        _enrol(alice, ids["instance_id"])
        instance = LessonInstance.query.get(ids["instance_id"])
        db.session.add(CalendarBlock(
            user_id=Player.query.get(frank).user_id,
            type="unavailable",
            start_datetime=instance.start_datetime - timedelta(hours=1),
            end_datetime=instance.end_datetime + timedelta(hours=1),
            is_recurring=False,
            blocks_auto_invitations=True,
            title="Away",
        ))
        db.session.commit()

        verdict = _explain(ids, alice, frank)
        assert verdict["stage"] == "unavailable"
        assert verdict["details"] == {}
        assert str(frank) not in _queue_ids(_simulate(ids, alice))


def test_explain_reports_auto_invites_off(app):
    """AC "Explain reports a switched-off student"."""
    from padel_app.models import Player, User

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        gina = _add_student(ids["coach_id"], "gina", L["5"], "left")
        _enrol(alice, ids["instance_id"])
        User.query.get(Player.query.get(gina).user_id).notif_block_auto_invitations = True
        db.session.commit()

        assert _explain(ids, alice, gina)["stage"] == "auto_invites_off"


def test_explain_reports_position_and_send_status(app):
    """AC "Explain reports the position of an invited student"."""
    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        candidates = [
            _add_student(ids["coach_id"], f"cand{i}", L["5"], "left") for i in range(4)
        ]
        _enrol(alice, ids["instance_id"])
        _config(ids["coach_id"], restrictions={
            **DEFAULT_RESTRICTIONS, "maxSimultaneous": {"enabled": True, "value": 2},
        })

        simulation = _simulate(ids, alice)
        round_1 = _round(simulation, 1)["candidates"]
        assert [c["rank"] for c in round_1] == [1, 2, 3, 4]
        assert [c["sendStatus"] for c in round_1] == [
            "first_batch", "first_batch", "queued", "queued",
        ]

        third = _explain(ids, alice, int(round_1[2]["playerId"]))
        assert third["stage"] == "invited"
        assert third["details"] == {"roundNumber": 1, "rank": 3, "sendStatus": "queued"}
        first = _explain(ids, alice, int(round_1[0]["playerId"]))
        assert first["details"]["sendStatus"] == "first_batch"
        assert {int(c["playerId"]) for c in round_1} == set(candidates)


def test_daily_quota_marks_candidate(app):
    """AC "Explain reports the daily quota"."""
    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS
    from padel_app.models.notification_event import NotificationEvent

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        hugo = _add_student(ids["coach_id"], "hugo", L["5"], "left")
        _add_student(ids["coach_id"], "ivan", L["5"], "left")
        _enrol(alice, ids["instance_id"])
        _config(ids["coach_id"], restrictions={
            **DEFAULT_RESTRICTIONS,
            "maxInvitesPerStudentPerDay": {"enabled": True, "value": 1},
        })
        db.session.add(NotificationEvent(
            coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"],
            player_id=hugo, type="auto", round_number=1, status="sent",
        ))
        db.session.commit()

        simulation = _simulate(ids, alice)
        first = _round(simulation, 1)["candidates"][0]
        assert first["playerId"] == str(hugo)
        assert first["rank"] == 1
        assert first["sendStatus"] == "daily_quota"
        assert _explain(ids, alice, hugo)["details"]["sendStatus"] == "daily_quota"


# ---------------------------------------------------------------------------
# Routes (rules 1, 2) and the 403
# ---------------------------------------------------------------------------

def _route_body(ids, departing, **extra):
    return {
        "model": "LessonInstance",
        "originalId": ids["instance_id"],
        "date": None,
        "departingPlayerId": departing,
        **extra,
    }


def test_student_caller_gets_403(app, client):
    """AC "A student caller is refused"."""
    from padel_app.models import Player

    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        _enrol(alice, ids["instance_id"])
        db.session.commit()
        student_user_id = Player.query.get(alice).user_id

    headers = _auth_header(app, student_user_id)
    res = client.post("/api/app/notify/invite_simulation",
                      json=_route_body(ids, alice), headers=headers)
    assert res.status_code == 403
    res = client.post("/api/app/notify/invite_simulation/explain",
                      json=_route_body(ids, alice, playerId=alice), headers=headers)
    assert res.status_code == 403


def test_routes_happy_path(app, client):
    """Rules 1–2: the coach reaches both endpoints with the notify blueprint's
    class addressing and gets camelCase payloads back."""
    ids = _seed(app, eligibility_rules=None, max_players=1)
    with app.app_context():
        L = ids["level_ids"]
        alice = _add_student(ids["coach_id"], "alice", L["5"], "left")
        jo = _add_student(ids["coach_id"], "jo", L["5"], "left")
        _enrol(alice, ids["instance_id"])
        db.session.commit()

    headers = _auth_header(app, ids["coach_user_id"])
    res = client.post("/api/app/notify/invite_simulation",
                      json=_route_body(ids, alice), headers=headers)
    assert res.status_code == 200, res.data
    body = res.get_json()
    assert body["spot"]["side"] == "left"
    assert body["spot"]["levelCode"] == "5"
    assert body["spot"]["levelSource"] == "player"
    assert str(jo) in _queue_ids(body)
    assert "evaluatedAt" in body and "gates" in body

    res = client.post("/api/app/notify/invite_simulation/explain",
                      json=_route_body(ids, alice, playerId=jo), headers=headers)
    assert res.status_code == 200, res.data
    assert res.get_json()["stage"] == "invited"

    # A departing player who is not enrolled is a 400, not a silent answer.
    res = client.post("/api/app/notify/invite_simulation",
                      json=_route_body(ids, jo), headers=headers)
    assert res.status_code == 400
