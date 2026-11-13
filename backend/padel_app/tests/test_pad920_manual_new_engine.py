"""PAD-932 (notifications.manual NM1, NM2): a manual invitation on a new-engine class takes the engine's
path. The route answers 200 and stores one engine invitation, never a ``NotificationEvent`` and never the
stopgap's 409 ``NEW_ENGINE_CLASS`` (PAD-933, now gone); ownership is still checked first. An old-engine
class invites as today.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad798_no_invitations_once_class_started import BEFORE, _ids, _world


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _on_new_engine(instance_id, coach_id):
    """The class's engine is new once it has an ``engine_sessions`` row (notifications.config rule 18)."""
    from padel_app.models import EngineSession

    db.session.add(EngineSession(lesson_instance_id=instance_id, coach_id=coach_id))
    db.session.commit()


def _manual(app, client, user_id, ids):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    body = {"model": "LessonInstance", "originalId": ids["instance"], "playerIds": [ids["candidate"]]}
    return client.post("/api/app/notify/manual", json=body, headers={"Authorization": f"Bearer {token}"})


def _stored(instance_id):
    from padel_app.models import EngineInvitation, Message, NotificationEvent

    return (NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count(),
            EngineInvitation.query.filter_by(lesson_instance_id=instance_id).count(),
            Message.query.filter_by(message_type="notification_invite").count())


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-9")
def test_a_manual_invitation_on_a_new_engine_class_takes_the_engine_path(app, client, monkeypatch):
    from test_semi_auto_approval import _patched_io

    with app.app_context():
        new_world, old_world = _world("m933n"), _world("m933o")
        new, old = _ids(new_world), _ids(old_world)
        new_coach = new_world["coach"].id
        _on_new_engine(new["instance"], new_coach)
        stranger = old["coach_user"]
    pin_clock(monkeypatch, BEFORE)

    with _patched_io():
        assert _manual(app, client, stranger, new).status_code == 403          # ownership first
        res = _manual(app, client, new["coach_user"], new)
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["sent"] == 1
        with app.app_context():
            events, invitations, _ = _stored(new["instance"])
            assert (events, invitations) == (0, 1)

        res = _manual(app, client, old["coach_user"], old)                      # the old engine: as today
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["sent"] == 1
    with app.app_context():
        assert _stored(old["instance"])[:2] == (1, 0)
