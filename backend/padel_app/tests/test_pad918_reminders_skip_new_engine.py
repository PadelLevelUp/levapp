"""engine-timeline rule 2 as amended (PAD-918, batch 2): the engine owns a new-engine session's
attendance requests, so the app's reminder flow skips it at every entry, and a switched coach's
students never get both."""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.mark.criterion("NOTIFICATIONS-REMINDERS-34")
def test_the_apps_reminders_skip_a_new_engine_session(app, monkeypatch):
    from padel_app import scheduler
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models import ReminderAttempt
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.services.past_due_service import past_due
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (s,), (regular, *_) = _seed(app, starts=(START + timedelta(hours=6),))
        coach_id = store.coach_of(s)
        config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, engine_version="new",
                                    engine_switched_at=NOW - timedelta(days=1))
        config.reminder_timing = {"firstReminder": {"type": "hours_before", "value": 48}}   # due already
        db.session.add(config)
        db.session.commit()
        inst = db.session.get(LessonInstance, int(s))

        assert send_class_reminders(int(s), now=NOW, scheduled=True)["sent"] == 0
        assert ReminderAttempt.query.filter_by(lesson_instance_id=int(s)).count() == 0

        with patch.object(scheduler, "_scheduler") as sched:
            assert scheduler.arm_ask_for_student(inst, int(regular), now=NOW) is False
            sched.add_job.assert_not_called()

        assert past_due(coach_id, now=NOW)["reminders"] == []
