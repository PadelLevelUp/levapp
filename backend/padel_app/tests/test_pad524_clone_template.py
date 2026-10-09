"""PAD-524 (classes.clone): "Clonar aula" opens the new-class form prefilled from one server
derivation, GET /class_instance/clone_template. Values come from the series, never one
occurrence's overrides; students are the series roster (a one-off: its participants minus
anyone not coming); the start is left to the coach. POST /add_class takes the three lesson-tier
engine overrides so the clone is one write.
"""
import json
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import PATCHES, _seed_coach_and_student
from padel_app.tests.test_pad259_enrolment import _extra_player, _materialise
from padel_app.tests.test_pad474_participant_edit_scope import _seed_weekly_series


def _series(app):
    ids = _seed_coach_and_student(app)
    bruno = _extra_player(app, "Bruno")
    lesson_id, day = _seed_weekly_series(app, ids["coach_id"], [ids["student_id"], bruno])
    from padel_app.models import Lesson
    from padel_app.models.Association_CoachClub import Association_CoachClub

    with app.app_context():
        lesson = db.session.get(Lesson, lesson_id)
        # The coach is a member of the class's club, so /add_class creates there (clubs.crud rule 3).
        db.session.add(Association_CoachClub(coach_id=ids["coach_id"], club_id=lesson.club_id))
        lesson.title = "Quinta 18h"
        lesson.color = "#112233"
        lesson.eligibility_rules = [{"attribute": "level", "operation": "same_as_class"}]
        lesson.open_spots_visible = False
        lesson.auto_invites = True
        db.session.commit()
    return ids, bruno, lesson_id, day


def _template(app, lesson, day, instance=None):
    from padel_app.services.lesson_service import clone_template

    with app.app_context():
        from padel_app.models import Lesson, LessonInstance

        les = db.session.get(Lesson, lesson)
        inst = db.session.get(LessonInstance, instance) if instance else None
        return clone_template(les, occurrence_date=day, instance=inst, club_id=None)


def test_a_series_clone_copies_the_series_and_leaves_the_start_to_the_coach(app):
    ids, bruno, lesson_id, day = _series(app)
    t = _template(app, lesson_id, day)
    assert t["name"] == "Quinta 18h"
    assert t["classType"] == "academy" and t["maxPlayers"] == 4 and t["color"] == "#112233"
    assert t["date"] == day.isoformat()
    assert t["durationMinutes"] == 60
    assert "startTime" not in t and "endTime" not in t
    assert t["isRecurring"] is True
    assert t["recurrenceRule"]["daysOfWeek"] == [(day.weekday() + 1) % 7]
    assert t["endDate"] == (day + timedelta(weeks=6)).isoformat()
    assert sorted(t["playerIds"]) == sorted([str(ids["student_id"]), str(bruno)])
    assert t["eligibilityRules"] == [{"attribute": "level", "operation": "same_as_class"}]
    assert t["openSpotsVisible"] is False and t["autoInvites"] is True


def test_an_occurrences_own_overrides_are_not_copied(app):
    from padel_app.models import LessonInstance

    ids, bruno, lesson_id, day = _series(app)
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        inst = db.session.get(LessonInstance, instance_id)
        inst.overwrite_title = "Just today"
        inst.eligibility_rules = []
        db.session.commit()
    t = _template(app, lesson_id, day, instance=instance_id)
    assert t["name"] == "Quinta 18h"
    assert t["eligibilityRules"] == [{"attribute": "level", "operation": "same_as_class"}]


def test_a_student_who_cancelled_one_occurrence_is_still_copied_from_the_roster(app):
    from padel_app.models import Presence

    ids, bruno, lesson_id, day = _series(app)
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        row = Presence.query.filter_by(player_id=bruno, lesson_instance_id=instance_id).one()
        row.status = "absent"
        row.justification = "justified"
        db.session.commit()
    t = _template(app, lesson_id, day, instance=instance_id)
    assert str(bruno) in t["playerIds"]


def test_a_one_off_copies_its_participants_minus_anyone_not_coming(app):
    from padel_app.models import Lesson, Presence

    ids, bruno, lesson_id, day = _series(app)
    with app.app_context():
        lesson = db.session.get(Lesson, lesson_id)
        lesson.recurrence_rule = None
        lesson.is_recurring = False
        lesson.recurrence_end = None
        db.session.commit()
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        row = Presence.query.filter_by(player_id=bruno, lesson_instance_id=instance_id).one()
        row.status = "absent"
        row.justification = "justified"
        db.session.commit()
    t = _template(app, lesson_id, day, instance=instance_id)
    assert t["isRecurring"] is False and t["recurrenceRule"] is None and t["endDate"] is None
    assert t["playerIds"] == [str(ids["student_id"])]


def test_add_class_takes_the_lesson_tier_overrides_and_refuses_an_unknown_operation(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models import Lesson
    from padel_app.models.coaches import Coach

    ids, bruno, lesson_id, day = _series(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        coach = db.session.get(Coach, ids["coach_id"])
        token = create_access_token(identity=str(coach.user_id))
    headers = {"Authorization": f"Bearer {token}"}
    template = client.get(
        f"/api/app/class_instance/clone_template?model=Lesson&id={lesson_id}&date={day.isoformat()}",
        headers=headers,
    )
    assert template.status_code == 200, template.get_data(as_text=True)
    body = template.get_json()
    body.update({"startTime": "19:00", "endTime": "20:00"})
    body.pop("durationMinutes")

    bad = dict(body, eligibilityRules=[{"attribute": "level", "operation": "made_up_operation"}])
    refused = client.post("/api/app/add_class", json=bad, headers=headers)
    assert refused.status_code == 400 and "eligibilityRules" in refused.get_json().get("fields", [])

    with patch(PATCHES[0]), patch(PATCHES[1]), patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        made = client.post("/api/app/add_class", json=body, headers=headers)
    assert made.status_code == 200, made.get_data(as_text=True)
    new_id = int(made.get_json()["originalId"])
    assert new_id != lesson_id
    with app.app_context():
        clone = db.session.get(Lesson, new_id)
        assert clone.title == "Quinta 18h"
        assert clone.eligibility_rules == [{"attribute": "level", "operation": "same_as_class"}]
        assert clone.open_spots_visible is False and clone.auto_invites is True
        assert json.loads(clone.recurrence_rule)["daysOfWeek"] == body["recurrenceRule"]["daysOfWeek"]
        original = db.session.get(Lesson, lesson_id)
        assert original.title == "Quinta 18h"


def test_the_template_is_coach_only(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids, bruno, lesson_id, day = _series(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        token = create_access_token(identity=str(db.session.get(Player, ids["student_id"]).user_id))
    res = client.get(
        f"/api/app/class_instance/clone_template?model=Lesson&id={lesson_id}&date={day.isoformat()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_a_coach_of_another_club_gets_403(app, client):
    """#579 review: the template is a read of the class, so `require_readable_class` applies — a
    coach who neither owns the class nor coaches at its club cannot read it."""
    from flask_jwt_extended import create_access_token
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    ids, bruno, lesson_id, day = _series(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        u = User(name="Other Coach", username="other_coach_524", password="x")
        db.session.add(u)
        db.session.flush()
        other = Coach(user_id=u.id)
        db.session.add(other)
        db.session.commit()
        token = create_access_token(identity=str(u.id))
    res = client.get(
        f"/api/app/class_instance/clone_template?model=Lesson&id={lesson_id}&date={day.isoformat()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
