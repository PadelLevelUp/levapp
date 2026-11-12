"""classes.join-requests new-engine section NJ1 (PAD-918): a new-engine join request is the engine's
direct join, placed or refused with a code; a soft failure waits for the coach."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _class(app, monkeypatch, *, direct_join=True, mode="automatic", players=5):
    """One new-engine class of capacity 2 with its left regular going: one right spot open."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    store, (session, other), pids = _seed(app, starts=(START, START), players=players, capacity=2, side="right")
    coach_id = store.coach_of(session)
    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, open_spots_visible=True,
                                      auto_accept_join_requests=direct_join, invitation_mode=mode))
    db.session.commit()
    return store, session, other, pids


def _link(coach_id, player_id):
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    return Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(player_id)).one()


def _users(*player_ids):
    from padel_app.models.players import Player

    return [db.session.get(Player, int(p)).user_id for p in player_ids]


def _ask(app, client, user, session, side=None):
    """The student's request through the route, outside the test's app context (a request inside it
    would reuse the previous request's ``g`` and so its current user)."""
    body = {"model": "LessonInstance", "originalId": int(session), "side": side}
    res = client.post("/api/app/class-join-requests", json=body, headers=_token(app, user))
    return res.status_code, res.get_json()


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-36")
def test_a_direct_join_is_placed_or_refused_with_a_code(app, client, monkeypatch):
    from padel_app.invitation_engine import effects as fx

    with app.app_context():
        store, session, other, (_, fits, left_only, busy, below) = _class(app, monkeypatch)
        coach_id = store.coach_of(session)
        _link(coach_id, left_only).side = "left"
        _link(coach_id, below).level_id = None                 # off the ladder: below any bar
        from padel_app.models.notification_config import NotificationConfig
        NotificationConfig.query.filter_by(coach_id=coach_id).one().eligibility_rules = [
            {"attribute": "level", "operation": "same_as_class"}]
        db.session.commit()
        with store.unit((other,)):                             # going to another class at the same start
            store.apply([fx.Placed(other, NOW, busy, "R", "invitation")])
        u_fits, u_left, u_busy, u_below = _users(fits, left_only, busy, below)

    status, body = _ask(app, client, u_busy, session)            # asked first: before any run plans the spot
    assert (status, body["code"]) == (409, "busy_same_hour")
    status, body = _ask(app, client, u_left, session)
    assert (status, body["code"], body["sides"]) == (409, "side_full", ["right"])
    status, body = _ask(app, client, u_below, session)
    assert (status, body["status"]) == (201, "pending")
    status, body = _ask(app, client, u_fits, session)
    assert (status, body["status"]) == (201, "accepted")
    with app.app_context():
        assert fits in {p.student for p in store.snapshot(session).going}


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-36")
def test_with_direct_join_off_a_request_waits(app, client, monkeypatch):
    with app.app_context():
        store, session, _, (_, fits, *_) = _class(app, monkeypatch, direct_join=False)
        (u_fits,) = _users(fits)
    status, body = _ask(app, client, u_fits, session)
    assert (status, body["status"]) == (201, "pending")
    with app.app_context():
        assert fits not in {p.student for p in store.snapshot(session).going}


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-38")
def test_a_soft_failure_waits_for_the_coach_and_semi_automatic_never_auto_accepts(app, client, monkeypatch):
    with app.app_context():
        store, session, _, (_, fits, excluded, *_) = _class(app, monkeypatch)
        from padel_app.models.notification_config import NotificationConfig
        config = NotificationConfig.query.filter_by(coach_id=store.coach_of(session)).one()
        config.restrictions = {"excludedPlayers": {"enabled": True, "playerIds": [int(excluded)]}}
        db.session.commit()
        u_fits, u_excluded = _users(fits, excluded)
    status, body = _ask(app, client, u_excluded, session)
    assert (status, body["status"]) == (201, "pending") and "code" not in body

    with app.app_context():                                  # the setting stays on; never auto-accepted
        from padel_app.models.notification_config import NotificationConfig
        NotificationConfig.query.filter_by(coach_id=store.coach_of(session)).one().invitation_mode = "semi_automatic"
        db.session.commit()
    status, body = _ask(app, client, u_fits, session)
    assert (status, body["status"]) == (201, "pending")
