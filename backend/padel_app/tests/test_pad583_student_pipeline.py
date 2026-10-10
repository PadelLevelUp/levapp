"""PAD-583 — dashboard.blocks rule 8 (the student home): the student's classes load once,
the player instance loader eager-loads what the serializer reads so a window costs a fixed
number of statements, and the blocks equal the ones built from separate loads.

The PAD-262 file (test_pad262_dashboard_pipeline.py) is the template, with the student
substituted for the coach.
"""
import json
from contextlib import contextmanager
from datetime import datetime, timedelta

from sqlalchemy import event

from padel_app.sql_db import db

NOW = datetime(2026, 8, 4, 10, 0)
HOME_TYPES = ["next_class", "needs_you", "schedule_7d", "kpi_grid"]


@contextmanager
def _statements(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


def _student(app, *, tag, near, far, now=NOW):
    """A student enrolled in `near` classes over the next 30 days (days 1..near, 18:00)
    and `far` beyond 30 days but inside the hero's 90. Every near class is an OPEN ASK:
    an unconfirmed presence with a reminder attempt on file, so `student_may_confirm`
    reaches its attempt lookup once per class (the dimension that must not scale the
    statement count). The far classes are confirmed enrolments.

    Also, so every batched lookup runs: a recurring series with NO instance rows (one
    projected occurrence on day 25, the virtual-occurrence batch), and `near` vacancy
    invites (a sent NotificationEvent + its message) and `near` waiting-list offers on
    classes the student is not enrolled in, at 19:00 / 20:00 of days 1..near, so the queue's
    first five items are invite, vacancy, offer, invite, vacancy. Message times are pinned
    to `now`. Returns (player_id, user_id, titles): the near classes then the series."""
    from padel_app.models import (
        Association_CoachLesson,
        Association_CoachPlayer,
        Association_PlayerLesson,
        Club,
        Conversation,
        ConversationParticipant,
        LessonInstance,
        Message,
        NotificationEvent,
        Presence,
        ReminderAttempt,
        User,
    )
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player

    with app.app_context():
        coach = Coach.query.first()
        if coach is None:
            cu = User(name="P583 Coach", username="p583_coach", password="x")
            db.session.add(cu)
            db.session.flush()
            coach = Coach(user_id=cu.id)
            db.session.add(coach)
            db.session.flush()
        club = Club.query.first()
        if club is None:
            club = Club(name="P583 Club", description="d", location="l")
            db.session.add(club)
            db.session.flush()
            db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))

        user = User(name=f"Student {tag}", username=f"p583_{tag}", password="x")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))

        titles = []
        days = [d for d in range(1, near + 1)] + [40 + 10 * i for i in range(far)]
        for day in days:
            title = f"{tag} class {day}"
            if day <= near:
                titles.append(title)
            start = (now + timedelta(days=day)).replace(hour=18, minute=0)
            lesson = Lesson(title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson.id))
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  max_players=4, status="scheduled", notifications_enabled=True,
                                  original_lesson_occurence_date=start.date())
            db.session.add(inst)
            db.session.flush()
            presence = Presence(lesson_instance_id=inst.id, player_id=player.id, invited=True,
                                confirmed=(day > near), enrolment_source="roster")
            db.session.add(presence)
            db.session.flush()
            if day <= near:
                db.session.add(ReminderAttempt(lesson_instance_id=inst.id, player_id=player.id,
                                               presence_id=presence.id, number=1, sent_at=now))

        # A recurring series with no instance rows: one projected occurrence, on day 25.
        series_start = (now + timedelta(days=25)).replace(hour=18, minute=0)
        series = Lesson(title=f"{tag} series", start_datetime=series_start,
                        end_datetime=series_start + timedelta(hours=1), is_recurring=True,
                        recurrence_rule=json.dumps({"frequency": "weekly",
                                                    "daysOfWeek": [(series_start.weekday() + 1) % 7]}),
                        recurrence_end=(series_start + timedelta(days=1)).date(),
                        type="academy", max_players=4, status="active", club_id=club.id)
        db.session.add(series)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=series.id))
        db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=series.id))
        titles.append(series.title)

        # The queue's other two sources: vacancy invites and waiting-list offers.
        conv = Conversation(is_group=False,
                            participant_key=Conversation.build_participant_key([coach.user_id, user.id]))
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=coach.user_id))
        # Read past the messages' time: they are asks, not unread replies.
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=user.id,
                                               last_read_at=now + timedelta(minutes=1)))

        def other_instance(title, start):
            lesson = Lesson(title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  max_players=4, status="scheduled", notifications_enabled=True,
                                  original_lesson_occurence_date=start.date())
            db.session.add(inst)
            db.session.flush()
            return inst

        for day in range(1, near + 1):
            day_start = (now + timedelta(days=day)).replace(minute=0)
            vacancy = other_instance(f"{tag} vacancy {day}", day_start.replace(hour=19))
            invite = Message(conversation_id=conv.id, sender_id=coach.user_id, text="A spot opened",
                             message_type="notification_invite", sent_at=now - timedelta(hours=1),
                             msg_metadata={"lessonInstanceId": vacancy.id, "responded": False})
            db.session.add(invite)
            db.session.flush()
            db.session.add(NotificationEvent(coach_id=coach.id, lesson_instance_id=vacancy.id,
                                             player_id=player.id, type="auto", round_number=1,
                                             status="sent", message_id=invite.id))
            offered = other_instance(f"{tag} offer {day}", day_start.replace(hour=20))
            db.session.add(Message(conversation_id=conv.id, sender_id=coach.user_id,
                                   text="Join the waiting list?", message_type="waiting_list_offer",
                                   sent_at=now - timedelta(hours=1),
                                   msg_metadata={"lessonInstanceId": offered.id, "responded": False}))
        db.session.commit()
        return player.id, user.id, titles


def _blocks(app, player_id, user_id, now=NOW):
    from padel_app.helpers.dashboard.player import build_player_dashboard_blocks
    from padel_app.models.players import Player

    with app.app_context():
        return build_player_dashboard_blocks(player=db.session.get(Player, player_id), user_id=user_id, now=now)


def test_a_student_window_costs_a_fixed_number_of_statements(app):
    """Eager loading: N classes in a window must not mean N extra statements."""
    small_id, small_user, small_titles = _student(app, tag="small", near=3, far=2)
    big_id, big_user, big_titles = _student(app, tag="big", near=13, far=2)

    with _statements(app) as small:
        small_blocks = _blocks(app, small_id, small_user)
    with _statements(app) as big:
        big_blocks = _blocks(app, big_id, big_user)

    # R-032: the builds found their subject — each student's own classes are in the blocks.
    for blocks, titles in ((small_blocks, small_titles), (big_blocks, big_titles)):
        schedule = next(b for b in blocks if b["type"] == "schedule_7d")["data"]
        assert schedule["totalCount"] == len(titles)
        assert [i["title"] for i in schedule["items"]] == titles[: len(schedule["items"])]
        # Every near class is an open ask, so the attempt lookup ran once per class.
        assert all(i["pendingConfirmation"] for i in schedule["items"][: len(titles) - 1])
        invites = next(i for i in next(b for b in blocks if b["type"] == "kpi_grid")["data"]["items"]
                       if i["label"] == "Invites")
        assert invites["value"] == len(titles) - 1  # the series is a projection, not an ask
        queue = next(b for b in blocks if b["type"] == "needs_you")["data"]["items"]
        assert {"invite", "vacancy_invite", "waiting_list_offer"} <= {i["kind"] for i in queue}
    assert len(big_titles) == 14
    assert len(big) == len(small), f"{len(small)} statements for 3 classes, {len(big)} for 13"


def test_the_student_home_runs_the_pipeline_once(app, monkeypatch):
    from padel_app.helpers.dashboard import player_home

    player_id, user_id, titles = _student(app, tag="once", near=13, far=3)

    calls = []
    real = player_home.load_events

    def counting(**kwargs):
        calls.append(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(player_home, "load_events", counting)
    blocks = _blocks(app, player_id, user_id)

    assert len(calls) == 1
    assert calls[0]["end"] - calls[0]["start"] == timedelta(days=90)
    assert calls[0]["player_id"] == player_id

    # The profile card and the evaluations block read other tables, not the pipeline.
    home = [b for b in blocks if b["type"] not in ("profile_incomplete", "evaluations")]
    assert [b["type"] for b in home] == HOME_TYPES

    # R-032: the seeded classes are what the blocks show.
    hero, _, schedule, kpis = home
    assert hero["data"]["title"] == titles[0]
    assert schedule["data"]["totalCount"] == 14  # 13 classes + the series; the 3 beyond 30 days are cut out
    assert [i["title"] for i in schedule["data"]["items"]] == titles[:5]
    upcoming = next(i for i in kpis["data"]["items"] if i["label"] == "Upcoming lessons")
    assert upcoming["value"] == 14
    # The queue lists the first QUEUE_INVITE_LIMIT of the merged asks.
    assert home[1]["data"]["count"] == 5
    assert [i["kind"] for i in home[1]["data"]["items"]] == [
        "invite", "vacancy_invite", "waiting_list_offer", "invite", "vacancy_invite",
    ]

    # The blocks are the same as when each loads its own window.
    with app.app_context():
        separately = [
            player_home.build_player_next_class_block(player_id=player_id, now=NOW),
            player_home.build_player_needs_you_block(player_id=player_id, user_id=user_id, now=NOW),
            player_home.build_player_schedule_block(player_id=player_id, now=NOW),
            player_home.build_player_kpi_block(player_id=player_id, now=NOW),
        ]
    assert home == separately


def test_batched_reminder_configs_match_the_per_instance_path(app):
    """R-029 sibling: `reminder_configs` (batched) answers `student_may_confirm` exactly as the
    per-instance `coaches_for` + NotificationConfig path does, for every coach shape: a lesson
    with two coaches (the later junction row must NOT win), an instance with its own coach
    junction, and a coach with no config row (the default timing)."""
    from padel_app.helpers.dashboard.confirmation import reminder_configs
    from padel_app.models import (
        Association_CoachLesson,
        Association_CoachLessonInstance,
        Club,
        LessonInstance,
        NotificationConfig,
        Presence,
        User,
    )
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services.notification_service import student_may_confirm
    from padel_app.utils.dates import wall_to_utc_naive

    start = datetime(2026, 8, 10, 18, 0)
    with app.app_context():
        coaches = []
        for n in range(3):
            u = User(name=f"Cfg Coach {n}", username=f"p583_cfg_c{n}", password="x")
            db.session.add(u)
            db.session.flush()
            c = Coach(user_id=u.id)
            db.session.add(c)
            db.session.flush()
            coaches.append(c)
        first, second, bare = coaches
        # Non-default reminder values on the configs that exist; `bare` has no row at all.
        db.session.add(NotificationConfig(coach_id=first.id, reminder_type="hours_before", reminder_value=60))
        db.session.add(NotificationConfig(coach_id=second.id, reminder_type="hours_before", reminder_value=24))
        club = Club.query.first() or Club(name="P583 Cfg Club", description="d", location="l")
        db.session.add(club)
        db.session.flush()

        su = User(name="Cfg Student", username="p583_cfg_s", password="x")
        db.session.add(su)
        db.session.flush()
        player = Player(user_id=su.id)
        db.session.add(player)
        db.session.flush()

        def make(title, junction_coaches, own_coach=None):
            lesson = Lesson(title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            for c in junction_coaches:  # created in order: the junction ids ascend
                db.session.add(Association_CoachLesson(coach_id=c.id, lesson_id=lesson.id))
                db.session.flush()
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  max_players=4, status="scheduled", notifications_enabled=True,
                                  original_lesson_occurence_date=start.date())
            db.session.add(inst)
            db.session.flush()
            if own_coach is not None:
                db.session.add(Association_CoachLessonInstance(coach_id=own_coach.id, lesson_instance_id=inst.id))
            db.session.add(Presence(lesson_instance_id=inst.id, player_id=player.id, invited=True,
                                    confirmed=False, enrolment_source="roster"))
            db.session.flush()
            return inst.id

        ids = [
            make("two coaches", [first, second]),              # the first junction row wins: 60 h
            make("own junction", [first], own_coach=second),   # the instance's own coach: 24 h
            make("no config", [bare]),                         # default timing: 48 h
            make("own, no config", [first], own_coach=bare),   # own coach without a row: default
            make("no coach at all", []),                       # default timing
        ]
        db.session.commit()

    answers = set()
    with app.app_context():
        instances = [db.session.get(LessonInstance, i) for i in ids]
        configs = reminder_configs(instances)
        assert set(configs) == set(ids)
        for hours_before in (80, 55, 40, 30, 10):
            now_utc = wall_to_utc_naive(start - timedelta(hours=hours_before))
            for inst in instances:
                row = Presence.query.filter_by(lesson_instance_id=inst.id).one()
                batched = student_may_confirm(row, inst, configs[inst.id], now=now_utc)
                alone = student_may_confirm(row, inst, None, now=now_utc)
                assert batched == alone, (inst.id, hours_before)
                answers.add(batched)
    # R-029: the timings differ across the instances, so the comparison saw both answers.
    assert answers == {True, False}
