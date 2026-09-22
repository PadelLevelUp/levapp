"""
PAD-381 / bug B-152 — marking a student PRESENT clears the justification.

A coach marks a student "absent, justified", then corrects the mark to "present". The
row ended up `status = present`, `justification = justified`: `add_presences` hands
status and justification to the form layer, which leaves an empty, null or absent
value alone, so the old justification survived.

This is a domain rule and lives in the service, not in the form layer (PAD-367): on
this route "no justification" is expressed by ABSENCE — the App Store builds mark
present with the key omitted — and "an absent key is left alone" is exactly what kept
the stale value. A justification describes an absence; a present row has none,
whatever the body carries.

Every case goes through `POST /api/app/class_instance/presences/confirm`. Fixed class
date, no wall clock. Un-marking attendance is a separate, open product question and is
not covered here.

Covered spec: attendance.validation rule 21; attendance.stats rules 2–3.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


@pytest.fixture(autouse=True)
def _no_outbound():
    with patch(PATCHES[0]), patch(PATCHES[1]):
        yield


def _h(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(app):
    from padel_app.models import Association_CoachPlayer, Player, Presence, User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig

    def user(name, username):
        u = User(name=name, username=username, email=f"{username}@test.com", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    with app.app_context():
        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        ana = Coach(user_id=user("Ana", "ana-381").id, approval_status="approved")
        db.session.add(ana)
        db.session.flush()
        db.session.add(NotificationConfig(coach_id=ana.id, auto_notify_enabled=False))
        rui = Player(user_id=user("Rui", "rui-381").id)
        db.session.add(rui)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=ana.id, player_id=rui.id))
        start = datetime(2026, 9, 14, 10, 0)
        end = datetime(2026, 9, 14, 11, 0)
        lesson = Lesson(title="Ana class", start_datetime=start, end_datetime=end, is_recurring=False,
                        type="academy", max_players=4, color="#000", status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ana.id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=end, max_players=4,
                              status="scheduled", notifications_enabled=False)
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ana.id, lesson_instance_id=inst.id))
        db.session.add(Presence(lesson_instance_id=inst.id, player_id=rui.id, invited=True, confirmed=True))
        db.session.commit()
        return {"ana": ana.user_id, "rui": rui.id, "lesson": lesson.id, "instance": inst.id}


def _mark(client, app, world, mark):
    """POST one mark for Rui; returns the row's (status, justification) afterwards."""
    from padel_app.models import Presence

    res = client.post(
        "/api/app/class_instance/presences/confirm",
        headers=_h(app, world["ana"]),
        json={
            "classInstance": {"id": f"lessoninstance-{world['instance']}",
                              "originalId": world["instance"], "parentClassId": world["lesson"]},
            "presences": [{"playerId": world["rui"], **mark}],
        },
    )
    assert res.status_code == 200, res.data
    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=world["instance"], player_id=world["rui"]).one()
        return row.status, row.justification


ABSENT_JUSTIFIED = {"status": "absent", "justification": "justified"}


# ── absent, justified → present: the justification goes ──────────────────────

@pytest.mark.parametrize(
    "present_mark",
    [
        {"status": "present", "justification": ""},      # what the ticket's repro sent
        {"status": "present", "justification": None},
        {"status": "present"},                           # the App Store builds: the key is omitted
        {"status": "present", "justification": "justified"},   # whatever the body carries
    ],
    ids=["empty", "null", "key-omitted", "stale-value-sent"],
)
def test_marking_present_clears_a_justification(client, app, world, present_mark):
    assert _mark(client, app, world, ABSENT_JUSTIFIED) == ("absent", "justified")
    assert _mark(client, app, world, present_mark) == ("present", None)


def test_a_justification_sent_with_no_status_onto_a_present_row_is_cleared_too(client, app, world):
    """The rule reads the row's status AFTER the write, not the body's: a body that carries
    only a justification cannot put one on a row that is already present (#357 review, nit 7)."""
    assert _mark(client, app, world, {"status": "present"}) == ("present", None)
    assert _mark(client, app, world, {"justification": "justified"}) == ("present", None)


def test_a_first_mark_of_present_has_no_justification(client, app, world):
    assert _mark(client, app, world, {"status": "present"}) == ("present", None)


# ── the other half of the 2×2: an absence keeps and changes its justification ─

def test_changing_the_justification_of_an_absence_is_still_written(client, app, world):
    assert _mark(client, app, world, ABSENT_JUSTIFIED) == ("absent", "justified")
    assert _mark(client, app, world, {"status": "absent", "justification": "unjustified"}) == ("absent", "unjustified")


def test_present_then_absent_justified_writes_the_justification(client, app, world):
    assert _mark(client, app, world, {"status": "present"}) == ("present", None)
    assert _mark(client, app, world, ABSENT_JUSTIFIED) == ("absent", "justified")


def test_an_absence_marked_again_without_a_justification_keeps_the_one_it_had(client, app, world):
    """Not this ticket's rule: on an ABSENT row an omitted key still means 'leave it' (PAD-367)."""
    assert _mark(client, app, world, ABSENT_JUSTIFIED) == ("absent", "justified")
    assert _mark(client, app, world, {"status": "absent"}) == ("absent", "justified")
