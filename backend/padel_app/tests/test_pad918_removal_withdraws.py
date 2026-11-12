"""PAD-918 (found by Session6's iOS run): removing a new-engine class withdraws its open invitations
first, so each bubble settles as `withdrawn` (invitations NB1) instead of offering a Yes the route can
no longer answer."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


def _answer_is_class_cancelled(invitation_id, user_id):
    """A later answer is a 409 {code: class_cancelled}, never a 404 (INVITATIONS-125, 128)."""
    from werkzeug.exceptions import HTTPException

    from padel_app.services.engine_entry import respond_to_invitation

    with pytest.raises(HTTPException) as refused:
        respond_to_invitation(invitation_id, "yes", user_id, now=NOW)
    assert refused.value.response.status_code == 409
    assert refused.value.response.get_json()["code"] == "class_cancelled"


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-125")
def test_removing_a_new_engine_class_withdraws_its_open_invitations(app, monkeypatch):
    from padel_app.models import EngineInvitation, Message
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.services.lesson_service import remove_class_service
    from padel_app.services.notification_service import _send_system_message
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (s,), (_, invited, _) = _seed(app, starts=(START + timedelta(days=1),))
        level = store.snapshot(s).level
        with store.unit((s,)):
            store.apply([fx.Invited(s, NOW, invited, frozenset({SpotType("R", level)}), None, 2,
                                    NOW + timedelta(minutes=20))])
        row = EngineInvitation.query.filter_by(player_id=int(invited)).one()
        coach_user = db.session.get(Coach, store.coach_of(s)).user_id
        msg = _send_system_message(coach_user, db.session.get(Player, int(invited)).user_id, "Join?",
                                   message_type="notification_invite", push=False,
                                   msg_metadata={"engine": "new", "invitationId": row.id, "state": "open"})
        row.message_ids = [msg.id]
        db.session.commit()
        msg_id, row_id = msg.id, row.id

        result, status = remove_class_service({
            "event": {"model": "LessonInstance", "originalId": int(s), "date": (START + timedelta(days=1)).date().isoformat()},
            "scope": "single"})
        assert status == 200
        assert db.session.get(Message, msg_id).msg_metadata["state"] == "class_cancelled"
        _answer_is_class_cancelled(row_id, db.session.get(Player, int(invited)).user_id)


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-128")
def test_cancelling_a_new_engine_class_withdraws_its_open_invitations(app, monkeypatch):
    from padel_app.models import EngineInvitation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import update_lesson_status_service
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (s,), (_, invited, _) = _seed(app, starts=(START + timedelta(days=1),))
        level = store.snapshot(s).level
        with store.unit((s,)):
            store.apply([fx.Invited(s, NOW, invited, frozenset({SpotType("R", level)}), None, 2,
                                    NOW + timedelta(minutes=20))])
        inst = db.session.get(LessonInstance, int(s))
        update_lesson_status_service(inst.lesson_id, {"date": inst.start_datetime.date().isoformat(),
                                                      "status": "canceled"})
        row = EngineInvitation.query.filter_by(player_id=int(invited)).one()
        assert row.closed_reason == "class_removed"
        from padel_app.models.players import Player
        _answer_is_class_cancelled(row.id, db.session.get(Player, int(invited)).user_id)
