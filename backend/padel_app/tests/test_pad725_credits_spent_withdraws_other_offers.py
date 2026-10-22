"""PAD-725 (PAD-669 edge case, owner-confirmed; notifications.waiting-list rule 15b): when a standing
entry's last credit is spent, the student's other live group-0 invitations it had reached are
withdrawn — otherwise they could take a second class with no credit left.

The two live group-0 offers are set up directly: the "one waiting-list offer per student per coach"
cap keeps the engine from sending both, but nothing stopped one that was already out (a race past
that cap, or an offer from before it).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad446_waiting_list_group_zero import NOW, _entry, _io, _seed, _standing, _trigger
from padel_app.tests.test_pad497_a_no_is_final import _answer


def _second_class(instance_id, coach_id):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy

    a = db.session.get(LessonInstance, instance_id)
    b = LessonInstance(lesson_id=a.lesson_id, start_datetime=a.start_datetime + timedelta(days=7),
                       end_datetime=a.end_datetime + timedelta(days=7), max_players=a.max_players,
                       status="scheduled", level_id=a.level_id, notifications_enabled=True)
    db.session.add(b)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=b.id))
    vacancy = Vacancy(lesson_instance_id=b.id, coach_id=coach_id, status="open",
                      current_round_number=1, current_batch_number=1, last_activity_at=NOW)
    db.session.add(vacancy)
    db.session.commit()
    return b.id, vacancy


def _instance_row(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, instance_id)


@pytest.mark.parametrize("credits,withdrawn", [(1, True), (2, False)], ids=["last-credit", "credit-left"])
def test_spending_the_last_credit_withdraws_the_other_live_waiting_list_offers(app, monkeypatch, credits, withdrawn):
    from padel_app.models import Coach, Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad581_side_rebalance import _invite

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        standing = _standing(coach_id, bea, NOW - timedelta(days=1), credits=credits)
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        other_id, other_vacancy = _second_class(instance_id, coach_id)
        _entry(other_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        _trigger(instance_id, coach_id)                       # group 0 of the first class asks Bea
        other_event = _invite(db.session.get(Coach, coach_id), _instance_row(other_id),
                              other_vacancy, bea, round_number=0)

        _answer(instance_id, bea, "yes", NOW + timedelta(minutes=1))

        db.session.expire_all()
        event = db.session.get(NotificationEvent, other_event)
        bubble = Message.query.get(event.message_id).msg_metadata
        if withdrawn:
            assert (event.status, event.retired_reason) == ("expired", "credits_spent")
            assert (bubble.get("responded"), bubble.get("response")) == (True, "credits_spent")
        else:
            assert event.status == "sent" and not bubble.get("responded")
