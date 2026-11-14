"""PAD-842 (classes.edit rule 9, CLASSES-EDIT-23): the server never adds and removes one student in one
edit. On 8 Nov an older web build sent a re-ticked student in both lists, her id a string in
``addPlayers`` and a number in ``removePlayers``. The server enrolled her (resetting her cancelled row,
closing her vacancy, telling her "adicionei-te") and then removed her, deleting the row. This test
replays her sequence: an accepted join request, a late cancel, "Afinal vou", a second late cancel,
then that edit.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_notification_reminder_flow import PATCHES
from padel_app.tests.test_pad131_join_requests import LEVEL_SAME, _config, _decide, _request, _seed, _student


def _row(iid, pid):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=iid, player_id=pid).first()


def _told_added(pid):
    from padel_app.models import Message
    from padel_app.models.players import Player

    uid = db.session.get(Player, pid).user_id
    return [m.id for m in Message.query.all()
            if (m.msg_metadata or {}).get("addedToClass") and uid in {p.user_id for p in m.conversation.participants}]


@pytest.mark.criterion("CLASSES-EDIT-23")
def test_an_edit_naming_a_student_in_both_lists_leaves_her_row_alone(app, monkeypatch):
    from padel_app.models import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import edit_class_service
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.utils.dates import wall_to_utc_naive

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    her, bruno = _student(app, ids, "her"), _student(app, ids, "bruno")
    iid = ids["instance_id"]
    rid, _, _ = _request(app, ids, her)
    _decide(app, ids, rid, accept=True)
    with app.app_context():
        start = db.session.get(LessonInstance, iid).start_datetime
        uid = db.session.get(Player, her).user_id
    pin_clock(monkeypatch, wall_to_utc_naive(start) - timedelta(hours=1))      # after the deadline: late
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        assert cancel_attendance(uid, lesson_instance_id=iid)["proactive"] is False
        assert respond_to_reminder(iid, "yes", uid)["action"] == "confirmed"          # "Afinal vou"
        cancel_attendance(uid, lesson_instance_id=iid)
    with app.app_context():
        assert _row(iid, her).status == "absent"
        vacancy = Vacancy.query.filter_by(lesson_instance_id=iid, original_player_id=her, status="open").one()
        filled_before = db.session.get(LessonInstance, iid).effective_filled_spots
        date = start.strftime("%Y-%m-%d")

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        res = edit_class_service({"event": {"model": "LessonInstance", "originalId": iid, "date": date},
                                  "scope": "single",
                                  "updates": {"addPlayers": [str(her), str(bruno)], "removePlayers": [her]}})
        assert res[1] == 200, res

    with app.app_context():
        row = _row(iid, her)
        assert row is not None and row.status == "absent"
        assert _told_added(her) == []
        assert db.session.get(Vacancy, vacancy.id).status == "open"
        assert _row(iid, bruno) is not None and _row(iid, bruno).status is None
        assert db.session.get(LessonInstance, iid).effective_filled_spots == filled_before + 1   # Bruno only
