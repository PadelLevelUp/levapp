"""PAD-683 — players.nickname rule 9c: text sent ONLY to a coach names the student by that coach's
display name; text stored in the shared coach–student conversation keeps the real name."""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad274_deletes import _headers, _jwt, _second_coach, world  # noqa: F401
from padel_app.tests.test_pad660_coach_nickname import NICK, _rel, _set_nickname, _share_with_coach_b


def _nickname_on(app, client, world, as_name=True):
    res = _set_nickname(app, client, world, nickname=NICK, nicknameAsName=as_name)
    assert res.status_code == 200, res.get_data(as_text=True)


# --- the helpers ---------------------------------------------------------------------------

def test_own_coach_with_the_switch_on_gets_the_nickname(app, client, world):
    from padel_app.services.player_service import coach_display_name, coach_facing_text

    _nickname_on(app, client, world)
    with app.app_context():
        assert coach_display_name(world["coach_user_id"], world["student_id"], "Rui Student") == NICK
        assert coach_facing_text(
            "Rui Student cancelled", world["coach_user_id"], world["student_id"], "Rui Student"
        ) == f"{NICK} cancelled"


def test_own_coach_with_the_switch_off_gets_the_real_name(app, client, world):
    from padel_app.services.player_service import coach_display_name, coach_facing_text

    _nickname_on(app, client, world, as_name=False)
    with app.app_context():
        assert coach_display_name(world["coach_user_id"], world["student_id"], "Rui Student") == "Rui Student"
        assert coach_facing_text(
            "Rui Student cancelled", world["coach_user_id"], world["student_id"], "Rui Student"
        ) == "Rui Student cancelled"


def test_another_coach_gets_the_real_name(app, client, world):
    from padel_app.services.player_service import coach_display_name

    _nickname_on(app, client, world)
    user_b, _coach_b = _share_with_coach_b(app, world)
    with app.app_context():
        assert coach_display_name(user_b, world["student_id"], "Rui Student") == "Rui Student"


def test_a_non_coach_user_gets_the_real_name(app, client, world):
    from padel_app.services.player_service import coach_display_name

    _nickname_on(app, client, world)
    with app.app_context():
        assert coach_display_name(world["student_user_id"], world["student_id"], "Rui Student") == "Rui Student"
        assert coach_display_name(None, world["student_id"], "Rui Student") == "Rui Student"


# --- site 1: the cancellation notice -------------------------------------------------------

def test_a_late_cancellation_pushes_the_nickname_but_stores_the_real_name(app, client, world):
    from padel_app.models import LessonInstance, Message, Player
    from padel_app.services.notification_service import _notify_coach_of_cancellation

    _nickname_on(app, client, world)
    with app.app_context():
        instance = LessonInstance.query.filter_by(lesson_id=world["lesson_id"]).first()
        player = db.session.get(Player, world["student_id"])
        with patch("padel_app.services.notification_service.send_push_notification") as web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo, \
             patch("padel_app.services.notification_service.publish"):
            msg = _notify_coach_of_cancellation(
                world["coach_user_id"], world["student_user_id"], instance, player,
                is_late=True, locale="en",
            )
        stored = db.session.get(Message, msg.id).text
        assert "Rui Student" in stored and NICK not in stored
        assert NICK in web.call_args.kwargs["body"] and "Rui Student" not in web.call_args.kwargs["body"]
        assert NICK in expo.call_args.kwargs["body"] and "Rui Student" not in expo.call_args.kwargs["body"]


# --- site 2: a chat message from the student -----------------------------------------------

def test_a_student_message_pushes_to_the_coach_under_the_nickname(app, client, world):
    from padel_app.models import Conversation, ConversationParticipant
    from padel_app.services.messaging_service import create_message_service

    _nickname_on(app, client, world)
    with app.app_context():
        conv = Conversation(
            participant_key=Conversation.build_participant_key(
                [world["coach_user_id"], world["student_user_id"]]
            )
        )
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=world["coach_user_id"]),
            ConversationParticipant(conversation_id=conv.id, user_id=world["student_user_id"]),
        ])
        db.session.commit()
        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification") as web, \
             patch("padel_app.services.messaging_service.send_expo_push_to_user") as expo:
            create_message_service({"conversationId": conv.id, "text": "hello"}, world["student_user_id"])
        assert web.call_args.kwargs["title"] == NICK
        assert expo.call_args.kwargs["title"] == NICK


def test_a_coach_message_to_the_student_keeps_the_coachs_name(app, client, world):
    from padel_app.models import Conversation, ConversationParticipant
    from padel_app.services.messaging_service import create_message_service

    _nickname_on(app, client, world)
    with app.app_context():
        conv = Conversation(
            participant_key=Conversation.build_participant_key(
                [world["coach_user_id"], world["student_user_id"]]
            )
        )
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=world["coach_user_id"]),
            ConversationParticipant(conversation_id=conv.id, user_id=world["student_user_id"]),
        ])
        db.session.commit()
        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification") as web, \
             patch("padel_app.services.messaging_service.send_expo_push_to_user"):
            create_message_service({"conversationId": conv.id, "text": "hi"}, world["coach_user_id"])
        assert web.call_args.kwargs["title"] == "Coach Ana"


# --- site 6: the replacement approval prompt -----------------------------------------------

def test_the_replacement_prompt_names_students_by_the_coachs_display_name(app, client, world):
    from padel_app.services.replacement_approval_service import _build_prompt_text

    _nickname_on(app, client, world)
    payload = [{
        "declinedPlayerId": world["student_id"],
        "declinedPlayerName": "Rui Student",
        "openSpot": False,
        "queue": [{"name": "Rui Student", "displayName": NICK}],
    }]
    with app.app_context():
        text = _build_prompt_text(payload, world["coach_user_id"])
        assert NICK in text and "Rui Student" not in text
        # without a recipient the real name is kept (the payload's own field is never rewritten)
        assert "Rui Student" in _build_prompt_text(payload)


def test_coach_facing_text_replaces_only_the_first_whole_word_name(app, client, world):
    """B-631 review: the notice opens on the name; a later occurrence (a class title, the student's
    note) and a longer word containing the name are left alone."""
    from padel_app.services.player_service import coach_facing_text

    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    with app.app_context():
        text = "Rui Student pediu para entrar em Treino Rui Student: «Rui Studentish»"
        out = coach_facing_text(text, world["coach_user_id"], world["student_id"], "Rui Student")
        assert out == f"{NICK} pediu para entrar em Treino Rui Student: «Rui Studentish»"
        assert coach_facing_text("Rui Studentish chegou", world["coach_user_id"], world["student_id"], "Rui Student") == "Rui Studentish chegou"
        assert coach_facing_text("", world["coach_user_id"], world["student_id"], "Rui Student") == ""
        assert coach_facing_text("Rui Student x", world["coach_user_id"], None, "Rui Student") == "Rui Student x"
