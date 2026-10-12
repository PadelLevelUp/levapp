"""PAD-611 — a student's calendar says what each class is to them (calendar.view rule 22).

Every event on a student's calendar carries `studentRelation`: enrolled / not_coming /
attended / missed for their own classes, `invited` for a live invitation to an occurrence they
are not in, `waiting` for an active waiting-list entry, `open_spot` for PAD-130's offers. Each
occurrence once, by precedence. `invited` and `waiting` reach only a client that declares
`student-relations` — App Store 1.3.0 would draw them as bookings (point 9 of the accepted
default). Every "gets nothing" assertion sits beside a control that WOULD get it (R-032).
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.utils.dates import utcnow_naive

DECLARED = {"X-LevApp-Capabilities": "open-spots,student-relations"}
OPEN_SPOTS_ONLY = {"X-LevApp-Capabilities": "open-spots"}  # App Store 1.3.0's declaration


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _instance(app, ids, *, days, title):
    """One more future class of the seeded coach, at level 5 with room."""
    from padel_app.models import Association_CoachLesson, Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    with app.app_context():
        base = db.session.get(Lesson, ids["lesson_id"])
        start = utcnow_naive().replace(minute=0, second=0, microsecond=0) + timedelta(days=days)
        lesson = Lesson(
            title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=4, color="#1355DC",
            status="active", club_id=base.club_id, default_level_id=ids["level_ids"]["5"],
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        inst = LessonInstance(
            lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
            max_players=4, status="scheduled", notifications_enabled=True,
            level_id=ids["level_ids"]["5"], original_lesson_occurence_date=start.date(),
        )
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
        db.session.commit()
        return inst.id


def _world(app):
    """Monday enrolled, Tuesday "Não vou", Wednesday invited, Thursday waiting."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol

    ids = _seed(app, eligibility_rules=None)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "rel", level_id=ids["level_ids"]["5"])
        db.session.commit()
        token = create_access_token(identity=str(db.session.get(Player, pid).user_id))
    ids.update(player_id=pid, auth={"Authorization": f"Bearer {token}"})
    ids["enrolled"] = _instance(app, ids, days=4, title="Enrolled")
    ids["not_coming"] = _instance(app, ids, days=5, title="Not coming")
    ids["invited"] = _instance(app, ids, days=6, title="Invited")
    ids["waiting"] = _instance(app, ids, days=7, title="Waiting")
    with app.app_context():
        enrol(pid, db.session.get(LessonInstance, ids["enrolled"]), "roster")
        p = enrol(pid, db.session.get(LessonInstance, ids["not_coming"]), "roster", confirmed=True)
        p.status, p.justification = "absent", "justified"
        db.session.add(NotificationEvent(lesson_instance_id=ids["invited"], player_id=pid, coach_id=ids["coach_id"], status="sent"))
        db.session.add(WaitingListEntry(
            lesson_instance_id=ids["waiting"], player_id=pid, coach_id=ids["coach_id"], is_active=True,
        ))
        db.session.commit()
    return ids


def _calendar(client, ids, headers=None):
    now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}
    resp = client.get("/api/app/calendar", query_string=window, headers={**ids["auth"], **(headers or {})})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    return resp.get_json()


def _relations(events):
    return {e["originalId"]: e.get("studentRelation") for e in events if e.get("model") == "LessonInstance"}


def test_a_declaring_client_gets_each_class_with_its_relation_once(app, client):
    ids = _world(app)
    events = _calendar(client, ids, DECLARED)
    rel = _relations(events)
    assert rel[ids["enrolled"]] == "enrolled"
    assert rel[ids["not_coming"]] == "not_coming"
    assert rel[ids["invited"]] == "invited"
    assert rel[ids["waiting"]] == "waiting"
    # each occurrence once
    lesson_ids = [e["originalId"] for e in events if e.get("model") == "LessonInstance"]
    assert len(lesson_ids) == len(set(lesson_ids))


def test_an_undeclared_client_gets_no_invited_or_waiting_events(app, client):
    """Point 9: App Store 1.3.0 (open-spots only) and older get exactly the old calendar."""
    ids = _world(app)
    # Control: the declaring client does get them.
    declared = _relations(_calendar(client, ids, DECLARED))
    assert declared[ids["invited"]] == "invited" and declared[ids["waiting"]] == "waiting"
    for headers in (OPEN_SPOTS_ONLY, None):
        events = _calendar(client, ids, headers)
        ids_on_calendar = [e.get("originalId") for e in events]
        assert ids["invited"] not in ids_on_calendar
        assert ids["waiting"] not in ids_on_calendar
        assert all(e.get("studentRelation") not in ("invited", "waiting") for e in events)
        # their own classes are still there, as before
        assert ids["enrolled"] in ids_on_calendar and ids["not_coming"] in ids_on_calendar


def test_invited_beats_waiting_and_both_show_with_the_open_spot_toggle_off(app, client):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _world(app)
    with app.app_context():
        db.session.add(WaitingListEntry(
            lesson_instance_id=ids["invited"], player_id=ids["player_id"], coach_id=ids["coach_id"], is_active=True,
        ))
        db.session.commit()
    # The seed's coach never turned open spots on: invited and waiting still show.
    rel = _relations(_calendar(client, ids, DECLARED))
    assert rel[ids["invited"]] == "invited"
    assert rel[ids["waiting"]] == "waiting"


def test_an_expired_invitation_and_an_inactive_entry_show_nothing(app, client):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _world(app)
    with app.app_context():
        NotificationEvent.query.filter_by(lesson_instance_id=ids["invited"]).one().status = "expired"
        WaitingListEntry.query.filter_by(lesson_instance_id=ids["waiting"]).one().is_active = False
        db.session.commit()
    ids_on_calendar = [e.get("originalId") for e in _calendar(client, ids, DECLARED)]
    assert ids["invited"] not in ids_on_calendar
    assert ids["waiting"] not in ids_on_calendar


def test_an_answered_invitation_is_not_live(app, client):
    from padel_app.models.notification_event import NotificationEvent

    ids = _world(app)
    with app.app_context():
        NotificationEvent.query.filter_by(lesson_instance_id=ids["invited"]).one().answer = "no"
        db.session.commit()
    assert ids["invited"] not in [e.get("originalId") for e in _calendar(client, ids, DECLARED)]


def test_attended_and_missed_are_the_coachs_record(app, client):
    from padel_app.models.presences import Presence

    ids = _world(app)
    with app.app_context():
        p = Presence.query.filter_by(lesson_instance_id=ids["enrolled"], player_id=ids["player_id"]).one()
        p.status, p.validated = "present", True
        q = Presence.query.filter_by(lesson_instance_id=ids["not_coming"], player_id=ids["player_id"]).one()
        q.validated = True
        db.session.commit()
    rel = _relations(_calendar(client, ids, DECLARED))
    assert rel[ids["enrolled"]] == "attended"
    assert rel[ids["not_coming"]] == "missed"
