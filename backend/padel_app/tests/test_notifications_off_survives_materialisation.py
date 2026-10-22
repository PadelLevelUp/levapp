"""A class created with notifications off keeps them off when its occurrence is materialised later.

`add_class` stores `notificationsEnabled` on the Lesson; a one-off class (or a series' later
occurrence) has no LessonInstance until something materialises it — a join request, a
cancellation, a side set. The new instance must carry the lesson's flag: the engine reads
`instance.notifications_enabled` (`trigger_invitations`, `_start_vacancy`), so a lost `False` meant
students were invited for a class the coach had switched off.

Each "nothing sent" cell sits beside the same class with notifications on, which does invite (R-032).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad130_open_spots import _config


def _quiet(monkeypatch):
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    monkeypatch.setattr("padel_app.services.notification_service.publish", lambda event, recipients: None)


def _materialised_by_a_join_request(app, ids, *, notifications, recurring):
    """A class created through `add_class_service` with `notificationsEnabled` as given, never
    materialised; a roster student asks to join its occurrence (one-off: the class's own date;
    series: the second week), which materialises it. Returns (instance_id, coach_id)."""
    from padel_app.models import Coach
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services.class_join_request_service import create_join_request_service
    from padel_app.services.lesson_service import add_class_service
    from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

    title = f"Flag {notifications} {recurring}"
    with app.app_context():
        coach = db.session.get(Coach, ids["coach_id"])
        first = (utc_to_wall_naive(utcnow_naive()) + timedelta(days=2)).date()
        body = {"name": title, "classType": "academy", "date": first.isoformat(), "startTime": "18:00",
                "endTime": "19:00", "maxPlayers": 2, "playerIds": [], "isRecurring": recurring,
                "notificationsEnabled": notifications, "levelId": ids["level_ids"]["5"]}
        if recurring:
            body["recurrenceRule"] = {"frequency": "weekly", "daysOfWeek": [(first.weekday() + 1) % 7]}
            body["endDate"] = (first + timedelta(weeks=4)).isoformat()
        add_class_service(body, coach, Club.query.first(), notify_students=False)
        db.session.commit()
        lesson = Lesson.query.filter_by(title=title).one()
        lesson.default_level_id = ids["level_ids"]["5"]
        db.session.commit()
        for i in range(3):
            _add_student(ids["coach_id"], f"roster{notifications}{recurring}{i}", level_id=ids["level_ids"]["5"])
        asker = _add_student(ids["coach_id"], f"asker{notifications}{recurring}", level_id=ids["level_ids"]["5"])
        db.session.commit()
        date = first + timedelta(weeks=1) if recurring else first
        row, _ = create_join_request_service(db.session.get(Player, asker), "Lesson", lesson.id, date.isoformat())
        return row.lesson_instance_id, ids["coach_id"]


@pytest.mark.parametrize("recurring", [False, True], ids=["one-off", "series"])
@pytest.mark.parametrize("notifications", [False, True], ids=["off", "on-control"])
def test_a_class_created_with_notifications_off_invites_nobody_once_materialised(app, monkeypatch, recurring, notifications):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import trigger_invitations

    _quiet(monkeypatch)
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    instance_id, coach_id = _materialised_by_a_join_request(app, ids, notifications=notifications, recurring=recurring)
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        assert instance.notifications_enabled is notifications
        trigger_invitations(instance, coach_id)
        sent = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count()
        assert (sent > 0) is notifications, sent
