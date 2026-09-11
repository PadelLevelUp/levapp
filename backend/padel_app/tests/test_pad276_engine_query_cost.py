"""
PAD-276 (audit M17) — evaluating a wave costs a bounded number of SQL
statements, independent of roster size (notifications.invitations, the
engine-cost rule).

Measured before the fix on a 300-student roster (scripts/notification_cost_probe.py):
three statements per candidate inside ``evaluate_candidates`` — a lazy load of
``players``, a lazy load of ``users`` and one ``calendar_blocks`` query — plus
one ``presences`` query per survivor in ``_rank_invited``. Nine hundred
statements to answer "who do we ask first" for one vacancy, again on every
batch and every decline.

The verdicts and the ranking must not change: the blocked student still comes
out ``unavailable`` and the order is still the per-player attendance order.
"""
from datetime import datetime, timedelta

from sqlalchemy import event

from padel_app.sql_db import db


def _seed(roster_size: int, *, blocked_every: int = 5):
    """A coach, three levels, ``roster_size`` students (every ``blocked_every``-th
    with a recurring availability blocker over the class window, everyone with
    a distinct attendance history), a four-spot class tomorrow with one open
    structural vacancy. Returns the ids the engine needs."""
    import json

    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User
    from padel_app.models.vacancy import Vacancy

    tag = f"p276_{roster_size}"

    def user(username):
        u = User(name=username, username=username, email=f"{username}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user(f"{tag}coach").id)
    db.session.add(coach)
    db.session.flush()
    levels = [CoachLevel(coach_id=coach.id, label=c, code=c, display_order=i)
              for i, c in enumerate("ABC")]
    club = Club(name=tag, description="", location="Lisboa")
    db.session.add_all(levels + [club])
    db.session.flush()

    start = (datetime.utcnow() + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    lesson = Lesson(title=tag, start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, color="#000",
                    status="active", club_id=club.id, default_level_id=levels[0].id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=4,
                              status="scheduled", level_id=levels[0].id, notifications_enabled=True)
    past = [LessonInstance(lesson_id=lesson.id, start_datetime=start - timedelta(days=7 * (h + 1)),
                           end_datetime=start - timedelta(days=7 * (h + 1)) + timedelta(hours=1),
                           max_players=4, status="completed", level_id=levels[0].id)
            for h in range(3)]
    db.session.add_all([instance] + past)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))

    player_ids, blocked_ids = [], []
    for s in range(roster_size):
        u = user(f"{tag}s{s}")
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        player_ids.append(p.id)
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id,
                                               level_id=levels[s % 3].id, side="left"))
        # Attendance history: student s attended s % 4 of the last 3 classes.
        for h in range(3):
            db.session.add(Presence(lesson_instance_id=past[h].id, player_id=p.id,
                                    status="present" if h < s % 4 else "absent",
                                    justification=None if h < s % 4 else "unjustified",
                                    invited=True, validated=True))
        if s % blocked_every == 0:
            blocked_ids.append(p.id)
            db.session.add(CalendarBlock(
                user_id=u.id, type="unavailable", title="busy",
                start_datetime=start - timedelta(hours=1), end_datetime=start + timedelta(hours=2),
                is_recurring=True,
                recurrence_rule=json.dumps({"frequency": "weekly",
                                            "daysOfWeek": [(start.weekday() + 1) % 7]}),
                recurrence_end=(start + timedelta(weeks=8)).date(),
                blocks_auto_invitations=True,
            ))
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
    vacancy = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                      level_id=levels[0].id, side="left",
                      current_round_number=1, current_batch_number=0)
    db.session.add(vacancy)
    db.session.commit()
    return {"coach_id": coach.id, "instance_id": instance.id, "vacancy_id": vacancy.id,
            "player_ids": player_ids, "blocked_ids": blocked_ids}


class _Count:
    def __init__(self):
        self.n = 0

    def __call__(self, conn, cursor, statement, parameters, context, executemany):
        self.n += 1


def _evaluate_and_rank(app, ids):
    """Statements issued by one wave-3 evaluation plus the ranking, and the
    verdicts/ranking themselves."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    vacancy = Vacancy.query.get(ids["vacancy_id"])
    instance = LessonInstance.query.get(ids["instance_id"])
    config = ns.get_or_create_config(ids["coach_id"])
    db.session.expire_all()

    counter = _Count()
    engine = db.get_engine(app)
    event.listen(engine, "before_cursor_execute", counter)
    try:
        verdicts = ns.evaluate_candidates(vacancy, instance, ids["coach_id"], config, wave=("group", 3))
        ranked = ns._rank_invited(verdicts, config, vacancy)
    finally:
        event.remove(engine, "before_cursor_execute", counter)
    return counter.n, verdicts, ranked


def test_a_wave_costs_the_same_for_a_big_roster_as_for_a_small_one(app):
    with app.app_context():
        small = _seed(6)
        n_small, _, _ = _evaluate_and_rank(app, small)
        db.session.remove()
        big = _seed(60)
        n_big, _, _ = _evaluate_and_rank(app, big)

    # Before the fix: 3 per candidate + 1 per survivor, so 60 students cost
    # ~200 more statements than 6. After: the same handful of statements.
    assert n_big <= n_small + 2, (n_small, n_big)
    assert n_big < 60, n_big


def test_the_batched_stages_keep_the_verdicts_and_the_ranking(app):
    from padel_app.services import notification_service as ns

    with app.app_context():
        ids = _seed(24, blocked_every=4)
        _, verdicts, ranked = _evaluate_and_rank(app, ids)

        by_player = {v.cp.player_id: v.stage for v in verdicts}
        for pid in ids["blocked_ids"]:
            assert by_player[pid] == "unavailable", (pid, by_player[pid])
        invited = [pid for pid, stage in by_player.items() if stage == "invited"]
        assert set(invited) == set(ids["player_ids"]) - set(ids["blocked_ids"])

        # The ranking sorts on attendance stats. The batched lookup must give
        # every survivor exactly the numbers the one-player function gives
        # (including 0.0/0.0 for a student with no history), so the sort key,
        # and with it the order, is the one the engine has always used.
        survivor_ids = [cp.player_id for cp in ranked]
        batched = ns._attendance_stats_for(survivor_ids + [10 ** 6])
        assert batched == {
            **{pid: ns._attendance_stats(pid) for pid in survivor_ids},
            10 ** 6: (0.0, 0.0),
        }
        assert any(batched[pid] != (0.0, 0.0) for pid in survivor_ids)
