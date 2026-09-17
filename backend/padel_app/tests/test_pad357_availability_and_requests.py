"""PAD-357 — classes.availability, settings.coach-working-hours and
classes.class-requests rules 12–15: one free-slot computation for a coach and
a set of people; private-class requests with people and a weekly recurrence.

Fixtures reuse test_pad104's world (a coach with a club and a rostered
student "booker"); every date is derived from one anchor so the hour of the
run never matters (B-100).
"""
from datetime import datetime, time, timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import _coach, _player, _refusal, _setup
from padel_app.tests.test_pad128_eligibility import _add_student
from padel_app.utils.dates import utcnow_naive

# Next Tuesday at least 8 days out, then the two Tuesdays after it: a stable
# weekly shape whatever today is.
def _next_weekday(iso_weekday, min_days_ahead=8):
    day = (utcnow_naive() + timedelta(days=min_days_ahead)).date()
    while day.isoweekday() != iso_weekday:
        day += timedelta(days=1)
    return day


TUE = _next_weekday(2)
THU = TUE + timedelta(days=2)


def _world(app):
    """Coach Ana (from test_pad104's seed) with rostered Bruno ("booker") and Carla;
    Diogo trains with another coach."""
    from padel_app.models import Coach, Club, User
    from padel_app.models.players import Player

    ids = _setup(app)
    with app.app_context():
        ids["carla"] = _add_student(ids["coach_id"], "carla")
        # another coach, with Diogo on their roster only
        other_user = User(name="Other Coach", username="othercoach", password="x", status="active")
        db.session.add(other_user); db.session.flush()
        other = Coach(user_id=other_user.id); db.session.add(other); db.session.flush()
        ids["diogo"] = _add_student(other.id, "diogo")
        # a placeholder-like account on Ana's roster: no password
        ids["ghost"] = _add_student(ids["coach_id"], "ghost")
        ghost_user = db.session.get(Player, ids["ghost"]).user
        ghost_user.password = None
        db.session.commit()
        ids["bruno"] = ids["player_id"]
        ids["bruno_user_id"] = db.session.get(Player, ids["bruno"]).user_id
    return ids


def _put_hours(app, ids, payload):
    from padel_app.services.availability_service import set_working_hours

    with app.app_context():
        return set_working_hours(_coach(ids), payload)


def _busy_class(app, ids, day, start, end, *, player_ids=(), coach_id=None):
    """A class on the coach's calendar (coach_id) with these players enrolled."""
    from padel_app.models import Association_CoachLesson, Club
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance, enrol

    with app.app_context():
        lesson = Lesson(
            title="Busy", start_datetime=datetime.combine(day, start), end_datetime=datetime.combine(day, end),
            is_recurring=False, type="academy", max_players=4, color="#000", status="active",
            club_id=Club.query.first().id,
        )
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id or ids["coach_id"], lesson_id=lesson.id))
        db.session.commit()
        if player_ids:
            inst = get_or_materialize_instance(lesson, day)
            for pid in player_ids:
                enrol(pid, inst, "coach")
            db.session.commit()
        return lesson.id


def _unavailable(app, user_id, day, start, end, *, weekly=False):
    from padel_app.services.student_availability_service import create_student_blocker

    with app.app_context():
        data = {"title": "busy", "date": day.isoformat(), "startTime": start, "endTime": end, "isRecurring": weekly}
        if weekly:
            data["recurrenceRule"] = {"frequency": "weekly", "daysOfWeek": [day.isoweekday() % 7]}
            data["endDate"] = (day + timedelta(days=60)).isoformat()
        create_student_blocker(user_id, data)
        db.session.commit()


def _availability(app, ids, from_day, to_day, participants=()):
    from padel_app.services.availability_service import availability_for

    with app.app_context():
        return availability_for(_player(ids["bruno"]), _coach(ids), from_day, to_day, list(participants),
                                now=datetime.combine(from_day - timedelta(days=1), time(12, 0)))


def _windows(payload, day):
    return [(w["startTime"], w["endTime"]) for w in payload["freeWindows"].get(day.isoformat(), [])]


# ── settings.coach-working-hours ─────────────────────────────────────────────

def test_working_hours_are_validated_stored_and_cleared(app):
    ids = _world(app)
    stored = _put_hours(app, ids, {"mon": [["09:00", "13:00"], ["15:00", "21:00"]], "tue": []})
    assert stored == {"mon": [["09:00", "13:00"], ["15:00", "21:00"]], "tue": []}
    with pytest.raises(HTTPException) as exc:
        _put_hours(app, ids, {"wed": [["18:00", "17:00"]]})
    assert _refusal(exc)["code"] == "INVALID_WORKING_HOURS" and _refusal(exc)["day"] == "wed"
    for bad in ({"fri": [["08:00", "12:10"]]}, {"sat": [["08:00", "12:00"], ["11:00", "13:00"]]}, {"xyz": []}, "nope"):
        with pytest.raises(HTTPException):
            _put_hours(app, ids, bad)
    assert _put_hours(app, ids, None) is None
    with app.app_context():
        assert _coach(ids).working_hours is None


# ── classes.availability ─────────────────────────────────────────────────────

def test_participants_resolve_one_at_a_time_without_an_oracle(app):
    from padel_app.services.availability_service import resolve_participants

    ids = _world(app)
    with app.app_context():
        out = resolve_participants(_player(ids["bruno"]), _coach(ids), ["carla", "diogo", "booker", "ghost", "nobody", "Carla"])
        upper = resolve_participants(_player(ids["bruno"]), _coach(ids), ["CARLA"])
    by = {o["username"]: o for o in out}
    assert by["Carla"] == {"username": "Carla", "ok": False, "code": "DUPLICATE_INVITEE"}, "a case variant is the same person"
    assert by["carla"]["ok"] is True and by["carla"]["playerId"] == str(ids["carla"]) and by["carla"]["name"] == "carla"
    assert by["diogo"] == {"username": "diogo", "ok": False, "code": "USERNAME_NOT_FOUND"}, "another coach's student is invisible"
    assert by["booker"] == {"username": "booker", "ok": False, "code": "SELF_INVITE"}
    assert by["ghost"]["code"] == "USERNAME_NOT_FOUND", "a placeholder account is invisible"
    assert by["nobody"]["code"] == "USERNAME_NOT_FOUND"
    assert upper[0]["ok"] is True and upper[0]["playerId"] == str(ids["carla"]), "usernames resolve case-insensitively"


def test_free_windows_are_working_time_minus_everyones_calendars(app):
    """Spec criterion 1: Ana works Tue 09:00–13:00 and 15:00–21:00; she has a
    class 10:00–11:00 and a hold 16:00–17:00; Bruno has a class 12:00–13:00;
    Carla is unavailable every Tuesday 19:00–21:00."""
    from padel_app.models.players import Player

    ids = _world(app)
    _put_hours(app, ids, {"tue": [["09:00", "13:00"], ["15:00", "21:00"]]})
    _busy_class(app, ids, TUE, time(10, 0), time(11, 0))
    with app.app_context():  # the hold: a personal block on Ana's calendar
        from padel_app.services.calendar_service import add_event_service
        add_event_service(ids["coach_user_id"], {"type": "personal", "title": "hold", "date": TUE.isoformat(),
                                                 "startTime": "16:00", "endTime": "17:00", "isRecurring": False})
        db.session.commit()
    _busy_class(app, ids, TUE, time(12, 0), time(13, 0), player_ids=[ids["bruno"]], coach_id=None)
    with app.app_context():
        carla_uid = db.session.get(Player, ids["carla"]).user_id
    _unavailable(app, carla_uid, TUE, "19:00", "21:00", weekly=True)

    out = _availability(app, ids, TUE, TUE, participants=["carla"])
    assert out["workingHoursSource"] == "coach"
    assert _windows(out, TUE) == [("09:00", "10:00"), ("11:00", "12:00"), ("15:00", "16:00"), ("17:00", "19:00")]
    assert "busy" not in out and all(k in {"coachId", "from", "to", "workingHours", "workingHoursSource", "participants", "freeWindows"} for k in out)
    assert out["participants"] == [{"username": "carla", "ok": True, "playerId": str(ids["carla"]), "name": "carla"}]


def test_the_default_window_applies_until_the_coach_sets_hours(app):
    ids = _world(app)
    out = _availability(app, ids, THU, THU)
    assert out["workingHoursSource"] == "default" and out["workingHours"] is None
    assert _windows(out, THU) == [("08:00", "22:00")]


def test_a_stranger_is_refused_and_no_windows_are_computed(app):
    ids = _world(app)
    with pytest.raises(HTTPException) as exc:
        _availability(app, ids, TUE, TUE, participants=["diogo"])
    body = _refusal(exc)
    assert body["code"] == "INVALID_PARTICIPANTS"
    assert body["participants"] == [{"username": "diogo", "ok": False, "code": "USERNAME_NOT_FOUND"}]
    assert "freeWindows" not in body


# ── classes.class-requests rules 12–15 ───────────────────────────────────────

def _create(app, ids, **data):
    """Inside the caller's app context: the row stays attached."""
    from padel_app.services.class_request_service import create_class_request_service

    base = {"coachId": ids["coach_id"], "date": TUE.isoformat(), "startTime": "18:00", "endTime": "19:00"}
    return create_class_request_service(_player(ids["bruno"]), {**base, **data})


def test_a_group_request_names_only_people_who_train_with_the_coach(app):
    from padel_app.services.class_request_service import serialize_class_request

    ids = _world(app)
    with app.app_context():
        row = _create(app, ids, participants=["carla"])
        out = serialize_class_request(row)
    assert out["participants"] == [{"playerId": str(ids["carla"]), "name": "carla", "username": "carla"}]
    assert out["recurrence"] is None
    with app.app_context():
        for participants, code in (
            (["diogo"], "USERNAME_NOT_FOUND"),
            (["booker"], "SELF_INVITE"),
            (["carla", "carla"], "DUPLICATE_INVITEE"),
            (["carla", "ghost", "diogo", "nobody"], "TOO_MANY_PEOPLE"),
        ):
            with pytest.raises(HTTPException) as exc:
                _create(app, ids, startTime="20:00", endTime="21:00", participants=participants)
            assert _refusal(exc)["code"] == code, participants


def test_an_invitees_calendar_refuses_a_slot_they_cannot_make(app):
    from padel_app.models.players import Player

    ids = _world(app)
    with app.app_context():
        carla_uid = db.session.get(Player, ids["carla"]).user_id
    _unavailable(app, carla_uid, TUE, "18:00", "19:00")
    with app.app_context():
        with pytest.raises(HTTPException) as exc:
            _create(app, ids, participants=["carla"])
        assert _refusal(exc)["code"] == "slot_taken"
        assert _create(app, ids, participants=["carla"], startTime="19:00", endTime="20:00").status == "pending"


def test_a_weekly_request_holds_every_occurrence_and_accept_creates_one_series(app):
    from padel_app.models import ClassRequest, Message
    from padel_app.models.lessons import Lesson
    from padel_app.services.class_request_service import free_blocks, serialize_class_request
    from padel_app.services.class_request_service import decide_class_request_service

    ids = _world(app)
    end = TUE + timedelta(weeks=3, days=2)  # four Tuesdays and four Thursdays
    recurrence = {"weekdays": [2, 4], "startDate": TUE.isoformat(), "endDate": end.isoformat()}
    with app.app_context():
        row = _create(app, ids, participants=["carla"], recurrence=recurrence)
        rid = row.id
        out = serialize_class_request(row)
        assert out["recurrence"] == recurrence and out["date"] == TUE.isoformat()
        # rule 14: the hold covers every occurrence — the second Tuesday is not free 18:00–19:00
        second_tue = TUE + timedelta(weeks=1)
        blocks = free_blocks(_coach(ids), datetime.combine(second_tue, time.min), datetime.combine(second_tue, time.max))
        assert all(not (b["startTime"] < "19:00" and b["endTime"] > "18:00") for b in blocks), blocks
        before = Message.query.count()
        status = decide_class_request_service(rid, _coach(ids), action="accept").status
        assert status == "accepted"
        r = db.session.get(ClassRequest, rid)
        lesson = db.session.get(Lesson, r.lesson_id)
        assert lesson.is_recurring and lesson.recurrence_end == end and lesson.max_players == 2 and lesson.type == "private"
        assert sorted(p.id for p in lesson.players) == sorted([ids["bruno"], ids["carla"]])
        assert Lesson.query.filter_by(type="private").count() == 1, "one series, not a scatter of one-offs"
        assert r.hold_block_id is None
        # rule 14: Carla is told she was added; Bruno gets the acceptance, not a second notice
        added = [m for m in Message.query.all() if (m.msg_metadata or {}).get("addedToClass") is True]
        assert len(added) == 1
        assert Message.query.count() > before


def test_a_weekly_request_refuses_an_occurrence_that_is_not_free_naming_the_date(app):
    ids = _world(app)
    third_tue = TUE + timedelta(weeks=2)
    _busy_class(app, ids, third_tue, time(18, 0), time(19, 0))
    recurrence = {"weekdays": [2], "startDate": TUE.isoformat(), "endDate": (TUE + timedelta(weeks=3)).isoformat()}
    with app.app_context():
        with pytest.raises(HTTPException) as exc:
            _create(app, ids, recurrence=recurrence)
    body = _refusal(exc)
    assert body["code"] == "slot_taken" and body["date"] == third_tue.isoformat()
