"""
PAD-503 — a student's list of academy classes to join (classes.academy-class-booking rule 1)
must show EVERY occurrence of a weekly series that falls in the fourteen-day window, not one.

A weekly class one day out has its next occurrence eight days out: both are inside the window.
"""
from padel_app.tests.test_pad358_academy_classes import _add_class, _list, _setup


def _dates_of(payload, title):
    return sorted(c["date"] for c in payload["classes"] if c["title"] == title)


def test_a_weekly_series_lists_both_occurrences_in_the_window(app):
    ids = _setup(app)
    first = _add_class(app, ids, days=1, title="Weekly", recurring=True, materialize=False)

    dates = _dates_of(_list(app, ids), "Weekly")
    assert len(dates) == 2, dates
    assert dates[0] == first["date"]


def test_a_weekly_series_with_its_first_occurrence_materialised_lists_both(app):
    ids = _setup(app)
    _add_class(app, ids, days=1, title="Weekly", recurring=True, materialize=True)

    dates = _dates_of(_list(app, ids), "Weekly")
    assert len(dates) == 2, dates


def test_a_series_that_started_weeks_ago_lists_both_occurrences_in_the_window(app):
    """The usual production shape: the series began before today."""
    ids = _setup(app)
    _add_class(app, ids, days=-20, title="Weekly", recurring=True, materialize=False)

    dates = _dates_of(_list(app, ids), "Weekly")
    assert len(dates) == 2, dates


def test_every_listed_occurrence_has_its_own_id(app):
    """Both clients key the rows by `id`; two rows sharing one would collapse into one."""
    ids = _setup(app)
    _add_class(app, ids, days=1, title="Weekly", recurring=True, materialize=True)

    rows = [c for c in _list(app, ids)["classes"] if c["title"] == "Weekly"]
    assert len({c["id"] for c in rows}) == len(rows) == 2, [(c["id"], c["date"]) for c in rows]
