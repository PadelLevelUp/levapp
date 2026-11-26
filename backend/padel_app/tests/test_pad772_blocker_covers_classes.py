"""PAD-772 / PAD-772b — a student's availability block marks the classes it covers "Não vai" when it is saved
(calendar.student-blockers rules 19-25, owner 26 Nov 2026: nothing is asked): the covered set on every blocker
save, only the newly covered on an edit, a schedule save or a move, the old build's calls made harmless, and the
repeat decline that changes nothing (attendance.confirm rule 31).

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



IO = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.system_messages.publish",
    "padel_app.services.system_messages.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
]
MARK = "/api/app/availability_blockers/decline_covered"
BLOCKERS = "/api/app/availability_blockers"


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
    """The student's Mon-Thu 08:00-23:00 block until 21 Dec, saved through the route: it marks whatever it covers now."""
    res = world.call("post", BLOCKERS, body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-21"))
    assert res.status_code == 201
    return res.get_json()


def marked(res):
    return [(c["model"], c["originalId"], c["date"]) for c in res.get_json()["markedClasses"]]


def customised_coach(world, app):
    """The coach on the OLD engine (a fresh config starts on the new one) with a customised acknowledgement."""
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        config = get_or_create_config(world.coach)
        config.engine_version, config.engine_switched_at = "old", None
        config.message_templates = {"reminder_declined": "Vale, então não conto contigo amanhã"}
        db.session.commit()


def bring_back(app, player_id, instance_id):
    """What "Afinal vou" leaves: the student is back in, with no reason."""
    from padel_app.models import Presence

    with app.app_context():
        row = Presence.query.filter_by(player_id=player_id, lesson_instance_id=instance_id).one()
        row.status, row.justification, row.confirmed, row.decline_source = None, None, False, None
        db.session.commit()


# ── -17 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-17")
def test_create_marks_the_covered_occurrences_at_once(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))  # Wed 2, 9, 16, 23
    tuesday = world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Terça")
    world.materialised(weekly, "ana", date(2026, 12, 9), declined=True)  # already declined
    started = world.one_off("ana", datetime(2026, 12, 1, 8, 0), title="Já começou")  # 08:00 today, now is 10:00
    bia = world.one_off("bia", datetime(2026, 12, 2, 18, 0), title="Da Bia")
    validated = world.one_off("ana", datetime(2026, 12, 3, 18, 0), title="Validada")  # the coach validated it: status stays NULL
    with app.app_context():
        from padel_app.models import Presence

        row = Presence.query.filter_by(lesson_instance_id=validated).one()
        row.validated = True
        db.session.commit()
    declined_before = presence_of(app, world.players["ana"], instance_of(app, weekly, "2026-12-09"))
    ana_untouched = {i: presence_of(app, world.players["ana"], i) for i in (started, validated)}

    res = world.call("post", BLOCKERS, body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-21"))
    assert res.status_code == 201
    body = res.get_json()
    assert body["coveredClasses"] == []
    assert marked(res) == [
        ("Lesson", weekly, "2026-12-02"),  # a virtual occurrence counts
        ("LessonInstance", tuesday, "2026-12-08"),
        ("Lesson", weekly, "2026-12-16"),
    ]  # not 12-09 (declined), not 12-23 (the block ends 12-21), not the started, validated or other student's class
    first = body["markedClasses"][0]
    assert {"title", "start", "end", "lessonInstanceId"} <= set(first) and first["title"] == "Semanal"
    assert [c["start"] for c in body["markedClasses"]] == sorted(c["start"] for c in body["markedClasses"])
    assert first["start"].startswith("2026-12-02T19:00") and first["end"].startswith("2026-12-02T20:00")
    for item in body["markedClasses"]:
        p = presence_of(app, world.players["ana"], item["lessonInstanceId"])
        assert p["status"] == "absent" and p["source"] == "availability_block"
    # The declined, started, validated and other student's classes are unchanged (the earlier decline keeps its source).
    assert presence_of(app, world.players["ana"], instance_of(app, weekly, "2026-12-09")) == declined_before
    assert {i: presence_of(app, world.players["ana"], i) for i in (started, validated)} == ana_untouched
    assert presence_of(app, world.players["bia"], bia)["status"] is None

    # Touching only at the end instant marks nothing (half-open, the predicate that holds invitations back).
    res = world.call("post", BLOCKERS, body=world.block("2026-12-02", "20:00", "21:00"))
    assert res.status_code == 201 and res.get_json()["markedClasses"] == []


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-17")
def test_the_horizon_cuts_an_endless_block_and_a_default_end_is_marked_whole(world, app, io):
    customised_coach(world, app)
    from padel_app.models import CalendarBlock
    from padel_app.models.users import User
    from padel_app.services.blocker_covered_service import covered_for_blocks

    world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3])  # Wednesdays, no end
    with app.app_context():
        endless = CalendarBlock(user_id=world.users["ana"], type="unavailable", title="x", start_datetime=datetime(2026, 12, 1, 8),
                                end_datetime=datetime(2026, 12, 1, 23), is_recurring=True,
                                recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [1, 2, 3, 4]}), blocks_auto_invitations=True)
        got = [c["date"] for c in covered_for_blocks(db.session.get(User, world.users["ana"]), [endless])]
    # The first occurrence is 2026-12-01 (today); 92 days on is 2027-03-03, a Wednesday, so it is the last one listed.
    assert got[0] == "2026-12-02" and got[-1] == "2027-03-03" and len(got) == 14

    # A block that starts six weeks ahead with the sheet's default end (three months) is marked whole,
    # a class late on its last day included.
    late = world.one_off("ana", datetime(2027, 4, 12, 22, 0), title="Último dia")
    res = world.call("post", BLOCKERS, body=world.block("2027-01-12", "08:00", "23:00", days=[1, 2], until="2027-04-12"))
    assert res.status_code == 201
    assert ("LessonInstance", late, "2027-04-12") in marked(res)
    assert presence_of(app, world.players["ana"], late)["source"] == "availability_block"


# ── -18 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-18")
def test_an_edit_a_schedule_save_and_a_move_mark_only_newly_covered_classes(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    tuesday = world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Terça")  # the class the student keeps
    monday = world.one_off("ana", datetime(2026, 12, 7, 18, 0), title="Segunda")  # kept by the schedule
    thursday = world.one_off("ana", datetime(2026, 12, 3, 19, 0), title="Quinta")
    saturday = world.one_off("ana", datetime(2026, 12, 12, 10, 0), title="Sábado")

    created = world.call("post", BLOCKERS, body=world.block("2026-12-01", "08:00", "23:00", days=[2], until="2026-12-15"))
    assert marked(created) == [("LessonInstance", tuesday, "2026-12-08")]
    block_id = created.get_json()["id"]
    bring_back(app, world.players["ana"], tuesday)  # "Afinal vou"

    # Edit to cover Tuesday and Wednesday: only the Wednesdays are new; the kept Tuesday stays coming.
    edited = world.call("put", f"{BLOCKERS}/{block_id}", body=world.block("2026-12-01", "08:00", "23:00", days=[2, 3], until="2026-12-10"))
    assert edited.status_code == 200 and marked(edited) == [("Lesson", weekly, "2026-12-02"), ("Lesson", weekly, "2026-12-09")]
    assert presence_of(app, world.players["ana"], tuesday)["status"] is None
    # An edit that covers nothing new marks nothing.
    again = world.call("put", f"{BLOCKERS}/{block_id}", body=world.block("2026-12-01", "09:00", "22:00", days=[2, 3], until="2026-12-10"))
    assert again.status_code == 200 and again.get_json()["markedClasses"] == []

    # The schedule: a Monday row first (marks the Monday class), the class brought back, then Thursday added.
    row = lambda d, days: {**world.block(d, "08:00", "23:00", days=days, until="2026-12-15"), "title": None}
    first = world.call("put", f"/api/app/availability_schedules/{SCHEDULE_ID}", body={"blockers": [row("2026-12-01", [1])]})
    assert first.status_code == 200 and isinstance(first.get_json(), list)  # still a bare list of rows
    assert presence_of(app, world.players["ana"], monday)["source"] == "availability_block"
    bring_back(app, world.players["ana"], monday)
    second = world.call("put", f"/api/app/availability_schedules/{SCHEDULE_ID}", body={"blockers": [row("2026-12-01", [1]), row("2026-12-01", [4])]})
    assert second.status_code == 200 and isinstance(second.get_json(), list)
    assert presence_of(app, world.players["ana"], thursday)["source"] == "availability_block"
    assert presence_of(app, world.players["ana"], monday)["status"] is None  # the Monday class stays coming

    # A moved occurrence of a recurring blocker marks the class it newly lands on (the answer is still 204).
    friday = world.call("post", BLOCKERS, body=world.block("2026-12-04", "08:00", "09:00", days=[5], until="2026-12-18")).get_json()["id"]
    moved = world.call("post", f"/api/app/reschedule_block/{friday}", body={
        "occDate": "2026-12-11", "newDate": "2026-12-12", "newStartTime": "09:00", "newEndTime": "11:00", "scope": "single"})
    assert moved.status_code == 204
    assert presence_of(app, world.players["ana"], saturday)["source"] == "availability_block"


# ── -28 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-28")
def test_a_calendar_block_edit_of_a_blocker_marks_newly_covered_classes(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    created = world.call("post", BLOCKERS, body=world.block("2026-12-02", "08:00", "09:00"))
    block_id = created.get_json()["id"]

    # The student widens it from the calendar's block sheet: the same answer keys, the same newly-covered rule.
    res = world.call("put", f"/api/app/calendar_block/{block_id}", body={**world.block("2026-12-02", "08:00", "21:00"), "type": "unavailable"})
    assert res.status_code == 200
    assert marked(res) == [("Lesson", weekly, "2026-12-02")] and res.get_json()["coveredClasses"] == []
    assert presence_of(app, world.players["ana"], instance_of(app, weekly, "2026-12-02"))["source"] == "availability_block"
    again = world.call("put", f"/api/app/calendar_block/{block_id}", body={**world.block("2026-12-02", "08:00", "22:00"), "type": "unavailable"})
    assert again.get_json()["markedClasses"] == []

    # A coach's own personal block, saved the same way, carries neither key and marks nothing.
    from padel_app.models import CalendarBlock

    with app.app_context():
        personal = CalendarBlock(user_id=world.coach_user, type="personal", title="Dentista", start_datetime=datetime(2026, 12, 2, 8),
                                 end_datetime=datetime(2026, 12, 2, 9), is_recurring=False)
        db.session.add(personal)
        db.session.commit()
        personal_id = personal.id
    res = world.call("put", f"/api/app/calendar_block/{personal_id}", who="coach", body={**world.block("2026-12-02", "08:00", "21:00"), "type": "personal"})
    assert res.status_code == 200 and "coveredClasses" not in res.get_json() and "markedClasses" not in res.get_json()


# ── -19 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-19")
def test_a_save_declines_through_the_ordinary_path_without_a_student_message(world, app, io):
    customised_coach(world, app)
    weekly = world.weekly("ana", datetime(2026, 12, 9, 19, 0), days=[3], end=date(2026, 12, 9))  # virtual, eight days ahead: before the reminder
    soon = world.one_off("ana", datetime(2026, 12, 2, 9, 0), title="Cedo")  # 23 h ahead: inside the 24 h deadline

    res = own_block_res(world)
    assert marked(res) == [("LessonInstance", soon, "2026-12-02"), ("Lesson", weekly, "2026-12-09")]
    wednesday = instance_of(app, weekly, "2026-12-09")  # materialised by the mark
    assert wednesday is not None and res.get_json()["markedClasses"][1]["lessonInstanceId"] == wednesday

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


def own_block_res(world):
    res = world.call("post", BLOCKERS, body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-21"))
    assert res.status_code == 201
    return res


# ── -20: the legacy mark call ───────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-20")
def test_the_mark_rechecks_each_entry_and_skips_what_fails(world, app, io):
    customised_coach(world, app)
    own_block(world)  # the block first: the classes made after it are not marked by its save
    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 23))
    friday = world.one_off("ana", datetime(2026, 12, 4, 18, 0), title="Sexta")  # the block is Mon-Thu
    bia = world.one_off("bia", datetime(2026, 12, 2, 18, 0), title="Da Bia")
    started = world.one_off("ana", datetime(2026, 12, 1, 8, 30), title="Já começou")
    done = world.one_off("ana", datetime(2026, 12, 3, 18, 0), title="Já respondida", declined=True)
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


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-20")
def test_one_mark_call_asks_about_at_most_two_hundred_classes(world, app, io):
    from padel_app.services.blocker_decline_service import MAX_ENTRIES

    assert MAX_ENTRIES == 200
    own_block(world)
    crowd = [entry("Lesson", 1, (date(2026, 12, 2) + timedelta(days=i)).isoformat()) for i in range(MAX_ENTRIES + 1)]
    assert world.call("post", MARK, body={"occurrences": crowd}).status_code == 400
    assert world.call("post", MARK, body={"occurrences": crowd[:MAX_ENTRIES]}).status_code == 200  # the limit itself passes


# ── -27 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-27")
def test_marks_decline_a_class_once_and_a_refusal_rolls_back_only_its_occurrence(world, app, io):
    customised_coach(world, app)
    from flask import abort

    weekly = world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3], end=date(2026, 12, 2))
    first = own_block_res(world)
    again = world.call("post", BLOCKERS, body=world.block("2026-12-02", "18:00", "21:00"))  # a second save over the same class
    legacy = world.call("post", MARK, body={"occurrences": [entry("Lesson", weekly, "2026-12-02")]})
    assert marked(first) == [("Lesson", weekly, "2026-12-02")] and again.get_json()["markedClasses"] == []
    assert legacy.get_json()["declined"] == [] and legacy.get_json()["skipped"][0]["reason"] == "already_answered"
    wednesday = instance_of(app, weekly, "2026-12-02")
    assert len([m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")]) == 1
    assert len(vacancies(app, wednesday)) == 1

    # A class whose start passes between the re-check and the decline: the decline path's 409 is its own skip.
    from padel_app.services import blocker_decline_service as svc

    real = svc.cancel_attendance
    late_start = world.one_off("ana", datetime(2026, 12, 3, 12, 0), title="Começa já")
    other = world.weekly("ana", datetime(2026, 12, 9, 19, 0), days=[3], end=date(2026, 12, 9), title="Outra")

    def refuse_one(user_id, **kw):
        if kw.get("lesson_instance_id") == late_start:
            abort(409, description="Class has already started")
        return real(user_id, **kw)

    with mock.patch.object(svc, "cancel_attendance", refuse_one):
        res = world.call("post", BLOCKERS, body=world.block("2026-12-03", "08:00", "23:00", days=[3, 4], until="2026-12-10"))
    assert res.status_code == 201
    assert marked(res) == [("Lesson", other, "2026-12-09")]
    assert presence_of(app, world.players["ana"], late_start)["status"] is None  # nothing of it was written
    assert vacancies(app, late_start) == []


# ── -29 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-29")
def test_a_failing_mark_leaves_the_block_saved_and_the_other_marks_made(world, app, io, caplog):
    customised_coach(world, app)
    from padel_app.models import CalendarBlock, LessonInstance, Message
    from padel_app.services import notification_service as ns

    one = world.one_off("ana", datetime(2026, 12, 2, 18, 0), title="Um")
    two = world.one_off("ana", datetime(2026, 12, 3, 18, 0), title="Dois")
    three = world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Três")
    real = ns._notify_coach_of_cancellation

    def explode_on_two(coach_user_id, player_user_id, instance, *a, **kw):
        if instance.id == two:
            raise RuntimeError("boom")
        return real(coach_user_id, player_user_id, instance, *a, **kw)

    with mock.patch.object(ns, "_notify_coach_of_cancellation", explode_on_two), caplog.at_level("ERROR"):
        res = own_block_res(world)
    assert res.status_code == 201
    assert marked(res) == [("LessonInstance", one, "2026-12-02"), ("LessonInstance", three, "2026-12-08")]
    with app.app_context():
        assert CalendarBlock.query.filter_by(id=res.get_json()["id"]).count() == 1  # the block is stored
    assert presence_of(app, world.players["ana"], two)["status"] is None  # the failed one is unchanged
    assert [m[2]["lessonInstanceId"] for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")] == [one, three]
    assert vacancies(app, two) == []
    assert any("LessonInstance" in r.getMessage() and str(two) in r.getMessage() and "2026-12-03" in r.getMessage() for r in caplog.records)


# ── -21 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-21")
def test_a_new_engine_session_is_marked_by_the_engine(world, app, io):
    from padel_app.models import EngineSession, Presence

    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Nova")
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=soon, coach_id=world.coach, alerted=[]))
        db.session.commit()
    res = own_block_res(world)  # the real engine
    assert marked(res) == [("LessonInstance", soon, "2026-12-02")]
    p = presence_of(app, world.players["ana"], soon)
    assert p["status"] == "absent" and p["source"] == "availability_block" and p["responded_at"] == NOW
    with app.app_context():
        assert Presence.query.filter_by(lesson_instance_id=soon, player_id=world.players["ana"]).count() == 1  # one absence
    again = world.call("post", BLOCKERS, body=world.block("2026-12-02", "08:00", "23:00"))
    assert again.get_json()["markedClasses"] == []  # a second save covering it marks nothing more
    assert messages(app, sender_id=world.coach_user) == []  # nothing from the coach
    assert [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")] == []  # and no coach notice on the new engine
    with app.app_context():
        from padel_app.serializers.presence import serialize_presence

        assert serialize_presence(Presence.query.filter_by(lesson_instance_id=soon).first())["declineSource"] == "availability_block"


# ── -22 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-22")
def test_a_marked_class_is_not_reminded_and_survives_the_block_delete(world, app, io):
    customised_coach(world, app)
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import _reminder_recipients, get_or_create_config, respond_to_reminder

    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Marcada")
    block_id = own_block_res(world).get_json()["id"]
    assert world.call("delete", f"{BLOCKERS}/{block_id}", body={}).status_code == 204

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
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=regular, coach_id=world.coach, alerted=[]))
        Presence.query.filter_by(lesson_instance_id=regular).one().enrolment_source = "roster"  # the engine brings a regular back
        db.session.commit()
    res = own_block_res(world)
    assert [m[1] for m in marked(res)] == [regular]
    assert presence_of(app, world.players["ana"], regular)["source"] == "availability_block"

    # "Afinal vou" on the new engine clears it with the absence.
    with app.app_context():
        assert respond_to_reminder(regular, "yes", world.users["ana"], now=NOW)["action"] == "confirmed"
    back = presence_of(app, world.players["ana"], regular)
    assert back["status"] is None and back["source"] is None

    # A later ordinary "Não vai" writes no reason, whatever the row carried: it is not "indisponível".
    placed = world.one_off("ana", datetime(2026, 12, 3, 19, 0), title="Colocada")  # made after the block: not marked by it
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=placed, coach_id=world.coach, alerted=[]))
        Presence.query.filter_by(lesson_instance_id=placed).one().decline_source = "availability_block"  # a reason left by an earlier decline
        db.session.commit()
    assert world.call("post", "/api/app/notify/cancel_attendance", body={"lessonInstanceId": placed}).status_code == 200
    again = presence_of(app, world.players["ana"], placed)
    assert again["status"] == "absent" and again["source"] is None


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-22")
def test_a_marked_class_gets_no_attendance_request_on_the_new_engine(world, app, io):
    from padel_app.invitation_engine import messages as engine_messages
    from padel_app.models import EngineSession, LessonInstance, Presence
    from padel_app.services.engine_entry import coach_asks_attendance
    from padel_app.services.engine_store import TableStore, settings_for
    from padel_app.utils.dates import wall_to_utc_naive

    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Nova")
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=soon, coach_id=world.coach, alerted=[]))
        db.session.add(Presence(lesson_instance_id=soon, player_id=world.players["bia"]))
        for row in Presence.query.filter_by(lesson_instance_id=soon).all():
            row.enrolment_source = "roster"  # regulars: the engine asks them
        db.session.commit()
    assert marked(own_block_res(world)) == [("LessonInstance", soon, "2026-12-02")]  # only Ana is under the block... and marked

    with app.app_context():
        snapshot, settings = TableStore().snapshot(str(soon)), settings_for(str(soon))
        starts = wall_to_utc_naive(snapshot.start)
        asked = {e.student for hours in range(1, 96) for e in engine_messages.due(snapshot, settings, starts - timedelta(hours=hours))}
        assert str(world.players["bia"]) in asked and str(world.players["ana"]) not in asked  # Bia is asked (control), the marked Ana never
        ids, not_asked = coach_asks_attendance(db.session.get(LessonInstance, soon), {}, NOW)
        assert world.players["ana"] not in ids and not_asked[world.players["ana"]] == "not_coming"  # the coach's ask names them not_coming


# ── -30 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-30")
def test_an_old_build_with_the_question_is_never_asked_and_its_replay_writes_nothing(world, app, io):
    customised_coach(world, app)
    one = world.one_off("ana", datetime(2026, 12, 2, 18, 0), title="Um")
    two = world.one_off("ana", datetime(2026, 12, 8, 18, 0), title="Dois")
    saved = own_block_res(world)  # the old build's POST
    assert saved.get_json()["coveredClasses"] == [] and len(saved.get_json()["markedClasses"]) == 2
    block_id = saved.get_json()["id"]
    edited = world.call("put", f"{BLOCKERS}/{block_id}", body=world.block("2026-12-01", "08:00", "23:00", days=[1, 2, 3, 4], until="2026-12-10"))
    assert edited.get_json()["coveredClasses"] == []

    before = presences(app)
    notices = len(messages(app, sender_id=world.users["ana"]))
    row = {**world.block("2026-12-01", "08:00", "23:00", days=[1, 2], until="2026-12-15"), "title": None}
    read = world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", body={"blockers": [row]})
    assert read.status_code == 200 and read.get_json() == {"coveredClasses": []}
    assert presences(app) == before  # the read wrote nothing
    assert world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", who="coach", body={"blockers": []}).status_code == 403
    assert world.call("post", f"/api/app/availability_schedules/{SCHEDULE_ID}/covered_classes", body={"blockers": []}).status_code == 400  # refuses what the PUT refuses

    replay = world.call("post", MARK, body={"occurrences": [entry("LessonInstance", one, "2026-12-02"), entry("LessonInstance", two, "2026-12-08")]})
    assert replay.get_json()["declined"] == []
    assert {s["reason"] for s in replay.get_json()["skipped"]} == {"already_answered"}
    assert presences(app) == before and len(messages(app, sender_id=world.users["ana"])) == notices  # no second coach notice


# ── -31 ─────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-31")
def test_the_horizon_counts_from_today_and_a_split_keeps_the_originals(world, app, io):
    customised_coach(world, app)
    from padel_app.models import CalendarBlock

    # An endless weekly blocker whose first occurrence was 200 days ago, over a weekly class: an edit marks up to
    # today + 92 days (2027-03-03 is a Wednesday) and none after.
    world.weekly("ana", datetime(2026, 12, 2, 19, 0), days=[3])
    long_ago = datetime(2026, 12, 1, 8) - timedelta(days=200)  # a Tuesday, 2026-05-15 is a Friday: use the weekday of the rule
    with app.app_context():
        old = CalendarBlock(user_id=world.users["ana"], type="unavailable", title="x", start_datetime=long_ago,
                            end_datetime=long_ago.replace(hour=9), is_recurring=True,
                            recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [1]}), blocks_auto_invitations=True)
        db.session.add(old)
        db.session.commit()
        old_id = old.id
    res = world.call("put", f"{BLOCKERS}/{old_id}", body=world.block(long_ago.date().isoformat(), "08:00", "23:00", days=[1, 2, 3], until=None) | {"endDate": "2027-12-31"})
    assert res.status_code == 200
    dates_marked = [c["date"] for c in res.get_json()["markedClasses"]]
    assert dates_marked[0] == "2026-12-02" and dates_marked[-1] == "2027-03-03" and len(dates_marked) == 14

    # A move of one occurrence of an endless blocker that starts today, scope future from day 30: the clone is
    # marked only up to the original row's first occurrence + 92 days, not up to day 30 + 92.
    world.weekly("ana", datetime(2026, 12, 3, 10, 0), days=[4], title="Quintas")  # Thursdays 10:00, no end
    created = world.call("post", BLOCKERS, body={**world.block("2026-12-03", "09:00", "10:00", days=[4]), "endDate": "2027-12-31"})
    block_id = created.get_json()["id"]
    day30 = date(2026, 12, 3) + timedelta(days=28)  # a Thursday, 2 Jan + ...
    moved = world.call("post", f"/api/app/reschedule_block/{block_id}", body={
        "occDate": day30.isoformat(), "newDate": day30.isoformat(), "newStartTime": "09:30", "newEndTime": "11:00", "scope": "future"})
    assert moved.status_code == 204
    from padel_app.models import LessonInstance

    with app.app_context():
        quintas = sorted(i.original_lesson_occurence_date for i in LessonInstance.query.join(
            __import__("padel_app.models.lessons", fromlist=["Lesson"]).Lesson).filter_by(title="Quintas").all()
            if presence_of(app, world.players["ana"], i.id)["source"] == "availability_block")
    horizon_end = date(2026, 12, 3) + timedelta(days=92)
    assert quintas and quintas[-1] <= horizon_end and quintas[-1] > day30 and max(quintas) <= horizon_end


# ── ATTENDANCE-CONFIRM-43 / -44 ─────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("ATTENDANCE-CONFIRM-43")
def test_only_a_block_save_drops_the_student_acknowledgement(world, app, io):
    from padel_app.models import Presence

    customised_coach(world, app)
    soon = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Duas")
    with app.app_context():
        db.session.add(Presence(lesson_instance_id=soon, player_id=world.players["bia"]))
        db.session.commit()
    own_block_res(world)
    plain = world.call("post", "/api/app/notify/cancel_attendance", who="bia", body={"lessonInstanceId": soon})
    assert plain.status_code == 200

    acknowledgements = [m for m in messages(app, sender_id=world.coach_user)]
    assert len(acknowledgements) == 1 and "Vale, então" in acknowledgements[0][1]  # Bia's acknowledgement, from the coach
    ana_thread = [m for m in messages(app, sender_id=world.users["ana"]) if m[2].get("cancellation")]
    bia_thread = [m for m in messages(app, sender_id=world.users["bia"]) if m[2].get("cancellation")]
    assert ana_thread[0][2]["availabilityBlock"] is True and ana_thread[0][2]["lessonInstanceId"] == soon
    assert "proactiveDecline" in ana_thread[0][2] and "lateCancellation" in ana_thread[0][2]
    assert "availabilityBlock" not in bia_thread[0][2]
    assert presence_of(app, world.players["ana"], soon)["source"] == "availability_block"
    assert presence_of(app, world.players["bia"], soon)["source"] is None


@pytest.mark.criterion("ATTENDANCE-CONFIRM-44")
def test_a_second_decline_on_a_declined_row_is_a_no_op(world, app, io):
    from padel_app.models import EngineSession

    customised_coach(world, app)
    old = world.one_off("ana", datetime(2026, 12, 2, 19, 0), title="Antiga")
    new = world.one_off("ana", datetime(2026, 12, 3, 19, 0), title="Nova")
    plain = world.one_off("bia", datetime(2026, 12, 8, 19, 0), title="Simples")
    with app.app_context():
        db.session.add(EngineSession(lesson_instance_id=new, coach_id=world.coach, alerted=[]))
        db.session.commit()
    own_block_res(world)  # marks Ana's two classes (one per engine)
    assert world.call("post", "/api/app/notify/cancel_attendance", who="bia", body={"lessonInstanceId": plain}).status_code == 200  # Bia declines plainly
    ana_old, ana_new, bia = (presence_of(app, world.players["ana"], old), presence_of(app, world.players["ana"], new),
                             presence_of(app, world.players["bia"], plain))
    assert ana_old["source"] == "availability_block" and ana_new["source"] == "availability_block" and bia["status"] == "absent"
    from padel_app.models import Message

    with app.app_context():
        messages_before = Message.query.count()
    pushes_before = io["system_messages.send_push_notification"].call_count
    vacancies_before = {i: vacancies(app, i) for i in (old, new, plain)}

    for who, instance_id, expected in (("ana", old, ana_old), ("ana", new, ana_new), ("bia", plain, bia)):
        for body in ({"lessonInstanceId": instance_id}, {"model": "LessonInstance", "originalId": instance_id, "date": {old: "2026-12-02", new: "2026-12-03", plain: "2026-12-08"}[instance_id]}):
            res = world.call("post", "/api/app/notify/cancel_attendance", who=who, body=body)
            assert res.status_code == 200 and res.get_json() == {"action": "declined", "proactive": False, "duplicate": True}
        assert presence_of(app, world.players[who], instance_id) == expected
    with app.app_context():
        assert Message.query.count() == messages_before
    assert io["system_messages.send_push_notification"].call_count == pushes_before
    assert {i: vacancies(app, i) for i in (old, new, plain)} == vacancies_before

    # A class that has started still answers 409.
    started = world.one_off("ana", datetime(2026, 12, 1, 8, 0), title="Já começou", declined=True)
    assert world.call("post", "/api/app/notify/cancel_attendance", body={"lessonInstanceId": started}).status_code == 409
