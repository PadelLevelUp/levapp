"""PAD-933 (notifications.manual NM2, owner decision 17's stopgap): no manual invitation on a new-engine
class, for now. The route answers 409 NEW_ENGINE_CLASS after its ownership and roster checks and stores
nothing; ``send_manual_notifications`` refuses too, so no other caller skips it. An old-engine class
invites as today. PAD-932 replaces this with the manual invitation as an engine invitation.
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
def test_a_manual_invitation_on_a_new_engine_class_is_refused(app, client, monkeypatch):
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
        assert res.status_code == 409, res.get_json()
        assert res.get_json() == {"error": "NEW_ENGINE_CLASS", "code": "NEW_ENGINE_CLASS"}
        with app.app_context():
            assert _stored(new["instance"]) == (0, 0, 0)
            from padel_app.services.notification_service import NewEngineClassError, send_manual_notifications

            with pytest.raises(NewEngineClassError):
                send_manual_notifications(new["instance"], [new["candidate"]], new_coach)
            db.session.rollback()
            assert _stored(new["instance"]) == (0, 0, 0)

        res = _manual(app, client, old["coach_user"], old)                      # the old engine: as today
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["sent"] == 1
    with app.app_context():
        assert _stored(old["instance"])[0] == 1
