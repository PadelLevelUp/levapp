"""PAD-560 — notifications.waiting-list rule 20 (numbering unconfirmed): each row of a class's
waiting list says how long the student is on it — ``scope`` (occurrence | period | standing;
``series`` is reserved for the scope change's whole-series entries) and ``expiresOn``, the
standing entry's end date.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad358_academy_classes import _add_class, _setup
from padel_app.tests.test_pad547_coach_adds_to_class_waiting_list import _add, _quiet, _student


def _list(instance_id):
    from padel_app.services.notification_service import get_waiting_list

    return {row["playerId"]: row for row in get_waiting_list(instance_id)}


def test_each_row_carries_its_scope_and_end_date(app, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.notification_service import add_standing_waiting_list_entry, standing_end_on
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1, recurring=True)
    bruno = _student(app, ids, "bruno")
    carla = _student(app, ids, "carla")
    dinis = _student(app, ids, "dinis")
    with app.app_context():
        coach_wide = add_standing_waiting_list_entry(
            ids["coach_id"], bruno, 3, expires_at=utcnow_naive() + timedelta(days=40)
        )
        _add(ids["coach_id"], series["instance_id"], carla, scope="occurrence")
        # PR-B: a series-scoped entry with an end the coach chose is a period (rule 19a).
        result = _add(
            ids["coach_id"], series["instance_id"], dinis, scope="period",
            expires_at=utcnow_naive() + timedelta(days=60),
        )
        series_entry = db.session.get(StandingWaitingListEntry, result["standingEntryId"])

        rows = _list(series["instance_id"])
        assert rows[bruno]["scope"] == "standing"
        assert rows[bruno]["expiresOn"] == standing_end_on(coach_wide)
        assert rows[carla]["scope"] == "occurrence"
        assert rows[carla]["expiresOn"] is None
        assert rows[dinis]["scope"] == "period", "a series-scoped entry with an end the coach chose is a window"
        assert rows[dinis]["expiresOn"] == standing_end_on(series_entry)
        # The origin stays what PAD-547 says; scope is a second axis.
        assert (rows[bruno]["origin"], rows[carla]["origin"], rows[dinis]["origin"]) == ("standing", "coach", "standing")
