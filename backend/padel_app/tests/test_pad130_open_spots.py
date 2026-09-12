"""PAD-130 — eligibility.open-spot-visibility: open spots in the student's calendar.

Reuses the Phase-1 eligibility seed: ladder `4 → 5 → 5-`, one class at level
`5` with `max_players` 4, a coach standard bar passed in. Students are added
with `_add_student`; the calendar is read through `load_open_spot_events_for_player`
and the route.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.models import Presence
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.utils.dates import utcnow_naive

LEVEL_SAME = [{"attribute": "level", "operation": "same_as_class"}]


def _config(app, ids, **fields):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        for k, v in fields.items():
            setattr(cfg, k, v)
        db.session.commit()


def _open_spots(app, player_id, days=30):
    from padel_app.helpers.calendar_helpers import load_open_spot_events_for_player

    with app.app_context():
        now = utcnow_naive()
        return load_open_spot_events_for_player(player_id, now - timedelta(days=1), now + timedelta(days=days))


def _student(app, ids, name, level="5"):
    """`_add_student` only flushes; commit so a fresh app context sees them."""
    with app.app_context():
        pid = _add_student(ids["coach_id"], name, level_id=ids["level_ids"][level])
        db.session.commit()
    return pid


def _fill(app, ids, count):
    """Enrol `count` other students so the class holds that many."""
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance

    with app.app_context():
        for i in range(count):
            pid = _add_student(ids["coach_id"], f"filler{i}", level_id=ids["level_ids"]["5"])
            db.session.add(Association_PlayerLessonInstance(player_id=pid, lesson_instance_id=ids["instance_id"]))
            db.session.add(Presence(player_id=pid, lesson_instance_id=ids["instance_id"], invited=True, enrolment_source="coach"))  # PAD-259
        db.session.commit()


def test_eligible_student_sees_a_visible_class_with_room(app):
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    _fill(app, ids, 3)  # 3 of 4
    pid = _student(app, ids, "eligible", "5")
    events = _open_spots(app, pid)
    assert len(events) == 1
    assert events[0]["openSpot"] is True
    assert events[0]["participantCount"] == 3 and events[0]["maxPlayers"] == 4
    assert events[0]["coachName"] == "Coach"


def test_ineligible_student_sees_nothing(app):
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "weak", "5-")
    assert _open_spots(app, pid) == []


def test_a_full_class_is_not_advertised(app):
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    _fill(app, ids, 4)
    pid = _student(app, ids, "late", "5")
    assert _open_spots(app, pid) == []


def test_virtual_recurring_occurrence_is_advertised_without_materialising(app):
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        # The seed links only the instance to the coach; a series needs the lesson link.
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        lesson.is_recurring = True
        lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((lesson.start_datetime.weekday() + 1) % 7)
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=6)).date()
        # Four enrolled on the series (max 4 → full) … then loosen to 6.
        lesson.max_players = 6
        for i in range(4):
            pid = _add_student(ids["coach_id"], f"series{i}", level_id=ids["level_ids"]["5"])
            db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lesson.id))
        db.session.commit()
        pid = _add_student(ids["coach_id"], "browser", level_id=ids["level_ids"]["5"])
        db.session.commit()
        before = LessonInstance.query.count()
    events = _open_spots(app, pid, days=30)
    virtual = [e for e in events if e["model"] == "Lesson"]
    assert virtual, "next week's never-materialised occurrence is an open spot"
    assert all(e["openSpot"] and e["participantCount"] == 4 and e["maxPlayers"] == 6 for e in virtual)
    with app.app_context():
        assert LessonInstance.query.count() == before, "the read must not materialise"


def test_one_occurrence_can_be_hidden_inside_a_visible_series(app):
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

    ids = _seed(app, eligibility_rules=None)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        lesson.open_spots_visible = True
        inst = db.session.get(LessonInstance, ids["instance_id"])
        sibling = LessonInstance(
            lesson_id=lesson.id, start_datetime=inst.start_datetime + timedelta(days=7),
            end_datetime=inst.end_datetime + timedelta(days=7), max_players=4,
            status="scheduled", level_id=inst.level_id,
            original_lesson_occurence_date=(inst.start_datetime + timedelta(days=7)).date(),
        )
        db.session.add(sibling)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=sibling.id))
        inst.open_spots_visible = False
        db.session.commit()
        pid = _add_student(ids["coach_id"], "student", level_id=ids["level_ids"]["5"])
        db.session.commit()
        sibling_id = sibling.id
    events = _open_spots(app, pid)
    assert [e["originalId"] for e in events] == [sibling_id]


def test_toggle_off_restores_todays_calendar(app):
    ids = _seed(app, eligibility_rules=None)
    pid = _student(app, ids, "student", "5")
    assert _open_spots(app, pid) == []


def test_calendar_route_appends_open_spots_for_students_only(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        pid = _add_student(ids["coach_id"], "student", level_id=ids["level_ids"]["5"])
        db.session.commit()
        student_user_id = db.session.get(Player, pid).user_id
        student_token = create_access_token(identity=str(student_user_id))
        coach_token = create_access_token(identity=str(ids["coach_user_id"]))
        now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}

    as_student = client.get("/api/app/calendar", query_string=window, headers={"Authorization": f"Bearer {student_token}"}).get_json()
    assert [e.get("openSpot") for e in as_student] == [True]
    as_coach = client.get("/api/app/calendar", query_string=window, headers={"Authorization": f"Bearer {coach_token}"}).get_json()
    assert all(not e.get("openSpot") for e in as_coach)
