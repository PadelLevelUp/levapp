"""notifications.config rule 20, CONFIG-74 (PAD-918): the class payloads a student reads say which
engine runs the class and whether its coach offers the waiting-list side choice."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-74")
def test_student_class_payloads_say_the_engine_and_the_side_choice(app):
    from padel_app.models import EngineSession
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.serializers.calendar_event import serialize_calendar_event
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.academy_class_service import list_academy_classes

    with app.app_context():
        store, (new, old), (_, student, _) = _seed(app, starts=(START, START + timedelta(hours=3)))
        coach_id = store.coach_of(new)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, open_spots_visible=True,
                                          engine_version="new", engine_switched_at=NOW,
                                          waiting_list_side_choice=True))
        EngineSession.query.filter_by(lesson_instance_id=int(old)).delete()     # drained on the old engine
        db.session.commit()

        def fields(payload):
            return payload["engineVersion"], payload["waitingListSideChoice"]

        new_i, old_i = (db.session.get(LessonInstance, int(s)) for s in (new, old))
        assert fields(serialize_calendar_event(new_i, now=NOW)) == ("new", True)
        assert fields(serialize_calendar_event(old_i, now=NOW)) == ("old", False)
        assert fields(serialize_class_instance(new_i, viewer_player_id=int(student))) == ("new", True)
        assert fields(serialize_class_instance(old_i, viewer_player_id=int(student))) == ("old", False)

        academy = list_academy_classes(db.session.get(Player, int(student)), coach_id, now=NOW)["classes"]
        assert {c["originalId"]: fields(c) for c in academy if c["model"] == "LessonInstance"} == {
            int(new): ("new", True), int(old): ("old", False)}
