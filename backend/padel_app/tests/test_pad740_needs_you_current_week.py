"""PAD-740 (B-682, dashboard.blocks rule 3): the coach's needs-you empty seats cover the
current Sunday-to-Saturday week only.

The queue used to cut a rolling ``[now, now + 7 days)``, so on Thursday 22 Oct the owner saw
next Thursday's class. Every clock here is pinned; 25 Oct 2026 is a Sunday.
"""
from datetime import datetime, timedelta


def _seed(app, starts):
    """A coach with one under-capacity class (1 of 4 seats) per start, one hour long unless
    the start carries its own end."""
    from padel_app.sql_db import db
    from padel_app.models import Association_CoachLesson, LessonInstance, Presence, User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    with app.app_context():
        coach_user = User(name="Bernardo Teles", username="pad740_coach", password="x")
        player_user = User(name="Rui Santos", username="pad740_p", password="x")
        db.session.add_all([coach_user, player_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        player = Player(user_id=player_user.id)
        club = Club(name="PAD-740 Club", description="d", location="l")
        db.session.add_all([coach, player, club])
        db.session.flush()

        for title, (start, end) in starts.items():
            lesson = Lesson(
                title=title,
                start_datetime=start,
                end_datetime=end,
                is_recurring=False,
                type="academy",
                max_players=4,
                status="active",
                club_id=club.id,
            )
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            inst = LessonInstance(
                lesson_id=lesson.id,
                start_datetime=start,
                end_datetime=end,
                max_players=4,
                status="scheduled",
                notifications_enabled=True,
                original_lesson_occurence_date=start.date(),
            )
            db.session.add(inst)
            db.session.flush()
            db.session.add(
                Presence(lesson_instance_id=inst.id, player_id=player.id, invited=True,
                         enrolment_source="roster")
            )
        db.session.commit()
        return coach.id, coach_user.id


def _hour(start):
    return start, start + timedelta(hours=1)


def _empty_seat_titles(app, coach_id, user_id, now, *, both_paths=True):
    """The queue's class titles off the preloaded superset the dashboard cuts (rule 8), and,
    unless told otherwise, the same answer off the block's own load."""
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block, load_coach_home_events

    def titles(block):
        return [i["classTitle"] for i in block["data"]["items"] if i["kind"] == "empty_seats"]

    with app.app_context():
        preloaded = titles(build_needs_you_block(
            coach_id=coach_id, user_id=user_id, now=now,
            events=load_coach_home_events(coach_id=coach_id, now=now),
        ))
        if both_paths:
            assert titles(build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now)) == preloaded
    return preloaded


def test_on_a_thursday_next_thursday_is_absent(app):
    """The owner's report: on Thursday 22 Oct, next Thursday's class was on the queue."""
    from padel_app.helpers.dashboard.coach_home import build_schedule_block

    now = datetime(2026, 10, 22, 10, 0)
    coach_id, user_id = _seed(app, {
        "Sat 24": _hour(datetime(2026, 10, 24, 10, 0)),
        # 08:00, so it is inside the schedule's rolling [now, now + 7 days) as well.
        "Thu 29": _hour(datetime(2026, 10, 29, 8, 0)),
    })

    assert _empty_seat_titles(app, coach_id, user_id, now) == ["Sat 24"]
    # "Próximos 7 dias" keeps its rolling window (out of PAD-740's scope).
    with app.app_context():
        schedule = build_schedule_block(coach_id=coach_id, now=now)
    assert [i["title"] for i in schedule["data"]["items"]] == ["Sat 24", "Thu 29"]


def test_the_week_ends_at_saturday_midnight(app):
    """The Saturday edge: a class still running at 23:30 is in, Sunday 00:30 is next week."""
    now = datetime(2026, 10, 24, 23, 30)
    coach_id, user_id = _seed(app, {
        "Sat 23:00": (datetime(2026, 10, 24, 23, 0), datetime(2026, 10, 24, 23, 59)),
        "Sun 00:30": _hour(datetime(2026, 10, 25, 0, 30)),
    })

    # Preloaded path only: that is what the dashboard serves (helpers/dashboard/coach.py). The
    # block's own load asks the instance loader for starts >= now, so a class already running
    # never reaches it; that predates PAD-740.
    assert _empty_seat_titles(app, coach_id, user_id, now, both_paths=False) == ["Sat 23:00"]


def test_on_sunday_the_queue_moves_to_the_new_week(app):
    """The Sunday edge: at Sunday 00:00 the week is 25-31 Oct, so Sunday 1 Nov is out."""
    now = datetime(2026, 10, 25, 0, 0)
    coach_id, user_id = _seed(app, {
        "Sat 31": _hour(datetime(2026, 10, 31, 10, 0)),
        "Sun 1": _hour(datetime(2026, 11, 1, 10, 0)),
    })

    assert _empty_seat_titles(app, coach_id, user_id, now) == ["Sat 31"]


def test_a_class_that_already_ended_this_week_is_not_offered(app):
    """The window starts at now, not at Sunday: a class earlier this week cannot be filled."""
    now = datetime(2026, 10, 22, 10, 0)
    coach_id, user_id = _seed(app, {
        "Mon 19": _hour(datetime(2026, 10, 19, 10, 0)),
        "Fri 23": _hour(datetime(2026, 10, 23, 10, 0)),
    })

    assert _empty_seat_titles(app, coach_id, user_id, now) == ["Fri 23"]
