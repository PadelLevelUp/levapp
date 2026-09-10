"""Student home blocks (PAD-202): hero, needs-you queue, next 7 days, KPIs.

The student payload speaks the same block vocabulary as the coach home
(`dashboard.blocks` rule 3) so both shells render it with the same components.
What these lock down beyond the coach tests:

* the queue's `invite` kind reads `Presence` directly — the old class_list
  filtered calendar events on flags the serializer never emits, so it was
  always empty (spec rule 3, PAD-202 note);
* every KPI carries the context that gives the number meaning (`total`);
* the payload id, not block sniffing, tells the client which home it is.
"""
from datetime import datetime, timedelta


def _seed(app, *, now):
    """A student with three classes and a recorded attendance history.

    Class A starts in 45 minutes and the student is signed up (the hero).
    Class B is tomorrow at 18:00 and the student is INVITED but has not
    confirmed (the one invite in the queue). Class C is the day after and the
    student has confirmed (not in the queue). Three past classes carry the
    attendance history: two present, one absent — so the KPIs read 2 and 1
    against a total of 3.
    """
    from padel_app.sql_db import db
    from padel_app.models import (
        Association_CoachLesson,
        Association_CoachPlayer,
        Association_PlayerLesson,
        Association_PlayerLessonInstance,
        LessonInstance,
        Presence,
        User,
    )
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.Association_CoachClub import Association_CoachClub

    with app.app_context():
        coach_user = User(name="Bernardo Teles", username="ph_coach", password="x")
        db.session.add(coach_user)
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        db.session.add(coach)
        db.session.flush()

        club = Club(name="PH Club", description="d", location="l")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))

        student_user = User(name="Ana Lima", username="ph_student", password="x")
        db.session.add(student_user)
        db.session.flush()
        student = Player(user_id=student_user.id)
        db.session.add(student)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=student.id))

        mate_user = User(name="Rui Santos", username="ph_mate", password="x")
        db.session.add(mate_user)
        db.session.flush()
        mate = Player(user_id=mate_user.id)
        db.session.add(mate)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=mate.id))

        def make_class(title, start, capacity, *, signed_up=(), invited=None, confirmed=None):
            lesson = Lesson(
                title=title,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                is_recurring=False,
                type="academy",
                max_players=capacity,
                status="active",
                club_id=club.id,
            )
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            inst = LessonInstance(
                lesson_id=lesson.id,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                max_players=capacity,
                status="scheduled",
                notifications_enabled=True,
                original_lesson_occurence_date=start.date(),
            )
            db.session.add(inst)
            db.session.flush()
            for p in signed_up:
                db.session.add(Association_PlayerLesson(player_id=p.id, lesson_id=lesson.id))
                db.session.add(
                    Association_PlayerLessonInstance(player_id=p.id, lesson_instance_id=inst.id)
                )
            if invited is not None:
                db.session.add(
                    Presence(
                        lesson_instance_id=inst.id,
                        player_id=student.id,
                        invited=invited,
                        confirmed=confirmed,
                    )
                )
            return inst

        soon = make_class("A1 Class", now + timedelta(minutes=45), 6, signed_up=[student, mate])
        make_class(
            "Invite Class",
            (now + timedelta(days=1)).replace(hour=18, minute=0),
            4,
            invited=True,
            confirmed=False,
        )
        make_class(
            "Confirmed Class",
            (now + timedelta(days=2)).replace(hour=18, minute=0),
            4,
            invited=True,
            confirmed=True,
        )
        # PAD-202 correction: a student's window is 30 days, not the coach's 7.
        make_class(
            "Far Class",
            (now + timedelta(days=12)).replace(hour=18, minute=0),
            4,
            invited=True,
            confirmed=True,
        )

        # Attendance history: two present, one absent — all validated, all past.
        for offset, status in ((10, "present"), (17, "present"), (24, "absent")):
            past = make_class(f"Past {offset}", now - timedelta(days=offset), 4)
            db.session.add(
                Presence(
                    lesson_instance_id=past.id,
                    player_id=student.id,
                    status=status,
                    validated=True,
                    invited=True,
                    confirmed=True,
                )
            )
        db.session.commit()

        return student.id, student_user.id, soon.id


def test_hero_is_the_soonest_class_with_classmates(app):
    from padel_app.helpers.dashboard.player_home import build_player_next_class_block

    now = datetime(2026, 8, 4, 10, 0)
    student_id, _, _ = _seed(app, now=now)

    with app.app_context():
        block = build_player_next_class_block(player_id=student_id, now=now)

    assert block is not None and block["type"] == "next_class"
    data = block["data"]
    assert data["title"] == "A1 Class"
    assert data["isToday"] is True
    assert data["minutesUntil"] == 45
    assert (data["filled"], data["capacity"]) == (2, 6)
    assert sorted(p["initials"] for p in data["players"]) == ["AL", "RS"]
    assert data["href"].startswith("/calendar?classId=")


def test_hero_is_omitted_when_nothing_is_scheduled(app):
    from padel_app.helpers.dashboard.player_home import (
        build_player_needs_you_block,
        build_player_next_class_block,
        build_player_schedule_block,
    )
    from padel_app.sql_db import db
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        u = User(name="Solo Student", username="ph_solo", password="x")
        db.session.add(u)
        db.session.flush()
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.commit()
        player_id, user_id = p.id, u.id

    now = datetime(2026, 8, 4, 10, 0)
    with app.app_context():
        assert build_player_next_class_block(player_id=player_id, now=now) is None
        schedule = build_player_schedule_block(player_id=player_id, now=now)
        queue = build_player_needs_you_block(player_id=player_id, user_id=user_id, now=now)

    assert schedule["data"]["totalCount"] == 0 and schedule["data"]["items"] == []
    assert queue["data"] == {"count": 0, "items": []}


def test_invite_reaches_the_queue_and_confirmed_class_does_not(app):
    """The old list could never populate; the queue reads Presence directly."""
    from padel_app.helpers.dashboard.player_home import build_player_needs_you_block

    now = datetime(2026, 8, 4, 10, 0)
    student_id, user_id, _ = _seed(app, now=now)

    with app.app_context():
        block = build_player_needs_you_block(player_id=student_id, user_id=user_id, now=now)

    assert block["type"] == "needs_you"
    assert block["data"]["count"] == 1
    (item,) = block["data"]["items"]
    assert item["kind"] == "invite"
    assert item["classTitle"] == "Invite Class"
    assert item["date"] == "2026-08-05"
    assert item["timeLabel"] == "18:00"
    assert (item["filled"], item["capacity"]) == (0, 4)
    assert item["href"].startswith("/calendar?classId=") and "date=2026-08-05" in item["href"]


def test_schedule_lists_the_week_including_the_invite(app):
    """An invited-but-unconfirmed class is still on the student's calendar."""
    from padel_app.helpers.dashboard.player_home import build_player_schedule_block

    now = datetime(2026, 8, 4, 10, 0)
    student_id, _, _ = _seed(app, now=now)

    with app.app_context():
        block = build_player_schedule_block(player_id=student_id, now=now)

    data = block["data"]
    # 30-day window (PAD-202 correction): the class 12 days out is listed too.
    assert data["totalCount"] == 4
    assert [i["title"] for i in data["items"]] == [
        "A1 Class",
        "Invite Class",
        "Confirmed Class",
        "Far Class",
    ]
    assert data["items"][0]["dayOfMonth"] == 4
    assert data["calendarHref"] == "/calendar"


def test_rows_and_hero_say_whether_the_student_still_has_to_answer(app):
    """`pendingConfirmation` is the switch for the dashboard's Yes/No (rule 3a)."""
    from padel_app.helpers.dashboard.player_home import (
        build_player_next_class_block,
        build_player_schedule_block,
    )

    now = datetime(2026, 8, 4, 10, 0)
    student_id, _, soon_id = _seed(app, now=now)

    with app.app_context():
        hero = build_player_next_class_block(player_id=student_id, now=now)
        rows = build_player_schedule_block(player_id=student_id, now=now)["data"]["items"]

    by_title = {r["title"]: r for r in rows}
    # Asked and unanswered → pending, with the instance id the answer needs.
    assert by_title["Invite Class"]["pendingConfirmation"] is True
    assert isinstance(by_title["Invite Class"]["lessonInstanceId"], int)
    # Answered → not pending. Signed up without ever being asked → not pending.
    assert by_title["Confirmed Class"]["pendingConfirmation"] is False
    assert by_title["A1 Class"]["pendingConfirmation"] is False
    assert by_title["A1 Class"]["lessonInstanceId"] == soon_id

    assert hero["data"]["pendingConfirmation"] is False
    assert hero["data"]["lessonInstanceId"] == soon_id


def test_kpis_carry_their_denominator_and_keep_their_links(app):
    from padel_app.helpers.dashboard.player_home import build_player_kpi_block

    now = datetime(2026, 8, 4, 10, 0)
    student_id, _, _ = _seed(app, now=now)

    with app.app_context():
        block = build_player_kpi_block(player_id=student_id, now=now)

    by_label = {i["label"]: i for i in block["data"]["items"]}
    assert list(by_label) == ["Attended", "Missed", "Upcoming lessons", "Invites"]

    assert (by_label["Attended"]["value"], by_label["Attended"]["total"]) == (2, 3)
    assert (by_label["Missed"]["value"], by_label["Missed"]["total"]) == (1, 3)
    # PAD-235 (B-032): the schedule's number, not the confirmed-presence count.
    # A1 (signed up), Invite (unanswered), Confirmed, Far (12 days) — all four.
    assert by_label["Upcoming lessons"]["value"] == 4
    # dashboard.navigation rules 6, 11, 11a — unchanged by the restyle.
    assert by_label["Attended"]["href"] == "/attendance"
    assert by_label["Missed"]["href"] == "/absences"
    assert by_label["Upcoming lessons"]["href"] == "/calendar"
    assert "href" not in by_label["Invites"]


def test_upcoming_lessons_is_the_schedules_count(app):
    """dashboard.blocks rule 3 (PAD-235): the tile and schedule_7d.totalCount are one number."""
    from padel_app.helpers.dashboard.player_home import (
        build_player_kpi_block,
        build_player_schedule_block,
    )

    now = datetime(2026, 8, 4, 10, 0)
    student_id, _, _ = _seed(app, now=now)

    with app.app_context():
        kpis = build_player_kpi_block(player_id=student_id, now=now)
        schedule = build_player_schedule_block(player_id=student_id, now=now)

    upcoming = next(i for i in kpis["data"]["items"] if i["label"] == "Upcoming lessons")
    assert schedule["data"]["totalCount"] == 4
    assert upcoming["value"] == schedule["data"]["totalCount"]


def test_player_payload_uses_the_home_vocabulary_and_its_own_id(app):
    """Spec criterion "Player dashboard": id + block order, no class_list/grid."""
    from padel_app.helpers.dashboard_services import build_dashboard_payload
    from padel_app.models import User
    from padel_app.models.players import Player

    now = datetime(2026, 8, 4, 10, 0)
    student_id, user_id, _ = _seed(app, now=now)

    with app.app_context():
        user = User.query.get(user_id)
        player = Player.query.get(student_id)
        payload = build_dashboard_payload(user=user, coach=None, player=player, now=now)

    assert payload["id"] == "player_default_v1"
    assert [b["type"] for b in payload["blocks"]] == [
        "messages_overview",
        "next_class",
        "needs_you",
        "schedule_7d",
        "kpi_grid",
    ]
