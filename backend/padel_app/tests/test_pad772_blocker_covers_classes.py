"""PAD-772 — a student's availability block answers the classes it covers (calendar.student-blockers rules
19-25): the covered set on every blocker save, only the newly covered on an edit, the schedule's read, and
(waves 3) the mark that declines each class the student agrees to.

Fixed dates and a pinned clock: now = Tuesday 2026-12-01 10:00 (UTC = Lisbon in December).
"""
import json
from datetime import date, datetime, timedelta

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
