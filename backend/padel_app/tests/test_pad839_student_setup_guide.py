"""
PAD-839 — the student setup guide's server side (dashboard.student-setup-guide wave 1).

- `/auth/me` carries the guide's state (`setupGuide`), each coach's level and side, and takes the
  guide's PATCH keys from a student only, refused before anything is written (rule 14,
  settings.profile rule 12).
- Schedules: rows sharing `schedule_id`, written whole by `PUT /availability_schedules/<id>` and
  removed by DELETE, listed with `scheduleId` (rule 10, calendar.student-blockers rule 18).
- A schedule is an ordinary blocker: automatic invitations, reminders and booking skip its hours
  (rule 17).
- No dashboard block is added (rule 1).

Fixed dates and a pinned `now`, no wall clock (pattern of test_pad377_one_off_edit_ends_the_series).
"""
import json
from datetime import date, datetime, timedelta
from unittest import mock

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

SCHEDULE_ID = "3b0e4b8e-6a51-4a54-9f4e-8a1d3d1f0839"
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(name, username):
    from padel_app.models.users import User

    u = User(name=name, username=username, email=f"{username}@test.com", password="x", status="active")
    db.session.add(u)
    db.session.flush()
    return u


def _student(app, username="pad839_student"):
    from padel_app.models import Player

    with app.app_context():
        u = _user("Student 839", username)
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.commit()
        return u.id, p.id


def _coach(app, username="pad839_coach", name="Coach 839"):
    from padel_app.models.coaches import Coach

    with app.app_context():
        u = _user(name, username)
        c = Coach(user_id=u.id)
        db.session.add(c)
        db.session.commit()
        return u.id, c.id


def _link(app, coach_id, player_id, *, level_label=None, side=None):
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coach_levels import CoachLevel

    with app.app_context():
        level_id = None
        if level_label:
            lv = CoachLevel(coach_id=coach_id, label=level_label, code=level_label[:10], display_order=1)
            db.session.add(lv)
            db.session.flush()
            level_id = lv.id
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player_id, level_id=level_id, side=side))
        db.session.commit()


def _row(start, end, days=ALL_DAYS, *, on="2026-11-16", until="2027-02-16"):
    return {"date": on, "startTime": start, "endTime": end, "isRecurring": True,
            "recurrenceRule": {"frequency": "weekly", "daysOfWeek": days}, "endDate": until}


def _put(client, app, user_id, rows, *, schedule_id=SCHEDULE_ID, title="Trabalho"):
    return client.put(f"/api/app/availability_schedules/{schedule_id}", headers=_auth(app, user_id),
                      json={"title": title, "blockers": rows})


def _rows(app, user_id, schedule_id=SCHEDULE_ID):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        assert all(b.type == "unavailable" for b in CalendarBlock.query.filter_by(user_id=user_id, schedule_id=schedule_id))
        return sorted(
            ((b.start_datetime.strftime("%H:%M"), b.end_datetime.strftime("%H:%M"), b.blocks_auto_invitations,
              b.recurrence_end.isoformat() if b.recurrence_end else None)
             for b in CalendarBlock.query.filter_by(user_id=user_id, schedule_id=schedule_id).all()),
        )


# ── /auth/me ────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-19")
def test_auth_me_carries_the_setup_guide_state(client, app):
    student_id, _ = _student(app)
    coach_user_id, _ = _coach(app)
    for uid in (student_id, coach_user_id):
        body = client.get("/api/auth/me", headers=_auth(app, uid)).get_json()
        assert body["setupGuide"] == {"snoozedAt": None, "hidden": False, "readyClosed": False,
                                      "alwaysAvailable": False, "alertsConfirmed": False}

    pinned = datetime(2026, 7, 14, 22, 30)
    with mock.patch("padel_app.modules.api_auth.utcnow_naive", return_value=pinned):
        res = client.patch("/api/auth/me", headers=_auth(app, student_id), json={
            "setupGuideSnooze": True, "setupGuideHidden": True, "setupGuideReadyClosed": True,
            "setupGuideAlertsConfirmed": True, "alwaysAvailable": True,
        })
    assert res.status_code == 200, res.data
    guide = res.get_json()["setupGuide"]
    assert guide["snoozedAt"].startswith("2026-07-14T22:30:00")
    assert (guide["hidden"], guide["readyClosed"], guide["alwaysAvailable"], guide["alertsConfirmed"]) == (
        True, True, True, True)

    res = client.patch("/api/auth/me", headers=_auth(app, student_id),
                       json={"setupGuideHidden": False, "alwaysAvailable": False})
    guide = res.get_json()["setupGuide"]
    assert (guide["hidden"], guide["alwaysAvailable"]) == (False, False)


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-4")
def test_snooze_stores_the_servers_now(client, app):
    from padel_app.models.users import User

    student_id, _ = _student(app)
    pinned = datetime(2026, 7, 14, 22, 30)  # 23:30 Lisbon, summer
    with mock.patch("padel_app.modules.api_auth.utcnow_naive", return_value=pinned):
        res = client.patch("/api/auth/me", headers=_auth(app, student_id),
                           json={"setupGuideSnooze": True, "snoozedAt": "2030-01-01T00:00:00Z"})
    assert res.status_code == 200, res.data
    with app.app_context():
        assert db.session.get(User, student_id).setup_guide_snoozed_at == pinned


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-19")
def test_a_coach_write_of_a_guide_key_is_refused_before_anything_is_stored(client, app):
    from padel_app.models.users import User

    coach_user_id, _ = _coach(app)
    res = client.patch("/api/auth/me", headers=_auth(app, coach_user_id),
                       json={"name": "Renamed Coach", "setupGuideHidden": True})
    assert res.status_code == 403
    with app.app_context():
        u = db.session.get(User, coach_user_id)
        assert (u.name, u.setup_guide_hidden_at) == ("Coach 839", None)


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-19")
def test_guide_keys_take_only_their_allowed_values(client, app):
    from padel_app.models.users import User

    student_id, _ = _student(app)
    for body in ({"setupGuideHidden": "yes"}, {"setupGuideSnooze": False}, {"setupGuideReadyClosed": False}):
        res = client.patch("/api/auth/me", headers=_auth(app, student_id), json=body)
        assert res.status_code == 400, body
    with app.app_context():
        u = db.session.get(User, student_id)
        assert (u.setup_guide_hidden_at, u.setup_guide_snoozed_at, u.setup_guide_ready_closed_at) == (None, None, None)


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-15")
def test_always_available_is_stored(client, app):
    student_id, _ = _student(app)
    res = client.patch("/api/auth/me", headers=_auth(app, student_id), json={"alwaysAvailable": True})
    assert res.status_code == 200
    again = client.get("/api/auth/me", headers=_auth(app, student_id)).get_json()
    assert again["setupGuide"]["alwaysAvailable"] is True


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-17")
def test_auth_me_coaches_carry_level_and_side(client, app):
    student_id, player_id = _student(app)
    _, coach_a = _coach(app, "pad839_coach_a", "Ana")
    _, coach_b = _coach(app, "pad839_coach_b", "Bruno")
    _link(app, coach_a, player_id, level_label="B2", side="left")
    _link(app, coach_b, player_id, level_label="C1", side=None)
    coaches = client.get("/api/auth/me", headers=_auth(app, student_id)).get_json()["coaches"]
    assert coaches == [
        {"id": coach_a, "name": "Ana", "level": "B2", "side": "left"},
        {"id": coach_b, "name": "Bruno", "level": "C1", "side": None},
    ]


@pytest.mark.criterion("SETTINGS-PROFILE-15")
def test_guide_keys_ride_on_auth_me_without_the_profile_form(client, app):
    from padel_app.models.users import User

    student_id, player_id = _student(app)
    _, coach_id = _coach(app)
    _link(app, coach_id, player_id, level_label="B2", side="left")
    res = client.patch("/api/auth/me", headers=_auth(app, student_id), json={"setupGuideHidden": True})
    body = res.get_json()
    assert body["setupGuide"]["hidden"] is True
    assert body["coaches"] == [{"id": coach_id, "name": "Coach 839", "level": "B2", "side": "left"}]
    with app.app_context():
        u = db.session.get(User, student_id)
        assert (u.name, u.email, u.phone) == ("Student 839", "pad839_student@test.com", None)


# ── schedules ───────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-14")
def test_put_replaces_a_schedules_rows(client, app):
    student_id, _ = _student(app)
    first = _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00"), _row("21:00", "22:00")])
    assert first.status_code == 200, first.data
    assert {r["scheduleId"] for r in first.get_json()} == {SCHEDULE_ID}
    second = _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")])
    assert second.status_code == 200, second.data
    assert _rows(app, student_id) == [("09:00", "11:00", True, "2027-02-16"), ("15:00", "20:00", True, "2027-02-16")]


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-14")
def test_delete_removes_every_row_of_a_schedule(client, app):
    student_id, _ = _student(app)
    _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")])
    hand_made = client.post("/api/app/availability_blockers", headers=_auth(app, student_id), json={
        "title": None, "date": "2026-11-20", "startTime": "18:00", "endTime": "19:00",
        "isRecurring": False, "recurrenceRule": None, "endDate": None,
    })
    assert hand_made.status_code == 201, hand_made.data
    res = client.delete(f"/api/app/availability_schedules/{SCHEDULE_ID}", headers=_auth(app, student_id))
    assert res.status_code == 204
    assert _rows(app, student_id) == []
    listed = client.get("/api/app/availability_blockers", headers=_auth(app, student_id)).get_json()
    assert [b["id"] for b in listed] == [hand_made.get_json()["id"]]


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-27")
def test_one_invalid_row_writes_nothing_and_keeps_the_old_rows(client, app):
    student_id, _ = _student(app)
    _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")])
    res = _put(client, app, student_id, [_row("08:00", "09:00"), _row("10:00", "12:00"), _row("14:00", "13:00")])
    assert res.status_code == 400
    assert res.get_json()["row"] == 2
    assert _rows(app, student_id) == [("09:00", "11:00", True, "2027-02-16"), ("15:00", "20:00", True, "2027-02-16")]


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-27")
def test_put_with_an_unknown_id_creates_the_schedule(client, app):
    student_id, _ = _student(app)
    res = _put(client, app, student_id, [_row("09:00", "18:00", [1, 2, 3, 4, 5])], schedule_id="new-839")
    assert res.status_code == 200, res.data
    assert _rows(app, student_id, "new-839") == [("09:00", "18:00", True, "2027-02-16")]


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-27")
def test_another_students_schedule_is_404_and_a_coach_is_403(client, app):
    owner_id, _ = _student(app, "pad839_owner")
    other_id, _ = _student(app, "pad839_other")
    coach_user_id, _ = _coach(app)
    _put(client, app, owner_id, [_row("09:00", "11:00")])
    assert _put(client, app, other_id, [_row("12:00", "13:00")]).status_code == 404
    gone = client.delete(f"/api/app/availability_schedules/{SCHEDULE_ID}", headers=_auth(app, other_id))
    assert gone.status_code == 404
    assert _rows(app, owner_id) == [("09:00", "11:00", True, "2027-02-16")]
    assert _put(client, app, coach_user_id, [_row("09:00", "11:00")], schedule_id="coach-839").status_code == 403


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-15")
def test_the_blockers_list_carries_schedule_id_and_a_one_off_edit_clears_it(client, app):
    student_id, _ = _student(app)
    rows = _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")]).get_json()
    hand_made = client.post("/api/app/availability_blockers", headers=_auth(app, student_id), json={
        "title": None, "date": "2026-11-20", "startTime": "18:00", "endTime": "19:00",
        "isRecurring": False, "recurrenceRule": None, "endDate": None,
    }).get_json()
    listed = {b["id"]: b["scheduleId"] for b in
              client.get("/api/app/availability_blockers", headers=_auth(app, student_id)).get_json()}
    assert listed == {rows[0]["id"]: SCHEDULE_ID, rows[1]["id"]: SCHEDULE_ID, hand_made["id"]: None}

    edited = client.put(f"/api/app/availability_blockers/{rows[0]['id']}", headers=_auth(app, student_id), json={
        "title": "Trabalho", "date": "2026-11-16", "startTime": "09:00", "endTime": "11:00", "isRecurring": False,
    })
    assert edited.status_code == 200, edited.data
    assert edited.get_json()["scheduleId"] is None
    listed = {b["id"]: b["scheduleId"] for b in
              client.get("/api/app/availability_blockers", headers=_auth(app, student_id)).get_json()}
    assert listed[rows[1]["id"]] == SCHEDULE_ID


# ── a schedule is an ordinary blocker (rule 17) ─────────────────────────────────────────────────

def _class_on(app, coach_id, player_id, start):
    """A 1-hour class with a level and an open vacancy; the student is linked at that level."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy

    level = CoachLevel.query.filter_by(coach_id=coach_id).first()
    if level is None:
        level = CoachLevel(coach_id=coach_id, label="Beg", code="B1", display_order=1)
        db.session.add(level)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player_id, level_id=level.id, side="right"))
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
    club = Club(name="Club 839", description="", location="City")
    db.session.add(club)
    db.session.flush()
    lesson = Lesson(title="Class 839", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, color="#000", status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                          max_players=4, status="scheduled", level_id=level.id, notifications_enabled=True)
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=inst.id))
    vac = Vacancy(lesson_instance_id=inst.id, coach_id=coach_id, original_player_id=None, side=None,
                  level_id=level.id, status="open", current_round_number=1, current_batch_number=0)
    db.session.add(vac)
    db.session.commit()
    return inst, vac


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-26")
def test_a_schedule_keeps_auto_invitations_away_in_its_hours(client, app):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import get_eligible_students

    student_id, player_id = _student(app)
    _, coach_id = _coach(app)
    assert _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")]).status_code == 200
    with app.app_context():
        at_ten, vac_ten = _class_on(app, coach_id, player_id, datetime(2026, 11, 17, 10, 0))
        at_noon, vac_noon = _class_on(app, coach_id, player_id, datetime(2026, 11, 17, 12, 0))
        cfg = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        assert player_id not in {cp.player_id for cp in get_eligible_students(vac_ten, at_ten, coach_id, cfg, 1)}
        assert player_id in {cp.player_id for cp in get_eligible_students(vac_noon, at_noon, coach_id, cfg, 1)}


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-26")
def test_a_schedule_holds_back_the_reminder(client, app):
    from padel_app.models import Presence
    from padel_app.services.notification_service import send_class_reminders

    student_id, player_id = _student(app)
    _, coach_id = _coach(app)
    assert _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")]).status_code == 200
    with app.app_context():
        inst, _ = _class_on(app, coach_id, player_id, datetime(2026, 11, 17, 10, 0))
        db.session.add(Presence(player_id=player_id, lesson_instance_id=inst.id, invited=True,
                                enrolment_source="roster"))
        db.session.commit()
        result = send_class_reminders(inst.id, now=datetime(2026, 11, 16, 9, 0))
        assert result["sent"] == 0
        assert [b["playerId"] for b in result["blocked"]] == [player_id]
        # No reminder Message reaches the student in any conversation they take part in.
        from padel_app.models import Message
        from padel_app.models.conversation_participants import ConversationParticipant

        convs = [cp.conversation_id for cp in ConversationParticipant.query.filter_by(user_id=student_id).all()]
        assert (Message.query.filter(Message.conversation_id.in_(convs)).count() if convs else 0) == 0


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-26")
def test_a_schedule_takes_its_hours_out_of_booking(client, app):
    from padel_app.models import Player
    from padel_app.models.coaches import Coach
    from padel_app.services.availability_service import free_windows_for

    student_id, player_id = _student(app)
    _, coach_id = _coach(app)
    assert _put(client, app, student_id, [_row("09:00", "11:00"), _row("15:00", "20:00")]).status_code == 200
    tuesday = date(2026, 11, 17)
    with app.app_context():
        free = free_windows_for(db.session.get(Coach, coach_id), [db.session.get(Player, player_id)],
                                tuesday, tuesday, now=datetime(2026, 11, 16, 9, 0))
        busy = [(9 * 60, 11 * 60), (15 * 60, 20 * 60)]
        assert free[tuesday], "the coach's default working day leaves some free time"
        for s, e in free[tuesday]:
            assert all(e <= bs or s >= be for bs, be in busy), (s, e)


# ── no dashboard block (rule 1) ─────────────────────────────────────────────────────────────────

PLAYER_BLOCK_TYPES = {"messages_overview", "profile_incomplete", "next_class", "needs_you", "schedule_7d",
                      "kpi_grid", "evaluations"}


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-20")
def test_the_dashboard_payloads_hold_no_setup_guide_block(client, app):
    student_id, player_id = _student(app)
    coach_user_id, coach_id = _coach(app)
    _link(app, coach_id, player_id)  # no level, no side: profile_incomplete is sent
    student = client.get("/api/app/dashboard", headers=_auth(app, student_id))
    coach = client.get("/api/app/dashboard", headers=_auth(app, coach_user_id))
    assert student.status_code == 200 and coach.status_code == 200
    student_types = {b["type"] for b in student.get_json()["blocks"]}
    coach_types = {b["type"] for b in coach.get_json()["blocks"]}
    assert "profile_incomplete" in student_types
    assert student_types <= PLAYER_BLOCK_TYPES
    assert not any("setup" in t for t in student_types | coach_types)


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-3")
def test_step_one_writes_alerts_and_their_confirmation_in_one_patch(client, app):
    student_id, _ = _student(app)
    res = client.patch("/api/auth/me", headers=_auth(app, student_id),
                       json={"requestAlerts": True, "setupGuideAlertsConfirmed": True})
    assert res.status_code == 200, res.data
    body = res.get_json()
    assert (body["requestAlerts"], body["setupGuide"]["alertsConfirmed"]) == (True, True)


@pytest.mark.criterion("DASHBOARD-STUDENT-SETUP-GUIDE-19")
def test_an_account_with_no_player_row_cannot_write_guide_keys(client, app):
    from padel_app.models.users import User

    with app.app_context():
        u = _user("Admin 839", "pad839_admin")
        db.session.commit()
        uid = u.id
    res = client.patch("/api/auth/me", headers=_auth(app, uid), json={"setupGuideHidden": True})
    assert res.status_code == 403
    with app.app_context():
        assert db.session.get(User, uid).setup_guide_hidden_at is None


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-16")
def test_a_split_schedule_row_keeps_its_schedule_and_a_one_off_clone_leaves_it(client, app):
    from padel_app.models.calendar_blocks import CalendarBlock

    student_id, _ = _student(app)
    # One weekly Monday row, 2026-11-16 → 2027-02-15 (JS weekday 1).
    row = _put(client, app, student_id, [_row("09:00", "11:00", [1], until="2027-02-15")]).get_json()[0]
    res = client.delete(f"/api/app/availability_blockers/{row['id']}", headers=_auth(app, student_id),
                        json={"scope": "single", "occDate": "2026-11-23"})
    assert res.status_code == 204, res.data
    with app.app_context():
        rows = CalendarBlock.query.filter_by(user_id=student_id).order_by(CalendarBlock.id).all()
        assert len(rows) == 2
        assert all(r.schedule_id == SCHEDULE_ID and r.is_recurring for r in rows)
        continuation = rows[-1].id

    moved = client.post(f"/api/app/reschedule_block/{continuation}", headers=_auth(app, student_id),
                        json={"occDate": "2026-12-07", "newDate": "2026-12-08", "newStartTime": "09:00",
                              "newEndTime": "11:00", "scope": "single"})
    assert moved.status_code == 204, moved.data
    with app.app_context():
        one_offs = CalendarBlock.query.filter_by(user_id=student_id, is_recurring=False).all()
        assert len(one_offs) == 1 and one_offs[0].schedule_id is None
        assert all(r.schedule_id == SCHEDULE_ID
                   for r in CalendarBlock.query.filter_by(user_id=student_id, is_recurring=True).all())
