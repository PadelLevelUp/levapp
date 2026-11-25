"""calendar.event-detail rule 5 / CALENDAR-EVENT-DETAIL-42 (PO M-7384, M-7512): a student's class payload carries
the class's filled-spots count, the number the calendar event shows (`participantCount`), from the same helper;
no names or ids, and the payload is scoped as before (an outsider still gets 403 and no count)."""
import pytest
from datetime import datetime, timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad257_class_read_scope import _h, _jwt_secret, world  # noqa: F401


def _enrol(app, world, player_ids, declined=()):
    from padel_app.models import Presence

    with app.app_context():
        for pid in player_ids:
            db.session.add(Presence(lesson_instance_id=world["instance"], player_id=pid, invited=True, confirmed=True,
                                    status="absent" if pid in declined else "present"))
        db.session.commit()


def _sara(app, world):
    from padel_app.models import Player

    with app.app_context():
        return Player.query.filter_by(user_id=world["sara"]).one().id


def _payload(app, client, world, who):
    return client.post(f"/api/app/class_instance?model=lessoninstance&id={world['instance']}", headers=_h(app, world[who]))


def _event_count(app, client, world, who):
    day = (datetime.utcnow() + timedelta(days=2)).date().isoformat()
    events = client.get(f"/api/app/calendar?from={day}T00:00:00&to={day}T23:59:59", headers=_h(app, world[who])).get_json()
    return [e for e in events if e.get("originalId") == world["instance"] and e.get("model") == "LessonInstance"][0]["participantCount"]


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-42")
def test_enrolled_student_payload_count_equals_the_calendar_event(app, client, world):
    _enrol(app, world, [_sara(app, world)])  # rui (the enrolled student) + one more
    res = _payload(app, client, world, "rui")
    assert res.status_code == 200
    assert res.get_json()["participantCount"] == _event_count(app, client, world, "rui") == 2
    assert len(res.get_json()["participants"]) == 1  # names stay hidden: only the viewer


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-42")
def test_a_declined_student_is_not_counted(app, client, world):
    pid = _sara(app, world)
    _enrol(app, world, [pid], declined=[pid])
    assert _payload(app, client, world, "rui").get_json()["participantCount"] == 1


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-42")
def test_the_coach_payload_carries_the_same_number(app, client, world):
    assert _payload(app, client, world, "ana").get_json()["participantCount"] == _event_count(app, client, world, "ana")


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-42")
def test_an_outsider_still_gets_403_and_no_count(app, client, world):
    res = _payload(app, client, world, "sara")
    assert res.status_code == 403 and "participantCount" not in res.get_data(as_text=True)
