"""
PAD-539 (B-342) — attendance.validation rules 18 and 23, dashboard.blocks rule 3: the number of
classes to validate is the coach's WHOLE backlog, one derivation on every surface.

- The SQL predicate (`count_pending_validation_total`) and the listing's Python split agree:
  over all history the total equals `len(pending)` of `list_pending_validation`, with a fully
  validated class and a class without presence rows left out.
- The count endpoint's `pendingTotal`, the badge's `count` and the needs-you validation item's
  `count` are one number, through the three code paths.
- The ticket's shape: pending classes only in older weeks, the current week clean, still counted;
  the badge lands on the most recent week with work.

Run:
    pytest padel_app/tests/test_pad539_backlog_count.py -v
"""
from datetime import datetime, timedelta

from padel_app.tests.test_dashboard_coach_home import (
    _add_past_class_with_unvalidated_presence,
    _seed,
)

TUESDAY = datetime(2026, 8, 4, 10, 0)
EPOCH = datetime(2000, 1, 1)


def _add_past_class(app, *, coach_id, ended_at, title, validated=None, presences=True):
    """A past class; ``validated`` stamps every row; ``presences=False`` leaves it empty."""
    from padel_app.sql_db import db
    from padel_app.models import LessonInstance, Presence
    from padel_app.models.lessons import Lesson

    _add_past_class_with_unvalidated_presence(app, coach_id=coach_id, ended_at=ended_at, title=title)
    with app.app_context():
        inst = (
            db.session.query(LessonInstance)
            .join(Lesson, LessonInstance.lesson_id == Lesson.id)
            .filter(Lesson.title == title)
            .one()
        )
        rows = db.session.query(Presence).filter(Presence.lesson_instance_id == inst.id).all()
        if not presences:
            for row in rows:
                db.session.delete(row)
        elif validated is not None:
            for row in rows:
                row.validated = validated
        db.session.commit()
        return inst.id


def _fixture(app):
    """Pending classes in three different weeks, one fully validated, one with no rows."""
    coach_id, user_id, _ = _seed(app, now=TUESDAY)  # the seed: one pending class last week
    _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(days=1), title="This week")
    _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(weeks=3), title="Three weeks back")
    _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(weeks=6), title="Six weeks back")
    _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(weeks=2), title="Validated", validated=True)
    _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(weeks=2, days=1), title="Empty", presences=False)
    return coach_id, user_id


def test_total_is_the_listings_pending_count_over_all_history(app):
    from padel_app.services.presence_overview_service import (
        count_pending_validation_total,
        list_pending_validation,
    )

    coach_id, _ = _fixture(app)
    with app.app_context():
        total = count_pending_validation_total(coach_id=coach_id, now=TUESDAY)
        listing = list_pending_validation(coach_id=coach_id, range_start=EPOCH, range_end=TUESDAY, now=TUESDAY)
    titles = {c["title"] for c in listing["pending"]}
    assert total == len(listing["pending"])
    assert {"This week", "Three weeks back", "Six weeks back"} <= titles
    assert "Validated" not in titles and "Empty" not in titles
    assert total == 4  # the three added plus the seed's class last week


def test_one_number_on_the_count_endpoint_the_badge_and_the_dashboard_item(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block, validation_badge
    from padel_app.models.coaches import Coach
    from padel_app.sql_db import db

    from padel_app.helpers.dashboard.coach_home import club_now_naive

    coach_id, user_id = _fixture(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        coach = db.session.get(Coach, coach_id)
        token = create_access_token(identity=str(coach.user_id))
        # The route reads the real club clock; the badge and the item must too, or the
        # comparison would measure the clocks, not the derivation.
        now = club_now_naive()
        badge = validation_badge(coach_id=coach_id, now=now)
        block = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now)
    item = next(i for i in block["data"]["items"] if i["kind"] == "validation")

    # The tab's week: the fixture's current one. The route counts against the real clock, so
    # by now the seed's two "upcoming" classes (Tue 4, Wed 5 Aug) have run too: "This week"
    # plus those two.
    res = client.get(
        "/api/app/class_instances/pending_validation/count?from=2026-08-03&to=2026-08-09",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["pendingCount"] == 3
    # One number, three paths (rule 23). The route counts against the real clock, so it
    # includes the same rows as long as the fixture lies in the past — it does.
    assert body["pendingTotal"] == badge["count"] == item["count"]
    assert body["pendingTotal"] >= 4


def test_an_older_backlog_is_counted_when_this_week_is_clean(app):
    """The ticket: three classes last week, none this week, read "0 aulas por validar"."""
    from padel_app.services.presence_overview_service import (
        count_pending_validation,
        count_pending_validation_total,
    )
    from padel_app.helpers.dashboard.coach_home import validation_badge, week_bounds

    coach_id, _, _ = _seed(app, now=TUESDAY)
    for day in (28, 29, 30):  # the week before last
        _add_past_class_with_unvalidated_presence(
            app, coach_id=coach_id, ended_at=datetime(2026, 7, day, 19, 0), title=f"Old {day}"
        )
    this_week = week_bounds(TUESDAY, 0)
    with app.app_context():
        week_count = count_pending_validation(coach_id=coach_id, range_start=this_week[0], range_end=this_week[1], now=TUESDAY)
        total = count_pending_validation_total(coach_id=coach_id, now=TUESDAY)
        badge = validation_badge(coach_id=coach_id, now=TUESDAY)
    assert week_count == 0
    assert total == 4  # three the week before last plus the seed's one last week
    assert badge == {"count": 4, "weekOffset": -1, "href": "/presences?validate=1&week=-1"}


def test_badge_lands_on_the_most_recent_pending_week(app):
    from padel_app.helpers.dashboard.coach_home import validation_badge

    coach_id, _, _ = _seed(app, now=TUESDAY)
    three_weeks_back = TUESDAY - timedelta(weeks=3)
    for i in range(3):
        _add_past_class_with_unvalidated_presence(
            app, coach_id=coach_id, ended_at=three_weeks_back + timedelta(hours=i), title=f"Old {i}"
        )
    # A clock before the seed's pending class ended (Sat 1 Aug), so only the three old ones
    # have run; their week (Mon 13 Jul) is two weeks before this clock's (Mon 27 Jul).
    now = datetime(2026, 8, 1, 10, 0)
    with app.app_context():
        badge = validation_badge(coach_id=coach_id, now=now)
    assert badge == {"count": 3, "weekOffset": -2, "href": "/presences?validate=1&week=-2"}


def test_week_offset_of_is_monday_aligned(app):
    from padel_app.helpers.dashboard.coach_home import week_offset_of

    tuesday = datetime(2026, 8, 4, 10, 0)
    assert week_offset_of(datetime(2026, 8, 3, 0, 0), tuesday) == 0  # this Monday
    assert week_offset_of(datetime(2026, 8, 2, 23, 0), tuesday) == -1  # last Sunday
    assert week_offset_of(datetime(2026, 7, 13, 9, 0), tuesday) == -3
    assert week_offset_of(datetime(2026, 8, 10, 9, 0), tuesday) == 1


def test_a_canceled_occurrence_is_never_pending(app):
    """Rule 18: a canceled class with an unvalidated row is not something to validate."""
    from padel_app.sql_db import db
    from padel_app.models import LessonInstance
    from padel_app.services.presence_overview_service import count_pending_validation_total

    coach_id, _, _ = _seed(app, now=TUESDAY)
    inst_id = _add_past_class(app, coach_id=coach_id, ended_at=TUESDAY - timedelta(days=1), title="Canceled one")
    with app.app_context():
        before = count_pending_validation_total(coach_id=coach_id, now=TUESDAY)
        db.session.get(LessonInstance, inst_id).status = "canceled"
        db.session.commit()
        after = count_pending_validation_total(coach_id=coach_id, now=TUESDAY)
    assert before - after == 1


def test_a_class_still_running_is_not_pending_yet(app):
    """Rule 3: only a class that has ENDED is listed — one that started and runs on is not."""
    from padel_app.services.presence_overview_service import count_pending_validation_total

    coach_id, _, _ = _seed(app, now=TUESDAY)
    with app.app_context():
        before = count_pending_validation_total(coach_id=coach_id, now=TUESDAY)
    # Started 30 minutes before TUESDAY, ends 30 minutes after it.
    _add_past_class_with_unvalidated_presence(
        app, coach_id=coach_id, ended_at=TUESDAY + timedelta(minutes=30), title="Running now"
    )
    with app.app_context():
        assert count_pending_validation_total(coach_id=coach_id, now=TUESDAY) == before
        assert count_pending_validation_total(coach_id=coach_id, now=TUESDAY + timedelta(hours=1)) == before + 1
