"""PAD-258 / audit H4 — attendance and reminder writes need ownership or
enrolment: reminders.14, attendance.confirm.17, toggle-class.4, manual.7,
invitations.5 (process_rounds superadmin-only)."""
from datetime import datetime, timedelta
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


def _h(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(app):
    from padel_app.models import (
        User, Player, Presence, Association_CoachPlayer,
        Association_PlayerLessonInstance,
    )
    from padel_app.models.coaches import Coach
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

    def user(name, username, **kw):
        u = User(name=name, username=username, email=f"{username}@test.com",
                 password="x", status="active", **kw)
        db.session.add(u); db.session.flush(); return u

    with app.app_context():
        club = Club(name="Club", description="", location="City")
        db.session.add(club); db.session.flush()
        ana = Coach(user_id=user("Ana", "ana-258").id, approval_status="approved")
        bruno = Coach(user_id=user("Bruno", "bruno-258").id, approval_status="approved")
        db.session.add_all([ana, bruno]); db.session.flush()
        for c in (ana, bruno):
            db.session.add(NotificationConfig(coach_id=c.id, auto_notify_enabled=True))
        rui = Player(user_id=user("Rui", "rui-258").id)       # enrolled, Ana's roster
        sara = Player(user_id=user("Sara", "sara-258").id)     # Ana's roster, not enrolled
        zed = Player(user_id=user("Zed", "zed-258").id)        # nobody's roster
        db.session.add_all([rui, sara, zed]); db.session.flush()
        db.session.add_all([
            Association_CoachPlayer(coach_id=ana.id, player_id=rui.id),
            Association_CoachPlayer(coach_id=ana.id, player_id=sara.id),
        ])
        start = datetime.utcnow() + timedelta(hours=30)
        lesson = Lesson(title="Ana class", start_datetime=start,
                        end_datetime=start + timedelta(hours=1), is_recurring=False,
                        type="academy", max_players=4, color="#000", status="active",
                        club_id=club.id)
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ana.id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=4,
                              status="scheduled", notifications_enabled=True)
        db.session.add(inst); db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ana.id, lesson_instance_id=inst.id))
        db.session.add(Association_PlayerLessonInstance(player_id=rui.id, lesson_instance_id=inst.id))
        db.session.add(Presence(lesson_instance_id=inst.id, player_id=rui.id, invited=True, confirmed=True))
        admin = user("Admin", "admin-258", is_superadmin=True)
        db.session.commit()
        return {"ana": ana.user_id, "bruno": bruno.user_id, "rui_user": rui.user_id,
                "zed_user": zed.user_id, "rui": rui.id, "sara": sara.id, "zed": zed.id,
                "lesson": lesson.id, "instance": inst.id, "admin": admin.id}


def _presences(instance_id):
    from padel_app.models import Presence
    return Presence.query.filter_by(lesson_instance_id=instance_id).all()


# ── reminders rule 13 ──────────────────────────────────────────────────────

def test_unenrolled_student_cannot_answer_a_reminder(app, client, world):
    from padel_app.models import Vacancy
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post("/api/app/notify/respond_reminder",
                          json={"lessonInstanceId": world["instance"], "action": "no"},
                          headers=_h(app, world["zed_user"]))
    assert res.status_code == 403
    with app.app_context():
        assert [p.player_id for p in _presences(world["instance"])] == [world["rui"]]
        assert Vacancy.query.filter_by(lesson_instance_id=world["instance"]).count() == 0


def test_enrolled_student_can_still_answer(app, client, world):
    with patch(PATCHES[0]), patch(PATCHES[1]), \
         patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        res = client.post("/api/app/notify/respond_reminder",
                          json={"lessonInstanceId": world["instance"], "action": "yes"},
                          headers=_h(app, world["rui_user"]))
    assert res.status_code == 200, res.get_json()


# ── attendance.confirm rule 17 ────────────────────────────────────────────

def _confirm_payload(world, player_id):
    return {
        "classInstance": {"id": f"lessoninstance-{world['instance']}",
                          "originalId": world["instance"], "parentClassId": world["lesson"]},
        "presences": [{"playerId": player_id, "status": "present"}],
    }


def test_other_coach_cannot_confirm_presences(app, client, world):
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post("/api/app/class_instance/presences/confirm",
                          json=_confirm_payload(world, world["rui"]),
                          headers=_h(app, world["bruno"]))
    assert res.status_code == 403
    with app.app_context():
        assert all(p.status != "present" for p in _presences(world["instance"]))


def test_owner_cannot_upsert_a_presence_for_a_stranger(app, client, world):
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post("/api/app/class_instance/presences/confirm",
                          json=_confirm_payload(world, world["zed"]),
                          headers=_h(app, world["ana"]))
    assert res.status_code == 403
    with app.app_context():
        assert [p.player_id for p in _presences(world["instance"])] == [world["rui"]]


def test_owner_confirms_an_enrolled_or_roster_player(app, client, world):
    with patch(PATCHES[0]), patch(PATCHES[1]), \
         patch("padel_app.utils.expo_push.send_expo_push_to_user"):
        res = client.post("/api/app/class_instance/presences/confirm",
                          json=_confirm_payload(world, world["sara"]),
                          headers=_h(app, world["ana"]))
    assert res.status_code == 200, res.get_json()


# ── toggle-class rule 4 ───────────────────────────────────────────────────

def test_other_coach_cannot_toggle_class_notifications(app, client, world):
    from padel_app.models import LessonInstance
    res = client.post("/api/app/notify/toggle_class",
                      json={"model": "LessonInstance", "originalId": world["instance"]},
                      headers=_h(app, world["bruno"]))
    assert res.status_code == 403
    with app.app_context():
        assert LessonInstance.query.get(world["instance"]).notifications_enabled is True


def test_owner_toggles_class_notifications(app, client, world):
    res = client.post("/api/app/notify/toggle_class",
                      json={"model": "LessonInstance", "originalId": world["instance"]},
                      headers=_h(app, world["ana"]))
    assert res.status_code == 200 and res.get_json()["notificationsEnabled"] is False


# ── manual rule 7 ─────────────────────────────────────────────────────────

def _manual(world, who, player_ids):
    return {"model": "LessonInstance", "originalId": world["instance"], "playerIds": player_ids}


def test_other_coach_cannot_send_manual_invitations(app, client, world):
    from padel_app.models import NotificationEvent
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post("/api/app/notify/manual", json=_manual(world, "bruno", [world["sara"]]),
                          headers=_h(app, world["bruno"]))
    assert res.status_code == 403
    with app.app_context():
        assert NotificationEvent.query.filter_by(lesson_instance_id=world["instance"]).count() == 0


def test_owner_cannot_invite_a_player_outside_their_roster(app, client, world):
    from padel_app.models import NotificationEvent
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post("/api/app/notify/manual", json=_manual(world, "ana", [world["zed"]]),
                          headers=_h(app, world["ana"]))
    assert res.status_code == 403
    with app.app_context():
        assert NotificationEvent.query.filter_by(lesson_instance_id=world["instance"]).count() == 0


# ── invitations rule 5: process_rounds ────────────────────────────────────

def test_process_rounds_is_superadmin_only(app, client, world):
    with patch("padel_app.modules.notification_engine_api.process_invitation_batches", return_value=0):
        assert client.post("/api/app/notify/process_rounds", headers=_h(app, world["ana"])).status_code == 403
        assert client.post("/api/app/notify/process_rounds", headers=_h(app, world["admin"])).status_code == 200
