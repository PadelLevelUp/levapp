"""
PAD-501: when another student takes the spot, the other candidates' invitations are retired and
their bubble shows "Vaga preenchida" — a second chat message ("spot_filled" template, the coach's
"Desculpa já não tenho vaga! Se abrir outra aviso-te") on top of it is redundant. The student who
answers "yes" AFTER the spot went still gets the spot_filled reply (it answers their own action).
"""
from datetime import timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed


def _messages_to(user_id):
    from padel_app.models import Message

    return [m for m in Message.query.all() if m.sender_id != user_id and user_id in _recipients(m)]


def _recipients(message):
    from padel_app.services.notification_service import message_recipient_ids

    return set(message_recipient_ids(message))


def test_the_other_candidates_get_the_badge_and_no_second_message(app, monkeypatch):
    from padel_app.models import Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        ev = {e.player_id: e for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id)}
        b_user = Player.query.get(b).user_id
        before = len(_messages_to(b_user))

        respond_to_notification(ev[a].id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))

        db.session.expire_all()
        assert len(_messages_to(b_user)) == before, "B was sent a second 'spot filled' message"
        bubble = Message.query.get(ev[b].message_id).msg_metadata
        assert bubble["responded"] is True and bubble["response"] in ("spot_filled", "expired")
