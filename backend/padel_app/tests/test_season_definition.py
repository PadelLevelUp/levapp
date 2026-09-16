"""calendar.seasons (PAD-82) — one recurring day/month season per coach.

Covers: the occurrence maths (rules 3–4), GET/PUT/DELETE /app/season (rules
5–7), the legacy list shim (rule 8), "recurs until season end" per occurrence
(rules 9–10), and the migration's collapse and cap functions (rule 11).
"""
from datetime import date, datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.tests.helpers import make_coach
from padel_app.tools.season_dates import (
    clamp_day,
    next_occurrence_after,
    occurrence_containing,
    occurrence_label,
    season_wraps_year,
    validate_definition,
)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, coach_id):
    from padel_app.models.coaches import Coach

    with app.app_context():
        coach = Coach.query.get(coach_id)
        token = create_access_token(identity=str(coach.user_id))
    return {"Authorization": f"Bearer {token}"}


def _make_club(coach_id):
    from padel_app.sql_db import db
    from padel_app.models import Club, Association_CoachClub

    club = Club(name="Season Club", description="c", location="x")
    db.session.add(club)
    db.session.flush()
    db.session.add(Association_CoachClub(coach_id=coach_id, club_id=club.id))
    db.session.commit()
    return club


SEP_JUL = dict(startDay=1, startMonth=9, endDay=31, endMonth=7)


# ---------------------------------------------------------------------------
# Occurrence maths agree across sides (rules 3–4)
# ---------------------------------------------------------------------------

def test_wrapping_definition_occurrences():
    assert season_wraps_year(9, 1, 7, 31) is True
    assert occurrence_containing(date(2026, 10, 15), 9, 1, 7, 31) == (date(2026, 9, 1), date(2027, 7, 31))
    assert occurrence_containing(date(2027, 3, 1), 9, 1, 7, 31) == (date(2026, 9, 1), date(2027, 7, 31))
    assert occurrence_containing(date(2026, 8, 10), 9, 1, 7, 31) is None  # the gap
    assert next_occurrence_after(date(2026, 8, 10), 9, 1, 7, 31) == (date(2026, 9, 1), date(2027, 7, 31))
    # Boundaries are inclusive.
    assert occurrence_containing(date(2026, 9, 1), 9, 1, 7, 31)[0] == date(2026, 9, 1)
    assert occurrence_containing(date(2027, 7, 31), 9, 1, 7, 31)[1] == date(2027, 7, 31)


def test_non_wrapping_definition_occurrences():
    assert season_wraps_year(2, 1, 6, 30) is False
    assert occurrence_containing(date(2026, 4, 1), 2, 1, 6, 30) == (date(2026, 2, 1), date(2026, 6, 30))
    assert occurrence_containing(date(2026, 7, 1), 2, 1, 6, 30) is None
    assert next_occurrence_after(date(2026, 7, 1), 2, 1, 6, 30) == (date(2027, 2, 1), date(2027, 6, 30))
    # Inside an occurrence, "next" is still the one after it.
    assert next_occurrence_after(date(2026, 4, 1), 2, 1, 6, 30) == (date(2027, 2, 1), date(2027, 6, 30))


def test_february_29_clamps_in_non_leap_years():
    assert clamp_day(2027, 2, 29) == date(2027, 2, 28)
    assert clamp_day(2028, 2, 29) == date(2028, 2, 29)
    assert occurrence_containing(date(2027, 1, 10), 9, 1, 2, 29) == (date(2026, 9, 1), date(2027, 2, 28))


def test_occurrence_labels():
    assert occurrence_label(date(2026, 9, 1), date(2027, 7, 31)) == "2026/2027"
    assert occurrence_label(date(2026, 2, 1), date(2026, 6, 30)) == "2026"
    assert occurrence_label(date(2026, 9, 1), date(2027, 7, 31), "Época") == "Época"


def test_validate_definition_rejects_bad_ranges():
    assert validate_definition(9, 1, 7, 31) is None
    assert validate_definition(2, 29, 6, 30) is None  # allowed, clamps
    for bad in ((4, 31, 6, 30), (13, 1, 6, 30), (9, 1, 9, 1), (0, 1, 6, 30), (9, 0, 6, 30), (9, 1, 6, 32)):
        assert validate_definition(*bad), bad


# ---------------------------------------------------------------------------
# Saving a definition (rules 5–6), invalid definitions, removal (rule 7)
# ---------------------------------------------------------------------------

def test_get_season_is_null_without_a_definition(app, client):
    coach_id = make_coach(app)
    res = client.get("/api/app/season", headers=_auth(app, coach_id))
    assert res.status_code == 200
    assert res.get_json() is None


def test_put_creates_then_replaces_the_single_definition(app, client):
    from padel_app.models import CoachSeason

    coach_id = make_coach(app)
    headers = _auth(app, coach_id)

    res = client.put("/api/app/season", json={"label": "Época", **SEP_JUL}, headers=headers)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["wrapsYear"] is True
    assert body["label"] == "Época"
    assert (body["startDay"], body["startMonth"], body["endDay"], body["endMonth"]) == (1, 9, 31, 7)
    assert body["needsReview"] is False
    assert body["current"] is None or set(body["current"]) == {"startDate", "endDate", "label"}

    assert client.get("/api/app/season", headers=headers).get_json()["startMonth"] == 9

    res = client.put("/api/app/season", json=dict(startDay=15, startMonth=9, endDay=30, endMonth=6), headers=headers)
    assert res.status_code == 200
    with app.app_context():
        rows = CoachSeason.query.filter_by(coach_id=coach_id).all()
        assert len(rows) == 1
        assert (rows[0].start_day, rows[0].start_month, rows[0].end_day, rows[0].end_month) == (15, 9, 30, 6)


def test_season_current_and_upcoming_follow_today(app, client):
    coach_id = make_coach(app)
    headers = _auth(app, coach_id)
    client.put("/api/app/season", json=SEP_JUL, headers=headers)
    from padel_app.services import season_service

    with app.app_context():
        from padel_app.models.coaches import Coach

        coach = Coach.query.get(coach_id)
        payload = season_service.serialize_definition(coach.season, today=date(2026, 10, 15))
        assert payload["current"] == {"startDate": "2026-09-01", "endDate": "2027-07-31", "label": "2026/2027"}
        assert payload["upcoming"] == {"startDate": "2027-09-01", "endDate": "2028-07-31", "label": "2027/2028"}
        payload = season_service.serialize_definition(coach.season, today=date(2026, 8, 10))
        assert payload["current"] is None
        assert payload["upcoming"]["startDate"] == "2026-09-01"


@pytest.mark.parametrize(
    "body",
    [
        dict(startDay=31, startMonth=4, endDay=30, endMonth=6),
        dict(startDay=1, startMonth=13, endDay=30, endMonth=6),
        dict(startDay=1, startMonth=9, endDay=1, endMonth=9),
        dict(startDay="x", startMonth=9, endDay=30, endMonth=6),
        dict(startMonth=9, endDay=30, endMonth=6),
    ],
)
def test_invalid_definition_is_rejected_and_writes_nothing(app, client, body):
    from padel_app.models import CoachSeason

    coach_id = make_coach(app)
    res = client.put("/api/app/season", json=body, headers=_auth(app, coach_id))
    assert res.status_code == 400
    assert res.get_json()["code"] == "invalid_season"
    with app.app_context():
        assert CoachSeason.query.filter_by(coach_id=coach_id).count() == 0


def test_student_cannot_read_or_write_the_season(app, client):
    from padel_app.sql_db import db
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="S", username="season_student", password="x", email="s@example.com")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
        token = create_access_token(identity=str(user.id))
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/app/season", headers=headers).status_code == 403
    assert client.put("/api/app/season", json=SEP_JUL, headers=headers).status_code == 403
    assert client.delete("/api/app/season", headers=headers).status_code == 403


def _flagged_class(client, headers, start="2026-10-05"):
    return client.post(
        "/api/app/add_class",
        json={
            "name": "Season Class",
            "classType": "academy",
            "maxPlayers": 6,
            "date": start,
            "startTime": "10:00",
            "endTime": "11:00",
            "isRecurring": True,
            "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]},
            "endDate": None,
            "recursUntilSeasonEnd": True,
        },
        headers=headers,
    )


def test_saving_a_definition_recaps_flagged_classes(app, client):
    from datetime import timedelta

    from padel_app.models import Lesson, LessonInstance
    from padel_app.sql_db import db

    coach_id = make_coach(app)
    with app.app_context():
        _make_club(coach_id)
    headers = _auth(app, coach_id)
    assert client.put("/api/app/season", json=SEP_JUL, headers=headers).status_code == 200
    res = _flagged_class(client, headers)
    assert res.status_code in (200, 201), res.get_json()

    # Instances are materialised on a rolling horizon, so seed one inside the
    # new range and one after it by hand (as the pre-PAD-82 prune test did).
    with app.app_context():
        lesson = Lesson.query.filter_by(title="Season Class").first()
        assert lesson.recurrence_end == date(2027, 7, 31)
        kept_start = datetime(2027, 4, 5, 10, 0, 0)
        pruned_start = datetime(2027, 6, 7, 10, 0, 0)
        kept = LessonInstance(
            lesson_id=lesson.id, start_datetime=kept_start, end_datetime=kept_start + timedelta(hours=1),
            max_players=6, status="scheduled", original_lesson_occurence_date=kept_start.date(),
        )
        pruned = LessonInstance(
            lesson_id=lesson.id, start_datetime=pruned_start, end_datetime=pruned_start + timedelta(hours=1),
            max_players=6, status="scheduled", original_lesson_occurence_date=pruned_start.date(),
        )
        db.session.add_all([kept, pruned])
        db.session.commit()
        kept_id, pruned_id = kept.id, pruned.id

    res = client.put("/api/app/season", json=dict(startDay=1, startMonth=9, endDay=31, endMonth=5), headers=headers)
    assert res.status_code == 200
    with app.app_context():
        lesson = Lesson.query.filter_by(title="Season Class").first()
        assert lesson.recurrence_end == date(2027, 5, 31)
        assert db.session.get(LessonInstance, kept_id) is not None
        assert db.session.get(LessonInstance, pruned_id) is None


def test_removing_the_definition_keeps_history_and_fails_closed(app, client):
    from padel_app.models import Lesson

    coach_id = make_coach(app)
    with app.app_context():
        _make_club(coach_id)
    headers = _auth(app, coach_id)
    client.put("/api/app/season", json=SEP_JUL, headers=headers)
    assert _flagged_class(client, headers).status_code in (200, 201)

    res = client.delete("/api/app/season", headers=headers)
    assert res.status_code == 204
    assert client.get("/api/app/season", headers=headers).get_json() is None
    with app.app_context():
        assert Lesson.query.filter_by(title="Season Class").first().recurrence_end == date(2027, 7, 31)
    res = _flagged_class(client, headers, start="2026-11-02")
    assert res.status_code == 400
    assert res.get_json()["code"] == "no_season_covers_date"
    with app.app_context():
        assert Lesson.query.filter_by(title="Season Class").count() == 1


# ---------------------------------------------------------------------------
# The legacy list still reads (rule 8)
# ---------------------------------------------------------------------------

def test_legacy_seasons_list_shows_the_current_occurrence(app, client):
    coach_id = make_coach(app)
    headers = _auth(app, coach_id)
    assert client.get("/api/app/seasons", headers=headers).get_json() == []
    client.put("/api/app/season", json=SEP_JUL, headers=headers)

    from padel_app.services import season_service

    with app.app_context():
        from padel_app.models.coaches import Coach

        rows = season_service.legacy_season_list(Coach.query.get(coach_id), today=date(2026, 10, 15))
    assert len(rows) == 1
    assert rows[0]["startDate"] == "2026-09-01"
    assert rows[0]["endDate"] == "2027-07-31"
    assert set(rows[0]) == {"id", "name", "startDate", "endDate"}

    res = client.post("/api/app/add_seasons", json=[], headers=headers)
    assert res.status_code == 404
    assert client.post("/api/app/delete/season", json={"id": 1}, headers=headers).status_code == 404


# ---------------------------------------------------------------------------
# "Recurs until season end" snapshots the occurrence end (rules 9–10)
# ---------------------------------------------------------------------------

def test_recurs_until_season_end_uses_the_occurrence(app, client):
    from padel_app.models import Lesson

    coach_id = make_coach(app)
    with app.app_context():
        _make_club(coach_id)
    headers = _auth(app, coach_id)
    client.put("/api/app/season", json=SEP_JUL, headers=headers)

    assert _flagged_class(client, headers, start="2026-10-05").status_code in (200, 201)
    with app.app_context():
        assert Lesson.query.filter_by(title="Season Class").first().recurrence_end == date(2027, 7, 31)

    res = _flagged_class(client, headers, start="2026-08-10")
    assert res.status_code == 400
    assert res.get_json()["code"] == "no_season_covers_date"
    with app.app_context():
        assert Lesson.query.filter_by(title="Season Class").count() == 1


# ---------------------------------------------------------------------------
# Migration collapses the old rows (rule 11)
# ---------------------------------------------------------------------------

def _load_migration():
    import importlib.util
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad82_single_recurring_season*.py"))
    assert len(matches) == 1, matches
    path = matches[0]
    spec = importlib.util.spec_from_file_location("pad82_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, path.read_text()


def test_migration_is_guarded_and_uses_the_shared_maths():
    mod, src = _load_migration()
    assert mod.down_revision == "ad97ec649746"
    # Migrations never import application code (PAD-246 precedent): the maths is inlined.
    assert "from padel_app" not in src
    assert "def occurrence_containing" in src and "def next_occurrence_after" in src
    # The inlined copy agrees with the tools module on the shared cases.
    for probe in (date(2026, 10, 15), date(2026, 8, 10), date(2027, 3, 1), date(2027, 1, 10)):
        assert mod.occurrence_containing(probe, 9, 1, 7, 31) == occurrence_containing(probe, 9, 1, 7, 31)
        assert mod.next_occurrence_after(probe, 9, 1, 7, 31) == next_occurrence_after(probe, 9, 1, 7, 31)
        assert mod.occurrence_containing(probe, 9, 1, 2, 29) == occurrence_containing(probe, 9, 1, 2, 29)
    assert "has_table" in src
    assert "ORDER BY start_date DESC" in src
    assert "seasons_legacy" in src and "coach_seasons" in src


def test_collapse_picks_the_most_recent_row_per_coach():
    mod, _ = _load_migration()
    rows = [
        # (id, coach_id, name, start_date, end_date)
        (1, "A", "2026/2027", date(2026, 9, 1), date(2027, 7, 31)),
        (2, "B", "Short", date(2026, 3, 1), date(2026, 5, 31)),
        (3, "B", "Long", date(2026, 5, 15), date(2026, 8, 1)),
    ]
    out = mod.collapse_seasons(rows)
    assert out["A"] == dict(label="2026/2027", start_day=1, start_month=9, end_day=31, end_month=7, needs_review=False)
    assert out["B"] == dict(label="Long", start_day=15, start_month=5, end_day=1, end_month=8, needs_review=True)
    assert "C" not in out


def test_collapse_flags_an_overlong_row_and_tolerates_an_inverted_one():
    mod, _ = _load_migration()
    out = mod.collapse_seasons([
        (1, "A", "Two years", date(2025, 1, 1), date(2026, 12, 31)),
        (2, "B", "Inverted", date(2026, 6, 1), date(2026, 1, 1)),
    ])
    assert out["A"]["needs_review"] is True
    assert out["B"] == dict(label="Inverted", start_day=1, start_month=6, end_day=1, end_month=1, needs_review=True)


def test_cap_for_unbounded_flagged_lesson_reads_a_late_start_as_the_coming_season():
    mod, _ = _load_migration()
    definition = dict(start_day=1, start_month=9, end_day=31, end_month=7)
    # The two production rows: a week before the season ends means the next one.
    assert mod.cap_for_lesson(date(2026, 7, 24), definition) == date(2027, 7, 31)
    # In the gap: the next occurrence.
    assert mod.cap_for_lesson(date(2026, 8, 10), definition) == date(2027, 7, 31)
    # Comfortably inside an occurrence: that occurrence.
    assert mod.cap_for_lesson(date(2026, 10, 5), definition) == date(2027, 7, 31)
    assert mod.cap_for_lesson(date(2027, 3, 1), definition) == date(2027, 7, 31)
    assert mod.cap_for_lesson(date(2026, 6, 15), definition) == date(2026, 7, 31)
