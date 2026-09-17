"""PAD-358 — classes.academy-class-booking: a coach's next fourteen days of classes
the student may join, open -> request with a note, full -> the student's own
waiting-list place.

Seed: the Phase-1 eligibility fixture (ladder `4 -> 5 -> 5-`, one class at level
`5`, max 4, three days out) plus the classes each test adds. Every service call
takes `now=` so the fourteen-day window is exact (R-008).
"""
from datetime import datetime, timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.utils.dates import utcnow_naive, utc_to_wall_naive

LEVEL_SAME = [{"attribute": "level", "operation": "same_as_class"}]


def _setup(app, **seed):
    """Seeded coach with open spots visible and one eligible student (level 5)."""
    from padel_app.models.notification_config import NotificationConfig

    ids = _seed(app, eligibility_rules=LEVEL_SAME, **seed)
    with app.app_context():
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        cfg.open_spots_visible = True
        ids["student_id"] = _add_student(ids["coach_id"], "wizard", level_id=ids["level_ids"]["5"])
        db.session.commit()
    return ids


def _add_class(app, ids, *, days, title, level="5", max_players=4, filled=0, visible=None,
               materialize=True, recurring=False):
    """A class `days` out on the club's clock, `filled` of `max_players` taken."""
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        club = Club.query.first()
        start = utc_to_wall_naive(utcnow_naive()).replace(hour=18, minute=0, second=0, microsecond=0) + timedelta(days=days)
        lesson = Lesson(
            title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=recurring, type="academy", max_players=max_players, color="#123456",
            status="active", club_id=club.id, default_level_id=ids["level_ids"][level],
        )
        if recurring:
            lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((start.weekday() + 1) % 7)
            lesson.recurrence_end_date = (start + timedelta(weeks=4)).date()
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        instance_id = None
        if materialize:
            instance = LessonInstance(
                lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                max_players=max_players, status="scheduled", notifications_enabled=True,
                level_id=ids["level_ids"][level], original_lesson_occurence_date=start.date(),
                open_spots_visible=visible,
            )
            db.session.add(instance)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=instance.id))
            for n in range(filled):
                pid = _add_student(ids["coach_id"], f"{title}-filler-{n}", level_id=ids["level_ids"][level])
                enrol(pid, instance, "coach")
            instance_id = instance.id
        db.session.commit()
        return {"lesson_id": lesson.id, "instance_id": instance_id, "date": start.date().isoformat()}


def _list(app, ids, *, now=None, player_id=None):
    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import list_academy_classes

    with app.app_context():
        player = db.session.get(Player, player_id or ids["student_id"])
        return list_academy_classes(player, ids["coach_id"], now=now)


def _by_title(payload):
    return {c["title"]: c for c in payload["classes"]}


def _count(app, model_name, **filters):
    from padel_app import models

    with app.app_context():
        return getattr(models, model_name).query.filter_by(**filters).count()


# ── AC: an eligible student sees open and full classes for fourteen days ─────

def test_open_and_full_classes_are_listed_with_their_state(app):
    ids = _setup(app)
    _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6, filled=2)
    _add_class(app, ids, days=3, title="Full In Three", max_players=6, filled=6)

    payload = _list(app, ids)
    classes = _by_title(payload)
    assert classes["Open Tomorrow"]["state"] == "open"
    assert classes["Open Tomorrow"]["spotsLeft"] == 4
    assert classes["Full In Three"]["state"] == "full"
    assert classes["Full In Three"]["spotsLeft"] == 0
    for c in payload["classes"]:
        assert c["myJoinRequest"] is None and c["onWaitingList"] is False
        assert c["coachName"] == "Coach"
    starts = [(c["date"], c["startTime"]) for c in payload["classes"]]
    assert starts == sorted(starts)


def test_the_window_is_fourteen_club_local_days(app):
    ids = _setup(app)
    _add_class(app, ids, days=13, title="Day Thirteen", max_players=6)
    _add_class(app, ids, days=15, title="Day Fifteen", max_players=6)

    payload = _list(app, ids)
    today = utc_to_wall_naive(utcnow_naive()).date()
    assert payload["from"] == today.isoformat()
    assert payload["to"] == (today + timedelta(days=14)).isoformat()
    titles = _by_title(payload)
    assert "Day Thirteen" in titles and "Day Fifteen" not in titles


def test_the_read_materialises_nothing(app):
    ids = _setup(app)
    virtual = _add_class(app, ids, days=2, title="Weekly Virtual", max_players=6,
                         materialize=False, recurring=True)
    before = _count(app, "LessonInstance")
    titles = _by_title(_list(app, ids))
    assert titles["Weekly Virtual"]["state"] == "open"
    assert titles["Weekly Virtual"]["model"] == "Lesson"
    assert _count(app, "LessonInstance") == before
    assert virtual["instance_id"] is None


# ── AC: ineligible, hidden, enrolled and out-of-window classes are not listed ─

def test_classes_the_student_may_not_join_are_not_listed(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol

    ids = _setup(app)
    _add_class(app, ids, days=2, title="Above Level", level="4", max_players=6)
    _add_class(app, ids, days=2, title="Hidden", max_players=6, visible=False)
    mine = _add_class(app, ids, days=4, title="Mine", max_players=6)
    cancelled = _add_class(app, ids, days=5, title="Cancelled", max_players=6)
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, mine["instance_id"]), "coach")
        db.session.get(LessonInstance, cancelled["instance_id"]).status = "canceled"
        db.session.commit()

    titles = _by_title(_list(app, ids))
    for absent in ("Above Level", "Hidden", "Mine", "Cancelled"):
        assert absent not in titles, absent


def test_the_coach_toggle_off_empties_the_list(app):
    from padel_app.models.notification_config import NotificationConfig

    ids = _setup(app)
    _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6)
    with app.app_context():
        NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first().open_spots_visible = False
        db.session.commit()
    assert _list(app, ids)["classes"] == []


# ── AC: a student not on the coach's roster is refused ───────────────────────

def test_a_student_not_on_the_roster_is_refused(app):
    from padel_app.models import User
    from padel_app.models.players import Player

    ids = _setup(app)
    with app.app_context():
        user = User(name="Stranger", username="stranger", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        stranger = Player(user_id=user.id)
        db.session.add(stranger)
        db.session.commit()
        stranger_id = stranger.id
    with pytest.raises(HTTPException) as exc:
        _list(app, ids, player_id=stranger_id)
    assert exc.value.code == 403


# ── AC: requesting an open class with a note ─────────────────────────────────

def test_a_request_carries_the_note_to_the_coach(app):
    from padel_app.models import ClassJoinRequest
    from padel_app.models.players import Player
    from padel_app.services.class_join_request_service import (
        create_join_request_service,
        pending_requests_for_instance,
        serialize_join_request,
    )

    ids = _setup(app)
    open_class = _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6, filled=2)
    note = "Posso chegar 10 min depois?"
    with app.app_context():
        row, created = create_join_request_service(
            db.session.get(Player, ids["student_id"]), "LessonInstance", open_class["instance_id"], None,
            note=f"  {note}  ",
        )
        assert created and row.note == note
        # The coach's pending requests on the class payload carry it (rule 9).
        assert serialize_join_request(pending_requests_for_instance(open_class["instance_id"])[0])["note"] == note
        rid = row.id

    listed = _by_title(_list(app, ids))["Open Tomorrow"]
    assert listed["myJoinRequest"] == {"id": rid, "status": "pending"}


def test_a_note_over_500_characters_is_refused(app):
    from padel_app.models.players import Player
    from padel_app.services.class_join_request_service import create_join_request_service

    ids = _setup(app)
    open_class = _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6)
    with app.app_context():
        with pytest.raises(HTTPException) as exc:
            create_join_request_service(
                db.session.get(Player, ids["student_id"]), "LessonInstance", open_class["instance_id"], None,
                note="x" * 501,
            )
    assert exc.value.code == 400


# ── AC: joining a full class's waiting list ──────────────────────────────────

def _join(app, ids, **target):
    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import join_class_waiting_list_service

    with app.app_context():
        entry, created = join_class_waiting_list_service(
            db.session.get(Player, ids["student_id"]), target["model"], target["original_id"], target.get("date")
        )
        return entry.lesson_instance_id, entry.is_active, entry.standing_entry_id, created


def test_joining_a_full_class_waiting_list_is_one_entry_and_the_coach_is_told(app, monkeypatch):
    pushes = []
    events = []
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification",
                        lambda **kw: pushes.append(("web", kw["user_id"])))
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user",
                        lambda user_id, **kw: pushes.append(("ios", user_id, (kw.get("data") or {}).get("type"))))
    monkeypatch.setattr("padel_app.services.notification_service.publish",
                        lambda event, recipients: events.append((event["type"], list(recipients))))
    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Full In Three", max_players=2, filled=2)

    instance_id, active, standing, created = _join(app, ids, model="LessonInstance", original_id=full["instance_id"])
    assert (instance_id, active, standing, created) == (full["instance_id"], True, None, True)
    assert _join(app, ids, model="LessonInstance", original_id=full["instance_id"])[3] is False
    assert _count(app, "WaitingListEntry", lesson_instance_id=full["instance_id"], player_id=ids["student_id"]) == 1
    assert _by_title(_list(app, ids))["Full In Three"]["onWaitingList"] is True

    from padel_app.models import Coach, Message
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    with app.app_context():
        conv = _get_or_create_direct_conversation(
            db.session.get(Coach, ids["coach_id"]).user_id, db.session.get(Player, ids["student_id"]).user_id
        )
        metas = [m.msg_metadata or {} for m in Message.query.filter_by(conversation_id=conv.id).all()]
    assert any(meta.get("waitingListJoin", {}).get("lessonInstanceId") == full["instance_id"] for meta in metas)
    # Told like a join request (cross-review F2): one web and one iOS push to the coach,
    # the tap opening the thread, and a realtime event for the coach.
    coach_pushes = [p for p in pushes if p[1] == ids["coach_user_id"]]
    assert coach_pushes == [("web", ids["coach_user_id"]), ("ios", ids["coach_user_id"], "message")]
    assert ("waiting_list_joined", [ids["coach_user_id"]]) in events


def test_joining_a_virtual_full_occurrence_materialises_it(app):
    from padel_app.models import Association_PlayerLesson

    ids = _setup(app)
    virtual = _add_class(app, ids, days=2, title="Weekly Full", max_players=1, materialize=False, recurring=True)
    with app.app_context():
        filler = _add_student(ids["coach_id"], "series-member", level_id=ids["level_ids"]["5"])
        db.session.add(Association_PlayerLesson(player_id=filler, lesson_id=virtual["lesson_id"]))
        db.session.commit()
    assert _by_title(_list(app, ids))["Weekly Full"]["state"] == "full"

    before = _count(app, "LessonInstance")
    instance_id, active, _, created = _join(app, ids, model="Lesson", original_id=virtual["lesson_id"], date=virtual["date"])
    assert active and created
    assert _count(app, "LessonInstance") == before + 1


# ── AC: the waiting list is only for a full class ────────────────────────────

def test_an_open_class_has_no_waiting_list(app):
    ids = _setup(app)
    open_class = _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6, filled=1)
    with pytest.raises(HTTPException) as exc:
        _join(app, ids, model="LessonInstance", original_id=open_class["instance_id"])
    assert exc.value.response.status_code == 409
    assert exc.value.response.get_json()["code"] == "has_spots"
    assert _count(app, "WaitingListEntry", lesson_instance_id=open_class["instance_id"]) == 0


def test_the_waiting_list_join_rechecks_what_the_list_checks(app):
    ids = _setup(app)
    above = _add_class(app, ids, days=2, title="Above Full", level="4", max_players=1, filled=1)
    hidden = _add_class(app, ids, days=2, title="Hidden Full", max_players=1, filled=1, visible=False)
    for target, code in ((above, "ineligible"), (hidden, "not_visible")):
        with pytest.raises(HTTPException) as exc:
            _join(app, ids, model="LessonInstance", original_id=target["instance_id"])
        assert exc.value.response.get_json()["code"] == code


# ── AC: leaving the waiting list ─────────────────────────────────────────────

def test_leaving_deactivates_only_the_students_own_entry(app):
    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import leave_class_waiting_list_service

    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Full In Three", max_players=1, filled=1)
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])
    with app.app_context():
        entry = leave_class_waiting_list_service(db.session.get(Player, ids["student_id"]), full["instance_id"])
        assert entry.is_active is False
    assert _by_title(_list(app, ids))["Full In Three"]["onWaitingList"] is False
    with app.app_context():
        with pytest.raises(HTTPException) as exc:
            leave_class_waiting_list_service(db.session.get(Player, ids["student_id"]), full["instance_id"])
    assert exc.value.code == 404


# ── Wire contract (rule 9) ───────────────────────────────────────────────────

def test_routes_follow_the_wire_contract(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids = _setup(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    open_class = _add_class(app, ids, days=1, title="Open Tomorrow", max_players=6, filled=1)
    full = _add_class(app, ids, days=3, title="Full In Three", max_players=1, filled=1)
    with app.app_context():
        student = {"Authorization": f"Bearer {create_access_token(identity=str(db.session.get(Player, ids['student_id']).user_id))}"}
        coach = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}

    assert client.get("/api/app/academy-classes", headers=student).status_code == 400
    assert client.get(f"/api/app/academy-classes?coachId={ids['coach_id']}", headers=coach).status_code == 403
    res = client.get(f"/api/app/academy-classes?coachId={ids['coach_id']}", headers=student)
    assert res.status_code == 200
    body = res.get_json()
    assert set(body) == {"from", "to", "openSpotsVisible", "classes"}
    row = _by_title(body)["Open Tomorrow"]
    for key in ("id", "model", "originalId", "date", "startTime", "endTime", "title", "maxPlayers",
                "participantCount", "coachName", "state", "spotsLeft", "myJoinRequest", "onWaitingList"):
        assert key in row, key

    req = client.post("/api/app/class-join-requests", headers=student, json={
        "model": "LessonInstance", "originalId": open_class["instance_id"], "note": "Até já",
    })
    assert req.status_code == 201 and req.get_json()["note"] == "Até já"
    too_long = client.post("/api/app/class-join-requests", headers=student, json={
        "model": "LessonInstance", "originalId": open_class["instance_id"], "note": "x" * 501,
    })
    assert too_long.status_code == 400

    target = {"model": "LessonInstance", "originalId": full["instance_id"]}
    first = client.post("/api/app/class-waiting-list", headers=student, json=target)
    assert first.status_code == 201
    assert first.get_json() == {"lessonInstanceId": full["instance_id"], "onWaitingList": True}
    assert client.post("/api/app/class-waiting-list", headers=student, json=target).status_code == 200
    has_spots = client.post("/api/app/class-waiting-list", headers=student,
                            json={"model": "LessonInstance", "originalId": open_class["instance_id"]})
    assert has_spots.status_code == 409 and has_spots.get_json()["code"] == "has_spots"

    left = client.post(f"/api/app/class-waiting-list/{full['instance_id']}/leave", headers=student)
    assert left.status_code == 200 and left.get_json() == {"lessonInstanceId": full["instance_id"], "onWaitingList": False}
    assert client.post(f"/api/app/class-waiting-list/{full['instance_id']}/leave", headers=student).status_code == 404


def test_a_standing_list_place_is_listed_and_can_be_left_for_that_class(app):
    """Cross-review F3: the list and leave agree — every active place is listed, and
    every listed place can be left; the standing entry itself is untouched."""
    from padel_app.models import StandingWaitingListEntry, WaitingListEntry
    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import leave_class_waiting_list_service

    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Full In Three", max_players=1, filled=1)
    with app.app_context():
        standing = StandingWaitingListEntry(coach_id=ids["coach_id"], player_id=ids["student_id"],
                                            credits_total=3, credits_used=0, is_active=True,
                                            expires_at=utcnow_naive() + timedelta(days=30))
        db.session.add(standing)
        db.session.flush()
        db.session.add(WaitingListEntry(lesson_instance_id=full["instance_id"], player_id=ids["student_id"],
                                        coach_id=ids["coach_id"], standing_entry_id=standing.id))
        db.session.commit()
        standing_id = standing.id
    assert _by_title(_list(app, ids))["Full In Three"]["onWaitingList"] is True
    with app.app_context():
        entry = leave_class_waiting_list_service(db.session.get(Player, ids["student_id"]), full["instance_id"])
        assert entry.is_active is False
        assert db.session.get(StandingWaitingListEntry, standing_id).is_active is True
    assert _by_title(_list(app, ids))["Full In Three"]["onWaitingList"] is False


def test_the_payload_says_whether_the_coach_advertises_open_spots(app):
    from padel_app.models.notification_config import NotificationConfig

    ids = _setup(app)
    assert _list(app, ids)["openSpotsVisible"] is True
    with app.app_context():
        NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first().open_spots_visible = False
        db.session.commit()
    assert _list(app, ids)["openSpotsVisible"] is False
