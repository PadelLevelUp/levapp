"""PAD-772 — a student's availability block answers the classes it covers (calendar.student-blockers rules
19-25): the covered set on every blocker save, only the newly covered on an edit, the schedule's read, and
(waves 3) the mark that declines each class the student agrees to.

Fixed dates and a pinned clock: now = Tuesday 2026-12-01 10:00 (UTC = Lisbon in December).
"""
import json
from contextlib import ExitStack
from datetime import date, datetime, timedelta
from unittest import mock

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

NOW = datetime(2026, 12, 1, 10, 0)
SCHEDULE_ID = "3b0e4b8e-6a51-4a54-9f4e-8a1d3d1f0772"


@pytest.fixture(autouse=True)
def _clock(app, monkeypatch):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    pin_clock(monkeypatch, NOW)


class World:
    def __init__(self, app):
        from padel_app.models import Coach, Player, User
        from padel_app.models.clubs import Club

        self.app = app
        self.n = 0
        with app.app_context():
            self.users, self.players = {}, {}
            for name in ("ana", "bia"):
                u = User(name=name.title(), username=f"p772_{name}", email=f"p772_{name}@t.test", password="x", status="active")
                db.session.add(u)
                db.session.flush()
                p = Player(user_id=u.id)
                db.session.add(p)
                db.session.flush()
                self.users[name], self.players[name] = u.id, p.id
            cu = User(name="Coach", username="p772_coach", email="p772_coach@t.test", password="x", status="active")
            db.session.add(cu)
            db.session.flush()
            coach = Coach(user_id=cu.id)
            db.session.add(coach)
            club = Club(name="Club", description="", location="City")
            db.session.add(club)
            db.session.commit()
            self.coach_user, self.coach, self.club = cu.id, coach.id, club.id

    def headers(self, who):
        uid = self.coach_user if who == "coach" else self.users[who]
        with self.app.app_context():
            return {"Authorization": f"Bearer {create_access_token(identity=str(uid))}"}

    def call(self, method, url, who="ana", body=None):
        client = self.app.test_client()
        return getattr(client, method)(url, json=body, headers=self.headers(who))

    # ── classes ────────────────────────────────────────────────────────────────
    def _lesson(self, start, minutes, *, recurrence=None, end=None, title="Aula"):
        from padel_app.models import Association_CoachLesson
        from padel_app.models.lessons import Lesson

        lesson = Lesson(
            title=title, start_datetime=start, end_datetime=start + timedelta(minutes=minutes),
            is_recurring=bool(recurrence), recurrence_rule=json.dumps(recurrence) if recurrence else None,
            recurrence_end=end, type="academy", max_players=4, color="#000", status="active", club_id=self.club)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=self.coach, lesson_id=lesson.id))
        return lesson

    def weekly(self, who, start, *, days, end=None, title="Semanal", minutes=60):
        """A recurring series on the student's roster, with no instance rows yet (virtual occurrences)."""
        from padel_app.models import Association_PlayerLesson

        with self.app.app_context():
            lesson = self._lesson(start, minutes, recurrence={"frequency": "weekly", "daysOfWeek": days}, end=end, title=title)
            db.session.add(Association_PlayerLesson(player_id=self.players[who], lesson_id=lesson.id))
            db.session.commit()
            return lesson.id

    def one_off(self, who, start, *, title="Avulsa", minutes=60, declined=False):
        """A one-off class that already has its instance and the student's presence on it."""
        from padel_app.models import Association_PlayerLesson, LessonInstance, Presence

        with self.app.app_context():
            lesson = self._lesson(start, minutes, title=title)
            db.session.add(Association_PlayerLesson(player_id=self.players[who], lesson_id=lesson.id))
            inst = LessonInstance(
                lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(minutes=minutes),
                max_players=4, status="scheduled", notifications_enabled=True,
                original_lesson_occurence_date=start.date())
            db.session.add(inst)
            db.session.flush()
            presence = Presence(lesson_instance_id=inst.id, player_id=self.players[who])
            if declined:
                presence.status, presence.justification, presence.confirmed = "absent", "justified", True
            db.session.add(presence)
            db.session.commit()
            return inst.id

    def materialised(self, lesson_id, who, occ_date, *, declined=False):
        """The instance row of one occurrence of a series, with the student's presence on it."""
        from padel_app.models import LessonInstance, Presence
        from padel_app.models.lessons import Lesson

        with self.app.app_context():
            lesson = db.session.get(Lesson, lesson_id)
            start = datetime.combine(occ_date, lesson.start_datetime.time())
            inst = LessonInstance(
                lesson_id=lesson_id, start_datetime=start, end_datetime=start + (lesson.end_datetime - lesson.start_datetime),
                max_players=4, status="scheduled", notifications_enabled=True, original_lesson_occurence_date=occ_date)
            db.session.add(inst)
            db.session.flush()
            presence = Presence(lesson_instance_id=inst.id, player_id=self.players[who])
            if declined:
                presence.status, presence.justification, presence.confirmed = "absent", "justified", True
            db.session.add(presence)
            db.session.commit()
            return inst.id

    # ── blocks ─────────────────────────────────────────────────────────────────
    @staticmethod
    def block(day, start, end, *, days=None, until=None, title="Fora"):
        body = {"title": title, "date": day, "startTime": start, "endTime": end, "isRecurring": bool(days)}
        if days:
            body.update(recurrenceRule={"frequency": "weekly", "daysOfWeek": days}, endDate=until)
        return body


@pytest.fixture
def world(app):
    return World(app)


def dates(res):
    return [c["date"] for c in res.get_json()["coveredClasses"]]


def presences(app):
    from padel_app.models import Presence

    with app.app_context():
        return sorted((p.id, p.status, p.confirmed, p.response) for p in Presence.query.all())


# ── -17 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-17")
def test_create_answers_the_covered_occurrences_and_marks_nothing(world, app):
    from padel_app.models import LessonInstance, Message

    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))  # Wed 2, 9, 16, 23
    tuesday = world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Terça")
    world.materialised(weekly, "ana", date(2026, 12, 9), declined=True)  # already declined
    world.one_off("ana", datetime(2026, 12, 1, 8, 0), title="Já começou")  # 08:00 today, now is 10:00
    world.one_off("bia", datetime(2026, 12, 2, 18, 0), title="Da Bia")
    validated = world.one_off("ana", datetime(2026, 12, 3, 18, 0), title="Validada")  # the coach validated it: status stays NULL
    with app.app_context():
        from padel_app.models import Presence

        row = Presence.query.filter_by(lesson_instance_id=validated).one()
        row.validated = True
        db.session.commit()
    before = presences(app)
    with app.app_context():
        instances_before, messages_before = LessonInstance.query.count(), Message.query.count()

    res = world.call("post", "/api/app/availability_blockers", body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-21"))
    assert res.status_code == 201
    covered = res.get_json()["coveredClasses"]
    assert [(c["model"], c["originalId"], c["date"]) for c in covered] == [
        ("Lesson", weekly, "2026-12-02"),  # a virtual occurrence counts
        ("LessonInstance", tuesday, "2026-12-08"),
        ("Lesson", weekly, "2026-12-16"),
    ]  # not 12-09 (declined), not 12-23 (the block ends 12-21), not the started or the other student's class
    assert {"title", "start", "end"} <= set(covered[0]) and covered[0]["title"] == "Semanal"
    assert [c["start"] for c in covered] == sorted(c["start"] for c in covered)
    assert covered[0]["start"].startswith("2026-12-02T19:00") and covered[0]["end"].startswith("2026-12-02T20:00")

    # Touching only at the end instant covers nothing (half-open, the predicate that holds invitations back).
    res = world.call("post", "/api/app/availability_blockers", body=world.block("2026-12-02", "20:00", "21:00"))
    assert res.status_code == 201 and res.get_json()["coveredClasses"] == []

    # Saving marks nothing: no presence, no instance, no message was written by either save.
    assert presences(app) == before
    with app.app_context():
        assert LessonInstance.query.count() == instances_before and Message.query.count() == messages_before


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-17")
def test_the_horizon_cuts_an_endless_block_and_a_default_end_is_listed_whole(world, app):
    from padel_app.models import CalendarBlock
    from padel_app.services.blocker_covered_service import covered_for_blocks
    from padel_app.models.users import User

    world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3])  # Wednesdays, no end
    with app.app_context():
        endless = CalendarBlock(user_id=world.users["ana"], type="unavailable", title="x", start_datetime=datetime(2026, 12, 1, 8),
                                end_datetime=datetime(2026, 12, 1, 23), is_recurring=True,
                                recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [1, 2, 3, 4]}), blocks_auto_invitations=True)
        covered = covered_for_blocks(db.session.get(User, world.users["ana"]), [endless])
        got = [c["date"] for c in covered]
    # The first occurrence is 2026-12-01; 92 days on is 2027-03-03, so the last Wednesday listed is 03-03 (a Wednesday, inside).
    assert got[0] == "2026-12-02" and got[-1] == "2027-03-03" and len(got) == 14

    # A block that starts six weeks ahead with the sheet's default end (three months) is listed whole,
    # a class late on its last day included.
    late = world.one_off("ana", datetime(2027, 4, 12, 22, 0), title="Último dia")
    res = world.call("post", "/api/app/availability_blockers", body=world.block("2027-01-12", "08:00", "23:00", days=[1, 2], until="2027-04-12"))
    assert res.status_code == 201
    assert ("LessonInstance", late, "2027-04-12") in [(c["model"], c["originalId"], c["date"]) for c in res.get_json()["coveredClasses"]]


# ── -18 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-18")
def test_an_edit_and_a_schedule_save_answer_only_newly_covered_classes(world, app):
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Terça")  # the class the student keeps
    thursday = world.one_off("ana", datetime(2026, 12, 3, 19, 0), title="Quinta")

    created = world.call("post", "/api/app/availability_blockers", body=world.block("2026-12-01", "08:00", "23:00", days=[2], until="2026-12-15"))
    assert dates(created) == ["2026-12-08"]
    block_id = created.get_json()["id"]

    # Edit to cover Tuesday and Wednesday: only the Wednesdays are new; the kept Tuesday is not asked again.
    edited = world.call("put", f"/api/app/availability_blockers/{block_id}", body=world.block("2026-12-01", "08:00", "23:00", days=[2, 3], until="2026-12-10"))
    assert edited.status_code == 200 and dates(edited) == ["2026-12-02", "2026-12-09"]
    assert {c["originalId"] for c in edited.get_json()["coveredClasses"]} == {weekly}

    # An edit that covers nothing new answers an empty list.
    again = world.call("put", f"/api/app/availability_blockers/{block_id}", body=world.block("2026-12-01", "09:00", "22:00", days=[2, 3], until="2026-12-10"))
    assert again.status_code == 200 and again.get_json()["coveredClasses"] == []

    # The schedule: stored rows cover Tuesday; the read adds Thursday and answers only Thursday, writing nothing.
    row = lambda d, days: {**world.block(d, "08:00", "23:00", days=days, until="2026-12-15"), "title": None}
    put = world.call("put", f"/api/app/availability_schedules/{SCHEDULE_ID}", body={"blockers": [row("2026-12-01", [2])]})
    assert put.status_code == 200 and isinstance(put.get_json(), list)  # still a bare list of rows
    before = presences(app)
    read = world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", body={"blockers": [row("2026-12-01", [2]), row("2026-12-01", [4])]})
    assert read.status_code == 200
    assert [(c["model"], c["originalId"], c["date"]) for c in read.get_json()["coveredClasses"]] == [("LessonInstance", thursday, "2026-12-03")]
    assert presences(app) == before
    from padel_app.models import CalendarBlock

    with app.app_context():
        assert CalendarBlock.query.filter_by(schedule_id=SCHEDULE_ID).count() == 1  # the read wrote no row
    # A new schedule has no stored rows: everything it covers is new. Another student's id, and a bad id, are refused.
    fresh = world.call("post", "/api/app/availability_schedules/3b0e4b8e-6a51-4a54-9f4e-8a1d3d1f9999/covered_classes", body={"blockers": [row("2026-12-01", [4])]})
    assert fresh.status_code == 200 and dates(fresh) == ["2026-12-03"]
    assert world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", who="bia", body={"blockers": [row("2026-12-01", [4])]}).status_code == 404
    assert world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", who="coach", body={"blockers": []}).status_code == 403


# ── -28 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-28")
def test_a_calendar_block_edit_of_a_blocker_answers_covered_classes(world, app):
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    created = world.call("post", "/api/app/availability_blockers", body=world.block("2026-12-02", "08:00", "09:00"))
    block_id = created.get_json()["id"]

    # The student widens it from the calendar's block sheet: the same answer key, the same newly-covered rule.
    res = world.call("put", f"/api/app/calendar_block/{block_id}", body={**world.block("2026-12-02", "08:00", "21:00"), "type": "unavailable"})
    assert res.status_code == 200
    assert [(c["model"], c["originalId"], c["date"]) for c in res.get_json()["coveredClasses"]] == [("Lesson", weekly, "2026-12-02")]
    again = world.call("put", f"/api/app/calendar_block/{block_id}", body={**world.block("2026-12-02", "08:00", "22:00"), "type": "unavailable"})
    assert again.get_json()["coveredClasses"] == []

    # A coach's own personal block, saved the same way, carries no `coveredClasses` key.
    from padel_app.models import CalendarBlock

    with app.app_context():
        personal = CalendarBlock(user_id=world.coach_user, type="personal", title="Dentista", start_datetime=datetime(2026, 12, 2, 8),
                                 end_datetime=datetime(2026, 12, 2, 9), is_recurring=False)
        db.session.add(personal)
        db.session.commit()
        personal_id = personal.id
    res = world.call("put", f"/api/app/calendar_block/{personal_id}", who="coach", body={**world.block("2026-12-02", "08:00", "21:00"), "type": "personal"})
    assert res.status_code == 200 and "coveredClasses" not in res.get_json()


# ── wave 3: the mark ────────────────────────────────────────────────────────────────────────────────

IO = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.system_messages.publish",
    "padel_app.services.system_messages.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
]
MARK = "/api/app/availability_blockers/decline_covered"


@pytest.fixture
def io():
    """No Redis, no push: the coach's push is the one `system_messages.send_push_notification`."""
    with ExitStack() as stack:
        mocks = {name.rsplit(".", 2)[-2] + "." + name.rsplit(".", 1)[-1]: stack.enter_context(mock.patch(name)) for name in IO}
        yield mocks


def entry(model, original_id, day):
    return {"model": model, "originalId": original_id, "date": day}


def messages(app, **filters):
    from padel_app.models import Message

    with app.app_context():
        return [(m.sender_id, m.text, dict(m.msg_metadata or {})) for m in Message.query.filter_by(**filters).order_by(Message.id).all()]


def presence_of(app, who_player_id, instance_id):
    from padel_app.models import Presence

    with app.app_context():
        p = Presence.query.filter_by(player_id=who_player_id, lesson_instance_id=instance_id).first()
        return None if p is None else {"status": p.status, "source": p.decline_source, "responded_at": p.responded_at, "response": p.response}


def vacancies(app, instance_id):
    from padel_app.models import Vacancy

    with app.app_context():
        return [(v.original_player_id, v.status, v.invite_not_before) for v in Vacancy.query.filter_by(lesson_instance_id=instance_id).all()]


def instance_of(app, lesson_id, day):
    from padel_app.models import LessonInstance

    with app.app_context():
        row = LessonInstance.query.filter_by(lesson_id=lesson_id, original_lesson_occurence_date=date.fromisoformat(day)).first()
        return None if row is None else row.id


def own_block(world):
    """The student's Mon-Thu 08:00-23:00 block, made through the route (stored, so the server re-checks it)."""
    res = world.call("post", "/api/app/availability_blockers", body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-21"))
    assert res.status_code == 201
    return res.get_json()["id"]


def customised_coach(world, app):
    """The coach on the OLD engine (a fresh config starts on the new one) with a customised acknowledgement."""
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        config = get_or_create_config(world.coach)
        config.engine_version, config.engine_switched_at = "old", None
        config.message_templates = {"reminder_declined": "Vale, então não conto contigo amanhã"}
        db.session.commit()


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-19")
def test_yes_declines_through_the_ordinary_path_without_a_student_message(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))  # virtual, eight days ahead: before the reminder
    soon = world.one_off("ana", datetime(2026, 12, 2, 9, 0), title="Cedo")  # 23 h ahead: inside the 24 h deadline
    own_block(world)

    res = world.call("post", MARK, body={"occurrences": [entry("Lesson", weekly, "2026-12-09"), entry("LessonInstance", soon, "2026-12-02")]})
    assert res.status_code == 200, res.get_data(as_text=True)[:300]
    body = res.get_json()
    assert body["skipped"] == []
    assert [(d["model"], d["originalId"], d["date"]) for d in body["declined"]] == [("Lesson", weekly, "2026-12-09"), ("LessonInstance", soon, "2026-12-02")]
    wednesday = instance_of(app, weekly, "2026-12-09")  # materialised by the mark
    assert wednesday is not None and body["declined"][0]["lessonInstanceId"] == wednesday and body["declined"][1]["lessonInstanceId"] == soon

    for instance_id in (wednesday, soon):
        p = presence_of(app, world.players["ana"], instance_id)
        assert p["status"] == "absent" and p["source"] == "availability_block" and p["responded_at"] == NOW
        assert any(v[0] == world.players["ana"] and v[1] == "open" for v in vacancies(app, instance_id)), (instance_id, vacancies(app, instance_id))
    assert presence_of(app, world.players["ana"], wednesday)["response"] == "proactive_decline"
    assert presence_of(app, world.players["ana"], soon)["response"] == "cancelled"
    # The Wednesday spot is held to the invitation start, as any decline there is.
    assert any(v[2] is not None for v in vacancies(app, wednesday))

    # No message from the coach (no reminder_declined); one notice per class from the student, with the marker.
    assert [m for m in messages(app, sender_id=world.coach_user)] == []
    notices = [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")]
    assert len(notices) == 2
    by_instance = {m[2]["lessonInstanceId"]: m for m in notices}
    assert by_instance[wednesday][2]["availabilityBlock"] is True and by_instance[wednesday][2]["proactiveDecline"] is True
    assert by_instance[soon][2]["availabilityBlock"] is True and by_instance[soon][2]["lateCancellation"] is True
    assert "unavailable" in by_instance[wednesday][1].lower() or "indispon" in by_instance[wednesday][1].lower()
    assert "LATE" in by_instance[soon][1] or "ATRASADO" in by_instance[soon][1]
    assert "LATE" not in by_instance[wednesday][1] and "ATRASADO" not in by_instance[wednesday][1]
    assert "Fora" not in by_instance[wednesday][1] and "08:00" not in by_instance[wednesday][1]  # the block's title and times never appear
    assert io["system_messages.send_push_notification"].call_count == 1  # only the late one pushes the coach


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-20")
def test_the_mark_rechecks_each_entry_and_skips_what_fails(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    friday = world.one_off("ana", datetime(2026, 12, 4, 18, 0), title="Sexta")  # the block is Mon-Thu
    bia = world.one_off("bia", datetime(2026, 12, 2, 18, 0), title="Da Bia")
    started = world.one_off("ana", datetime(2026, 12, 1, 8, 30), title="Já começou")
    done = world.one_off("ana", datetime(2026, 12, 3, 18, 0), title="Já respondida", declined=True)
    own_block(world)
    before = presences(app)

    res = world.call("post", MARK, body={"occurrences": [
        entry("Lesson", weekly, "2026-12-02"), entry("LessonInstance", friday, "2026-12-04"), entry("LessonInstance", bia, "2026-12-02"),
        entry("LessonInstance", started, "2026-12-01"), entry("LessonInstance", done, "2026-12-03"),
    ]})
    assert res.status_code == 200
    body = res.get_json()
    assert [d["originalId"] for d in body["declined"]] == [weekly]
    assert {(s["originalId"], s["reason"]) for s in body["skipped"]} == {
        (friday, "not_covered"), (bia, "not_enrolled"), (started, "started"), (done, "already_answered")}
    # Nothing was written for the skipped ones: no presence changed, no instance materialised for a series they are not in.
    changed = [p for p in presences(app) if p not in before]
    assert len(changed) == 1  # the Wednesday's, now absent
    assert [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")].__len__() == 1

    # A coach gets 403.
    assert world.call("post", MARK, who="coach", body={"occurrences": []}).status_code == 403

    # A virtual occurrence whose materialised instance holds no presence for the student: skipped, the rest still declined.
    other = world.weekly("ana", datetime(2026, 12, 9, 20, 0), days=[3], end=date(2026, 12, 9), title="Sem presença")
    world.materialised(other, "bia", date(2026, 12, 9))  # the instance exists, holding Bia's presence only
    again = world.call("post", MARK, body={"occurrences": [entry("Lesson", other, "2026-12-09")]})
    assert again.get_json()["declined"] == [] and again.get_json()["skipped"][0]["reason"] == "not_enrolled"


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-27")
def test_a_repeated_yes_declines_once_and_a_refusal_rolls_back_only_its_entry(world, app, io):
    customised_coach(world, app)
    from flask import abort

    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    late_start = world.one_off("ana", datetime(2026, 12, 3, 12, 0), title="Começa já")
    own_block(world)
    first = world.call("post", MARK, body={"occurrences": [entry("Lesson", weekly, "2026-12-02")]})
    again = world.call("post", MARK, body={"occurrences": [entry("Lesson", weekly, "2026-12-02")]})
    assert [d["originalId"] for d in first.get_json()["declined"]] == [weekly]
    assert again.get_json()["declined"] == [] and again.get_json()["skipped"][0]["reason"] == "already_answered"
    wednesday = instance_of(app, weekly, "2026-12-02")
    assert len([m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")]) == 1
    assert len(vacancies(app, wednesday)) == 1

    # An entry whose class starts between the re-check and the decline: the decline path's 409 is its own skip.
    from padel_app.services import blocker_decline_service as svc

    real = svc.cancel_attendance

    def refuse_one(user_id, **kw):
        if kw.get("lesson_instance_id") == late_start:
            abort(409, description="Class has already started")
        return real(user_id, **kw)

    other = world.weekly("ana", datetime(2026, 12, 9, 19, 0), days=[3], end=date(2026, 12, 9), title="Outra")
    with mock.patch.object(svc, "cancel_attendance", refuse_one):
        res = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", late_start, "2026-12-03"), entry("Lesson", other, "2026-12-09")]})
    body = res.get_json()
    assert [d["originalId"] for d in body["declined"]] == [other]
    assert [(s["originalId"], s["reason"]) for s in body["skipped"]] == [(late_start, "started")]
    assert presence_of(app, world.players["ana"], late_start)["status"] is None  # nothing of it was written
    assert vacancies(app, late_start) == []


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-21")
def test_a_new_engine_session_is_marked_by_the_engine(world, app, io):
    from padel_app.models import EngineSession, Presence

    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Nova")
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=soon, coach_id=world.coach, alerted=[]))
        db.session.commit()
    own_block(world)
    res = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", soon, "2026-12-02")]})  # the real engine
    assert [d["originalId"] for d in res.get_json()["declined"]] == [soon]
    p = presence_of(app, world.players["ana"], soon)
    assert p["status"] == "absent" and p["source"] == "availability_block" and p["responded_at"] == NOW
    with app.app_context():
        assert Presence.query.filter_by(lesson_instance_id=soon, player_id=world.players["ana"]).count() == 1  # one absence
    again = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", soon, "2026-12-02")]})
    assert again.get_json()["declined"] == []
    assert [(s["originalId"], s["reason"]) for s in again.get_json()["skipped"]] == [(soon, "already_answered")]
    assert messages(app, sender_id=world.coach_user) == []  # nothing from the coach
    assert [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")] == []  # and no coach notice on the new engine
    with app.app_context():
        from padel_app.serializers.presence import serialize_presence

        assert serialize_presence(Presence.query.filter_by(lesson_instance_id=soon).first())["declineSource"] == "availability_block"


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-22")
def test_a_marked_class_is_not_reminded_and_survives_the_block_delete(world, app, io):
    customised_coach(world, app)
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import _reminder_recipients, get_or_create_config, respond_to_reminder

    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Marcada")
    block_id = own_block(world)
    marked = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", soon, "2026-12-02")]})
    assert [d["originalId"] for d in marked.get_json()["declined"]] == [soon]
    assert world.call("delete", f"/api/app/availability_blockers/{block_id}", body={}).status_code == 204

    p = presence_of(app, world.players["ana"], soon)
    assert p["status"] == "absent" and p["source"] == "availability_block"  # deleting the block undoes nothing
    assert any(v[1] == "open" for v in vacancies(app, soon))
    with app.app_context():
        instance = db.session.get(LessonInstance, soon)
        due, _blocked = _reminder_recipients(instance, get_or_create_config(world.coach), world.coach_user, NOW + timedelta(hours=6), scheduled=True)
        assert [pres.player_id for pres, _count in due if pres.player_id == world.players["ana"]] == []

        # "Afinal vou" with a free spot brings them back; the coach's row then carries no unavailability reason.
        assert respond_to_reminder(soon, "yes", world.users["ana"], now=NOW)["action"] == "confirmed"
    back = presence_of(app, world.players["ana"], soon)
    assert back["status"] is None and back["source"] is None


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-22")
def test_on_the_new_engine_the_block_reason_goes_with_the_answer_that_follows(world, app, io):
    from padel_app.models import EngineSession, Presence
    from padel_app.services.notification_service import respond_to_reminder

    regular = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Regular")
    placed = world.one_off("ana", datetime(2026, 12, 3, 19, 0), title="Colocada")
    with app.app_context():
        for instance in (regular, placed):
            db.session.add(EngineSession(lesson_instance_id=instance, coach_id=world.coach, alerted=[]))
        Presence.query.filter_by(lesson_instance_id=regular).one().enrolment_source = "roster"  # the engine brings a regular back
        db.session.commit()
    own_block(world)
    marked = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", regular, "2026-12-02")]})
    assert len(marked.get_json()["declined"]) == 1
    assert presence_of(app, world.players["ana"], regular)["source"] == "availability_block"

    # "Afinal vou" on the new engine clears it with the absence.
    with app.app_context():
        assert respond_to_reminder(regular, "yes", world.users["ana"], now=NOW)["action"] == "confirmed"
    back = presence_of(app, world.players["ana"], regular)
    assert back["status"] is None and back["source"] is None

    # A later ordinary "Não vai" writes no reason, whatever the row carried: it is not "indisponível".
    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=placed).one()
        row.decline_source = "availability_block"  # a reason left by an earlier block decline
        db.session.commit()
    assert world.call("post", "/api/app/notify/cancel_attendance", body={"lessonInstanceId": placed}).status_code == 200
    again = presence_of(app, world.players["ana"], placed)
    assert again["status"] == "absent" and again["source"] is None


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-20")
def test_one_mark_call_asks_about_at_most_two_hundred_classes(world, app, io):
    from padel_app.services.blocker_decline_service import MAX_ENTRIES

    assert MAX_ENTRIES == 200
    own_block(world)
    crowd = [entry("Lesson", 1, (date(2026, 12, 2) + timedelta(days=i)).isoformat()) for i in range(MAX_ENTRIES + 1)]
    assert world.call("post", MARK, body={"occurrences": crowd}).status_code == 400
    assert world.call("post", MARK, body={"occurrences": crowd[:MAX_ENTRIES]}).status_code == 200  # the limit itself passes


@pytest.mark.criterion("ATTENDANCE-CONFIRM-43")
def test_only_a_block_decline_drops_the_student_acknowledgement(world, app, io):
    from padel_app.models import Presence

    customised_coach(world, app)
    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Duas")
    with app.app_context():
        db.session.add(Presence(lesson_instance_id=soon, player_id=world.players["bia"]))
        db.session.commit()
    own_block(world)
    world.call("post", MARK, body={"occurrences": [entry("LessonInstance", soon, "2026-12-02")]})
    plain = world.call("post", "/api/app/notify/cancel_attendance", who="bia", body={"lessonInstanceId": soon})
    assert plain.status_code == 200

    assert messages(app, sender_id=world.coach_user) != []  # Bia's acknowledgement, from the coach
    acknowledgements = [m for m in messages(app, sender_id=world.coach_user)]
    assert len(acknowledgements) == 1 and "Vale, então" in acknowledgements[0][1]
    ana_thread = [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")]
    bia_thread = [m for m in messages(app, sender_id=world.users["bia"]) if m[2].get("cancellation")]
    assert ana_thread[0][2]["availabilityBlock"] is True and ana_thread[0][2]["lessonInstanceId"] == soon
    assert "proactiveDecline" in ana_thread[0][2] and "lateCancellation" in ana_thread[0][2]
    assert "availabilityBlock" not in bia_thread[0][2]
    assert presence_of(app, world.players["ana"], soon)["source"] == "availability_block"
    assert presence_of(app, world.players["bia"], soon)["source"] is None
