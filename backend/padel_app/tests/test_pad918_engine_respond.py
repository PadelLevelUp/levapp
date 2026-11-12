"""notifications.invitations NB5 (PAD-918): a new-engine invitation is answered on today's routes,
keyed by its id, and the answer says what happened."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, _seed


def _invited(store, session, student):
    """An invitation for the session's open spot: the right side, at the class's ladder level."""
    from padel_app.invitation_engine.snapshot import SpotType

    level = store.snapshot(session).level
    return fx.Invited(session, NOW, student, frozenset({SpotType("R", level)}), None, 2, NOW + timedelta(minutes=20))


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(player_id):
    from padel_app.models.players import Player

    return db.session.get(Player, int(player_id)).user_id


def _invitation(session, student):
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one().id


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-119")
def test_the_answer_route_takes_an_invitation_id_and_says_what_happened(app, client, monkeypatch):
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), (regular, first, second, third) = _seed(app, players=4, capacity=2, side="right")
        coach_id = store.coach_of(session)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
        db.session.commit()
        with store.unit((session,)):
            store.apply([_invited(store, session, s) for s in (first, second, third)])
        ids = {s: _invitation(session, s) for s in (first, second, third)}
        users = {s: _user(s) for s in (first, second, third)}
        coach_user = db.session.get(Coach, coach_id).user_id

    def answer(who, invitation, action="yes", route="respond"):
        return client.post(f"/api/app/notify/{route}", json={"invitationId": invitation, "action": action},
                           headers=_token(app, who))

    yes = answer(users[first], ids[first])                    # the last spot: placed
    assert yes.status_code == 200 and yes.get_json() == {"action": "confirmed", "invitationId": ids[first]}
    assert answer(users[first], ids[first]).get_json() == {
        "action": "confirmed", "invitationId": ids[first], "duplicate": True}

    late = answer(users[second], ids[second])                 # the spot was taken: sorry
    assert late.get_json() == {"action": "sorry", "invitationId": ids[second]}

    assert answer(users[second], 999999).status_code == 404
    assert answer(users[second], ids[third]).status_code == 403   # someone else's invitation

    by_coach = answer(coach_user, ids[third], "no", route="coach_respond")
    assert by_coach.get_json() == {"action": "declined", "invitationId": ids[third]}
