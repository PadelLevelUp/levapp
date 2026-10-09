"""PAD-560 — notifications.waiting-list rules 19, 19a, 20 and 22 (numbering unconfirmed): the
coach puts a student on the whole series (no credit limit, to the series' capped end) or for a
period (X classes as a window of occurrences, or an end date), and moves a row between the
scopes from the class. A coach-wide standing row is not changed from the class.
"""
from datetime import date, datetime, time, timedelta

import pytest
from dateutil.relativedelta import relativedelta
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad358_academy_classes import _add_class, _setup
from padel_app.tests.test_pad547_coach_adds_to_class_waiting_list import _add, _instance, _quiet, _rows, _student
from padel_app.utils.dates import utc_to_wall_naive


def _series(app, ids, *, weeks_to_end=4, end=None, **kw):
    """A weekly series `days` out whose recurrence_end is set (the shared helper leaves it NULL)."""
    from padel_app.models.lessons import Lesson

    made = _add_class(app, ids, days=3, title=kw.pop("title", "Terça 18h"), max_players=4, filled=1, recurring=True, **kw)
    with app.app_context():
        lesson = db.session.get(Lesson, made["lesson_id"])
        if end != "none":
            lesson.recurrence_end = end or (_instance(made["instance_id"]).start_datetime.date() + timedelta(weeks=weeks_to_end))
        db.session.commit()
        made["start"] = _instance(made["instance_id"]).start_datetime
        made["end"] = lesson.recurrence_end
    return made


def _materialize(app, made, days_after):
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context():
        lesson = db.session.get(Lesson, made["lesson_id"])
        inst = get_or_materialize_instance(lesson, made["start"].date() + timedelta(days=days_after))
        db.session.commit()
        return inst.id


def _entry(entry_id):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    return db.session.get(StandingWaitingListEntry, entry_id)


def _end_on(entry) -> date:
    from padel_app.services.notification_service import standing_end_on

    return date.fromisoformat(standing_end_on(entry))


def _today():
    from padel_app.utils.dates import club_now_naive

    return club_now_naive().date()


def _list(instance_id):
    from padel_app.services.notification_service import get_waiting_list

    return {r["playerId"]: r for r in get_waiting_list(instance_id)}


# ── rule 19: the whole series ──────────────────────────────────────────────────

def test_the_whole_series_has_no_credit_limit_and_runs_to_the_series_end(app, monkeypatch):
    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids)
    other = _add_class(app, ids, days=4, title="Quinta 19h", max_players=4, filled=1)
    carla = _student(app, ids, "carla")
    with app.app_context():
        result = _add(ids["coach_id"], series["instance_id"], carla, scope="series")
        entry = _entry(result["standingEntryId"])
        assert entry.lesson_id == series["lesson_id"] and entry.whole_series is True
        assert entry.credits_total is None, "no credit limit"
        assert _end_on(entry) == series["end"]
        assert _rows(series["instance_id"])[carla].standing_entry_id == entry.id
        assert carla not in _rows(other["instance_id"])
        assert _list(series["instance_id"])[carla]["scope"] == "series"
    later = _materialize(app, series, 7)
    with app.app_context():
        assert _rows(later)[carla].standing_entry_id == result["standingEntryId"], "a later occurrence gains her row"


def test_a_series_with_no_end_or_a_far_end_is_capped_at_twelve_months(app, monkeypatch):
    _quiet(monkeypatch)
    ids = _setup(app)
    endless = _series(app, ids, end="none", title="Sem fim")
    far = _series(app, ids, end=_today() + relativedelta(years=2), title="2028")
    carla = _student(app, ids, "carla")
    with app.app_context():
        cap = _today() + relativedelta(months=12)
        for made in (endless, far):
            entry = _entry(_add(ids["coach_id"], made["instance_id"], carla, scope="series")["standingEntryId"])
            assert _end_on(entry) == cap


def test_a_yes_on_an_unlimited_entry_spends_nothing_that_closes_it(app, monkeypatch):
    from types import SimpleNamespace

    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.notification_service import _settle_waiting_list_entry

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids, weeks_to_end=6)
    carla = _student(app, ids, "carla")
    second = _materialize(app, series, 7)
    with app.app_context():
        entry_id = _add(ids["coach_id"], series["instance_id"], carla, scope="series")["standingEntryId"]
        # Rule 15's settle, as the accept's commit runs it: a group-0 yes on this class's spot.
        for inst in (series["instance_id"], second):
            _settle_waiting_list_entry(
                SimpleNamespace(lesson_instance_id=inst, player_id=carla, round_number=0), "yes"
            )
            db.session.commit()
        entry = db.session.get(StandingWaitingListEntry, entry_id)
        assert entry.credits_used == 2 and entry.credits_total is None
        assert entry.is_active, "no credit limit: the entry never closes on a yes"


def test_adding_the_whole_series_repoints_the_classs_existing_row(app, monkeypatch):
    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids)
    carla = _student(app, ids, "carla")
    with app.app_context():
        _add(ids["coach_id"], series["instance_id"], carla, scope="occurrence")
        joined = _rows(series["instance_id"])[carla].joined_at
        result = _add(ids["coach_id"], series["instance_id"], carla, scope="series")
        row = _rows(series["instance_id"])[carla]
        assert row.standing_entry_id == result["standingEntryId"] and row.is_active
        assert row.joined_at == joined, "the join time is kept"
        assert _list(series["instance_id"])[carla]["scope"] == "series"


def test_a_row_a_coach_wide_entry_holds_is_not_repointed(app, monkeypatch):
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids)
    bruno = _student(app, ids, "bruno")
    with app.app_context():
        coach_wide = add_standing_waiting_list_entry(ids["coach_id"], bruno, 3, expires_at=utcnow_naive() + timedelta(days=30))
        result = _add(ids["coach_id"], series["instance_id"], bruno, scope="series")
        row = _rows(series["instance_id"])[bruno]
        assert row.is_active and row.standing_entry_id == coach_wide.id, "the class keeps its coach-wide row"
        assert _entry(result["standingEntryId"]).is_active, "the series entry still exists for the other occurrences"
        assert _list(series["instance_id"])[bruno]["scope"] == "standing"


# ── rule 19a: a period ─────────────────────────────────────────────────────────

def test_a_period_of_x_classes_ends_on_the_xth_upcoming_occurrence(app, monkeypatch):
    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids, weeks_to_end=6)
    carla = _student(app, ids, "carla")
    third = _materialize(app, series, 14)   # 10-27 in the spec's example; 10-20 stays virtual
    fourth = _materialize(app, series, 21)
    with app.app_context():
        result = _add(ids["coach_id"], series["instance_id"], carla, scope="period", classes=3)
        entry = _entry(result["standingEntryId"])
        assert entry.whole_series is False and entry.credits_total is None
        assert _end_on(entry) == series["start"].date() + timedelta(days=14)
        assert _rows(series["instance_id"])[carla].is_active and _rows(third)[carla].is_active
        assert carla not in _rows(fourth) or not _rows(fourth)[carla].is_active
        assert _list(series["instance_id"])[carla]["scope"] == "period"
    second = _materialize(app, series, 7)
    with app.app_context():
        assert _rows(second)[carla].is_active, "the virtual occurrence inside the window gains her row when materialised"


def test_more_classes_than_remain_ends_on_the_series_end(app, monkeypatch):
    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids, weeks_to_end=3)
    carla = _student(app, ids, "carla")
    with app.app_context():
        entry = _entry(_add(ids["coach_id"], series["instance_id"], carla, scope="period", classes=10)["standingEntryId"])
        assert _end_on(entry) == series["end"]


def test_a_period_until_a_date_covers_only_the_occurrences_before_it(app, monkeypatch):
    from padel_app.services.notification_service import standing_end_from_date

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids, weeks_to_end=6)
    carla = _student(app, ids, "carla")
    second = _materialize(app, series, 7)
    third = _materialize(app, series, 14)
    with app.app_context():
        until = (series["start"].date() + timedelta(days=7)).isoformat()
        entry = _entry(_add(ids["coach_id"], series["instance_id"], carla, scope="period",
                            expires_at=standing_end_from_date(until))["standingEntryId"])
        assert _end_on(entry).isoformat() == until
        assert _rows(series["instance_id"])[carla].is_active and _rows(second)[carla].is_active
        assert carla not in _rows(third)


def test_a_period_is_exactly_one_of_classes_or_a_date(app, monkeypatch):
    from padel_app.services.notification_service import standing_end_from_date

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids)
    carla = _student(app, ids, "carla")
    with app.app_context():
        until = standing_end_from_date((_today() + timedelta(days=10)).isoformat())
        for kw in ({}, {"classes": 2, "expires_at": until}, {"classes": 0}, {"classes": 53}):
            with pytest.raises(HTTPException) as e:
                _add(ids["coach_id"], series["instance_id"], carla, scope="period", **kw)
            assert e.value.code == 400, kw


# ── rule 22: the coach moves a row between scopes ──────────────────────────────

def _change(entry_id, coach_id, **kw):
    from padel_app.services.notification_service import change_class_waiting_list_scope

    return change_class_waiting_list_scope(entry_id, coach_id, **kw)


def test_the_coach_moves_a_row_between_scopes(app, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids, weeks_to_end=6)
    carla = _student(app, ids, "carla")
    dinis = _student(app, ids, "dinis")
    second = _materialize(app, series, 7)
    third = _materialize(app, series, 14)
    with app.app_context():
        _add(ids["coach_id"], series["instance_id"], carla, scope="occurrence")
        dinis_entry_id = _add(ids["coach_id"], series["instance_id"], dinis, scope="series")["standingEntryId"]
        carla_row = _rows(series["instance_id"])[carla]
        joined = carla_row.joined_at

        # Carla: this class only → the whole series
        out = _change(carla_row.id, ids["coach_id"], scope="series")
        assert out["scope"] == "series" and out["id"] == carla_row.id
        row = _rows(series["instance_id"])[carla]
        assert row.standing_entry_id is not None and row.joined_at == joined
        assert _rows(second)[carla].is_active and _rows(third)[carla].is_active
        carla_entry = row.standing_entry_id

        # Dinis: the whole series → this class only
        dinis_row = _rows(series["instance_id"])[dinis]
        out = _change(dinis_row.id, ids["coach_id"], scope="occurrence")
        assert out["scope"] == "occurrence"
        db.session.expire_all()
        assert db.session.get(StandingWaitingListEntry, dinis_entry_id).is_active is False
        assert _rows(second)[dinis].is_active is False and _rows(third)[dinis].is_active is False
        d = _rows(series["instance_id"])[dinis]
        assert d.is_active and d.standing_entry_id is None and d.added_by == "coach"

        # Carla: the whole series → a period of 2 classes
        out = _change(carla_row.id, ids["coach_id"], scope="period", classes=2)
        assert out["scope"] == "period"
        db.session.expire_all()
        entry = db.session.get(StandingWaitingListEntry, carla_entry)
        assert entry.is_active and entry.whole_series is False
        assert _end_on(entry) == series["start"].date() + timedelta(days=7)
        assert _rows(second)[carla].is_active and _rows(third)[carla].is_active is False
        assert _rows(series["instance_id"])[carla].is_active


def test_a_coach_wide_row_is_not_changed_from_the_class(app, monkeypatch):
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _series(app, ids)
    bruno = _student(app, ids, "bruno")
    with app.app_context():
        entry = add_standing_waiting_list_entry(ids["coach_id"], bruno, 3, expires_at=utcnow_naive() + timedelta(days=30))
        row = _rows(series["instance_id"])[bruno]
        with pytest.raises(HTTPException) as e:
            _change(row.id, ids["coach_id"], scope="series")
        assert e.value.response.status_code == 409
        assert e.value.response.get_json()["code"] == "coach_wide"
        db.session.expire_all()
        assert _rows(series["instance_id"])[bruno].standing_entry_id == entry.id
        assert _list(series["instance_id"])[bruno]["scope"] == "standing"
