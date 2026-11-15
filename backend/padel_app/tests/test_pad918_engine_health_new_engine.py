"""admin.engine-health rules 10–12 (PAD-918): the summary's `engine` block, a new-engine coach's view
and the tick's failures. Counts only; no student is named."""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed

TOMORROW = START + timedelta(days=1)


def _on_new(coach_id):
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        config = NotificationConfig(coach_id=coach_id)
        db.session.add(config)
    config.auto_notify_enabled, config.engine_version, config.engine_switched_at = True, "new", NOW
    db.session.commit()


def _other_coach_on_old():
    from padel_app.models import Coach, User

    user = User(name="Old", username="coach_old_health", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    db.session.add(Coach(user_id=user.id))
    db.session.commit()


def _invite(store, session, student, side, *, until, tier=2):
    level = store.snapshot(session).level
    return fx.Invited(session, NOW, student, frozenset({SpotType(side, level)}), None, tier, until)


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-24")
def test_the_engine_block_counts_sessions_spots_and_counting_invitations(app):
    from padel_app.services.admin.engine_health import summary

    with app.app_context():
        # Two upcoming sessions (capacity 4, one left regular going: one left and two right spots open),
        # and one that has started.
        store, (a, b, started), pids = _seed(app, starts=(TOMORROW, TOMORROW + timedelta(hours=2),
                                                          NOW - timedelta(hours=1)), players=7)
        _, c1, c2, sorry, late, answered, _ = pids
        _on_new(store.coach_of(a))
        _other_coach_on_old()
        with store.unit((a,)):
            store.apply([_invite(store, a, c1, "L", until=NOW + timedelta(minutes=20), tier=1),
                         _invite(store, a, c2, "R", until=NOW + timedelta(minutes=20), tier=2),
                         _invite(store, a, sorry, "R", until=NOW + timedelta(minutes=20)),
                         _invite(store, a, late, "R", until=NOW - timedelta(minutes=1)),
                         _invite(store, a, answered, "R", until=NOW + timedelta(minutes=20))])
            store.apply([fx.Sorry(a, NOW, sorry), fx.Answered(a, NOW, answered, "no", "invitation")])

        engine = summary(app.config, now=NOW)["engine"]
        assert engine["coaches"] == {"old": 1, "new": 1}
        assert engine["sessions"] == {"upcoming": 2, "next7Days": 2}
        by_side = {}
        for t in engine["openSpots"]["byType"]:
            by_side[t["side"]] = by_side.get(t["side"], 0) + t["open"]
        assert by_side == {"left": 2, "right": 4}                     # 1 left + 2 right, in each session
        assert engine["openSpots"]["uncovered"] == 6 - 2               # a's left and one right counted for
        inv = engine["invitations"]
        assert (inv["counting"], inv["openNotCounting"], inv["sentLast24h"]) == (2, 2, 5)
        assert {t["tier"]: t["counting"] for t in inv["byTier"]} == {1: 1, 2: 1}
        assert not any(isinstance(v, str) and v.startswith("S") for v in str(engine).split("'"))


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-25")
def test_approvals_alerts_outbox_and_tick_are_visible(app):
    from padel_app.models import EngineEffect, EngineSession
    from padel_app.services.admin.engine_health import summary

    with app.app_context():
        store, (a, b, c), _ = _seed(app, starts=(TOMORROW, TOMORROW + timedelta(hours=1), TOMORROW + timedelta(hours=2)))
        _on_new(store.coach_of(a))
        db.session.get(EngineSession, int(a)).pending = [{"tier": 2, "request": "r1", "queues": [], "message_id": None}]
        db.session.get(EngineSession, int(b)).dismissed_groups = [[2, []]]
        db.session.get(EngineSession, int(c)).alerted = [["R", 1, 1]]
        for minutes in (10, 1, 0):
            db.session.add(EngineEffect(lesson_instance_id=int(a), kind="Message", at=NOW - timedelta(minutes=minutes),
                                        payload={}, key=f"k{minutes}"))
        db.session.commit()

        engine = summary(app.config, now=NOW)["engine"]
        assert engine["approvals"] == {"pending": 1, "dismissed": 1}
        assert engine["alerts"]["byReason"] == [{"reason": "no_candidate", "count": 1}]
        assert engine["outbox"] == {"pending": 3, "stuckOver5Min": 1}
        assert engine["tick"]["present"] is False


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-26")
def test_no_engine_block_while_no_coach_is_on_the_new_engine(app):
    from padel_app.services.admin.engine_health import summary

    with app.app_context():
        _seed(app)
        body = summary(app.config, now=NOW)
        assert "engine" not in body and "vacancies" in body and "invitations" in body


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-27")
def test_a_new_engine_coachs_view_names_no_student(app):
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.services.admin.engine_health import coach_detail

    with app.app_context():
        store, (a,), pids = _seed(app, starts=(TOMORROW,), players=4)
        coach_id = store.coach_of(a)
        _on_new(coach_id)
        with store.unit((a,)):
            store.apply([_invite(store, a, p, "R", until=NOW + timedelta(minutes=20)) for p in pids[1:3]])
        db.session.get(EngineSession, int(a)).pending = [{"tier": 2, "request": "r1", "queues": [], "message_id": None}]
        db.session.commit()

        view = coach_detail(coach_id, now=NOW)
        assert view["engineVersion"] == "new" and view["engineSettings"]["invites_per_spot"] == 3
        (session,) = view["upcomingSessions"]
        assert (session["lessonInstanceId"], session["counting"], session["openNotCounting"]) == (int(a), 2, 0)
        assert session["approval"] == "pending"
        names = {db.session.get(Player, int(p)).user.name for p in pids} | set(pids)
        assert not any(n in str(view) for n in names if len(str(n)) > 1)

        NotificationConfig.query.filter_by(coach_id=coach_id).one().timing_method = "nonsense"
        db.session.commit()
        with patch("padel_app.services.engine_settings_mapping.settings_from_config",
                   side_effect=__import__("padel_app.invitation_engine.settings", fromlist=["SettingsError"])
                   .SettingsError("tiers: bad")):
            assert coach_detail(coach_id, now=NOW)["engineSettings"] == {"error": "tiers: bad"}


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-28")
def test_a_failing_session_is_recorded_and_the_rest_go_on(app):
    from padel_app.models import EngineInvitation
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import engine_store
    from padel_app.services.admin.engine_health import summary
    from padel_app.services.engine_runner import tick_sessions

    with app.app_context():
        store, (failing, fine), _ = _seed(app, starts=(START, START + timedelta(hours=2)))
        _on_new(store.coach_of(failing))
        real = engine_store.settings_for

        def settings_for(session):
            if session == failing:
                raise RuntimeError("broken")
            return real(session)

        with patch.object(engine_store, "settings_for", settings_for):
            tick_sessions(NOW, store)
        assert EngineInvitation.query.filter_by(lesson_instance_id=int(fine)).count() > 0
        assert summary(app.config, now=NOW)["engine"]["tick"]["sessionFailures24h"] == 1
