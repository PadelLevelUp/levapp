"""
PAD-124 — answering a `waiting_list_offer` settles the offer message.

The offer is the whole self-service route onto the waiting list, and until
PAD-124 neither client rendered its Yes/No, so `respond_to_waiting_list` had no
caller. Now that both bubbles call it, the bubble has to survive a reload: it
reads `metadata.responded` / `metadata.response` exactly as the invite and
reminder bubbles do, so the answer must be written back onto the message.

Run:
    pytest padel_app/tests/test_waiting_list_offer_response.py -v
"""

from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
]


def _seed(app_suffix):
    """Coach + player + a future instance the player can be offered a seat on."""
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.Association_CoachLessonInstance import (
        Association_CoachLessonInstance,
    )

    coach_user = User(name="Coach", username=f"coach-{app_suffix}",
                      email=f"coach-{app_suffix}@test.com", password="x",
                      status="active")
    player_user = User(name="Student", username=f"student-{app_suffix}",
                       email=f"student-{app_suffix}@test.com", password="x",
                       status="active")
    db.session.add_all([coach_user, player_user])
    db.session.flush()

    coach = Coach(user_id=coach_user.id)
    player = Player(user_id=player_user.id)
    db.session.add_all([coach, player])
    db.session.flush()

    club = Club(name="Test Club", description="", location="City")
    db.session.add(club)
    db.session.flush()

    start = datetime.utcnow() + timedelta(hours=48)
    lesson = Lesson(title="Test Class", start_datetime=start,
                    end_datetime=start + timedelta(hours=1), is_recurring=False,
                    type="academy", max_players=4, color="#000", status="active",
                    club_id=club.id)
    db.session.add(lesson)
    db.session.flush()

    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1),
                              max_players=4, status="scheduled",
                              notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(
        coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
    db.session.commit()

    return {
        "coach": coach,
        "coach_user_id": coach_user.id,
        "player": player,
        "player_user_id": player_user.id,
        "instance": instance,
    }


def _send_offer(ids):
    """Send the offer through the same function the engine uses."""
    from padel_app.services.notification_service import (
        _offer_waiting_list,
        get_or_create_config,
    )
    from padel_app.models import Message

    config = get_or_create_config(ids["coach"].id)
    _offer_waiting_list(
        ids["player"].id, ids["instance"], ids["coach"].id,
        config.get_message_templates(None), None,
    )
    return Message.query.filter_by(message_type="waiting_list_offer").order_by(
        Message.id.desc()).first()


class TestWaitingListOfferResponse:

    def test_offer_starts_unanswered(self, app):
        with app.app_context():
            ids = _seed("fresh")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)

            assert offer is not None
            assert offer.msg_metadata["lessonInstanceId"] == ids["instance"].id
            assert offer.msg_metadata["responded"] is False

    def test_yes_queues_the_student_and_settles_the_offer(self, app):
        from padel_app.services.notification_service import respond_to_waiting_list
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("yes")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)
                result = respond_to_waiting_list(
                    ids["instance"].id, "yes", ids["player_user_id"])

            assert result == {"action": "added_to_waiting_list"}
            assert WaitingListEntry.query.filter_by(
                lesson_instance_id=ids["instance"].id,
                player_id=ids["player"].id,
                is_active=True,
            ).count() == 1
            # The bubble reads these two fields; without them the Yes/No comes
            # back on the next reload as if nothing had been answered.
            assert offer.msg_metadata["responded"] is True
            assert offer.msg_metadata["response"] == "yes"

    def test_no_settles_the_offer_without_queueing(self, app):
        from padel_app.services.notification_service import respond_to_waiting_list
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("no")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)
                result = respond_to_waiting_list(
                    ids["instance"].id, "no", ids["player_user_id"])

            assert result == {"action": "declined"}
            assert WaitingListEntry.query.filter_by(
                lesson_instance_id=ids["instance"].id).count() == 0
            assert offer.msg_metadata["responded"] is True
            assert offer.msg_metadata["response"] == "no"

    def test_second_answer_does_not_resettle_the_offer(self, app):
        """Changing the answer still works; the settled message keeps the first.

        The upsert is idempotent, so a double tap must not produce a second
        entry — and only the offer that was still open gets marked.
        """
        from padel_app.services.notification_service import respond_to_waiting_list
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("twice")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)
                respond_to_waiting_list(
                    ids["instance"].id, "yes", ids["player_user_id"])
                respond_to_waiting_list(
                    ids["instance"].id, "yes", ids["player_user_id"])

            assert WaitingListEntry.query.filter_by(
                lesson_instance_id=ids["instance"].id).count() == 1
            assert offer.msg_metadata["response"] == "yes"

    def test_late_answer_settles_the_offer_as_expired(self, app):
        """PAD-68 refuses the answer; PAD-124 stops the question coming back.

        Leaving the offer un-settled would hand the student a Yes the server
        will reject every time they tap it.
        """
        from padel_app.services.notification_service import respond_to_waiting_list
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("late")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)
                result = respond_to_waiting_list(
                    ids["instance"].id, "yes", ids["player_user_id"],
                    now=datetime.utcnow() + timedelta(days=3),
                )

            assert result == {"action": "expired"}
            assert WaitingListEntry.query.filter_by(
                lesson_instance_id=ids["instance"].id).count() == 0
            assert offer.msg_metadata["responded"] is True
            assert offer.msg_metadata["response"] == "expired"

    def test_unknown_action_settles_nothing(self, app):
        from padel_app.services.notification_service import respond_to_waiting_list

        with app.app_context():
            ids = _seed("bogus")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                offer = _send_offer(ids)
                result = respond_to_waiting_list(
                    ids["instance"].id, "maybe", ids["player_user_id"])

            assert result == {"action": "unknown"}
            assert offer.msg_metadata["responded"] is False


class TestOnlyOfferedPlayersMayAnswer:
    """PAD-222 / B-041 — notifications.waiting-list rule 12."""

    def _headers(self, app, user_id):
        from flask_jwt_extended import create_access_token

        app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
        with app.app_context():
            return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}

    def test_no_offer_is_403_and_writes_nothing(self, app, client):
        from padel_app.models import Conversation
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("nooffer")
            instance_id, player_id, user_id = ids["instance"].id, ids["player"].id, ids["player_user_id"]
        with patch(PATCHES[0]), patch(PATCHES[1]):
            res = client.post(
                "/api/app/notify/respond_waiting_list",
                json={"lessonInstanceId": instance_id, "action": "yes"},
                headers=self._headers(app, user_id),
            )
        assert res.status_code == 403
        with app.app_context():
            assert WaitingListEntry.query.filter_by(
                lesson_instance_id=instance_id, player_id=player_id).first() is None
            assert Conversation.query.count() == 0

    def test_offered_player_is_accepted_and_double_tap_is_idempotent(self, app, client):
        from padel_app.models.waiting_list_entry import WaitingListEntry

        with app.app_context():
            ids = _seed("offered")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                _send_offer(ids)
            instance_id, player_id, user_id = ids["instance"].id, ids["player"].id, ids["player_user_id"]
        headers = self._headers(app, user_id)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            res = client.post(
                "/api/app/notify/respond_waiting_list",
                json={"lessonInstanceId": instance_id, "action": "yes"},
                headers=headers,
            )
            assert res.status_code == 200, res.get_json()
            assert res.get_json()["action"] == "added_to_waiting_list"
            # A double tap on the same offer stays idempotent (PAD-124).
            again = client.post(
                "/api/app/notify/respond_waiting_list",
                json={"lessonInstanceId": instance_id, "action": "yes"},
                headers=headers,
            )
        assert again.status_code == 200
        with app.app_context():
            entries = WaitingListEntry.query.filter_by(
                lesson_instance_id=instance_id, player_id=player_id).all()
            assert len(entries) == 1 and entries[0].is_active

    def test_service_refuses_without_offer_before_touching_the_instance(self, app):
        from werkzeug.exceptions import Forbidden
        from padel_app.services.notification_service import respond_to_waiting_list

        with app.app_context():
            ids = _seed("svc")
            with patch(PATCHES[0]), patch(PATCHES[1]):
                try:
                    respond_to_waiting_list(ids["instance"].id, "yes", ids["player_user_id"])
                except Forbidden:
                    pass
                else:
                    raise AssertionError("expected 403 Forbidden")
