"""PAD-330: a coach putting a student in a class tells the student.

Enrolment was silent on every coach-initiated path — creating a class with
students on it, adding one to the series, adding one to a single occurrence,
putting back someone who had cancelled. `lesson_service` contained no push, no
message and no publish call at all. A class simply appeared on a student's
calendar: a commitment they never agreed to, with no reason to go looking.

They learned of it only because the ordinary reminder eventually asked them,
which is not a notification but a side effect — and it never happens for a
student added after that reminder has already fired.

It is a normal message in the coach-student thread. Not a new push type: a
class-shaped payload is what produced the founder-facing "não foi possível
encontrar esta aula" (PAD-324).
"""
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES, _seed_coach_and_student, _seed_instance,
)


def _added_messages(app, player_user_id=None):
    """Every `added_to_class` message, newest last."""
    from padel_app.models import Message

    with app.app_context():
        rows = [
            m for m in Message.query.order_by(Message.id).all()
            if (m.msg_metadata or {}).get("addedToClass") is True
        ]
        if player_user_id is None:
            return rows
        from padel_app.models import ConversationParticipant

        convs = {
            c.conversation_id
            for c in ConversationParticipant.query.filter_by(user_id=player_user_id).all()
        }
        return [m for m in rows if m.conversation_id in convs]


def _student_user_id(app, player_id):
    from padel_app.models.players import Player

    with app.app_context():
        return db.session.get(Player, player_id).user_id


def _club(app):
    from padel_app.models.clubs import Club

    with app.app_context():
        club = Club(name="Test Club", description="", location="Test City")
        db.session.add(club)
        db.session.commit()
        return club.id


# --- the coach's three doors ------------------------------------------------

def test_creating_a_class_with_a_student_tells_them(app):
    """And the push keeps the message shape — the binding constraint."""
    from padel_app.services.lesson_service import create_lesson_helper

    ids = _seed_coach_and_student(app)
    club_id = _club(app)
    with app.app_context():
        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo:
            expo.return_value = True
            from datetime import datetime, timedelta

            start = datetime.utcnow() + timedelta(days=3)
            create_lesson_helper({
                "title": "Segunda 10h", "type": "academy", "status": "active",
                "max_players": 4, "color": "#000", "club": club_id,
                "start_datetime": start, "end_datetime": start + timedelta(hours=1),
                "coach": ids["coach_id"], "player_ids": [ids["student_id"]],
            })

    msgs = _added_messages(app, ids["student_user_id"])
    assert len(msgs) == 1, "told once, in the coach-student thread"
    assert "Segunda 10h" in msgs[0].text, "the message names the class"

    data = expo.call_args.kwargs["data"]
    assert data["type"] == "message", (
        'a class-shaped push is what PAD-324 fixed; this must stay a message'
    )
    assert data["conversationId"] is not None


def test_adding_a_student_to_the_series_tells_them(app):
    """Built on a lesson created the way the app creates one, so it carries the
    lesson-level coach link that `edit_lesson_helper` resolves the coach from."""
    from datetime import datetime, timedelta

    from padel_app.services.lesson_service import create_lesson_helper, edit_lesson_helper
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed_coach_and_student(app)
    club_id = _club(app)
    with app.app_context():
        carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
        start = datetime.utcnow() + timedelta(days=4)
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            lesson = create_lesson_helper({
                "title": "Terça 18h", "type": "academy", "status": "active",
                "max_players": 4, "color": "#000", "club": club_id,
                "start_datetime": start, "end_datetime": start + timedelta(hours=1),
                "coach": ids["coach_id"],
            })
            assert _added_messages(app, carol_uid) == [], "nobody placed, nobody told"

            edit_lesson_helper(
                {"add_player_ids": [carol], "date": start.date().isoformat()},
                lesson,
            )

    assert len(_added_messages(app, carol_uid)) == 1


def test_adding_a_student_to_one_occurrence_tells_them(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"])
    with app.app_context():
        carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            enrol(carol, db.session.get(LessonInstance, iid), "coach")

    assert len(_added_messages(app, carol_uid)) == 1


def test_putting_back_a_student_who_cancelled_tells_them(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder

    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"])
    # the seeder places the student through the same coach path, so it tells
    # them too — what is under test is the message the RE-ADD sends
    before = len(_added_messages(app, ids["student_user_id"]))
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")

    assert len(_added_messages(app, ids["student_user_id"])) == before + 1


# --- the guards: who must NOT be told ---------------------------------------

def test_materialising_a_class_tells_nobody(app):
    """The noise guard, and the one that matters most.

    Materialisation enrols every roster player on every occurrence. If it told
    them, a student in a weekly class would get a message per week for a class
    they were told about once, when the coach put them in it.
    """
    from datetime import datetime, timedelta

    from padel_app.models import Lesson
    from padel_app.services.lesson_service import (
        create_lesson_helper, get_or_materialize_instance,
    )
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed_coach_and_student(app)
    _club_id = _club(app)
    with app.app_context():
        second, _ = _second_student(app, ids["coach_id"], "bruno")
        third, _ = _second_student(app, ids["coach_id"], "clara")
        start = datetime.utcnow() + timedelta(days=2)
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            lesson = create_lesson_helper({
                "title": "Weekly", "type": "academy", "status": "active",
                "max_players": 4, "color": "#000", "club": _club_id,
                "start_datetime": start, "end_datetime": start + timedelta(hours=1),
                "coach": ids["coach_id"],
                "player_ids": [ids["student_id"], second, third],
            })
            told_at_creation = len(_added_messages(app))
            assert told_at_creation == 3, "each student told once, when placed"

            lesson_id = lesson.id
            for day in (2, 9, 16):
                get_or_materialize_instance(
                    db.session.get(Lesson, lesson_id),
                    (datetime.utcnow() + timedelta(days=day)).date(),
                )

    assert len(_added_messages(app)) == told_at_creation, (
        "materialising occurrences tells nobody; they were told when placed"
    )


def test_an_engine_fill_does_not_send_this_message(app):
    """Invitations, waiting-list placements and accepted requests send their own."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"])
    with app.app_context():
        carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)

    assert _added_messages(app, carol_uid) == []


@pytest.mark.parametrize("source", ["walk_in", "import"])
def test_recording_a_class_that_already_happened_tells_nobody(app, source):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"])
    with app.app_context():
        carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
        with patch(PATCHES[0]), patch(PATCHES[1]), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            enrol(carol, db.session.get(LessonInstance, iid), source)

    assert _added_messages(app, carol_uid) == []


# --- the template ------------------------------------------------------------

def test_a_coach_whose_templates_predate_the_key_still_gets_text(app):
    """`get_message_templates` merges defaults under stored, so an older config
    gains the new key without a migration or a backfill."""
    from padel_app.services.notification_service import get_or_create_config

    ids = _seed_coach_and_student(app)
    with app.app_context():
        config = get_or_create_config(ids["coach_id"])
        config.message_templates = {"reminder": "custom reminder"}
        db.session.commit()

        templates = config.get_message_templates("pt")
        assert templates["reminder"] == "custom reminder", "their customisation wins"
        assert "{class}" in templates["added_to_class"], "and the new key is there"


def test_a_coach_can_use_the_same_placeholders_as_every_other_template(app):
    """A coach editing this template finds the vocabulary they already know.

    Every neighbouring template describes a class as level + weekday + time;
    `{class}` and `{when}` are additions, not a replacement. Without this, the
    first coach to reuse their muscle memory renders a literal "{weekday}" at a
    student — which nobody files as a bug, they just conclude the templates are
    unreliable.
    """
    from datetime import datetime, timedelta

    from padel_app.services.lesson_service import create_lesson_helper
    from padel_app.services.notification_service import get_or_create_config

    ids = _seed_coach_and_student(app)
    club_id = _club(app)
    with app.app_context():
        config = get_or_create_config(ids["coach_id"])
        config.message_templates = {
            "added_to_class": "{name}: {level} {weekday} {time} | {class}{when}"
        }
        db.session.commit()

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo:
            expo.return_value = True
            start = datetime.utcnow() + timedelta(days=3)
            create_lesson_helper({
                "title": "Segunda 10h", "type": "academy", "status": "active",
                "max_players": 4, "color": "#000", "club": club_id,
                "start_datetime": start, "end_datetime": start + timedelta(hours=1),
                "coach": ids["coach_id"], "player_ids": [ids["student_id"]],
            })

    msgs = _added_messages(app, ids["student_user_id"])
    assert len(msgs) == 1
    text = msgs[0].text
    assert "{" not in text, "every placeholder resolved, not only the new ones: " + text
    assert "Segunda 10h" in text, "the class title still reaches the student"


def test_accepting_a_students_own_class_request_does_not_tell_them_again(app):
    """They asked for this class and already get the acceptance message.

    Found by the full suite rather than by design: `_create_class_and_accept`
    goes through the same creation path a coach uses, so the student who
    requested a class was told their coach had added them to it — a second
    message for one event, about something they initiated.
    """
    from padel_app.tests.test_pad104_class_requests import _decide, _request, _setup

    ids = _setup(app)
    rid = _request(app, ids)
    with app.app_context():
        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo:
            expo.return_value = True
            assert _decide(app, ids, rid, "accept") == "accepted"

    student_user_id = _student_user_id(app, ids["player_id"])
    assert _added_messages(app, student_user_id) == [], (
        "the student initiated this; the acceptance message is the whole story"
    )
