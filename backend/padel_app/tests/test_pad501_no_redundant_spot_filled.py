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


# ── notifications.message-templates rule 15 (PAD-501): the other paths ──────────────────────────
# The owner's decision: no message when an invitation expires or the spot is filled. The join
# request closed by a full class keeps its message (rule 15's last case; test_pad131 guards it).

SORRY = "Desculpa já não tenho vaga! Se abrir outra aviso-te"


def _custom_spot_filled(coach_id):
    """The reporter's case: a coach's own text for the template."""
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        config = NotificationConfig(coach_id=coach_id)
        db.session.add(config)
    templates = dict(config.message_templates or {})
    templates["spot_filled"] = SORRY
    config.message_templates = templates
    db.session.commit()


def _sorry_messages():
    from padel_app.models import Message

    return [m for m in Message.query.all() if (m.text or "").strip() == SORRY]


def test_a_yes_after_the_spot_went_is_answered_without_a_message(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
        _custom_spot_filled(coach_id)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        ev = {e.player_id: e for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id)}
        respond_to_notification(ev[a].id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))
        late = respond_to_notification(ev[b].id, "yes", Player.query.get(b).user_id, now=NOW + timedelta(minutes=2))

        db.session.expire_all()
        assert late["action"] == "spot_filled_waiting_list_offered"
        assert _sorry_messages() == [], "a 'spot filled' message was sent for a late yes"


def test_a_join_request_accept_retires_the_invitations_without_a_message(app):
    from padel_app.models import Coach, Message, NotificationEvent, Player, Vacancy
    from padel_app.services.notification_service import _get_or_create_direct_conversation
    from padel_app.tests.test_pad131_join_requests import _config, _decide, _fill_to_one_spot, _request, _seed, _student

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    _fill_to_one_spot(app, ids)
    asker = _student(app, ids, "asker")
    invitee = _student(app, ids, "inv1")
    with app.app_context():
        _custom_spot_filled(ids["coach_id"])
        coach_uid = db.session.get(Coach, ids["coach_id"]).user_id
        vacancy = Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"], status="open")
        db.session.add(vacancy)
        db.session.flush()
        conv = _get_or_create_direct_conversation(coach_uid, db.session.get(Player, invitee).user_id)
        msg = Message(text="invite", sender_id=coach_uid, conversation_id=conv.id,
                      message_type="class_invitation", msg_metadata={"responded": False})
        db.session.add(msg)
        db.session.flush()
        ev = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"], player_id=invitee,
                               type="auto", status="sent", message_id=msg.id, vacancy_id=vacancy.id)
        db.session.add(ev)
        db.session.commit()
        ev_id, conv_id = ev.id, conv.id
    rid, _, _ = _request(app, ids, asker)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    with app.app_context():
        ev = db.session.get(NotificationEvent, ev_id)
        assert ev.status == "expired"
        assert db.session.get(Message, ev.message_id).msg_metadata.get("response") == "spot_filled"
        assert Message.query.filter_by(conversation_id=conv_id).count() == 1, "only the invitation itself"
        assert _sorry_messages() == []


def test_a_refused_come_back_sends_the_student_no_message(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES as REMINDER_PATCHES
    from padel_app.tests.test_pad259_readers import _second_student
    from padel_app.tests.test_pad313_attendance_state import _world

    ids, iid = _world(app, max_players=1)
    with app.app_context():
        _custom_spot_filled(ids["coach_id"])
        with patch(REMINDER_PATCHES[0]), patch(REMINDER_PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            carol, _ = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)
            result = respond_to_reminder(iid, "yes", ids["student_user_id"])

        db.session.expire_all()
        assert result["action"] == "spot_filled"
        assert _sorry_messages() == [], "the refused come-back was messaged"
