"""PAD-837a: the Presences hours columns (attendance.validation rule 17d).

Each hours twin sums the length of the occurrences behind its count column, the length coming
from the one minute computation (`duration_minutes`) that `{duration}` renders in messages. Runs
on SQLite and, with ``LEVAPP_TEST_DB=postgres``, on Postgres: the sum is done in Python so it
cannot depend on the dialect's datetime arithmetic.
"""

from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db


WINDOW = (datetime(2026, 10, 1, 0, 0), datetime(2026, 10, 31, 23, 59, 59))


@pytest.fixture
def hours_world(app):
    """A coach, four students, and helpers to add classes with presences on fixed dates."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        users = {
            name: User(name=name.title(), username=f"h837_{name}", password="x", status="active")
            for name in ("coach", "ana", "bruno", "carla", "duda")
        }
        db.session.add_all(users.values())
        db.session.flush()
        coach = Coach(user_id=users["coach"].id)
        players = {name: Player(user_id=users[name].id) for name in ("ana", "bruno", "carla", "duda")}
        db.session.add(coach)
        db.session.add_all(players.values())
        db.session.flush()
        club = Club(name="H837 Club", description="c", location="x")
        db.session.add(club)
        db.session.flush()
        for player in players.values():
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        db.session.commit()
        return {
            "coach_id": coach.id,
            "club_id": club.id,
            **{f"{name}_id": player.id for name, player in players.items()},
        }


def _add_class(world, start, end, enrolled, presences, *, series_start=None, series_end=None):
    """One lesson with one occurrence at ``start``-``end``.

    ``presences`` maps a player id to ``(status, justification)``. ``series_start``/``series_end``
    give the lesson other times than its occurrence, as a moved occurrence has.
    """
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.presences import Presence

    lesson = Lesson(
        title=f"Class {start.isoformat()}",
        start_datetime=series_start or start,
        end_datetime=series_end or end,
        is_recurring=False,
        type="academy",
        max_players=4,
        status="active",
        club_id=world["club_id"],
    )
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=world["coach_id"], lesson_id=lesson.id))
    for player_id in enrolled:
        db.session.add(Association_PlayerLesson(player_id=player_id, lesson_id=lesson.id))
    instance = LessonInstance(
        lesson_id=lesson.id,
        original_lesson_occurence_date=start.date(),
        start_datetime=start,
        end_datetime=end,
        max_players=4,
        status="scheduled",
    )
    db.session.add(instance)
    db.session.flush()
    for player_id, (status, justification) in presences.items():
        db.session.add(Presence(
            lesson_instance_id=instance.id, player_id=player_id, invited=True,
            confirmed=status == "present", status=status, justification=justification,
            validated=True,
        ))
    db.session.commit()
    return instance


def _stats_by_player(app, world):
    from padel_app.services.presence_overview_service import build_presence_stats

    with app.app_context():
        payload = build_presence_stats(
            coach_id=world["coach_id"], range_start=WINDOW[0], range_end=WINDOW[1]
        )
    return {row["playerId"]: row for row in payload["players"]}


@pytest.mark.criterion("ATTENDANCE-VALIDATION-60")
def test_each_hours_column_sums_the_rows_its_count_column_counts(app, hours_world):
    w = hours_world
    with app.app_context():
        sixty = datetime(2026, 10, 6, 18, 0)
        ninety = datetime(2026, 10, 8, 18, 0)
        # Ana present at both; Bruno absent justified from the 60-minute class.
        _add_class(w, sixty, sixty + timedelta(minutes=60), [w["ana_id"], w["bruno_id"]], {
            w["ana_id"]: ("present", None),
            w["bruno_id"]: ("absent", "justified"),
        })
        # Carla is not enrolled in the 90-minute class: present there as a guest.
        # Duda is enrolled and absent unjustified: no hours column counts her.
        _add_class(w, ninety, ninety + timedelta(minutes=90), [w["ana_id"], w["duda_id"]], {
            w["ana_id"]: ("present", None),
            w["carla_id"]: ("present", None),
            w["duda_id"]: ("absent", "unjustified"),
        })

    rows = _stats_by_player(app, w)
    ana, bruno, carla, duda = (rows[w[f"{n}_id"]] for n in ("ana", "bruno", "carla", "duda"))

    assert (ana["presenceMinutes"], ana["justifiedMinutes"], ana["guestPresenceMinutes"]) == (150, 0, 0)
    assert (bruno["presenceMinutes"], bruno["justifiedMinutes"], bruno["guestPresenceMinutes"]) == (0, 60, 0)
    assert (carla["presenceMinutes"], carla["justifiedMinutes"], carla["guestPresenceMinutes"]) == (90, 0, 90)
    assert (duda["presenceMinutes"], duda["justifiedMinutes"], duda["guestPresenceMinutes"]) == (0, 0, 0)
    assert duda["unjustified"] == 1, "the unjustified absence is counted, just not in hours"

    # Each twin is measured over exactly the rows its count column counts: with every class here
    # either 60 or 90 minutes, a row counted in one and not the other would break these.
    for row in rows.values():
        assert row["presenceMinutes"] == 0 if row["total"] == 0 else row["presenceMinutes"] > 0
        assert row["justifiedMinutes"] == 0 if row["justified"] == 0 else row["justifiedMinutes"] > 0
        assert row["guestPresenceMinutes"] == 0 if row["invitesJoined"] == 0 else row["guestPresenceMinutes"] > 0
    assert (ana["total"], bruno["justified"], carla["invitesJoined"]) == (2, 1, 1)


@pytest.mark.criterion("ATTENDANCE-VALIDATION-61")
def test_a_class_counts_the_minutes_its_duration_placeholder_renders(app, hours_world):
    from padel_app.services.message_text import _format_duration

    w = hours_world
    spans = []
    with app.app_context():
        for day, length in ((5, 60), (12, 90), (19, 75), (26, 0)):
            start = datetime(2026, 10, day, 19, 0)
            end = start + timedelta(minutes=length)  # length 0: the end is not after the start
            spans.append((start, end))
            _add_class(w, start, end, [w["ana_id"]], {w["ana_id"]: ("present", None)})
        # A moved occurrence: 45 minutes on its own times, 120 on its series'.
        moved = datetime(2026, 10, 28, 9, 0)
        spans.append((moved, moved + timedelta(minutes=45)))
        _add_class(
            w, moved, moved + timedelta(minutes=45), [w["ana_id"]], {w["ana_id"]: ("present", None)},
            series_start=moved.replace(hour=17), series_end=moved.replace(hour=19),
        )

    rendered = [_format_duration(start, end) for start, end in spans]
    assert rendered == ["60 min", "90 min", "75 min", "", "45 min"]
    expected = sum(int(text.split()[0]) for text in rendered if text)

    ana = _stats_by_player(app, w)[w["ana_id"]]
    assert ana["total"] == 5, "the zero-length class is still attended; it just adds no time"
    assert ana["presenceMinutes"] == expected == 270


@pytest.mark.criterion("ATTENDANCE-VALIDATION-61")
def test_the_minutes_helper_answers_zero_without_a_span():
    from padel_app.services.message_text import _format_duration
    from padel_app.utils.dates import duration_minutes

    start = datetime(2026, 10, 5, 19, 0)
    for end in (None, start, start - timedelta(minutes=5)):
        assert duration_minutes(start, end) == 0
        assert _format_duration(start, end) == ""
    assert duration_minutes(None, start) == 0
    # Floored to whole minutes, as `{duration}` renders it.
    assert duration_minutes(start, start + timedelta(minutes=89, seconds=59)) == 89
    assert _format_duration(start, start + timedelta(minutes=89, seconds=59)) == "89 min"
