"""PAD-918 (swap plan §3.1): the app's own entry points reach the new engine for a new-engine session,
and never open an old-engine vacancy for it."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture
def new_class(app, monkeypatch):
    """One adopted (new-engine) class with its left regular; the coach's automatic invitations on."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), pids = _seed(app, players=4, capacity=4, side="right")
        db.session.add(NotificationConfig(coach_id=store.coach_of(session), auto_notify_enabled=True,
                                          open_spots_visible=True))
        db.session.commit()
        yield store, session, pids


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _user(player_id):
    from padel_app.models.players import Player

    return db.session.get(Player, int(player_id)).user_id


def _no_old_vacancy(session):
    from padel_app.models.vacancy import Vacancy

    return Vacancy.query.filter_by(lesson_instance_id=int(session)).count() == 0


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_a_regulars_no_and_their_return_go_to_the_engine(new_class):
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder

    store, session, (regular, *_) = new_class
    assert cancel_attendance(_user(regular), lesson_instance_id=int(session), now=NOW)["action"] == "declined"
    assert regular in store.snapshot(session).absent and _no_old_vacancy(session)

    assert respond_to_reminder(int(session), "yes", _user(regular), now=NOW) == {"action": "confirmed"}
    s = store.snapshot(session)
    assert regular not in s.absent and regular in {p.student for p in s.going}


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_the_waiting_lists_are_the_engines(new_class):
    from padel_app.models.coaches import Coach
    from padel_app.services.academy_class_service import (
        join_class_waiting_list_service,
        leave_class_waiting_list_service,
    )
    from padel_app.services.notification_service import add_to_class_waiting_list, remove_from_class_waiting_list
    from padel_app.models.players import Player

    store, session, (_, by_coach, by_self, _) = new_class
    coach_id = store.coach_of(session)
    added = add_to_class_waiting_list(coach_id, _instance(session), int(by_coach), scope="occurrence", side="right")
    assert added["action"] == "added"
    entry, created = join_class_waiting_list_service(db.session.get(Player, int(by_self)), "LessonInstance",
                                                    int(session), None, side="both", now=NOW)
    assert created
    lists = {(w.student, w.list) for w in store.snapshot(session).waiting_list}
    assert lists == {(by_coach, "coach"), (by_self, "students")}

    remove_from_class_waiting_list(added["entryId"], coach_id)
    leave_class_waiting_list_service(db.session.get(Player, int(by_self)), int(session))
    assert store.snapshot(session).waiting_list == ()
    assert _no_old_vacancy(session)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_a_no_show_on_the_attendance_sheet_is_the_engines(new_class, monkeypatch):
    from padel_app.invitation_engine import effects as fx
    from padel_app.services import engine_store
    from padel_app.services.lesson_service import add_presences
    from padel_app.tests.helpers import pin_clock

    store, session, (regular, *_) = new_class
    pin_clock(monkeypatch, START + timedelta(hours=2))          # after the class
    applied = []
    real = engine_store.TableStore.apply
    monkeypatch.setattr(engine_store.TableStore, "apply",
                        lambda self, effects: applied.extend(effects := list(effects)) or real(self, effects))
    add_presences(_instance(session), [{"playerId": int(regular), "status": "absent"}])
    assert any(isinstance(e, fx.Absence) and e.student == regular for e in applied)
    assert _no_old_vacancy(session)
