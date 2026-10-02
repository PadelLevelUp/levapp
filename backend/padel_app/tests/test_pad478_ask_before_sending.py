"""
PAD-478 part 2 (notifications.config rule 10f; owner's decision 2026-10-02): when a timing
save leaves upcoming classes whose reminder time is already past, the coach is ASKED, and only
an explicit yes sends, through the ordinary reminder pass.

Real scheduler (conftest `live_scheduler`), pinned clock, dates in 2027. Summer: Lisbon is
UTC+1, so a class at 18:00 starts 17:00 UTC.
"""
from datetime import datetime

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad256_reminder_clock import _seed

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

NOW_UTC = datetime(2027, 7, 10, 10, 0)            # Saturday 11:00 in Lisbon
CLASS_WALL = datetime(2027, 7, 12, 18, 0)         # Monday 18:00 in Lisbon
PAST = {"type": "days_before_at_time", "days": 2, "time": "09:00"}     # 07-10 08:00 UTC: two hours ago
FUTURE = {"type": "days_before_at_time", "days": 1, "time": "18:00"}   # 07-11 17:00 UTC


@pytest.fixture
def klass(app, live_scheduler, monkeypatch):
    """One class two days out, its coach, one student who has not been reminded."""
    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        coach_id, student_id, instance_id = _seed(app, CLASS_WALL)
        yield {"coach": coach_id, "student": student_id, "instance": instance_id,
               "key": f"i:{instance_id}", "module": live_scheduler, "sched": live_scheduler._scheduler}


def _save(coach_id, timing, **more):
    from padel_app.services.notification_service import update_config

    return update_config(coach_id, {"reminderTiming": {"firstReminder": timing, **more}})


def _listed(coach_id):
    from padel_app.services.past_due_service import past_due

    return past_due(coach_id)


def _send(coach_id, *keys):
    from padel_app.services.past_due_service import send_past_due

    return send_past_due(coach_id, list(keys))


def _attempts(k):
    from padel_app.services import reminder_attempt_service as attempts

    return attempts.count_attempts(k["instance"], k["student"])


def _put_attempts_on_the_pinned_clock(when):
    """`record_attempt` stamps `sent_at` from the real clock, which `pin_clock` does not reach."""
    from padel_app.models.reminder_attempts import ReminderAttempt

    ReminderAttempt.query.update({"sent_at": when})
    db.session.commit()


# ── what the save answers ───────────────────────────────────────────────────

def test_a_class_whose_reminder_time_is_past_is_listed_and_nothing_is_sent(klass):
    _save(klass["coach"], PAST)

    listed = _listed(klass["coach"])

    assert [c["key"] for c in listed["reminders"]] == [klass["key"]]
    assert listed["reminders"][0]["students"] == 1
    assert listed["reminders"][0]["startsAt"] == "2027-07-12T18:00:00"
    assert listed["quietUntil"] is None
    assert _attempts(klass) == 0, "listing, like the save, sends nothing"


def test_a_class_whose_reminder_time_is_still_ahead_is_not_listed(klass):
    _save(klass["coach"], FUTURE)
    assert _listed(klass["coach"])["reminders"] == []


def test_a_class_already_reminded_or_answered_is_not_listed(klass):
    from padel_app.models.presences import Presence

    _save(klass["coach"], PAST)
    assert _send(klass["coach"], klass["key"])["sent"] == 1
    assert _listed(klass["coach"])["reminders"] == [], "reminded: at the count"

    from padel_app.models.reminder_attempts import ReminderAttempt

    ReminderAttempt.query.delete()
    Presence.query.filter_by(lesson_instance_id=klass["instance"]).update({"confirmed": True})
    db.session.commit()
    assert _listed(klass["coach"])["reminders"] == [], "answered"


def test_only_the_primary_coach_is_asked_about_a_class(klass):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.tests.test_pad478_primary_coach_decides import _new_coach, _store_timing

    second = _new_coach("asked-second")
    db.session.add(Association_CoachLessonInstance(coach_id=second, lesson_instance_id=klass["instance"]))
    db.session.commit()
    _save(klass["coach"], PAST)
    _store_timing(second, PAST)

    assert [c["key"] for c in _listed(klass["coach"])["reminders"]] == [klass["key"]]
    assert _listed(second)["reminders"] == []


def test_a_class_not_materialised_yet_is_listed_when_its_lesson_has_a_roster(klass):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    start = datetime(2027, 7, 11, 20, 0)
    lesson = Lesson(title="Not materialised", start_datetime=start, end_datetime=start.replace(hour=21),
                    is_recurring=False, type="academy", max_players=4, color="#000000",
                    status="active", club_id=Club.query.first().id)
    empty = Lesson(title="Nobody enrolled", start_datetime=start, end_datetime=start.replace(hour=21),
                   is_recurring=False, type="academy", max_players=4, color="#000000",
                   status="active", club_id=Club.query.first().id)
    db.session.add_all([lesson, empty])
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=klass["coach"], lesson_id=lesson.id))
    db.session.add(Association_CoachLesson(coach_id=klass["coach"], lesson_id=empty.id))
    db.session.add(Association_PlayerLesson(player_id=klass["student"], lesson_id=lesson.id))
    db.session.commit()
    _save(klass["coach"], PAST)

    from padel_app.models.lesson_instances import LessonInstance

    jobs_before = sorted(j.id for j in klass["sched"].get_jobs())
    keys = sorted(c["key"] for c in _listed(klass["coach"])["reminders"])

    assert keys == sorted([klass["key"], f"o:{lesson.id}:2027-07-11"])
    assert LessonInstance.query.filter_by(lesson_id=lesson.id).count() == 0, "listing must not materialise the class"
    assert sorted(j.id for j in klass["sched"].get_jobs()) == jobs_before, "nor arm or remove a job"


def test_the_save_response_carries_the_list(app, klass, client):
    from flask_jwt_extended import create_access_token

    from padel_app.models.coaches import Coach

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    headers = {"Authorization": f"Bearer {create_access_token(identity=str(Coach.query.get(klass['coach']).user_id))}"}

    body = client.post("/api/app/notify/config", json={"reminderTiming": {"firstReminder": PAST}}, headers=headers).get_json()

    assert [c["key"] for c in body["pastDue"]["reminders"]] == [klass["key"]]
    assert _attempts(klass) == 0


def test_a_listing_that_fails_does_not_turn_a_saved_config_into_an_error(app, klass, client, monkeypatch, caplog):
    """The configuration is committed before the listing runs. A listing that raises must
    not answer 500 for a save that happened: the form is told the check could not be made."""
    import logging

    from flask_jwt_extended import create_access_token

    from padel_app.models.coaches import Coach
    from padel_app.services import past_due_service

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    headers = {"Authorization": f"Bearer {create_access_token(identity=str(Coach.query.get(klass['coach']).user_id))}"}

    def boom(_coach_id, **_kwargs):
        raise RuntimeError("listing broke")

    monkeypatch.setattr(past_due_service, "past_due", boom)
    with caplog.at_level(logging.ERROR):
        response = client.post("/api/app/notify/config", json={"reminderTiming": {"firstReminder": PAST}}, headers=headers)

    assert response.status_code == 200
    body = response.get_json()
    assert body["reminderTiming"]["firstReminder"] == PAST
    assert "pastDue" not in body and body["pastDueUnknown"] is True
    assert any("listing broke" in r.getMessage() and f"coach {klass['coach']}" in r.getMessage() for r in caplog.records)


# ── the explicit yes ────────────────────────────────────────────────────────

def test_yes_sends_one_reminder_through_the_ordinary_pass_and_arms_the_follow_up(klass, monkeypatch):
    _save(klass["coach"], PAST, reminderCount=2, hoursBetweenReminders=3)

    result = _send(klass["coach"], klass["key"])

    assert result["sent"] == 1 and result["scheduledFor"] is None and result["skipped"] == 0
    assert _attempts(klass) == 1
    follow_ups = [j.trigger.run_date.replace(tzinfo=None) for j in klass["sched"].get_jobs() if "_retry_" in j.id]
    assert follow_ups == [datetime(2027, 7, 10, 13, 0)]            # now + the coach's 3 h


def test_a_repeated_request_sends_nothing_more(klass):
    _save(klass["coach"], PAST, reminderCount=2, hoursBetweenReminders=3)
    assert _send(klass["coach"], klass["key"])["sent"] == 1
    _put_attempts_on_the_pinned_clock(NOW_UTC)

    again = _send(klass["coach"], klass["key"])

    assert again["sent"] == 0
    assert _attempts(klass) == 1
    assert len([j for j in klass["sched"].get_jobs() if "_retry_" in j.id]) == 1


def test_a_class_that_is_another_coachs_is_skipped(klass):
    from padel_app.tests.test_pad478_primary_coach_decides import _new_coach, _store_timing

    other = _new_coach("not-theirs")
    _store_timing(other, PAST)
    _save(klass["coach"], PAST)

    result = _send(other, klass["key"])

    assert result["sent"] == 0
    assert result["skipped"] == 1 and result["classes"] == []
    assert klass["key"] not in str(result), "a class that is not the caller's is not named back"
    assert _attempts(klass) == 0


def test_a_class_that_is_no_longer_past_due_is_skipped(klass):
    _save(klass["coach"], PAST)
    _save(klass["coach"], FUTURE)            # the coach changed their mind before confirming

    result = _send(klass["coach"], klass["key"], "i:999999", "garbage")

    assert result["sent"] == 0
    assert result["skipped"] == 3
    assert _attempts(klass) == 0


def test_yes_materialises_and_reminds_a_class_that_was_not_materialised(klass):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.reminder_attempts import ReminderAttempt

    start = datetime(2027, 7, 11, 20, 0)
    lesson = Lesson(title="Not materialised", start_datetime=start, end_datetime=start.replace(hour=21),
                    is_recurring=False, type="academy", max_players=4, color="#000000",
                    status="active", club_id=Club.query.first().id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=klass["coach"], lesson_id=lesson.id))
    db.session.add(Association_PlayerLesson(player_id=klass["student"], lesson_id=lesson.id))
    db.session.commit()
    _save(klass["coach"], PAST)

    result = _send(klass["coach"], f"o:{lesson.id}:2027-07-11")

    instance = LessonInstance.query.filter_by(lesson_id=lesson.id).one()
    assert result["sent"] == 1
    assert ReminderAttempt.query.filter_by(lesson_instance_id=instance.id).count() == 1


# ── quiet hours ─────────────────────────────────────────────────────────────

def _quiet(coach_id):
    from padel_app.services.notification_service import get_or_create_config

    config = get_or_create_config(coach_id)
    config.quiet_hours_enabled = True          # default window: 22:00 to 07:00 on the club's clock
    config.save()


def test_inside_quiet_hours_nothing_is_sent_at_once_and_one_pass_is_armed_for_their_end(klass, monkeypatch):
    _quiet(klass["coach"])
    _save(klass["coach"], PAST)
    pin_clock(monkeypatch, datetime(2027, 7, 10, 22, 30))        # 23:30 in Lisbon

    listed = _listed(klass["coach"])
    assert [c["key"] for c in listed["reminders"]] == [klass["key"]]
    assert listed["quietUntil"] == "2027-07-11T06:00:00Z"        # 07:00 in Lisbon

    result = _send(klass["coach"], klass["key"])
    result_again = _send(klass["coach"], klass["key"])

    assert result["sent"] == 0 and result["scheduledFor"] == "2027-07-11T06:00:00Z"
    assert result_again["sent"] == 0
    assert _attempts(klass) == 0
    armed = [j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")]
    assert [j.trigger.run_date.replace(tzinfo=None) for j in armed] == [datetime(2027, 7, 11, 6, 0)]
    # The coach said yes. A scheduler that is down for a while when quiet hours end must not
    # drop that silently: this job may run up to six hours late (an ordinary one: 5 minutes).
    assert armed[0].misfire_grace_time == 6 * 3600

    pin_clock(monkeypatch, datetime(2027, 7, 11, 6, 0))
    armed[0].func(*armed[0].args)
    assert _attempts(klass) == 1


def test_a_class_that_starts_before_quiet_hours_end_is_not_offered(klass, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance

    _quiet(klass["coach"])
    _save(klass["coach"], PAST)
    LessonInstance.query.filter_by(id=klass["instance"]).update({"start_datetime": datetime(2027, 7, 11, 6, 30)})
    db.session.commit()
    pin_clock(monkeypatch, datetime(2027, 7, 10, 22, 30))        # the class is at 06:30 Lisbon

    assert _listed(klass["coach"])["reminders"] == []
    assert _send(klass["coach"], klass["key"])["sent"] == 0
    assert [j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")] == []


def test_a_later_save_that_arms_the_ordinary_reminder_removes_the_armed_pass(klass, monkeypatch):
    _quiet(klass["coach"])
    _save(klass["coach"], PAST)
    pin_clock(monkeypatch, datetime(2027, 7, 10, 22, 30))
    _send(klass["coach"], klass["key"])
    assert len([j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")]) == 1

    _save(klass["coach"], {"type": "hours_before", "value": 5})     # 07-12 12:00 UTC: ahead again

    assert [j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")] == []
    assert klass["sched"].get_job(f"reminder_{klass['instance']}") is not None


def test_a_later_save_that_leaves_it_past_due_keeps_the_one_armed_pass(klass, monkeypatch):
    _quiet(klass["coach"])
    _save(klass["coach"], PAST)
    pin_clock(monkeypatch, datetime(2027, 7, 10, 22, 30))
    _send(klass["coach"], klass["key"])

    _save(klass["coach"], {"type": "days_before_at_time", "days": 2, "time": "10:00"})   # still past

    assert len([j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")]) == 1


# ── never by itself ─────────────────────────────────────────────────────────

def test_the_startup_and_daily_passes_send_nothing_and_leave_an_armed_pass(app, klass, monkeypatch):
    _quiet(klass["coach"])
    _save(klass["coach"], PAST)
    pin_clock(monkeypatch, datetime(2027, 7, 10, 22, 30))
    _send(klass["coach"], klass["key"])

    klass["module"]._startup_reschedule(app)
    klass["module"]._run_extend_schedule_window()

    assert _attempts(klass) == 0
    assert len([j for j in klass["sched"].get_jobs() if j.id.startswith("pastdue_")]) == 1


# ── a duplicated yes, at once, on the real database (a merge condition) ─────

def _past_due_407(app, *, materialised, reminder_count=1):
    """PAD-407's class (tomorrow at 10:00 on the REAL clock, three students), with a timing
    whose instant is already past, and the key the form would send for it."""
    from padel_app.services.notification_service import get_or_create_config
    from padel_app.tests.test_pad407_reminder_double_send import _materialise, _seed as _seed_407

    ids = _seed_407(app, reminder_count=reminder_count)
    with app.app_context():
        config = get_or_create_config(ids["coach_id"])
        config.reminder_timing = {"firstReminder": {"type": "hours_before", "value": 160}}
        config.save()
    if materialised:
        ids["instance_id"] = _materialise(app, ids)
        ids["key"] = f"i:{ids['instance_id']}"
    else:
        ids["key"] = f"o:{ids['lesson_id']}:{ids['date_str']}"
    return ids


def _all_attempts(app):
    from padel_app.models import ReminderAttempt

    with app.app_context():
        out = {}
        for row in ReminderAttempt.query.all():
            out[(row.player_id, row.number)] = out.get((row.player_id, row.number), 0) + 1
        return out


def test_yes_twice_in_a_row_reminds_each_student_once_on_the_real_clock(app, live_scheduler):
    """The same duplicated yes without the pinned clock or the hand-set `sent_at`: whatever
    the backend, the second request reminds nobody."""
    from padel_app.services.past_due_service import send_past_due
    from padel_app.tests.test_pad407_reminder_double_send import _io_patched

    ids = _past_due_407(app, materialised=True, reminder_count=3)
    with _io_patched(), app.app_context():
        first = send_past_due(ids["coach_id"], [ids["key"]])
        second = send_past_due(ids["coach_id"], [ids["key"], ids["key"]])

    assert first["sent"] == 3 and second["sent"] == 0
    assert _all_attempts(app) == {(pid, 1): 1 for pid in ids["player_ids"]}


from padel_app.tests.test_pad407_reminder_double_send import POSTGRES_ONLY  # noqa: E402


@POSTGRES_ONLY
@pytest.mark.parametrize("reminder_count", [1, 3])
def test_two_yeses_at_once_remind_each_student_once(app, monkeypatch, live_scheduler, reminder_count):
    """Two requests for the same class at the same moment (a double click, a retried
    request). PAD-407's forced interleave holds both at their first count; the per-class
    lock lets one pass through, and the other finds every student at their count or inside
    the spacing. Its teeth: `test_without_the_class_lock_the_same_two_yeses_double_send`."""
    from padel_app.services.past_due_service import send_past_due
    from padel_app.tests.test_pad407_reminder_double_send import _forced_interleave, _io_patched, _race

    ids = _past_due_407(app, materialised=True, reminder_count=reminder_count)
    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [lambda: send_past_due(ids["coach_id"], [ids["key"]])] * 2)

    assert _all_attempts(app) == {(pid, 1): 1 for pid in ids["player_ids"]}


@POSTGRES_ONLY
@pytest.mark.parametrize("reminder_count", [1, 3])
def test_two_yeses_at_once_for_a_class_not_materialised_end_with_one_reminder_each(app, monkeypatch, live_scheduler, reminder_count):
    """The OUTCOME for a class that both requests have to materialise first: one class, one
    reminder per student. This does NOT show which guard did it: it stays green with
    PAD-407's lock removed, because materialisation is itself serialised per lesson
    (PAD-261's row lock) and the two requests no longer meet at the count."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.past_due_service import send_past_due
    from padel_app.tests.test_pad407_reminder_double_send import _forced_interleave, _io_patched, _race

    ids = _past_due_407(app, materialised=False, reminder_count=reminder_count)
    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [lambda: send_past_due(ids["coach_id"], [ids["key"]])] * 2)

    with app.app_context():
        assert LessonInstance.query.filter_by(lesson_id=ids["lesson_id"]).count() == 1
    assert _all_attempts(app) == {(pid, 1): 1 for pid in ids["player_ids"]}


def test_the_endpoint_only_acts_for_the_calling_coach(app, klass, client):
    """The body is a request: a coach who names another coach's class gets it skipped."""
    from flask_jwt_extended import create_access_token

    from padel_app.models.coaches import Coach
    from padel_app.tests.test_pad478_primary_coach_decides import _new_coach, _store_timing

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    _save(klass["coach"], PAST)
    other = _new_coach("endpoint-other")
    _store_timing(other, PAST)

    def as_coach(coach_id):
        return {"Authorization": f"Bearer {create_access_token(identity=str(Coach.query.get(coach_id).user_id))}"}

    theirs = client.post("/api/app/notify/past_due/send", json={"reminders": [klass["key"]]}, headers=as_coach(other))
    assert theirs.status_code == 200
    assert theirs.get_json()["sent"] == 0
    assert theirs.get_json()["skipped"] == 1
    assert klass["key"] not in theirs.get_data(as_text=True)
    assert _attempts(klass) == 0

    too_many = client.post("/api/app/notify/past_due/send", json={"reminders": [f"i:{n}" for n in range(201)]},
                           headers=as_coach(klass["coach"]))
    assert too_many.status_code == 400

    assert client.post("/api/app/notify/past_due/send", json={"reminders": "all"}, headers=as_coach(klass["coach"])).status_code == 400
    assert client.post("/api/app/notify/past_due/send", json={"reminders": [klass["key"]]}).status_code == 401

    mine = client.post("/api/app/notify/past_due/send", json={"reminders": [klass["key"]]}, headers=as_coach(klass["coach"]))
    assert mine.get_json()["sent"] == 1
    assert _attempts(klass) == 1


@POSTGRES_ONLY
def test_without_the_class_lock_the_same_two_yeses_double_send(app, monkeypatch, live_scheduler):
    """The harness has teeth: take PAD-407's per-class lock away and the same race sends twice."""
    import contextlib

    from padel_app.services import notification_service
    from padel_app.services.past_due_service import send_past_due
    from padel_app.tests.test_pad407_reminder_double_send import _forced_interleave, _io_patched, _race

    monkeypatch.setattr(notification_service, "_reminder_pass_lock", lambda _iid: contextlib.nullcontext())
    ids = _past_due_407(app, materialised=True)
    with _io_patched(), _forced_interleave(monkeypatch):
        _race(app, [lambda: send_past_due(ids["coach_id"], [ids["key"]])] * 2)

    assert set(_all_attempts(app).values()) == {2}, "every student got the reminder twice"
